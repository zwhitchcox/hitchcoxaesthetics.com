/**
 * The months the household profit page shows. The rows go back to
 * HISTORY_FROM (finance-reports.server.ts), the first full month with data
 * from every linked account.
 */
export type ProfitRange = 'year' | '12m' | 'all'

/** This year; the 12 full months before this one plus this one; or all. */
export function monthsInRange<T extends { month: string }>(
	rows: T[],
	range: ProfitRange,
	curMonth: string,
): T[] {
	if (range === 'all') return rows
	const year = Number(curMonth.slice(0, 4))
	const from = range === 'year' ? `${year}-01` : `${year - 1}${curMonth.slice(4)}`
	return rows.filter(r => r.month >= from)
}
