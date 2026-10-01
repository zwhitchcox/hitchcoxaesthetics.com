import { expect, test } from 'vitest'
import { projectionWindow } from './finance-reports.server.ts'

test('the projection window starts on the first of the month', () => {
	expect(projectionWindow(new Date('2026-09-15T16:00:00Z'))).toEqual({
		fromDate: '2026-09-01',
		toDate: '2027-03-01',
	})
})

test('the window starts on Monday when the week began last month', () => {
	// Thursday 2026-10-01: Mon-Wed of this week are Sep 28-30.
	expect(projectionWindow(new Date('2026-10-01T14:00:00Z'))).toEqual({
		fromDate: '2026-09-28',
		toDate: '2027-04-01',
	})
	// Sunday 2026-11-01 belongs to the week of Monday Oct 26.
	expect(projectionWindow(new Date('2026-11-01T17:00:00Z')).fromDate).toBe(
		'2026-10-26',
	)
})

test('a month that starts on Monday starts the window on the 1st', () => {
	expect(projectionWindow(new Date('2026-06-01T14:00:00Z')).fromDate).toBe(
		'2026-06-01',
	)
})

test('the day is the business day in New York, not UTC', () => {
	// 9 PM ET on Sep 30 is already Oct 1 in UTC.
	expect(projectionWindow(new Date('2026-10-01T01:00:00Z'))).toEqual({
		fromDate: '2026-09-01',
		toDate: '2027-03-01',
	})
})
