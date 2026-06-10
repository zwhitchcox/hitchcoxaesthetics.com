import { afterEach, expect, test, vi } from 'vitest'

import { sendCallRailPhoneConversionToGa4 } from '#app/utils/ga4-phone-conversions.server.ts'

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

function makeDb({
	existingConversion = null as null | { id: string },
	session = null as null | {
		gaClientId: string | null
		gaSessionId: string | null
	},
} = {}) {
	return {
		ga4PhoneConversion: {
			findUnique: vi.fn(async () => existingConversion),
			create: vi.fn(async () => ({ id: 'ga4pc_1' })),
		},
		callTrackingSessionAttribution: {
			findFirst: vi.fn(async () => session),
		},
	}
}

const CONVERTED_CALL = {
	id: 'CAL_1',
	customer_phone_number: '+18655550100',
	gclid: 'TEST_GCLID',
	lead_status: 'good_lead',
	person_id: 'PER_1',
	session_uuid: 'SESSION_1',
	start_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
	tags: ['Booked Appointment'],
	value: 600,
}

test('sends a GA4 purchase joined to the session matched by gclid', async () => {
	vi.stubEnv('GA_MEASUREMENT_ID', 'G-TEST123')
	vi.stubEnv('GA_MEASUREMENT_PROTOCOL_API_SECRET', 'secret')
	const db = makeDb({
		session: { gaClientId: 'client.123', gaSessionId: '1717777777' },
	})
	const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

	const result = await sendCallRailPhoneConversionToGa4({
		accountId: 'ACC_1',
		call: CONVERTED_CALL,
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toMatchObject({ ok: true, sent: true, valueUsd: 600 })

	// session looked up by the call's gclid
	expect(db.callTrackingSessionAttribution.findFirst).toHaveBeenCalledWith(
		expect.objectContaining({
			where: { gclid: 'TEST_GCLID', gaClientId: { not: null } },
		}),
	)

	// purchase sent through measurement protocol with the projected revenue
	const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
	const body = JSON.parse(String(init.body)) as {
		client_id: string
		events: { name: string; params: Record<string, unknown> }[]
	}
	expect(body.client_id).toBe('client.123')
	expect(body.events[0].params).toMatchObject({
		transaction_id: 'callrail:CAL_1',
		value: 600,
		conversion_channel: 'phone',
	})

	// per-call record created for dedup
	expect(db.ga4PhoneConversion.create).toHaveBeenCalledWith(
		expect.objectContaining({
			data: expect.objectContaining({
				callrailCallId: 'CAL_1',
				gclid: 'TEST_GCLID',
				gaClientId: 'client.123',
				attributionMatch: 'gclid',
				valueUsd: 600,
			}),
		}),
	)
})

test('skips calls that were already synced', async () => {
	const db = makeDb({ existingConversion: { id: 'ga4pc_existing' } })
	const fetchMock = vi.fn()

	const result = await sendCallRailPhoneConversionToGa4({
		accountId: 'ACC_1',
		call: CONVERTED_CALL,
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toEqual({ ok: true, alreadySynced: true })
	expect(fetchMock).not.toHaveBeenCalled()
	expect(db.ga4PhoneConversion.create).not.toHaveBeenCalled()
})

test('falls back to CallRail session matching when gclid finds no session', async () => {
	vi.stubEnv('GA_MEASUREMENT_ID', 'G-TEST123')
	vi.stubEnv('GA_MEASUREMENT_PROTOCOL_API_SECRET', 'secret')
	const session = { gaClientId: 'client.456', gaSessionId: null }
	const db = makeDb()
	db.callTrackingSessionAttribution.findFirst = vi.fn(
		async ({ where }: { where: Record<string, unknown> }) =>
			'callrailSessionId' in where ? session : null,
	) as never

	const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

	const result = await sendCallRailPhoneConversionToGa4({
		accountId: 'ACC_1',
		call: CONVERTED_CALL,
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toMatchObject({ ok: true, sent: true })
	expect(db.ga4PhoneConversion.create).toHaveBeenCalledWith(
		expect.objectContaining({
			data: expect.objectContaining({
				attributionMatch: 'callrail_session',
				gaClientId: 'client.456',
			}),
		}),
	)
})

test('reports unmatched when no session has a GA client id', async () => {
	const db = makeDb({ session: null })
	const fetchMock = vi.fn()

	const result = await sendCallRailPhoneConversionToGa4({
		accountId: 'ACC_1',
		call: CONVERTED_CALL,
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toEqual({ ok: true, unmatched: true })
	expect(fetchMock).not.toHaveBeenCalled()
})

test('skips excluded booking phones', async () => {
	const db = makeDb({
		session: { gaClientId: 'client.123', gaSessionId: null },
	})
	const fetchMock = vi.fn()

	const result = await sendCallRailPhoneConversionToGa4({
		accountId: 'ACC_1',
		call: { ...CONVERTED_CALL, customer_phone_number: '8652101404' },
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toMatchObject({ ok: true, excluded: true })
	expect(fetchMock).not.toHaveBeenCalled()
})

test('treats calls older than the GA4 window as unmatched', async () => {
	const db = makeDb({
		session: { gaClientId: 'client.123', gaSessionId: null },
	})
	const fetchMock = vi.fn()

	const result = await sendCallRailPhoneConversionToGa4({
		accountId: 'ACC_1',
		call: {
			...CONVERTED_CALL,
			start_time: new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(),
		},
		db: db as never,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toEqual({ ok: true, unmatched: true })
	expect(fetchMock).not.toHaveBeenCalled()
})

test('dry run resolves the session but does not send or record', async () => {
	const db = makeDb({
		session: { gaClientId: 'client.123', gaSessionId: '1717777777' },
	})
	const fetchMock = vi.fn()

	const result = await sendCallRailPhoneConversionToGa4({
		accountId: 'ACC_1',
		call: CONVERTED_CALL,
		db: db as never,
		dryRun: true,
		fetchImpl: fetchMock as unknown as typeof fetch,
	})

	expect(result).toMatchObject({
		ok: true,
		dryRun: true,
		gaClientId: 'client.123',
		valueUsd: 600,
	})
	expect(fetchMock).not.toHaveBeenCalled()
	expect(db.ga4PhoneConversion.create).not.toHaveBeenCalled()
})
