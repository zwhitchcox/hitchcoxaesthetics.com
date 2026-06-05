import { createHash } from 'node:crypto'

import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'

import { isExcludedBookingAnalyticsIdentity } from '#app/utils/analytics-exclusions.ts'
import { findAdminClientByPhone } from '#app/utils/blvd-voice-booking.server.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'

const bookingClientLookupSchema = z.object({
	phone: z.string().min(10),
})

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed', ok: false }, { status: 405 })
	}

	let phone: string | null = null

	try {
		const payload = bookingClientLookupSchema.parse(await request.json())
		phone = normalizePhoneNumber(payload.phone)
		if (!phone) {
			return json(
				{ error: 'Enter a valid mobile phone number.', ok: false },
				{ status: 400 },
			)
		}

		const client = await findAdminClientByPhone(phone)
		return json({
			client_found: Boolean(client),
			client_type: client ? 'returning' : 'new',
			ok: true,
			phone,
		})
	} catch (error) {
		if (!isExcludedBookingAnalyticsIdentity({ phone })) {
			await captureServerPostHogEvent({
				distinctId: phone
					? `booking-client-lookup:${hashValue(phone)}`
					: 'booking-client-lookup:unknown',
				event: 'booking_error',
				insertId: `booking-client-lookup:${Date.now()}:${Math.random()
					.toString(36)
					.slice(2)}`,
				properties: {
					booking_error_action: 'lookup_client_by_phone',
					booking_error_area: 'client_lookup',
					booking_error_message: getErrorMessage(error),
					booking_error_source: 'server',
					booking_phone_last4: phone ? phone.slice(-4) : undefined,
					booking_step: 'service',
				},
			})
		}

		return json(
			{
				error: 'We could not check that mobile number. Please try again.',
				ok: false,
			},
			{ status: 500 },
		)
	}
}

function normalizePhoneNumber(value: string) {
	const digits = value.replace(/\D/g, '')
	if (!digits) return null
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (value.trim().startsWith('+')) return value.trim()
	return `+${digits}`
}

function hashValue(value: string) {
	return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	return 'Unknown error'
}
