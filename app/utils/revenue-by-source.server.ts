/**
 * Server half of the Revenue report chart and the bookings funnel: window
 * parsing, Boulevard appointment fetches, source labeling (including the
 * per-GBP-listing aggregation across web and phone), and the row builders.
 * Chart cells are keyed by when money happened (appointment/checkout date);
 * funnel rows are keyed by when the BOOKING was made.
 */
import { normalizeBlvdEntityId } from '#app/utils/blvd-attribution.server.ts'
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getGoogleAdsSpendUsd } from '#app/utils/google-ads-spend.server.ts'
import { inferRevenueServiceCategory } from '#app/utils/blvd-revenue-sync.server.ts'
import { valueAppointments } from '#app/utils/appointment-performance.server.ts'
import {
	GRANULARITIES,
	WINDOWS,
	type Granularity,
	type WindowKey,
} from '#app/components/revenue-by-source.tsx'

const REPORT_TIME_ZONE = 'America/New_York'
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function toEtDay(date: Date) {
	return date.toLocaleDateString('en-CA', { timeZone: REPORT_TIME_ZONE })
}

/** UTC instant of midnight (start of day) in business time for a YYYY-MM-DD day. */
export function etMidnightUtc(day: string): Date {
	for (const offset of ['-04:00', '-05:00']) {
		const d = new Date(`${day}T00:00:00${offset}`)
		if (
			toEtDay(d) === day &&
			d.toLocaleTimeString('en-GB', { timeZone: REPORT_TIME_ZONE, hour12: false }).startsWith('00')
		) {
			return d
		}
	}
	return new Date(`${day}T00:00:00-05:00`)
}

