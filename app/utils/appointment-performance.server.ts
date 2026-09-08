/**
 * Per-appointment expected vs actual revenue. Expected uses the SAME v4
 * valuation as the weekly forecast (app/utils/revenue-valuation.server.ts, via
 * appointment-valuation.server.ts) so the two surfaces can never quote
 * different dollars for the same visit. Actual is the closed-order revenue
 * linked to the appointment. The delta and a plain-English reason make
 * underperformers self-explanatory.
 */
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { getRecentClientComms, type ClientComm } from '#app/utils/client-comms.server.ts'
import { getAppointmentValuation } from '#app/utils/appointment-valuation.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	WL_INJECTION_RE,
	type WeightLossClientKind,
} from '#app/utils/revenue-valuation.server.ts'

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

/** The minimum an appointment needs before it can be valued. */
export type ValuableAppointment = {
	id: string
	startAtMs: number
	clientId: string | null
	clientAppointmentCount: number | null
	clientCreatedAtMs: number | null
	services: Array<{ name: string }>
}

export type AppointmentValue = {
	/** Expected dollars at the till for this visit. */
	usd: number
	wlKind: WeightLossClientKind | null
	isPrepaidVisit: boolean
	isNewPatient: boolean
}

/**
 * The one place an appointment is turned into expected dollars, shared by the
 * per-appointment table and the service-category rollup.
 *
 * WHY THE BOOKED PRICE IS NOT USED. This used to prefer
 * `appointmentServices.price` and fall back to the average PAID ticket. Both
 * were wrong. Measured over the Boulevard revenue window (2026-07-27):
 *
 *   - Boulevard WRITES THE PRICE BACK at checkout. Past months are 74-82%
 *     priced, future months 7-35%, and on past visits "has a price" matches
 *     "collected money" 99.3% of the time versus 0.7% for unpriced ones. So
 *     the price is a record of what happened, not a forecast: using it made
 *     expected == actual for completed rows (delta always ~0, the report's
 *     whole point) while upcoming rows silently fell through to the average.
 *   - The paid-ticket average ignored the 22.3% of kept visits that collect
 *     $0, overstating every service by about 1/0.78.
 *
 * v4 values a service at its revenue per KEPT visit, which is the honest ex
 * ante expectation: it already blends in the visits that pay nothing. Weight
 * loss is valued from the client's own history. Ordering no longer matters -
 * there is no cadence simulation to walk.
 */
export async function valueAppointments(
	appts: ValuableAppointment[],
): Promise<Map<string, AppointmentValue>> {
	const values = new Map<string, AppointmentValue>()
	if (appts.length === 0) return values

	const valuation = await getAppointmentValuation()

	for (const a of appts) {
		const isNewPatient =
			(a.clientAppointmentCount != null && a.clientAppointmentCount <= 1) ||
			(a.clientCreatedAtMs != null &&
				a.startAtMs - a.clientCreatedAtMs < 45 * 24 * 3600 * 1000)
		const usd = Math.round(
			a.services.reduce(
				(sum, s) =>
					sum +
					valuation.valueSegment({
						clientId: a.clientId,
						serviceName: s.name,
					}),
				0,
			),
		)
		const wlService = a.services.find(s => WL_INJECTION_RE.test(s.name))
		values.set(a.id, {
			usd,
			wlKind: wlService
				? valuation.describeWeightLossClient(a.clientId).kind
				: null,
			isNewPatient,
			// Name-only: a written-back price cannot classify an upcoming visit
			// (see the note above), and this flag now only colours the reason text.
			isPrepaidVisit: a.services.some(s => PREPAID_PACKAGE.test(s.name)),
		})
	}
	return values
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

	const [values, revenueItems] = await Promise.all([
		valueAppointments(
			kept.map(a => ({
				id: a.id!,
				startAtMs: new Date(a.startAt ?? 0).getTime(),
				clientId: a.client?.id ?? null,
				clientAppointmentCount: a.client?.appointmentCount ?? null,
				clientCreatedAtMs: a.client?.createdAt
					? Date.parse(a.client.createdAt)
					: null,
				services: (a.appointmentServices ?? []).map(s => ({
					name: s.service?.name ?? '',
				})),
			})),
		),
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

	const rows = kept
		.sort(
			(a, b) =>
				new Date(a.startAt ?? 0).getTime() - new Date(b.startAt ?? 0).getTime(),
		)
		.map((a): AppointmentPerformanceRow => {
		const services = (a.appointmentServices ?? [])
			.map(s => s.service?.name)
			.filter((n): n is string => Boolean(n))
		const startMs = new Date(a.startAt ?? 0).getTime()
		const value = values.get(a.id!)
		const { usd: expectedUsd, wlKind, isNewPatient, isPrepaidVisit } = value ?? {
			usd: 0,
			wlKind: null,
			isNewPatient: false,
			isPrepaidVisit: false,
		}
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
							: wlKind === 'spread' && actualUsd === 0
								? 'weight-loss visit: this client pays every few visits, so each one carries a share'
								: wlKind === 'never_pays' && actualUsd === 0
									? 'weight-loss visit: this client never pays at the till'
									: wlKind === 'per_visit' && actualUsd === 0
										? `pays every visit historically, nothing collected${maybeOpenCheckout}`
										: isConsult && actualUsd === 0
											? "consultation: didn't convert to a purchase that day"
											: wlKind === 'new_client' && actualUsd === 0
												? 'no weight-loss payment history: valued at the injection average'
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
