export type LastBookingServiceHint = {
	label: string
	path: string
	preferredLocationId?: string | null
	search: string
}

const LAST_BOOKING_SERVICE_HINT_STORAGE_KEY = 'sha:last-booking-service-source'

function normalizeLastBookingServiceHint(
	value: unknown,
): LastBookingServiceHint | null {
	if (!value || typeof value !== 'object') return null

	const hint = value as Record<string, unknown>
	const label = typeof hint.label === 'string' ? hint.label.trim() : ''
	const path = typeof hint.path === 'string' ? hint.path.trim() : ''
	const search = typeof hint.search === 'string' ? hint.search.trim() : ''
	const preferredLocationId =
		typeof hint.preferredLocationId === 'string' &&
		hint.preferredLocationId.trim()
			? hint.preferredLocationId.trim()
			: null

	if (!path.startsWith('/')) return null
	if (!label && !search) return null

	return {
		label: label || search,
		path,
		preferredLocationId,
		search: search || label,
	}
}

export function readLastBookingServiceHint() {
	if (typeof window === 'undefined') return null

	try {
		const storedValue = window.sessionStorage.getItem(
			LAST_BOOKING_SERVICE_HINT_STORAGE_KEY,
		)
		if (!storedValue) return null

		return normalizeLastBookingServiceHint(JSON.parse(storedValue))
	} catch {
		return null
	}
}

export function writeLastBookingServiceHint(hint: LastBookingServiceHint) {
	if (typeof window === 'undefined') return

	const normalizedHint = normalizeLastBookingServiceHint(hint)
	if (!normalizedHint) return

	try {
		window.sessionStorage.setItem(
			LAST_BOOKING_SERVICE_HINT_STORAGE_KEY,
			JSON.stringify(normalizedHint),
		)
	} catch {
		// Ignore storage failures in private mode or blocked-storage contexts.
	}
}