export function shiftDay(day: string, days: number): string {
	const d = new Date(`${day}T12:00:00Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

const CHANNEL_LABELS: Record<string, string> = {
	paid_search: 'Google Ads',
	gmb: 'Google Business Profile',
	organic_search: 'Organic search',
	referral: 'Referral',
	direct: 'Direct',
}

export function getSourceLabel(touch?: {
	trafficChannel: string | null
	utmContent: string | null
	rawProperties?: string | null
	callrailSource?: string | null
}) {
	if (!touch) return 'Untracked (phone / walk-in)'
	// Retell voice bookings carry booking_channel: 'retell...' and no web
	// traffic channel, label them as what they are, not 'Website (other)'.
	if (!touch.trafficChannel && touch.rawProperties?.includes('"booking_channel":"retell')) {
		return touch.callrailSource ? `AI phone · ${touch.callrailSource}` : 'AI phone call'
	}
	// utm_content on GBP website links names the specific listing
	// (bearden / farragut / botox-knox-bearden / kwlc-farragut / ...).
	if (touch.trafficChannel === 'gmb') {
		return touch.utmContent
			? `GBP · ${touch.utmContent}`
			: 'Google Business Profile'
	}
	return CHANNEL_LABELS[touch.trafficChannel ?? ''] ?? 'Website (other)'
}

export type BookingChannel = 'phone' | 'online' | 'none'

// CallRail tracker names for the GBP listings, keyed by the tracker name
// normalized with normalizeTrackerName (lowercased, spaces/hyphens stripped)
// so sloppy variants like 'GMB -Botox Knox - Farragut' still match.
const GBP_TRACKER_TO_SLUG: Record<string, string> = {
	gmbknoxville: 'bearden',
	gmbfarragut: 'farragut',
	gmbsarahhitchcoxaestheticscedarbluff: 'cedar-bluff',
	gmbsarahhitchcoxaestheticswesthills: 'west-hills',
	gmbbotoxknoxbearden: 'botox-knox-bearden',
	gmbbotoxknoxfarragut: 'botox-knox-farragut',
	gmbweightlossknoxbearden: 'kwlc-bearden',
	gmbweightlossknoxfarragut: 'kwlc-farragut',
}

function normalizeTrackerName(name: string) {
	return name.toLowerCase().replace(/[\s-]+/g, '')
}

/**
 * One source per GBP listing regardless of whether the booking came from a
 * web click (utm_content) or a phone call (CallRail tracker), with the
 * channel preserved so the report can filter phone vs online. Non-GBP
 * sources keep their getSourceLabel names. Rows with no touch are 'none'
 * (staff / walk-in) and labeled by getUnattributedLabel.
 */
export function getAggregatedSource(
	touch:
		| {
				trafficChannel: string | null
				utmContent: string | null
				rawProperties?: string | null
				callrailSource?: string | null
		  }
		| null
		| undefined,
	bookedByType?: string | null,
): { label: string; channel: BookingChannel } {
	if (!touch) {
		return { label: getUnattributedLabel(bookedByType), channel: 'none' }
	}
	const isPhone =
		Boolean(touch.rawProperties?.includes('"booking_channel":"retell')) ||
		(Boolean(touch.callrailSource) && !touch.trafficChannel)
	if (isPhone) {
		const normalized = normalizeTrackerName(touch.callrailSource ?? '')
		const slug = GBP_TRACKER_TO_SLUG[normalized]
		if (slug) return { label: `GBP · ${slug}`, channel: 'phone' }
		// The legacy generic tracker can't say which listing took the call.
		if (normalized === 'googlemybusiness') {
			return { label: 'GBP (listing unknown)', channel: 'phone' }
		}
		// Retell bookings keep their 'AI phone · <tracker>' label; a staff-phone
		// booking with a non-GBP tracker is labeled by its tracker.
		if (touch.rawProperties?.includes('"booking_channel":"retell')) {
			return { label: getSourceLabel(touch), channel: 'phone' }
		}
		return {
			label: touch.callrailSource ? `Phone · ${touch.callrailSource}` : 'Phone call',
			channel: 'phone',
		}
	}
	if (touch.trafficChannel === 'gmb') {
		return {
			label: touch.utmContent ? `GBP · ${touch.utmContent}` : 'GBP (listing unknown)',
			channel: 'online',
		}
	}
	return { label: getSourceLabel(touch), channel: 'online' }
}

/** Source label for an appointment with no attribution touch. */
export function getUnattributedLabel(
	bookedByType?: string | null,
	newClient?: boolean | null,
) {
	if (bookedByType === 'STAFF') {
		// Staff create bookings for two very different reasons: rebooking an
		// existing client at checkout, or taking a NEW client over the phone /
		// at the desk. Calling a first-timer a "rebook" mislabels the lead.
		return newClient === true
			? 'Phone / walk-in (staff-booked, new client)'
			: 'Rebook (staff-booked)'
	}
	if (bookedByType === 'CLIENT') return 'Online (unattributed)'
	return 'Untracked (phone / walk-in)'
}

export function bucketFor(d: Date, g: Granularity): string {
	const day = toEtDay(d)
	if (g === 'month') return day.slice(0, 7)
	if (g === 'week') {
		const x = new Date(`${day}T12:00:00Z`)
		const dow = (x.getUTCDay() + 6) % 7
		return shiftDay(day, -dow)
	}
	return day
}

export function blvdClientUrl(boulevardClientId?: string | null) {
	if (!boulevardClientId) return null
	const bare = boulevardClientId.replace(/^urn:blvd:Client:/, '')
	return `https://dashboard.boulevard.io/clients/${encodeURIComponent(bare)}`
}

export function posthogSessionUrl(touch?: {
	posthogSessionId?: string | null
	posthogDistinctId?: string | null
}) {
	const projectId = process.env.POSTHOG_PROJECT_ID?.trim()
	if (!projectId || !touch) return null
	if (touch.posthogSessionId) {
		return `https://us.posthog.com/project/${projectId}/replay/${encodeURIComponent(touch.posthogSessionId)}`
	}
	if (touch.posthogDistinctId) {
		return `https://us.posthog.com/project/${projectId}/person/${encodeURIComponent(touch.posthogDistinctId)}`
	}
	return null
}

/** Resolve a non-custom preset to [fromDay, toDay] in business time.
 * Weeks run Monday–Sunday, matching every other report. */
function presetRange(
	windowKey: Exclude<WindowKey, 'custom'>,
	todayEt: string,
): { fromDay: string; toDay: string } {
	const mondayOf = (day: string) => {
		const anchor = new Date(`${day}T12:00:00Z`)
		const dow = (anchor.getUTCDay() + 6) % 7
		return shiftDay(day, -dow)
	}
	switch (windowKey) {
		case 'yesterday': {
			const yesterday = shiftDay(todayEt, -1)
			return { fromDay: yesterday, toDay: yesterday }
		}
		case 'thisWeek':
			// Through Sunday, not today: Expected covers the whole week as a
			// projection; actual/cancelled series simply stop at today.
			return { fromDay: mondayOf(todayEt), toDay: shiftDay(mondayOf(todayEt), 6) }
		case 'lastWeek': {
			const monday = shiftDay(mondayOf(todayEt), -7)
			return { fromDay: monday, toDay: shiftDay(monday, 6) }
		}
		case 'thisMonth':
			return { fromDay: `${todayEt.slice(0, 7)}-01`, toDay: todayEt }
		case 'lastMonth': {
			const firstOfThis = `${todayEt.slice(0, 7)}-01`
			const lastOfPrev = shiftDay(firstOfThis, -1)
			return { fromDay: `${lastOfPrev.slice(0, 7)}-01`, toDay: lastOfPrev }
		}
		case 'thisYear':
			return { fromDay: `${todayEt.slice(0, 4)}-01-01`, toDay: todayEt }
		case 'all':
			return { fromDay: '2024-01-01', toDay: todayEt }
		default:
			return {
				fromDay: shiftDay(todayEt, -(WINDOWS[windowKey].days - 1)),
				toDay: todayEt,
			}
	}
}

export type ReportWindow = {
	windowKey: WindowKey
	granularity: Granularity
	fromDay: string
	toDay: string
	todayEt: string
	since: Date
	until: Date
}

export function parseReportWindow(
	request: Request,
	defaultWindow: WindowKey = 'today',
): ReportWindow {
	const url = new URL(request.url)
	let windowKey: WindowKey = (Object.keys(WINDOWS) as WindowKey[]).includes(
		url.searchParams.get('window') as WindowKey,
	)
		? (url.searchParams.get('window') as WindowKey)
		: defaultWindow
	const granularity: Granularity = GRANULARITIES.includes(
		url.searchParams.get('granularity') as Granularity,
	)
		? (url.searchParams.get('granularity') as Granularity)
		: 'day'

	const todayEt = toEtDay(new Date())
	const fromParam = url.searchParams.get('from')
	const toParam = url.searchParams.get('to')
	let fromDay: string
	let toDay: string
	if (
		windowKey === 'custom' &&
		fromParam && DAY_RE.test(fromParam) &&
		toParam && DAY_RE.test(toParam)
	) {
		fromDay = fromParam <= toParam ? fromParam : toParam
		toDay = fromParam <= toParam ? toParam : fromParam
	} else {
		if (windowKey === 'custom') windowKey = defaultWindow
		// custom was just reassigned away; TS can't see it through the `let`.
		;({ fromDay, toDay } = presetRange(
			windowKey as Exclude<WindowKey, 'custom'>,
			todayEt,
		))
	}
	return {
		windowKey,
		granularity,
		fromDay,
		toDay,
		todayEt,
		since: etMidnightUtc(fromDay),
		until: etMidnightUtc(shiftDay(toDay, 1)),
	}
}

export type BlvdAppointmentMeta = {
	id: string
	startAt: Date
	createdAt: Date | null
	bookedByType: string | null
	clientId: string | null
	clientName: string | null
	clientAppointmentCount: number | null
	clientCreatedAt: Date | null
	locationName: string | null
	manageUrl: string | null
	/** Booked block length in minutes, the chair time the appointment holds. */
	durationMinutes: number | null
	services: Array<{ price: number | null; name: string; minutes: number | null }>
}

const APPOINTMENT_FIELDS = `id startAt createdAt state cancelled bookedByType manageUrl duration
	location { name } client { id name appointmentCount createdAt }
	appointmentServices { price duration service { name } }`

function toAppointmentMeta(node: any): BlvdAppointmentMeta | null {
	if (!node?.id || !node.startAt) return null
	if (node.cancelled || node.state === 'NO_SHOW') return null
	return {
		id: normalizeBlvdEntityId('Appointment', node.id)!,
		startAt: new Date(node.startAt),
		createdAt: node.createdAt ? new Date(node.createdAt) : null,
		bookedByType: node.bookedByType ?? null,
		clientId: node.client?.id ?? null,
		clientName: node.client?.name ?? null,
		clientAppointmentCount:
			typeof node.client?.appointmentCount === 'number'
				? node.client.appointmentCount
				: null,
		clientCreatedAt: node.client?.createdAt ? new Date(node.client.createdAt) : null,
		locationName: node.location?.name ?? null,
		manageUrl: node.manageUrl ?? null,
		durationMinutes: typeof node.duration === 'number' ? node.duration : null,
		services: (node.appointmentServices ?? []).map((s: any) => ({
			price: s.price ?? null,
			name: s.service?.name ?? 'Unknown service',
			minutes: typeof s.duration === 'number' ? s.duration : null,
		})),
	}
}

async function fetchAppointments(query: string): Promise<BlvdAppointmentMeta[]> {
	const locations = await listBlvdAdminLocations()
	const appointments: BlvdAppointmentMeta[] = []
	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < 15; page++) {
			const res: any = await boulevardAdminFetch(
				`query RangeAppointments($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId, query: "${query}") {
						pageInfo { endCursor hasNextPage }
						edges { node { ${APPOINTMENT_FIELDS} } }
					}
				}`,
				{ after, locationId: location.id },
			)
			for (const edge of res.appointments?.edges ?? []) {
				const meta = toAppointmentMeta(edge?.node)
				if (meta) appointments.push(meta)
			}
			if (!res.appointments?.pageInfo?.hasNextPage) break
			after = res.appointments.pageInfo.endCursor
		}
	}
	return appointments
}

