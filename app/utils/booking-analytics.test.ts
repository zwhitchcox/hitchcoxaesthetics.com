import { expect, test } from 'vitest'

import { getBookingTemporalEventProperties } from '#app/utils/booking-analytics.ts'

test('formats booking temporal analytics buckets in Knoxville time', () => {
	expect(
		getBookingTemporalEventProperties(
			new Date('2026-06-02T15:40:00.000Z'),
			'booking_entered',
		),
	).toEqual({
		booking_entered_date: '2026-06-02',
		booking_entered_day_of_week: '2 - Tuesday',
		booking_entered_hour: '11:00',
		booking_entered_hour_bucket: '11 - 11 AM',
		booking_entered_time_zone: 'America/New_York',
	})
})

test('omits booking temporal analytics buckets for invalid timestamps', () => {
	expect(
		getBookingTemporalEventProperties(new Date('not-a-date'), 'booking_entered'),
	).toEqual({})
})
