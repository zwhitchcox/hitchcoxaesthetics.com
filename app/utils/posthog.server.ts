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
	const apiKey = process.env.REACT_APP_PUBLIC_POSTHOG_KEY?.trim()
	if (!apiKey) return

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
		}
	} catch (error) {
		console.error('Failed to capture PostHog server event', { event, error })
	}
}
