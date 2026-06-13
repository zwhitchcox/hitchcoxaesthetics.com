import { afterEach, expect, test, vi } from 'vitest'

import { syncRetellDirectCallsToPostHog } from '#app/utils/retell-direct-calls.server.ts'

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

const TAXONOMY_GROUPS = [
	{
		name: 'outcome',
		description: null,
		exclusive: true,
		tags: [
			{ value: 'booked', description: null },
			{ value: 'lost', description: null },
		],
	},
	{
		name: 'disposition',
		description: null,
		exclusive: true,
		tags: [{ value: 'booking_prospect', description: null }],
	},
]

function makeDb({
	existingOutcomeLink = false,
}: { existingOutcomeLink?: boolean } = {}) {
	const records = new Map<string, Record<string, unknown>>()
	return {
		records,
		callRailCall: {
			findUnique: vi.fn(
				async ({ where }: { where: { callrailCallId: string } }) =>
					records.get(where.callrailCallId) ?? null,
			),
			findFirst: vi.fn(async () => null),
			create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
				const record = {
					receivedEventAt: null,
					analyzedAt: null,
					analysisError: null,
					...data,
				}
				records.set(String(data.callrailCallId), record)
				return record
			}),
			update: vi.fn(
				async ({
					where,
					data,
				}: {
					where: { callrailCallId: string }
					data: Record<string, unknown>
				}) => {
					const record = records.get(where.callrailCallId) ?? {}
					Object.assign(record, data)
					records.set(where.callrailCallId, record)
					return record
				},
			),
		},
		retellCallOutcome: {
			findFirst: vi.fn(async () =>
				existingOutcomeLink ? { id: 'outcome_1' } : null,
			),
		},
		callTagGroup: {
			upsert: vi.fn(async () => ({ id: 'group_1' })),
			findMany: vi.fn(async () => TAXONOMY_GROUPS),
		},
		callTag: {
			upsert: vi.fn(async () => ({})),
		},
		followUp: {
			upsert: vi.fn(async () => ({})),
		},
	}
}

function makeFetch() {
	return vi.fn(async (url: string | URL, init?: RequestInit) => {
		const href = String(url)
		if (href === 'https://api.retellai.com/v2/list-calls') {
			return new Response(
				JSON.stringify([
					{
						call_id: 'call_direct_1',
						agent_id: 'agent_2d6a0de3088f3066a2081539c0',
						call_type: 'phone_call',
						direction: 'inbound',
						from_number: '+18655550123',
						to_number: '+18657612898',
						start_timestamp: new Date('2026-06-10T15:00:00Z').getTime(),
						duration_ms: 95_000,
						transcript: 'Agent: Hi!\nUser: I want Botox but never mind.',
					},
				]),
				{ status: 200 },
			)
		}
		if (href === 'https://openrouter.ai/api/v1/chat/completions') {
			return new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									reason: 'Botox inquiry',
									summary: 'Caller asked about Botox and hung up.',
									follow_up_recommended: true,
									lost_reason: 'Caller changed their mind mid-call.',
									outcome: 'lost',
									disposition: 'booking_prospect',
								}),
							},
						},
					],
				}),
				{ status: 200 },
			)
		}
		if (href === 'https://us.i.posthog.com/capture/') {
			void init
			return new Response(JSON.stringify({ status: 1 }), { status: 200 })
		}
		return new Response(JSON.stringify({ error: `unexpected: ${href}` }), {
			status: 500,
		})
	})
}

test('ingests a direct Retell call: received event, transcript analysis, follow-up', async () => {
	vi.stubEnv('RETELL_API_KEY', 'key_test')
	vi.stubEnv('REACT_APP_PUBLIC_POSTHOG_KEY', 'test-posthog-key')
	vi.stubEnv('OPEN_ROUTER_API_KEY', 'or-test-key')

	const db = makeDb()
	const fetchMock = makeFetch()
	vi.stubGlobal('fetch', fetchMock)

	const result = await syncRetellDirectCallsToPostHog({
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
		now: new Date('2026-06-12T00:00:00Z'),
	})

	expect(result).toMatchObject({
		ok: true,
		scanned: 1,
		already_tracked_by_callrail: 0,
		calls_recorded: 1,
		analyzed: 1,
		analysis_failed: 0,
	})

	const record = db.records.get('retell:call_direct_1')!
	expect(record).toMatchObject({
		callerPhone: '+18655550123',
		outcome: 'lost',
		disposition: 'booking_prospect',
		lostReason: 'Caller changed their mind mid-call.',
		followUpNeeded: true,
		analysisSource: 'retell_transcript',
	})
	expect(db.followUp.upsert).toHaveBeenCalledWith(
		expect.objectContaining({
			where: { callrailCallId: 'retell:call_direct_1' },
			create: expect.objectContaining({
				customerPhone: '+18655550123',
				reason: 'Caller changed their mind mid-call.',
			}),
		}),
	)

	const posthogCalls = fetchMock.mock.calls.filter(
		([url]) => String(url) === 'https://us.i.posthog.com/capture/',
	)
	expect(posthogCalls).toHaveLength(2)
	const received = JSON.parse(String(posthogCalls[0]?.[1]?.body))
	expect(received).toMatchObject({
		event: 'phone_call_received',
		distinct_id: 'phone:+18655550123',
		properties: {
			booking_channel: 'retell_voice',
			conversion_source: 'retell_direct',
			retell_agent_name: 'Botox Knox',
		},
	})
	const analyzed = JSON.parse(String(posthogCalls[1]?.[1]?.body))
	expect(analyzed).toMatchObject({
		event: 'phone_call_analyzed',
		properties: {
			call_outcome: 'lost',
			call_tag_disposition: 'booking_prospect',
			call_lost_reason: 'Caller changed their mind mid-call.',
			call_analysis_source: 'retell_transcript',
		},
	})
})

test('skips calls already tracked through CallRail', async () => {
	vi.stubEnv('RETELL_API_KEY', 'key_test')
	vi.stubEnv('REACT_APP_PUBLIC_POSTHOG_KEY', 'test-posthog-key')

	const db = makeDb({ existingOutcomeLink: true })
	const fetchMock = makeFetch()
	vi.stubGlobal('fetch', fetchMock)

	const result = await syncRetellDirectCallsToPostHog({
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
		now: new Date('2026-06-12T00:00:00Z'),
	})

	expect(result).toMatchObject({
		ok: true,
		scanned: 1,
		already_tracked_by_callrail: 1,
		calls_recorded: 0,
		analyzed: 0,
	})
	expect(
		fetchMock.mock.calls.filter(
			([url]) => String(url) === 'https://us.i.posthog.com/capture/',
		),
	).toHaveLength(0)
})
