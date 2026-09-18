import { normalizeOptionalPhone } from '#app/utils/posthog-booking-identity.ts'

/**
 * PostHog identity for a logged-in site user (admins and staff included), so
 * one person's activity can be found, or filtered out, by name.
 *
 * The distinct id is phone-first, the same id the booking flow uses. One human
 * is then one PostHog person whether they log in, book, or call. PostHog
 * cannot merge two identified persons later, so the two flows must agree.
 */

/** Set on every event while a user is logged in. Also marks a login identity. */
export const APP_USER_ID_PROPERTY = 'app_user_id'

const APP_USER_EVENT_PROPERTIES = [
	APP_USER_ID_PROPERTY,
	'app_user_name',
	'app_user_type',
	'app_user_roles',
	'app_user_is_admin',
] as const

/** Distinct ids that are already a known person, from a login or a booking. */
export const IDENTIFIED_DISTINCT_ID_PATTERN = /^(email|phone|blvd-client|user):/

export type PostHogAppUser = {
	id: string
	name?: string | null
	phone?: string | null
	type?: string | null
	roles?: ReadonlyArray<{ name: string }> | null
}

type PostHogProperties = Record<string, string | boolean>

export type UserPostHogIdentity = {
	distinctId: string
	/** Go on every event while the user is logged in (super properties). */
	eventProperties: PostHogProperties
	/** Go on the PostHog person. */
	personProperties: PostHogProperties
}

export function buildUserPostHogIdentity(
	user: PostHogAppUser | null | undefined,
): UserPostHogIdentity | null {
	if (!user?.id) return null

	const phone = normalizeOptionalPhone(user.phone)
	const name = user.name?.trim() || null
	const type = user.type?.trim() || null
	const roles = (user.roles ?? []).map(role => role.name).sort()
	const isAdmin = roles.includes('admin')

	const eventProperties: PostHogProperties = {
		[APP_USER_ID_PROPERTY]: user.id,
		app_user_is_admin: isAdmin,
		...(name ? { app_user_name: name } : {}),
		...(type ? { app_user_type: type } : {}),
		...(roles.length ? { app_user_roles: roles.join(',') } : {}),
	}

	return {
		distinctId: phone ? `phone:${phone}` : `user:${user.id}`,
		eventProperties,
		personProperties: {
			...eventProperties,
			is_admin: isAdmin,
			...(name ? { $name: name, name } : {}),
			...(phone ? { phone } : {}),
		},
	}
}

/** The part of posthog-js this module calls. */
export type PostHogIdentityClient = {
	get_distinct_id?: () => unknown
	get_property?: (name: string) => unknown
	identify: (distinctId: string, properties?: PostHogProperties) => void
	register: (properties: PostHogProperties) => void
	reset: () => void
	unregister?: (name: string) => void
}

/**
 * Make PostHog agree with who is logged in. Safe to call again and again.
 *
 * - Logged in: events carry the `app_user_*` properties and the person is
 *   identified. A browser that PostHog knows as someone else (the last login,
 *   or a client whose booking was made on this browser) starts a new person
 *   first, because the logged-in user is the one at the keyboard.
 * - Logged out after a login: the identity is dropped, so the next person on
 *   this browser is not recorded as the one who logged in. A booking identity
 *   (no login) is left as it is.
 */
export function syncPostHogAppUser(
	posthog: PostHogIdentityClient,
	identity: UserPostHogIdentity | null,
) {
	const loginUserId = posthog.get_property?.(APP_USER_ID_PROPERTY)

	if (!identity) {
		if (loginUserId) posthog.reset()
		return
	}

	const currentDistinctId = posthog.get_distinct_id?.()
	const isSomeoneElse =
		typeof currentDistinctId === 'string' &&
		IDENTIFIED_DISTINCT_ID_PATTERN.test(currentDistinctId) &&
		currentDistinctId !== identity.distinctId
	if (isSomeoneElse) posthog.reset()

	// A role or name that went away must not stay on later events.
	for (const key of APP_USER_EVENT_PROPERTIES) {
		if (!(key in identity.eventProperties)) posthog.unregister?.(key)
	}
	posthog.register(identity.eventProperties)
	posthog.identify(identity.distinctId, identity.personProperties)
}
