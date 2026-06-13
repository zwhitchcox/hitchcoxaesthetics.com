import {
	getBookingAnalyticsExclusionReason,
	isExcludedBookingAnalyticsIdentity,
} from '#app/utils/analytics-exclusions.ts'
import {
	analyzeCall,
	getCallIntelligenceConfig,
} from '#app/utils/call-intelligence.server.ts'
import { getCallTaxonomy } from '#app/utils/call-tags.server.ts'
import { normalizePhoneNumber } from '#app/utils/callrail-booking.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'

/**
 * Ingests Retell calls that never passed through CallRail.
 *
 * Most published numbers are CallRail tracking numbers that forward to the
 * Retell agents, and those calls are handled by the CallRail sync. But the
 * Retell agent numbers themselves are also published (e.g. on the Botox Knox
 * GMB listing) and get dialed directly, plus web calls - in a sample month
 * that was over a third of real agent volume. This sync lists Retell calls
 * for the production agents, skips anything CallRail already tracks (by
 * RetellCallOutcome link or caller-phone + start-time proximity), and runs
 * the same PostHog events, AI analysis, and follow-up creation for the rest.
 *
 * Records share the CallRailCall table with id `retell:<call_id>` so dedup,
 * analysis columns, follow-ups, and the monthly mistake review all work the
 * same way for both pipelines.
 */

const LOOKBACK_DAYS = 30
const RETELL_API_URL = 'https://api.retellai.com'
const CALLRAIL_MATCH_WINDOW_MS = 3 * 60 * 1000

// Mirrors scripts/retell-booking-brands.ts (not imported so the app build
// does not depend on the scripts directory).
const PRODUCTION_AGENTS = [
	{
		envVar: 'RETELL_SARAH_AGENT_ID',
		defaultId: 'agent_01931c39dd6b893c7653b3c4a1',
		name: 'Sarah Hitchcox Aesthetics',
	},
	{
		envVar: 'RETELL_BOTOX_KNOX_AGENT_ID',
		defaultId: 'agent_2d6a0de3088f3066a2081539c0',
		name: 'Botox Knox',
	},
	{
		envVar: 'RETELL_WEIGHT_LOSS_KNOX_AGENT_ID',
		defaultId: 'agent_ba54c0b712bf2771c8d4209c7b',
		name: 'Weight Loss Knox',
	},
] as const

type DbLike = typeof prisma

type RetellListedCall = {
	call_id: string
	agent_id: string
	call_type?: string
	direction?: string
	from_number?: string
	to_number?: string
	start_timestamp?: number
	duration_ms?: number
	transcript?: string
	disconnection_reason?: string
}

export function getProductionRetellAgents() {
	return PRODUCTION_AGENTS.map(agent => ({
		id: process.env[agent.envVar]?.trim() || agent.defaultId,
		name: agent.name,
	}))
}

