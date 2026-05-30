import { json, type ActionFunctionArgs } from '@remix-run/node'

import {
	callTrackingSessionAttributionInputSchema,
	recordCallTrackingSessionAttribution,
} from '#app/utils/call-tracking-attribution.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed' }, { status: 405 })
	}

	try {
		const payload = callTrackingSessionAttributionInputSchema.parse(
			await request.json(),
		)
		return json(await recordCallTrackingSessionAttribution(payload))
	} catch (error) {
		console.error('Failed to persist call tracking attribution', error)
		return json(
			{
				error: 'call_tracking_attribution_failed',
				ok: false,
			},
			{ status: 400 },
		)
	}
}
