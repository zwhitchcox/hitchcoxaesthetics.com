/**
 * Profit & taxes outlook, the "will we break even after taxes" instrument.
 * Projects each remaining month of 2026 (and Jan → Apr 15, 2027) from live
 * inputs: the booking-pace revenue projection, trailing-6-month average
 * business expenses, take-home, and household spending. Shows the growing
 * unpaid 2026 tax bill and whether cash accumulated by April 15 covers it,
 * under current spending and under the $18,500/mo household target.
 *
 * The revenue projection extrapolates the CURRENT booking pace (which bakes
 * in new customers at today's acquisition rate), it does not compound
 * growth, so treat it as the conservative floor.
 */
import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { BarChart, ReportPage, StatTile, usd } from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Household profit & taxes outlook' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const TAX_RATE = 0.3
const HOUSEHOLD_TARGET = 18500

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })

	const curMonth = new Date().toLocaleDateString('en-CA', {
		timeZone: 'America/New_York',
	}).slice(0, 7)
	const year = curMonth.slice(0, 4)

	const [projMonths, avgs, actuals] = await Promise.all([
		reportsQuery<{ month: string; rev: string }>(
			`SELECT month, round(net_after_cancellations_usd) AS rev
			 FROM report_revenue_projection_monthly WHERE month >= $1 ORDER BY month`,
			[curMonth],
		),
		reportsQuery<{ takehome: string; spend: string }>(
			`SELECT
				(SELECT round(avg(zane_takehome)) FROM (
					SELECT zane_takehome FROM household_profit_monthly
					WHERE month < $1 ORDER BY month DESC LIMIT 6) t) AS takehome,
				(SELECT round(avg(household_spend)) FROM (
					SELECT household_spend FROM household_profit_monthly
					WHERE month < $1 ORDER BY month DESC LIMIT 6) t) AS spend`,
			[curMonth],
		),
		reportsQuery<{ month: string; net: string; accrual: string; cash: string }>(
			`SELECT month, business_net AS net, est_tax_accrual AS accrual,
				(net_household_profit + est_tax_accrual) AS cash
			 FROM household_profit_monthly
			 WHERE month >= $1 AND month < $2 ORDER BY month`,
			[`${year}-01`, curMonth],
		),
	])
	// Trailing-6-month average expenses (the subquery above is guarded, but
	// compute properly here for correctness).
	const expRows = await reportsQuery<{ exp: string }>(
		`SELECT round(avg(expenses)) AS exp FROM (
			SELECT expenses FROM business_pnl_monthly WHERE month < $1
			ORDER BY month DESC LIMIT 6) t`,
		[curMonth],
	)
	const avgExpenses = Number(expRows[0]?.exp ?? 0)
	const avgTakehome = Number(avgs[0]?.takehome ?? 0)
	const avgSpend = Number(avgs[0]?.spend ?? 0)

	return json({
		configured: true as const,
		curMonth,
		year,
		projMonths: projMonths.map(m => ({ month: m.month, rev: Number(m.rev) })),
		avgExpenses,
		avgTakehome,
		avgSpend,
		actuals: actuals.map(a => ({
			month: a.month,
			net: Number(a.net),
			accrual: Number(a.accrual),
			cash: Number(a.cash),
		})),
	})
}

