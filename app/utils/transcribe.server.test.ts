import { describe, expect, test } from 'vitest'
import {
	TRANSCRIBE_PROMPT,
	TRANSCRIBE_SILENCE,
	TRANSCRIBE_TERMS,
	buildTranscribeRequest,
	isTermListEcho,
	isWav,
	parseTranscribeReply,
	transcribeWav,
} from './transcribe.server.ts'

function wavBytes(): Uint8Array {
	const bytes = new Uint8Array(44)
	bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
	bytes.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
	return bytes
}

function jsonReply(content: unknown): typeof fetch {
	return (async () =>
		new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		})) as unknown as typeof fetch
}

describe('isWav', () => {
	test('accepts RIFF....WAVE and refuses anything else', () => {
		expect(isWav(wavBytes())).toBe(true)
		const webm = new Uint8Array([
			0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0,
		])
		expect(isWav(webm)).toBe(false)
		expect(isWav(new Uint8Array(4))).toBe(false)
		const riffOnly = wavBytes()
		riffOnly.set([0x41, 0x56, 0x49, 0x20], 8) // "AVI "
		expect(isWav(riffOnly)).toBe(false)
	})
})

describe('buildTranscribeRequest', () => {
	test('sends the system prompt, the audio part as wav, and temperature 0', () => {
		const body = buildTranscribeRequest({
			wavBase64: 'UklGRg==',
			model: 'google/gemini-2.5-flash-lite',
		})
		expect(body.model).toBe('google/gemini-2.5-flash-lite')
		expect(body.temperature).toBe(0)
		expect(body.max_tokens).toBe(2000)
		expect(body.messages[0]).toEqual({
			role: 'system',
			content: TRANSCRIBE_PROMPT,
		})
		expect(body.messages[1].role).toBe('user')
		expect(body.messages[1].content[0]).toEqual({
			type: 'text',
			text: 'Transcribe this audio.',
		})
		expect(body.messages[1].content[1]).toEqual({
			type: 'input_audio',
			input_audio: { data: 'UklGRg==', format: 'wav' },
		})
	})

	test('the prompt spells the terms and names the silence answer', () => {
		expect(TRANSCRIBE_PROMPT).toContain(
			`spell them this way: ${TRANSCRIBE_TERMS.join(', ')}`,
		)
		expect(TRANSCRIBE_PROMPT).toContain(
			`answer with exactly ${TRANSCRIBE_SILENCE} and nothing else`,
		)
		expect(TRANSCRIBE_PROMPT).not.toContain('empty string')
	})
})

describe('parseTranscribeReply', () => {
	const payload = (content: unknown) => ({
		choices: [{ message: { content } }],
	})

	test('returns plain text trimmed', () => {
		expect(parseTranscribeReply(payload('  Say 20 units.\n'))).toBe(
			'Say 20 units.',
		)
	})

	test('strips wrapping quotes, straight and curly', () => {
		expect(parseTranscribeReply(payload('"Say 20 units."'))).toBe(
			'Say 20 units.',
		)
		expect(parseTranscribeReply(payload('“Say 20 units.”'))).toBe(
			'Say 20 units.',
		)
	})

	test('strips a leading Transcript: label', () => {
		expect(parseTranscribeReply(payload('Transcript: Say 20 units.'))).toBe(
			'Say 20 units.',
		)
		expect(
			parseTranscribeReply(payload('Transcription:\n"Say 20 units."')),
		).toBe('Say 20 units.')
	})

	test('keeps quotes inside the text', () => {
		expect(
			parseTranscribeReply(payload('She said "twenty units" twice.')),
		).toBe('She said "twenty units" twice.')
	})

	test('the silence answer is an empty transcript', () => {
		expect(parseTranscribeReply(payload(TRANSCRIBE_SILENCE))).toBe('')
		expect(parseTranscribeReply(payload('"[silence]"'))).toBe('')
		expect(parseTranscribeReply(payload('[SILENCE].'))).toBe('')
		expect(parseTranscribeReply(payload('silence'))).toBe('')
		expect(parseTranscribeReply(payload('The silence was long.'))).toBe(
			'The silence was long.',
		)
	})

	test('a recital of the term list is an empty transcript', () => {
		// On a pause the model recited the prompt's term list (live probe).
		expect(parseTranscribeReply(payload(TRANSCRIBE_TERMS.join(' ')))).toBe('')
		expect(parseTranscribeReply(payload(TRANSCRIBE_TERMS.join(', ')))).toBe('')
		expect(parseTranscribeReply(payload('Botox, Dysport, filler'))).toBe('')
		expect(parseTranscribeReply(payload('20 units of Botox'))).toBe(
			'20 units of Botox',
		)
		expect(parseTranscribeReply(payload('Botox'))).toBe('Botox')
		expect(isTermListEcho('units mg')).toBe(true)
		expect(isTermListEcho('mg units')).toBe(false)
		expect(isTermListEcho('')).toBe(false)
	})

	test('an apology about missing audio is an empty transcript', () => {
		expect(
			parseTranscribeReply(
				payload(
					"I'm sorry, but there is no audio content for me to transcribe. Please provide the audio file.",
				),
			),
		).toBe('')
		expect(
			parseTranscribeReply(
				payload('I am sorry, I cannot transcribe this clip.'),
			),
		).toBe('')
		expect(
			parseTranscribeReply(payload('There is no speech in this clip.')),
		).toBe('')
		expect(parseTranscribeReply(payload("I'm sorry I was late."))).toBe(
			"I'm sorry I was late.",
		)
	})

	test('reads array content parts, a bare message and a bare string', () => {
		expect(
			parseTranscribeReply(
				payload([
					{ type: 'text', text: 'one ' },
					{ type: 'text', text: 'two' },
				]),
			),
		).toBe('one two')
		expect(parseTranscribeReply({ message: { content: 'hi' } })).toBe('hi')
		expect(parseTranscribeReply({ content: 'hi' })).toBe('hi')
		expect(parseTranscribeReply('hi')).toBe('hi')
	})

	test('is empty for no content, null, or a malformed payload', () => {
		expect(parseTranscribeReply(payload(''))).toBe('')
		expect(parseTranscribeReply(payload(null))).toBe('')
		expect(parseTranscribeReply(null)).toBe('')
		expect(parseTranscribeReply({ choices: [] })).toBe('')
	})
})

