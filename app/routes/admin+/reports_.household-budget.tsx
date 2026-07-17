/**
 * Household budget — native replacement for Metabase dashboard 7: monthly
 * spend trend, category breakdown (top 7 + Other, stacked), dining vs
 * groceries, category summary, top merchants, recurring charges.
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import {
	BarChart,
	LineChart,
	ReportPage,
	SERIES,
	StatTile,
	usd,
} from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })

	const [totals, matrix, summary, merchants, recurring, meta] = await Promise.all([
		reportsQuery<{ month: string; total: string }>(
			`SELECT month, round(total) AS total FROM household_monthly_totals ORDER BY month`,
		),
		reportsQuery<{ month: string; bucket: string; amount: string }>(
			`SELECT month, bucket, round(amount) AS amount FROM household_budget_matrix ORDER BY month, bucket`,
		),
		reportsQuery<{ bucket: string; total: string; avg_month: string; median_month: string }>(
			`SELECT bucket, round(total) AS total, round(avg_month) AS avg_month,
				round(median_month) AS median_month
			 FROM household_category_summary ORDER BY total DESC`,
		),
		reportsQuery<{ merchant: string; total: string; months: number }>(
			`SELECT merchant, round(total) AS total, months FROM household_top_merchants
			 ORDER BY total DESC LIMIT 20`,
		),
		reportsQuery<{ merchant: string; per_month: string; months: number }>(
			`SELECT merchant, round(per_month) AS per_month, months FROM household_recurring
			 ORDER BY per_month DESC`,
		),
		reportsQuery<{ avg_month: string; period_start: string; period_end: string }>(
			`SELECT round(avg_month) AS avg_month, period_start, period_end
			 FROM household_budget_meta WHERE id = 1`,
		),
	])

	return json({
		configured: true as const,
		totals,
		matrix,
		summary,
		merchants,
		recurring,
		meta: meta[0] ?? null,
	})
}

export default function HouseholdBudget() {
	const data = useLoaderData<typeof loader>()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { totals, matrix, summary, merchants, recurring, meta } = data

	const months = totals.map(t => t.month)
	// Top 7 categories by total keep their own hue; the rest fold into Other.
	const topBuckets = summary.slice(0, 7).map(s => s.bucket)
	const byBucket = new Map<string, Map<string, number>>()
	for (const row of matrix) {
		const b = topBuckets.includes(row.bucket) ? row.bucket : 'Other'
		if (!byBucket.has(b)) byBucket.set(b, new Map())
		const m = byBucket.get(b)!
		m.set(row.month, (m.get(row.month) ?? 0) + Number(row.amount))
	}
	const stackOrder = [...topBuckets.filter(b => byBucket.has(b)), 'Other'].filter(b =>
		byBucket.has(b),
	)
	const stacked = stackOrder.map((b, i) => ({
		name: b,
		color: b === 'Other' ? 'var(--muted)' : SERIES[i]!,
		values: months.map(m => byBucket.get(b)!.get(m) ?? 0),
	}))

	const line = (bucket: string, color: string) => ({
		name: bucket,
		color,
		values: months.map(
			m =>
				Number(matrix.find(r => r.month === m && r.bucket === bucket)?.amount ?? 0) || null,
		),
	})

	return (
		<ReportPage
			title="Household budget"
			subtitle={meta ? `Personal spending, ${meta.period_start} – ${meta.period_end}` : 'Personal spending'}
		>
			<div className="tiles">
				<StatTile label="Average month" value={usd(Number(meta?.avg_month ?? 0))} />
				<StatTile
					label={`Last month (${months.at(-2) ?? ''})`}
					value={usd(Number(totals.at(-2)?.total ?? 0))}
				/>
				<StatTile label="Target" value="$18,500" whisper="from the budget review" />
			</div>

			<section>
				<h2>Monthly spend</h2>
				<LineChart
					labels={months}
					series={[{ name: 'Total', color: 'var(--series-1)', values: totals.map(t => Number(t.total)) }]}
					height={170}
				/>
			</section>

			<section>
				<h2>
					Spend by category <span className="mini">top 7 categories, rest folded into Other</span>
				</h2>
				<BarChart labels={months} series={stacked} stacked height={230} />
			</section>

			<section>
				<h2>Dining out vs groceries</h2>
				<LineChart
					labels={months}
					series={[line('Groceries', 'var(--series-1)'), line('Dining out', 'var(--series-3)')]}
					height={160}
				/>
			</section>

			<section>
				<h2>Category summary</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Category</th>
								<th className="num">Total</th>
								<th className="num">Avg/month</th>
								<th className="num">Median/month</th>
							</tr>
						</thead>
						<tbody>
							{summary.map(s => (
								<tr key={s.bucket}>
									<td>{s.bucket}</td>
									<td className="num">{usd(Number(s.total))}</td>
									<td className="num">{usd(Number(s.avg_month))}</td>
									<td className="num">{usd(Number(s.median_month))}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>Top merchants</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Merchant</th>
								<th className="num">Total</th>
								<th className="num">Months seen</th>
							</tr>
						</thead>
						<tbody>
							{merchants.map(m => (
								<tr key={m.merchant}>
									<td>{m.merchant}</td>
									<td className="num">{usd(Number(m.total))}</td>
									<td className="num">{m.months}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>
					Recurring charges <span className="mini">seen in 3+ months at a steady amount</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Merchant</th>
								<th className="num">Per month</th>
								<th className="num">Months</th>
							</tr>
						</thead>
						<tbody>
							{recurring.map(m => (
								<tr key={m.merchant}>
									<td>{m.merchant}</td>
									<td className="num">{usd(Number(m.per_month))}</td>
									<td className="num">{m.months}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</ReportPage>
	)
}
