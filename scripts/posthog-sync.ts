import fs from 'node:fs/promises'
import path from 'node:path'

import dotenv from 'dotenv'
import yaml from 'js-yaml'
import { z } from 'zod'

dotenv.config()

const propertySchema = z.object({
	key: z.string(),
	type: z.string().optional(),
	value: z.any().optional(),
	operator: z.string().optional(),
})

const eventSeriesSchema = z.object({
	event: z.string(),
	name: z.string().optional(),
	custom_name: z.string().optional(),
	properties: z.array(propertySchema).optional(),
	math: z.string().optional(),
	math_property: z.string().optional(),
	math_property_type: z.string().optional(),
})

const dateRangeSchema = z
	.object({
		date_from: z.string().optional(),
		date_to: z.string().optional(),
	})
	.optional()

const funnelInsightSchema = z.object({
	kind: z.literal('funnel'),
	name: z.string(),
	description: z.string().optional(),
	tags: z.array(z.string()).optional(),
	favorited: z.boolean().optional(),
	breakdown: z.string().optional(),
	breakdown_limit: z.number().int().positive().optional(),
	properties: z.array(propertySchema).optional(),
	date_range: dateRangeSchema,
	steps: z.array(eventSeriesSchema).min(2),
})

const trendInsightSchema = z.object({
	kind: z.literal('trend'),
	name: z.string(),
	description: z.string().optional(),
	tags: z.array(z.string()).optional(),
	favorited: z.boolean().optional(),
	breakdown: z.string().optional(),
	breakdown_limit: z.number().int().positive().optional(),
	properties: z.array(propertySchema).optional(),
	date_range: dateRangeSchema,
	interval: z.string().optional(),
	series: z.array(eventSeriesSchema).min(1),
})

const dashboardSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	tags: z.array(z.string()).optional(),
	managed_tag: z.string().optional(),
	sync_mode: z.enum(['append', 'replace_managed']).default('replace_managed'),
	insights: z.array(z.union([funnelInsightSchema, trendInsightSchema])).min(1),
})

const configSchema = z.object({
	posthog: z.object({
		project_id: z.number().int().positive(),
		host: z.string().optional(),
		api_key_env: z.string().default('POSTHOG_PERSONAL_API_KEY'),
	}),
	project_sync: z
		.object({
			prune_unconfigured_dashboards: z.boolean().default(false),
			prune_unconfigured_insights: z.boolean().default(false),
		})
		.optional(),
	defaults: z
		.object({
			date_range: dateRangeSchema,
			breakdown_limit: z.number().int().positive().optional(),
			insight_tags: z.array(z.string()).optional(),
		})
		.optional(),
	dashboards: z.array(dashboardSchema).min(1),
})

type Config = z.infer<typeof configSchema>
type DashboardConfig = z.infer<typeof dashboardSchema>
type InsightConfig = DashboardConfig['insights'][number]
type EventSeriesConfig = z.infer<typeof eventSeriesSchema>

type PaginatedResponse<T> = {
	results: T[]
	next: string | null
	previous: string | null
}

type DashboardRecord = {
	id: number
	name: string
	description?: string
	tags?: string[]
}

type InsightRecord = {
	id: number
	name: string | null
	short_id: string
	dashboards?: number[]
	tags?: string[]
}

function parseArgs(argv: string[]) {
	let configPath = 'google-ads/posthog-booking-attribution.yaml'
	let apply = false

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]

		if (arg === '--config') {
			configPath = argv[index + 1] ?? configPath
			index++
			continue
		}

		if (arg.startsWith('--config=')) {
			configPath = arg.slice('--config='.length)
			continue
		}

		if (arg === '--apply') {
			apply = true
		}
	}

	return { configPath, apply }
}

function inferPostHogHost(configHost?: string) {
	if (configHost) return configHost.replace(/\/$/, '')

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

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function unique(values: string[]) {
	return [...new Set(values.filter(Boolean))]
}

function removeUndefined<T>(value: T): T {
	if (Array.isArray(value)) {
		return value
			.map(item => removeUndefined(item))
			.filter(item => item !== undefined) as T
	}

	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
		const nextEntries = entries
			.filter(([, entryValue]) => entryValue !== undefined)
			.map(([key, entryValue]) => [key, removeUndefined(entryValue)] as const)

		return Object.fromEntries(nextEntries) as T
	}

	return value
}