/**
 * Appointments whose START is in the window, booked-by labels + projecting
 * unpaid appointments. Cancelled/no-show excluded; page-capped.
 */
export async function getBlvdAppointmentsInRange(
	fromDay: string,
	toDay: string,
): Promise<BlvdAppointmentMeta[]> {
	if (toDay < fromDay) return []
	const all = await fetchAppointments(
		`startAt >= '${shiftDay(fromDay, -1)}T00:00:00Z' AND startAt <= '${shiftDay(toDay, 1)}T23:59:59Z'`,
	)
	return all.filter(a => {
		const day = toEtDay(a.startAt)
		return day >= fromDay && day <= toDay
	})
}

/** Appointments whose BOOKING was made in the window (funnel view). */
export async function getBlvdAppointmentsCreatedInRange(
	since: Date,
	until: Date,
): Promise<BlvdAppointmentMeta[]> {
	const all = await fetchAppointments(
		`createdAt >= '${since.toISOString()}' AND createdAt <= '${until.toISOString()}'`,
	)
	return all.filter(a => a.createdAt && a.createdAt >= since && a.createdAt < until)
}

/** Recent average paid ticket per service name, values $0-at-booking services. */
async function getAvgTicketByName(names: string[]) {
	if (!names.length) return new Map<string, number>()
	const averages = await prisma.blvdRevenueItem.groupBy({
		by: ['itemName'],
		where: {
			itemName: { in: names },
			grossAmountUsd: { gt: 0 },
			occurredAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
		},
		_avg: { grossAmountUsd: true },
	})
	return new Map(averages.map(a => [a.itemName, a._avg.grossAmountUsd ?? 0]))
}

