/**
 * Retention-over-time metrics computed from the BlvdAppointment mirror
 * (blvd-appointment-sync job): new-client cohort return rates, repeat rates
 * for anyone active in a month, and the returning share of each month's
 * visits. Rendered by the Retention report.
 *
 * Optionally filtered by service category (inferRevenueServiceCategory).
 * The filter picks WHICH clients/visits are examined; "came back" always
 * means a later visit of ANY kind, because retention is about keeping the
 * client, not re-selling the same service.
 *
 * Two rules keep the measure honest (Zane, 2026-08-03):
 *   - Visits whose services are all "follow-up" (the free tox/filler
 *     touch-up) are ignored everywhere: coming in for the included check on
 *     last month's Botox is the same treatment, not retention.
 *   - The return window adapts to the service: a Botox client on a normal
 *     3-4 month cycle is NOT lost at day 91. Filtered views use
 *     1.25 × the service's 75th-percentile real rebook gap (clamped 60-180d);
 *     the all-services view keeps a fixed 90d yardstick.
 */
import { hasBlvdAppointmentMirror } from '#app/utils/blvd-appointment-sync.server.ts'
import { inferRevenueServiceCategory } from '#app/utils/blvd-revenue-sync.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { toEtDay } from '#app/utils/revenue-by-source.server.ts'

const DEFAULT_WINDOW_DAYS = 90
const WINDOW_CLAMP: [number, number] = [60, 180]
/** Below this many observed rebook gaps a category keeps the default window. */
const MIN_GAPS_FOR_WINDOW = 12
/** Recorded history starts ~Jun 2024 (Jane import). The first months would
 * call every long-standing client "new", so trend charts start after a
 * two-month buffer. */
const TREND_START_MONTH = '2024-08'
const UNCATEGORIZED = 'Uncategorized'
const FOLLOW_UP_RE = /follow[\s-]?up/i

export type RetentionOverTime = {
	/** The return window in effect for this view, and where it came from
	 * (surfaced because the client bundle cannot import this module). */
	windowDays: number
	windowNote: string
	/** Applied service filter (null = all) and the choices present in data. */
	service: string | null
	serviceOptions: string[]
	/** New-client cohorts by first-visit month, mature (window elapsed) only. */
	cohorts: Array<{ month: string; n: number; returnedPct: number }>
	/** Of clients seen in a month, % seen again within the window after their
	 * last visit that month. Mature months only. */
	actives: Array<{ month: string; n: number; repeatPct: number }>
	/** Share of each month's kept visits made by clients with prior history. */
	returningShare: Array<{ month: string; visits: number; pct: number }>
	medianDaysToSecond: number | null
	latestCohort: { month: string; pct: number; n: number } | null
	/** Mean of the last 3 mature cohorts vs the 3 before, percentage points. */
	last3AvgPct: number | null
	prev3AvgPct: number | null
	lastFullMonthShare: { month: string; pct: number } | null
}

type VisitDay = { day: string; cats: Set<string> }

const dayDiff = (a: string, b: string) =>
	Math.round((Date.parse(b) - Date.parse(a)) / (24 * 3600 * 1000))

