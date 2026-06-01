import { afterEach, expect, test, vi } from 'vitest'

import { reportCallRailBookingConversion } from '#/app/utils/callrail-booking.server.ts'

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

test('reports booked appointments as qualified CallRail leads with value', async () => {
	vi.stubEnv('CALLRAIL_API_KEY', 'test-callrail-key')
	const jsonResponse = (body: unknown, init?: ResponseInit) =>
		new Response(JSON.stringify(body), {
			...init,
			headers: { 'Content-Type': 'application/json', ...init?.headers },
		})
	const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
		const href = String(url)
		if (
			href === 'https://api.callrail.com/v3/a/ACC_TEST/calls/CAL_TEST.json' &&
			init?.method === 'PUT'
		) {
			return jsonResponse({ id: 'CAL_TEST' })
		}

		if (
			href.startsWith(
				'https://api.callrail.com/v3/a/ACC_TEST/calls/CAL_TEST.json?',
			) &&
			href.includes('lead_status') &&
			href.includes('value') &&
			init?.method === 'GET'
		) {
			return jsonResponse({
				id: 'CAL_TEST',
				lead_status: 'good_lead',
				value: 600,
			})
		}

		return jsonResponse(
			{ error: `Unexpected request: ${href}` },
			{ status: 500 },
		)
	})
	vi.stubGlobal('fetch', fetchMock)

	const result = await reportCallRailBookingConversion({
		appointmentIds: ['apt_123'],
		bookingChannel: 'retell_voice',
		callrailAccountId: 'ACC_TEST',
		callrailCallId: 'CAL_TEST',
		customerName: 'Jane Client',
		locationName: 'Bearden',
		projectedRevenueUsd: 600,
		serviceName: 'Botox',
		startTime: '2026-06-01T15:30:00.000Z',
	})

	expect(result).toMatchObject({
		callrail_call_id: 'CAL_TEST',
		callrail_reported: true,
		ok: true,
	})
	expect(fetchMock).toHaveBeenCalledTimes(2)
	expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
		customer_name: 'Jane Client',
		lead_status: 'good_lead',
		tags: ['Booked Appointment', 'Retell Booking'],
		value: '600.00',
	})
})