/**
 * A client is NEW on exactly one booking: their first-ever one. Everything
 * after that, including a rebook made minutes later, is a returning booking.
 *
 * The first-ever appointment per client never changes once known, so it is
 * cached for the life of the process.
 */
const firstAppointmentByClient = new Map<string, string | null>()
/** Past this age at booking time, a client with history booked before. */
const NEW_CLIENT_RECORD_AGE_MS = 45 * 24 * 3600 * 1000
const MAX_FIRST_APPOINTMENT_LOOKUPS = 400

async function mapWithConcurrency<T>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<void>,
) {
	let cursor = 0
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (cursor < items.length) {
				const item = items[cursor++]!
				await worker(item)
			}
		}),
	)
}

/**
 * Earliest non-cancelled appointment per client, straight from Boulevard.
 * Cancelled and no-showed bookings are skipped so this matches the bookings
 * the report actually counts. Clients with more than 100 appointments at one
 * location can't be paged here, but they are filtered out long before by the
 * record-age shortcut in resolveNewClientFlags.
 */
async function getFirstAppointmentIdByClient(clientIds: string[]) {
	const unique = [...new Set(clientIds)]
	const pending = unique
		.filter(id => !firstAppointmentByClient.has(id))
		.slice(0, MAX_FIRST_APPOINTMENT_LOOKUPS)
	if (pending.length) {
		const locations = await listBlvdAdminLocations()
		await mapWithConcurrency(pending, 6, async clientId => {
			const bookings: Array<{ id: string; at: number }> = []
			for (const location of locations) {
				const res: any = await boulevardAdminFetch(
					`query ClientAppointments($clientId: ID!, $locationId: ID!) {
						appointments(first: 100, clientId: $clientId, locationId: $locationId) {
							edges { node { id startAt createdAt state cancelled } }
						}
					}`,
					{ clientId, locationId: location.id },
				)
				for (const edge of res.appointments?.edges ?? []) {
					const node = edge?.node
					if (!node?.id || node.cancelled || node.state === 'NO_SHOW') continue
					bookings.push({
						id: normalizeBlvdEntityId('Appointment', node.id)!,
						at: new Date(node.createdAt ?? node.startAt).getTime(),
					})
				}
			}
			bookings.sort((a, b) => a.at - b.at)
			firstAppointmentByClient.set(clientId, bookings[0]?.id ?? null)
		})
	}
	return firstAppointmentByClient
}

