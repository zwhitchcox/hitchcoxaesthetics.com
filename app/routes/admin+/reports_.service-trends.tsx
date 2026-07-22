/**
 * Service trends, demand per category since Jun 2024 (trend + seasonality)
 * and weekday x hour peak times, from the worker-synced service_month_trend /
 * service_time_peak tables. Answers "is this month normal?" per service.
 */
import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { Form, useLoaderData, useSubmit } from '@remix-run/react'
import { LineChart, ReportPage, SERIES, StatTile } from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Service trends' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const CATEGORIES = ['Tox', 'Filler', 'Weight Loss', 'Laser', 'Skin', 'Consult', 'Other']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })
	const params = new URL(request.url).searchParams
	const category = CATEGORIES.includes(params.get('category') ?? '')
		? params.get('category')!
		: 'All'

	const [trend, peaks] = await Promise.all([
		reportsQuery<{ month: string; category: string; appts: string }>(
			`SELECT month, category, appts FROM service_month_trend ORDER BY month`,
		).catch(() => [] as Array<{ month: string; category: string; appts: string }>),
		reportsQuery<{ category: string; dow: string; hour: string; appts: string }>(
			`SELECT category, dow, hour, appts FROM service_time_peak`,
		).catch(() => [] as Array<{ category: string; dow: string; hour: string; appts: string }>),
	])
	return json({ configured: true as const, trend, peaks, category })
}

export default function ServiceTrends() {
	const data = useLoaderData<typeof loader>()
	const submit = useSubmit()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { trend, peaks, category } = data

	if (trend.length === 0)
		return (
			<ReportPage title="Service trends" subtitle="Demand per service category since Jun 2024">
				<p className="note">
					No data yet, the worker sync (service-trends-daily) hasn't run. It
					fills this page automatically; check back shortly.
				</p>
			</ReportPage>
		)

	const months = [...new Set(trend.map(t => t.month))].sort()
	const byCatMonth = new Map<string, number>()
	for (const t of trend) byCatMonth.set(`${t.category}|${t.month}`, Number(t.appts))
	const catTotals = new Map<string, number>()
	for (const t of trend)
		catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + Number(t.appts))
	const activeCats = CATEGORIES.filter(c => (catTotals.get(c) ?? 0) > 0)

	// This month pace vs same month last year.
	const thisMonth = months[months.length - 1]!
	const now = new Date()
	const dayOfMonth = Number(
		now.toLocaleDateString('en-US', { timeZone: 'America/New_York', day: 'numeric' }),
	)
	const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
	const monthFraction = Math.min(1, dayOfMonth / daysInMonth)
	const lastYearMonth = `${Number(thisMonth.slice(0, 4)) - 1}${thisMonth.slice(4)}`
	const thisMonthTotal = activeCats.reduce(
		(s, c) => s + (byCatMonth.get(`${c}|${thisMonth}`) ?? 0),
		0,
	)
	const lastYearTotal = activeCats.reduce(
		(s, c) => s + (byCatMonth.get(`${c}|${lastYearMonth}`) ?? 0),
		0,
	)
	const pace = Math.round(thisMonthTotal / Math.max(0.05, monthFraction))

	// Peak grid for the selected category (or all combined), trailing 180 days.
	const peakGrid = new Map<string, number>()
	let peakMax = 0
	for (const p of peaks) {
		if (category !== 'All' && p.category !== category) continue
		const key = `${p.dow}|${p.hour}`
		const v = (peakGrid.get(key) ?? 0) + Number(p.appts)
		peakGrid.set(key, v)
		peakMax = Math.max(peakMax, v)
	}
	const hours = Array.from({ length: 12 }, (_, i) => i + 8) // 8am–7pm

	return (
		<ReportPage
			title="Service trends"
			subtitle="Kept appointments per category since Jun 2024, plus weekday × hour peaks (trailing 180 days). Synced daily from Boulevard."
		>
			<div className="tiles">
				<StatTile
					label={`${thisMonth} so far`}
					value={String(thisMonthTotal)}
					whisper={`on pace for ~${pace} appointments`}
				/>
				<StatTile
					label={`Same month last year (${lastYearMonth})`}
					value={String(lastYearTotal || '-')}
					whisper={
						lastYearTotal
							? `pace is ${Math.round((100 * pace) / lastYearTotal)}% of last year's total`
							: 'no data'
					}
				/>
			</div>

			<section>
				<h2>
					Appointments by month <span className="mini">per category</span>
				</h2>
				<LineChart
					labels={months.map(m => m.slice(2))}
					series={activeCats.map((c, i) => ({
						name: c,
						color: SERIES[i % SERIES.length]!,
						values: months.map(m => byCatMonth.get(`${c}|${m}`) ?? 0),
					}))}
					height={240}
					format={n => String(Math.round(n))}
					tickEvery={3}
				/>
				<p className="note">
					The last point is the current month in progress, read it with the
					pace tile, not at face value.
				</p>
			</section>

			<section>
				<h2>
					Peak times{' '}
					<span className="mini">
						{category === 'All' ? 'all services' : category} · kept appointments by weekday and
						hour, trailing 180 days
					</span>
				</h2>
				<Form method="get" className="controls" onChange={e => submit(e.currentTarget)}>
					<label htmlFor="category">Service</label>
					<select id="category" name="category" defaultValue={category}>
						<option value="All">All services</option>
						{activeCats.map(c => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				</Form>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Hour</th>
								{DOW.slice(1).map(d => (
									<th key={d} className="num">
										{d}
									</th>
								))}
								<th className="num">{DOW[0]}</th>
							</tr>
						</thead>
						<tbody>
							{hours.map(h => (
								<tr key={h}>
									<td>
										{h % 12 === 0 ? 12 : h % 12}
										{h < 12 ? 'am' : 'pm'}
									</td>
									{[1, 2, 3, 4, 5, 6, 0].map(d => {
										const v = peakGrid.get(`${d}|${h}`) ?? 0
										const hot = peakMax > 0 && v >= peakMax * 0.7
										return (
											<td key={d} className={`num ${hot ? 'good' : ''}`}>
												{v || ''}
											</td>
										)
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</ReportPage>
	)
}
