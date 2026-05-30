import { type ActionFunctionArgs } from '@remix-run/node'

import {
	rescheduleVoiceAppointment,
	voiceRescheduleAppointmentSchema,
} from '#app/utils/blvd-voice-booking.server.ts'
import {
	parseRetellToolPayload,
	pickRetellCallerPhone,
	retellToolError,
	retellToolJson,
} from '#app/utils/retell-tools.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return retellToolJson({ error: 'Method not allowed' }, { status: 405 })
	}

	try {
		const payload = await parseRetellToolPayload(
			request,
			voiceRescheduleAppointmentSchema,
		)
		return retellToolJson(
			await rescheduleVoiceAppointment({
				...payload.args,
				caller_phone_number:
					payload.args.caller_phone_number ??
					pickRetellCallerPhone(payload.call) ??
					undefined,
			}),
		)
	} catch (error) {
		return retellToolError(error)
	}
}