/**
 * true = this booking is the client's first ever, false = they had booked
 * before, null = no client history to judge by. Obvious cases (their only
 * appointment / a client record far older than this booking) are settled
 * without a Boulevard round trip; the ambiguous ones are looked up exactly.
 */
async function resolveNewClientFlags(metas: BlvdAppointmentMeta[]) {
	const flags = new Map<string, boolean | null>()
	const ambiguous: BlvdAppointmentMeta[] = []
	for (const a of metas) {
		const bookedAt = (a.createdAt ?? a.startAt).getTime()
		if (!a.clientId) {
			flags.set(a.id, a.services.some(s => /new client/i.test(s.name)) || null)
		} else if (a.clientAppointmentCount != null && a.clientAppointmentCount <= 1) {
			flags.set(a.id, true)
		} else if (
			a.clientCreatedAt != null &&
			(a.clientAppointmentCount ?? 2) > 1 &&
			bookedAt - a.clientCreatedAt.getTime() > NEW_CLIENT_RECORD_AGE_MS
		) {
			flags.set(a.id, false)
		} else {
			ambiguous.push(a)
		}
	}
	if (ambiguous.length) {
		const firstIds = await getFirstAppointmentIdByClient(
			ambiguous.map(a => a.clientId!),
		)
		for (const a of ambiguous) {
			const first = firstIds.get(a.clientId!)
			flags.set(a.id, first === undefined ? null : first === a.id)
		}
	}
	return flags
}

/**
 * Appointments, chair time, and money per service category. Categories come
 * from the same name inference the revenue import uses, so booked time and
 * collected revenue land on one axis.
 *
 * An appointment is counted once, under its primary service (the longest one),
 * and its whole block of time goes there too, so the rows always add up to the
 * real appointment count and the real hours on the calendar.
 */
async function rollUpByServiceCategory(
	appointments: BlvdAppointmentMeta[],
	cells: RevenueChartCell[],
): Promise<ServiceCategoryRow[]> {
	// Same v4 valuation as the per-appointment table AND the weekly forecast:
	// each service is worth its revenue per KEPT visit, so the no-shows and $0
	// comp visits are already priced in and the three surfaces agree.
	const values = await valueAppointments(
		appointments.map(a => ({
			id: a.id,
			startAtMs: a.startAt.getTime(),
			clientId: a.clientId,
			clientAppointmentCount: a.clientAppointmentCount,
			clientCreatedAtMs: a.clientCreatedAt?.getTime() ?? null,
			services: a.services.map(s => ({ name: s.name })),
		})),
	)
	const rows = new Map<string, ServiceCategoryRow>()
	const rowFor = (cat: string) => {
		let row = rows.get(cat)
		if (!row) {
			row = { cat, appts: 0, minutes: 0, bookedUsd: 0, actualUsd: 0 }
			rows.set(cat, row)
		}
		return row
	}
	for (const a of appointments) {
		const primary = a.services.reduce<(typeof a.services)[number] | null>(
			(best, s) => (best == null || (s.minutes ?? 0) > (best.minutes ?? 0) ? s : best),
			null,
		)
		const row = rowFor(
			inferRevenueServiceCategory(primary?.name) ?? 'Uncategorized',
		)
		row.appts++
		row.minutes +=
			a.durationMinutes ??
			a.services.reduce((sum, s) => sum + (s.minutes ?? 0), 0)
		row.bookedUsd += values.get(a.id)?.usd ?? 0
	}
	for (const cell of cells) rowFor(cell.cat).actualUsd += cell.usd
	return [...rows.values()]
		.map(r => ({
			...r,
			bookedUsd: Math.round(r.bookedUsd),
			actualUsd: Math.round(r.actualUsd),
		}))
		.sort((a, b) => b.minutes - a.minutes || b.actualUsd - a.actualUsd)
}