describe('transcribeWav', () => {
	const config = { apiKey: 'test-key', model: 'test/model' }

	test('posts the wav as base64 and returns the text', async () => {
		let sent: { url: string; init: RequestInit } | null = null
		const fetchImpl = (async (url: string, init: RequestInit) => {
			sent = { url, init }
			return new Response(
				JSON.stringify({
					choices: [
						{ message: { content: '"The first visit is 10 to 20 units."' } },
					],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			)
		}) as unknown as typeof fetch
		const result = await transcribeWav({
			wav: wavBytes(),
			final: true,
			config,
			fetchImpl,
		})
		expect(result).toMatchObject({
			ok: true,
			text: 'The first visit is 10 to 20 units.',
			model: 'test/model',
		})
		expect(sent).not.toBeNull()
		const { url, init } = sent!
		expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
		const headers = init.headers as Record<string, string>
		expect(headers.Authorization).toBe('Bearer test-key')
		expect(headers['X-Title']).toBe('Hitchcox article review')
		const body = JSON.parse(String(init.body)) as ReturnType<
			typeof buildTranscribeRequest
		>
		expect(body.model).toBe('test/model')
		expect(body.messages[1].content[1].input_audio.data).toBe(
			Buffer.from(wavBytes()).toString('base64'),
		)
		expect(body.messages[1].content[0].text).toBe('Transcribe this audio.')
	})

	test('the silence answer and an empty content are ok with an empty text', async () => {
		expect(
			await transcribeWav({
				wav: wavBytes(),
				final: true,
				config,
				fetchImpl: jsonReply('[silence]'),
			}),
		).toMatchObject({ ok: true, text: '' })
		expect(
			await transcribeWav({
				wav: wavBytes(),
				final: false,
				config,
				fetchImpl: jsonReply(''),
			}),
		).toMatchObject({ ok: true, text: '' })
	})

	test('a reply with no content, an HTTP error and a missing key are typed failures', async () => {
		const noContent = (async () =>
			new Response(JSON.stringify({ choices: [] }), {
				status: 200,
			})) as unknown as typeof fetch
		expect(
			await transcribeWav({
				wav: wavBytes(),
				final: false,
				config,
				fetchImpl: noContent,
			}),
		).toMatchObject({ ok: false, error: 'openrouter_empty_response' })

		const http = (async () =>
			new Response('nope', { status: 500 })) as unknown as typeof fetch
		const consoleError = console.error
		console.error = () => {}
		try {
			expect(
				await transcribeWav({
					wav: wavBytes(),
					final: false,
					config,
					fetchImpl: http,
				}),
			).toMatchObject({
				ok: false,
				error: 'openrouter_http_error',
				status: 500,
			})
		} finally {
			console.error = consoleError
		}

		expect(
			await transcribeWav({ wav: wavBytes(), final: false, config: null }),
		).toMatchObject({
			ok: false,
			error: 'missing_open_router_api_key',
		})
	})

	test('a fetch that aborts is a timeout', async () => {
		const aborting = (async (_url: string, init: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener('abort', () =>
					reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
				)
				// Abort at once, as the deadline would.
				reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
			})) as unknown as typeof fetch
		expect(
			await transcribeWav({
				wav: wavBytes(),
				final: false,
				config,
				fetchImpl: aborting,
			}),
		).toMatchObject({ ok: false, error: 'openrouter_timeout' })
	})
})
