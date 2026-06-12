import {
	getBookingAnalyticsExclusionReason,
	isExcludedBookingAnalyticsIdentity,
} from '#app/utils/analytics-exclusions.ts'
import {
	analyzeCallAudio,
	fetchCallRecordingAudio,
	getCallIntelligenceConfig,
	type CallAnalysis,
} from '#app/utils/call-intelligence.server.ts'
import {
	CALLRAIL_CALL_FIELDS,
	callRailFetch,
	getCallRailAccountIds,
	normalizePhoneNumber,
	type CallRailCall,
} from '#app/utils/callrail-booking.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'

const DEFAULT_INITIAL_LOOKBACK_DAYS = 30
const DEFAULT_PER_PAGE = 100
const DEFAULT_MAX_PAGES = 20

const POSTHOG_SESSION_CUSTOM_KEYS = [
	'sha_posthog_session_id',
	'posthog_session_id',
	'ph_session_id',
]
const POSTHOG_DISTINCT_CUSTOM_KEYS = [
	'sha_posthog_distinct_id',
	'posthog_distinct_id',
	'ph_distinct_id',
]

type DbLike = typeof prisma

export type CallRailConversionCall = CallRailCall & {
	custom?: unknown
	customer_name?: string | null
	lead_status?: string | null
	medium?: string | null
	person_id?: string | null
	session_uuid?: string | null
	source?: string | null
	source_name?: string | null
	tags?: unknown
	timeline_url?: string | null
	value?: number | string | null
	[key: string]: unknown
}

type SyncCallRailPhoneConversionsOptions = {
	accountIds?: string[]
	analyzeCalls?: boolean
	analyzeLimit?: number
	db?: DbLike
	dryRun?: boolean
	limit?: number
	lookupClientByPhone?: LookupClientByPhone
	now?: Date
	since?: Date
	until?: Date
}

type LookupClientByPhone = (
	phone: string,
) => Promise<{
	email?: string | null
	firstName?: string | null
	id: string
	lastName?: string | null
} | null>

type CaptureCallRailPhoneConversionOptions = {
	accountId: string
	call: CallRailConversionCall
	db?: DbLike
	dryRun?: boolean
	extraProperties?: Record<string, unknown>
	lookupClientByPhone?: LookupClientByPhone
	timestamp?: string
}

type MatchedAttribution = {
	attribution_match: string
	book_entry_from_path?: string | null
	book_entry_page_prefix_type?: string | null
	book_entry_page_type?: string | null
	callrail_visitor_id?: string | null
	current_path?: string | null
	initial_landing_path?: string | null
	initial_landing_page_prefix_type?: string | null
	initial_landing_page_type?: string | null
	initial_referrer?: string | null
	initial_referring_domain?: string | null
	posthog_distinct_id?: string | null
	posthog_session_id?: string | null
	traffic_channel?: string | null
	traffic_platform?: string | null
	traffic_source_detail?: string | null
	utm_campaign?: string | null
	utm_content?: string | null
	utm_medium?: string | null
	utm_source?: string | null
	utm_term?: string | null
}