export type TodayProgress = {
	/** 0-1 share of today's booked value whose appointments have already ended. */
	progress: number
	apptsDone: number
	apptsTotal: number
	/** Booked value of the finished appointments, and of the whole day. */
	doneUsd: number
	totalUsd: number
}

/**
 * How much of today has actually happened, measured in booked value rather
 * than clock time. Revenue lands at checkout, so an appointment only counts
 * once it has ENDED - a 3pm facial still on the table hasn't paid yet.
 * Falls back to elapsed business hours on a day with nothing booked.
 */
export async function loadTodayProgress(todayEt: string): Promise<TodayProgress> {
	const appointments = await getBlvdAppointmentsInRange(todayEt, todayEt).catch(
		error => {
			console.error('Failed to load today for progress', error)
			return [] as BlvdAppointmentMeta[]
		},
	)
	const values = await valueAppointments(
		appointments.map(a => ({
			id: a.id,
			startAtMs: a.startAt.getTime(),
			clientId: a.clientId,
			clientAppointmentCount: a.clientAppointmentCount,
			clientCreatedAtMs: a.clientCreatedAt?.getTime() ?? null,
			services: a.services.map(s => ({ name: s.name })),
		})),
	)
	const now = Date.now()
	let doneUsd = 0
	let totalUsd = 0
	let apptsDone = 0
	for (const a of appointments) {
		const usd = values.get(a.id)?.usd ?? 0
		const minutes =
			a.durationMinutes ??
			a.services.reduce((sum, s) => sum + (s.minutes ?? 0), 0)
		totalUsd += usd
		if (a.startAt.getTime() + minutes * 60_000 <= now) {
			doneUsd += usd
			apptsDone++
		}
	}
	if (totalUsd > 0) {
		return {
			progress: Math.min(1, doneUsd / totalUsd),
			apptsDone,
			apptsTotal: appointments.length,
			doneUsd: Math.round(doneUsd),
			totalUsd: Math.round(totalUsd),
		}
	}
	// Nothing booked (or nothing valued): fall back to the 9am-7pm business day.
	const openMs = etMidnightUtc(todayEt).getTime() + 9 * 3600_000
	const closeMs = etMidnightUtc(todayEt).getTime() + 19 * 3600_000
	const elapsed = (now - openMs) / (closeMs - openMs)
	return {
		progress: Math.min(1, Math.max(0, elapsed)),
		apptsDone,
		apptsTotal: appointments.length,
		doneUsd: 0,
		totalUsd: 0,
	}
}

export type ServiceCategoryRow = {
	cat: string
	/** Appointments on the calendar in the window, cancellations excluded. */
	appts: number
	/** Booked chair time in minutes. */
	minutes: number
	/** What those appointments are booked to be worth. */
	bookedUsd: number
	/** Money actually collected in the window, from closed orders. */
	actualUsd: number
}

export type RevenueChartCell = {
	/** ET day the revenue landed (YYYY-MM-DD). */
	day: string
	/** Service category (blvdRevenueItem.serviceCategory, 'Uncategorized' if blank). */
	cat: string
	/** Aggregated source label from getAggregatedSource. */
	source: string
	channel: BookingChannel
	usd: number
	/** Distinct appointments, each counted once in the cell where it earned the most. */
	appts: number
}

/**
 * Actual revenue for the window as per-day cells keyed by service category,
 * aggregated source, and channel. The main Revenue chart re-buckets these
 * client-side by granularity and applies the service/channel filters.
 */
