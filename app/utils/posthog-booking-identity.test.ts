import { expect, test } from 'vitest'

import { buildBookingPostHogIdentity } from '#app/utils/posthog-booking-identity.ts'

test('builds a searchable PostHog identity from booking details', () => {
	expect(
		buildBookingPostHogIdentity({
			boulevardClientId: 'client_123',
			email: '  Jane@example.COM ',
			firstName: ' Jane ',
			lastName: ' Doe ',
			phone: '(865) 210-1404',
		}),
	).toEqual({
		distinctId: 'email:jane@example.com',
		properties: {
			$email: 'jane@example.com',
			$name: 'Jane Doe',
			blvd_client_id: 'client_123',
			email: 'jane@example.com',
			first_name: 'Jane',
			last_name: 'Doe',
			name: 'Jane Doe',
			phone: '+18652101404',
		},
	})
})

test('falls back to phone when email is not available', () => {
	expect(
		buildBookingPostHogIdentity({
			firstName: 'Jane',
			phone: '8652101404',
		}),
	).toMatchObject({
		distinctId: 'phone:+18652101404',
		properties: {
			$name: 'Jane',
			first_name: 'Jane',
			name: 'Jane',
			phone: '+18652101404',
		},
	})
})

test('returns null without an identifying value', () => {
	expect(
		buildBookingPostHogIdentity({
			firstName: 'Jane',
			lastName: 'Doe',
		}),
	).toBeNull()
})
