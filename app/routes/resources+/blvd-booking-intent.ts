import { json, type ActionFunctionArgs } from '@remix-run/node'

import {
	blvdBookingIntentInputSchema,
	recordBlvdBookingIntent,
} from '#app/utils/blvd-booking-intent.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed' }, { status: 405 })
	}

	try {
		const payload = blvdBookingIntentInputSchema.parse(await request.json())
		const result = await recordBlvdBookingIntent(payload)

		return json({ ok: true, result })
	} catch (error) {
		console.error('Failed to persist Boulevard booking intent', error)
		return json({ ok: false }, { status: 400 })
	}
}
