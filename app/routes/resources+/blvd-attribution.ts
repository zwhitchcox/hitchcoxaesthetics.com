import { json, type ActionFunctionArgs } from '@remix-run/node'

import {
	recordBoulevardBookingAttributionTouch,
	boulevardBookingAttributionInputSchema,
} from '#app/utils/blvd-attribution.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed' }, { status: 405 })
	}

	try {
		const payload = boulevardBookingAttributionInputSchema.parse(
			await request.json(),
		)
		const result = await recordBoulevardBookingAttributionTouch(payload)

		return json({ ok: true, result })
	} catch (error) {
		console.error('Failed to persist Boulevard attribution touch', error)
		return json({ ok: false }, { status: 400 })
	}
}
