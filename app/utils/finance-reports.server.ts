/**
 * Finance reports sync: computes the household budget (PlaidTransaction
 * archive) and the rolling 6-month revenue projection (Boulevard), and loads
 * both into the reports Postgres that Metabase reads
 * (https://hitchcox-metabase.fly.dev — "Household Budget" and "Projected
 * Revenue" dashboards; cards were created once by
 * sha-reports/bin/setup-finance-dashboards.ts and read these tables).
 *
 * Runs on the Temporal worker (see app/temporal/) — the manual equivalent is
 * sha-reports/bin/load-finance-reports.ts fed by the two scripts' --json output.
 *
 * Requires REPORTS_DATABASE_URL, e.g.
 *   postgres://<user>:<pass>@hitchcox-reports-db.internal:5432/reports  (in prod)
 *   postgres://<user>:<pass>@localhost:15432/reports                    (via fly proxy)
 */
import pg from 'pg'

import { runRevenueProjection } from '../../scripts/blvd-project-weekly-revenue.ts'
import { computeHouseholdBudget } from '../../scripts/household-budget.ts'
import { computeBusinessPnl } from '../../scripts/plaid-expenses.ts'

export function hasFinanceReportsConfig() {
	return Boolean(process.env.REPORTS_DATABASE_URL?.trim())
}

const PROJECTION_MONTHS = 6

function projectionWindow(now = new Date()) {
	// Whole months, Eastern-ish: first of the current month → first of +6 months.
	const y = now.getFullYear()
	const m = now.getMonth()
	const fmt = (yy: number, mm: number) =>
		`${yy}-${String(mm + 1).padStart(2, '0')}-01`
	return {
		fromDate: fmt(y, m),
		toDate: fmt(m + PROJECTION_MONTHS > 11 ? y + 1 : y, (m + PROJECTION_MONTHS) % 12),
	}
}

