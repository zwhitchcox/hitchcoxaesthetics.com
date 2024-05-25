import { expect, test } from 'vitest'

import { generateTimeSlots } from '#app/routes/book+/_steps+/schedule'
import { dateToMinutes } from '#app/utils/date.js'

test('generateTimeSlots', () => {
	const timeSlots = generateTimeSlots({ start: 60, end: 120 }, 30)
	expect(timeSlots.map(dateToMinutes)).toEqual([60, 70, 80, 90])
})
