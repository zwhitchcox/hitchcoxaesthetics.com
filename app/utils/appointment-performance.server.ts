/**
 * Per-appointment expected vs actual revenue. Expected values each booked
 * service the same way the projections do: the booked price when Boulevard
 * has one, otherwise the service's average paid ticket over the last 90 days.
 * Actual is the closed-order revenue linked to the appointment. The delta and
 * a plain-English reason make underperformers self-explanatory.
 */
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { getRecentClientComms, type ClientComm } from '#app/utils/client-comms.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	avgFirstPaymentUsd,
	buildWlProfiles,
	valueWlVisit,
	WL_INJECTION_RE,
	type WlSimState,
} from '#app/utils/wl-cadence.server.ts'

const EXCLUDED_CLIENT_NAMES = new Set(['zane hitchcox'])

/**
 * Prepaid packages: the client pays once up front and the remaining visits
 * are booked at $0 on purpose. A $0-booked visit therefore EXPECTS $0 -
 * valuing it at the average paid ticket made every package follow-up look
 * like a -$729 underperformer.
 */
const PREPAID_PACKAGE = /laser hair reduction|everesse|skin tightening/i

export type AppointmentPerformanceRow = {
	appointmentId: string
	startAt: string
	locationName: string
	clientName: string
	manageUrl: string | null
	services: string[]
	status: 'completed' | 'cancelled' | 'no_show' | 'upcoming'
	expectedUsd: number
	actualUsd: number
	deltaUsd: number
	reason: string
	/** First visit ever, or client record created within 45 days of the visit. */
	isNewPatient: boolean
	/** Recent CallRail calls/texts, filled for cancelled/no-show rows only. */
	comms: ClientComm[]
	/** The client's next non-cancelled appointment after this one, if booked:
	 * a follow-up for completed visits, a reschedule for cancelled ones. */
	nextVisitAt: string | null
}

type ApptNode = {
	id?: string | null
	startAt?: string | null
	state?: string | null
	cancelled?: boolean | null
	cancellation?: {
		reason?: string | null
		notes?: string | null
		cancelledAt?: string | null
	} | null
	manageUrl?: string | null
	client?: {
		id?: string | null
		name?: string | null
		mobilePhone?: string | null
		appointmentCount?: number | null
		createdAt?: string | null
	} | null
	appointmentServices?: Array<{
		price?: number | null
		service?: { name?: string | null } | null
	}> | null
}

async function avgPaidTicketByName(names: string[]) {
	if (names.length === 0) return new Map<string, number>()
	const items = await prisma.blvdRevenueItem.groupBy({
		by: ['itemName'],
		where: {
			itemName: { in: names },
			grossAmountUsd: { gt: 0 },
			occurredAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
		},
		_avg: { grossAmountUsd: true },
	})
	return new Map(items.map(i => [i.itemName, i._avg.grossAmountUsd ?? 0]))
}

