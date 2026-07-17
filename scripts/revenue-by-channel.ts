/**
 * Revenue by marketing channel. Joins PostHog booking/call conversions
 * (traffic_channel) to Boulevard clients and the local BlvdRevenueItem
 * archive, entirely in memory: no emails/phones are written anywhere, the
 * output is aggregate-only.
 *
 *   pnpm exec tsx scripts/revenue-by-channel.ts
 */
import 'dotenv/config'

const PH_HOST = 'https://us.posthog.com'

async function posthogQuery(query: string) {
	const r = await fetch(
		`${PH_HOST}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`,
		{
			method: 'POST',
			headers: {
				authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
		},
	)
	const j = (await r.json()) as { results?: any[][]; error?: unknown }
	if (!j.results) throw new Error('posthog: ' + JSON.stringify(j).slice(0, 300))
	return j.results
}

const normEmail = (e: unknown) =>
	typeof e === 'string' ? e.trim().toLowerCase() : ''
const normPhone = (p: unknown) =>
	typeof p === 'string' ? p.replace(/\D/g, '').slice(-10) : ''

async function main() {
	const { boulevardAdminFetch } = await import('#app/utils/blvd-admin.server.ts')
	const { prisma } = await import('#app/utils/db.server.ts')

	// 1. Web booking conversions with channel + contact (kept in memory only)
	const bookings = await posthogQuery(`
		SELECT
			toDate(timestamp) AS d,
			coalesce(nullIf(properties.traffic_channel, ''), 'unknown') AS channel,
			coalesce(nullIf(properties.traffic_source_detail, ''), '') AS detail,
			properties.booking_client_email AS email,
			properties.booking_client_phone AS phone,
			coalesce(nullIf(properties.booking_client_type, ''), 'unknown') AS client_type,
			toFloat(coalesce(properties.booking_value_usd, '0')) AS value
		FROM events WHERE event = 'booking_conversion_completed'`)

	// 2. Phone call conversions with channel
	const calls = await posthogQuery(`
		SELECT
			toDate(timestamp) AS d,
			coalesce(nullIf(properties.traffic_channel, ''), 'unknown') AS channel,
			coalesce(nullIf(properties.traffic_source_detail, ''), '') AS detail
		FROM events WHERE event = 'phone_call_conversion'`)

	// 3. Boulevard clients (in memory only)
	const byEmail = new Map<string, string>()
	const byPhone = new Map<string, string>()
	let after: string | null = null
	for (let p = 0; p < 60; p++) {
		const r = (await boulevardAdminFetch(
			`query C($after: String) { clients(first: 100, after: $after) {
				pageInfo { endCursor hasNextPage }
				edges { node { id email mobilePhone } } } }`,
			{ after },
		)) as any
		for (const e of r.clients?.edges ?? []) {
			const n = e.node
			if (normEmail(n.email)) byEmail.set(normEmail(n.email), n.id)
			if (normPhone(n.mobilePhone)) byPhone.set(normPhone(n.mobilePhone), n.id)
		}
		const pi = r.clients?.pageInfo
		if (!pi?.hasNextPage) break
		after = pi.endCursor
	}

	// 4. Revenue per Boulevard client from the local archive (no PII)
	const rev = await prisma.blvdRevenueItem.groupBy({
		by: ['boulevardClientId'],
		_sum: { grossAmountUsd: true },
	})
	const revByClient = new Map(
		rev.map(r => [r.boulevardClientId ?? '', r._sum.grossAmountUsd ?? 0]),
	)

	// 5. Join and aggregate
	type Agg = {
		bookings: number
		newClients: number
		matched: number
		revenue: number
		projected: number
		calls: number
	}
	const agg = new Map<string, Agg>()
	const get = (c: string) => {
		if (!agg.has(c))
			agg.set(c, {
				bookings: 0,
				newClients: 0,
				matched: 0,
				revenue: 0,
				projected: 0,
				calls: 0,
			})
		return agg.get(c)!
	}
	const seenClientByChannel = new Map<string, Set<string>>()
	for (const [, channel, _detail, email, phone, clientType, value] of bookings) {
		const a = get(channel)
		a.bookings++
		a.projected += Number(value) || 0
		if (clientType === 'new') a.newClients++
		const cid = byEmail.get(normEmail(email)) ?? byPhone.get(normPhone(phone))
		if (cid) {
			a.matched++
			const set = seenClientByChannel.get(channel) ?? new Set()
			if (!set.has(cid)) {
				set.add(cid)
				seenClientByChannel.set(channel, set)
				a.revenue += revByClient.get(cid) ?? 0
			}
		}
	}
	for (const [, channel] of calls) get(channel).calls++

	// channel detail breakdown for bookings
	const detailAgg = new Map<string, number>()
	for (const [, channel, detail] of bookings) {
		const k = `${channel} / ${detail || '(none)'}`
		detailAgg.set(k, (detailAgg.get(k) ?? 0) + 1)
	}

	console.log(
		'channel | web bookings | new clients | phone conv | matched->blvd | realized rev of matched clients | projected booking value',
	)
	for (const [c, a] of [...agg].sort((x, y) => y[1].revenue - x[1].revenue)) {
		console.log(
			`${c} | ${a.bookings} | ${a.newClients} | ${a.calls} | ${a.matched} | $${a.revenue.toFixed(0)} | $${a.projected.toFixed(0)}`,
		)
	}
	console.log('\nbooking channel/detail counts:')
	for (const [k, n] of [...detailAgg].sort((a, b) => b[1] - a[1]))
		console.log(`  ${k}: ${n}`)
	await prisma.$disconnect()
}

void main()
