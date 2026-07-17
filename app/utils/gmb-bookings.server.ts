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

/** Weekly GMB-attributed weight-loss web bookings, split by listing. */
export function weeklyGmbWeightLossByListing(daysBack = 180) {
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
	return hogql<[string, number]>(`
		SELECT toString(toStartOfWeek(timestamp, 1)) AS wk, count(*) AS n
		FROM events
		WHERE event = 'phone_call_conversion'
			AND timestamp > now() - INTERVAL ${daysBack} DAY
			AND properties.callrail_source = 'Google My Business'
			AND ${WL_FILTER}
		GROUP BY 1 ORDER BY 1`)
}
