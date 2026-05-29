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

export async function parseRetellToolArgs<TSchema extends z.ZodTypeAny>(
	request: Request,
	schema: TSchema,
): Promise<z.output<TSchema>> {
	assertToolSecret(request)
	const body = await request.json()
	const envelope = retellEnvelopeSchema.safeParse(body)
	const rawArgs = envelope.success
		? (envelope.data.args ?? envelope.data.arguments ?? body)
		: body
	return schema.parse(rawArgs)
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
	const secret = process.env['RETELL_TOOL_SHARED_SECRET']?.trim()
	if (!secret) return

	const authorization = request.headers.get('authorization') ?? ''
	const headerSecret = request.headers.get('x-retell-tool-secret') ?? ''
	const bearer = authorization.replace(/^Bearer\s+/i, '').trim()

	if (headerSecret === secret || bearer === secret) return
	throw new Response('Unauthorized', { status: 401 })
}
