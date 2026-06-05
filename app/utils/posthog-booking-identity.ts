export type BookingPostHogIdentityInput = {
	boulevardClientId?: string | null
	email?: string | null
	firstName?: string | null
	lastName?: string | null
	phone?: string | null
}

export type BookingPostHogIdentity = {
	distinctId: string
	properties: Record<string, string>
}

export function buildBookingPostHogIdentity({
	boulevardClientId,
	email,
	firstName,
	lastName,
	phone,
}: BookingPostHogIdentityInput): BookingPostHogIdentity | null {
	const normalizedEmail = normalizeOptionalEmail(email)
	const normalizedPhone = normalizeOptionalPhone(phone)
	const normalizedBoulevardClientId = normalizeOptionalText(boulevardClientId)
	const normalizedFirstName = normalizeOptionalText(firstName)
	const normalizedLastName = normalizeOptionalText(lastName)
	const name = [normalizedFirstName, normalizedLastName]
		.filter(Boolean)
		.join(' ')
		.trim()

	const distinctId = normalizedEmail
		? `email:${normalizedEmail}`
		: normalizedPhone
			? `phone:${normalizedPhone}`
			: normalizedBoulevardClientId
				? `blvd-client:${normalizedBoulevardClientId}`
				: null

	if (!distinctId) return null

	return {
		distinctId,
		properties: {
			...(name ? { $name: name, name } : {}),
			...(normalizedEmail
				? { $email: normalizedEmail, email: normalizedEmail }
				: {}),
			...(normalizedPhone ? { phone: normalizedPhone } : {}),
			...(normalizedFirstName ? { first_name: normalizedFirstName } : {}),
			...(normalizedLastName ? { last_name: normalizedLastName } : {}),
			...(normalizedBoulevardClientId
				? { blvd_client_id: normalizedBoulevardClientId }
				: {}),
		},
	}
}

function normalizeOptionalText(value?: string | null) {
	const trimmed = value?.trim()
	return trimmed || null
}

function normalizeOptionalEmail(value?: string | null) {
	const trimmed = value?.trim().toLowerCase()
	return trimmed && trimmed.includes('@') ? trimmed : null
}

function normalizeOptionalPhone(value?: string | null) {
	const trimmed = value?.trim()
	if (!trimmed) return null

	const digits = trimmed.replace(/\D/g, '')
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (trimmed.startsWith('+') && digits.length >= 10) return trimmed
	return null
}
