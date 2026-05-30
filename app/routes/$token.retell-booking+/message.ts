import { type ActionFunctionArgs } from '@remix-run/node'

import {
	retellStaffMessageSchema,
	sendRetellStaffMessage,
} from '#app/utils/retell-staff-message.server.ts'
import {
	parseRetellToolPayload,
	pickRetellCallRailAccountId,
	pickRetellCallRailCallId,
	pickRetellCallerPhone,
	pickRetellCallId,
	pickRetellPublicLogUrl,
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
			retellStaffMessageSchema,
		)
		return retellToolJson(
			await sendRetellStaffMessage({
				...payload.args,
				call_id:
					payload.args.call_id ?? pickRetellCallId(payload.call) ?? undefined,
				callrail_account_id:
					payload.args.callrail_account_id ??
					pickRetellCallRailAccountId(payload.call) ??
					undefined,
				callrail_call_id:
					payload.args.callrail_call_id ??
					pickRetellCallRailCallId(payload.call) ??
					undefined,
				caller_phone_number:
					payload.args.caller_phone_number ??
					pickRetellCallerPhone(payload.call) ??
					undefined,
				retell_public_log_url:
					payload.args.retell_public_log_url ??
					pickRetellPublicLogUrl(payload.call) ??
					undefined,
			}),
		)
	} catch (error) {
		return retellToolError(error)
	}
}