export async function syncRetellDirectCallsToPostHog({
	db = prisma,
	analyzeLimit = 10,
	now = new Date(),
	fetchImpl = fetch,
}: {
	db?: DbLike
	analyzeLimit?: number
	now?: Date
	fetchImpl?: typeof fetch
} = {}) {
	const apiKey = process.env.RETELL_API_KEY?.trim()
	if (!apiKey) {
		return { ok: false as const, error: 'missing_retell_api_key' }
	}
	if (!process.env.REACT_APP_PUBLIC_POSTHOG_KEY?.trim()) {
		return { ok: false as const, error: 'missing_posthog_key' }
	}

	const stats = {
		ok: true as const,
		scanned: 0,
		already_tracked_by_callrail: 0,
		excluded: 0,
		calls_recorded: 0,
		analyzed: 0,
		analysis_failed: 0,
	}

	const agents = getProductionRetellAgents()
	const agentNames = new Map(agents.map(agent => [agent.id, agent.name]))
	const calls = await listRetellCalls({
		apiKey,
		agentIds: agents.map(agent => agent.id),
		sinceMs: now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
		fetchImpl,
	})
	stats.scanned = calls.length

	const analysisConfig = getCallIntelligenceConfig()
	let analyzedThisRun = 0

	for (const call of calls) {
		if (call.direction === 'outbound') continue
		const recordId = `retell:${call.call_id}`
		const callerPhone = normalizePhoneNumber(call.from_number)
		const startedAt = call.start_timestamp ? new Date(call.start_timestamp) : null

		if (
			getBookingAnalyticsExclusionReason({ emails: [], phones: [callerPhone] }) ||
			isExcludedBookingAnalyticsIdentity({ phone: callerPhone })
		) {
			stats.excluded += 1
			continue
		}

		let record = await db.callRailCall.findUnique({
			where: { callrailCallId: recordId },
		})
		if (!record) {
			// Skip calls CallRail already tracks: forwarded calls either have a
			// RetellCallOutcome row pointing at the CallRail call, or a CallRail
			// call from the same phone within a few minutes of the same start.
			const outcome = await db.retellCallOutcome.findFirst({
				where: { retellCallId: call.call_id, callrailCallId: { not: null } },
				select: { id: true },
			})
			const callrailTwin =
				!outcome && callerPhone && startedAt
					? await db.callRailCall.findFirst({
							where: {
								callerPhone,
								callrailCallId: { not: { startsWith: 'retell:' } },
								startedAt: {
									gte: new Date(startedAt.getTime() - CALLRAIL_MATCH_WINDOW_MS),
									lte: new Date(startedAt.getTime() + CALLRAIL_MATCH_WINDOW_MS),
								},
							},
							select: { id: true },
						})
					: null
			if (outcome || callrailTwin) {
				stats.already_tracked_by_callrail += 1
				continue
			}

			record = await db.callRailCall.create({
				data: {
					callrailCallId: recordId,
					source: `Retell Direct - ${agentNames.get(call.agent_id) ?? call.agent_id}`,
					callerPhone,
					durationSeconds: call.duration_ms
						? Math.round(call.duration_ms / 1000)
						: null,
					answered: (call.duration_ms ?? 0) > 0,
					startedAt,
				},
			})
		}

		const event = buildRetellDirectEvent({ call, callerPhone, agentNames })

		// 1. every direct call becomes a PostHog event, once
		if (!record.receivedEventAt) {
			const result = await captureServerPostHogEvent({
				distinctId: event.distinctId,
				event: 'phone_call_received',
				insertId: `retell-direct-call:${call.call_id}`,
				properties: event.properties,
				timestamp: event.timestamp,
			})
			if (result?.ok) {
				stats.calls_recorded += 1
				record = await db.callRailCall.update({
					where: { callrailCallId: recordId },
					data: { receivedEventAt: new Date() },
				})
			}
		}

		// 2. AI analysis from the Retell transcript
		const transcript = call.transcript?.trim()
		if (
			analysisConfig &&
			analyzedThisRun < analyzeLimit &&
			!record.analyzedAt &&
			!record.analysisError &&
			transcript &&
			(call.duration_ms ?? 0) >= 25_000
		) {
			analyzedThisRun += 1
			try {
				const taxonomy = await getCallTaxonomy(db)
				const result = await analyzeCall({
					input: { kind: 'transcript', transcript },
					taxonomy,
					config: analysisConfig,
					fetchImpl,
				})
				if (!result.ok) {
					await db.callRailCall.update({
						where: { callrailCallId: recordId },
						data: { analysisError: result.error },
					})
					stats.analysis_failed += 1
					continue
				}
				const analysis = result.analysis
				const exclusiveTag = (group: string) => {
					const value = analysis.tags[group]
					return typeof value === 'string' ? value : null
				}
				await captureServerPostHogEvent({
					distinctId: event.distinctId,
					event: 'phone_call_analyzed',
					insertId: `retell-direct-call-analysis:${call.call_id}`,
					properties: {
						...event.properties,
						call_reason: analysis.reason ?? undefined,
						call_service_interest: analysis.service_interest ?? undefined,
						call_follow_up_recommended: analysis.follow_up_recommended,
						call_summary: analysis.summary,
						call_lost_reason: analysis.lost_reason ?? undefined,
						call_frustration_reason: analysis.frustration_reason ?? undefined,
						call_agent_fix_suggestion:
							analysis.agent_fix_suggestion ?? undefined,
						call_outcome: analysis.tags.outcome ?? undefined,
						call_not_booked_reason: analysis.tags.why_not_booked ?? undefined,
						...Object.fromEntries(
							Object.entries(analysis.tags).map(([group, value]) => [
								`call_tag_${group}`,
								value ?? undefined,
							]),
						),
						call_analysis_source: 'retell_transcript',
					},
					timestamp: event.timestamp,
				})
				await db.callRailCall.update({
					where: { callrailCallId: recordId },
					data: {
						analyzedAt: new Date(),
						analysisJson: JSON.stringify(analysis),
						analysisError: null,
						analysisSource: 'retell_transcript',
						outcome: exclusiveTag('outcome'),
						disposition: exclusiveTag('disposition'),
						lostReason: analysis.lost_reason,
						frustrationReason: analysis.frustration_reason,
						agentFixSuggestion: analysis.agent_fix_suggestion,
						followUpNeeded: analysis.follow_up_recommended,
					},
				})
				if (analysis.follow_up_recommended && callerPhone) {
					await db.followUp.upsert({
						where: { callrailCallId: recordId },
						create: {
							callrailCallId: recordId,
							customerPhone: callerPhone,
							reason:
								analysis.lost_reason ?? analysis.reason ?? analysis.summary,
						},
						update: {},
					})
				}
				stats.analyzed += 1
			} catch (error) {
				await db.callRailCall.update({
					where: { callrailCallId: recordId },
					data: {
						analysisError: error instanceof Error ? error.message : 'unknown',
					},
				})
				stats.analysis_failed += 1
			}
		}
	}

	return stats
}