function buildEventNode(series: EventSeriesConfig) {
	return removeUndefined({
		kind: 'EventsNode',
		event: series.event,
		name: series.name ?? series.event,
		custom_name: series.custom_name,
		properties: series.properties,
		math: series.math,
		math_property: series.math_property,
		math_property_type: series.math_property_type,
	})
}

function mergeDateRange(config: Config, insight: InsightConfig) {
	const merged = removeUndefined({
		date_from:
			insight.date_range?.date_from ?? config.defaults?.date_range?.date_from,
		date_to:
			insight.date_range?.date_to ?? config.defaults?.date_range?.date_to,
	})

	return Object.keys(merged).length > 0 ? merged : undefined
}

function buildInsightPayload(
	config: Config,
	dashboard: DashboardConfig,
	insight: InsightConfig,
	dashboardId: number,
	existing?: Pick<InsightRecord, 'dashboards' | 'tags'>,
) {
	const breakdownLimit =
		insight.breakdown_limit ?? config.defaults?.breakdown_limit ?? 25
	const managedTag =
		dashboard.managed_tag ??
		`managed:posthog-dashboard:${slugify(dashboard.name)}`
	const tags = unique([
		...(existing?.tags ?? []),
		...(config.defaults?.insight_tags ?? []),
		...(insight.tags ?? []),
		managedTag,
	])
	const dashboards = [
		...new Set([...(existing?.dashboards ?? []), dashboardId]),
	]

	const common = {
		name: insight.name,
		description: insight.description,
		favorited: insight.favorited,
		dashboards,
		tags,
	}

	if (insight.kind === 'funnel') {
		return removeUndefined({
			...common,
			query: {
				kind: 'InsightVizNode',
				source: {
					kind: 'FunnelsQuery',
					series: insight.steps.map(buildEventNode),
					properties: insight.properties,
					breakdownFilter: insight.breakdown
						? {
								breakdown: insight.breakdown,
								breakdown_type: 'event',
								breakdown_limit: breakdownLimit,
							}
						: undefined,
					funnelsFilter: {
						funnelVizType: 'steps',
					},
					dateRange: mergeDateRange(config, insight),
				},
			},
		})
	}

	return removeUndefined({
		...common,
		query: {
			kind: 'InsightVizNode',
			source: {
				kind: 'TrendsQuery',
				series: insight.series.map(buildEventNode),
				properties: insight.properties,
				breakdownFilter: insight.breakdown
					? {
							breakdown: insight.breakdown,
							breakdown_type: 'event',
							breakdown_limit: breakdownLimit,
						}
					: undefined,
				interval: insight.interval ?? 'day',
				dateRange: mergeDateRange(config, insight),
			},
		},
	})
}

class PostHogClient {
	private readonly host: string
	private readonly projectId: number
	private readonly apiKey: string
	private readonly apply: boolean

	constructor(host: string, projectId: number, apiKey: string, apply: boolean) {
		this.host = host
		this.projectId = projectId
		this.apiKey = apiKey
		this.apply = apply
	}

	private async request<T>(input: string, init?: RequestInit): Promise<T> {
		const response = await fetch(input, {
			...init,
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				...(init?.headers ?? {}),
			},
		})

		if (!response.ok) {
			const body = await response.text()
			throw new Error(`PostHog API ${response.status} for ${input}: ${body}`)
		}

		const body = await response.text()
		if (!body) return undefined as T

