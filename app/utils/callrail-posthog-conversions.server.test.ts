import { afterEach, expect, test, vi } from 'vitest'

import { syncCallRailPhoneConversionsToPostHog } from '#app/utils/callrail-posthog-conversions.server.ts'

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

test('syncs qualified CallRail phone conversions into PostHog with matched attribution', async () => {
	vi.stubEnv('CALLRAIL_API_KEY', 'test-callrail-key')
	vi.stubEnv('REACT_APP_PUBLIC_POSTHOG_KEY', 'test-posthog-key')

	const jsonResponse = (body: unknown, init?: ResponseInit) =>
		new Response(JSON.stringify(body), {
			...init,
			headers: { 'Content-Type': 'application/json', ...init?.headers },
		})
	const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
		const href = String(url)
		if (
			href.startsWith(
				'https://api.callrail.com/v3/a/ACC_TEST/calls.json?',
			) &&
			init?.method === 'GET'
		) {
			return jsonResponse({
				calls: [
					{
						id: 'CAL_GOOD',
						customer_phone_number: '+18655550100',
						lead_status: 'good_lead',
						person_id: 'VISITOR_1',
						session_uuid: 'SESSION_1',
						start_time: '2026-06-01T14:00:00.000Z',
						tags: ['Booked Appointment', 'Retell Booking'],
						timeline_url: 'https://app.callrail.com/calls/CAL_GOOD',
						value: '600.00',
					},
					{
						id: 'CAL_BAD',
						customer_phone_number: '+18655550101',
						lead_status: 'not_a_lead',
						session_uuid: 'SESSION_2',
						start_time: '2026-06-01T15:00:00.000Z',
						tags: [],
						value: '0.00',
					},
				],
			})
		}

		if (href === 'https://us.i.posthog.com/capture/') {
			return jsonResponse({ status: 1 })
		}

		return jsonResponse(
			{ error: `Unexpected request: ${href}` },
			{ status: 500 },
		)
	})
	vi.stubGlobal('fetch', fetchMock)

	const db = {
		blvdSyncState: {
			findUnique: vi.fn(async () => null),
			upsert: vi.fn(async () => ({})),
		},
		blvdAttributionTouch: {
			findFirst: vi.fn(async () => ({
				bookEntryFromPath: '/botox',
				bookEntryPagePrefixType: 'non_lp',
				bookEntryPageType: 'service',
				callrailVisitorId: 'VISITOR_1',
				initialLandingPath: '/lp/botox',
				initialLandingPagePrefixType: 'lp',
				initialLandingPageType: 'lp',
				initialReferrer: 'https://google.com',
				initialReferringDomain: 'google.com',
				posthogDistinctId: 'ph_distinct_1',
				posthogSessionId: 'ph_session_1',
				trafficChannel: 'paid_search',
				trafficPlatform: 'google',
				trafficSourceDetail: 'google_ads',
				utmCampaign: 'botox-knoxville',
				utmContent: null,
				utmMedium: 'cpc',
				utmSource: 'google',
				utmTerm: 'botox knoxville',
			})),
		},
		callTrackingSessionAttribution: {
			findFirst: vi.fn(),
		},
		retellCallOutcome: {
			findFirst: vi.fn(),
		},
	}

	const result = await syncCallRailPhoneConversionsToPostHog({
		accountIds: ['ACC_TEST'],
		db: db as never,
		now: new Date('2026-06-01T16:00:00.000Z'),
	})

	expect(result).toMatchObject({
		captured: 1,
		conversion_count: 1,
		matched: 1,
		ok: true,
		scanned: 2,
		skipped: 1,
		unmatched: 0,
	})

	const posthogCalls = fetchMock.mock.calls.filter(
		([url]) => String(url) === 'https://us.i.posthog.com/capture/',
	)
	expect(posthogCalls).toHaveLength(2)
	const posthogCall = posthogCalls.find(call => {
		const body = JSON.parse(call[1]?.body as string) as { event?: string }
		return body.event === 'phone_call_conversion'
	})
	expect(posthogCall).toBeTruthy()
	const posthogBody = JSON.parse(posthogCall?.[1]?.body as string)
	expect(posthogBody).toMatchObject({
		distinct_id: 'ph_distinct_1',
		event: 'phone_call_conversion',
		properties: {
			$insert_id: 'callrail-phone-conversion:CAL_GOOD',
			attribution_match: 'boulevard_attribution_touch',
			booking_channel: 'retell_voice',
			callrail_call_id: 'CAL_GOOD',
			phone_conversion_value_usd: 600,
			traffic_source_detail: 'google_ads',
		},
		timestamp: '2026-06-01T14:00:00.000Z',
	})
	const combinedCall = posthogCalls.find(call => {
		const body = JSON.parse(call[1]?.body as string) as { event?: string }
		return body.event === 'booking_conversion_completed'
	})
	expect(combinedCall).toBeTruthy()
	const combinedBody = JSON.parse(combinedCall?.[1]?.body as string)
	expect(combinedBody).toMatchObject({
		distinct_id: 'ph_distinct_1',
		event: 'booking_conversion_completed',
		properties: {
			$insert_id: 'booking-conversion:phone:CAL_GOOD',
			attribution_match: 'boulevard_attribution_touch',
			booking_channel: 'retell_voice',
			booking_value_usd: 600,
			callrail_call_id: 'CAL_GOOD',
			conversion_channel: 'phone',
			phone_conversion_value_usd: 600,
			traffic_source_detail: 'google_ads',
		},
		timestamp: '2026-06-01T14:00:00.000Z',
	})
	expect(db.blvdSyncState.upsert).toHaveBeenCalledWith(
		expect.objectContaining({
			where: { key: 'callrail_posthog_conversion_last_sync_at' },
		}),
	)
})
