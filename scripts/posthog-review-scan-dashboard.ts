/**
 * Creates a "Reviews & QR Scans" dashboard in PostHog:
 *  - review funnel volumes over time (eligible → scanned → location chosen → Google review)
 *  - QR scans by customer (client_first_name) and reviews by customer (reviewer_name)
 *  - where clients chose to leave the review (place_label)
 *  - eligible → scanned → chose-location funnel
 * Uses POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID. Safe to re-run (creates a fresh copy).
 *
 *   pnpm tsx scripts/posthog-review-scan-dashboard.ts
 */
import 'dotenv/config'

const KEY = process.env.POSTHOG_PERSONAL_API_KEY?.trim()
const PID = process.env.POSTHOG_PROJECT_ID?.trim()
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

const ev = (event: string, extra: Record<string, unknown> = {}) => ({
	kind: 'EventsNode',
	event,
	name: event,
	math: 'total',
	...extra,
})

function trends(series: unknown[], opts: Record<string, unknown> = {}) {
	return {
		kind: 'InsightVizNode',
		source: {
			kind: 'TrendsQuery',
			series,
			interval: 'month',
			dateRange: { date_from: '-365d' },
			trendsFilter: { display: 'ActionsLineGraph' },
			...opts,
		},
	}
}

async function main() {
	if (!KEY || !PID) throw new Error('POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID required')

	const dash = await api(`/api/projects/${PID}/dashboards/`, 'POST', {
		name: 'Reviews & QR Scans',
		description:
			'Review-QR funnel: eligible appointments → QR scans → location chosen → Google reviews, with per-customer breakdowns.',
	})
	console.log('dashboard id:', dash.id)

	const insights: Array<[string, unknown]> = [
		[
			'Review funnel volumes over time',
			trends([
				ev('review_appointment_eligible'),
				ev('review_link_scanned'),
				ev('review_location_selected'),
				ev('google_review'),
			]),
		],
		[
			'QR scans over time',
			trends([ev('review_link_scanned')], {
				breakdownFilter: { breakdown: 'matched_location', breakdown_type: 'event' },
			}),
		],
		[
			'QR scans by customer',
			trends([ev('review_link_scanned')], {
				breakdownFilter: { breakdown: 'client_first_name', breakdown_type: 'event' },
				trendsFilter: { display: 'ActionsTable' },
			}),
		],
		[
			'Google reviews by customer',
			trends([ev('google_review')], {
				breakdownFilter: { breakdown: 'reviewer_name', breakdown_type: 'event' },
				trendsFilter: { display: 'ActionsTable' },
			}),
		],
		[
			'Where clients chose to leave the review',
			trends([ev('review_location_selected')], {
				breakdownFilter: { breakdown: 'place_label', breakdown_type: 'event' },
			}),
		],
		[
			'Funnel: eligible → scanned → chose location',
			{
				kind: 'InsightVizNode',
				source: {
					kind: 'FunnelsQuery',
					series: [
						ev('review_appointment_eligible', { math: undefined }),
						ev('review_link_scanned', { math: undefined }),
						ev('review_location_selected', { math: undefined }),
					],
					dateRange: { date_from: '-365d' },
				},
			},
		],
	]

	for (const [name, query] of insights) {
		try {
			const ins = await api(`/api/projects/${PID}/insights/`, 'POST', {
				name,
				dashboards: [dash.id],
				query,
			})
			console.log(`  ✓ ${name} (${ins.short_id})`)
		} catch (error) {
			console.log(`  ✗ ${name}: ${error instanceof Error ? error.message : error}`)
		}
	}

	console.log(`\n✓ Dashboard: ${API}/project/${PID}/dashboard/${dash.id}`)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