export default function ProfitOutlook() {
	const data = useLoaderData<typeof loader>()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { curMonth, year, projMonths, avgExpenses, avgTakehome, avgSpend, actuals } = data

	// ---- projected months (current month onward, through December) ----
	const projected = projMonths.map(m => {
		const net = m.rev - avgExpenses
		const accrual = Math.max(0, net) * TAX_RATE
		return {
			month: m.month,
			rev: m.rev,
			net,
			accrual,
			cashCurrent: net + avgTakehome - avgSpend,
			cashTarget: net + avgTakehome - HOUSEHOLD_TARGET,
		}
	})

	// ---- the 2026 tax bill (accrued, unpaid, no quarterlies have gone out) ----
	const accruedYtd = actuals.reduce((s, a) => s + a.accrual, 0)
	const accruedProjected = projected.reduce((s, m) => s + m.accrual, 0)
	const taxBill = accruedYtd + accruedProjected

	// ---- cash accumulation through April 15 next year ----
	const cashYtd = actuals.reduce((s, a) => s + a.cash, 0)
	const cash2026Current = projected.reduce((s, m) => s + m.cashCurrent, 0)
	const cash2026Target = projected.reduce((s, m) => s + m.cashTarget, 0)
	// Jan 1 → Apr 15 ≈ 3.5 months at Q4's projected run rate.
	const q4 = projected.slice(-3)
	const q4NetAvg = q4.length
		? q4.reduce((s, m) => s + m.net, 0) / q4.length
		: 0
	const springMonths = 3.5
	const springCurrent = springMonths * (q4NetAvg + avgTakehome - avgSpend)
	const springTarget = springMonths * (q4NetAvg + avgTakehome - HOUSEHOLD_TARGET)
	const byApril15Current = cashYtd + cash2026Current + springCurrent
	const byApril15Target = cashYtd + cash2026Target + springTarget

	const verdict = (cash: number) => cash - taxBill

	const allMonths = [
		...actuals.map(a => ({ month: a.month, cash: a.cash, kind: 'actual' as const })),
		...projected.map(m => ({ month: m.month, cash: m.cashCurrent, kind: 'projected' as const })),
	]

	return (
		<ReportPage
			title="Household profit & taxes outlook"
			subtitle={`Live projection through Apr 15, ${Number(year) + 1}, booking-pace revenue model (includes new customers at today's acquisition rate, no compounded growth), trailing-6-month averages for business expenses ($${avgExpenses.toLocaleString()}), Zane's take-home ($${avgTakehome.toLocaleString()}), and household spending ($${avgSpend.toLocaleString()})`}
		>
			<div className="tiles">
				<StatTile
					label={`${year} tax bill on BUSINESS profit (accruing, unpaid)`}
					value={usd(taxBill)}
					tone="bad"
					whisper={`${usd(accruedYtd)} accrued so far + ${usd(accruedProjected)} projected · W-2 tax is already withheld from paychecks, this is the extra the household owes next April`}
				/>
				<StatTile
					label="Household cash by Apr 15, current spending"
					value={usd(byApril15Current)}
					tone={verdict(byApril15Current) < 0 ? 'bad' : 'good'}
					whisper={`${verdict(byApril15Current) < 0 ? 'DEFICIT' : 'surplus'} ${usd(Math.abs(verdict(byApril15Current)))} vs the bill`}
				/>
				<StatTile
					label={`Household cash by Apr 15, $${HOUSEHOLD_TARGET.toLocaleString()}/mo spending`}
					value={usd(byApril15Target)}
					tone={verdict(byApril15Target) < 0 ? 'bad' : 'good'}
					whisper={`${verdict(byApril15Target) < 0 ? 'DEFICIT' : 'surplus'} ${usd(Math.abs(verdict(byApril15Target)))} vs the bill`}
				/>
			</div>

			<section>
				<h2>
					Household cash kept by month <span className="mini">pre-tax · actuals then projection</span>
				</h2>
				<BarChart
					labels={allMonths.map(m => m.month)}
					series={[
						{
							name: 'Cash kept (pre-tax)',
							color: 'var(--pos)',
							values: allMonths.map(m => m.cash),
						},
					]}
					colorBy={v => (v >= 0 ? 'var(--pos)' : 'var(--neg)')}
					height={180}
					tickEvery={1}
				/>
				<p className="note">
					Months before {curMonth} are actuals from the household profit statement;
					{curMonth} onward uses the projection. Cash kept is before any tax payment -
					it's what's available to point at the bill.
				</p>
			</section>

			<section>
				<h2>Projected months</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Month</th>
								<th className="num">Projected revenue</th>
								<th className="num">Avg expenses</th>
								<th className="num">Biz net</th>
								<th className="num">Tax accrual (30% of biz net)</th>
								<th className="num">Household cash kept (current spend)</th>
								<th className="num">Household cash kept (${HOUSEHOLD_TARGET.toLocaleString()} target)</th>
							</tr>
						</thead>
						<tbody>
							{projected.map(m => (
								<tr key={m.month}>
									<td>{m.month}</td>
									<td className="num">{usd(m.rev)}</td>
									<td className="num">− {usd(avgExpenses)}</td>
									<td className="num">{usd(m.net)}</td>
									<td className="num">{usd(m.accrual)}</td>
									<td className={`num ${m.cashCurrent < 0 ? 'bad' : 'good'}`}>{usd(m.cashCurrent)}</td>
									<td className={`num ${m.cashTarget < 0 ? 'bad' : 'good'}`}>{usd(m.cashTarget)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					Jan 1 – Apr 15 of {Number(year) + 1} is estimated as 3.5 months at Q4's
					projected run rate. The Apr 15 verdict covers the {year} bill only, Q1{' '}
					{Number(year) + 1} estimated taxes come due the same day and are NOT
					included, so the true cash need on that date is higher.
				</p>
				<p className="note">
					Scope: the tax bill here is the tax generated by the business. Federal:
					30% of business net ≈ self-employment + income tax after QBI at the
					household's marginal rate. Tennessee: business tax at 0.375% of GROSS
					receipts (expenses never reduce it) plus franchise &amp; excise at 6.5%
					of net, both due Apr 15 (docs/taxes/README.md has the filing steps).
					Total household tax also includes what's withheld from Zane's paychecks
					automatically, that part never needs saving for, which is why it isn't
					shown.
				</p>
			</section>
		</ReportPage>
	)
}
