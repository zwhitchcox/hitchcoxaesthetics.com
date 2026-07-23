/**
 * Revenue, the single business money report: one configurable bar chart
 * (expected vs actual vs cancelled vs expenses vs ad spend, in dollars or
 * appointment counts, total or stacked by source), projection accuracy, and
 * the per-appointment performance table. Chart controls live in the URL so a
 * reload keeps the exact view.
 */
import { useEffect, useState } from 'react'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	useFetcher,
	useLoaderData,
	useSearchParams,
	type ShouldRevalidateFunctionArgs,
} from '@remix-run/react'
import { type loader as appointmentsLoader } from './reports_.appointments.tsx'
import {
	BarChart,
	ReportPage,
	SERIES,
	StatTile,
	usd,
	useSortable,
} from '#app/components/report-ui'
import { ET_STAMP, WindowControls } from '#app/components/revenue-by-source.tsx'
import { syncBoulevardRealRevenue } from '#app/utils/blvd-revenue-sync.server.ts'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import { getGoogleAdsSpendByDay } from '#app/utils/google-ads-spend.server.ts'
import {
	etMidnightUtc,
	loadRevenueChartCells,
	parseReportWindow,
	shiftDay,
	type RevenueChartCell,
} from '#app/utils/revenue-by-source.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

async function tryQuery<T extends Record<string, any>>(sql: string): Promise<T[] | null> {
	try {
		return await reportsQuery<T>(sql)
	} catch {
		return null
	}
}

const REPORT_TIME_ZONE = 'America/New_York'

function toEtDay(date: Date) {
	return date.toLocaleDateString('en-CA', { timeZone: REPORT_TIME_ZONE })
}

/** Mon..Sun of the current week as YYYY-MM-DD strings, in business time. */
function getCurrentWeekDays() {
	const today = toEtDay(new Date())
	const anchor = new Date(`${today}T12:00:00Z`)
	const dow = (anchor.getUTCDay() + 6) % 7
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(anchor)
		d.setUTCDate(anchor.getUTCDate() - dow + i)
		return d.toISOString().slice(0, 10)
	})
}

/** Actual Boulevard revenue per ET day (past days + today only; future null). */
async function getActualRevenueByDays(days: string[], since: Date, until: Date) {
	const today = toEtDay(new Date())
	const items = await prisma.blvdRevenueItem.findMany({
		where: { occurredAt: { gte: since, lt: until } },
		select: { occurredAt: true, grossAmountUsd: true },
	})
	const byDay = new Map<string, number>()
	for (const item of items) {
		const day = toEtDay(item.occurredAt)
		byDay.set(day, (byDay.get(day) ?? 0) + item.grossAmountUsd)
	}
	return days.map(day => (day <= today ? Math.round(byDay.get(day) ?? 0) : null))
}

const MAX_RANGE_DAYS = 400
/** Days of the window, most recent MAX_RANGE_DAYS kept when the range is huge. */
function enumerateDays(fromDay: string, toDay: string): string[] {
	const days: string[] = []
	let cursor = fromDay
	const floor = shiftDay(toDay, -(MAX_RANGE_DAYS - 1))
	if (cursor < floor) cursor = floor
	while (cursor <= toDay && days.length < MAX_RANGE_DAYS) {
		days.push(cursor)
		cursor = shiftDay(cursor, 1)
	}
	return days
}

/**
 * Cancelled/no-show value and count per ET day across the window, from the
 * append-only appointment ledger (the single source of truth: it sees
 * cancellations even when Boulevard deletes the appointment outright). One
 * SQL query regardless of window size, so no page cap applies.
 */