export async function captureCallRailPhoneConversionToPostHog({
	accountId,
	call,
	db = prisma,
	dryRun = false,
	extraProperties,
	lookupClientByPhone = defaultLookupClientByPhone,
	timestamp,
}: CaptureCallRailPhoneConversionOptions) {
	const event = await buildPhoneConversionEvent({
		accountId,
		call,
		db,
		extraProperties,
		timestamp,
	})

	const stats = {
		callId: event.callId,
		captured: 0,
		matched: event.attribution.attribution_match === 'none' ? 0 : 1,
		unmatched: event.attribution.attribution_match === 'none' ? 1 : 0,
	}
	const eventProperties: Record<string, unknown> = event.properties
	const exclusionReason =
		getBookingAnalyticsExclusionReason({
			emails: [
				eventProperties.$email,
				eventProperties.booking_client_email,
				eventProperties.blvd_client_email,
				eventProperties.client_email,
				eventProperties.customer_email,
				eventProperties.email,
			],
			phones: [
				call.customer_phone_number,
				call.formatted_customer_phone_number,
				eventProperties.booking_client_phone,
				eventProperties.booking_phone,
				eventProperties.callrail_customer_phone_number,
				eventProperties.callrail_formatted_customer_phone_number,
				eventProperties.caller_phone_number,
				eventProperties.client_phone,
				eventProperties.customer_phone,
				eventProperties.customer_phone_number,
				eventProperties.mobile_phone,
				eventProperties.phone,
			],
		}) ??
		(isExcludedBookingAnalyticsIdentity({
			phone: event.distinctId.startsWith('phone:')
				? event.distinctId.slice('phone:'.length)
				: null,
		})
			? 'excluded_booking_phone'
			: null)

	if (exclusionReason) {
		return {
			ok: true,
			dry_run: dryRun,
			skipped: true,
			skip_reason: exclusionReason,
			...stats,
			attribution: event.attribution,
			distinctId: event.distinctId,
		}
	}

	if (dryRun) {
		return {
			ok: true,
			dry_run: true,
			...stats,
			attribution: event.attribution,
			distinctId: event.distinctId,
		}
	}

	const result = await captureServerPostHogEvent({
		distinctId: event.distinctId,
		event: 'phone_call_conversion',
		insertId: `callrail-phone-conversion:${event.callId}`,
		properties: event.properties,
		timestamp: event.timestamp,
	})
	if (!result?.ok) {
		return {
			ok: false,
			dry_run: false,
			error: result?.error ?? 'posthog_capture_failed',
			...stats,
			attribution: event.attribution,
			distinctId: event.distinctId,
		}
	}

	await captureServerPostHogEvent({
		distinctId: event.distinctId,
		event: 'booking_conversion_completed',
		insertId: `booking-conversion:phone:${event.callId}`,
		properties: {
			...event.properties,
			booking_value_usd: event.properties.phone_conversion_value_usd,
			conversion_channel: 'phone',
		},
		timestamp: event.timestamp,
	})

	await identifyPhoneConversionPerson(event, lookupClientByPhone)

	return {
		ok: true,
		dry_run: false,
		...stats,
		captured: 1,
		attribution: event.attribution,
		distinctId: event.distinctId,
	}
}

/**
 * After a phone conversion, identify the caller so the PostHog person carries
 * real customer data (name/email from the call and the matched Boulevard
 * profile). When the conversion matched an anonymous web session, merge that
 * session into the caller's phone-first person — the same `phone:` identity
 * the website booking flow uses.
 */
async function identifyPhoneConversionPerson(
	event: {
		callerPhone: string | null
		callId: string
		distinctId: string
		properties: Record<string, unknown>
	},
	lookupClientByPhone: LookupClientByPhone,
) {
	if (!event.callerPhone) return

	const personProperties = compactRecord({
		phone: event.callerPhone,
		name: pickOptionalString(event.properties.callrail_customer_name),
		...(await getBoulevardPersonProperties(
			event.callerPhone,
			lookupClientByPhone,
		)),
	})

	const phoneDistinctId = `phone:${event.callerPhone}`
	const isAnonymousWebPerson = !/^(email|phone|blvd-client|callrail):/.test(
		event.distinctId,
	)

	try {
		if (isAnonymousWebPerson) {
			// Server-side identify: merges the anonymous web session person
			// into the caller's phone person.
			await captureServerPostHogEvent({
				distinctId: phoneDistinctId,
				event: '$identify',
				insertId: `callrail-phone-identify:${event.callId}`,
				properties: {
					$anon_distinct_id: event.distinctId,
					$set: personProperties,
				},
			})
			return
		}

		await captureServerPostHogEvent({
			distinctId: event.distinctId,
			event: '$set',
			insertId: `callrail-phone-set:${event.callId}`,
			properties: { $set: personProperties },
		})
	} catch (error) {
		console.warn('Failed to identify phone conversion person', error)
	}
}

async function defaultLookupClientByPhone(phone: string) {
	const { findAdminClientByPhone } = await import(
		'#app/utils/blvd-voice-booking.server.ts'
	)
	return findAdminClientByPhone(phone)
}

