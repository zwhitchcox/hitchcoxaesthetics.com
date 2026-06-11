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
		// phone-first: the verified phone is the stable id across the whole
		// journey (and matches phone-call conversion identities); email is a
		// person property
		distinctId: 'phone:+18652101404',
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

test('falls back to email when phone is not available', () => {
	expect(
		buildBookingPostHogIdentity({
			email: 'jane@example.com',
			firstName: 'Jane',
		}),
	).toMatchObject({
		distinctId: 'email:jane@example.com',
		properties: {
			$email: 'jane@example.com',
			$name: 'Jane',
			first_name: 'Jane',
			name: 'Jane',
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