		return JSON.parse(body) as T
	}

	private async paginate<T>(pathName: string) {
		const results: T[] = []
		let nextUrl: string | null = `${this.host}${pathName}`

		while (nextUrl) {
			const page = await this.request<PaginatedResponse<T>>(nextUrl)
			results.push(...page.results)
			nextUrl = page.next
		}

		return results
	}

	async listDashboards() {
		return this.paginate<DashboardRecord>(
			`/api/projects/${this.projectId}/dashboards/?limit=200`,
		)
	}

	async listInsights() {
		return this.paginate<InsightRecord>(
			`/api/projects/${this.projectId}/insights/?limit=200`,
		)
	}

	async createDashboard(payload: Record<string, unknown>) {
		console.log(
			`${this.apply ? 'CREATE' : 'DRY RUN create'} dashboard: ${payload.name}`,
		)

		if (!this.apply) {
			return { id: -1, name: String(payload.name) } as DashboardRecord
		}

		return this.request<DashboardRecord>(
			`${this.host}/api/projects/${this.projectId}/dashboards/`,
			{
				method: 'POST',
				body: JSON.stringify(payload),
			},
		)
	}

	async updateDashboard(dashboardId: number, payload: Record<string, unknown>) {
		console.log(
			`${this.apply ? 'UPDATE' : 'DRY RUN update'} dashboard: ${payload.name ?? dashboardId}`,
		)

		if (!this.apply) {
			return
		}

		await this.request<Record<string, unknown>>(
			`${this.host}/api/projects/${this.projectId}/dashboards/${dashboardId}/`,
			{
				method: 'PATCH',
				body: JSON.stringify(payload),
			},
		)
	}

	async createInsight(payload: Record<string, unknown>) {
		console.log(
			`${this.apply ? 'CREATE' : 'DRY RUN create'} insight: ${payload.name}`,
		)

		if (!this.apply) {
			return {
				id: -1,
				name: String(payload.name),
				short_id: 'dry-run',
			} as InsightRecord
		}

		return this.request<InsightRecord>(
			`${this.host}/api/projects/${this.projectId}/insights/`,
			{
				method: 'POST',
				body: JSON.stringify(payload),
			},
		)
	}

	async updateInsight(insightId: number, payload: Record<string, unknown>) {
		console.log(
			`${this.apply ? 'UPDATE' : 'DRY RUN update'} insight: ${payload.name ?? insightId}`,
		)

		if (!this.apply) {
			return
		}

		await this.request<Record<string, unknown>>(
			`${this.host}/api/projects/${this.projectId}/insights/${insightId}/`,
			{
				method: 'PATCH',
				body: JSON.stringify(payload),
			},
		)
	}

	async deleteDashboard(dashboard: DashboardRecord) {
		console.log(
			`${this.apply ? 'DELETE' : 'DRY RUN delete'} dashboard: ${dashboard.name}`,
		)

		if (!this.apply) return

		await this.request<Record<string, unknown>>(
			`${this.host}/api/projects/${this.projectId}/dashboards/${dashboard.id}/`,
			{
				method: 'PATCH',
				body: JSON.stringify({ deleted: true }),
			},
		)
	}

	async deleteInsight(insight: InsightRecord) {
		console.log(
			`${this.apply ? 'DELETE' : 'DRY RUN delete'} insight: ${insight.name ?? insight.id}`,
		)

		if (!this.apply) return

		await this.request<Record<string, unknown>>(
			`${this.host}/api/projects/${this.projectId}/insights/${insight.id}/`,
			{
				method: 'PATCH',
				body: JSON.stringify({ deleted: true }),
			},
		)
	}
}

async function loadConfig(configPath: string) {
	const absolutePath = path.resolve(process.cwd(), configPath)
	const raw = await fs.readFile(absolutePath, 'utf8')
	const parsed = yaml.load(raw)

	return {
		config: configSchema.parse(parsed),
		absolutePath,
	}
}