async function getBoulevardPersonProperties(
	callerPhone: string,
	lookupClientByPhone: LookupClientByPhone,
) {
	try {
		const client = await lookupClientByPhone(callerPhone)
		if (!client) return {}
		return compactRecord({
			blvd_client_id: client.id,
			email: pickOptionalString(client.email),
			$email: pickOptionalString(client.email),
			first_name: pickOptionalString(client.firstName),
			last_name: pickOptionalString(client.lastName),
			name:
				[client.firstName, client.lastName]
					.map(part => pickOptionalString(part))
					.filter(Boolean)
					.join(' ') || undefined,
		})
	} catch (error) {
		console.warn('Boulevard client lookup for PostHog identify failed', error)
		return {}
	}
}

export async function syncCallRailPhoneConversionsToPostHog(
	options: SyncCallRailPhoneConversionsOptions = {},
) {
	const db = options.db ?? prisma
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) {
		return {
			ok: false,
			error: 'missing_callrail_api_key',
			captured: 0,
			dry_run: Boolean(options.dryRun),
			matched: 0,
			scanned: 0,
			unmatched: 0,
		}
	}
	if (!options.dryRun && !process.env.REACT_APP_PUBLIC_POSTHOG_KEY?.trim()) {
		return {
			ok: false,
			error: 'missing_posthog_key',
			captured: 0,
			dry_run: false,
			matched: 0,
			scanned: 0,
			unmatched: 0,
		}
	}

	// Always re-scan the full window: calls get tagged "booked appointment"
	// or good_lead days after they happen, and the old moving window
	// silently missed those late qualifications. The CallRailCall table
	// dedupes captures, so re-scanning is cheap and idempotent.
	const now = options.now ?? new Date()
	const since =
		options.since ??
		new Date(now.getTime() - DEFAULT_INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
	const until = options.until ?? now
	const accountIds =
		options.accountIds && options.accountIds.length > 0
			? options.accountIds
			: await getCallRailAccountIds(apiKey)
	const analysisConfig =
		options.analyzeCalls === false ? null : getCallIntelligenceConfig()
	const analyzeLimit = options.analyzeLimit ?? 10
	let analyzedThisRun = 0

	const stats = {
		account_count: accountIds.length,
		analyzed: 0,
		analysis_failed: 0,
		calls_recorded: 0,
		captured: 0,
		conversion_count: 0,
		dry_run: Boolean(options.dryRun),
		matched: 0,
		scanned: 0,
		since: since.toISOString(),
		skipped: 0,
		unmatched: 0,
		until: until.toISOString(),
	}

	for (const accountId of accountIds) {
		const calls = await listRecentCallRailCalls({
			accountId,
			apiKey,
			limit: options.limit,
			since,
			until,
		})
		stats.scanned += calls.length

		for (const call of calls) {
			const callId = pickOptionalString(call.id)
			if (!callId) continue

			const isQualified = isConversionCall(call)
			if (isQualified) stats.conversion_count += 1
			if (options.dryRun) continue

			const record =
				(await db.callRailCall.findUnique({
					where: { callrailCallId: callId },
				})) ??
				(await db.callRailCall.create({
					data: {
						callrailCallId: callId,
						callrailAccountId: accountId,
						source:
							pickOptionalString(call.source) ??
							pickOptionalString(call.source_name),
						callerPhone: pickOptionalString(call.customer_phone_number),
						durationSeconds: Number(call.duration) || null,
						answered: typeof call.answered === 'boolean' ? call.answered : null,
						startedAt: parseDateString(call.start_time),
						qualified: isQualified,
					},
				}))

			// 1. every inbound call becomes a PostHog event, once
			if (!record.receivedEventAt) {
				const event = await buildPhoneConversionEvent({
					accountId,
					call,
					db,
				})
				const result = await captureServerPostHogEvent({
					distinctId: event.distinctId,
					event: 'phone_call_received',
					insertId: `callrail-call:${callId}`,
					properties: {
						...event.properties,
						call_answered: call.answered ?? undefined,
						call_duration_seconds: Number(call.duration) || undefined,
					},
					timestamp: event.timestamp,
				})
				if (result?.ok) {
					stats.calls_recorded += 1
					await db.callRailCall.update({
						where: { callrailCallId: callId },
						data: { receivedEventAt: new Date() },
					})
				}
			}

			// 2. qualified conversions, including ones tagged late
			if (isQualified && !record.conversionEventAt) {
				const result = await captureCallRailPhoneConversionToPostHog({
					accountId,
					call,
					db,
					lookupClientByPhone: options.lookupClientByPhone,
				})
				stats.matched += result.matched
				stats.unmatched += result.unmatched
				if (result.ok && 'captured' in result && result.captured) {
					stats.captured += result.captured
					await db.callRailCall.update({
						where: { callrailCallId: callId },
						data: { conversionEventAt: new Date(), qualified: true },
					})
				}
			} else if (isQualified && !record.qualified) {
				await db.callRailCall.update({
					where: { callrailCallId: callId },
					data: { qualified: true },
				})
			}

			// 3. AI analysis of the recording (newest calls first, capped per run)
			if (
				analysisConfig &&
				analyzedThisRun < analyzeLimit &&
				!record.analyzedAt &&
				!record.analysisError &&
				call.answered === true &&
				Number(call.duration) >= 25 &&
				pickOptionalString(call.recording)
			) {
				analyzedThisRun += 1
				const outcome = await analyzeCallRecordingToPostHog({
					accountId,
					apiKey,
					call,
					callId,
					db,
				})
				if (outcome === 'analyzed') stats.analyzed += 1
				if (outcome === 'failed') stats.analysis_failed += 1
			}
		}
	}

	return {
		ok: true,
		...stats,
	}
}

