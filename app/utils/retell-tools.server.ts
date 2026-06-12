import { json } from '@remix-run/node'
import { z } from 'zod'

import { getErrorMessage } from '#app/utils/misc.tsx'

const retellEnvelopeSchema = z
	.object({
		args: z.unknown().optional(),
		arguments: z.unknown().optional(),
		call: z.unknown().optional(),
		name: z.string().optional(),
	})
	.passthrough()

type RetellToolPayload<TSchema extends z.ZodTypeAny> = {
	args: z.output<TSchema>
	body: unknown
	call: Record<string, unknown> | null
}

export async function parseRetellToolArgs<TSchema extends z.ZodTypeAny>(
	request: Request,
	schema: TSchema,
): Promise<z.output<TSchema>> {
	const payload = await parseRetellToolPayload(request, schema)
	return payload.args
}

export async function parseRetellToolPayload<TSchema extends z.ZodTypeAny>(
	request: Request,
	schema: TSchema,
): Promise<RetellToolPayload<TSchema>> {
	assertToolSecret(request)
	const body = await request.json()
	const envelope = retellEnvelopeSchema.safeParse(body)
	const rawArgs = envelope.success
		? (envelope.data.args ?? envelope.data.arguments ?? body)
		: body
	const call = envelope.success ? getRecord(envelope.data.call) : null
	return {
		args: schema.parse(rawArgs),
		body,
		call,
	}
}

export function retellToolJson(data: unknown, init?: ResponseInit) {
	return json(data, init)
}

export function retellToolError(error: unknown) {
	if (error instanceof Response) return error

	console.error('Retell booking tool failed', error)
	return json(
		{
			error: 'tool_failed',
			message: getErrorMessage(error),
			ok: false,
		},
		{ status: 400 },
	)
}

export function assertToolSecret(request: Request) {
	const urlToken = process.env['RETELL_TOOL_URL_TOKEN']?.trim()
	const sharedSecret = process.env['RETELL_TOOL_SHARED_SECRET']?.trim()
	const expectedUrlToken = urlToken || sharedSecret
	if (!expectedUrlToken && !sharedSecret) {
		throw new Response('Retell tool token is not configured', { status: 500 })
	}

	const requestUrlToken = getRetellToolUrlToken(request)
	if (expectedUrlToken && requestUrlToken === expectedUrlToken) return

	const authorization = request.headers.get('authorization') ?? ''
	const headerSecret = request.headers.get('x-retell-tool-secret') ?? ''
	const bearer = authorization.replace(/^Bearer\s+/i, '').trim()

	if (
		sharedSecret &&
		(headerSecret === sharedSecret || bearer === sharedSecret)
	)
		return
	throw new Response('Unauthorized', { status: 401 })
}

export function pickRetellCallerPhone(call: Record<string, unknown> | null) {
	return (
		pickString(call, [
			'from_number',
			'fromNumber',
			'caller_number',
			'callerNumber',
			'phone_number',
			'customer_phone_number',
		]) ??
		pickString(getRecord(call?.metadata), [
			'from_number',
			'fromNumber',
			'caller_number',
			'callerNumber',
			'phone_number',
			'customer_phone_number',
		])
	)
}

export function pickRetellCallId(call: Record<string, unknown> | null) {
	return (
		pickString(call, ['call_id', 'callId', 'id']) ??
		pickString(getRecord(call?.metadata), ['call_id', 'callId', 'id'])
	)
}

export function pickRetellPublicLogUrl(call: Record<string, unknown> | null) {
	return (
		pickString(call, ['public_log_url', 'publicLogUrl']) ??
		pickString(getRecord(call?.metadata), ['public_log_url', 'publicLogUrl'])
	)
}

export function pickRetellCallRailCallId(call: Record<string, unknown> | null) {
	return (
		pickString(call, ['callrail_call_id', 'callrailCallId']) ??
		pickString(getRecord(call?.metadata), [
			'callrail_call_id',
			'callrailCallId',
		])
	)
}

export function pickRetellCallRailAccountId(
	call: Record<string, unknown> | null,
) {
	return (
		pickString(call, ['callrail_account_id', 'callrailAccountId']) ??
		pickString(getRecord(call?.metadata), [
			'callrail_account_id',
			'callrailAccountId',
		])
	)
}

function getRecord(value: unknown) {
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null
}

function getRetellToolUrlToken(request: Request) {
	const pathname = new URL(request.url).pathname
	const firstSegment = pathname.split('/').filter(Boolean)[0]
	return firstSegment ? decodeURIComponent(firstSegment) : ''
}

function pickString(
	record: Record<string, unknown> | null,
	keys: Array<string>,
) {
	if (!record) return null
	for (const key of keys) {
		const value = record[key]
		if (typeof value === 'string' && value.trim()) return value.trim()
	}
	return null
}