async function syncDashboard(
	client: PostHogClient,
	config: Config,
	dashboardConfig: DashboardConfig,
	dashboardMap: Map<string, DashboardRecord>,
	insightMap: Map<string, InsightRecord>,
) {
	let dashboard = dashboardMap.get(dashboardConfig.name)
	const dashboardPayload = removeUndefined({
		name: dashboardConfig.name,
		description: dashboardConfig.description,
		tags: dashboardConfig.tags,
	})

	if (!dashboard) {
		dashboard = await client.createDashboard(dashboardPayload)
		dashboardMap.set(dashboardConfig.name, dashboard)
	} else {
		await client.updateDashboard(dashboard.id, dashboardPayload)
	}

	const desiredInsightNames = new Set<string>()
	for (const insight of dashboardConfig.insights) {
		desiredInsightNames.add(insight.name)
		const existing = insightMap.get(insight.name)
		const payload = buildInsightPayload(
			config,
			dashboardConfig,
			insight,
			dashboard.id,
			existing,
		)

		if (!existing) {
			const created = await client.createInsight(payload)
			insightMap.set(insight.name, {
				...created,
				name: insight.name,
				dashboards: payload.dashboards as number[] | undefined,
				tags: payload.tags as string[] | undefined,
			})
			continue
		}

		await client.updateInsight(existing.id, payload)
		insightMap.set(insight.name, {
			...existing,
			dashboards: payload.dashboards as number[] | undefined,
			tags: payload.tags as string[] | undefined,
		})
	}

	if (dashboardConfig.sync_mode !== 'replace_managed') return

	const managedTag =
		dashboardConfig.managed_tag ??
		`managed:posthog-dashboard:${slugify(dashboardConfig.name)}`

	for (const insight of insightMap.values()) {
		if (!insight.name) continue
		if (desiredInsightNames.has(insight.name)) continue
		if (!insight.dashboards?.includes(dashboard.id)) continue
		if (!insight.tags?.includes(managedTag)) continue

		const nextDashboards = insight.dashboards.filter(id => id !== dashboard.id)
		const nextTags = insight.tags.filter(tag => tag !== managedTag)

		await client.updateInsight(insight.id, {
			name: insight.name,
			dashboards: nextDashboards,
			tags: nextTags,
		})
		insightMap.set(insight.name, {
			...insight,
			dashboards: nextDashboards,
			tags: nextTags,
		})
	}
}

async function pruneProject(
	client: PostHogClient,
	config: Config,
	dashboardMap: Map<string, DashboardRecord>,
	insightMap: Map<string, InsightRecord>,
) {
	const configuredDashboardNames = new Set(
		config.dashboards.map(dashboard => dashboard.name),
	)
	const configuredInsightNames = new Set(
		config.dashboards.flatMap(dashboard =>
			dashboard.insights.map(insight => insight.name),
		),
	)

	if (config.project_sync?.prune_unconfigured_dashboards) {
		for (const dashboard of dashboardMap.values()) {
			if (configuredDashboardNames.has(dashboard.name)) continue
			await client.deleteDashboard(dashboard)
		}
	}

	if (config.project_sync?.prune_unconfigured_insights) {
		for (const insight of insightMap.values()) {
			if (!insight.name) continue
			if (configuredInsightNames.has(insight.name)) continue
			await client.deleteInsight(insight)
		}
	}
}

async function main() {
	const { configPath, apply } = parseArgs(process.argv.slice(2))
	const { config, absolutePath } = await loadConfig(configPath)
	const apiKey = process.env[config.posthog.api_key_env]

	if (!apiKey) {
		throw new Error(`Missing ${config.posthog.api_key_env} in environment`)
	}

	const host = inferPostHogHost(config.posthog.host)
	console.log(`${apply ? 'APPLY' : 'DRY RUN'} syncing ${absolutePath}`)
	console.log(`Project ${config.posthog.project_id} on ${host}`)

	const client = new PostHogClient(
		host,
		config.posthog.project_id,
		apiKey,
		apply,
	)
	const dashboards = await client.listDashboards()
	const insights = await client.listInsights()

	const dashboardMap = new Map(
		dashboards.map(dashboard => [dashboard.name, dashboard]),
	)
	const insightMap = new Map(
		insights
			.filter(insight => insight.name)
			.map(insight => [insight.name as string, insight]),
	)

	for (const dashboard of config.dashboards) {
		console.log(`Syncing dashboard: ${dashboard.name}`)
		await syncDashboard(client, config, dashboard, dashboardMap, insightMap)
	}

	await pruneProject(client, config, dashboardMap, insightMap)

	console.log('Done')
	if (!apply) {
		console.log('Run again with --apply to write changes to PostHog.')
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
