/**
 * Transcription for dictation: one WAV clip in, plain text out, through
 * OpenRouter (google/gemini-2.5-flash by default, the lite model invented
 * words on a test clip; TRANSCRIBE_MODEL
 * overrides it). The transport is the shared one in openrouter.server.ts,
 * with the same key as the article chat: OPEN_ROUTER_API_KEY.
 *
 * No hint goes with a clip. In the live probe (2026-09-15) every wording of
 * "the words before this were …" made the model echo the line, drop words
 * or repeat the hint. The previews are cumulative, so a clip carries its
 * own context.
 *
 * Logs carry the model id, byte counts and lengths only. Never the text,
 * never the key.
 */
import {
	chatCompletion,
	openRouterApiKey,
} from '#app/utils/openrouter.server.ts'

export const TRANSCRIBE_DEFAULT_MODEL = 'google/gemini-2.5-flash'
export const TRANSCRIBE_RATE_LIMIT = { max: 40, windowMs: 60_000 } as const
/** A 120-second mono 16 kHz 16-bit WAV is 3.84 MB; this leaves room. */
export const TRANSCRIBE_MAX_BYTES = 6 * 1024 * 1024
export const TRANSCRIBE_PREVIEW_TIMEOUT_MS = 20_000
export const TRANSCRIBE_FINAL_TIMEOUT_MS = 45_000
const MAX_OUTPUT_TOKENS = 2000

/** Terms the model spells this way. The echo check below uses the same list. */
export const TRANSCRIBE_TERMS = [
	'Botox',
	'Dysport',
	'Xeomin',
	'Jeuveau',
	'Daxxify',
	'filler',
	'Juvederm',
	'Restylane',
	'masseter',
	'glabella',
	'units',
	'mg',
	'semaglutide',
	'tirzepatide',
] as const

/**
 * The answer for a clip with no words. Asked for an empty string, the model
 * answered an apology or recited the term list instead (live probe).
 */
export const TRANSCRIBE_SILENCE = '[silence]'

export const TRANSCRIBE_PROMPT = `Transcribe the audio exactly, in English, as plain text. No commentary, no quotation marks, no labels. Write numbers as digits. When you hear these cosmetic and medical terms, spell them this way: ${TRANSCRIBE_TERMS.join(', ')}. If the audio has no words, answer with exactly ${TRANSCRIBE_SILENCE} and nothing else.`

/** RIFF at 0 and WAVE at 8: the WAV container. */
export function isWav(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false
	return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE'
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
	let out = ''
	for (let i = offset; i < offset + length; i++)
		out += String.fromCharCode(bytes[i] ?? 0)
	return out
}

export type TranscribeRequestBody = {
	model: string
	temperature: number
	max_tokens: number
	messages: [
		{ role: 'system'; content: string },
		{
			role: 'user'
			content: [
				{ type: 'text'; text: string },
				{ type: 'input_audio'; input_audio: { data: string; format: 'wav' } },
			]
		},
	]
}

/** The chat-completions body for one clip. */
export function buildTranscribeRequest({
	wavBase64,
	model,
}: {
	wavBase64: string
	model: string
}): TranscribeRequestBody {
	return {
		model,
		temperature: 0,
		max_tokens: MAX_OUTPUT_TOKENS,
		messages: [
			{ role: 'system', content: TRANSCRIBE_PROMPT },
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'Transcribe this audio.' },
					{
						type: 'input_audio',
						input_audio: { data: wavBase64, format: 'wav' },
					},
				],
			},
		],
	}
}

const LABEL_RE = /^(?:transcript(?:ion)?|text|audio|speech)\s*:\s*/i
/* The model's ways of saying there were no words, seen in the live probe. */
const REFUSAL_RES = [
	/^(?:i'?m|i am) sorry,? (?:but )?(?:there (?:is|was) no|i (?:cannot|can't|could not|couldn't|do not|don't|am unable to|was unable to)|the audio|this audio|no audio|no speech)/i,
	/^(?:there (?:is|was)|there's) no (?:audio|speech|spoken)/i,
]

/**
 * The transcript from a completion payload (or from a bare content string
 * or message): trimmed, a leading "Transcript:" label dropped, wrapping
 * quotes dropped. An empty string when there is no text, when the model
 * answered the silence word, recited the term list, or apologised about
 * missing audio.
 */
export function parseTranscribeReply(payload: unknown): string {
	const content = contentOf(payload)
	let text = content.replace(/\r\n/g, '\n').trim()
	text = text.replace(LABEL_RE, '').trim()
	for (let i = 0; i < 2; i++) {
		const unquoted = stripQuotes(text)
		if (unquoted === text) break
		text = unquoted
	}
	if (isSilence(text) || isTermListEcho(text) || isRefusal(text)) return ''
	return text
}