export async function computeRetentionOverTime(
	serviceParam?: string | null,
): Promise<RetentionOverTime | null> {
	if (!(await hasBlvdAppointmentMirror())) return null
	const now = new Date()
	const today = toEtDay(now)
	const rows = await prisma.blvdAppointment.findMany({
		where: {
			cancelled: false,
			NOT: { state: 'NO_SHOW' },
			clientId: { not: null },
			startAt: { lte: now },
		},
		select: { clientId: true, startAt: true, services: true },
	})

	// Visit-days per client (several services one day = one visit), each
	// carrying the union of its services' categories. Days consisting only of
	// follow-up services are dropped entirely: the free touch-up on last
	// month's tox is the same treatment episode, not a return.
	const raw = new Map<
		string,
		Map<string, { cats: Set<string>; followOnly: boolean }>
	>()
	const allCats = new Set<string>()
	for (const r of rows) {
		const day = toEtDay(r.startAt)
		let svcs: Array<{ name?: string | null }> = []
		try {
			svcs = JSON.parse(r.services) as typeof svcs
		} catch {
			svcs = []
		}
		const followOnly =
			svcs.length > 0 && svcs.every(s => FOLLOW_UP_RE.test(s.name ?? ''))
		const byDay = raw.get(r.clientId!) ?? new Map()
		const cur = byDay.get(day) ?? { cats: new Set<string>(), followOnly: true }
		cur.followOnly = cur.followOnly && followOnly
		for (const s of svcs) {
			if (FOLLOW_UP_RE.test(s.name ?? '')) continue
			cur.cats.add(inferRevenueServiceCategory(s.name) ?? UNCATEGORIZED)
		}
		byDay.set(day, cur)
		raw.set(r.clientId!, byDay)
	}
	const visitsByClient = new Map<string, VisitDay[]>()
	for (const [clientId, byDay] of raw) {
		const list = [...byDay.entries()]
			.filter(([, v]) => !v.followOnly)
			.map(([day, v]) => ({ day, cats: v.cats }))
			.sort((a, b) => a.day.localeCompare(b.day))
		if (list.length) visitsByClient.set(clientId, list)
		for (const v of list) for (const c of v.cats) allCats.add(c)
	}

	const serviceOptions = [...allCats].sort((a, b) =>
		a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b),
	)
	const service =
		serviceParam && serviceOptions.includes(serviceParam) ? serviceParam : null
	const matches = (v: VisitDay) => service == null || v.cats.has(service)

	// Per-category window: 1.25 × p75 of first→second real-visit gaps.
	let windowDays = DEFAULT_WINDOW_DAYS
	let windowNote = `fixed ${DEFAULT_WINDOW_DAYS}d yardstick across all services`
	if (service) {
		const gaps: number[] = []
		for (const list of visitsByClient.values()) {
			const first = list[0]!
			if (!first.cats.has(service)) continue
			const second = list[1]
			if (!second) continue
			const gap = dayDiff(first.day, second.day)
			if (gap <= 365) gaps.push(gap)
		}
		if (gaps.length >= MIN_GAPS_FOR_WINDOW) {
			gaps.sort((a, b) => a - b)
			const p75 = gaps[Math.floor(gaps.length * 0.75)]!
			windowDays = Math.min(
				WINDOW_CLAMP[1],
				Math.max(WINDOW_CLAMP[0], Math.round((p75 * 1.25) / 15) * 15),
			)
			windowNote = `1.25 × the ${p75}d 75th-percentile rebook gap for ${service}, so a normal-cadence client fits inside it`
		} else {
			windowNote = `only ${gaps.length} rebook gaps observed for ${service}, keeping the ${DEFAULT_WINDOW_DAYS}d default`
		}
	}

	const addDays = (day: string, n: number) => {
		const d = new Date(`${day}T12:00:00Z`)
		d.setUTCDate(d.getUTCDate() + n)
		return d.toISOString().slice(0, 10)
	}
	const monthEnd = (month: string) => {
		const d = new Date(`${month}-01T12:00:00Z`)
		d.setUTCMonth(d.getUTCMonth() + 1)
		d.setUTCDate(0)
		return d.toISOString().slice(0, 10)
	}
	const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0)

	// --- new-client cohorts (second real visit within the window). With a
	// service filter, the cohort is clients whose FIRST visit included it.
	const cohortAgg = new Map<string, { n: number; returned: number }>()
	const gapsToSecond: number[] = []
	for (const list of visitsByClient.values()) {
		const first = list[0]!
		if (!matches(first)) continue
		const month = first.day.slice(0, 7)
		if (month < TREND_START_MONTH) continue
		const second = list[1]
		const returned =
			second != null && second.day <= addDays(first.day, windowDays)
		const cell = cohortAgg.get(month) ?? { n: 0, returned: 0 }
		cell.n++
		if (returned) cell.returned++
		cohortAgg.set(month, cell)
		if (returned) gapsToSecond.push(dayDiff(first.day, second!.day))
	}
	const cohorts = [...cohortAgg.entries()]
		.filter(([month]) => addDays(monthEnd(month), windowDays) <= today)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, c]) => ({
			month,
			n: c.n,
			returnedPct: pct(c.returned, c.n),
		}))

	// --- active clients per month (with a filter: clients who had a matching
	// visit that month), repeat within the window after their last one.
	const activeAgg = new Map<string, { n: number; repeat: number }>()
	for (const list of visitsByClient.values()) {
		const byMonth = new Map<string, string>()
		for (const v of list) {
			if (!matches(v)) continue
			byMonth.set(v.day.slice(0, 7), v.day) // ends as last matching day
		}
		for (const [month, lastInMonth] of byMonth) {
			if (month < TREND_START_MONTH) continue
			if (addDays(monthEnd(month), windowDays) > today) continue
			const cutoff = addDays(lastInMonth, windowDays)
			const repeat = list.some(v => v.day > lastInMonth && v.day <= cutoff)
			const cell = activeAgg.get(month) ?? { n: 0, repeat: 0 }
			cell.n++
			if (repeat) cell.repeat++
			activeAgg.set(month, cell)
		}
	}
	const actives = [...activeAgg.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, c]) => ({ month, n: c.n, repeatPct: pct(c.repeat, c.n) }))

	// --- returning share of (matching) visits per month
	const shareAgg = new Map<string, { visits: number; returning: number }>()
	for (const list of visitsByClient.values()) {
		list.forEach((v, i) => {
			if (!matches(v)) return
			const month = v.day.slice(0, 7)
			if (month < TREND_START_MONTH) return
			const cell = shareAgg.get(month) ?? { visits: 0, returning: 0 }
			cell.visits++
			if (i > 0) cell.returning++
			shareAgg.set(month, cell)
		})
	}
	const returningShare = [...shareAgg.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, c]) => ({
			month,
			visits: c.visits,
			pct: pct(c.returning, c.visits),
		}))

	const sortedGaps = gapsToSecond.sort((a, b) => a - b)
	const medianDaysToSecond = sortedGaps.length
		? sortedGaps[Math.floor(sortedGaps.length / 2)]!
		: null
	const latest = cohorts.at(-1)
	const last3 = cohorts.slice(-3)
	const prev3 = cohorts.slice(-6, -3)
	const avg = (xs: Array<{ returnedPct: number }>) =>
		xs.length ? xs.reduce((s, x) => s + x.returnedPct, 0) / xs.length : null
	const curMonth = today.slice(0, 7)
	const lastFull = [...returningShare].reverse().find(r => r.month < curMonth)
	return {
		windowDays,
		windowNote,
		service,
		serviceOptions,
		cohorts,
		actives,
		returningShare,
		medianDaysToSecond,
		latestCohort: latest
			? { month: latest.month, pct: latest.returnedPct, n: latest.n }
			: null,
		last3AvgPct: avg(last3),
		prev3AvgPct: avg(prev3),
		lastFullMonthShare: lastFull
			? { month: lastFull.month, pct: lastFull.pct }
			: null,
	}
}
