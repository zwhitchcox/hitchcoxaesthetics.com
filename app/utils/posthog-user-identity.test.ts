import { expect, test, vi } from 'vitest'

import { buildBookingPostHogIdentity } from './posthog-booking-identity.ts'
import {
	buildUserPostHogIdentity,
	syncPostHogAppUser,
	type PostHogIdentityClient,
} from './posthog-user-identity.ts'

const sarah = {
	id: 'user_sarah',
	name: ' Sarah Hitchcox ',
	phone: '(865) 555-0101',
	type: 'client',
	roles: [{ name: 'admin' }],
}

function fakePostHog(state: {
	distinctId?: string
	superProperties?: Record<string, unknown>
}) {
	const superProperties = { ...(state.superProperties ?? {}) }
	let distinctId = state.distinctId ?? 'anon-1'
	const client = {
		get_distinct_id: () => distinctId,
		get_property: (name: string) => superProperties[name],
		identify: vi.fn((id: string) => {
			distinctId = id
		}),
		register: vi.fn((properties: Record<string, unknown>) => {
			Object.assign(superProperties, properties)
		}),
		reset: vi.fn(() => {
			distinctId = 'anon-after-reset'
			for (const key of Object.keys(superProperties)) delete superProperties[key]
		}),
		unregister: vi.fn((name: string) => {
			delete superProperties[name]
		}),
	} satisfies PostHogIdentityClient
	return { client, superProperties }
}

test('a logged-in user gets the same distinct id as their bookings', () => {
	const identity = buildUserPostHogIdentity(sarah)
	const booking = buildBookingPostHogIdentity({ phone: '865-555-0101' })

	expect(identity?.distinctId).toBe('phone:+18655550101')
	expect(identity?.distinctId).toBe(booking?.distinctId)
})

test('events carry who is logged in, and the person carries the name', () => {
	const identity = buildUserPostHogIdentity(sarah)

	expect(identity?.eventProperties).toEqual({
		app_user_id: 'user_sarah',
		app_user_is_admin: true,
		app_user_name: 'Sarah Hitchcox',
		app_user_roles: 'admin',
		app_user_type: 'client',
	})
	expect(identity?.personProperties).toMatchObject({
		$name: 'Sarah Hitchcox',
		is_admin: true,
		phone: '+18655550101',
	})
})

test('a user with no usable phone falls back to the user id', () => {
	const identity = buildUserPostHogIdentity({ id: 'user_x', phone: '12' })

	expect(identity?.distinctId).toBe('user:user_x')
	expect(identity?.eventProperties).toEqual({
		app_user_id: 'user_x',
		app_user_is_admin: false,
	})
})

test('no user, no identity', () => {
	expect(buildUserPostHogIdentity(null)).toBeNull()
})

test('login identifies the person and tags every event', () => {
	const { client, superProperties } = fakePostHog({})

	syncPostHogAppUser(client, buildUserPostHogIdentity(sarah))

	expect(client.reset).not.toHaveBeenCalled()
	expect(client.identify).toHaveBeenCalledWith(
		'phone:+18655550101',
		expect.objectContaining({ $name: 'Sarah Hitchcox' }),
	)
	expect(superProperties.app_user_name).toBe('Sarah Hitchcox')
})

test('a browser known as someone else starts a new person at login', () => {
	const { client } = fakePostHog({ distinctId: 'phone:+18655559999' })

	syncPostHogAppUser(client, buildUserPostHogIdentity(sarah))

	expect(client.reset).toHaveBeenCalledTimes(1)
	expect(client.identify).toHaveBeenCalledWith(
		'phone:+18655550101',
		expect.anything(),
	)
})

test('the same person logging in again is not reset', () => {
	const { client } = fakePostHog({ distinctId: 'phone:+18655550101' })

	syncPostHogAppUser(client, buildUserPostHogIdentity(sarah))

	expect(client.reset).not.toHaveBeenCalled()
})

test('logout drops a login identity', () => {
	const { client } = fakePostHog({
		distinctId: 'phone:+18655550101',
		superProperties: { app_user_id: 'user_sarah' },
	})

	syncPostHogAppUser(client, null)

	expect(client.reset).toHaveBeenCalledTimes(1)
	expect(client.identify).not.toHaveBeenCalled()
})

test('a booking identity with no login is left alone', () => {
	const { client } = fakePostHog({ distinctId: 'phone:+18655559999' })

	syncPostHogAppUser(client, null)

	expect(client.reset).not.toHaveBeenCalled()
})

test('a role that went away does not stay on later events', () => {
	const { client, superProperties } = fakePostHog({
		distinctId: 'phone:+18655550101',
		superProperties: { app_user_id: 'user_sarah', app_user_roles: 'admin' },
	})

	syncPostHogAppUser(client, buildUserPostHogIdentity({ ...sarah, roles: [] }))

	expect(superProperties.app_user_roles).toBeUndefined()
	expect(superProperties.app_user_is_admin).toBe(false)
})
