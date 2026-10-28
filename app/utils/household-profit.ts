/**
 * Date ranges for the household profit page: the choices of the Google Ads
 * date picker, plus Last 90 days, Last 12 months, This year and Last year.
 *
 * A range of whole months uses the monthly rows, as before: the current
 * month includes Boulevard payouts still on the way and spreads the fixed
 * bills over the month, and taxes are estimated month by month. Any other
 * range adds up the bank's cash day by day (household_kept_daily), and its
 * taxes are estimated on the total. The data starts at HISTORY_FROM
 * (finance-reports.server.ts), the first full month with every account.
 */

export const RANGE_OPTIONS = [
	{ value: 'custom', label: 'Custom' },
	{ value: 'today', label: 'Today' },
	{ value: 'yesterday', label: 'Yesterday' },
	{ value: 'thisWeekSun', label: 'This week (Sun to today)' },
	{ value: 'thisWeekMon', label: 'This week (Mon to today)' },
	{ value: 'last7', label: 'Last 7 days' },
	{ value: 'lastWeekSun', label: 'Last week (Sun to Sat)' },
	{ value: 'lastWeekMon', label: 'Last week (Mon to Sun)' },
	{ value: 'lastBusinessWeek', label: 'Last business week (Mon to Fri)' },
	{ value: 'last14', label: 'Last 14 days' },
	{ value: 'thisMonth', label: 'This month' },
	{ value: 'last30', label: 'Last 30 days' },
	{ value: 'lastMonth', label: 'Last month' },
	{ value: 'last90', label: 'Last 90 days' },
	{ value: 'last12Months', label: 'Last 12 months' },
	{ value: 'thisYear', label: 'This year' },
	{ value: 'lastYear', label: 'Last year' },
	{ value: 'all', label: 'All time' },
] as const
export type RangeKey = (typeof RANGE_OPTIONS)[number]['value']
export const RANGE_KEYS = RANGE_OPTIONS.map(o => o.value)

const DAY_MS = 24 * 60 * 60 * 1000
export const addDays = (day: string, n: number) =>
	new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
/** 0 = Sunday. */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()
const monthStart = (day: string) => `${day.slice(0, 7)}-01`
const monthEnd = (day: string) => {
	const d = new Date(`${monthStart(day)}T12:00:00Z`)
	d.setUTCMonth(d.getUTCMonth() + 1, 0)
	return d.toISOString().slice(0, 10)
}
const isDay = (d: string | undefined): d is string =>
	!!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))

/** The first and last day of a range, both included, in business time.
 * "Last N days" ends yesterday, as in Google Ads. */
export function resolveRange(
	key: RangeKey,
	today: string,
	custom: { from?: string; to?: string } = {},
): { from: string; to: string } {
	const sunday = addDays(today, -weekday(today))
	const monday = addDays(today, -((weekday(today) + 6) % 7))
	const lastMonthEnd = addDays(monthStart(today), -1)
	const year = Number(today.slice(0, 4))
	const days = (n: number) => ({ from: addDays(today, -n), to: addDays(today, -1) })
	switch (key) {
		case 'today':
			return { from: today, to: today }
		case 'yesterday':
			return { from: addDays(today, -1), to: addDays(today, -1) }
		case 'thisWeekSun':
			return { from: sunday, to: today }
		case 'thisWeekMon':
			return { from: monday, to: today }
		case 'last7':
			return days(7)
		case 'lastWeekSun':
			return { from: addDays(sunday, -7), to: addDays(sunday, -1) }
		case 'lastWeekMon':
			return { from: addDays(monday, -7), to: addDays(monday, -1) }
		case 'lastBusinessWeek':
			return { from: addDays(monday, -7), to: addDays(monday, -3) }
		case 'last14':
			return days(14)
		case 'thisMonth':
			return { from: monthStart(today), to: today }
		case 'last30':
			return days(30)
		case 'lastMonth':
			return { from: monthStart(lastMonthEnd), to: lastMonthEnd }
		case 'last90':
			return days(90)
		case 'last12Months':
			return { from: `${year - 1}-${today.slice(5, 7)}-01`, to: today }
		case 'thisYear':
			return { from: `${year}-01-01`, to: today }
		case 'lastYear':
			return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
		case 'all':
			return { from: '2000-01-01', to: today }
		case 'custom': {
			if (!isDay(custom.from) || !isDay(custom.to))
				return resolveRange('last12Months', today)
			const [from, to] = [custom.from, custom.to].sort() as [string, string]
			return { from, to }
		}
	}
}

export type MonthRow = {
	month: string
	business_revenue: number
	business_expenses: number
	business_net: number
	zane_takehome: number
	household_spend: number
	est_tax_accrual: number
	net_household_profit: number
	net_household_profit_smoothed?: number
}