function buildRetellDirectEvent({
	call,
	callerPhone,
	agentNames,
}: {
	call: RetellListedCall
	callerPhone: string | null
	agentNames: Map<string, string>
}) {
	const distinctId = callerPhone
		? `phone:${callerPhone}`
		: `retell:${call.call_id}`
	return {
		distinctId,
		timestamp: call.start_timestamp
			? new Date(call.start_timestamp).toISOString()
			: undefined,
		properties: compactRecord({
			booking_channel: 'retell_voice',
			conversion_source: 'retell_direct',
			callrail_source: `Retell Direct - ${agentNames.get(call.agent_id) ?? call.agent_id}`,
			retell_call_id: call.call_id,
			retell_agent_id: call.agent_id,
			retell_agent_name: agentNames.get(call.agent_id),
			retell_call_type: call.call_type,
			retell_dialed_number: call.to_number,
			caller_phone_number: callerPhone ?? undefined,
			call_answered: (call.duration_ms ?? 0) > 0,
			call_duration_seconds: call.duration_ms
				? Math.round(call.duration_ms / 1000)
				: undefined,
			attribution_match: 'none',
		}),
	}
}

async function listRetellCalls({
	apiKey,
	agentIds,
	sinceMs,
	fetchImpl,
}: {
	apiKey: string
	agentIds: string[]
	sinceMs: number
	fetchImpl: typeof fetch
}) {
	const calls: RetellListedCall[] = []
	let paginationKey: string | undefined
	for (let page = 0; page < 10; page++) {
		const response = await fetchImpl(`${RETELL_API_URL}/v2/list-calls`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				filter_criteria: {
					agent_id: agentIds,
					start_timestamp: { lower_threshold: sinceMs },
				},
				sort_order: 'descending',
				limit: 1000,
				...(paginationKey ? { pagination_key: paginationKey } : {}),
			}),
		})
		if (!response.ok) {
			throw new Error(`retell_list_calls_http_${response.status}`)
		}
		const pageCalls = (await response.json()) as RetellListedCall[]
		if (!Array.isArray(pageCalls) || pageCalls.length === 0) break
		calls.push(...pageCalls)
		if (pageCalls.length < 1000) break
		paginationKey = pageCalls[pageCalls.length - 1]?.call_id
	}
	return calls
}

function compactRecord<T extends Record<string, unknown>>(record: T) {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	) as T
}
