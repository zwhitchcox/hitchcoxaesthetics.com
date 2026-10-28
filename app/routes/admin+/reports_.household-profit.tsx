/**
 * Household profit, native replacement for Metabase dashboard 11.
 * business revenue − business expenses + Zane take-home − household spending −
 * estimated taxes = what we kept, per month. Reads household_profit_monthly in
 * the reports Postgres (written by finance-reports sync).
 */
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData, useSearchParams } from '@remix-run/react'
import { Fragment } from 'react'
import {
	BarChart,
	ReportPage,
	StatTile,
	revalidateUnlessOnly,
	usd,
} from '#app/components/report-ui'
import { SettingsDialog } from '#app/components/settings-dialog.tsx'
import { handleAnnualFeeForm, loadAnnualFees } from '#app/utils/annual-fees.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { HISTORY_FROM } from '#app/utils/finance-reports.server.ts'
import {
	buildTable,
	RANGE_KEYS,
	RANGE_OPTIONS,
	type RangeKey,
	resolveRange,
} from '#app/utils/household-profit.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { bankCheck, groupBalances, isOwed } from '#app/utils/plaid-balances.ts'
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
	/** Cash net with once-a-year business fees spread ÷12; NaN before the
	 * finance sync first writes the column. The cash column above stays the
	 * FCF truth. */
	net_household_profit_smoothed?: number
	/** Kept, but moved to savings outside the linked accounts. */
	saved_outside?: number
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
	// Latest balance per linked account, written by the plaid-sync job. The
	// page reads the mirror only; it never calls Plaid.
	const checkFrom = new Date(Date.now() - 100 * 24 * 3600e3).toISOString().slice(0, 10)
	const [balanceRows, latestBalance, fees, snapshots, dailyRows] = await Promise.all([
		prisma.plaidAccountBalance.findMany({
			select: {
				accountId: true,
				owner: true,
				institution: true,
				name: true,
				mask: true,
				type: true,
				subtype: true,
				current: true,
				available: true,
				creditLimit: true,
			},
			orderBy: [{ owner: 'asc' }, { institution: 'asc' }, { name: 'asc' }],
		}),
		prisma.plaidAccountBalance.findFirst({
			orderBy: { fetchedAt: 'desc' },
			select: { fetchedAt: true },
		}),
		loadAnnualFees(),
		// The bank check: daily balance history and the report's cash by day,
		// both written by the finance sync (missing until its first run).
		reportsQuery<{ day: string; account_id: string; type: string; current: string }>(
			`SELECT day, account_id, type, current FROM plaid_balance_daily WHERE day >= $1`,
			[checkFrom],
		).catch(() => []),
		reportsQuery<{
			day: string
			business_revenue: string
			business_expenses: string
			takehome: string
			household_spend: string
			saved: string
		}>(
			`SELECT day, business_revenue, business_expenses, takehome, household_spend, saved
			 FROM household_kept_daily WHERE day >= $1 ORDER BY day`,
			[HISTORY_FROM],
		).catch(() => []),
	])
	// The bank's cash day by day: the date ranges that are not whole months
	// add these up, and the bank check compares them with the balances.
	const days = dailyRows.map(r => ({
		day: r.day,
		revenue: Number(r.business_revenue),
		expenses: Number(r.business_expenses),
		takehome: Number(r.takehome),
		spend: Number(r.household_spend),
		saved: Number(r.saved),
	}))
	const balancesAsOf = latestBalance
		? latestBalance.fetchedAt.toLocaleString('en-US', {
				timeZone: 'America/New_York',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			})
		: null
	const now = new Date()
	const curMonth = now.toISOString().slice(0, 7)
	const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
		.toISOString()
		.slice(0, 7)
	const ytdRows = rows.filter(r => r.month >= `${now.getUTCFullYear()}-01`)
	const full = rows.filter(r => r.month < curMonth)
	const last12 = full.slice(-12)
	const lastRow = full.find(r => r.month === lastMonth)
	return json({
		configured: true as const,
		rows,
		days,
		today: now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
		firstDay: HISTORY_FROM,
		dataThrough: days.at(-1)?.day ?? HISTORY_FROM,
		fees,
		balances: groupBalances(balanceRows),
		balancesAsOf,
		last: lastRow?.net_household_profit ?? null,
		lastCash: lastRow
			? lastRow.net_household_profit + lastRow.est_tax_accrual
			: null,
		lastMonth,
		avg12: last12.length
			? last12.reduce((s, r) => s + r.net_household_profit, 0) / last12.length
			: null,
		ytd: ytdRows.reduce((s, r) => s + r.net_household_profit, 0),
		ytdCash: ytdRows.reduce(
			(s, r) => s + r.net_household_profit + r.est_tax_accrual,
			0,
		),
		ytdSaved: ytdRows.reduce((s, r) => s + (r.saved_outside || 0), 0),
		check: bankCheck(
			snapshots.map(r => ({
				day: r.day,
				accountId: r.account_id,
				type: r.type,
				current: Number(r.current),
			})),
			days
				.filter(d => d.day >= checkFrom)
				.map(d => ({
					day: d.day,
					kept: d.revenue - d.expenses + d.takehome - d.spend,
					saved: d.saved,
				})),
		),
	})
}

