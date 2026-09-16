import {
	json,
	MaxPartSizeExceededError,
	unstable_createMemoryUploadHandler,
	unstable_parseMultipartFormData,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { z } from 'zod'
import { takeRateLimitToken } from '#app/utils/ai-chat.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	TRANSCRIBE_MAX_BYTES,
	TRANSCRIBE_RATE_LIMIT,
	getTranscribeConfig,
	isWav,
	transcribeWav,
} from '#app/utils/transcribe.server.ts'

/**
 * Dictation: one WAV clip in, plain text out.
 *
 *   POST /resources/transcribe  multipart: audio (WAV file), final (true|false)
 *   -> 200 { text }   empty when the clip has no words
 *   -> 400 { error }   not multipart, not a WAV, or over 6 MB
 *   -> 429 { error }   more than 40 clips in a minute
 *   -> 502 { error }   the transcriber failed or sent nothing
 *   -> 503 { error }   no OpenRouter key on this server
 *   -> 504 { error }   the transcriber took too long
 *
 * Admin only. A preview (final=false) covers the recording so far; the
 * final (final=true) is the whole recording. Logs carry the model id and
 * lengths only, never the text.
 */

export const TRANSCRIBE_COPY = {
	notMultipart: 'Send the clip as multipart form data.',
	notWav: 'The clip must be a WAV file.',
	tooBig: 'The clip is too big. Stop and start again.',
	tooMany: 'That is many clips in one minute. Wait a moment and try again.',
	notSetUp: 'Dictation is not set up on this server. Ask Zane.',
	noAnswer: 'The transcriber did not answer. Try again.',
	tooLong: 'That took too long. Try again.',
	badFields: 'The clip fields are not valid.',
} as const

const FieldsSchema = z.object({
	final: z.enum(['true', 'false']).default('false'),
})

// Per-user sliding window of request timestamps. In-memory per machine.
const rateWindows = new Map<string, number[]>()

export function loader() {
	return json({ error: 'POST only' }, { status: 405 })
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'POST only' }, { status: 405 })
	}
	const userId = await requireUserWithRole(request, 'admin')

	// Refuse before the audio is buffered, as the picture upload does.
	pruneRateWindows()
	const window = takeRateLimitToken(
		rateWindows.get(userId) ?? [],
		Date.now(),
		TRANSCRIBE_RATE_LIMIT,
	)
	rateWindows.set(userId, window.timestamps)
	if (!window.allowed) {
		return json({ error: TRANSCRIBE_COPY.tooMany }, { status: 429 })
	}

	let formData: FormData
	try {
		formData = await unstable_parseMultipartFormData(
			request,
			unstable_createMemoryUploadHandler({ maxPartSize: TRANSCRIBE_MAX_BYTES }),
		)
	} catch (error) {
		return json(
			{
				error:
					error instanceof MaxPartSizeExceededError
						? TRANSCRIBE_COPY.tooBig
						: TRANSCRIBE_COPY.notMultipart,
			},
			{ status: 400 },
		)
	}

	const fields = FieldsSchema.safeParse({
		final: formData.get('final') ?? undefined,
	})
	if (!fields.success) {
		return json({ error: TRANSCRIBE_COPY.badFields }, { status: 400 })
	}
	const audio = formData.get('audio')
	if (!(audio instanceof Blob) || audio.size === 0) {
		return json({ error: TRANSCRIBE_COPY.notWav }, { status: 400 })
	}
	if (audio.size > TRANSCRIBE_MAX_BYTES) {
		return json({ error: TRANSCRIBE_COPY.tooBig }, { status: 400 })
	}
	const bytes = new Uint8Array(await audio.arrayBuffer())
	if (!isWav(bytes)) {
		return json({ error: TRANSCRIBE_COPY.notWav }, { status: 400 })
	}

	const config = getTranscribeConfig()
	if (!config) {
		return json({ error: TRANSCRIBE_COPY.notSetUp }, { status: 503 })
	}

	const final = fields.data.final === 'true'
	const result = await transcribeWav({
		wav: bytes,
		final,
		config,
	})
	if (result.ok) {
		console.log(
			`Transcribe: model ${result.model}, ${bytes.length} bytes, final ${final}, out ${result.text.length} chars, ${result.ms} ms`,
		)
		return json({ text: result.text })
	}
	if (result.error === 'openrouter_timeout') {
		console.log(
			`Transcribe: timeout, model ${result.model}, ${bytes.length} bytes, final ${final}`,
		)
		return json({ error: TRANSCRIBE_COPY.tooLong }, { status: 504 })
	}
	if (result.error === 'missing_open_router_api_key') {
		return json({ error: TRANSCRIBE_COPY.notSetUp }, { status: 503 })
	}
	console.log(
		`Transcribe: ${result.error}${result.status ? ` ${result.status}` : ''}, model ${result.model}, ${bytes.length} bytes, final ${final}`,
	)
	return json({ error: TRANSCRIBE_COPY.noAnswer }, { status: 502 })
}

/** Keep the in-memory window map from growing without bound. */
function pruneRateWindows() {
	const cutoff = Date.now() - TRANSCRIBE_RATE_LIMIT.windowMs
	for (const [key, timestamps] of rateWindows) {
		if (!timestamps.some(t => t > cutoff)) rateWindows.delete(key)
	}
}