export type DayRow = {
	day: string
	revenue: number
	expenses: number
	takehome: number
	spend: number
}

export type TableRow = {
	/** A month (2026-10) or a day (2026-10-27). */
	key: string
	revenue: number
	expenses: number
	net: number
	takehome: number
	spend: number
	/** Cash kept before taxes. */
	kept: number
	/** On month rows only: the estimate is made month by month. */
	tax: number | null
	afterTax: number | null
	smoothed: number | null
}

/** The page's rough tax estimate for any number of days: 30% of a positive
 * business net, the TN business tax (0.375% of revenue) and the $17 a
 * month franchise tax. The same rule as household_profit_monthly. */
export function taxEstimate(net: number, revenue: number, days: number) {
	return Math.max(net, 0) * 0.3 + revenue * 0.00375 + (17 * 12 * days) / 365
}

const sumRows = (rows: TableRow[], key: keyof TableRow) =>
	rows.reduce((t, r) => t + ((r[key] as number | null) ?? 0), 0)

/**
 * The rows and the Total row for a range. `firstDay` is where the data
 * starts and `dataThrough` the last day the bank has reported.
 */
export function buildTable(opts: {
	key: RangeKey
	today: string
	custom?: { from?: string; to?: string }
	firstDay: string
	dataThrough: string
	months: MonthRow[]
	days: DayRow[]
}) {
	const range = resolveRange(opts.key, opts.today, opts.custom)
	const from = range.from < opts.firstDay ? opts.firstDay : range.from
	const to = range.to > opts.today ? opts.today : range.to
	const wholeMonths =
		from.endsWith('-01') && (to === monthEnd(to) || to === opts.today)

	if (wholeMonths) {
		const rows: TableRow[] = opts.months
			.filter(m => m.month >= from.slice(0, 7) && m.month <= to.slice(0, 7))
			.map(m => ({
				key: m.month,
				revenue: m.business_revenue,
				expenses: m.business_expenses,
				net: m.business_net,
				takehome: m.zane_takehome,
				spend: m.household_spend,
				kept: m.net_household_profit + m.est_tax_accrual,
				tax: m.est_tax_accrual,
				afterTax: m.net_household_profit,
				smoothed:
					m.net_household_profit_smoothed != null &&
					Number.isFinite(m.net_household_profit_smoothed)
						? m.net_household_profit_smoothed
						: null,
			}))
		const total: TableRow = {
			key: 'total',
			revenue: sumRows(rows, 'revenue'),
			expenses: sumRows(rows, 'expenses'),
			net: sumRows(rows, 'net'),
			takehome: sumRows(rows, 'takehome'),
			spend: sumRows(rows, 'spend'),
			kept: sumRows(rows, 'kept'),
			tax: sumRows(rows, 'tax'),
			afterTax: sumRows(rows, 'afterTax'),
			smoothed: rows.some(r => r.smoothed != null) ? sumRows(rows, 'smoothed') : null,
		}
		return { from, to, unit: 'month' as const, rows, total }
	}

	// Day by day: one row a day up to a month, else one row a month. Days
	// after the bank's last report are left out; a quiet day shows as $0.
	const last = to > opts.dataThrough ? opts.dataThrough : to
	const byDay = new Map(opts.days.map(d => [d.day, d]))
	const unit = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) < 31 ? 'day' : 'month'
	const buckets = new Map<string, TableRow>()
	for (let day = from; day <= last; day = addDays(day, 1)) {
		const key = unit === 'day' ? day : day.slice(0, 7)
		const row = buckets.get(key) ?? {
			key,
			revenue: 0,
			expenses: 0,
			net: 0,
			takehome: 0,
			spend: 0,
			kept: 0,
			tax: null,
			afterTax: null,
			smoothed: null,
		}
		const d = byDay.get(day)
		if (d) {
			row.revenue += d.revenue
			row.expenses += d.expenses
			row.net += d.revenue - d.expenses
			row.takehome += d.takehome
			row.spend += d.spend
			row.kept += d.revenue - d.expenses + d.takehome - d.spend
		}
		buckets.set(key, row)
	}
	const rows = [...buckets.values()]
	const revenue = sumRows(rows, 'revenue')
	const net = sumRows(rows, 'net')
	const kept = sumRows(rows, 'kept')
	const spanDays =
		last < from ? 0 : Math.round((Date.parse(last) - Date.parse(from)) / DAY_MS) + 1
	const tax = taxEstimate(net, revenue, spanDays)
	const total: TableRow = {
		key: 'total',
		revenue,
		expenses: sumRows(rows, 'expenses'),
		net,
		takehome: sumRows(rows, 'takehome'),
		spend: sumRows(rows, 'spend'),
		kept,
		tax,
		afterTax: kept - tax,
		smoothed: null,
	}
	return { from, to, unit, rows, total }
}
