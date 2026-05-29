import { type ActionFunctionArgs, json } from '@remix-run/node'

import {
	callRailSpamInputSchema,
	markCallRailCallerAsSpam,
} from '#app/utils/callrail-spam.server.ts'
import { assertToolSecret } from '#app/utils/retell-tools.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed' }, { status: 405 })
	}

	try {
		assertToolSecret(request)
		const body = await request.json()
		const args = getArgs(body)
		const call = getCall(body)
		const input = callRailSpamInputSchema.parse({
			account_id: args.account_id,
			caller_phone_number:
				args.caller_phone_number ??
				pickString(call, [
					'from_number',
					'fromNumber',
					'from',
					'caller_number',
					'callerNumber',
					'phone_number',
					'phoneNumber',
					'customer_phone_number',
					'customerPhoneNumber',
				]) ??
				pickString(getRecord(call.metadata), [
					'from_number',
					'fromNumber',
					'caller_number',
					'callerNumber',
					'customer_phone_number',
					'customerPhoneNumber',
				]),
			callrail_call_id:
				args.callrail_call_id ??
				pickString(call, ['callrail_call_id', 'callrailCallId']) ??
				pickString(getRecord(call.metadata), [
					'callrail_call_id',
					'callrailCallId',
				]),
			reason: args.reason,
		})
		return json(await markCallRailCallerAsSpam(input))
	} catch (error) {
		if (error instanceof Response) return error
		console.error('Retell CallRail spam tool failed', error)
		return json(
			{
				error: 'tool_failed',
				message: error instanceof Error ? error.message : 'Unknown error',
				ok: false,
				should_end_call: true,
			},
			{ status: 400 },
		)
	}
}

function getArgs(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== 'object') return {}
	const record = body as Record<string, unknown>
	return record.args && typeof record.args === 'object'
		? (record.args as Record<string, unknown>)
		: record.arguments && typeof record.arguments === 'object'
			? (record.arguments as Record<string, unknown>)
			: record
}

function getCall(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== 'object') return {}
	const record = body as Record<string, unknown>
	return getRecord(record.call)
}

function getRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {}
}

function pickString(record: Record<string, unknown>, keys: Array<string>) {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === 'string' && value.trim()) return value
	}
	return undefined
}
