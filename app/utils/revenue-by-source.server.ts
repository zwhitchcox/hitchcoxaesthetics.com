/**
 * Server half of the revenue-by-source view (rendered on the Revenue report)
 * and the bookings funnel: window parsing, Boulevard appointment fetches,
 * source labeling, and the row builders. Revenue rows are keyed by when money
 * happened (appointment/checkout date); funnel rows are keyed by when the
 * BOOKING was made.
 */
import { normalizeBlvdEntityId } from '#app/utils/blvd-attribution.server.ts'
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { inferRevenueServiceCategory } from '#app/utils/blvd-revenue-sync.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getGoogleAdsSpendUsd } from '#app/utils/google-ads-spend.server.ts'
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
}) {
	if (!touch) return 'Untracked (phone / walk-in)'
	// utm_content on GBP website links names the specific listing
	// (bearden / farragut / botox-knox-bearden / kwlc-farragut / ...).
	if (touch.trafficChannel === 'gmb') {
		return touch.utmContent
			? `GBP · ${touch.utmContent}`
			: 'Google Business Profile'
	}
	return CHANNEL_LABELS[touch.trafficChannel ?? ''] ?? 'Website (other)'
}

/** Source label for an appointment with no attribution touch. */
export function getUnattributedLabel(bookedByType?: string | null) {
	if (bookedByType === 'STAFF') return 'Rebook (staff-booked)'
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
		toDay = todayEt
		fromDay =
			windowKey === 'all'
				? '2024-01-01'
				: shiftDay(todayEt, -(WINDOWS[windowKey].days - 1))
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

export type ReportRow = {
	month: string
	bucket: string
	type: string
	usd: number
	appt: string | null
	source: string
	kind: 'actual' | 'projected'
	// Drill-down fields (the "Appointments — <x>" detail view)
	at: string
	service: string
	clientName: string | null
	blvdUrl: string | null
	posthogUrl: string | null
}

export type BlvdAppointmentMeta = {
	id: string
	startAt: Date
	createdAt: Date | null
	bookedByType: string | null
	clientId: string | null
	clientName: string | null
	locationName: string | null
	manageUrl: string | null
	services: Array<{ price: number | null; name: string }>
}

const APPOINTMENT_FIELDS = `id startAt createdAt state cancelled bookedByType manageUrl
	location { name } client { id name }
	appointmentServices { price service { name } }`

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
		locationName: node.location?.name ?? null,
		manageUrl: node.manageUrl ?? null,
		services: (node.appointmentServices ?? []).map((s: any) => ({
			price: s.price ?? null,
			name: s.service?.name ?? 'Unknown service',
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
 * Appointments whose START is in the window — booked-by labels + projecting
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

/** Recent average paid ticket per service name — values $0-at-booking services. */
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
 * Projected rows for appointments that are booked (not cancelled / no-show)
 * but whose order hasn't closed yet — today shows the day's expected numbers
 * immediately; each is replaced by the actual as it's paid.
 */
async function getProjectedRows({
	appointments,
	fromDay,
	toDay,
	todayEt,
	granularity,
	paidApptIds,
}: {
	appointments: BlvdAppointmentMeta[]
	fromDay: string
	toDay: string
	todayEt: string
	granularity: Granularity
	paidApptIds: Set<string>
}): Promise<ReportRow[]> {
	const startDay = fromDay > todayEt ? fromDay : todayEt
	if (toDay < startDay) return []
	const pending = appointments.filter(a => {
		const day = toEtDay(a.startAt)
		return day >= startDay && day <= toDay && !paidApptIds.has(a.id)
	})
	if (!pending.length) return []

	const avgByName = await getAvgTicketByName([
		...new Set(pending.flatMap(p => p.services.filter(s => !s.price).map(s => s.name))),
	])
	const touchByAppt = await getTouchesByAppointment(pending.map(p => p.id))

	const rows: ReportRow[] = []
	for (const p of pending) {
		const touch = touchByAppt.get(p.id)
		const source = touch ? getSourceLabel(touch) : getUnattributedLabel(p.bookedByType)
		for (const s of p.services) {
			const usdValue = s.price ? s.price / 100 : Math.round(avgByName.get(s.name) ?? 0)
			rows.push({
				month: toEtDay(p.startAt).slice(0, 7),
				bucket: bucketFor(p.startAt, granularity),
				type: inferRevenueServiceCategory(s.name) ?? 'Uncategorized',
				usd: usdValue,
				appt: p.id,
				source,
				kind: 'projected',
				at: p.startAt.toISOString(),
				service: s.name,
				clientName: p.clientName,
				blvdUrl: p.manageUrl ?? blvdClientUrl(p.clientId),
				posthogUrl: posthogSessionUrl(touch ?? undefined),
			})
		}
	}
	return rows
}

async function getTouchesByAppointment(apptIds: string[]) {
	if (!apptIds.length) {
		return new Map<
			string,
			{
				trafficChannel: string | null
				utmContent: string | null
				posthogSessionId: string | null
				posthogDistinctId: string | null
			}
		>()
	}
	const attributed = await prisma.blvdAttributedAppointment.findMany({
		where: { boulevardAppointmentId: { in: apptIds } },
		select: {
			boulevardAppointmentId: true,
			touch: {
				select: {
					trafficChannel: true,
					utmContent: true,
					posthogSessionId: true,
					posthogDistinctId: true,
				},
			},
		},
	})
	return new Map(attributed.map(a => [a.boulevardAppointmentId, a.touch]))
}

/** Everything the revenue-by-source view renders, for the given URL params. */
export async function loadRevenueBySource(request: Request) {
	const w = parseReportWindow(request)
	const { windowKey, granularity, fromDay, toDay, todayEt, since, until } = w

	// Booked-by metadata is capped at 120 days back — older revenue keeps the
	// generic untracked label rather than paginating years of appointments.
	const metaFromDay =
		fromDay > shiftDay(todayEt, -120) ? fromDay : shiftDay(todayEt, -120)
	const [items, syncState, rangeAppointments, adsSpendUsd] = await Promise.all([
		prisma.blvdRevenueItem.findMany({
			where: { occurredAt: { gte: since, lt: until } },
			select: {
				occurredAt: true,
				serviceCategory: true,
				grossAmountUsd: true,
				boulevardAppointmentId: true,
				boulevardClientId: true,
				attributionTouchId: true,
				itemName: true,
				blvdClient: { select: { firstName: true, lastName: true } },
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
		getGoogleAdsSpendUsd(fromDay, toDay),
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
					posthogSessionId: true,
					posthogDistinctId: true,
				},
			})
		: []
	const touchById = new Map(touches.map(t => [t.id, t]))
	const apptMetaById = new Map(rangeAppointments.map(a => [a.id, a]))

	const actualRows: ReportRow[] = items.map(i => {
		const touch = i.attributionTouchId ? touchById.get(i.attributionTouchId) : undefined
		const meta = i.boulevardAppointmentId
			? apptMetaById.get(i.boulevardAppointmentId)
			: undefined
		return {
			month: toEtDay(i.occurredAt).slice(0, 7),
			bucket: bucketFor(i.occurredAt, granularity),
			type: i.serviceCategory?.trim() || 'Uncategorized',
			usd: i.grossAmountUsd,
			appt: i.boulevardAppointmentId,
			source: touch ? getSourceLabel(touch) : getUnattributedLabel(meta?.bookedByType),
			kind: 'actual',
			at: i.occurredAt.toISOString(),
			service: i.itemName,
			clientName:
				meta?.clientName ??
				([i.blvdClient?.firstName, i.blvdClient?.lastName].filter(Boolean).join(' ') ||
					null),
			blvdUrl: meta?.manageUrl ?? blvdClientUrl(i.boulevardClientId),
			posthogUrl: posthogSessionUrl(touch),
		}
	})
	const paidApptIds = new Set(
		items.map(i => i.boulevardAppointmentId).filter(Boolean) as string[],
	)
	const projectedRows = await getProjectedRows({
		appointments: rangeAppointments,
		fromDay,
		toDay,
		todayEt,
		granularity,
		paidApptIds,
	}).catch(error => {
		console.error('Failed to load projected appointments', error)
		return [] as ReportRow[]
	})
	const rows = [...actualRows, ...projectedRows]

	return {
		rows,
		windowKey,
		granularity,
		from: fromDay,
		to: toDay,
		drillType: new URL(request.url).searchParams.get('type'),
		lastSyncedAt: syncState?.value ?? null,
		adsSpendUsd,
	}
}

export type RevenueBySourceData = Awaited<ReturnType<typeof loadRevenueBySource>>

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
				bookingServiceName: true,
				bookingLocationName: true,
				bookingValueUsd: true,
				trafficChannel: true,
				utmContent: true,
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
	const untracked = createdAppointments.filter(a => !touchedIds.has(a.id))
	const avgByName = await getAvgTicketByName([
		...new Set(untracked.flatMap(a => a.services.filter(s => !s.price).map(s => s.name))),
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
		})),
		...untracked.map(a => ({
			bookedAt: (a.createdAt ?? a.startAt).toISOString(),
			apptAt: a.startAt.toISOString(),
			bucket: bucketFor(a.createdAt ?? a.startAt, granularity),
			service: a.services.map(s => s.name).join('; ') || 'Unknown service',
			location: a.locationName,
			source: getUnattributedLabel(a.bookedByType),
			expectedUsd: a.services.reduce(
				(sum, s) => sum + (s.price ? s.price / 100 : Math.round(avgByName.get(s.name) ?? 0)),
				0,
			),
			clientName: a.clientName,
			blvdUrl: a.manageUrl ?? blvdClientUrl(a.clientId),
			posthogUrl: null,
		})),
	].sort((a, b) => b.bookedAt.localeCompare(a.bookedAt))

	return { rows, windowKey, granularity, from: fromDay, to: toDay, adsSpendUsd }
}

export type BookingFunnelData = Awaited<ReturnType<typeof loadBookingFunnel>>
