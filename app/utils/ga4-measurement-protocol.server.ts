const GA4_MEASUREMENT_PROTOCOL_ENDPOINT =
	'https://www.google-analytics.com/mp/collect'

/**
 * GA4 Measurement Protocol events can only be attributed to an ad click by
 * joining onto the originating web session (client_id + session_id) — the
 * protocol has no gclid field. Events older than ~72 hours are dropped by
 * GA4, so callers must keep timestamps within that window.
 */
export const GA4_MEASUREMENT_PROTOCOL_MAX_EVENT_AGE_MS = 72 * 60 * 60 * 1000

export type Ga4MeasurementProtocolConfig = {
	measurementId: string
	apiSecret: string
}

export function getGa4MeasurementProtocolConfig(): Ga4MeasurementProtocolConfig | null {
	const measurementId = process.env.GA_MEASUREMENT_ID?.trim()
	const apiSecret = process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET?.trim()
	if (!measurementId || !apiSecret) return null
	return { measurementId, apiSecret }
}

export type Ga4PurchaseEventInput = {
	clientId: string
	sessionId?: string | null
	transactionId: string
	valueUsd: number
	currency?: string
	itemName?: string
	occurredAt?: Date | null
	extraParams?: Record<string, unknown>
}

export async function sendGa4PurchaseEvent(
	input: Ga4PurchaseEventInput,
	config: Ga4MeasurementProtocolConfig | null = getGa4MeasurementProtocolConfig(),
	fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
	if (!config) {
		return { ok: false, error: 'missing_ga4_measurement_protocol_config' }
	}

	const occurredAt = input.occurredAt ?? new Date()
	const ageMs = Date.now() - occurredAt.getTime()
	if (ageMs > GA4_MEASUREMENT_PROTOCOL_MAX_EVENT_AGE_MS) {
		return { ok: false, error: 'event_too_old' }
	}

	const currency = input.currency ?? 'USD'
	const body = {
		client_id: input.clientId,
		timestamp_micros: occurredAt.getTime() * 1000,
		non_personalized_ads: true,
		events: [
			{
				name: 'purchase',
				params: {
					...(input.sessionId ? { session_id: input.sessionId } : {}),
					engagement_time_msec: 1,
					currency,
					transaction_id: input.transactionId,
					value: input.valueUsd,
					items: [
						{
							item_name: input.itemName ?? 'Phone Booking',
							price: input.valueUsd,
							quantity: 1,
						},
					],
					...input.extraParams,
				},
			},
		],
	}

	const url = new URL(GA4_MEASUREMENT_PROTOCOL_ENDPOINT)
	url.searchParams.set('measurement_id', config.measurementId)
	url.searchParams.set('api_secret', config.apiSecret)

	try {
		const response = await fetchImpl(url.toString(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
		if (!response.ok) {
			return { ok: false, error: `ga4_mp_http_${response.status}` }
		}
		return { ok: true }
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}