export async function loadRevenueChartCells(win: ReportWindow): Promise<{
	cells: RevenueChartCell[]
	categories: string[]
	byCategory: ServiceCategoryRow[]
	/** First day the appointment rollup covers, later than the window start
	 * when the 120-day metadata cap bites. */
	apptCoverageFromDay: string
	lastSyncedAt: string | null
}> {
	const { fromDay, toDay, todayEt, since, until } = win
	// Booked-by metadata is capped at 120 days back, older revenue keeps the
	// generic untracked label rather than paginating years of appointments.
	const metaFromDay =
		fromDay > shiftDay(todayEt, -120) ? fromDay : shiftDay(todayEt, -120)
	const [items, syncState, rangeAppointments] = await Promise.all([
		prisma.blvdRevenueItem.findMany({
			where: { occurredAt: { gte: since, lt: until } },
			select: {
				occurredAt: true,
				serviceCategory: true,
				grossAmountUsd: true,
				boulevardAppointmentId: true,
				attributionTouchId: true,
			},
		}),
		prisma.blvdSyncState.findUnique({
			where: { key: 'blvd_revenue_import_last_sync_at' },
			select: { value: true },
		}),
		getBlvdAppointmentsInRange(metaFromDay, toDay).catch(error => {
			console.error('Failed to load Boulevard appointment metadata', error)
			return [] as BlvdAppointmentMeta[]
		}),
	])
	const touchIds = [
		...new Set(items.map(i => i.attributionTouchId).filter(Boolean)),
	] as string[]
	const touches = touchIds.length
		? await prisma.blvdAttributionTouch.findMany({
				where: { id: { in: touchIds } },
				select: {
					id: true,
					trafficChannel: true,
					utmContent: true,
					rawProperties: true,
					callrailSource: true,
				},
			})
		: []
	const touchById = new Map(touches.map(t => [t.id, t]))
	const bookedByTypeByAppt = new Map(
		rangeAppointments.map(a => [a.id, a.bookedByType]),
	)

	const cellByKey = new Map<string, RevenueChartCell>()
	// usd per (appointment, cell) so each appointment can be counted exactly
	// once, in the cell where it earned the most.
	const apptUsdByCell = new Map<string, Map<string, number>>()
	for (const item of items) {
		const touch = item.attributionTouchId
			? touchById.get(item.attributionTouchId)
			: undefined
		const { label, channel } = getAggregatedSource(
			touch,
			item.boulevardAppointmentId
				? bookedByTypeByAppt.get(item.boulevardAppointmentId)
				: undefined,
		)
		const day = toEtDay(item.occurredAt)
		const cat = item.serviceCategory?.trim() || 'Uncategorized'
		const key = `${day}|${cat}|${label}|${channel}`
		let cell = cellByKey.get(key)
		if (!cell) {
			cell = { day, cat, source: label, channel, usd: 0, appts: 0 }
			cellByKey.set(key, cell)
		}
		cell.usd += item.grossAmountUsd
		if (item.boulevardAppointmentId) {
			let perCell = apptUsdByCell.get(item.boulevardAppointmentId)
			if (!perCell) apptUsdByCell.set(item.boulevardAppointmentId, (perCell = new Map()))
			perCell.set(key, (perCell.get(key) ?? 0) + item.grossAmountUsd)
		}
	}
	for (const perCell of apptUsdByCell.values()) {
		let bestKey: string | null = null
		let bestUsd = -Infinity
		for (const [key, usdValue] of perCell) {
			if (usdValue > bestUsd) {
				bestKey = key
				bestUsd = usdValue
			}
		}
		if (bestKey) cellByKey.get(bestKey)!.appts++
	}
	const cells = [...cellByKey.values()].map(c => ({ ...c, usd: Math.round(c.usd) }))
	const byCategory = await rollUpByServiceCategory(rangeAppointments, cells)
	return {
		cells,
		categories: [
			...new Set([...cells.map(c => c.cat), ...byCategory.map(r => r.cat)]),
		].sort(),
		byCategory,
		apptCoverageFromDay: metaFromDay,
		lastSyncedAt: syncState?.value ?? null,
	}
}

export type FunnelRow = {
	bookedAt: string
	apptAt: string | null
	bucket: string
	service: string
	location: string | null
	source: string
	expectedUsd: number
	clientName: string | null
	blvdUrl: string | null
	posthogUrl: string | null
	/** true = the client's first-ever booking, false = they had booked before,
	 * null = no client history to judge by */
	newClient: boolean | null
}

/**
 * Bookings funnel: every booking MADE in the window, keyed by booking time.
 * Tracked bookings come from attribution touches (real time); staff/other
 * bookings from Boulevard appointments created in the window, deduped against
 * the touches so nothing counts twice.
 */
