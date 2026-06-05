import { expect, test } from 'vitest'

import {
	getBookingAnalyticsExclusionReason,
	isExcludedBookingAnalyticsIdentity,
	normalizeBookingAnalyticsPhone,
} from '#app/utils/analytics-exclusions.ts'

test('matches excluded booking emails without exposing raw values in constants', () => {
	expect(
		isExcludedBookingAnalyticsIdentity({
			email: 'ZWHITCHCOX@GMAIL.COM',
		}),
	).toBe(true)
	expect(
		getBookingAnalyticsExclusionReason({
			emails: ['sarah@hitchcoxaesthetics.com'],
		}),
	).toBe('excluded_booking_email')
	expect(
		isExcludedBookingAnalyticsIdentity({
			email: 'client@example.com',
		}),
	).toBe(false)
})

test('normalizes and matches excluded booking phones', () => {
	expect(normalizeBookingAnalyticsPhone('(865) 210-1404')).toBe('+18652101404')
	expect(
		getBookingAnalyticsExclusionReason({
			phones: ['8652101404'],
		}),
	).toBe('excluded_booking_phone')
	expect(
		isExcludedBookingAnalyticsIdentity({
			phone: '8652329501',
		}),
	).toBe(false)
})