export async function loadAppointmentPerformance(
	since: Date,
	until: Date,
	now = new Date(),
): Promise<AppointmentPerformanceRow[]> {
	const locations = await listBlvdAdminLocations()
	const appointments: Array<ApptNode & { locationName: string }> = []
	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < 30; page++) {
			const res: any = await boulevardAdminFetch(
				`query PerfAppointments($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId,
						query: "startAt >= '${since.toISOString()}' AND startAt <= '${until.toISOString()}'") {
						pageInfo { endCursor hasNextPage }
						edges { node {
							id startAt state cancelled manageUrl
							cancellation { reason notes cancelledAt }
							client { id name mobilePhone appointmentCount createdAt }
							appointmentServices { price service { name } }
						} }
					}
				}`,
				{ after, locationId: location.id },
			)
			for (const edge of res.appointments?.edges ?? []) {
				if (edge?.node?.id)
					appointments.push({
						...edge.node,
						locationName: location.name ?? location.id,
					})
			}
			if (!res.appointments?.pageInfo?.hasNextPage) break
			after = res.appointments.pageInfo.endCursor
		}
	}

	const kept = appointments.filter(
		a =>
			!EXCLUDED_CLIENT_NAMES.has((a.client?.name ?? '').trim().toLowerCase()),
	)

	const serviceNames = [
		...new Set(
			kept.flatMap(a =>
				(a.appointmentServices ?? [])
					.map(s => s.service?.name)
					.filter((n): n is string => Boolean(n)),
			),
		),
	]
	const [avgByName, revenueItems] = await Promise.all([
		avgPaidTicketByName(serviceNames),
		prisma.blvdRevenueItem.findMany({
			where: { boulevardAppointmentId: { in: kept.map(a => a.id!) } },
			select: { boulevardAppointmentId: true, grossAmountUsd: true },
		}),
	])
	const actualByAppt = new Map<string, number>()
	for (const item of revenueItems) {
		if (!item.boulevardAppointmentId) continue
		actualByAppt.set(
			item.boulevardAppointmentId,
			(actualByAppt.get(item.boulevardAppointmentId) ?? 0) + item.grossAmountUsd,
		)
	}

	// Weight-loss cadence: expected for a $0-booked WL-injection visit comes
	// from that client's own payment rhythm (weekly per-shot payers vs monthly
	// renewers whose off-week visits owe $0), built from the local revenue
	// archive. Clients with no WL payment history are treated as new patients
	// and keep the service-average expectation.
	const wlClientIds = [
		...new Set(
			kept
				.filter(a =>
					(a.appointmentServices ?? []).some(s =>
						WL_INJECTION_RE.test(s.service?.name ?? ''),
					),
				)
				.map(a => a.client?.id)
				.filter((id): id is string => Boolean(id)),
		),
	]
	const wlPayItems = wlClientIds.length
		? await prisma.blvdRevenueItem.findMany({
				where: {
					boulevardClientId: { in: wlClientIds },
					itemName: { contains: 'weight loss' },
					grossAmountUsd: { gt: 0 },
					occurredAt: { gte: new Date(Date.now() - 150 * 24 * 3600 * 1000) },
				},
				select: { boulevardClientId: true, occurredAt: true, grossAmountUsd: true },
			})
		: []
	const wlPayByClientDay = new Map<string, { clientId: string; atMs: number; usd: number }>()
	for (const item of wlPayItems) {
		const day = item.occurredAt.toISOString().slice(0, 10)
		const key = `${item.boulevardClientId}|${day}`
		const entry = wlPayByClientDay.get(key) ?? {
			clientId: item.boulevardClientId!,
			atMs: item.occurredAt.getTime(),
			usd: 0,
		}
		entry.usd += item.grossAmountUsd
		wlPayByClientDay.set(key, entry)
	}
	const wlProfiles = buildWlProfiles([...wlPayByClientDay.values()], [])
	// What a brand-new weight-loss patient's first paying visit averages -
	// start packages, so higher than the ongoing per-visit price.
	const wlNewPatientUsd = Math.round(
		avgFirstPaymentUsd([...wlPayByClientDay.values()]),
	)
	const wlSim: WlSimState = new Map()

	const rows = kept
		.sort(
			(a, b) =>
				new Date(a.startAt ?? 0).getTime() - new Date(b.startAt ?? 0).getTime(),
		)
		.map((a): AppointmentPerformanceRow => {
		const services = (a.appointmentServices ?? [])
			.map(s => s.service?.name)
			.filter((n): n is string => Boolean(n))
		let wlKind: ReturnType<typeof valueWlVisit>['kind'] | null = null
		const startMs = new Date(a.startAt ?? 0).getTime()
		const clientCreatedMs = a.client?.createdAt
			? Date.parse(a.client.createdAt)
			: NaN
		const isNewPatient =
			(a.client?.appointmentCount != null && a.client.appointmentCount <= 1) ||
			(Number.isFinite(clientCreatedMs) &&
				startMs - clientCreatedMs < 45 * 24 * 3600 * 1000)
		const expectedUsd = Math.round(
			(a.appointmentServices ?? []).reduce((sum, s) => {
				const booked = (s.price ?? 0) / 100
				const name = s.service?.name ?? ''
				if (booked > 0) return sum + booked
				if (PREPAID_PACKAGE.test(name)) return sum // prepaid, visit owes $0
				if (WL_INJECTION_RE.test(name)) {
					const profile = a.client?.id ? wlProfiles.get(a.client.id) : undefined
					// A repeat visitor with zero payment history isn't a new patient -
					// they're on a package/comp, so nothing is expected at the till.
					if (!profile && !isNewPatient) {
						wlKind = 'non_paying'
						return sum
					}
					const wl = valueWlVisit({
						clientId: a.client?.id ?? null,
						visitAtMs: startMs,
						profile,
						fallbackUsd: wlNewPatientUsd || (avgByName.get(name) ?? 0),
						sim: wlSim,
					})
					wlKind = wl.kind
					return sum + wl.usd
				}
				return sum + (avgByName.get(name) ?? 0)
			}, 0),
		)
		const isPrepaidVisit =
			(a.appointmentServices ?? []).some(
				s => PREPAID_PACKAGE.test(s.service?.name ?? '') && !(s.price ?? 0),
			)
		const actualUsd = Math.round(actualByAppt.get(a.id!) ?? 0)
		const startAt = a.startAt ?? ''
		const isNoShow =
			a.state === 'NO_SHOW' || a.cancellation?.reason === 'NO_SHOW'
		const status: AppointmentPerformanceRow['status'] = a.cancelled
			? 'cancelled'
			: isNoShow
				? 'no_show'
				: new Date(startAt) > now
					? 'upcoming'
					: 'completed'
		const deltaUsd =
			status === 'cancelled' || status === 'no_show'
				? -expectedUsd
				: actualUsd - expectedUsd
		const toEtDay = (d: Date) =>
			d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
		const isToday =
			startAt !== '' && toEtDay(new Date(startAt)) === toEtDay(now)
		// Cancellation detail: who, how far ahead, and any note left in Boulevard.
		let cancelledDetail = 'cancelled'
		if (a.cancelled && a.cancellation) {
			const who =
				a.cancellation.reason === 'CLIENT_CANCEL'
					? 'cancelled by client'
					: `cancelled (${(a.cancellation.reason ?? 'unknown').toLowerCase().replace(/_/g, ' ')})`
			const cancelledAtMs = a.cancellation.cancelledAt
				? Date.parse(a.cancellation.cancelledAt)
				: NaN
			const daysAhead = Number.isFinite(cancelledAtMs)
				? Math.round((startMs - cancelledAtMs) / (24 * 3600 * 1000))
				: null
			const lead =
				daysAhead == null
					? ''
					: daysAhead <= 0
						? ', same day'
						: `, ${daysAhead}d ahead`
			const note = a.cancellation.notes?.trim()
			cancelledDetail = `${who}${lead}${note ? `: ${note}` : ''}`
		}
		const maybeOpenCheckout = isToday ? ' (today: checkout may still be open)' : ''
		const isConsult = services.some(n => /consult/i.test(n))
		const reason =
			status === 'cancelled'
				? cancelledDetail
				: status === 'no_show'
					? 'no-show'
					: status === 'upcoming'
						? 'not happened yet'
						: isPrepaidVisit && actualUsd === 0
							? 'prepaid package visit: paid up front, $0 due today'
							: wlKind === 'mid_cycle' && actualUsd === 0
								? 'mid-cycle weight-loss visit: $0 due today'
								: wlKind === 'non_paying' && actualUsd === 0
									? 'weight-loss visit: this client never pays at the till'
									: wlKind === 'renewal' && actualUsd === 0
										? `weight-loss renewal was due, nothing collected${maybeOpenCheckout}`
										: wlKind === 'per_visit' && actualUsd === 0
											? `pays every visit historically, nothing collected${maybeOpenCheckout}`
											: isConsult && actualUsd === 0
												? "consultation: didn't convert to a purchase that day"
												: wlKind === 'new_client' && actualUsd === 0
													? 'no payment history: valued like a new patient'
													: actualUsd === 0
							? `completed but $0 collected (membership, package, or unlinked order)${maybeOpenCheckout}`
							: deltaUsd <= -100
								? 'lighter ticket than the service average'
								: deltaUsd >= 100
									? 'above average'
									: 'on target'
		return {
			appointmentId: a.id!,
			startAt,
			locationName: a.locationName,
			clientName: a.client?.name ?? '-',
			manageUrl: a.manageUrl ?? null,
			services,
			status,
			expectedUsd,
			actualUsd,
			deltaUsd,
			reason,
			isNewPatient,
			comms: [],
			nextVisitAt: null,
		}
	})

	// Pull the CallRail trail (calls + texts) for cancelled/no-show clients so
	// "why did this cancel?" is answerable from the report. Capped to keep the
	// page load bounded; no trail at all usually means an online cancellation.
	const phoneByApptId = new Map(
		kept.map(a => [a.id!, a.client?.mobilePhone ?? null]),
	)
	const commRows = rows
		.filter(r => r.status === 'cancelled' || r.status === 'no_show')
		.slice(0, 15)
	await Promise.all(
		commRows.map(async r => {
			r.comms = await getRecentClientComms(phoneByApptId.get(r.appointmentId)).catch(
				() => [],
			)
		}),
	)

	// Follow-up / reschedule lookup: the client's next non-cancelled
	// appointment after each row. One clientId-filtered query per client per
	// location, capped so the page load stays bounded.
	const clientIdByApptId = new Map(kept.map(a => [a.id!, a.client?.id ?? null]))
	const lookupRows = rows.filter(r => r.status !== 'upcoming')
	const earliestStartByClient = new Map<string, string>()
	for (const r of lookupRows) {
		const clientId = clientIdByApptId.get(r.appointmentId)
		if (!clientId || !r.startAt) continue
		const current = earliestStartByClient.get(clientId)
		if (!current || r.startAt < current)
			earliestStartByClient.set(clientId, r.startAt)
	}
	const futureByClient = new Map<
		string,
		Array<{ id: string; startAt: string; cancelled: boolean }>
	>()
	await Promise.all(
		[...earliestStartByClient.entries()].slice(0, 30).map(async ([clientId, earliest]) => {
			const found: Array<{ id: string; startAt: string; cancelled: boolean }> = []
			for (const location of locations) {
				const res: any = await boulevardAdminFetch(
					`query NextAppointments($locationId: ID!, $clientId: ID) {
						appointments(first: 20, locationId: $locationId, clientId: $clientId,
							query: "startAt > '${new Date(earliest).toISOString()}'") {
							edges { node { id startAt cancelled } }
						}
					}`,
					{ clientId, locationId: location.id },
				).catch(() => null)
				for (const edge of res?.appointments?.edges ?? []) {
					const node = edge?.node
					if (node?.id && node.startAt)
						found.push({
							id: node.id,
							startAt: node.startAt,
							cancelled: node.cancelled === true,
						})
				}
			}
			futureByClient.set(clientId, found)
		}),
	)
	for (const r of lookupRows) {
		const clientId = clientIdByApptId.get(r.appointmentId)
		if (!clientId) continue
		const next = (futureByClient.get(clientId) ?? [])
			.filter(
				appt =>
					!appt.cancelled && appt.id !== r.appointmentId && appt.startAt > r.startAt,
			)
			.sort((a, b) => a.startAt.localeCompare(b.startAt))[0]
		r.nextVisitAt = next?.startAt ?? null
	}

	return rows.sort((x, y) => x.deltaUsd - y.deltaUsd)
}