export async function loadBookingFunnel(request: Request) {
	const w = parseReportWindow(request)
	const { windowKey, granularity, fromDay, toDay, since, until } = w

	const [touches, createdAppointments, adsSpendUsd] = await Promise.all([
		prisma.blvdAttributionTouch.findMany({
			where: { occurredAt: { gte: since, lt: until } },
			select: {
				occurredAt: true,
				bookingCartId: true,
				bookingServiceName: true,
				bookingLocationName: true,
				bookingValueUsd: true,
				trafficChannel: true,
				utmContent: true,
				rawProperties: true,
				callrailSource: true,
				posthogSessionId: true,
				posthogDistinctId: true,
				blvdClient: {
					select: { boulevardClientId: true, firstName: true, lastName: true },
				},
				appointments: {
					select: { boulevardAppointmentId: true, startTime: true },
					orderBy: { startTime: 'asc' },
				},
			},
		}),
		getBlvdAppointmentsCreatedInRange(since, until).catch(error => {
			console.error('Failed to load created appointments', error)
			return [] as BlvdAppointmentMeta[]
		}),
		getGoogleAdsSpendUsd(fromDay, toDay),
	])

	// Appointments already represented by a touch (any touch, any window).
	const touched = await prisma.blvdAttributedAppointment.findMany({
		where: {
			boulevardAppointmentId: { in: createdAppointments.map(a => a.id) },
		},
		select: { boulevardAppointmentId: true },
	})
	const touchedIds = new Set(touched.map(t => t.boulevardAppointmentId))
	// The web booking flow records new vs returning on the intent, keyed by cart.
	const cartIds = touches.map(t => t.bookingCartId).filter((v): v is string => Boolean(v))
	const intents = cartIds.length
		? await prisma.blvdBookingIntent.findMany({
				where: { bookingCartId: { in: cartIds } },
				select: {
					bookingCartId: true,
					bookingClientType: true,
					bookingClientHistorySelection: true,
				},
			})
		: []
	// The stored SELF-selection is authoritative: bookingClientType was
	// corrupted for weeks by SMS-verification overriding explicit "I'm new".
	const clientTypeByCart = new Map(
		intents.map(i => [
			i.bookingCartId,
			i.bookingClientHistorySelection === 'new'
				? 'new_client'
				: i.bookingClientHistorySelection === 'returning'
					? 'returning_client'
					: i.bookingClientType,
		]),
	)
	const untracked = createdAppointments.filter(a => !touchedIds.has(a.id))
	// Every booking in the window, tracked or not, judged against the same
	// Boulevard history so a client counts as new on one booking only.
	const [avgByName, newClientFlags] = await Promise.all([
		getAvgTicketByName([
			...new Set(untracked.flatMap(a => a.services.filter(s => !s.price).map(s => s.name))),
		]),
		resolveNewClientFlags(createdAppointments),
	])

	const rows: FunnelRow[] = [
		...touches.map(t => ({
			bookedAt: t.occurredAt.toISOString(),
			apptAt: t.appointments[0]?.startTime?.toISOString() ?? null,
			bucket: bucketFor(t.occurredAt, granularity),
			service: t.bookingServiceName ?? 'Unknown service',
			location: t.bookingLocationName,
			source: getSourceLabel(t),
			expectedUsd: t.bookingValueUsd ?? 0,
			clientName:
				[t.blvdClient?.firstName, t.blvdClient?.lastName].filter(Boolean).join(' ') ||
				null,
			blvdUrl: blvdClientUrl(t.blvdClient?.boulevardClientId),
			posthogUrl: posthogSessionUrl(t),
			// Boulevard history first; what the client told the booking form
			// about themselves only fills in when the appointment isn't linked
			// yet (the sync runs a few minutes behind).
			newClient:
				newClientFlags.get(t.appointments[0]?.boulevardAppointmentId ?? '') ??
				(clientTypeByCart.get(t.bookingCartId ?? '') === 'new_client'
					? true
					: clientTypeByCart.get(t.bookingCartId ?? '') === 'returning_client'
						? false
						: null),
		})),
		...untracked.map(a => {
			const isNew = newClientFlags.get(a.id) ?? null
			return {
			bookedAt: (a.createdAt ?? a.startAt).toISOString(),
			apptAt: a.startAt.toISOString(),
			bucket: bucketFor(a.createdAt ?? a.startAt, granularity),
			service: a.services.map(s => s.name).join('; ') || 'Unknown service',
			location: a.locationName,
			source: getUnattributedLabel(a.bookedByType, isNew),
			expectedUsd: a.services.reduce(
				(sum, s) => sum + (s.price ? s.price / 100 : Math.round(avgByName.get(s.name) ?? 0)),
				0,
			),
			clientName: a.clientName,
			blvdUrl: a.manageUrl ?? blvdClientUrl(a.clientId),
			posthogUrl: null,
			newClient: isNew,
		}
		}),
	].sort((a, b) => b.bookedAt.localeCompare(a.bookedAt))

	return { rows, windowKey, granularity, from: fromDay, to: toDay, adsSpendUsd }
}

export type BookingFunnelData = Awaited<ReturnType<typeof loadBookingFunnel>>
