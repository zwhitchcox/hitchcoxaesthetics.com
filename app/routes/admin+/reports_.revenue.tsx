/**
 * Revenue — the single business money report: weekly actuals, this week
 * expected vs actual, the 4-week projection, projection accuracy, revenue by
 * type/source/day (paid + projected, with drill-down), the 6-month
 * projection, and business P&L / profitability.
 */
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import {
	BarChart,
	LineChart,
	ReportPage,
	StatTile,
	usd,
} from '#app/components/report-ui'
import { RevenueBySource } from '#app/components/revenue-by-source.tsx'
import { syncBoulevardRealRevenue } from '#app/utils/blvd-revenue-sync.server.ts'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import { loadRevenueBySource } from '#app/utils/revenue-by-source.server.ts'
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
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

/** Actual Boulevard revenue per ET day for the current week (past days + today only). */
async function getActualRevenueByDayThisWeek(weekDays: string[]) {
	const today = toEtDay(new Date())
	const items = await prisma.blvdRevenueItem.findMany({
		where: {
			occurredAt: { gte: new Date(Date.now() - 9 * 24 * 3600 * 1000) },
		},
		select: { occurredAt: true, grossAmountUsd: true },
	})
	const byDay = new Map<string, number>()
	for (const item of items) {
		const day = toEtDay(item.occurredAt)
		byDay.set(day, (byDay.get(day) ?? 0) + item.grossAmountUsd)
	}
	return weekDays.map(day =>
		day <= today ? Math.round(byDay.get(day) ?? 0) : null,
	)
}

/**
 * Booked value lost to cancellations / no-shows per ET day this week, from the
 * Boulevard Admin API. Only cancellations made AFTER the projection snapshot
 * (`cancelledAfter`) count — earlier ones were never in "expected", so they
 * can't explain the gap. Cancelled appointments come back with $0 prices, so
 * each lost service is valued at its average closed-order revenue (last 90d).
 */