// The date range lives in the URL and only filters the loaded rows.
export const shouldRevalidate = revalidateUnlessOnly(['range', 'from', 'to'])

const longDay = (day: string) =>
	new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	})
const shortDay = (day: string) =>
	new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	})

// The Settings dialog's annual fee forms post here.
export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const result = await handleAnnualFeeForm(await request.formData())
	return json(result, { status: result.ok ? 200 : 400 })
}

export default function HouseholdProfit() {
	const data = useLoaderData<typeof loader>()
	const [searchParams, setSearchParams] = useSearchParams()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const {
		rows,
		days,
		today,
		firstDay,
		dataThrough,
		fees,
		balances,
		balancesAsOf,
		last,
		lastCash,
		lastMonth,
		avg12,
		ytd,
		ytdCash,
		ytdSaved,
		check,
	} = data
	// Last 12 months by default, as before. Custom keeps its days in the URL.
	const range: RangeKey =
		RANGE_KEYS.find(k => k === searchParams.get('range')) ?? 'last12Months'
	const custom = {
		from: searchParams.get('from') ?? undefined,
		to: searchParams.get('to') ?? undefined,
	}
	const table = buildTable({
		key: range,
		today,
		custom,
		firstDay,
		dataThrough,
		months: rows,
		days,
	})
	const setParams = (next: Record<string, string | null>) =>
		setSearchParams(
			prev => {
				const p = new URLSearchParams(prev)
				for (const [k, v] of Object.entries(next)) {
					if (v == null) p.delete(k)
					else p.set(k, v)
				}
				return p
			},
			{ replace: true, preventScrollReset: true },
		)
	const pickRange = (next: RangeKey) => {
		if (next === 'custom') {
			// Start the custom days from the range on screen.
			const shown = resolveRange(range, today, custom)
			setParams({ range: 'custom', from: shown.from, to: shown.to })
		} else setParams({ range: next === 'last12Months' ? null : next, from: null, to: null })
	}
	const rowLabel = (key: string) => (table.unit === 'day' ? shortDay(key) : key)
	const tone = (v: number | null) => (v == null ? '' : v < 0 ? 'bad' : 'good')
	const { total } = table
	return (
		<ReportPage
			title="Household profit"
			actions={<SettingsDialog fees={fees} />}
			subtitle="Business revenue − business expenses + Zane take-home − household spending − estimated taxes (30% of business net)"
		>
			<div className="tiles">
				<StatTile
					label={`${lastMonth} cash kept`}
					value={usd(lastCash)}
					tone={lastCash != null && lastCash < 0 ? 'bad' : 'good'}
					whisper="pre-tax, the money that moved"
				/>
				<StatTile
					label={`${lastMonth} net after taxes`}
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
					whisper={
						ytdSaved > 0
							? `before taxes; ${usd(ytdSaved)} of it moved to savings`
							: 'before the unpaid tax accrual'
					}
				/>
			</div>
			{check ? (
				<p className="note">
					{check.ready ? (
						<>
							<strong>
								Bank check, {check.from} to {check.to}:
							</strong>{' '}
							the linked accounts (cash minus card debt) changed{' '}
							{usd(check.bank)}. The report says we kept {usd(check.kept)}
							{check.saved > 0
								? `, and ${usd(check.saved)} of it moved to savings`
								: ''}
							. Difference:{' '}
							<strong
								style={
									Math.abs(check.diff) > 1000
										? { color: 'var(--bad-text)' }
										: undefined
								}
							>
								{usd(check.diff)}
							</strong>
							. A small difference comes from pending charges and the
							bank's one-day lag. A difference that keeps growing means the
							report misses money.
						</>
					) : (
						<>
							<strong>Bank check:</strong> the first daily balance is from{' '}
							{check.from}. The check starts after the next daily sync.
						</>
					)}
				</p>
			) : null}

			<div className="controls" style={{ flexWrap: 'wrap' }}>
				<label htmlFor="date-range">Date range</label>
				<select
					id="date-range"
					value={range}
					onChange={e => pickRange(e.target.value as RangeKey)}
				>
					{RANGE_OPTIONS.map(o => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				{range === 'custom' ? (
					<>
						<input
							type="date"
							aria-label="First day"
							value={table.from}
							min={firstDay}
							max={today}
							onChange={e => e.target.value && setParams({ from: e.target.value })}
						/>
						<span>to</span>
						<input
							type="date"
							aria-label="Last day"
							value={table.to}
							min={firstDay}
							max={today}
							onChange={e => e.target.value && setParams({ to: e.target.value })}
						/>
					</>
				) : null}
				<span className="dim">
					{longDay(table.from)} to {longDay(table.to)}
					{table.unit === 'day' || table.to > dataThrough
						? ` · bank data through ${longDay(dataThrough)}`
						: ''}
				</span>
			</div>

			<section>
				<h2>
					What we kept, by {table.unit}{' '}
					<span className="mini">
						cash kept = actual cash flow; after taxes = with 30% of biz net set aside
					</span>
				</h2>
				<BarChart
					labels={table.rows.map(r => rowLabel(r.key))}
					series={[
						{
							name: 'Cash kept (pre-tax)',
							color: 'var(--series-1)',
							values: table.rows.map(r => r.kept),
						},
						// Taxes are estimated month by month only on whole-month ranges.
						...(table.rows.every(r => r.afterTax != null)
							? [
									{
										name: 'Net after taxes',
										color: 'var(--series-3)',
										values: table.rows.map(r => r.afterTax ?? 0),
									},
								]
							: []),
					]}
					showTotal={false}
					height={190}
				/>
			</section>

			<section>
				<h2>{table.unit === 'day' ? 'Daily' : 'Monthly'} breakdown</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>{table.unit === 'day' ? 'Day' : 'Month'}</th>
								<th className="num">Biz revenue</th>
								<th className="num">Biz expenses</th>
								<th className="num">Biz net</th>
								<th className="num">Zane take-home</th>
								<th className="num">Household spend</th>
								<th className="num">Cash kept (pre-tax)</th>
								<th className="num">Est. taxes (30%)</th>
								<th className="num">Net after taxes</th>
								<th className="num">Net, annual fees ÷12</th>
							</tr>
						</thead>
						<tbody>
							{table.rows.length === 0 ? (
								<tr>
									<td colSpan={10} className="dim">
										The bank has not reported these days yet. Bank data goes
										through {longDay(dataThrough)}.
									</td>
								</tr>
							) : null}
							{table.rows.map(r => (
								<tr key={r.key}>
									<td>{rowLabel(r.key)}</td>
									<td className="num">+ {usd(r.revenue)}</td>
									<td className="num">− {usd(r.expenses)}</td>
									<td className="num">{usd(r.net)}</td>
									<td className="num">+ {usd(r.takehome)}</td>
									<td className="num">− {usd(r.spend)}</td>
									<td className={`num ${r.kept < 0 ? 'bad' : 'good'}`}>{usd(r.kept)}</td>
									<td className="num">{r.tax == null ? '-' : `− ${usd(r.tax)}`}</td>
									<td className={`num ${tone(r.afterTax)}`}>
										{r.afterTax == null ? '-' : usd(r.afterTax)}
									</td>
									<td className={`num ${tone(r.smoothed)}`}>
										{r.smoothed == null ? '-' : usd(r.smoothed)}
									</td>
								</tr>
							))}
						</tbody>
						<tfoot>
							<tr>
								<td>
									Total, {table.rows.length} {table.unit}
									{table.rows.length === 1 ? '' : 's'}
								</td>
								<td className="num">+ {usd(total.revenue)}</td>
								<td className="num">− {usd(total.expenses)}</td>
								<td className="num">{usd(total.net)}</td>
								<td className="num">+ {usd(total.takehome)}</td>
								<td className="num">− {usd(total.spend)}</td>
								<td className={`num ${total.kept < 0 ? 'bad' : 'good'}`}>{usd(total.kept)}</td>
								<td className="num">− {usd(total.tax)}</td>
								<td className={`num ${tone(total.afterTax)}`}>{usd(total.afterTax)}</td>
								<td className={`num ${tone(total.smoothed)}`}>
									{total.smoothed == null ? '-' : usd(total.smoothed)}
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<p className="note">
					Reading a row left to right is the equation: revenue minus expenses is business
					net; plus take-home, minus household spending, equals <strong>cash kept</strong>,
					the money that actually moved. Every dollar that enters or leaves the bank
					counts. A transfer or card payment is left out only when its other side
					shows up in another linked account. So business checks and payroll are
					business expenses, cash and check deposits are revenue, and Venmo, cash
					and payments to cards we cannot see (the Apple Card after its last export,
					a second Citi card that is not linked) are household spending. Money moved to
					savings (Goldman Sachs) counts as kept. The last column re-states net with
					the once-a-year business fees from Settings (top right) spread ÷12, the
					trend view; every other column stays cash-true. The tax column is an{' '}
					<strong>accrual</strong>, not a payment: no quarterlies have been paid, so
					"net after taxes" is what's left once the April bill is set aside. For the
					current partial month, fixed monthly business bills (rent, software,
					insurance) are accrued evenly across the month instead of on their
					payment date; variable spend (supplies etc.) stays on actual dates.
					Revenue for the current month also includes Boulevard money collected
					after the last banked payout (payouts lag 2-3 business days), so a busy
					day shows up the same day instead of when the deposit lands. The data
					goes back to {longDay(firstDay)}, the first full month with data from every
					linked bank account and card; the Total row adds up the rows shown. A date
					range of whole months uses these monthly numbers. Any other range adds up
					the bank's cash day by day, as it posted (no payouts on the way, no bills
					spread over the month), and estimates the taxes on its total only.
				</p>
			</section>

			<section>
				<h2>
					Account balances{' '}
					<span className="mini">
						every linked account as the bank last reported it
						{balancesAsOf ? ` · synced ${balancesAsOf} ET` : ''}
					</span>
				</h2>
				{balances.groups.length === 0 ? (
					<p className="note">
						No balances yet. The Plaid sync writes them on its next run (daily, or
						Run Now on the <a href="/admin/bg">background jobs</a> page).
					</p>
				) : (
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Account</th>
									<th>Type</th>
									<th className="num">Balance</th>
									<th className="num">Available</th>
									<th className="num">Limit</th>
								</tr>
							</thead>
							<tbody>
								{balances.groups.map(g => (
									<Fragment key={g.owner}>
										<tr>
											<td colSpan={2}>
												<strong>{g.label}</strong>
											</td>
											<td className={`num ${g.net < 0 ? 'bad' : 'good'}`}>
												<strong>{usd(g.net)}</strong> net
											</td>
											<td className="num dim" colSpan={2}>
												{usd(g.cash)} cash − {usd(g.owed)} owed
											</td>
										</tr>
										{g.rows.map(r => (
											<tr key={r.accountId}>
												<td>
													{r.institution} · {r.name}
													{r.mask ? ` ····${r.mask}` : ''}
												</td>
												<td>{r.subtype ?? r.type}</td>
												<td className="num">
													{isOwed(r.type) ? `− ${usd(r.current)}` : usd(r.current)}
												</td>
												<td className="num">{usd(r.available)}</td>
												<td className="num">{r.creditLimit ? usd(r.creditLimit) : '-'}</td>
											</tr>
										))}
									</Fragment>
								))}
								<tr>
									<td colSpan={2}>
										<strong>All accounts</strong>
									</td>
									<td className={`num ${balances.net < 0 ? 'bad' : 'good'}`}>
										<strong>{usd(balances.net)}</strong> net
									</td>
									<td className="num dim" colSpan={2}>
										{usd(balances.cash)} cash − {usd(balances.owed)} owed
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				)}
				<p className="note">
					Business is Sarah's logins, Personal is Zane's. A bank balance is cash
					held. A card or line-of-credit balance is money owed, shown with a
					minus. Net is cash minus owed. Plaid reports each balance as of its
					last pull, which can lag the bank by a day, and the sync runs once a
					day.
				</p>
			</section>
		</ReportPage>
	)
}
