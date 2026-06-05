import dotenv from 'dotenv'

dotenv.config()

const DEFAULT_PROJECT_ID = 72891
const DEFAULT_LIMIT = 50
const DEFAULT_HOURS = 24

type PostHogQueryResponse = {
	columns?: string[]
	results?: unknown[][]
}

function parseArgs(argv: string[]) {
	let hours = DEFAULT_HOURS
	let limit = DEFAULT_LIMIT
	let projectId = DEFAULT_PROJECT_ID

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]
		if (arg === '--hours') {
			hours = Number(argv[index + 1] ?? hours)
			index++
			continue
		}
		if (arg.startsWith('--hours=')) {
			hours = Number(arg.slice('--hours='.length))
			continue
		}
		if (arg === '--limit') {
			limit = Number(argv[index + 1] ?? limit)
			index++
			continue
		}
		if (arg.startsWith('--limit=')) {
			limit = Number(arg.slice('--limit='.length))
			continue
		}
		if (arg === '--project-id') {
			projectId = Number(argv[index + 1] ?? projectId)
			index++
			continue
		}
		if (arg.startsWith('--project-id=')) {
			projectId = Number(arg.slice('--project-id='.length))
		}
	}

	return {
		hours: Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_HOURS,
		limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
		projectId:
			Number.isFinite(projectId) && projectId > 0
				? projectId
				: DEFAULT_PROJECT_ID,
	}
}

function inferPostHogHost() {
	const envHost = process.env.POSTHOG_APP_HOST?.trim()
	if (envHost) return envHost.replace(/\/$/, '')

	const publicHost = process.env.REACT_APP_PUBLIC_POSTHOG_HOST?.trim()
	if (publicHost) {
		return publicHost
			.replace('://us.i.', '://us.')
			.replace('://eu.i.', '://eu.')
			.replace(/\/$/, '')
	}

	return 'https://us.posthog.com'
}

async function main() {
	const { hours, limit, projectId } = parseArgs(process.argv.slice(2))
	const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim()
	if (!apiKey) throw new Error('Missing POSTHOG_PERSONAL_API_KEY')

	const host = inferPostHogHost()
	const query = `
		SELECT
			timestamp,
			distinct_id,
			properties.booking_step,
			properties.booking_error_action,
			properties.booking_error_code,
			properties.booking_error_message,
			properties.booking_error_source,
			properties.booking_error_technical_message,
			properties.booking_service_display_name,
			properties.booking_service_name,
			properties.booking_location_name,
			properties.cart_id
		FROM events
		WHERE event = 'booking_error'
			AND timestamp >= now() - INTERVAL ${Math.round(hours)} HOUR
		ORDER BY timestamp DESC
		LIMIT ${Math.round(limit)}
	`

	const response = await fetch(`${host}/api/projects/${projectId}/query/`, {
		body: JSON.stringify({
			query: {
				kind: 'HogQLQuery',
				query,
			},
		}),
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		method: 'POST',
	})

	if (!response.ok) {
		throw new Error(
			`PostHog query failed with ${response.status}: ${await response.text()}`,
		)
	}

	const data = (await response.json()) as PostHogQueryResponse
	const columns = data.columns ?? []
	const rows = (data.results ?? []).map(result =>
		Object.fromEntries(columns.map((column, index) => [column, result[index]])),
	)

	console.log(JSON.stringify({ count: rows.length, hours, rows }, null, 2))
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