async function getLostRevenueByDayThisWeek(
	weekDays: string[],
	cancelledAfter: Date | null,
) {
	const today = toEtDay(new Date())
	const prevDay = new Date(`${weekDays[0]}T12:00:00Z`)
	prevDay.setUTCDate(prevDay.getUTCDate() - 1)
	const nextDay = new Date(`${weekDays[6]}T12:00:00Z`)
	nextDay.setUTCDate(nextDay.getUTCDate() + 1)
	const query = `startAt >= '${prevDay.toISOString().slice(0, 10)}T00:00:00Z' AND startAt <= '${nextDay.toISOString().slice(0, 10)}T23:59:59Z'`

	const locations = await listBlvdAdminLocations()
	const lostServices: Array<{ day: string; serviceName: string }> = []
	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < 5; page++) {
			const res: any = await boulevardAdminFetch(
				`query WeekAppointments($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId, query: "${query}") {
						pageInfo { endCursor hasNextPage }
						edges { node { startAt state cancelled cancellation { cancelledAt reason } appointmentServices { service { name } } } }
					}
				}`,
				{ after, locationId: location.id },
			)
			for (const edge of res.appointments?.edges ?? []) {
				const appt = edge?.node
				if (!appt) continue
				if (!(appt.cancelled || appt.state === 'NO_SHOW')) continue
				const isNoShow =
					appt.state === 'NO_SHOW' || appt.cancellation?.reason === 'NO_SHOW'
				const cancelledAt = appt.cancellation?.cancelledAt
					? new Date(appt.cancellation.cancelledAt)
					: null
				// no-shows always count; plain cancellations only if they happened
				// after the projection was computed
				if (
					!isNoShow &&
					cancelledAfter &&
					cancelledAt &&
					cancelledAt < cancelledAfter
				) {
					continue
				}
				const day = toEtDay(new Date(appt.startAt))
				if (!weekDays.includes(day) || day > today) continue
				for (const s of appt.appointmentServices ?? []) {
					if (s?.service?.name) {
						lostServices.push({ day, serviceName: s.service.name })
					}
				}
			}
			if (!res.appointments?.pageInfo?.hasNextPage) break
			after = res.appointments.pageInfo.endCursor
		}
	}

	const names = [...new Set(lostServices.map(s => s.serviceName))]
	const items = names.length
		? await prisma.blvdRevenueItem.findMany({
				where: {
					itemName: { in: names },
					grossAmountUsd: { gt: 0 },
					occurredAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
				},
				select: { itemName: true, grossAmountUsd: true },
			})
		: []
	const avgByName = new Map<string, { total: number; n: number }>()
	for (const item of items) {
		const cur = avgByName.get(item.itemName) ?? { total: 0, n: 0 }
		cur.total += item.grossAmountUsd
		cur.n += 1
		avgByName.set(item.itemName, cur)
	}
	const byDay = new Map<string, number>()
	for (const s of lostServices) {
		const avg = avgByName.get(s.serviceName)
		const value = avg?.n ? avg.total / avg.n : 0
		byDay.set(s.day, (byDay.get(s.day) ?? 0) + value)
	}
	return weekDays.map(day =>
		day <= today ? Math.round(byDay.get(day) ?? 0) : null,
	)
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })

	const weekDays = getCurrentWeekDays()
	const [weekly, next4, monthly, accuracy, pnl, summary, thisWeekExpected, actualByDay, avgExp, bySource] = await Promise.all([
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
		getActualRevenueByDayThisWeek(weekDays).catch(() => null),
		tryQuery<{ avg: string }>(
			`SELECT round(avg(expenses)) AS avg FROM business_pnl_monthly
			 WHERE month < to_char(current_date, 'YYYY-MM')`,
		),
		loadRevenueBySource(request),
	])

	const projectionComputedAt = summary?.[0]?.generated_at_raw
		? new Date(summary[0].generated_at_raw)
		: null
	const lostByDay = await getLostRevenueByDayThisWeek(
		weekDays,
		projectionComputedAt,
	).catch(() => null)

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

	// The weekly_revenue table only refreshes with the weekly projection job,
	// so the current week is missing (or stale) mid-week — replace it with the
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
		bySource,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	// The sync writes revenue rows — SQLite writes only happen on the primary.
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
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { weekly, currentMonday, next4, monthly, pnl, avgExpenses, accuracy, summary, thisWeekDaily, bySource } = data
	const thisWeek = next4?.[0]
	const lastFullWeek = weekly?.filter(w => w.week < currentMonday).at(-1)
	const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
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

	return (
		<ReportPage
			title="Revenue"
			subtitle={
				summary
					? `Projection window ${summary.window_start} – ${summary.window_end} · cancellation rate ${summary.cancel_pct}% · computed ${summary.generated_at}`
					: undefined
			}
		>
			<div className="tiles">
				<StatTile
					label={`This week (${currentMonday})`}
					value={`${usd(Number(weekly?.at(-1)?.revenue ?? 0))} of ${usd(Number(thisWeek?.net ?? 0))}`}
					whisper={`actual so far vs projected net · ${usd(Number(thisWeek?.booked ?? 0))} booked on the calendar`}
				/>
				<StatTile
					label="Last week — actual"
					value={usd(Number(lastFullWeek?.revenue ?? 0))}
					whisper={lastFullWeek?.week ?? ''}
				/>
			</div>

			{thisWeekDaily ? (
				<section>
					<h2>
						This week — expected vs actual{' '}
						<span className="mini">Mon–Sun · expected is the projection net of cancellations · actual from closed Boulevard orders</span>
					</h2>
					<BarChart
						labels={thisWeekDaily.map(
							(d, i) => `${WEEKDAY_NAMES[i]} ${d.day.slice(5)}`,
						)}
						series={[
							{
								name: 'Expected',
								color: 'var(--series-3)',
								values: thisWeekDaily.map(d => d.expected),
							},
							{
								name: 'Actual',
								color: 'var(--series-1)',
								values: thisWeekDaily.map(d => d.actual),
							},
							{
								name: 'Cancelled / no-show (est.)',
								color: 'var(--series-6)',
								values: thisWeekDaily.map(d => d.lost),
							},
						]}
						height={220}
						tickEvery={1}
					/>
					{weekToDate ? (
						<p className="note">
							Week to date: {usd(weekToDate.actual)} actual vs {usd(weekToDate.expected)} expected (
							{weekToDate.expected > 0
								? `${weekToDate.actual >= weekToDate.expected ? '+' : ''}${Math.round((100 * (weekToDate.actual - weekToDate.expected)) / weekToDate.expected)}%`
								: '—'}
							){weekToDate.lost > 0 ? `, with ${usd(weekToDate.lost)} lost to cancellations / no-shows` : ''}. Red
							= booked value lost after the projection was computed (no-shows + late
							cancellations), valued at each service's average ticket over the last 90
							days — earlier cancellations were never in "expected". Actual bars stop
							at today; today's is partial.
						</p>
					) : null}
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
						Business P&amp;L — monthly actuals <span className="mini">bank-verified · profitability</span>
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
											{a.lo != null && a.hi != null ? `${usd(Number(a.lo))} – ${usd(Number(a.hi))}` : '—'}
										</td>
										<td className="num">{a.actual == null ? '—' : usd(Number(a.actual))}</td>
										<td className={`num ${a.err_pct == null ? '' : Math.abs(Number(a.err_pct)) > 15 ? 'bad' : 'good'}`}>
											{a.err_pct == null ? '—' : `${Number(a.err_pct) > 0 ? '+' : ''}${a.err_pct}%`}
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
