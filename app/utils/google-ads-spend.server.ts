/**
 * Google Ads spend straight from the Ads API (v21) using the same OAuth
 * refresh token as the GBP tooling. Returns null when creds are missing or
 * the API errors — callers render "—" rather than a wrong number.
 */
const ADS_API_VERSION = 'v21'

export async function getGoogleAdsSpendUsd(
	fromDay: string,
	toDay: string,
): Promise<number | null> {
	const clientId =
		process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID
	const clientSecret =
		process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
	const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
	const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
	const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, '')
	if (!clientId || !clientSecret || !refreshToken || !developerToken || !customerId) {
		return null
	}

	try {
		const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: refreshToken,
				grant_type: 'refresh_token',
			}),
		})
		const tokenJson = (await tokenRes.json()) as { access_token?: string }
		if (!tokenRes.ok || !tokenJson.access_token) return null

		const res = await fetch(
			`https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${tokenJson.access_token}`,
					'developer-token': developerToken,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query: `SELECT metrics.cost_micros, segments.date FROM customer WHERE segments.date BETWEEN '${fromDay}' AND '${toDay}'`,
				}),
			},
		)
		if (!res.ok) {
			console.error('Google Ads spend query failed', res.status, await res.text())
			return null
		}
		const chunks = (await res.json()) as Array<{
			results?: Array<{ metrics?: { costMicros?: string } }>
		}>
		let totalUsd = 0
		for (const chunk of chunks) {
			for (const row of chunk.results ?? []) {
				totalUsd += Number(row.metrics?.costMicros ?? 0) / 1e6
			}
		}
		return Math.round(totalUsd)
	} catch (error) {
		console.error('Google Ads spend query failed', error)
		return null
	}
}