function isSilence(text: string): boolean {
	return text.replace(/^[^a-z]+|[^a-z]+$/gi, '').toLowerCase() === 'silence'
}

function isRefusal(text: string): boolean {
	return REFUSAL_RES.some(re => re.test(text))
}

const TERM_INDEX = new Map<string, number>(
	TRANSCRIBE_TERMS.map((term, index) => [term.toLowerCase(), index]),
)

/**
 * True when the text is two or more words from the term list, in the
 * list's order, and nothing else: the model recited the prompt. Real
 * speech in that exact shape ("Botox, filler") is lost; that is rarer than
 * a recital on a pause.
 */
export function isTermListEcho(text: string): boolean {
	const words = text.toLowerCase().match(/[a-z]+/g) ?? []
	if (words.length < 2) return false
	let last = -1
	for (const word of words) {
		const index = TERM_INDEX.get(word)
		if (index === undefined || index < last) return false
		last = index
	}
	return true
}

function contentOf(payload: unknown): string {
	if (typeof payload === 'string') return payload
	if (!payload || typeof payload !== 'object') return ''
	const record = payload as {
		choices?: Array<{ message?: { content?: unknown } }>
		message?: { content?: unknown }
		content?: unknown
	}
	const raw =
		record.choices?.[0]?.message?.content ??
		record.message?.content ??
		record.content
	if (typeof raw === 'string') return raw
	if (Array.isArray(raw)) {
		return raw
			.map(part =>
				part &&
				typeof part === 'object' &&
				typeof (part as { text?: unknown }).text === 'string'
					? (part as { text: string }).text
					: '',
			)
			.join('')
	}
	return ''
}

const QUOTE_PAIRS: Array<[string, string]> = [
	['"', '"'],
	['“', '”'],
	['«', '»'],
	["'", "'"],
	['‘', '’'],
]

function stripQuotes(text: string): string {
	for (const [open, close] of QUOTE_PAIRS) {
		if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
			return text.slice(open.length, text.length - close.length).trim()
		}
	}
	return text
}

export function getTranscribeConfig() {
	const apiKey = openRouterApiKey()
	if (!apiKey) return null
	return {
		apiKey,
		model: process.env.TRANSCRIBE_MODEL?.trim() || TRANSCRIBE_DEFAULT_MODEL,
	}
}

export type TranscribeErrorCode =
	| 'missing_open_router_api_key'
	| 'openrouter_http_error'
	| 'openrouter_timeout'
	| 'openrouter_empty_response'

export type TranscribeResult =
	| { ok: true; text: string; model: string; ms: number }
	| { ok: false; error: TranscribeErrorCode; model: string; status?: number }

/**
 * Transcribe one WAV clip. A preview gets 20 s, a final 45 s. A clip with
 * no words is ok with an empty text; the client decides what to show. A
 * reply with no content at all is a failure (the caller answers 502).
 */
export async function transcribeWav({
	wav,
	final,
	config = getTranscribeConfig(),
	fetchImpl = fetch,
}: {
	wav: Uint8Array
	final: boolean
	config?: ReturnType<typeof getTranscribeConfig>
	fetchImpl?: typeof fetch
}): Promise<TranscribeResult> {
	const model = config?.model ?? TRANSCRIBE_DEFAULT_MODEL
	if (!config) return { ok: false, model, error: 'missing_open_router_api_key' }
	const startedAt = Date.now()
	const deadline =
		startedAt +
		(final ? TRANSCRIBE_FINAL_TIMEOUT_MS : TRANSCRIBE_PREVIEW_TIMEOUT_MS)
	const { model: _model, ...body } = buildTranscribeRequest({
		wavBase64: Buffer.from(wav).toString('base64'),
		model,
	})
	const turn = await chatCompletion({
		apiKey: config.apiKey,
		model,
		body,
		deadline,
		fetchImpl,
	})
	if (turn.kind === 'timeout')
		return { ok: false, model, error: 'openrouter_timeout' }
	if (turn.kind === 'http') {
		console.error(`Transcribe: OpenRouter ${turn.status} (model ${model})`)
		return {
			ok: false,
			model,
			error: 'openrouter_http_error',
			status: turn.status,
		}
	}
	if (turn.message.content === null) {
		return { ok: false, model, error: 'openrouter_empty_response' }
	}
	const text = parseTranscribeReply(turn.message)
	return { ok: true, text, model, ms: Date.now() - startedAt }
}
