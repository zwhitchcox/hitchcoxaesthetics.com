import { expect, test } from 'vitest'
import { monthsInRange } from './household-profit.ts'

const rows = ['2025-01', '2025-09', '2025-10', '2025-12', '2026-01', '2026-10'].map(
	month => ({ month }),
)
const months = (r: Array<{ month: string }>) => r.map(x => x.month)

test('12 months is the 12 full months before this one plus this one', () => {
	expect(months(monthsInRange(rows, '12m', '2026-10'))).toEqual([
		'2025-10',
		'2025-12',
		'2026-01',
		'2026-10',
	])
})

test('this year starts in January', () => {
	expect(months(monthsInRange(rows, 'year', '2026-10'))).toEqual(['2026-01', '2026-10'])
})

test('all is every row', () => {
	expect(monthsInRange(rows, 'all', '2026-10')).toHaveLength(6)
})