async function analyzeCallRecordingToPostHog({
	accountId,
	apiKey,
	call,
	callId,
	db,
}: {
	accountId: string
	apiKey: string
	call: CallRailConversionCall
	callId: string
	db: DbLike
}): Promise<'analyzed' | 'failed'> {
	try {
		const audio = await fetchCallRecordingAudio({
			recordingUrl: String(call.recording),
			callRailApiKey: apiKey,
		})
		if (!audio) {
			await db.callRailCall.update({
				where: { callrailCallId: callId },
				data: { analysisError: 'recording_unavailable' },
			})
			return 'failed'
		}
		const result = await analyzeCallAudio({ audio })
		if (!result.ok) {
			await db.callRailCall.update({
				where: { callrailCallId: callId },
				data: { analysisError: result.error },
			})
			return 'failed'
		}

		const event = await buildPhoneConversionEvent({ accountId, call, db })
		await captureServerPostHogEvent({
			distinctId: event.distinctId,
			event: 'phone_call_analyzed',
			insertId: `callrail-call-analysis:${callId}`,
			properties: {
				...event.properties,
				...prefixAnalysis(result.analysis),
			},
			timestamp: event.timestamp,
		})
		await db.callRailCall.update({
			where: { callrailCallId: callId },
			data: {
				analyzedAt: new Date(),
				analysisJson: JSON.stringify(result.analysis),
				analysisError: null,
			},
		})
		return 'analyzed'
	} catch (error) {
		await db.callRailCall.update({
			where: { callrailCallId: callId },
			data: {
				analysisError: error instanceof Error ? error.message : 'unknown',
			},
		})
		return 'failed'
	}
}

function prefixAnalysis(analysis: CallAnalysis) {
	return {
		call_reason: analysis.reason ?? undefined,
		call_intent: analysis.caller_intent,
		call_service_interest: analysis.service_interest ?? undefined,
		call_outcome: analysis.outcome,
		call_not_booked_reason: analysis.not_booked_reason ?? undefined,
		call_follow_up_recommended: analysis.follow_up_recommended,
		call_summary: analysis.summary,
	}
}

