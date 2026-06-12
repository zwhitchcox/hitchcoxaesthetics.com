import { afterEach, expect, test, vi } from 'vitest'

import { analyzeCallAudio } from '#app/utils/call-intelligence.server.ts'

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

const AUDIO = { base64: 'aGVsbG8=', format: 'mp3' }
const CONFIG = { apiKey: 'or-test-key', model: 'google/gemini-2.5-flash' }

function openRouterResponse(content: string) {
	return new Response(
		JSON.stringify({ choices: [{ message: { content } }] }),
		{ status: 200, headers: { 'Content-Type': 'application/json' } },
	)
}

test('parses a clean analysis response', async () => {
	const fetchMock = vi.fn(async () =>
		openRouterResponse(
			JSON.stringify({
				reason: 'Asking about Botox pricing',
				caller_intent: 'question',
				service_interest: 'Botox',
				outcome: 'info_only',
				not_booked_reason: 'just researching prices',
				follow_up_recommended: true,
				summary: 'Caller asked about Botox pricing and specials.',
			}),
		),
	)

	const result = await analyzeCallAudio({
		audio: AUDIO,
		config: CONFIG,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toEqual({
		ok: true,
		analysis: {
			reason: 'Asking about Botox pricing',
			caller_intent: 'question',
			service_interest: 'Botox',
			outcome: 'info_only',
			not_booked_reason: 'just researching prices',
			follow_up_recommended: true,
			summary: 'Caller asked about Botox pricing and specials.',
		},
	})

	// audio went along as input_audio
	const body = JSON.parse(
		String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
	) as { model: string; messages: { content: Record<string, unknown>[] }[] }
	expect(body.model).toBe('google/gemini-2.5-flash')
	expect(body.messages[0].content[1]).toMatchObject({
		type: 'input_audio',
		input_audio: { data: 'aGVsbG8=', format: 'mp3' },
	})
})

test('handles fenced or chatty responses and unknown enums', async () => {
	const fetchMock = vi.fn(async () =>
		openRouterResponse(
			'Here you go:\n```json\n{"reason": null, "caller_intent": "telemarketer", "outcome": "hung_up", "summary": "Spam call."}\n```',
		),
	)
	const result = await analyzeCallAudio({
		audio: AUDIO,
		config: CONFIG,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})
	expect(result).toMatchObject({
		ok: true,
		analysis: {
			reason: null,
			caller_intent: 'other',
			outcome: 'other',
			summary: 'Spam call.',
		},
	})
})

test('reports missing config and HTTP failures', async () => {
	expect(
		await analyzeCallAudio({
			audio: AUDIO,
			config: null,
			fetchImpl: vi.fn() as unknown as typeof fetch,
		}),
	).toEqual({ ok: false, error: 'missing_open_router_api_key' })

	const fetchMock = vi.fn(async () => new Response(null, { status: 429 }))
	expect(
		await analyzeCallAudio({
			audio: AUDIO,
			config: CONFIG,
			fetchImpl: fetchMock as unknown as typeof fetch,
		}),
	).toEqual({ ok: false, error: 'openrouter_http_429' })
})