export async function syncFinanceReports(): Promise<{
	budgetRows: number
	projectionDays: number
	pnlMonths: number
}> {
	const url = process.env.REPORTS_DATABASE_URL?.trim()
	if (!url) throw new Error('REPORTS_DATABASE_URL is not set')

	const budget = await computeHouseholdBudget()
	const pnl = await computeBusinessPnl()
	const { fromDate, toDate } = projectionWindow()
	const projection = await runRevenueProjection({ fromDate, toDate, json: false })

	const client = new pg.Client({ connectionString: url })
	await client.connect()
	const q = (sql: string, params?: unknown[]) => client.query(sql, params)
	try {
		// household_profit_monthly reads tables this sync recreates — drop it
		// first so the table drops don't fail on the dependency.
		await q(`drop view if exists household_profit_monthly`)
		// ---- household budget (snapshot semantics) ----
		await q(`drop table if exists household_budget_matrix`)
		await q(`create table household_budget_matrix (month text not null, bucket text not null, amount numeric not null, primary key (month, bucket))`)
		for (const row of budget.matrix) {
			for (const [bucket, amount] of Object.entries(row)) {
				if (bucket === 'month' || typeof amount !== 'number' || amount === 0) continue
				await q(`insert into household_budget_matrix values ($1,$2,$3)`, [row.month, bucket, amount])
			}
		}

		await q(`drop table if exists household_monthly_totals`)
		await q(`create table household_monthly_totals (month text primary key, total numeric not null)`)
		for (const r of budget.monthlyTotals) await q(`insert into household_monthly_totals values ($1,$2)`, [r.month, r.total])

		await q(`drop table if exists household_category_summary`)
		await q(`create table household_category_summary (bucket text primary key, total numeric, avg_month numeric, median_month numeric)`)
		for (const r of budget.summary) await q(`insert into household_category_summary values ($1,$2,$3,$4)`, [r.bucket, r.total, r.avg, r.median])

		await q(`drop table if exists household_top_merchants`)
		await q(`create table household_top_merchants (merchant text primary key, total numeric, months int)`)
		for (const r of budget.topMerchants) await q(`insert into household_top_merchants values ($1,$2,$3)`, [r.merchant, r.total, r.months])

		await q(`drop table if exists household_recurring`)
		await q(`create table household_recurring (merchant text primary key, per_month numeric, months int)`)
		for (const r of budget.recurring) await q(`insert into household_recurring values ($1,$2,$3)`, [r.merchant, r.perMonth, r.months])

		await q(`drop table if exists household_budget_meta`)
		await q(`create table household_budget_meta (id int primary key, period_start text, period_end text, income numeric, grand_total numeric, avg_month numeric, loaded_at timestamptz)`)
		await q(`insert into household_budget_meta values (1,$1,$2,$3,$4,$5, now())`, [budget.start, budget.end, budget.income, budget.grandTotal, budget.avgMonth])

		// ---- revenue projection ----
		const winStart = new Date(projection.window.start)
		await q(`drop view if exists report_revenue_projection_monthly`)
		await q(`drop table if exists revenue_projection_daily`)
		await q(`create table revenue_projection_daily (day date primary key, weekday text, booked_usd numeric, booked_count int, fill_usd numeric, expected_new_count numeric, expected_usd numeric)`)
		const days = projection.expected_fill?.days ?? []
		for (let i = 0; i < days.length; i++) {
			const day = new Date(winStart.getTime() + i * 86400_000).toISOString().slice(0, 10)
			const r = days[i]!
			await q(`insert into revenue_projection_daily values ($1,$2,$3,$4,$5,$6,$7)`, [day, r.weekday, r.bookedUsd, r.bookedCount, r.fillUsd, r.expectedNewCount, r.expectedUsd])
		}

		await q(`drop table if exists revenue_projection_summary`)
		await q(`create table revenue_projection_summary (id int primary key, window_start date, window_end date, gross_expected_usd numeric, cancellation_rate numeric, expected_cancellations_usd numeric, net_expected_usd numeric, generated_at timestamptz)`)
		const s = projection.summary
		await q(`insert into revenue_projection_summary values (1,$1,$2,$3,$4,$5,$6, now())`, [
			projection.window.start.slice(0, 10),
			projection.window.end.slice(0, 10),
			s.expected_total_revenue_usd,
			s.cancellation_rate,
			s.expected_cancellations_usd,
			s.expected_net_revenue_usd,
		])

		// Snapshot the next 4 weeks into revenue_projection so projection
		// accuracy can be judged later ("what did we project before the week
		// started?"). Rows append with computed_at; the Saturday lead-share
		// model (sha-reports) writes the same table with model=null.
		// lo = net after cancellations (downside), hi = +5% upside.
		await q(`alter table revenue_projection add column if not exists model text`)
		await q(
			`insert into revenue_projection
			   (week, booked_appts, lead_share, rev_per_appt, projected_appts,
			    projected_revenue, projected_lo, projected_hi, model)
			 select date_trunc('week', day)::date,
			   coalesce(sum(booked_count), 0),
			   0,
			   case when coalesce(sum(booked_count), 0) + coalesce(sum(expected_new_count), 0) > 0
			     then round(sum(expected_usd) / (sum(booked_count) + sum(expected_new_count)))
			     else 0 end,
			   round(coalesce(sum(booked_count), 0) + coalesce(sum(expected_new_count), 0)),
			   round(sum(expected_usd)),
			   round(sum(expected_usd) * (1 - (select cancellation_rate from revenue_projection_summary where id = 1))),
			   round(sum(expected_usd) * 1.05),
			   'daily_fill'
			 from revenue_projection_daily
			 where date_trunc('week', day) >= date_trunc('week', now())
			 group by 1 order by 1 limit 4`,
		)

		await q(`create view report_revenue_projection_monthly as
			select to_char(day, 'YYYY-MM') as month,
			       round(sum(booked_usd)) as booked_usd,
			       round(sum(fill_usd)) as projected_fill_usd,
			       round(sum(expected_usd)) as expected_usd,
			       round(sum(expected_usd) * (1 - (select cancellation_rate from revenue_projection_summary where id = 1))) as net_after_cancellations_usd
			from revenue_projection_daily group by 1 order by 1`)

		// ---- business P&L (Sarah's accounts, cache/rules classification) ----
		await q(`drop table if exists business_pnl_monthly`)
		await q(`create table business_pnl_monthly (month text primary key, revenue numeric, expenses numeric, net numeric)`)
		for (const m of pnl.monthly) await q(`insert into business_pnl_monthly values ($1,$2,$3,$4)`, [m.month, m.revenue, m.expenses, m.net])

		await q(`drop table if exists business_pnl_meta`)
		await q(`create table business_pnl_meta (id int primary key, period_start text, period_end text, total_revenue numeric, total_expense numeric, net_profit numeric, loaded_at timestamptz)`)
		await q(`insert into business_pnl_meta values (1,$1,$2,$3,$4,$5, now())`, [pnl.start, pnl.end, pnl.totalRevenue, pnl.totalExpense, pnl.netProfit])

		// ---- household income (Zane's take-home: INCOME deposits on his accounts) ----
		const { prisma } = await import('#app/utils/db.server.ts')
		// Zane's paychecks are paper checks deposited by phone (often several
		// weeks at once) — Plaid tags them TRANSFER_IN_DEPOSIT, not INCOME. So
		// take-home = mobile deposits + INCOME rows, excluding tax refunds
		// (lumpy, prior-year — taxes are handled by the accrual line instead).
		const income = (await prisma.$queryRawUnsafe(
			`SELECT substr(date, 1, 7) AS month, sum(-amount) AS takehome
			 FROM PlaidTransaction
			 WHERE owner = 'zane' AND accountType = 'depository' AND amount < 0 AND (
			   (pfcDetailed = 'TRANSFER_IN_DEPOSIT' AND name LIKE '%DEPOSIT%MOBILE%')
			   OR (pfcPrimary = 'INCOME' AND pfcDetailed != 'INCOME_TAX_REFUND'))
			 GROUP BY 1 ORDER BY 1`,
		)) as Array<{ month: string; takehome: number }>
		await q(`drop table if exists household_income_monthly`)
		await q(`create table household_income_monthly (month text primary key, takehome numeric not null)`)
		for (const r of income)
			await q(`insert into household_income_monthly values ($1,$2)`, [r.month, r.takehome])

		// ---- total household profit: business net + take-home − household spend
		// − estimated tax accrual. 30% of positive business net approximates the
		// household's 2026 marginal rate on SHA profit (SE + income tax after
		// QBI; from the 2025 return analysis) — W-2 tax is already withheld from
		// take-home. Adjust the 0.30 here if the CPA lands elsewhere.
		await q(`create view household_profit_monthly as
			select b.month,
			  round(b.revenue) as business_revenue,
			  round(b.expenses) as business_expenses,
			  round(b.net) as business_net,
			  round(coalesce(i.takehome, 0)) as zane_takehome,
			  round(coalesce(h.total, 0)) as household_spend,
			  round(greatest(b.net, 0) * 0.30) as est_tax_accrual,
			  round(b.net + coalesce(i.takehome, 0) - coalesce(h.total, 0) - greatest(b.net, 0) * 0.30) as net_household_profit
			from business_pnl_monthly b
			left join household_income_monthly i using (month)
			left join household_monthly_totals h using (month)
			order by b.month`)

		await q(`grant select on all tables in schema public to metabase_ro`)

		let budgetRows = 0
		for (const row of budget.matrix)
			budgetRows += Object.entries(row).filter(([k, v]) => k !== 'month' && typeof v === 'number' && v !== 0).length
		return { budgetRows, projectionDays: days.length, pnlMonths: pnl.monthly.length }
	} finally {
		await client.end()
	}
}
