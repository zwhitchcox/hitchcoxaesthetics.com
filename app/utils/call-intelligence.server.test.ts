import { afterEach, expect, test, vi } from 'vitest'

import {
	analyzeCall,
	fetchRetellTranscript,
} from '#app/utils/call-intelligence.server.ts'
import { type CallTaxonomy } from '#app/utils/call-tags.server.ts'

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

const AUDIO = { base64: 'aGVsbG8=', format: 'mp3' }
const CONFIG = { apiKey: 'or-test-key', model: 'google/gemini-2.5-flash' }

const TAXONOMY: CallTaxonomy = [
	{
		name: 'outcome',
		description: 'How the call ended',
		exclusive: true,
		tags: [
			{ value: 'booked', description: null },
			{ value: 'info_only', description: null },
			{ value: 'lost', description: null },
		],
	},
	{
		name: 'agent_mistake',
		description: 'Mistakes the AI made',
		exclusive: false,
		tags: [
			{ value: 'misheard_request', description: null },
			{ value: 'failed_transfer', description: null },
		],
	},
]

function openRouterResponse(content: string) {
	return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

test('parses a clean analysis response with taxonomy tags', async () => {
	const fetchMock = vi.fn(async () =>
		openRouterResponse(
			JSON.stringify({
				reason: 'Asking about Botox pricing',
				service_interest: 'Botox',
				follow_up_recommended: true,
				summary: 'Caller asked about Botox pricing and specials.',
				outcome: 'info_only',
				agent_mistake: ['misheard_request'],
			}),
		),
	)

	const result = await analyzeCall({
		input: { kind: 'audio', audio: AUDIO },
		taxonomy: TAXONOMY,
		config: CONFIG,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toEqual({
		ok: true,
		analysis: {
			reason: 'Asking about Botox pricing',
			service_interest: 'Botox',
			follow_up_recommended: true,
			summary: 'Caller asked about Botox pricing and specials.',
			lost_reason: null,
			frustration_reason: null,
			agent_fix_suggestion: null,
			tags: {
				outcome: 'info_only',
				agent_mistake: ['misheard_request'],
			},
		},
	})

	// audio went along as input_audio, prompt lists the taxonomy
	const body = JSON.parse(
		String(
			(fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body,
		),
	) as {
		model: string
		messages: {
			content: ({ type: string; text?: string } & Record<string, unknown>)[]
		}[]
	}
	expect(body.model).toBe('google/gemini-2.5-flash')
	expect(body.messages[0].content[0].text).toContain(
		'"outcome": pick exactly ONE',
	)
	expect(body.messages[0].content[0].text).toContain('"agent_mistake": array')
	expect(body.messages[0].content[1]).toMatchObject({
		type: 'input_audio',
		input_audio: { data: 'aGVsbG8=', format: 'mp3' },
	})
})

test('analyzes a transcript without sending audio', async () => {
	const fetchMock = vi.fn(async () =>
		openRouterResponse(
			JSON.stringify({
				reason: 'Wanted to book a facial',
				summary: 'Booked.',
				outcome: 'booked',
				agent_mistake: [],
			}),
		),
	)
	const result = await analyzeCall({
		input: {
			kind: 'transcript',
			transcript: 'Agent: Hi!\nUser: I want a facial.',
		},
		taxonomy: TAXONOMY,
		config: CONFIG,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})
	expect(result).toMatchObject({
		ok: true,
		analysis: { tags: { outcome: 'booked', agent_mistake: [] } },
	})
	const body = JSON.parse(
		String(
			(fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body,
		),
	) as { messages: { content: { type: string; text?: string }[] }[] }
	expect(body.messages[0].content).toHaveLength(1)
	expect(body.messages[0].content[0].text).toContain('I want a facial.')
})

test('handles fenced responses and drops values outside the taxonomy', async () => {
	const fetchMock = vi.fn(async () =>
		openRouterResponse(
			'Here you go:\n```json\n{"reason": null, "summary": "Spam call.", "outcome": "hung_up", "agent_mistake": ["made_up_mistake", "failed_transfer"]}\n```',
		),
	)
	const result = await analyzeCall({
		input: { kind: 'audio', audio: AUDIO },
		taxonomy: TAXONOMY,
		config: CONFIG,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})
	expect(result).toMatchObject({
		ok: true,
		analysis: {
			reason: null,
			summary: 'Spam call.',
			tags: {
				outcome: null, // unknown exclusive value dropped
				agent_mistake: ['failed_transfer'], // unknown array value dropped
			},
		},
	})
})

test('reports missing config and HTTP failures', async () => {
	expect(
		await analyzeCall({
			input: { kind: 'audio', audio: AUDIO },
			taxonomy: TAXONOMY,
			config: null,
			fetchImpl: vi.fn() as unknown as typeof fetch,
		}),
	).toEqual({ ok: false, error: 'missing_open_router_api_key' })

	const fetchMock = vi.fn(async () => new Response(null, { status: 429 }))
	expect(
		await analyzeCall({
			input: { kind: 'audio', audio: AUDIO },
			taxonomy: TAXONOMY,
			config: CONFIG,
			fetchImpl: fetchMock as unknown as typeof fetch,
		}),
	).toEqual({ ok: false, error: 'openrouter_http_429' })
})

test('fetchRetellTranscript returns trimmed transcript or null', async () => {
	const fetchMock = vi.fn(
		async () =>
			new Response(
				JSON.stringify({ transcript: '  Agent: Hello\nUser: Hi  ' }),
				{
					status: 200,
				},
			),
	)
	expect(
		await fetchRetellTranscript({
			retellCallId: 'call_123',
			apiKey: 'key_test',
			fetchImpl: fetchMock as unknown as typeof fetch,
		}),
	).toBe('Agent: Hello\nUser: Hi')
	expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe(
		'https://api.retellai.com/v2/get-call/call_123',
	)

	const notFound = vi.fn(async () => new Response(null, { status: 404 }))
	expect(
		await fetchRetellTranscript({
			retellCallId: 'call_missing',
			apiKey: 'key_test',
			fetchImpl: notFound as unknown as typeof fetch,
		}),
	).toBe(null)
})
