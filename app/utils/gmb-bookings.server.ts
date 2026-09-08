/**
 * GMB-attributed booking counts from PostHog, shared by the GMB clients and
 * Reach value reports. Weeks are Monday-start (toStartOfWeek mode 1) to align
 * with the Monday geo captures.
 */

const WL_FILTER = `(
	coalesce(properties.service, '') ILIKE '%weight%'
	OR coalesce(properties.booking_service_name, '') ILIKE '%weight%'
	OR coalesce(properties.service, '') ILIKE '%b12%'
	OR coalesce(properties.booking_service_name, '') ILIKE '%b12%'
	OR coalesce(properties.booking_brand, '') = 'weight-loss-knox'
	OR coalesce(properties.$host, '') ILIKE '%weightloss%'
)`

const GMB_WEB_FILTER = `(
	coalesce(properties.$session_entry_utm_campaign, properties.utm_campaign, '') = 'gmb'
	OR coalesce(properties.$host, '') ILIKE '%weightloss%'
	OR coalesce(properties.booking_brand, '') = 'weight-loss-knox'
)`

export const GMB_LISTING_EXPR = `multiIf(
	coalesce(properties.$host, properties.$session_entry_host, '') ILIKE '%weightloss%',
		concat('KWLC ', if(coalesce(properties.$session_entry_utm_content, properties.utm_content, '') = 'farragut', 'Farragut', 'Bearden')),
	coalesce(properties.booking_brand, '') = 'weight-loss-knox',
		concat('KWLC ', if(coalesce(properties.$session_entry_utm_content, properties.utm_content, '') = 'farragut', 'Farragut', 'Bearden')),
	coalesce(properties.$session_entry_utm_content, properties.utm_content, '') != '',
		concat('SHA ', coalesce(properties.$session_entry_utm_content, properties.utm_content)),
	'SHA (listing unknown)'
)`

export async function hogql<T = unknown[]>(query: string): Promise<T[]> {
	const key = process.env.POSTHOG_PERSONAL_API_KEY?.trim()
	const project = process.env.POSTHOG_PROJECT_ID?.trim()
	if (!key || !project) return []
	const res = await fetch(
		`https://us.posthog.com/api/projects/${project}/query/`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${key}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
		},
	)
	const body = (await res.json()) as { results?: T[] }
	return body.results ?? []
}

/**
 * In-process stale-while-revalidate cache for the HogQL calls. PostHog's
 * query API takes 1-2s per query (measured 2026-08-03), and these run in
 * report loaders, so uncached they add ~2-4s to every page view. Weekly
 * booking counts do not need to be fresher than 10 minutes.
 */
const GMB_CACHE_TTL_MS = 10 * 60 * 1000
const gmbCache = new Map<
	string,
	{ at: number; data: unknown; refreshing: boolean }
>()

async function cachedHogql<T>(key: string, run: () => Promise<T>): Promise<T> {
	const hit = gmbCache.get(key)
	if (hit && Date.now() - hit.at < GMB_CACHE_TTL_MS) return hit.data as T
	if (hit) {
		if (!hit.refreshing) {
			hit.refreshing = true
			void run()
				.then(data => gmbCache.set(key, { at: Date.now(), data, refreshing: false }))
				.catch(() => {
					hit.refreshing = false
				})
		}
		return hit.data as T
	}
	const data = await run()
	gmbCache.set(key, { at: Date.now(), data, refreshing: false })
	return data
}

/** Weekly GMB-attributed weight-loss web bookings, split by listing. */
export function weeklyGmbWeightLossByListing(daysBack = 180) {
	return cachedHogql(`byListing:${daysBack}`, () => rawWeeklyByListing(daysBack))
}

function rawWeeklyByListing(daysBack: number) {
	return hogql<[string, string, number]>(`
		SELECT toString(toStartOfWeek(timestamp, 1)) AS wk, ${GMB_LISTING_EXPR} AS listing, count(*) AS n
		FROM events
		WHERE event = 'booking_conversion_completed'
			AND timestamp > now() - INTERVAL ${daysBack} DAY
			AND ${GMB_WEB_FILTER}
			AND ${WL_FILTER}
		GROUP BY 1, 2 ORDER BY 1`)
}

/** Weekly GMB-sourced phone bookings (CallRail Google My Business trackers),
 *  weight-loss services only. */
export function weeklyGmbWeightLossPhone(daysBack = 180) {
	return cachedHogql(`phone:${daysBack}`, () => rawWeeklyPhone(daysBack))
}

function rawWeeklyPhone(daysBack: number) {
	return hogql<[string, number]>(`
		SELECT toString(toStartOfWeek(timestamp, 1)) AS wk, count(*) AS n
		FROM events
		WHERE event = 'phone_call_conversion'
			AND timestamp > now() - INTERVAL ${daysBack} DAY
			AND properties.callrail_source = 'Google My Business'
			AND ${WL_FILTER}
		GROUP BY 1 ORDER BY 1`)
}
