import { describe, expect, test } from 'vitest'
import {
	buildTable,
	type DayRow,
	type MonthRow,
	RANGE_KEYS,
	resolveRange,
	taxEstimate,
} from './household-profit.ts'

// Wednesday 2026-10-28.
const today = '2026-10-28'

describe('resolveRange', () => {
	test.each([
		['today', '2026-10-28', '2026-10-28'],
		['yesterday', '2026-10-27', '2026-10-27'],
		['thisWeekSun', '2026-10-25', '2026-10-28'],
		['thisWeekMon', '2026-10-26', '2026-10-28'],
		['last7', '2026-10-21', '2026-10-27'],
		['lastWeekSun', '2026-10-18', '2026-10-24'],
		['lastWeekMon', '2026-10-19', '2026-10-25'],
		['lastBusinessWeek', '2026-10-19', '2026-10-23'],
		['last14', '2026-10-14', '2026-10-27'],
		['thisMonth', '2026-10-01', '2026-10-28'],
		['last30', '2026-09-28', '2026-10-27'],
		['lastMonth', '2026-09-01', '2026-09-30'],
		['last90', '2026-07-30', '2026-10-27'],
		['last12Months', '2025-10-01', '2026-10-28'],
		['thisYear', '2026-01-01', '2026-10-28'],
		['lastYear', '2025-01-01', '2025-12-31'],
	] as const)('%s is %s to %s', (key, from, to) => {
		expect(resolveRange(key, today)).toEqual({ from, to })
	})

	test('on a Sunday, the Sunday week starts today and the Monday week began 6 days ago', () => {
		expect(resolveRange('thisWeekSun', '2026-10-25')).toEqual({ from: '2026-10-25', to: '2026-10-25' })
		expect(resolveRange('thisWeekMon', '2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
		expect(resolveRange('lastWeekMon', '2026-10-25')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
	})

	test('a custom range takes its days in either order, and falls back when one is missing', () => {
		expect(resolveRange('custom', today, { from: '2026-03-10', to: '2026-02-01' })).toEqual({
			from: '2026-02-01',
			to: '2026-03-10',
		})
		expect(resolveRange('custom', today, { from: '2026-03-10' })).toEqual(
			resolveRange('last12Months', today),
		)
	})

	test('every option resolves', () => {
		for (const key of RANGE_KEYS) expect(resolveRange(key, today).from <= today).toBe(true)
	})
})

const month = (m: string, kept: number): MonthRow => ({
	month: m,
	business_revenue: 40000,
	business_expenses: 30000,
	business_net: 10000,
	zane_takehome: 10000,
	household_spend: 20000 - kept,
	est_tax_accrual: 3000,
	net_household_profit: kept - 3000,
	net_household_profit_smoothed: kept - 3000,
})
const months = ['2025-02', '2025-12', '2026-01', '2026-09', '2026-10'].map(m => month(m, 1000))
const day = (d: string, revenue: number, expenses: number): DayRow => ({
	day: d,
	revenue,
	expenses,
	takehome: 0,
	spend: 100,
})
const days = [
	day('2026-10-20', 2000, 500),
	day('2026-10-22', 0, 1000),
	day('2026-10-26', 1500, 0),
	day('2026-10-27', 0, 200),
]
const base = { today, firstDay: '2025-02-01', dataThrough: '2026-10-27', months, days }

describe('buildTable', () => {
	test('whole months use the monthly rows, and the total adds them up', () => {
		const t = buildTable({ ...base, key: 'thisYear' })
		expect(t.unit).toBe('month')
		expect(t.rows.map(r => r.key)).toEqual(['2026-01', '2026-09', '2026-10'])
		expect(t.total).toMatchObject({ revenue: 120000, kept: 3000, tax: 9000, afterTax: -6000 })
	})

	test('All time and Last year start where the data starts', () => {
		expect(buildTable({ ...base, key: 'all' }).from).toBe('2025-02-01')
		const lastYear = buildTable({ ...base, key: 'lastYear' })
		expect(lastYear.unit).toBe('month')
		expect(lastYear.rows.map(r => r.key)).toEqual(['2025-02', '2025-12'])
	})

	test('other ranges add up the days, show quiet days as $0 and stop at the last bank day', () => {
		const t = buildTable({ ...base, key: 'last7' })
		expect(t.unit).toBe('day')
		expect(t.rows.map(r => r.key)).toEqual([
			'2026-10-21',
			'2026-10-22',
			'2026-10-23',
			'2026-10-24',
			'2026-10-25',
			'2026-10-26',
			'2026-10-27',
		])
		expect(t.rows[0]).toMatchObject({ revenue: 0, kept: 0, tax: null })
		// 1,500 - 1,200 of business net; 300 of household spending.
		expect(t.total).toMatchObject({ revenue: 1500, expenses: 1200, net: 300, spend: 300, kept: 0 })
		expect(t.total.tax).toBeCloseTo(taxEstimate(300, 1500, 7))
		expect(t.total.afterTax).toBeCloseTo(-taxEstimate(300, 1500, 7))
	})

	test('a range past a month goes month by month', () => {
		const t = buildTable({ ...base, key: 'last90' })
		expect(t.unit).toBe('month')
		expect(t.rows.map(r => r.key)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
		expect(t.rows.every(r => r.tax == null)).toBe(true)
	})

	test('today has no rows until the bank reports it', () => {
		const t = buildTable({ ...base, key: 'today' })
		expect(t.rows).toEqual([])
		expect(t.total.kept).toBe(0)
	})
})
