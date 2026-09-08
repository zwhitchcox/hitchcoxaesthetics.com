/**
 * Daily profit model (Zane 2026-08-27): estimated COGS per service line from
 * measured vendor spend divided by measured revenue over the same window, so
 * any single day can answer "were we profitable today?"
 *
 *   day profit = revenue(day)
 *              - sum(line revenue x line COGS ratio)  <- estimated COGS
 *              - Google Ads actual spend that day
 *              - overhead / workday                    <- Mon-Sat only
 *
 * Overhead spreads over the SIX days the spa works: Sunday carries no
 * overhead so a closed day never reads as an unprofitable one. The model
 * parameters are recomputed by the finance sync and stored in the reports DB
 * (daily_profit_model), so the ratios drift with real purchasing.
 */
import {
	classifyExpenseVendor,
	isExcludedMoneyMovement,
} from '../../scripts/plaid-expenses.ts'
import { prisma } from '#app/utils/db.server.ts'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server.ts'

const REPORT_TIME_ZONE = 'America/New_York'
const etDay = (d: Date) =>
	d.toLocaleDateString('en-CA', { timeZone: REPORT_TIME_ZONE })

/** COGS ratios are fitted over the Boulevard mirror's full-coverage window. */
const RATIO_FROM = '2026-06-01'

export type ProfitLine = 'injectables' | 'weight-loss' | 'other'

/** BlvdRevenueItem serviceCategory -> model line (null = general revenue). */
function lineForRevenueCategory(category: string | null): ProfitLine {
	const c = (category ?? '').toLowerCase()
	if (c.includes('injectable')) return 'injectables'
	if (c.includes('weight loss')) return 'weight-loss'
	// Everything else (laser, facials, retail, general) shares one pool:
	// skincare stock supports facials AND retail, so a narrower mapping
	// starves the ratio (8k of product vs $836 of "Aesthetic Treatments").
	return 'other'
}

function lineForVendorService(service: string): ProfitLine | null {
	if (service === 'tox' || service === 'filler' || service === 'mixed-cogs')
		return 'injectables'
	if (service === 'weight-loss') return 'weight-loss'
	if (service === 'skincare') return 'other'
	return null
}

/** Combined COGS ratio (line + general supplies) for a revenue category. */
export function cogsRatioForCategory(
	model: DailyProfitModel,
	category: string | null,
): number {
	return (
		model.lines[lineForRevenueCategory(category)].ratio +
		model.generalCogs.ratio
	)
}

export type DailyProfitModel = {
	ratioFrom: string
	ratioTo: string
	/** COGS as a share of revenue, per line, plus general (all-revenue) COGS. */
	lines: Record<ProfitLine, { spendUsd: number; revenueUsd: number; ratio: number }>
	generalCogs: { spendUsd: number; revenueUsd: number; ratio: number }
	/** Non-COGS, non-ads business spend per working day (Mon-Sat). */
	overheadPerWorkdayUsd: number
	overheadMonthlyUsd: number
	capturedAt: string
}

/** Mon-Sat days between two ET days inclusive. */
function workdaysBetween(fromDay: string, toDay: string): number {
	let n = 0
	const d = new Date(`${fromDay}T12:00:00Z`)
	const end = new Date(`${toDay}T12:00:00Z`)
	while (d <= end) {
		if (d.getUTCDay() !== 0) n++
		d.setUTCDate(d.getUTCDate() + 1)
	}
	return n
}

