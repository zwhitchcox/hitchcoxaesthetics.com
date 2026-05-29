import { type ActionFunctionArgs } from '@remix-run/node'

import {
	listVoiceBookingServices,
	voiceServiceLookupSchema,
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
		const input = await parseRetellToolArgs(request, voiceServiceLookupSchema)
		return retellToolJson(await listVoiceBookingServices(input))
	} catch (error) {
		return retellToolError(error)
	}
}
