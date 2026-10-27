import { expect, test } from 'vitest'

import {
	googleUpdateLocation,
	openingHoursSpecification,
	toPeriods,
} from '#app/utils/gbp-listing-hours.ts'

// SHA Bearden as the Business Information API returned it on 2026-10-27.
const bearden = {
	periods: [
		...['SATURDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map(
			day => ({
				openDay: day,
				openTime: { hours: 9 },
				closeDay: day,
				closeTime: { hours: day === 'SATURDAY' ? 16 : 19 },
			}),
		),
	],
}

const push = (message: object) => ({
	message: {
		data: Buffer.from(JSON.stringify(message)).toString('base64'),
	},
})

test('reads Google periods Monday first, with zero fields filled in', () => {
	const periods = toPeriods(bearden)
	expect(periods[0]).toEqual({ day: 'Monday', opens: '09:00', closes: '19:00' })
	expect(periods.at(-1)).toEqual({
		day: 'Saturday',
		opens: '09:00',
		closes: '16:00',
	})
	expect(
		toPeriods({
			periods: [
				{ openDay: 'TUESDAY', openTime: {}, closeTime: { hours: 14, minutes: 30 } },
			],
		}),
	).toEqual([{ day: 'Tuesday', opens: '00:00', closes: '14:30' }])
	expect(toPeriods(undefined)).toEqual([])
})

test('groups the days that share times into one schema entry', () => {
	expect(openingHoursSpecification(toPeriods(bearden))).toEqual([
		{
			'@type': 'OpeningHoursSpecification',
			dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
			opens: '09:00',
			closes: '19:00',
		},
		{
			'@type': 'OpeningHoursSpecification',
			dayOfWeek: ['Saturday'],
			opens: '09:00',
			closes: '16:00',
		},
	])
})

test('finds the listing of a GOOGLE_UPDATE push and ignores other pushes', () => {
	expect(
		googleUpdateLocation(
			push({
				type: 'GOOGLE_UPDATE',
				location: 'accounts/104663503113561659457/locations/7968858603211080242',
			}),
		),
	).toBe('locations/7968858603211080242')
	expect(
		googleUpdateLocation(
			push({
				type: 'NEW_REVIEW',
				review:
					'accounts/104663503113561659457/locations/7968858603211080242/reviews/abc',
			}),
		),
	).toBeNull()
	expect(googleUpdateLocation({ message: {} })).toBeNull()
	expect(googleUpdateLocation(null)).toBeNull()
})