export async function listRecentCallRailCalls({
	accountId,
	apiKey,
	limit,
	since,
	until,
}: {
	accountId: string
	apiKey: string
	limit?: number
	since: Date
	until: Date
}) {
	const calls: CallRailConversionCall[] = []
	for (let page = 1; page <= DEFAULT_MAX_PAGES; page++) {
		if (limit && calls.length >= limit) break

		const params = new URLSearchParams({
			call_type: 'inbound',
			date_range: getCallRailDateRangePreset(since, until),
			fields: CALLRAIL_CALL_FIELDS,
			order: 'desc',
			page: String(page),
			per_page: String(DEFAULT_PER_PAGE),
			sort: 'start_time',
		})
		const response = await callRailFetch(apiKey, `/a/${accountId}/calls.json`, {
			method: 'GET',
			params,
		})
		const pageCalls = Array.isArray(response.calls)
			? (response.calls as CallRailConversionCall[])
			: []
		const filteredPageCalls = pageCalls.filter(call =>
			isCallInWindow(call, since, until),
		)
		calls.push(...filteredPageCalls)

		if (pageCalls.length < DEFAULT_PER_PAGE) break
	}

	return limit ? calls.slice(0, limit) : calls
}

async function buildPhoneConversionEvent({
	accountId,
	call,
	db,
	extraProperties,
	timestamp,
}: {
	accountId: string
	call: CallRailConversionCall
	db: DbLike
	extraProperties?: Record<string, unknown>
	timestamp?: string
}) {
	const callId = requireString(call.id, 'CallRail call is missing id')
	const attribution = await findMatchedAttribution({ call, db })
	const callerPhone = normalizePhoneNumber(call.customer_phone_number)
	// Prefer the matched web session person; otherwise fall back to the same
	// phone-first identity the website booking flow uses so calls and web
	// bookings from one client unify into a single PostHog person.
	const distinctId =
		attribution.posthog_distinct_id ??
		attribution.posthog_session_id ??
		(callerPhone ? `phone:${callerPhone}` : `callrail:${callId}`)
	const tags = getStringArray(call.tags)
	const valueUsd = parseMoneyValue(call.value)
	const callStartTime = parseDateString(call.start_time)

	return {
		attribution,
		callerPhone,
		callId,
		distinctId,
		properties: compactRecord({
			...attribution,
			account_id: accountId,
			booking_channel: tags.some(tag => /retell/i.test(tag))
				? 'retell_voice'
				: 'phone_call',
			callrail_call_id: callId,
			callrail_company_id: pickOptionalString(call.company_id),
			callrail_company_name: pickOptionalString(call.company_name),
			callrail_customer_name: pickOptionalString(call.customer_name),
			callrail_customer_phone_number: pickOptionalString(
				call.customer_phone_number,
			),
			callrail_formatted_customer_phone_number: pickOptionalString(
				call.formatted_customer_phone_number,
			),
			callrail_landing_page_url: pickOptionalString(call.landing_page_url),
			callrail_last_requested_url: pickOptionalString(call.last_requested_url),
			callrail_lead_status: pickOptionalString(call.lead_status),
			callrail_medium: pickOptionalString(call.medium),
			callrail_person_id: pickOptionalString(call.person_id),
			callrail_referrer_domain: pickOptionalString(call.referrer_domain),
			callrail_referring_url: pickOptionalString(call.referring_url),
			callrail_session_id: pickOptionalString(call.session_uuid),
			callrail_source:
				pickOptionalString(call.source) ?? pickOptionalString(call.source_name),
			callrail_start_time: callStartTime?.toISOString(),
			callrail_tags: tags,
			callrail_timeline_url: pickOptionalString(call.timeline_url),
			conversion_source: 'callrail',
			currency: 'USD',
			phone_conversion_value_usd: valueUsd,
			value: valueUsd,
			...extraProperties,
		}),
		timestamp: timestamp ?? callStartTime?.toISOString(),
	}
}