async function getLostByDays(days: string[]) {
	if (days.length === 0) return null
	return reportsQuery<{ day: string; lost: string; n: string }>(
		`SELECT to_char(start_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
			round(sum(expected_usd)) AS lost, count(*) AS n
		 FROM (
			 SELECT DISTINCT ON (appointment_id) appointment_id, start_at, expected_usd
			 FROM appointment_change_log
			 WHERE kind IN ('cancelled', 'no_show', 'removed')
			 ORDER BY appointment_id, detected_at DESC) events
		 WHERE (start_at AT TIME ZONE 'America/New_York')::date
			 BETWEEN $1::date AND $2::date
		 GROUP BY 1`,
		[days[0], days.at(-1)],
	)
		.then(rows => {
			const byDay = new Map(
				rows.map(r => [r.day, { usd: Number(r.lost), n: Number(r.n) }]),
			)
			const today = toEtDay(new Date())
			return days.map(day =>
				day > today ? null : (byDay.get(day) ?? { usd: 0, n: 0 }),
			)
		})
		.catch(() => null)
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })

	const win = parseReportWindow(request, 'thisWeek')
	const rangeDays = enumerateDays(win.fromDay, win.toDay)
	const weekDays = getCurrentWeekDays()
	const weekSince = etMidnightUtc(weekDays[0]!)
	const weekUntil = etMidnightUtc(shiftDay(weekDays[6]!, 1))
	const [
		lastWeekRow,
		thisWeekProj,
		accuracy,
		expensesRows,
		summary,
		thisWeekExpected,
		actualByDay,
		avgExp,
		rangeExpected,
		rangeLost,
		weekLost,
		chartCells,
		ads,
	] = await Promise.all([
		tryQuery<{ week: string; revenue: string }>(
			`SELECT to_char(week, 'YYYY-MM-DD') AS week, round(revenue) AS revenue
			 FROM weekly_revenue WHERE week < '${weekDays[0]}'::date
			 ORDER BY week DESC LIMIT 1`,
		),
		tryQuery<{ booked: string; net: string }>(
			`SELECT round(sum(booked_usd)) AS booked,
				round(sum(expected_usd) * (1 - (SELECT cancellation_rate FROM revenue_projection_summary WHERE id = 1))) AS net
			 FROM revenue_projection_daily
			 WHERE date_trunc('week', day) = date_trunc('week', now())`,
		),
		tryQuery<{
			week: string
			projected: string
			lo: string | null
			hi: string | null
			actual: string | null
			err_pct: string | null
		}>(
			`WITH snap AS (
				SELECT DISTINCT ON (week) week::date AS week,
					projected_revenue, projected_lo AS lo, projected_hi AS hi
				FROM revenue_projection
				WHERE computed_at < week
				ORDER BY week, computed_at DESC)
			 SELECT to_char(s.week, 'YYYY-MM-DD') AS week, s.projected_revenue AS projected,
				 s.lo, s.hi, round(w.revenue) AS actual,
				 CASE WHEN w.revenue > 0
					 THEN round(100 * (s.projected_revenue - w.revenue) / w.revenue, 1) END AS err_pct
			 FROM snap s LEFT JOIN weekly_revenue w ON w.week = s.week
			 ORDER BY s.week`,
		),
		tryQuery<{ month: string; expenses: string }>(
			`SELECT month, round(expenses) AS expenses FROM business_pnl_monthly ORDER BY month`,
		),
		tryQuery<{
			window_start: string
			window_end: string
			gross: string
			cancel_pct: string
			net: string
			generated_at: string
		}>(
			`SELECT to_char(window_start, 'Mon DD') AS window_start,
				to_char(window_end, 'Mon DD') AS window_end,
				round(gross_expected_usd) AS gross,
				round(cancellation_rate * 100, 1) AS cancel_pct,
				round(net_expected_usd) AS net,
				to_char(generated_at, 'Mon DD HH24:MI') AS generated_at
			 FROM revenue_projection_summary WHERE id = 1`,
		),
		tryQuery<{ day: string; expected: string }>(
			`SELECT to_char(day, 'YYYY-MM-DD') AS day,
				round(expected_usd * (1 - (SELECT cancellation_rate FROM revenue_projection_summary WHERE id = 1))) AS expected
			 FROM revenue_projection_daily
			 WHERE day >= '${weekDays[0]}'::date AND day <= '${weekDays[6]}'::date
			 ORDER BY day`,
		),
		getActualRevenueByDays(weekDays, weekSince, weekUntil).catch(() => null),
		// Trailing-6-month average expenses (months before the current one).
		tryQuery<{ avg: string }>(
			`SELECT round(avg(expenses)) AS avg FROM (
				SELECT expenses FROM business_pnl_monthly
				WHERE month < to_char(current_date, 'YYYY-MM')
				ORDER BY month DESC LIMIT 6) recent`,
		),
		// Expected is NET of cancellations: expected_usd is gross (booked + fill),
		// scaled by (1 - cancellation_rate) from the projection summary.
		tryQuery<{ day: string; expected: string; expected_appts: string | null }>(
			`SELECT to_char(day, 'YYYY-MM-DD') AS day,
				round(expected_usd * (1 - (SELECT cancellation_rate FROM revenue_projection_summary WHERE id = 1))) AS expected,
				booked_count + expected_new_count AS expected_appts
			 FROM revenue_projection_daily
			 WHERE day >= '${win.fromDay}'::date AND day <= '${win.toDay}'::date
			 ORDER BY day`,
		),
		getLostByDays(rangeDays),
		getLostByDays(weekDays),
		loadRevenueChartCells(win).catch(error => {
			console.error('Failed to load revenue chart cells', error)
			return {
				cells: [] as RevenueChartCell[],
				categories: [] as string[],
				lastSyncedAt: null as string | null,
			}
		}),
		getGoogleAdsSpendByDay(win.fromDay, win.toDay),
	])

	// Tiles stay pinned to the current week regardless of the chart window.
	const expectedByDay = new Map(
		(thisWeekExpected ?? []).map(r => [r.day, Number(r.expected)]),
	)
	const thisWeekDaily =
		thisWeekExpected?.length || actualByDay?.some(v => v != null)
			? weekDays.map((day, i) => ({
					day,
					expected: expectedByDay.get(day) ?? null,
					actual: actualByDay?.[i] ?? null,
					lost: weekLost?.[i]?.usd ?? null,
				}))
			: null

	return json({
		configured: true as const,
		currentMonday: weekDays[0]!,
		lastFullWeek: lastWeekRow?.[0] ?? null,
		thisWeekProj: thisWeekProj?.[0] ?? null,
		accuracy: accuracy?.slice(-12) ?? null,
		summary: summary?.[0] ?? null,
		thisWeekDaily,
		window: {
			windowKey: win.windowKey,
			granularity: win.granularity,
			fromDay: win.fromDay,
			toDay: win.toDay,
			todayEt: win.todayEt,
		},
		chart: {
			days: rangeDays,
			expected: (rangeExpected ?? []).map(r => ({
				day: r.day,
				usd: Number(r.expected),
				appts: Number(r.expected_appts ?? 0),
			})),
			cancelled: rangeLost,
			cells: chartCells.cells,
			categories: chartCells.categories,
			lastSyncedAt: chartCells.lastSyncedAt,
			expensesByMonth: Object.fromEntries(
				(expensesRows ?? []).map(r => [r.month, Number(r.expenses)]),
			) as Record<string, number>,
			avgMonthlyExpenses: avgExp?.[0]?.avg != null ? Number(avgExp[0].avg) : null,
			adsByDay: ads.byDay,
			adsError: ads.error,
		},
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	// The sync writes revenue rows, SQLite writes only happen on the primary.
	await ensurePrimary()
	const form = await request.formData()
	if (form.get('intent') === 'refresh') {
		const result = await syncBoulevardRealRevenue()
		return json({ ok: result.ok })
	}
	return json({ ok: false })
}

// Everything the chart controls change is client-side (the cells are already
// loaded), so navigations that only touch chart params skip the loader.
const LOADER_PARAMS = ['window', 'from', 'to', 'granularity']
const CHART_PARAMS = [
	'metric',
	'view',
	'service',
	'channel',
	'hide',
	'apptBucket',
	'apptStatus',
]

export function shouldRevalidate({
	currentUrl,
	nextUrl,
	formMethod,
	defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
	if (formMethod && formMethod !== 'GET') return defaultShouldRevalidate
	if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate
	const loaderParamsChanged = LOADER_PARAMS.some(
		p => currentUrl.searchParams.get(p) !== nextUrl.searchParams.get(p),
	)
	return loaderParamsChanged ? defaultShouldRevalidate : false
}

const SERIES_KEYS = ['expected', 'actual', 'cancelled', 'expenses', 'adspend'] as const
type SeriesKey = (typeof SERIES_KEYS)[number]
const AVG_DAYS_PER_MONTH = 30.4

function shiftDayStr(day: string, days: number): string {
	const d = new Date(`${day}T12:00:00Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

function mondayOfDay(day: string): string {
	const anchor = new Date(`${day}T12:00:00Z`)
	const dow = (anchor.getUTCDay() + 6) % 7
	return shiftDayStr(day, -dow)
}

/** [firstDay, lastDay] of the appointment-filter bucket, inclusive. */
function apptBucketRange(
	bucketStart: string,
	granularity: 'day' | 'week' | 'month',
): [string, string] {
	if (granularity === 'month') {
		const y = Number(bucketStart.slice(0, 4))
		const m = Number(bucketStart.slice(5, 7))
		const first = `${bucketStart.slice(0, 7)}-01`
		const nextFirst =
			m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
		return [first, shiftDayStr(nextFirst, -1)]
	}
	if (granularity === 'week') return [bucketStart, shiftDayStr(bucketStart, 6)]
	return [bucketStart, bucketStart]
}

export default function Revenue() {
	const data = useLoaderData<typeof loader>()
	const [searchParams, setSearchParams] = useSearchParams()
	// Hooks must run unconditionally: the fetchers live up here, ahead of the
	// not-configured early return.
	const refresher = useFetcher()
	const missesFetcher = useFetcher<typeof appointmentsLoader>()
	const [missesLoadedKey, setMissesLoadedKey] = useState<string | null>(null)
	const winForMisses = data.configured ? data.window : null
	const missesKey = winForMisses ? `${winForMisses.fromDay}|${winForMisses.toDay}` : ''
	const missesSpanDays = winForMisses
		? Math.round(
				(Date.parse(winForMisses.toDay) - Date.parse(winForMisses.fromDay)) / 86400_000,
			) + 1
		: 0
	const missesEnabled = missesSpanDays > 0 && missesSpanDays <= 35
	const [missesShown, setMissesShown] = useState(25)
	useEffect(() => {
		if (!missesEnabled || !winForMisses || missesLoadedKey === missesKey) return
		setMissesLoadedKey(missesKey)
		setMissesShown(25)
		missesFetcher.load(
			`/admin/reports/appointments?window=custom&from=${winForMisses.fromDay}&to=${winForMisses.toDay}`,
		)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [missesEnabled, missesKey, missesLoadedKey])
	const missesAll = missesFetcher.data?.rows ?? []

	// Chart controls, all persisted in the URL so a reload keeps the view.
	const metric = searchParams.get('metric') === 'appointments' ? 'appointments' : 'revenue'
	const view = searchParams.get('view') === 'by-source' ? 'by-source' : 'totals'
	const service = searchParams.get('service') ?? ''
	const channelParam = searchParams.get('channel')
	const channel = channelParam === 'phone' || channelParam === 'online' ? channelParam : 'all'
	const hidden = new Set(
		(searchParams.get('hide') ?? '').split(',').filter(Boolean),
	)
	const apptBucket = searchParams.get('apptBucket')
	const apptStatusParam = searchParams.get('apptStatus')
	const apptStatus =
		apptStatusParam === 'completed' || apptStatusParam === 'cancelled'
			? apptStatusParam
			: null
	const chartParamsActive = CHART_PARAMS.some(p => searchParams.get(p) != null)

	function setChartParam(name: string, value: string | null) {
		setSearchParams(
			prev => {
				const next = new URLSearchParams(prev)
				if (value == null || value === '') next.delete(name)
				else next.set(name, value)
				return next
			},
			{ preventScrollReset: true, replace: true },
		)
	}
	function toggleSeries(key: SeriesKey) {
		const next = new Set(hidden)
		if (next.has(key)) next.delete(key)
		else next.add(key)
		setChartParam('hide', next.size ? [...next].join(',') : null)
	}
	function resetChart() {
		setSearchParams(
			prev => {
				const next = new URLSearchParams(prev)
				for (const p of CHART_PARAMS) next.delete(p)
				return next
			},
			{ preventScrollReset: true, replace: true },
		)
	}

	const apptRange =
		apptBucket && apptStatus && winForMisses
			? apptBucketRange(apptBucket, winForMisses.granularity)
			: null
	const missesFiltered = apptRange
		? missesAll.filter(r => {
				const day = new Date(r.startAt).toLocaleDateString('en-CA', {
					timeZone: REPORT_TIME_ZONE,
				})
				if (day < apptRange[0] || day > apptRange[1]) return false
				const isLost = r.status === 'cancelled' || r.status === 'no_show'
				return apptStatus === 'cancelled' ? isLost : !isLost
			})
		: missesAll
	const { rows: missesSorted, Th: MTh } = useSortable(missesFiltered, {
		services: (r: (typeof missesAll)[number]) => r.services.join(' '),
	})

	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const {
		currentMonday,
		lastFullWeek,
		thisWeekProj,
		accuracy,
		summary,
		thisWeekDaily,
		window: win,
		chart,
	} = data
	const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
	const refreshing = refresher.state !== 'idle'

	// ---- Tiles (pinned to the current week) ----
	const weekToDate = thisWeekDaily
		? thisWeekDaily.reduce(
				(acc, d) => {
					if (d.actual == null) return acc
					return {
						actual: acc.actual + d.actual,
						expected: acc.expected + (d.expected ?? 0),
					}
				},
				{ actual: 0, expected: 0 },
			)
		: null
	// Re-projection: keep what actually happened, keep the forecast for what
	// hasn't. Today counts at whichever is higher (its partial actual may
	// already beat its forecast).
	const todayDay = thisWeekDaily?.filter(d => d.actual != null).at(-1)?.day ?? null
	const nowTracking = thisWeekDaily
		? Math.round(
				thisWeekDaily.reduce((sum, d) => {
					if (d.day === todayDay)
						return sum + Math.max(d.actual ?? 0, d.expected ?? 0)
					if (d.actual != null) return sum + d.actual
					return sum + (d.expected ?? 0)
				}, 0),
			)
		: null

	// ---- Chart data: bucket the window by the selected granularity ----
	const bucketKeyOfDay = (day: string) =>
		win.granularity === 'month'
			? day.slice(0, 7)
			: win.granularity === 'week'
				? mondayOfDay(day)
				: day
	const bucketKeys = [
		...new Set([...chart.days, ...chart.cells.map(c => c.day)].map(bucketKeyOfDay)),
	].sort()
	const bucketIndex = new Map(bucketKeys.map((k, i) => [k, i]))
	const bucketStartDay = (key: string) =>
		win.granularity === 'month' ? `${key}-01` : key
	const bucketLabel = (key: string) => {
		if (win.granularity === 'month') return key
		if (win.granularity === 'week') return `wk ${key.slice(5)}`
		if (bucketKeys.length <= 21) {
			const d = new Date(`${key}T12:00:00Z`)
			return `${WEEKDAY_NAMES[(d.getUTCDay() + 6) % 7]} ${key.slice(5)}`
		}
		return key.slice(5)
	}

	const serviceFiltered = service !== '' && chart.categories.includes(service)
	const filteredCells = chart.cells.filter(c => {
		if (serviceFiltered && c.cat !== service) return false
		// Untouched/staff rows are neither phone nor online and always show.
		if (channel !== 'all' && c.channel !== 'none' && c.channel !== channel)
			return false
		return true
	})

	const n = bucketKeys.length
	const sumInto = (arr: Array<number | null>, key: string, v: number) => {
		const i = bucketIndex.get(key)
		if (i == null) return
		arr[i] = (arr[i] ?? 0) + v
	}
	const expectedVals: Array<number | null> = Array.from({ length: n }, () => null)
	for (const r of chart.expected) {
		sumInto(expectedVals, bucketKeyOfDay(r.day), metric === 'revenue' ? r.usd : r.appts)
	}
	const actualVals: Array<number | null> = bucketKeys.map(k =>
		bucketStartDay(k) <= win.todayEt ? 0 : null,
	)
	for (const c of filteredCells) {
		sumInto(actualVals, bucketKeyOfDay(c.day), metric === 'revenue' ? c.usd : c.appts)
	}
	const cancelledVals: Array<number | null> = Array.from({ length: n }, () => null)
	if (chart.cancelled) {
		chart.days.forEach((day, i) => {
			const lost = chart.cancelled![i]
			if (lost == null) return
			sumInto(cancelledVals, bucketKeyOfDay(day), metric === 'revenue' ? lost.usd : lost.n)
		})
	}
	// Expenses per bucket: the month's actual if we have it, else the
	// trailing-6-month average, scaled to the bucket size (avg / ~30.4 daily).
	const avgExpenses = chart.avgMonthlyExpenses
	const expensesVals: Array<number | null> = bucketKeys.map(key => {
		if (win.granularity === 'month') {
			return chart.expensesByMonth[key] ?? avgExpenses
		}
		if (avgExpenses == null) return null
		const perDay = avgExpenses / AVG_DAYS_PER_MONTH
		return Math.round(win.granularity === 'week' ? perDay * 7 : perDay)
	})
	const adsVals: Array<number | null> | null = chart.adsByDay
		? (() => {
				const vals: Array<number | null> = Array.from({ length: n }, () => null)
				for (const [day, spend] of Object.entries(chart.adsByDay!)) {
					if (day < win.fromDay || day > win.toDay) continue
					sumInto(vals, bucketKeyOfDay(day), spend)
				}
				return vals.map(v => (v == null ? null : Math.round(v)))
			})()
		: null

	const showDollarsOnly = metric === 'revenue'
	const expectedName =
		metric === 'revenue' ? 'Expected (net of cancellations)' : 'Expected'
	const cancelledName =
		metric === 'revenue' ? 'Cancelled / no-show (est.)' : 'Cancelled / no-show'
	const totalsSeries: Array<{ name: string; color: string; values: Array<number | null> }> = []
	if (!hidden.has('expected') && !serviceFiltered) {
		totalsSeries.push({ name: expectedName, color: 'var(--series-3)', values: expectedVals })
	}
	if (!hidden.has('actual')) {
		totalsSeries.push({ name: 'Actual', color: 'var(--series-1)', values: actualVals })
	}
	if (!hidden.has('cancelled') && !serviceFiltered && chart.cancelled) {
		totalsSeries.push({ name: cancelledName, color: 'var(--series-6)', values: cancelledVals })
	}
	if (!hidden.has('expenses') && showDollarsOnly && expensesVals.some(v => v != null)) {
		totalsSeries.push({ name: 'Expenses', color: 'var(--series-8)', values: expensesVals })
	}
	if (!hidden.has('adspend') && showDollarsOnly && adsVals) {
		totalsSeries.push({ name: 'Ad spend', color: 'var(--series-5)', values: adsVals })
	}

	// By-source view: actual only, stacked by aggregated source (top 7 + Other).
	const sourceTotals = new Map<string, number>()
	for (const c of filteredCells) {
		const v = metric === 'revenue' ? c.usd : c.appts
		sourceTotals.set(c.source, (sourceTotals.get(c.source) ?? 0) + v)
	}
	const topSources = [...sourceTotals.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([s]) => s)
	const namedSources = topSources.slice(0, 7)
	const hasOther = topSources.length > 7
	const bySourceVals = new Map<string, Array<number | null>>(
		[...namedSources, ...(hasOther ? ['Other'] : [])].map(s => [
			s,
			Array.from({ length: n }, () => null) as Array<number | null>,
		]),
	)
	for (const c of filteredCells) {
		const name = namedSources.includes(c.source) ? c.source : 'Other'
		sumInto(bySourceVals.get(name)!, bucketKeyOfDay(c.day), metric === 'revenue' ? c.usd : c.appts)
	}
	const bySourceSeries = [...bySourceVals.entries()].map(([name, values], i) => ({
		name,
		color: SERIES[i % SERIES.length]!,
		values,
	}))

	const chartSeries = view === 'by-source' ? bySourceSeries : totalsSeries
	const countFormat = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })
	const chartFormat = metric === 'revenue' ? usd : countFormat

	function handleBarClick(seriesName: string, labelIndex: number) {
		const key = bucketKeys[labelIndex]
		if (!key) return
		const status = seriesName.toLowerCase().startsWith('cancelled')
			? 'cancelled'
			: 'completed'
		setSearchParams(
			prev => {
				const next = new URLSearchParams(prev)
				next.set('apptBucket', bucketStartDay(key))
				next.set('apptStatus', status)
				return next
			},
			{ preventScrollReset: true, replace: true },
		)
	}

	// Window-to-date comparison for the note under the chart.
	const windowToDate = (() => {
		let actual = 0
		let expected = 0
		for (const c of filteredCells) actual += metric === 'revenue' ? c.usd : c.appts
		for (const r of chart.expected) {
			if (r.day <= win.todayEt) expected += metric === 'revenue' ? r.usd : r.appts
		}
		return { actual: Math.round(actual), expected: Math.round(expected) }
	})()

	const apptChipLabel = apptBucket
		? win.granularity === 'month'
			? apptBucket.slice(0, 7)
			: win.granularity === 'week'
				? `week of ${apptBucket.slice(5)}`
				: apptBucket.slice(5)
		: null

	return (
		<ReportPage
			title="Revenue"
			subtitle={
				summary
					? `Projection window ${summary.window_start} – ${summary.window_end} · cancellation rate ${summary.cancel_pct}% · computed ${summary.generated_at}`
					: undefined
			}
		>
			<WindowControls
				windowKey={win.windowKey}
				from={win.fromDay}
				to={win.toDay}
				granularity={win.granularity}
			>
				{/* Keep the chart's state when the window form navigates. */}
				{CHART_PARAMS.map(p => {
					const value = searchParams.get(p)
					return value != null ? (
						<input key={p} type="hidden" name={p} value={value} />
					) : null
				})}
			</WindowControls>
			<div className="tiles">
				<StatTile
					label={`This week (${currentMonday})`}
					value={`${usd(weekToDate?.actual ?? 0)} of ${usd(Number(thisWeekProj?.net ?? 0))}`}
					whisper={`actual so far vs projected net · ${usd(Number(thisWeekProj?.booked ?? 0))} booked on the calendar`}
				/>
				{weekToDate ? (
					<StatTile
						label="Expected by now"
						value={usd(weekToDate.expected)}
						whisper={`the projection's Mon–today share · actual is ${
							weekToDate.expected > 0
								? `${Math.round((100 * weekToDate.actual) / weekToDate.expected)}%`
								: '-'
						} of it`}
					/>
				) : null}
				{nowTracking != null ? (
					<StatTile
						label="Now tracking"
						value={usd(nowTracking)}
						whisper="re-projected week: actual so far + forecast for the remaining days"
					/>
				) : null}
				<StatTile
					label="Last week, actual"
					value={usd(Number(lastFullWeek?.revenue ?? 0))}
					whisper={lastFullWeek?.week ?? ''}
				/>
			</div>

			<refresher.Form method="post" className="controls">
				<button type="submit" name="intent" value="refresh" disabled={refreshing}>
					{refreshing ? 'Refreshing…' : 'Refresh now'}
				</button>
				<span className="mini">
					Orders last synced{' '}
					{chart.lastSyncedAt
						? new Date(chart.lastSyncedAt).toLocaleString('en-US', ET_STAMP) + ' ET'
						: 'never'}{' '}
					· auto-syncs every 15 min · revenue appears once an order is closed at
					checkout
				</span>
			</refresher.Form>

			<section>
				<h2>
					{metric === 'revenue' ? 'Revenue' : 'Appointments'}: expected vs actual{' '}
					<span className="mini">
						{win.fromDay} → {win.toDay} · expected is the projection net of
						cancellations · actual from closed Boulevard orders · click a bar to
						filter the appointment table
					</span>
				</h2>
				<div className="controls" style={{ flexWrap: 'wrap' }}>
					<label htmlFor="chart-metric">Metric</label>
					<select
						id="chart-metric"
						value={metric}
						onChange={e => setChartParam('metric', e.target.value === 'appointments' ? 'appointments' : null)}
					>
						<option value="revenue">Revenue</option>
						<option value="appointments">Appointments</option>
					</select>
					<label htmlFor="chart-view">View</label>
					<select
						id="chart-view"
						value={view}
						onChange={e => setChartParam('view', e.target.value === 'by-source' ? 'by-source' : null)}
					>
						<option value="totals">Totals</option>
						<option value="by-source">By source</option>
					</select>
					<label htmlFor="chart-service">Service</label>
					<select
						id="chart-service"
						value={serviceFiltered ? service : ''}
						onChange={e => setChartParam('service', e.target.value || null)}
					>
						<option value="">All services</option>
						{chart.categories.map(c => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
					<label htmlFor="chart-channel">Channel</label>
					<select
						id="chart-channel"
						value={channel}
						onChange={e => setChartParam('channel', e.target.value === 'all' ? null : e.target.value)}
					>
						<option value="all">All channels</option>
						<option value="phone">Phone</option>
						<option value="online">Online</option>
					</select>
					{view === 'totals' ? (
						<span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
							{SERIES_KEYS.map(key => {
								const disabled =
									(key === 'expenses' || key === 'adspend') && metric === 'appointments'
								return (
									<label
										key={key}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 4,
											opacity: disabled ? 0.5 : 1,
										}}
										title={disabled ? 'Dollar series, only in the revenue metric' : undefined}
									>
										<input
											type="checkbox"
											aria-label={`Show ${key === 'adspend' ? 'ad spend' : key} series`}
											checked={!hidden.has(key)}
											disabled={disabled}
											onChange={() => toggleSeries(key)}
										/>
										{key === 'adspend' ? 'ad spend' : key}
									</label>
								)
							})}
						</span>
					) : null}
					{chartParamsActive ? (
						<button type="button" onClick={resetChart}>
							Reset chart
						</button>
					) : null}
				</div>
				<BarChart
					labels={bucketKeys.map(bucketLabel)}
					series={chartSeries}
					stacked={view === 'by-source'}
					height={240}
					format={chartFormat}
					tickEvery={bucketKeys.length > 21 ? 7 : 1}
					showTotal={view === 'by-source'}
					onBarClick={handleBarClick}
				/>
				{chartSeries.length === 0 ? (
					<p className="note">No visible series: re-enable one above.</p>
				) : null}
				{serviceFiltered ? (
					<p className="note">
						Expected and cancelled are hidden for a single service: the
						projection is only computed across all services.
					</p>
				) : null}
				{view === 'totals' && metric === 'revenue' && !serviceFiltered ? (
					<p className="note">
						Window to date: {usd(windowToDate.actual)} actual vs{' '}
						{usd(windowToDate.expected)} expected (
						{windowToDate.expected > 0
							? `${windowToDate.actual >= windowToDate.expected ? '+' : ''}${Math.round((100 * (windowToDate.actual - windowToDate.expected)) / windowToDate.expected)}%`
							: '-'}
						). Cancelled = booked value lost to no-shows and cancellations,
						valued at each service's average ticket over the last 90 days.
						Expected only exists inside the projection window; actual bars stop
						at today. Expenses are the month's bank-verified actuals when
						present, else the trailing-6-month average scaled to the bucket.
					</p>
				) : null}
				{view === 'by-source' ? (
					<p className="note">
						Actual {metric === 'revenue' ? 'revenue' : 'appointments'} stacked
						by source. GBP listings aggregate web clicks (utm_content) and
						tracked phone calls (CallRail) into one source per listing; use the
						channel filter to split them. Expected, cancelled, expenses, and ad
						spend only show in the totals view.
					</p>
				) : null}
				{chart.adsError ? (
					<p className="note" style={{ color: 'var(--bad-text)' }}>
						Ad spend series unavailable:{' '}
						{chart.adsError.length > 120
							? `${chart.adsError.slice(0, 120)}…`
							: chart.adsError}
					</p>
				) : null}
			</section>

			<section>
				<h2>
					Appointment performance{' '}
					<span className="mini">
						every appointment in the window, expected vs actual, worst first
					</span>
				</h2>
				{apptRange && apptChipLabel ? (
					<p className="note">
						showing {apptStatus === 'cancelled' ? 'cancelled/no-show' : 'completed'} on{' '}
						{apptChipLabel} (
						<button
							type="button"
							onClick={() =>
								setSearchParams(
									prev => {
										const next = new URLSearchParams(prev)
										next.delete('apptBucket')
										next.delete('apptStatus')
										return next
									},
									{ preventScrollReset: true, replace: true },
								)
							}
							style={{ cursor: 'pointer', textDecoration: 'underline' }}
						>
							clear
						</button>
						)
					</p>
				) : null}
				{!missesEnabled ? (
					<p className="note">
						Narrow the window to 5 weeks or less to see per-appointment
						detail (the live Boulevard walk gets expensive past that).
					</p>
				) : missesFetcher.state !== 'idle' && missesFetcher.data == null ? (
					<p className="note">Loading appointment detail from Boulevard…</p>
				) : missesFiltered.length === 0 ? (
					<p className="note">
						{apptRange
							? 'No matching appointments for this bar.'
							: 'No appointments in this window.'}
					</p>
				) : (
					<>
						<p className="note">
							{(() => {
								const exp = missesFiltered.reduce((t, r) => t + r.expectedUsd, 0)
								const act = missesFiltered.reduce((t, r) => t + r.actualUsd, 0)
								const lostRows = missesFiltered.filter(
									r => r.status === 'cancelled' || r.status === 'no_show',
								)
								const lostUsd = lostRows.reduce((t, r) => t + r.expectedUsd, 0)
								return `${missesFiltered.length} appointments · expected ${usd(exp)} · actual ${usd(act)} (${Math.round((100 * act) / Math.max(1, exp))}%) · ${usd(lostUsd)} lost to ${lostRows.length} cancels/no-shows`
							})()}
						</p>
						<div className="rtable-wrap">
							<table className="rtable">
								<thead>
									<tr>
										<MTh k="startAt">When</MTh>
										<MTh k="clientName">Client</MTh>
										<MTh k="services">Service</MTh>
										<MTh k="status">Status</MTh>
										<MTh k="expectedUsd" num>Expected</MTh>
										<MTh k="actualUsd" num>Actual</MTh>
										<MTh k="deltaUsd" num>Δ</MTh>
										<MTh k="nextVisitAt">Next visit</MTh>
										<MTh k="reason">Why</MTh>
									</tr>
								</thead>
								<tbody>
									{missesSorted.slice(0, missesShown).map(r => (
										<tr key={r.appointmentId}>
											<td>
												{new Date(r.startAt).toLocaleString('en-US', {
													timeZone: 'America/New_York',
													month: '2-digit',
													day: '2-digit',
													hour: 'numeric',
													minute: '2-digit',
												})}
											</td>
											<td>
												{r.manageUrl ? (
													<a href={r.manageUrl} target="_blank" rel="noreferrer">
														{r.clientName}
													</a>
												) : (
													r.clientName
												)}
												{r.isNewPatient ? (
													<span className="mini"> · new patient</span>
												) : null}
											</td>
											<td>{r.services.join(' + ') || '-'}</td>
											<td>
												{r.status === 'no_show'
													? 'No-show'
													: r.status.charAt(0).toUpperCase() + r.status.slice(1)}
											</td>
											<td className="num">{usd(r.expectedUsd)}</td>
											<td className="num">{usd(r.actualUsd)}</td>
											<td
												className={`num ${r.deltaUsd < -50 ? 'bad' : r.deltaUsd > 50 ? 'good' : ''}`}
											>
												{usd(r.deltaUsd)}
											</td>
											<td>
												{r.nextVisitAt ? (
													`${r.status === 'cancelled' || r.status === 'no_show' ? 'rescheduled ' : ''}${new Date(
														r.nextVisitAt,
													).toLocaleDateString('en-US', {
														timeZone: 'America/New_York',
														month: '2-digit',
														day: '2-digit',
													})}`
												) : (
													<span
														className={
															r.status === 'cancelled' || r.status === 'no_show'
																? 'bad'
																: 'mini'
														}
													>
														{r.status === 'cancelled' || r.status === 'no_show'
															? 'not rebooked'
															: 'none booked'}
													</span>
												)}
											</td>
											<td>
												{r.reason}
												{(r.status === 'cancelled' || r.status === 'no_show') &&
												r.comms.length > 0 ? (
													<div className="mini">
														{r.comms.map((c, i) => (
															<div key={i}>
																{c.kind === 'call' ? '📞' : '💬'}{' '}
																{c.direction === 'inbound'
																	? 'from client'
																	: 'to client'}{' '}
																{new Date(c.at).toLocaleString('en-US', {
																	timeZone: 'America/New_York',
																	month: '2-digit',
																	day: '2-digit',
																	hour: 'numeric',
																})}
																: {c.summary}
															</div>
														))}
													</div>
												) : null}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{missesSorted.length > missesShown ? (
							<p className="note" style={{ textAlign: 'center' }}>
								<button
									type="button"
									onClick={() => setMissesShown(count => count + 50)}
									style={{ cursor: 'pointer', textDecoration: 'underline' }}
								>
									Show more ({missesSorted.length - missesShown} remaining)
								</button>
							</p>
						) : null}
					</>
				)}
				<p className="note">
					Mid-cycle weight-loss visits are expected at $0 (their payment lands
					on the monthly renewal), and prepaid-package follow-ups expect $0,
					so neither shows as a miss.
				</p>
			</section>

			{accuracy ? (
				<section>
					<h2>
						Projection accuracy <span className="mini">pre-week snapshot vs what actually happened</span>
					</h2>
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Week</th>
									<th className="num">Projected</th>
									<th className="num">Range</th>
									<th className="num">Actual</th>
									<th className="num">Error</th>
								</tr>
							</thead>
							<tbody>
								{accuracy.map(a => (
									<tr key={a.week}>
										<td>{a.week}</td>
										<td className="num">{usd(Number(a.projected))}</td>
										<td className="num">
											{a.lo != null && a.hi != null ? `${usd(Number(a.lo))} – ${usd(Number(a.hi))}` : '-'}
										</td>
										<td className="num">{a.actual == null ? '-' : usd(Number(a.actual))}</td>
										<td className={`num ${a.err_pct == null ? '' : Math.abs(Number(a.err_pct)) > 15 ? 'bad' : 'good'}`}>
											{a.err_pct == null ? '-' : `${Number(a.err_pct) > 0 ? '+' : ''}${a.err_pct}%`}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="note">Positive error = the projection was optimistic.</p>
				</section>
			) : null}

		</ReportPage>
	)
}