export async function computeDailyProfitModel(): Promise<DailyProfitModel> {
	const today = etDay(new Date())
	// The overhead window (last 3 full months) can start before the ratio
	// window, so the transaction query spans whichever is earlier.
	const curMonthKey = today.slice(0, 7)
	const overheadStart = new Date(`${curMonthKey}-01T12:00:00Z`)
	overheadStart.setUTCMonth(overheadStart.getUTCMonth() - 3)
	const queryFrom =
		overheadStart.toISOString().slice(0, 10) < RATIO_FROM
			? overheadStart.toISOString().slice(0, 10)
			: RATIO_FROM
	// Expenses on Sarah's business accounts, the same exclusions as the P&L.
	const txns = await prisma.$queryRawUnsafe<
		Array<{
			date: string
			amount: number
			merchant: string | null
			name: string
			pfcPrimary: string | null
			pfcDetailed: string | null
		}>
	>(
		`SELECT date, amount, merchant, name, pfcPrimary, pfcDetailed
		 FROM PlaidTransaction
		 WHERE owner = 'sarah' AND amount > 0 AND date >= '${queryFrom}'`,
	)
	const spendByLine: Record<ProfitLine, number> = {
		injectables: 0,
		'weight-loss': 0,
		other: 0,
	}
	let generalCogsSpend = 0
	let overheadSpend = 0
	// Overhead window: the last 3 FULL months, so one lumpy restock or annual
	// tax filing averages out.
	const curMonth = today.slice(0, 7)
	const overheadFromMonth = new Date(`${curMonth}-01T12:00:00Z`)
	overheadFromMonth.setUTCMonth(overheadFromMonth.getUTCMonth() - 3)
	const overheadFrom = overheadFromMonth.toISOString().slice(0, 10)
	const overheadTo = `${curMonth}-01`
	for (const t of txns) {
		if (isExcludedMoneyMovement(t)) continue
		const cls = classifyExpenseVendor(t.merchant, t.name)
		if (!cls || cls.category === 'Personal') continue
		if (cls.category === 'COGS') {
			if (t.date < RATIO_FROM) continue
			const line = lineForVendorService(cls.service)
			if (line) spendByLine[line] += t.amount
			else generalCogsSpend += t.amount
		} else if (t.date >= overheadFrom && t.date < overheadTo) {
			overheadSpend += t.amount
		}
	}
	// Google Ads is charged as overhead-ish on the cards but the report uses
	// its ACTUAL per-day spend, so pull it out of the overhead pool.
	const ads = await prisma.googleAdsSpendDay
		.aggregate({
			_sum: { usd: true },
			where: { day: { gte: overheadFrom, lt: overheadTo } },
		})
		.catch(() => ({ _sum: { usd: 0 } }))
	overheadSpend = Math.max(0, overheadSpend - (ads._sum.usd ?? 0))

	// Revenue per line over the ratio window, from the official revenue table
	// (Boulevard + Jane; only Boulevard exists in this window anyway).
	const items = await prisma.revenueItem.findMany({
		where: { occurredAt: { gte: new Date(`${RATIO_FROM}T04:00:00Z`) } },
		select: { occurredAt: true, serviceCategory: true, grossAmountUsd: true },
	})
	const revenueByLine: Record<ProfitLine, number> = {
		injectables: 0,
		'weight-loss': 0,
		other: 0,
	}
	let totalRevenue = 0
	for (const item of items) {
		totalRevenue += item.grossAmountUsd
		revenueByLine[lineForRevenueCategory(item.serviceCategory)] +=
			item.grossAmountUsd
	}

	const ratio = (spend: number, revenue: number) =>
		revenue > 0 ? Math.min(0.9, spend / revenue) : 0
	const overheadWorkdays = workdaysBetween(
		overheadFrom,
		// last day of the previous month
		new Date(new Date(`${overheadTo}T12:00:00Z`).getTime() - 24 * 3600e3)
			.toISOString()
			.slice(0, 10),
	)
	const lines = Object.fromEntries(
		(Object.keys(spendByLine) as ProfitLine[]).map(line => [
			line,
			{
				spendUsd: Math.round(spendByLine[line]),
				revenueUsd: Math.round(revenueByLine[line]),
				ratio: ratio(spendByLine[line], revenueByLine[line]),
			},
		]),
	) as DailyProfitModel['lines']
	return {
		ratioFrom: RATIO_FROM,
		ratioTo: today,
		lines,
		generalCogs: {
			spendUsd: Math.round(generalCogsSpend),
			revenueUsd: Math.round(totalRevenue),
			ratio: ratio(generalCogsSpend, totalRevenue),
		},
		overheadPerWorkdayUsd:
			overheadWorkdays > 0 ? Math.round(overheadSpend / overheadWorkdays) : 0,
		overheadMonthlyUsd: Math.round(overheadSpend / 3),
		capturedAt: new Date().toISOString(),
	}
}