async function findMatchedAttribution({
	call,
	db,
}: {
	call: CallRailConversionCall
	db: DbLike
}): Promise<MatchedAttribution> {
	const callId = pickOptionalString(call.id)
	const sessionId = pickOptionalString(call.session_uuid)
	const visitorId = pickOptionalString(call.person_id)
	const custom = getRecord(call.custom)
	const customAttribution = {
		posthog_distinct_id: pickFirstString(custom, POSTHOG_DISTINCT_CUSTOM_KEYS),
		posthog_session_id: pickFirstString(custom, POSTHOG_SESSION_CUSTOM_KEYS),
	}

	if (
		customAttribution.posthog_distinct_id ||
		customAttribution.posthog_session_id
	) {
		return {
			...customAttribution,
			attribution_match: 'callrail_custom_fields',
		}
	}

	const touchOr = [
		callId ? { callrailCallId: callId } : null,
		sessionId ? { callrailSessionId: sessionId } : null,
		visitorId ? { callrailVisitorId: visitorId } : null,
	].filter(Boolean)
	if (touchOr.length > 0) {
		const touch = await db.blvdAttributionTouch.findFirst({
			where: { OR: touchOr },
			orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
			select: {
				bookEntryFromPath: true,
				bookEntryPagePrefixType: true,
				bookEntryPageType: true,
				callrailVisitorId: true,
				initialLandingPath: true,
				initialLandingPagePrefixType: true,
				initialLandingPageType: true,
				initialReferrer: true,
				initialReferringDomain: true,
				posthogDistinctId: true,
				posthogSessionId: true,
				trafficChannel: true,
				trafficPlatform: true,
				trafficSourceDetail: true,
				utmCampaign: true,
				utmContent: true,
				utmMedium: true,
				utmSource: true,
				utmTerm: true,
			},
		})
		if (touch?.posthogDistinctId || touch?.posthogSessionId) {
			return {
				...mapTouchAttribution(touch),
				attribution_match: 'boulevard_attribution_touch',
			}
		}
	}

	const outcomeOr = [
		callId ? { callrailCallId: callId } : null,
		sessionId ? { callrailSessionId: sessionId } : null,
	].filter(Boolean)
	if (outcomeOr.length > 0) {
		const outcome = await db.retellCallOutcome.findFirst({
			where: { OR: outcomeOr },
			orderBy: { createdAt: 'desc' },
			select: {
				callrailLandingPageUrl: true,
				callrailLastRequestedUrl: true,
				posthogDistinctId: true,
				posthogSessionId: true,
			},
		})
		if (outcome?.posthogDistinctId || outcome?.posthogSessionId) {
			return {
				attribution_match: 'retell_call_outcome',
				current_path: outcome.callrailLastRequestedUrl,
				initial_landing_path: outcome.callrailLandingPageUrl,
				posthog_distinct_id: outcome.posthogDistinctId,
				posthog_session_id: outcome.posthogSessionId,
			}
		}
	}

	const sessionOr = [
		sessionId ? { callrailSessionId: sessionId } : null,
		visitorId ? { callrailVisitorId: visitorId } : null,
	].filter(Boolean)
	if (sessionOr.length > 0) {
		const session = await db.callTrackingSessionAttribution.findFirst({
			where: { OR: sessionOr },
			orderBy: { lastSeenAt: 'desc' },
			select: {
				bookEntryFromPath: true,
				bookEntryPagePrefixType: true,
				bookEntryPageType: true,
				callrailVisitorId: true,
				currentPath: true,
				initialLandingPath: true,
				initialLandingPagePrefixType: true,
				initialLandingPageType: true,
				initialReferrer: true,
				initialReferringDomain: true,
				posthogDistinctId: true,
				posthogSessionId: true,
				trafficChannel: true,
				trafficPlatform: true,
				trafficSourceDetail: true,
				utmCampaign: true,
				utmContent: true,
				utmMedium: true,
				utmSource: true,
				utmTerm: true,
			},
		})
		if (session?.posthogDistinctId || session?.posthogSessionId) {
			return {
				...mapSessionAttribution(session),
				attribution_match: 'call_tracking_session',
			}
		}
	}

	return { attribution_match: 'none' }
}

