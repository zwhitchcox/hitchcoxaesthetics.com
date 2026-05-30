import { type ActionFunctionArgs } from '@remix-run/node'

import {
	getVoiceBookingAvailability,
	voiceAvailabilitySchema,
} from '#app/utils/blvd-voice-booking.server.ts'
import {
	parseRetellToolArgs,
	retellToolError,
	retellToolJson,
} from '#app/utils/retell-tools.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return retellToolJson({ error: 'Method not allowed' }, { status: 405 })
	}

	try {
		const input = await parseRetellToolArgs(request, voiceAvailabilitySchema)
		return retellToolJson(await getVoiceBookingAvailability(input))
	} catch (error) {
		return retellToolError(error)
	}
}
