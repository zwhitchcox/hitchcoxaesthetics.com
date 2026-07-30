/**
 * Finance reports sync: computes the household budget (PlaidTransaction
 * archive) and the rolling 6-month revenue projection (Boulevard), and loads
 * both into the reports Postgres that Metabase reads
 * (https://hitchcox-metabase.fly.dev, "Household Budget" and "Projected
 * Revenue" dashboards; cards were created once by
 * sha-reports/bin/setup-finance-dashboards.ts and read these tables).
 *
 * Runs on the Temporal worker (see app/temporal/), the manual equivalent is
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
		// household_profit_monthly reads tables this sync recreates, drop it
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
		await q(`create table revenue_projection_daily (day date primary key, weekday text, booked_usd numeric, booked_count int, fill_usd numeric, expected_new_count numeric, expected_usd numeric, booked_usd_v4 numeric, fill_usd_v4 numeric, expected_usd_v4 numeric)`)
		const days = projection.expected_fill?.days ?? []
		for (let i = 0; i < days.length; i++) {
			const day = new Date(winStart.getTime() + i * 86400_000).toISOString().slice(0, 10)
			const r = days[i]!
			await q(`insert into revenue_projection_daily values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [day, r.weekday, r.bookedUsd, r.bookedCount, r.fillUsd, r.expectedNewCount, r.expectedUsd, r.bookedUsdV4, r.fillUsdV4, r.expectedUsdV4])
		}

		// Frozen daily forecasts, APPEND-ONLY, one row per (compute_date, day,
		// model). The first write each day wins (ON CONFLICT DO NOTHING), so a
		// cancellation later that day is judged against the morning's frozen
		// numbers instead of being silently absorbed by a regeneration.
		// RULE (Zane): when the algorithm changes, write the new output under a
		// NEW model label next to this one, never delete or overwrite a label.
		// Since 2026-07-22 the live table carries daily_v2_cadence (per-client
		// weight-loss valuation); daily_v1 keeps snapshotting from its own fields
		// so the two models stay comparable day by day.
		await q(`create table if not exists revenue_projection_daily_snapshots (
			compute_date date not null,
			day date not null,
			model text not null,
			weekday text, booked_usd numeric, booked_count int,
			fill_usd numeric, expected_new_count numeric, expected_usd numeric,
			primary key (compute_date, day, model))`)
		for (let i = 0; i < days.length; i++) {
			const day = new Date(winStart.getTime() + i * 86400_000).toISOString().slice(0, 10)
			const r = days[i]!
			await q(
				`insert into revenue_projection_daily_snapshots
				 values (current_date, $1, 'daily_v1', $2, $3, $4, $5, $6, $7)
				 on conflict (compute_date, day, model) do nothing`,
				[day, r.weekday, r.bookedUsdV1, r.bookedCount, r.fillUsdV1, r.expectedNewCount, r.expectedUsdV1],
			)
		}
		await q(
			`insert into revenue_projection_daily_snapshots
			 select current_date, day, 'daily_v2_cadence', weekday, booked_usd,
			   booked_count, fill_usd, expected_new_count, expected_usd
			 from revenue_projection_daily
			 on conflict (compute_date, day, model) do nothing`,
		)

		// ---- daily_v4_perkept ----
		// Replaces daily_v3_calibrated, which multiplied v2 by the median
		// actual/predicted ratio over past weeks. That was a correction factor
		// standing in for a bug, not a model: v2 counted kept visits over 365
		// days of backfilled appointments but could only see revenue back to the
		// March 2026 Boulevard migration, so its per-visit averages were divided
		// by a denominator spanning twice the period its numerator covered.
		// v4 fixes the window itself (see app/utils/revenue-valuation.server.ts),
		// which removes the need for any calibration multiplier: backtested over
		// 14 complete weeks it is unbiased (median actual/predicted 1.02-1.05)
		// where v2 ran 2.2x-3.3x light.
		// RULE (Zane): new label beside v1/v2/v3, never overwrite any of them.
		// Every daily_v3_calibrated row already frozen into
		// revenue_projection_daily_snapshots stays untouched; v3 simply stops
		// being computed for new days.
		await q(
			`insert into revenue_projection_daily_snapshots
			 select current_date, day, 'daily_v4_perkept', weekday, booked_usd_v4,
			   booked_count, fill_usd_v4, expected_new_count, expected_usd_v4
			 from revenue_projection_daily
			 on conflict (compute_date, day, model) do nothing`,
		)

		await q(`drop table if exists revenue_projection_summary`)
		await q(`create table revenue_projection_summary (id int primary key, window_start date, window_end date, gross_expected_usd numeric, cancellation_rate numeric, expected_cancellations_usd numeric, net_expected_usd numeric, generated_at timestamptz, net_expected_usd_v4 numeric)`)
		const s = projection.summary
		await q(`insert into revenue_projection_summary values (1,$1,$2,$3,$4,$5,$6, now(), $7)`, [
			projection.window.start.slice(0, 10),
			projection.window.end.slice(0, 10),
			s.expected_total_revenue_usd,
			s.cancellation_rate,
			s.expected_cancellations_usd,
			s.expected_net_revenue_usd,
			s.v4_expected_net_revenue_usd,
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
			   'daily_fill_v2'
			 from revenue_projection_daily
			 where date_trunc('week', day) >= date_trunc('week', now())
			 group by 1 order by 1 limit 4`,
		)
		// Same forward snapshot under the v4 label, so week-over-week projection
		// accuracy can be compared between models on equal terms. v4 is already
		// net, so lo/hi are a plain +/-15% band (roughly the backtested spread)
		// rather than another cancellation haircut.
		await q(
			`insert into revenue_projection
			   (week, booked_appts, lead_share, rev_per_appt, projected_appts,
			    projected_revenue, projected_lo, projected_hi, model)
			 select date_trunc('week', day)::date,
			   coalesce(sum(booked_count), 0),
			   0,
			   case when coalesce(sum(booked_count), 0) + coalesce(sum(expected_new_count), 0) > 0
			     then round(sum(expected_usd_v4) / (sum(booked_count) + sum(expected_new_count)))
			     else 0 end,
			   round(coalesce(sum(booked_count), 0) + coalesce(sum(expected_new_count), 0)),
			   round(sum(expected_usd_v4)),
			   round(sum(expected_usd_v4) * 0.85),
			   round(sum(expected_usd_v4) * 1.15),
			   'daily_fill_v4'
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
		// weeks at once), Plaid tags them TRANSFER_IN_DEPOSIT, not INCOME. So
		// take-home = mobile deposits + INCOME rows, excluding tax refunds
		// (lumpy, prior-year, taxes are handled by the accrual line instead).
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
		// − estimated tax accrual. Three tax components (docs/taxes/README.md):
		//   federal: 30% of positive business net approximates the household's
		//     2026 marginal rate on SHA profit (SE + income tax after QBI; from
		//     the 2025 return analysis). W-2 tax is already withheld from
		//     take-home. Adjust the 0.30 here if the CPA lands elsewhere.
		//   tn_business: TN business tax is 0.375% of GROSS receipts (Class 3
		//     retailer, Knox County 0.1875% + Knoxville 0.1875%), expenses never
		//     reduce it. Filed annually on TNTAP, due Apr 15.
		//   tn_excise: TN franchise & excise, 6.5% of positive net earnings.
		//     Applies to the LLC even though it is federally disregarded. Bank
		//     net overstates the excise base (no depreciation here; the 2025
		//     return had $136k of depreciation), so this accrues conservatively
		//     high. Franchise tax (0.25% of net worth, min $100/yr) is noise at
		//     this scale and is left out of the monthly accrual.
		// Sales tax is collected from customers and remitted, pass-through, not
		// accrued here.
		await q(`create view household_profit_monthly as
			select b.month,
			  round(b.revenue) as business_revenue,
			  round(b.expenses) as business_expenses,
			  round(b.net) as business_net,
			  round(coalesce(i.takehome, 0)) as zane_takehome,
			  round(coalesce(h.total, 0)) as household_spend,
			  round(greatest(b.net, 0) * 0.30) as est_tax_federal,
			  round(b.revenue * 0.00375) as est_tax_tn_business,
			  round(greatest(b.net, 0) * 0.065) as est_tax_tn_excise,
			  round(greatest(b.net, 0) * 0.365 + b.revenue * 0.00375) as est_tax_accrual,
			  round(b.net + coalesce(i.takehome, 0) - coalesce(h.total, 0)
			        - greatest(b.net, 0) * 0.365 - b.revenue * 0.00375) as net_household_profit
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
