/**
 * Creates a "Google Reviews by Location" dashboard in PostHog with two insights:
 *  - review volume over time, broken down by location
 *  - average star rating over time, by location
 * Uses POSTHOG_PERSONAL_API_KEY. Safe to re-run (creates fresh copies).
 *
 *   pnpm tsx scripts/posthog-review-dashboard.ts
 */
import 'dotenv/config'

const KEY = process.env.POSTHOG_PERSONAL_API_KEY?.trim()
const API = 'https://us.posthog.com'

async function api(path: string, method = 'GET', body?: unknown) {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
	return json
}

async function main() {
	if (!KEY) throw new Error('POSTHOG_PERSONAL_API_KEY required')

	// Scoped personal API keys can't hit /api/projects/@current — so use the id
	// from env (POSTHOG_PROJECT_ID), falling back to discovery for unscoped keys.
	let pid: number | string | undefined = process.env.POSTHOG_PROJECT_ID?.trim()
	if (!pid) {
		try {
			pid = (await api('/api/projects/@current/')).id
		} catch {
			pid = (await api('/api/projects/')).results?.[0]?.id
		}
	}
	if (!pid) throw new Error('POSTHOG_PROJECT_ID not set and could not resolve it')
	console.log('project id:', pid)

	const dash = await api(`/api/projects/${pid}/dashboards/`, 'POST', {
		name: 'Google Reviews by Location',
		description: 'Review volume and average rating over time, broken down by location.',
	})
	console.log('dashboard id:', dash.id)

	const trendsQuery = (series: Record<string, unknown>[]) => ({
		kind: 'InsightVizNode',
		source: {
			kind: 'TrendsQuery',
			series,
			breakdownFilter: { breakdown: 'location_name', breakdown_type: 'event' },
			interval: 'month',
			dateRange: { date_from: '-730d' },
			trendsFilter: { display: 'ActionsLineGraph' },
		},
	})

	const volume = await api(`/api/projects/${pid}/insights/`, 'POST', {
		name: 'Reviews over time by location',
		dashboards: [dash.id],
		query: trendsQuery([
			{ kind: 'EventsNode', event: 'google_review', name: 'google_review', math: 'total' },
		]),
	})
	console.log('insight (volume):', volume.short_id)

	const rating = await api(`/api/projects/${pid}/insights/`, 'POST', {
		name: 'Average rating over time by location',
		dashboards: [dash.id],
		query: trendsQuery([
			{
				kind: 'EventsNode',
				event: 'google_review',
				name: 'google_review',
				math: 'avg',
				math_property: 'rating',
			},
		]),
	})
	console.log('insight (rating):', rating.short_id)

	console.log(`\n✓ Dashboard: ${API}/project/${pid}/dashboard/${dash.id}`)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
