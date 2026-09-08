/**
 * Google Ads spend straight from the Ads API (v21) using the same OAuth
 * refresh token as the GBP tooling. The per-day variant returns the error
 * string on failure so pages can surface why the series is missing; the
 * range-total variant keeps its old null-on-failure contract.
 */
import { prisma } from '#app/utils/db.server.ts'
import { ttlCache } from '#app/utils/ttl-cache.server.ts'

// v21 was sunset by Google (404s began 2026-08-12 and went unnoticed for 12
// days); bump again when Google retires this one - a failing
// google-ads-spend-sync workflow is the signal.
const ADS_API_VERSION = 'v23'
/** One sync covers this much history; spend older than that never changes. */
const SYNC_BACK_DAYS = 400

// Fallback-path cache only (mirror still empty right after first deploy).
const spendCache = ttlCache<{
	byDay: Record<string, number> | null
	error: string | null
}>({ ttlMs: 10 * 60 * 1000, shouldCache: r => r.error == null })

function truncateError(text: string) {
	return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

/**
 * Pull daily spend from the Ads API into GoogleAdsSpendDay. Runs on the
 * google-ads-spend-sync background job; report loaders read the table.
 */
export async function syncGoogleAdsSpend(): Promise<{ days: number }> {
	const toDay = new Date().toISOString().slice(0, 10)
	const fromDay = new Date(Date.now() - SYNC_BACK_DAYS * 24 * 3600 * 1000)
		.toISOString()
		.slice(0, 10)
	const { byDay, error } = await fetchGoogleAdsSpendByDay(fromDay, toDay)
	if (error || !byDay) throw new Error(error ?? 'Ads API returned no data')
	for (const [day, usd] of Object.entries(byDay)) {
		await prisma.googleAdsSpendDay.upsert({
			where: { day },
			create: { day, usd },
			update: { usd },
		})
	}
	return { days: Object.keys(byDay).length }
}

/**
 * Google Ads spend per day (YYYY-MM-DD keys, USD values). The GAQL query
 * segments by date, one row per day with spend. On failure `byDay` is null
 * and `error` says why, so callers can show the real reason instead of a
 * silently missing series.
 */
export async function getGoogleAdsSpendByDay(
	fromDay: string,
	toDay: string,
): Promise<{ byDay: Record<string, number> | null; error: string | null }> {
	// Primary path: the GoogleAdsSpendDay mirror (google-ads-spend-sync job).
	const rows = await prisma.googleAdsSpendDay.findMany({
		where: { day: { gte: fromDay, lte: toDay } },
	})
	if (rows.length) {
		return {
			byDay: Object.fromEntries(rows.map(r => [r.day, r.usd])),
			error: null,
		}
	}
	const mirrored = await prisma.googleAdsSpendDay.findFirst({
		select: { day: true },
	})
	if (mirrored) {
		// The mirror exists but has nothing in this window: no spend then.
		return { byDay: {}, error: null }
	}
	// Mirror empty (first deploy): live call, cached, so pages still work.
	return spendCache(`${fromDay}..${toDay}`, () =>
		fetchGoogleAdsSpendByDay(fromDay, toDay),
	)
}

async function fetchGoogleAdsSpendByDay(
	fromDay: string,
	toDay: string,
): Promise<{ byDay: Record<string, number> | null; error: string | null }> {
	const clientId =
		process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID
	const clientSecret =
		process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
	const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
	const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
	const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, '')
	if (!clientId || !clientSecret || !refreshToken || !developerToken || !customerId) {
		return {
			byDay: null,
			error: 'Google Ads credentials are not configured (GOOGLE_ADS_* / GOOGLE_OAUTH_* secrets)',
		}
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
		if (!tokenRes.ok || !tokenJson.access_token) {
			return {
				byDay: null,
				error: `Google OAuth token refresh failed (HTTP ${tokenRes.status})`,
			}
		}

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
			const text = await res.text()
			console.error('Google Ads spend query failed', res.status, text)
			return {
				byDay: null,
				error: `Ads API HTTP ${res.status}: ${truncateError(text)}`,
			}
		}
		const chunks = (await res.json()) as Array<{
			results?: Array<{
				metrics?: { costMicros?: string }
				segments?: { date?: string }
			}>
		}>
		const byDay: Record<string, number> = {}
		for (const chunk of chunks) {
			for (const row of chunk.results ?? []) {
				const day = row.segments?.date
				if (!day) continue
				byDay[day] = (byDay[day] ?? 0) + Number(row.metrics?.costMicros ?? 0) / 1e6
			}
		}
		for (const day of Object.keys(byDay)) {
			byDay[day] = Math.round(byDay[day]! * 100) / 100
		}
		return { byDay, error: null }
	} catch (error) {
		console.error('Google Ads spend query failed', error)
		return {
			byDay: null,
			error: truncateError(error instanceof Error ? error.message : String(error)),
		}
	}
}

export async function getGoogleAdsSpendUsd(
	fromDay: string,
	toDay: string,
): Promise<number | null> {
	const { byDay } = await getGoogleAdsSpendByDay(fromDay, toDay)
	if (byDay == null) return null
	return Math.round(Object.values(byDay).reduce((sum, v) => sum + v, 0))
}
