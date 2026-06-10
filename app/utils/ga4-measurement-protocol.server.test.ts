import { afterEach, expect, test, vi } from 'vitest'

import {
	getGa4MeasurementProtocolConfig,
	sendGa4PurchaseEvent,
} from '#app/utils/ga4-measurement-protocol.server.ts'

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

test('returns null config when measurement id or api secret is missing', () => {
	vi.stubEnv('GA_MEASUREMENT_ID', '')
	vi.stubEnv('GA_MEASUREMENT_PROTOCOL_API_SECRET', '')
	expect(getGa4MeasurementProtocolConfig()).toBeNull()

	vi.stubEnv('GA_MEASUREMENT_ID', 'G-TEST123')
	expect(getGa4MeasurementProtocolConfig()).toBeNull()

	vi.stubEnv('GA_MEASUREMENT_PROTOCOL_API_SECRET', 'secret')
	expect(getGa4MeasurementProtocolConfig()).toEqual({
		measurementId: 'G-TEST123',
		apiSecret: 'secret',
	})
})

test('sends a purchase event joined to the originating web session', async () => {
	const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

	const occurredAt = new Date(Date.now() - 60 * 60 * 1000)
	const result = await sendGa4PurchaseEvent(
		{
			clientId: 'client.123',
			sessionId: '1717777777',
			transactionId: 'callrail:CAL_1',
			valueUsd: 600,
			occurredAt,
			extraParams: { conversion_channel: 'phone' },
		},
		{ measurementId: 'G-TEST123', apiSecret: 'secret' },
		fetchMock as unknown as typeof fetch,
	)

	expect(result).toEqual({ ok: true })
	expect(fetchMock).toHaveBeenCalledTimes(1)
	const [url, init] = fetchMock.mock.calls[0] as unknown as [
		string,
		RequestInit,
	]
	expect(url).toContain('https://www.google-analytics.com/mp/collect')
	expect(url).toContain('measurement_id=G-TEST123')
	expect(url).toContain('api_secret=secret')

	const body = JSON.parse(String(init.body)) as {
		client_id: string
		timestamp_micros: number
		events: { name: string; params: Record<string, unknown> }[]
	}
	expect(body.client_id).toBe('client.123')
	expect(body.timestamp_micros).toBe(occurredAt.getTime() * 1000)
	expect(body.events).toHaveLength(1)
	expect(body.events[0].name).toBe('purchase')
	expect(body.events[0].params).toMatchObject({
		session_id: '1717777777',
		currency: 'USD',
		transaction_id: 'callrail:CAL_1',
		value: 600,
		conversion_channel: 'phone',
	})
	expect(body.events[0].params.items).toEqual([
		{ item_name: 'Phone Booking', price: 600, quantity: 1 },
	])
})

test('rejects events older than the GA4 backdating window', async () => {
	const fetchMock = vi.fn()
	const result = await sendGa4PurchaseEvent(
		{
			clientId: 'client.123',
			transactionId: 'callrail:CAL_OLD',
			valueUsd: 100,
			occurredAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
		},
		{ measurementId: 'G-TEST123', apiSecret: 'secret' },
		fetchMock as unknown as typeof fetch,
	)

	expect(result).toEqual({ ok: false, error: 'event_too_old' })
	expect(fetchMock).not.toHaveBeenCalled()
})

test('reports HTTP failures from the measurement protocol endpoint', async () => {
	const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
	const result = await sendGa4PurchaseEvent(
		{
			clientId: 'client.123',
			transactionId: 'callrail:CAL_1',
			valueUsd: 100,
		},
		{ measurementId: 'G-TEST123', apiSecret: 'secret' },
		fetchMock as unknown as typeof fetch,
	)

	expect(result).toEqual({ ok: false, error: 'ga4_mp_http_403' })
})

test('fails without config', async () => {
	const fetchMock = vi.fn()
	const result = await sendGa4PurchaseEvent(
		{
			clientId: 'client.123',
			transactionId: 'callrail:CAL_1',
			valueUsd: 100,
		},
		null,
		fetchMock as unknown as typeof fetch,
	)

	expect(result).toEqual({
		ok: false,
		error: 'missing_ga4_measurement_protocol_config',
	})
	expect(fetchMock).not.toHaveBeenCalled()
})
