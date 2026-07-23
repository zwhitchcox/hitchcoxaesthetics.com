/**
 * Revenue, the single business money report: weekly actuals, this week
 * expected vs actual, the 4-week projection, projection accuracy, revenue by
 * type/source/day (paid + projected, with drill-down), the 6-month
 * projection, and business P&L / profitability.
 */
import { useEffect, useState } from 'react'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { type loader as appointmentsLoader } from './reports_.appointments.tsx'
import {
	BarChart,
	LineChart,
	ReportPage,
	StatTile,
	usd,
	useSortable,
} from '#app/components/report-ui'
import {
	RevenueBySource,
	WindowControls,
} from '#app/components/revenue-by-source.tsx'
import { syncBoulevardRealRevenue } from '#app/utils/blvd-revenue-sync.server.ts'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import {
	etMidnightUtc,
	loadRevenueBySource,
	parseReportWindow,
	shiftDay,
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
function enumerateDays(fromDay: string, toDay: string): string[] {
	const days: string[] = []
	let cursor = fromDay
	while (cursor <= toDay && days.length < MAX_RANGE_DAYS) {
		days.push(cursor)
		cursor = shiftDay(cursor, 1)
	}
	return days
}

/** Cancelled/no-show value per day from the append-only ledger. */
async function getLostByDays(days: string[]) {
	if (days.length === 0) return null
	return reportsQuery<{ day: string; lost: string }>(
		`SELECT to_char(start_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
			round(sum(expected_usd)) AS lost
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
			const byDay = new Map(rows.map(r => [r.day, Number(r.lost)]))
			const today = toEtDay(new Date())
			return days.map(day => (day > today ? null : (byDay.get(day) ?? 0)))
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
	const [weekly, next4, monthly, accuracy, pnl, summary, thisWeekExpected, actualByDay, avgExp, bySource, rangeExpected, rangeActual, rangeLost] = await Promise.all([
		tryQuery<{ week: string; revenue: string; kept_appts: string }>(
			`SELECT to_char(week, 'YYYY-MM-DD') AS week, revenue, kept_appts
			 FROM weekly_revenue ORDER BY week`,
		),
		tryQuery<{ week: string; booked: string; fill: string; expected: string; net: string }>(
			`SELECT to_char(date_trunc('week', day), 'YYYY-MM-DD') AS week,
				round(sum(booked_usd)) AS booked,
				round(sum(fill_usd)) AS fill,
				round(sum(expected_usd)) AS expected,
				round(sum(expected_usd) * (1 - (SELECT cancellation_rate FROM revenue_projection_summary WHERE id = 1))) AS net
			 FROM revenue_projection_daily
			 WHERE date_trunc('week', day) >= date_trunc('week', now())
			 GROUP BY 1 ORDER BY 1 LIMIT 4`,
		),
		tryQuery<{ month: string; booked: string; fill: string; expected: string; net: string }>(
			`SELECT month, round(booked_usd) AS booked, round(projected_fill_usd) AS fill,
				round(expected_usd) AS expected, round(net_after_cancellations_usd) AS net
			 FROM report_revenue_projection_monthly ORDER BY month`,
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
		tryQuery<{ month: string; revenue: string; expenses: string; net: string }>(
			`SELECT month, round(revenue) AS revenue, round(expenses) AS expenses, round(net) AS net
			 FROM business_pnl_monthly ORDER BY month`,
		),
		tryQuery<{
			window_start: string
			window_end: string
			gross: string
			cancel_pct: string
			net: string
			generated_at: string
			generated_at_raw: string
		}>(
			`SELECT to_char(window_start, 'Mon DD') AS window_start,
				to_char(window_end, 'Mon DD') AS window_end,
				round(gross_expected_usd) AS gross,
				round(cancellation_rate * 100, 1) AS cancel_pct,
				round(net_expected_usd) AS net,
				to_char(generated_at, 'Mon DD HH24:MI') AS generated_at,
				generated_at AS generated_at_raw
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
		tryQuery<{ avg: string }>(
			`SELECT round(avg(expenses)) AS avg FROM business_pnl_monthly
			 WHERE month < to_char(current_date, 'YYYY-MM')`,
		),
		loadRevenueBySource(request, 'thisWeek'),
		tryQuery<{ day: string; expected: string }>(
			`SELECT to_char(day, 'YYYY-MM-DD') AS day,
				round(expected_usd * (1 - (SELECT cancellation_rate FROM revenue_projection_summary WHERE id = 1))) AS expected
			 FROM revenue_projection_daily
			 WHERE day >= '${win.fromDay}'::date AND day <= '${win.toDay}'::date
			 ORDER BY day`,
		),
		getActualRevenueByDays(rangeDays, win.since, win.until).catch(() => null),
		getLostByDays(rangeDays),
	])

	// Lost value comes from the append-only appointment ledger, the single
	// source of truth for cancellations/no-shows (valued at booked price or the
	// service's 90-day average). Every cancellation for the day counts, whether
	// it happened before or after the forecast was computed; the old
	// only-after-the-snapshot filter is what made real cancellations invisible.
	const lostByDay = await getLostByDays(weekDays)

	const expectedByDay = new Map(
		(thisWeekExpected ?? []).map(r => [r.day, Number(r.expected)]),
	)
	const thisWeekDaily =
		thisWeekExpected?.length || actualByDay?.some(v => v != null)
			? weekDays.map((day, i) => ({
					day,
					expected: expectedByDay.get(day) ?? null,
					actual: actualByDay?.[i] ?? null,
					lost: lostByDay?.[i] ?? null,
				}))
			: null

	// The window-controlled expected vs actual series (the chart follows the
	// page's date filter; the tiles above stay pinned to the current week).
	const rangeExpectedByDay = new Map(
		(rangeExpected ?? []).map(r => [r.day, Number(r.expected)]),
	)
	const rangeDaily =
		rangeExpected?.length || rangeActual?.some(v => v != null)
			? rangeDays.map((day, i) => ({
					day,
					expected: rangeExpectedByDay.get(day) ?? null,
					actual: rangeActual?.[i] ?? null,
					lost: rangeLost?.[i] ?? null,
				}))
			: null

	// The weekly_revenue table only refreshes with the weekly projection job,
	// so the current week is missing (or stale) mid-week, replace it with the
	// live week-to-date sum from Boulevard actuals.
	const currentMonday = weekDays[0]!
	const weekToDateActual = (actualByDay ?? []).reduce<number>(
		(sum, v) => sum + (v ?? 0),
		0,
	)
	const weeklyWithCurrent = weekly
		? [
				...weekly.filter(w => w.week < currentMonday),
				{
					week: currentMonday,
					revenue: String(weekToDateActual),
					kept_appts: '',
				},
			]
		: null

	return json({
		configured: true as const,
		weekly: weeklyWithCurrent,
		currentMonday,
		next4,
		monthly,
		pnl,
		avgExpenses: avgExp?.[0]?.avg != null ? Number(avgExp[0].avg) : null,
		accuracy: accuracy?.slice(-12) ?? null,
		summary: summary?.[0] ?? null,
		thisWeekDaily,
		rangeDaily,
		window: {
			windowKey: win.windowKey,
			granularity: win.granularity,
			fromDay: win.fromDay,
			toDay: win.toDay,
		},
		bySource,
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

export default function Revenue() {
	const data = useLoaderData<typeof loader>()
	// Hooks must run unconditionally: the misses fetcher lives up here, ahead
	// of the not-configured early return.
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
	const { rows: missesSorted, Th: MTh } = useSortable(missesAll, {
		services: (r: (typeof missesAll)[number]) => r.services.join(' '),
	})
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { weekly, currentMonday, next4, monthly, pnl, avgExpenses, accuracy, summary, thisWeekDaily, rangeDaily, window: win, bySource } = data
	const thisWeek = next4?.[0]
	const lastFullWeek = weekly?.filter(w => w.week < currentMonday).at(-1)
	const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

	// Group the window's daily series by the selected granularity (client-safe
	// date math, no server imports here).
	const mondayOfDay = (day: string) => {
		const anchor = new Date(`${day}T12:00:00Z`)
		const dow = (anchor.getUTCDay() + 6) % 7
		anchor.setUTCDate(anchor.getUTCDate() - dow)
		return anchor.toISOString().slice(0, 10)
	}
	const bucketMap = new Map<
		string,
		{ expected: number | null; actual: number | null; lost: number | null }
	>()
	for (const d of rangeDaily ?? []) {
		const key =
			win.granularity === 'month'
				? d.day.slice(0, 7)
				: win.granularity === 'week'
					? mondayOfDay(d.day)
					: d.day
		const bucket = bucketMap.get(key) ?? { expected: null, actual: null, lost: null }
		if (d.expected != null) bucket.expected = (bucket.expected ?? 0) + d.expected
		if (d.actual != null) bucket.actual = (bucket.actual ?? 0) + d.actual
		if (d.lost != null) bucket.lost = (bucket.lost ?? 0) + d.lost
		bucketMap.set(key, bucket)
	}
	const rangeBuckets = [...bucketMap.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([key, v]) => ({ key, ...v }))
	const bucketLabel = (key: string) => {
		if (win.granularity === 'month') return key
		if (win.granularity === 'week') return `wk ${key.slice(5)}`
		if (rangeBuckets.length <= 21) {
			const d = new Date(`${key}T12:00:00Z`)
			return `${WEEKDAY_NAMES[(d.getUTCDay() + 6) % 7]} ${key.slice(5)}`
		}
		return key.slice(5)
	}
	const rangeToDate = rangeDaily
		? rangeDaily.reduce(
				(acc, d) => {
					if (d.actual == null) return acc
					return {
						actual: acc.actual + d.actual,
						expected: acc.expected + (d.expected ?? 0),
						lost: acc.lost + (d.lost ?? 0),
					}
				},
				{ actual: 0, expected: 0, lost: 0 },
			)
		: null
	const weekToDate = thisWeekDaily
		? thisWeekDaily.reduce(
				(acc, d) => {
					if (d.actual == null) return acc
					return {
						actual: acc.actual + d.actual,
						expected: acc.expected + (d.expected ?? 0),
						lost: acc.lost + (d.lost ?? 0),
					}
				},
				{ actual: 0, expected: 0, lost: 0 },
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
			/>
			<div className="tiles">
				<StatTile
					label={`This week (${currentMonday})`}
					value={`${usd(Number(weekly?.at(-1)?.revenue ?? 0))} of ${usd(Number(thisWeek?.net ?? 0))}`}
					whisper={`actual so far vs projected net · ${usd(Number(thisWeek?.booked ?? 0))} booked on the calendar`}
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

			{rangeDaily ? (
				<section>
					<h2>
						Expected vs actual{' '}
						<span className="mini">
							{win.fromDay} → {win.toDay} · expected is the projection net of
							cancellations · actual from closed Boulevard orders
						</span>
					</h2>
					<BarChart
						labels={rangeBuckets.map(b => bucketLabel(b.key))}
						series={[
							{
								name: 'Expected',
								color: 'var(--series-3)',
								values: rangeBuckets.map(b => b.expected),
							},
							{
								name: 'Actual',
								color: 'var(--series-1)',
								values: rangeBuckets.map(b => b.actual),
							},
							{
								name: 'Cancelled / no-show (est.)',
								color: 'var(--series-6)',
								values: rangeBuckets.map(b => b.lost),
							},
						]}
						height={220}
						tickEvery={rangeBuckets.length > 21 ? 7 : 1}
					/>
					{rangeToDate ? (
						<p className="note">
							Window to date: {usd(rangeToDate.actual)} actual vs {usd(rangeToDate.expected)} expected (
							{rangeToDate.expected > 0
								? `${rangeToDate.actual >= rangeToDate.expected ? '+' : ''}${Math.round((100 * (rangeToDate.actual - rangeToDate.expected)) / rangeToDate.expected)}%`
								: '-'}
							){rangeToDate.lost > 0 ? `, with ${usd(rangeToDate.lost)} lost to cancellations / no-shows` : ''}. Red
							= booked value lost after the projection was computed (no-shows + late
							cancellations), valued at each service's average ticket over the last 90
							days, earlier cancellations were never in "expected". Expected only
							exists inside the projection window; actual bars stop at today.
						</p>
					) : null}
				</section>
			) : null}

			{rangeDaily ? (
				<section>
					<h2>
						Appointment performance{' '}
						<span className="mini">
							every appointment in the window, expected vs actual, worst first
						</span>
					</h2>
					{!missesEnabled ? (
						<p className="note">
							Narrow the window to 5 weeks or less to see per-appointment
							detail (the live Boulevard walk gets expensive past that).
						</p>
					) : missesFetcher.state !== 'idle' && missesFetcher.data == null ? (
						<p className="note">Loading appointment detail from Boulevard…</p>
					) : missesAll.length === 0 ? (
						<p className="note">No appointments in this window.</p>
					) : (
						<>
							<p className="note">
								{(() => {
									const exp = missesAll.reduce((t, r) => t + r.expectedUsd, 0)
									const act = missesAll.reduce((t, r) => t + r.actualUsd, 0)
									const lostRows = missesAll.filter(
										r => r.status === 'cancelled' || r.status === 'no_show',
									)
									const lostUsd = lostRows.reduce((t, r) => t + r.expectedUsd, 0)
									return `${missesAll.length} appointments · expected ${usd(exp)} · actual ${usd(act)} (${Math.round((100 * act) / Math.max(1, exp))}%) · ${usd(lostUsd)} lost to ${lostRows.length} cancels/no-shows`
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
										onClick={() => setMissesShown(n => n + 50)}
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
			) : null}

			{weekly ? (
				<section>
					<h2>
						Weekly revenue <span className="mini">Boulevard actuals</span>
					</h2>
					<BarChart
						labels={weekly.map(w => w.week.slice(5))}
						series={[{ name: 'Revenue', color: 'var(--series-1)', values: weekly.map(w => Number(w.revenue)) }]}
						height={190}
					/>
					<p className="note">
						The last bar is the current week to date (live from closed Boulevard
						orders); earlier bars are full weeks.
					</p>
				</section>
			) : null}

			{next4 ? (
				<section>
					<h2>
						Next 4 weeks <span className="mini">booked + projected fill, net of cancellations</span>
					</h2>
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Week of</th>
									<th className="num">Booked</th>
									<th className="num">Projected fill</th>
									<th className="num">Projected gross</th>
									<th className="num">Net after cancellations</th>
								</tr>
							</thead>
							<tbody>
								{next4.map(w => (
									<tr key={w.week}>
										<td>{w.week}</td>
										<td className="num">{usd(Number(w.booked))}</td>
										<td className="num">{usd(Number(w.fill))}</td>
										<td className="num">{usd(Number(w.expected))}</td>
										<td className="num">{usd(Number(w.net))}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			<RevenueBySource data={bySource} />

			{monthly ? (
				<section>
					<h2>
						Next 6 months <span className="mini">booked + fill, net of cancellations · est. profit vs avg monthly expenses{avgExpenses != null ? ` (${usd(avgExpenses)})` : ''}</span>
					</h2>
					<BarChart
						labels={monthly.map(m => m.month)}
						series={[
							{ name: 'Booked', color: 'var(--series-1)', values: monthly.map(m => Number(m.booked)) },
							{ name: 'Projected fill', color: 'var(--series-3)', values: monthly.map(m => Number(m.fill)) },
						]}
						stacked
						height={190}
						tickEvery={1}
					/>
					<div className="rtable-wrap" style={{ marginTop: 10 }}>
						<table className="rtable">
							<thead>
								<tr>
									<th>Month</th>
									<th className="num">Booked</th>
									<th className="num">Projected fill</th>
									<th className="num">Net after cancellations</th>
									{avgExpenses != null ? <th className="num">Est. profit</th> : null}
								</tr>
							</thead>
							<tbody>
								{monthly.map(m => (
									<tr key={m.month}>
										<td>{m.month}</td>
										<td className="num">{usd(Number(m.booked))}</td>
										<td className="num">{usd(Number(m.fill))}</td>
										<td className="num">{usd(Number(m.net))}</td>
										{avgExpenses != null ? (
											<td className={`num ${Number(m.net) - avgExpenses < 0 ? 'bad' : 'good'}`}>
												{usd(Number(m.net) - avgExpenses)}
											</td>
										) : null}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			{pnl ? (
				<section>
					<h2>
						Business P&amp;L, monthly actuals <span className="mini">bank-verified · profitability</span>
					</h2>
					<BarChart
						labels={pnl.map(m => m.month)}
						series={[
							{ name: 'Revenue', color: 'var(--series-1)', values: pnl.map(m => Number(m.revenue)) },
							{ name: 'Expenses', color: 'var(--series-6)', values: pnl.map(m => Number(m.expenses)) },
						]}
						height={190}
					/>
					<LineChart
						labels={pnl.map(m => m.month)}
						series={[{ name: 'Net profit', color: 'var(--series-2)', values: pnl.map(m => Number(m.net)) }]}
						height={140}
					/>
				</section>
			) : null}

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
