export type BookingAnalyticsExclusionInput = {
	email?: unknown
	emails?: unknown[]
	phone?: unknown
	phones?: unknown[]
}

const EXCLUDED_BOOKING_EMAIL_HASHES = new Set(['3319afc7', '016ed78c'])
const EXCLUDED_BOOKING_PHONE_HASHES = new Set(['aa252484'])

export function isExcludedBookingAnalyticsIdentity(
	input: BookingAnalyticsExclusionInput,
) {
	return getBookingAnalyticsExclusionReason(input) != null
}

export function getBookingAnalyticsExclusionReason({
	email,
	emails = [],
	phone,
	phones = [],
}: BookingAnalyticsExclusionInput) {
	for (const value of [email, ...emails]) {
		const normalizedEmail = normalizeBookingAnalyticsEmail(value)
		if (
			normalizedEmail &&
			EXCLUDED_BOOKING_EMAIL_HASHES.has(hashAnalyticsValue(normalizedEmail))
		) {
			return 'excluded_booking_email'
		}
	}

	for (const value of [phone, ...phones]) {
		const normalizedPhone = normalizeBookingAnalyticsPhone(value)
		if (
			normalizedPhone &&
			EXCLUDED_BOOKING_PHONE_HASHES.has(hashAnalyticsValue(normalizedPhone))
		) {
			return 'excluded_booking_phone'
		}
	}

	return null
}

export function normalizeBookingAnalyticsEmail(value: unknown) {
	if (typeof value !== 'string') return null
	const normalized = value.trim().toLowerCase()
	return normalized.includes('@') ? normalized : null
}

export function normalizeBookingAnalyticsPhone(value: unknown) {
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	if (!trimmed) return null

	const digits = trimmed.replace(/\D/g, '')
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (trimmed.startsWith('+') && digits.length >= 10) return `+${digits}`
	return null
}

function hashAnalyticsValue(value: string) {
	let hash = 0x811c9dc5
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, '0')
}
