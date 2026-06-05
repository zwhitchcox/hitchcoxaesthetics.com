import { isExcludedBookingAnalyticsIdentity } from '#app/utils/analytics-exclusions.ts'

function getPostHogCaptureHost() {
	const publicHost = process.env.REACT_APP_PUBLIC_POSTHOG_HOST?.trim()
	if (publicHost) return publicHost.replace(/\/$/, '')
	return 'https://us.i.posthog.com'
}

export async function captureServerPostHogEvent({
	distinctId,
	event,
	insertId,
	properties,
	timestamp,
}: {
	distinctId: string
	event: string
	insertId: string
	properties: Record<string, unknown>
	timestamp?: string
}) {
	if (isExcludedServerPostHogEvent({ distinctId, properties })) {
		return {
			ok: true,
			skipped: true,
			skip_reason: 'excluded_booking_analytics_identity',
		}
	}

	const apiKey = process.env.REACT_APP_PUBLIC_POSTHOG_KEY?.trim()
	if (!apiKey) {
		return {
			error: 'missing_posthog_key',
			ok: false,
			skipped: true,
		}
	}

	try {
		const response = await fetch(`${getPostHogCaptureHost()}/capture/`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				api_key: apiKey,
				event,
				distinct_id: distinctId,
				properties: {
					...properties,
					$insert_id: insertId,
					$lib: 'server-fetch',
				},
				timestamp,
			}),
		})

		if (!response.ok) {
			console.error('Failed to capture PostHog server event', {
				event,
				status: response.status,
			})
			return {
				error: `posthog_capture_failed_${response.status}`,
				ok: false,
			}
		}
		return { ok: true }
	} catch (error) {
		console.error('Failed to capture PostHog server event', { event, error })
		return {
			error: error instanceof Error ? error.message : String(error),
			ok: false,
		}
	}
}

function isExcludedServerPostHogEvent({
	distinctId,
	properties,
}: {
	distinctId: string
	properties: Record<string, unknown>
}) {
	return isExcludedBookingAnalyticsIdentity({
		emails: [
			distinctId.startsWith('email:')
				? distinctId.slice('email:'.length)
				: null,
			properties.$email,
			properties.email,
			properties.booking_client_email,
			properties.blvd_client_email,
			properties.client_email,
			properties.customer_email,
		],
		phones: [
			distinctId.startsWith('phone:')
				? distinctId.slice('phone:'.length)
				: null,
			properties.booking_client_phone,
			properties.booking_phone,
			properties.callrail_customer_phone_number,
			properties.callrail_formatted_customer_phone_number,
			properties.caller_phone_number,
			properties.client_phone,
			properties.customer_phone,
			properties.customer_phone_number,
			properties.mobile_phone,
			properties.phone,
		],
	})
}
