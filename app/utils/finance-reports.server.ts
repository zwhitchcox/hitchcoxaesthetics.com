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
import { shiftDay } from '#app/utils/revenue-by-source.server.ts'

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

		// Per-service-type projection snapshot for the accuracy table: booked
		// appointments for the current + next 3 weeks, valued with the same
		// v4 valuation as every other surface, grouped by revenue category.
		// Future weeks refresh on every run; a week FREEZES once it starts,
		// so past rows stay the honest pre-week projection (never recomputed:
		// cancelled appointments would silently vanish from history).
		await q(`create table if not exists revenue_projection_week_category (
			week date not null,
			category text not null,
			appts integer not null,
			expected_usd numeric not null,
			captured_at timestamptz not null default now(),
			primary key (week, category)
		)`)
		{
			const { prisma: appDb } = await import('#app/utils/db.server.ts')
			const { valueAppointments } = await import(
				'#app/utils/appointment-performance.server.ts'
			)
			const { inferRevenueServiceCategory } = await import(
				'#app/utils/blvd-revenue-sync.server.ts'
			)
			const toEt = (d: Date) =>
				d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
			const todayEt = toEt(new Date())
			const dow = (new Date(`${todayEt}T12:00:00Z`).getUTCDay() + 6) % 7
			const monday = shiftDay(todayEt, -dow)
			const horizon = shiftDay(monday, 28)
			const appts = await appDb.blvdAppointment.findMany({
				where: {
					startAt: {
						gte: new Date(`${monday}T00:00:00-04:00`),
						lt: new Date(`${horizon}T00:00:00-04:00`),
					},
					cancelled: false,
					NOT: { state: 'NO_SHOW' },
				},
				select: {
					id: true,
					startAt: true,
					clientId: true,
					clientAppointmentCount: true,
					clientCreatedAt: true,
					services: true,
				},
			})
			const parsed = appts.map(a => {
				let services: Array<{ name: string; minutes: number | null }> = []
				try {
					services = JSON.parse(a.services) as Array<{
						name: string
						minutes: number | null
					}>
				} catch {}
				return { ...a, parsedServices: services }
			})
			const values = await valueAppointments(
				parsed.map(a => ({
					id: a.id,
					startAtMs: a.startAt.getTime(),
					clientId: a.clientId,
					clientAppointmentCount: a.clientAppointmentCount,
					clientCreatedAtMs: a.clientCreatedAt?.getTime() ?? null,
					services: a.parsedServices.map(s => ({ name: s.name })),
				})),
			)
			// Same primary-service rule as the revenue rollup: the appointment
			// (and its whole value) lands under its longest service.
			const byWeekCat = new Map<string, { appts: number; usd: number }>()
			for (const a of parsed) {
				const day = toEt(a.startAt)
				const wdow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
				const week = shiftDay(day, -wdow)
				const primary = [...a.parsedServices].sort(
					(x, y) => (y.minutes ?? 0) - (x.minutes ?? 0),
				)[0]
				const cat = inferRevenueServiceCategory(primary?.name) ?? 'Uncategorized'
				const key = `${week}|${cat}`
				const row = byWeekCat.get(key) ?? { appts: 0, usd: 0 }
				row.appts++
				row.usd += values.get(a.id)?.usd ?? 0
				byWeekCat.set(key, row)
			}
			// Refresh strictly-future weeks; keep the started week frozen. The
			// seed insert backfills the current week only if it has no snapshot
			// yet (first deploy landed mid-week).
			await q(`delete from revenue_projection_week_category where week > $1`, [monday])
			for (const [key, row] of byWeekCat) {
				const [week, category] = key.split('|') as [string, string]
				await q(
					`insert into revenue_projection_week_category (week, category, appts, expected_usd)
					 values ($1, $2, $3, $4) on conflict (week, category) do nothing`,
					[week, category, row.appts, Math.round(row.usd)],
				)
			}
		}

		// Daily-profit model: per-line COGS ratios from measured vendor spend /
		// revenue, plus overhead per Mon-Sat workday (daily-profit.server.ts).
		{
			const { computeDailyProfitModel, storeDailyProfitModel } = await import(
				'#app/utils/daily-profit.server.ts'
			)
			await storeDailyProfitModel(await computeDailyProfitModel()).catch(
				error => console.error('Daily profit model failed', error),
			)
		}

		await q(`create view report_revenue_projection_monthly as
			select to_char(day, 'YYYY-MM') as month,
			       round(sum(booked_usd)) as booked_usd,
			       round(sum(fill_usd)) as projected_fill_usd,
			       round(sum(expected_usd)) as expected_usd,
			       round(sum(expected_usd) * (1 - (select cancellation_rate from revenue_projection_summary where id = 1))) as net_after_cancellations_usd
			from revenue_projection_daily group by 1 order by 1`)

		// ---- business P&L (Sarah's accounts, cache/rules classification) ----
		// Boulevard money the register collected but the bank has not seen
		// yet reads as missing revenue: payouts lag 2-3 business days and
		// Plaid trails the bank by about another day. A date cutoff misses
		// both lags, so pending = CUMULATIVE collected minus CUMULATIVE
		// banked since the first full mirror month, added to the current
		// month (Zane 2026-08-19). Any deposit Plaid has not synced yet just
		// stays in pending, so the two always sum to what was really earned,
		// and the number self-corrects as deposits post. Banked starts 3
		// days later than collected so the prior month's payout tail does
		// not deflate it.
		const { prisma } = await import('#app/utils/db.server.ts')
		const MIRROR_FULL_FROM = '2026-06-01' // BlvdRevenueItem coverage starts 2026-05-04
		const BANKED_FROM = '2026-06-04'
		// Collected runs above banked even at rest: card fees come out of the
		// payout, and Cherry-financed / cash orders never arrive via a
		// "BOULEVARD" deposit at all. Expected-banked = collected x the ratio
		// observed over SETTLED months (banked window shifted 3 days for the
		// payout lag), so pending only counts money genuinely in transit.
		const bankedBlvd = async (fromDay: string, toDay?: string) =>
			Number(
				(
					(await prisma.$queryRawUnsafe(
						`SELECT COALESCE(SUM(-amount), 0) usd FROM PlaidTransaction
						 WHERE owner = 'sarah' AND accountType = 'depository' AND amount < 0
						   AND (LOWER(name) LIKE '%boulevard%' OR LOWER(COALESCE(merchant, '')) LIKE '%boulevard%')
						   AND date >= '${fromDay}'${toDay ? ` AND date < '${toDay}'` : ''}`,
					)) as Array<{ usd: number }>
				)[0]?.usd ?? 0,
			)
		const collectedBlvd = async (fromDay: string, toDay?: string) =>
			(
				await prisma.blvdRevenueItem.aggregate({
					_sum: { grossAmountUsd: true },
					where: {
						occurredAt: {
							gte: new Date(`${fromDay}T04:00:00Z`),
							...(toDay ? { lt: new Date(`${toDay}T04:00:00Z`) } : {}),
						},
					},
				})
			)._sum.grossAmountUsd ?? 0
		const curMonthFirst = `${new Date().toISOString().slice(0, 7)}-01`
		const settledBankedTo = shiftDay(curMonthFirst, 3)
		const [settledBanked, settledCollected, totalBanked, totalCollected] =
			await Promise.all([
				bankedBlvd(BANKED_FROM, settledBankedTo),
				collectedBlvd(MIRROR_FULL_FROM, curMonthFirst),
				bankedBlvd(BANKED_FROM),
				collectedBlvd(MIRROR_FULL_FROM),
			])
		const settledRatio =
			settledCollected > 0
				? Math.min(1, Math.max(0.9, settledBanked / settledCollected))
				: 0.97
		const pendingUsd = Math.max(0, totalCollected * settledRatio - totalBanked)
		const currentMonthRow = pnl.monthly.find(
			r => r.month === new Date().toISOString().slice(0, 7),
		)
		if (currentMonthRow && pendingUsd > 0) {
			currentMonthRow.revenue += pendingUsd
			currentMonthRow.net += pendingUsd
			currentMonthRow.netSmoothed += pendingUsd
		}
		// expenses = true cash out (FCF stays visible); the class columns
		// split it into COGS / monthly overhead / annual fees / one-time, and
		// the *_smoothed pair spreads annual fees over 12 months so a $1,125
		// .pharmacy renewal doesn't crater one August.
		await q(`drop table if exists business_pnl_monthly`)
		await q(`create table business_pnl_monthly (
			month text primary key, revenue numeric, expenses numeric, net numeric,
			cogs numeric, overhead_monthly numeric, annual_fees numeric,
			irregular numeric, annual_amortized numeric,
			expenses_smoothed numeric, net_smoothed numeric)`)
		for (const m of pnl.monthly)
			await q(
				`insert into business_pnl_monthly values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
				[
					m.month, m.revenue, m.expenses, m.net,
					m.cogs, m.overheadMonthly, m.annualCash,
					m.irregular, m.annualAmortized,
					m.expensesSmoothed, m.netSmoothed,
				],
			)

		await q(`drop table if exists business_pnl_meta`)
		await q(`create table business_pnl_meta (id int primary key, period_start text, period_end text, total_revenue numeric, total_expense numeric, net_profit numeric, loaded_at timestamptz)`)
		await q(`insert into business_pnl_meta values (1,$1,$2,$3,$4,$5, now())`, [pnl.start, pnl.end, pnl.totalRevenue, pnl.totalExpense, pnl.netProfit])

		// ---- household income (Zane's take-home: INCOME deposits on his accounts) ----
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
		//   tn_fe: TN franchise & excise. The excise piece is effectively $0
		//     for this business: an individual-owned SMLLC deducts SE-taxed
		//     income (FAE170 Schedule J-2/J line 20), which drove 2024 to a
		//     -$28,912 loss that also carries into 2025 (verified against the
		//     filed 2024 return on 2026-07-30). Only the franchise tax bites:
		//     0.25% of net worth, $195 in 2024. Accrued flat at $17/month.
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
			  17 as est_tax_tn_fe,
			  round(greatest(b.net, 0) * 0.30 + b.revenue * 0.00375 + 17) as est_tax_accrual,
			  round(b.net + coalesce(i.takehome, 0) - coalesce(h.total, 0)
			        - greatest(b.net, 0) * 0.30 - b.revenue * 0.00375 - 17) as net_household_profit,
			  round(b.expenses_smoothed) as business_expenses_smoothed,
			  -- Same cash math with annual fees amortized: the trend view.
			  -- Tax accrual stays as computed on cash net (taxes are annual
			  -- anyway; their monthly split is already synthetic).
			  round(b.net + coalesce(i.takehome, 0) - coalesce(h.total, 0)
			        - greatest(b.net, 0) * 0.30 - b.revenue * 0.00375 - 17
			        + (b.expenses - b.expenses_smoothed)) as net_household_profit_smoothed
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
