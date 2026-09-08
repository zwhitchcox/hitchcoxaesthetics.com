/**
 * Household profit, native replacement for Metabase dashboard 11.
 * business revenue − business expenses + Zane take-home − household spending −
 * estimated taxes = what we kept, per month. Reads household_profit_monthly in
 * the reports Postgres (written by finance-reports sync).
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import {
	BarChart,
	ReportPage,
	StatTile,
	usd,
} from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

interface Row {
	month: string
	business_revenue: number
	business_expenses: number
	business_net: number
	zane_takehome: number
	household_spend: number
	est_tax_accrual: number
	net_household_profit: number
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })
	const rows = (
		await reportsQuery<Record<string, string>>(
			`SELECT * FROM household_profit_monthly ORDER BY month`,
		)
	).map(r => {
		const out = {} as Row
		for (const [k, v] of Object.entries(r))
			(out as any)[k] = k === 'month' ? v : Number(v)
		return out
	})
	const now = new Date()
	const curMonth = now.toISOString().slice(0, 7)
	const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
		.toISOString()
		.slice(0, 7)
	const full = rows.filter(r => r.month < curMonth)
	const last12 = full.slice(-12)
	return json({
		configured: true as const,
		rows,
		last: full.find(r => r.month === lastMonth)?.net_household_profit ?? null,
		lastMonth,
		avg12: last12.length
			? last12.reduce((s, r) => s + r.net_household_profit, 0) / last12.length
			: null,
		ytd: rows
			.filter(r => r.month >= `${now.getUTCFullYear()}-01`)
			.reduce((s, r) => s + r.net_household_profit, 0),
		ytdCash: rows
			.filter(r => r.month >= `${now.getUTCFullYear()}-01`)
			.reduce((s, r) => s + r.net_household_profit + r.est_tax_accrual, 0),
	})
}

export default function HouseholdProfit() {
	const data = useLoaderData<typeof loader>()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { rows, last, lastMonth, avg12, ytd, ytdCash } = data
	return (
		<ReportPage
			title="Household profit"
			subtitle="Business revenue − business expenses + Zane take-home − household spending − estimated taxes (30% of business net)"
		>
			<div className="tiles">
				<StatTile
					label={`${lastMonth} net`}
					value={usd(last)}
					tone={last != null && last < 0 ? 'bad' : 'good'}
				/>
				<StatTile
					label="12-month average"
					value={usd(avg12)}
					tone={avg12 != null && avg12 < 0 ? 'bad' : 'good'}
					whisper="full months only"
				/>
				<StatTile
					label="YTD net"
					value={usd(ytd)}
					tone={ytd < 0 ? 'bad' : 'good'}
					whisper="includes current partial month"
				/>
				<StatTile
					label="YTD cash kept (pre-tax)"
					value={usd(ytdCash)}
					tone={ytdCash < 0 ? 'bad' : 'good'}
					whisper="before the unpaid tax accrual"
				/>
			</div>

			<section>
				<h2>
					What we kept, by month <span className="mini">positive = money accumulated</span>
				</h2>
				<BarChart
					labels={rows.map(r => r.month)}
					series={[
						{
							name: 'Net profit',
							color: 'var(--pos)',
							values: rows.map(r => r.net_household_profit),
						},
					]}
					colorBy={v => (v >= 0 ? 'var(--pos)' : 'var(--neg)')}
					height={190}
				/>
			</section>

			<section>
				<h2>Monthly breakdown</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Month</th>
								<th className="num">Biz revenue</th>
								<th className="num">Biz expenses</th>
								<th className="num">Biz net</th>
								<th className="num">Zane take-home</th>
								<th className="num">Household spend</th>
								<th className="num">Cash kept (pre-tax)</th>
								<th className="num">Est. taxes (30%)</th>
								<th className="num">Net after taxes</th>
							</tr>
						</thead>
						<tbody>
							{rows.map(r => (
								<tr key={r.month}>
									<td>{r.month}</td>
									<td className="num">+ {usd(r.business_revenue)}</td>
									<td className="num">− {usd(r.business_expenses)}</td>
									<td className="num">{usd(r.business_net)}</td>
									<td className="num">+ {usd(r.zane_takehome)}</td>
									<td className="num">− {usd(r.household_spend)}</td>
									<td
										className={`num ${r.net_household_profit + r.est_tax_accrual < 0 ? 'bad' : 'good'}`}
									>
										{usd(r.net_household_profit + r.est_tax_accrual)}
									</td>
									<td className="num">− {usd(r.est_tax_accrual)}</td>
									<td className={`num ${r.net_household_profit < 0 ? 'bad' : 'good'}`}>
										{usd(r.net_household_profit)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					Reading a row left to right is the equation: revenue minus expenses is business
					net; plus take-home, minus household spending, equals <strong>cash kept</strong> -
					the money that actually moved. The tax column is an <strong>accrual</strong>, not a
					payment: no quarterlies have been paid, so "net after taxes" is what's left once
					the April bill is honestly set aside. Cash kept ≈ $0 is why the cards can be paid
					in full each month while nothing accumulates.
				</p>
			</section>
		</ReportPage>
	)
}
