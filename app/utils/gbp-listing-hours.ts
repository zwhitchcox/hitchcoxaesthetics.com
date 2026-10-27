/**
 * Office hours of our Google listings, as plain data. Google is the source
 * of every hours line on our pages and the brand sites (Zane, 2026-10-27).
 * gbp-listing-hours.server.ts keeps the mirror fresh.
 */

export type HoursPeriod = { day: string; opens: string; closes: string }

const DAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
]

type GoogleTime = { hours?: number; minutes?: number }
type GooglePeriod = {
	openDay?: string
	openTime?: GoogleTime
	closeTime?: GoogleTime
}

// Google leaves out a zero field: { hours: 10 } is 10:00, {} is midnight.
const hhmm = (time: GoogleTime | undefined) =>
	`${String(time?.hours ?? 0).padStart(2, '0')}:${String(time?.minutes ?? 0).padStart(2, '0')}`

/** Google's regularHours as { day: 'Monday', opens, closes }, Monday first. */
export function toPeriods(
	regularHours: { periods?: GooglePeriod[] } | undefined,
): HoursPeriod[] {
	return (regularHours?.periods ?? [])
		.filter(period => period.openDay)
		.map(period => ({
			day: period.openDay!.charAt(0) + period.openDay!.slice(1).toLowerCase(),
			opens: hhmm(period.openTime),
			closes: hhmm(period.closeTime),
		}))
		.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day))
}

/** schema.org openingHoursSpecification: days with the same times share one entry. */
export function openingHoursSpecification(periods: HoursPeriod[]) {
	const groups: Array<{ dayOfWeek: string[]; opens: string; closes: string }> =
		[]
	for (const period of periods) {
		const group = groups.find(
			g => g.opens === period.opens && g.closes === period.closes,
		)
		if (group) group.dayOfWeek.push(period.day)
		else
			groups.push({
				dayOfWeek: [period.day],
				opens: period.opens,
				closes: period.closes,
			})
	}
	return groups.map(group => ({
		'@type': 'OpeningHoursSpecification',
		...group,
	}))
}

/**
 * The listing that a Business Profile pub/sub push names, when the message
 * is a GOOGLE_UPDATE (Google changed what it shows for the listing).
 */
export function googleUpdateLocation(body: unknown): string | null {
	const data = (body as { message?: { data?: unknown } } | null)?.message?.data
	if (typeof data !== 'string') return null
	const text = Buffer.from(data, 'base64').toString('utf8')
	if (!text.includes('GOOGLE_UPDATE')) return null
	return /accounts\/\d+\/(locations\/\d+)/.exec(text)?.[1] ?? null
}