/** Persist the model (called by the finance sync). */
export async function storeDailyProfitModel(model: DailyProfitModel) {
	await reportsQuery(
		`CREATE TABLE IF NOT EXISTS daily_profit_model (
			id INT PRIMARY KEY, params JSONB NOT NULL, captured_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
	)
	await reportsQuery(
		`INSERT INTO daily_profit_model (id, params) VALUES (1, $1)
		 ON CONFLICT (id) DO UPDATE SET params = excluded.params, captured_at = now()`,
		[JSON.stringify(model)],
	)
}

export async function loadDailyProfitModel(): Promise<DailyProfitModel | null> {
	if (!hasReportsDb()) return null
	try {
		const rows = await reportsQuery<{ params: DailyProfitModel }>(
			`SELECT params FROM daily_profit_model WHERE id = 1`,
		)
		return rows[0]?.params ?? null
	} catch {
		return null
	}
}

export type DailyProfitRow = {
	day: string
	isSunday: boolean
	revenueUsd: number
	cogsUsd: number
	adsUsd: number | null
	overheadUsd: number
	profitUsd: number
	/** Household tax accrual applied: 30% of positive profit + 0.375% of gross. */
	afterTaxUsd: number
}

/** Per-day profit rows for a window (ET days, inclusive). */
export async function loadDailyProfitRows(
	fromDay: string,
	toDay: string,
	model: DailyProfitModel,
): Promise<DailyProfitRow[]> {
	const items = await prisma.revenueItem.findMany({
		where: {
			occurredAt: {
				gte: new Date(`${fromDay}T04:00:00Z`),
				lt: new Date(`${toDay}T23:59:59-04:00`),
			},
		},
		select: { occurredAt: true, serviceCategory: true, grossAmountUsd: true },
	})
	const byDay = new Map<string, { revenue: number; cogs: number }>()
	for (const item of items) {
		const day = etDay(item.occurredAt)
		const row = byDay.get(day) ?? { revenue: 0, cogs: 0 }
		row.revenue += item.grossAmountUsd
		const lineRatio = model.lines[lineForRevenueCategory(item.serviceCategory)].ratio
		row.cogs += item.grossAmountUsd * (lineRatio + model.generalCogs.ratio)
		byDay.set(day, row)
	}
	const adsRows = await prisma.googleAdsSpendDay
		.findMany({
			where: { day: { gte: fromDay, lte: toDay } },
			select: { day: true, usd: true },
		})
		.catch(() => [] as Array<{ day: string; usd: number }>)
	const adsByDay = new Map(adsRows.map(r => [r.day, r.usd]))
	const out: DailyProfitRow[] = []
	const cursor = new Date(`${fromDay}T12:00:00Z`)
	const end = new Date(`${toDay}T12:00:00Z`)
	while (cursor <= end) {
		const day = cursor.toISOString().slice(0, 10)
		const isSunday = cursor.getUTCDay() === 0
		const rev = byDay.get(day) ?? { revenue: 0, cogs: 0 }
		const ads = adsByDay.get(day) ?? null
		const overhead = isSunday ? 0 : model.overheadPerWorkdayUsd
		const profit = rev.revenue - rev.cogs - (ads ?? 0) - overhead
		out.push({
			day,
			isSunday,
			revenueUsd: Math.round(rev.revenue),
			cogsUsd: Math.round(rev.cogs),
			adsUsd: ads == null ? null : Math.round(ads),
			overheadUsd: overhead,
			profitUsd: Math.round(profit),
			afterTaxUsd: Math.round(
				profit - Math.max(profit, 0) * 0.3 - rev.revenue * 0.00375,
			),
		})
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}
