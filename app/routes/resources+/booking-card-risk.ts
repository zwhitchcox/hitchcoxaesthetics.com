import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'

import { getBookingCardRisk } from '#app/utils/booking-card-risk.server.ts'

const bookingCardRiskSchema = z.object({
	phone: z.string().min(10),
})

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed', ok: false }, { status: 405 })
	}

	try {
		const payload = bookingCardRiskSchema.parse(await request.json())
		const phone = normalizePhoneNumber(payload.phone)
		if (!phone) {
			return json(
				{ error: 'Enter a valid mobile phone number.', ok: false },
				{ status: 400 },
			)
		}

		const risk = await getBookingCardRisk(phone)
		return json({
			has_card_on_file: risk.hasCardOnFile,
			ok: true,
			reason: risk.reason,
			require_card: risk.requireCard,
		})
	} catch {
		// Fail open: a lookup hiccup must never block a booking.
		return json({
			has_card_on_file: false,
			ok: true,
			reason: null,
			require_card: false,
		})
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