function mapTouchAttribution(input: {
	bookEntryFromPath: string | null
	bookEntryPagePrefixType: string | null
	bookEntryPageType: string | null
	callrailVisitorId: string | null
	initialLandingPath: string | null
	initialLandingPagePrefixType: string | null
	initialLandingPageType: string | null
	initialReferrer: string | null
	initialReferringDomain: string | null
	posthogDistinctId: string | null
	posthogSessionId: string | null
	trafficChannel: string | null
	trafficPlatform: string | null
	trafficSourceDetail: string | null
	utmCampaign: string | null
	utmContent: string | null
	utmMedium: string | null
	utmSource: string | null
	utmTerm: string | null
}): Omit<MatchedAttribution, 'attribution_match'> {
	return {
		book_entry_from_path: input.bookEntryFromPath,
		book_entry_page_prefix_type: input.bookEntryPagePrefixType,
		book_entry_page_type: input.bookEntryPageType,
		callrail_visitor_id: input.callrailVisitorId,
		initial_landing_path: input.initialLandingPath,
		initial_landing_page_prefix_type: input.initialLandingPagePrefixType,
		initial_landing_page_type: input.initialLandingPageType,
		initial_referrer: input.initialReferrer,
		initial_referring_domain: input.initialReferringDomain,
		posthog_distinct_id: input.posthogDistinctId,
		posthog_session_id: input.posthogSessionId,
		traffic_channel: input.trafficChannel,
		traffic_platform: input.trafficPlatform,
		traffic_source_detail: input.trafficSourceDetail,
		utm_campaign: input.utmCampaign,
		utm_content: input.utmContent,
		utm_medium: input.utmMedium,
		utm_source: input.utmSource,
		utm_term: input.utmTerm,
	}
}

function mapSessionAttribution(input: {
	bookEntryFromPath: string | null
	bookEntryPagePrefixType: string | null
	bookEntryPageType: string | null
	callrailVisitorId: string | null
	currentPath: string | null
	initialLandingPath: string | null
	initialLandingPagePrefixType: string | null
	initialLandingPageType: string | null
	initialReferrer: string | null
	initialReferringDomain: string | null
	posthogDistinctId: string | null
	posthogSessionId: string | null
	trafficChannel: string | null
	trafficPlatform: string | null
	trafficSourceDetail: string | null
	utmCampaign: string | null
	utmContent: string | null
	utmMedium: string | null
	utmSource: string | null
	utmTerm: string | null
}): Omit<MatchedAttribution, 'attribution_match'> {
	return {
		...mapTouchAttribution(input),
		current_path: input.currentPath,
	}
}

export function isConversionCall(call: CallRailConversionCall) {
	const tags = getStringArray(call.tags)
	return (
		pickOptionalString(call.lead_status) === 'good_lead' ||
		tags.some(tag => tag.toLowerCase() === 'booked appointment')
	)
}

function isCallInWindow(
	call: CallRailConversionCall,
	since: Date,
	until: Date,
) {
	const startTime = parseDateString(call.start_time)
	if (!startTime) return true
	return startTime >= since && startTime <= until
}

function parseDateString(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) return null
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

export function parseMoneyValue(value: unknown) {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0
	if (typeof value !== 'string') return 0
	const parsed = Number.parseFloat(value.replace(/[$,]/g, ''))
	return Number.isFinite(parsed) ? parsed : 0
}

function getCallRailDateRangePreset(since: Date, until: Date) {
	const days = Math.ceil(
		Math.max(0, until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000),
	)
	if (days <= 7) return 'last_7_days'
	if (days <= 30) return 'last_30_days'
	return 'all_time'
}

function getRecord(value: unknown) {
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null
}

function pickOptionalString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function pickFirstString(
	record: Record<string, unknown> | null,
	keys: readonly string[],
) {
	if (!record) return null
	for (const key of keys) {
		const value = pickOptionalString(record[key])
		if (value) return value
	}
	return null
}

function getStringArray(value: unknown) {
	if (!Array.isArray(value)) return []
	return value
		.map(item => (typeof item === 'string' ? item.trim() : null))
		.filter((item): item is string => Boolean(item))
}

function compactRecord<T extends Record<string, unknown>>(record: T) {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	) as T
}

function requireString(value: unknown, message: string) {
	const normalized = pickOptionalString(value)
	if (!normalized) throw new Error(message)
	return normalized
}
