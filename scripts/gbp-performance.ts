/**
 * Pull GBP Performance API daily metrics (impressions/actions) for the SHA,
 * Botox Knox, and Knoxville Weight Loss Clinic listings.
 *
 *   pnpm exec tsx scripts/gbp-performance.ts <out.json> [fromYYYY-MM-DD]
 */
import fs from 'node:fs'

import 'dotenv/config'

const LISTINGS = [
	{ brand: 'SHA', name: 'Bearden', id: '13581758717989522836' },
	{ brand: 'SHA', name: 'Farragut', id: '7968858603211080242' },
	{ brand: 'SHA', name: 'Cedar Bluff', id: '7823258395260652453' },
	{ brand: 'SHA', name: 'West Hills', id: '18165056681856849543' },
	{ brand: 'Botox Knox', name: 'Kingston Pike', id: '8814118436068854281' },
	{ brand: 'Botox Knox', name: 'Campbell Station', id: '8388106535416305139' },
	{ brand: 'Weight Loss Knox', name: 'Campbell Station', id: '11750979648218741829' },
	{ brand: 'Weight Loss Knox', name: 'Kingston Pike', id: '15016055128629417766' },
]

const METRICS = [
	'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
	'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
	'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
	'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
	'CALL_CLICKS',
	'WEBSITE_CLICKS',
	'BUSINESS_DIRECTION_REQUESTS',
	'BUSINESS_BOOKINGS',
]

async function getAccessToken() {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: process.env.GOOGLE_CLIENT_ID!,
			client_secret: process.env.GOOGLE_CLIENT_SECRET!,
			refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
			grant_type: 'refresh_token',
		}),
	})
	const json = (await res.json()) as { access_token?: string }
	if (!json.access_token) throw new Error('token: ' + JSON.stringify(json))
	return json.access_token
}

async function main() {
	const out = process.argv[2]
	if (!out) throw new Error('usage: gbp-performance.ts <out.json> [from]')
	const from = process.argv[3] ?? '2025-01-01'
	const [fy, fm, fd] = from.split('-').map(Number)
	const now = new Date()
	const token = await getAccessToken()

	const rows: Array<{
		brand: string
		location: string
		metric: string
		date: string
		value: number
	}> = []
	for (const l of LISTINGS) {
		const url = new URL(
			`https://businessprofileperformance.googleapis.com/v1/locations/${l.id}:fetchMultiDailyMetricsTimeSeries`,
		)
		for (const m of METRICS) url.searchParams.append('dailyMetrics', m)
		url.searchParams.set('dailyRange.start_date.year', String(fy))
		url.searchParams.set('dailyRange.start_date.month', String(fm))
		url.searchParams.set('dailyRange.start_date.day', String(fd))
		url.searchParams.set('dailyRange.end_date.year', String(now.getFullYear()))
		url.searchParams.set('dailyRange.end_date.month', String(now.getMonth() + 1))
		url.searchParams.set('dailyRange.end_date.day', String(now.getDate()))
		const r = (await (
			await fetch(url, { headers: { authorization: `Bearer ${token}` } })
		).json()) as any
		if (r.error) {
			console.error(l.brand, l.name, 'ERROR', r.error.status, r.error.message)
			continue
		}
		for (const series of r.multiDailyMetricTimeSeries ?? []) {
			for (const dm of series.dailyMetricTimeSeries ?? []) {
				for (const dv of dm.timeSeries?.datedValues ?? []) {
					const d = dv.date
					rows.push({
						brand: l.brand,
						location: l.name,
						metric: dm.dailyMetric,
						date: `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
						value: Number(dv.value ?? 0),
					})
				}
			}
		}
		console.log(l.brand, l.name, 'ok')
	}
	fs.writeFileSync(out, JSON.stringify(rows))
	console.log(`wrote ${rows.length} datapoints to ${out}`)
}

void main()
