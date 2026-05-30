import { z } from 'zod'

import { prisma } from '#app/utils/db.server.ts'

const optionalTrimmedString = z.preprocess(
	value =>
		value === null || (typeof value === 'string' && !value.trim())
			? undefined
			: value,
	z.string().trim().optional(),
)

export const callTrackingSessionAttributionInputSchema = z
	.object({
		book_entry_from_path: optionalTrimmedString,
		book_entry_page_prefix_type: optionalTrimmedString,
		book_entry_page_type: optionalTrimmedString,
		callrail_session_id: optionalTrimmedString,
		callrail_visitor_id: optionalTrimmedString,
		current_page_prefix_type: optionalTrimmedString,
		current_page_type: optionalTrimmedString,
		current_path: optionalTrimmedString,
		current_search: optionalTrimmedString,
		fbclid: optionalTrimmedString,
		gbraid: optionalTrimmedString,
		gclid: optionalTrimmedString,
		initial_landing_page_prefix_type: optionalTrimmedString,
		initial_landing_page_type: optionalTrimmedString,
		initial_landing_path: optionalTrimmedString,
		initial_landing_search: optionalTrimmedString,
		initial_referrer: optionalTrimmedString,
		initial_referring_domain: optionalTrimmedString,
		msclkid: optionalTrimmedString,
		occurred_at: z.string().datetime().optional(),
		posthog_distinct_id: optionalTrimmedString,
		posthog_session_id: optionalTrimmedString,
		traffic_channel: optionalTrimmedString,
		traffic_platform: optionalTrimmedString,
		traffic_source_detail: optionalTrimmedString,
		utm_campaign: optionalTrimmedString,
		utm_content: optionalTrimmedString,
		utm_medium: optionalTrimmedString,
		utm_source: optionalTrimmedString,
		utm_term: optionalTrimmedString,
		wbraid: optionalTrimmedString,
	})
	.catchall(z.unknown())

type CallTrackingSessionAttributionInput = z.output<
	typeof callTrackingSessionAttributionInputSchema
>
type DbLike = typeof prisma

export async function recordCallTrackingSessionAttribution(
	input: CallTrackingSessionAttributionInput,
	db: DbLike = prisma,
) {
	const parsed = callTrackingSessionAttributionInputSchema.parse(input)
	const occurredAt = parsed.occurred_at
		? new Date(parsed.occurred_at)
		: new Date()
	const existing = await findExistingCallTrackingSessionAttribution(parsed, db)
	const data = {
		occurredAt: existing ? undefined : occurredAt,
		lastSeenAt: occurredAt,
		posthogDistinctId: normalizeOptionalString(parsed.posthog_distinct_id),
		posthogSessionId: normalizeOptionalString(parsed.posthog_session_id),
		callrailSessionId: normalizeOptionalString(parsed.callrail_session_id),
		callrailVisitorId: normalizeOptionalString(parsed.callrail_visitor_id),
		currentPath: normalizeOptionalString(parsed.current_path),
		currentSearch: normalizeOptionalString(parsed.current_search),
		currentPagePrefixType: normalizeOptionalString(
			parsed.current_page_prefix_type,
		),
		currentPageType: normalizeOptionalString(parsed.current_page_type),
		bookEntryFromPath: normalizeOptionalString(parsed.book_entry_from_path),
		bookEntryPagePrefixType: normalizeOptionalString(
			parsed.book_entry_page_prefix_type,
		),
		bookEntryPageType: normalizeOptionalString(parsed.book_entry_page_type),
		initialLandingPath: normalizeOptionalString(parsed.initial_landing_path),
		initialLandingSearch: normalizeOptionalString(
			parsed.initial_landing_search,
		),
		initialLandingPagePrefixType: normalizeOptionalString(
			parsed.initial_landing_page_prefix_type,
		),
		initialLandingPageType: normalizeOptionalString(
			parsed.initial_landing_page_type,
		),
		initialReferrer: normalizeOptionalString(parsed.initial_referrer),
		initialReferringDomain: normalizeOptionalString(
			parsed.initial_referring_domain,
		),
		trafficChannel: normalizeOptionalString(parsed.traffic_channel),
		trafficPlatform: normalizeOptionalString(parsed.traffic_platform),
		trafficSourceDetail: normalizeOptionalString(parsed.traffic_source_detail),
		utmSource: normalizeOptionalString(parsed.utm_source),
		utmMedium: normalizeOptionalString(parsed.utm_medium),
		utmCampaign: normalizeOptionalString(parsed.utm_campaign),
		utmTerm: normalizeOptionalString(parsed.utm_term),
		utmContent: normalizeOptionalString(parsed.utm_content),
		gclid: normalizeOptionalString(parsed.gclid),
		gbraid: normalizeOptionalString(parsed.gbraid),
		wbraid: normalizeOptionalString(parsed.wbraid),
		fbclid: normalizeOptionalString(parsed.fbclid),
		msclkid: normalizeOptionalString(parsed.msclkid),
		rawProperties: JSON.stringify(parsed),
	}

	const record = existing
		? await db.callTrackingSessionAttribution.update({
				where: { id: existing.id },
				data: {
					...omitNullish(data),
					pageviewCount: { increment: 1 },
				},
				select: { id: true },
			})
		: await db.callTrackingSessionAttribution.create({
				data: {
					...data,
					occurredAt,
				},
				select: { id: true },
			})

	return {
		ok: true,
		call_tracking_session_attribution_id: record.id,
	}
}

async function findExistingCallTrackingSessionAttribution(
	input: CallTrackingSessionAttributionInput,
	db: DbLike,
) {
	const posthogSessionId = normalizeOptionalString(input.posthog_session_id)
	const callrailSessionId = normalizeOptionalString(input.callrail_session_id)
	const callrailVisitorId = normalizeOptionalString(input.callrail_visitor_id)
	const posthogDistinctId = normalizeOptionalString(input.posthog_distinct_id)

	const or = [
		posthogSessionId && callrailSessionId
			? { posthogSessionId, callrailSessionId }
			: null,
		posthogSessionId ? { posthogSessionId } : null,
		callrailSessionId && callrailVisitorId
			? { callrailSessionId, callrailVisitorId }
			: null,
		callrailSessionId ? { callrailSessionId } : null,
		posthogDistinctId && callrailVisitorId
			? { posthogDistinctId, callrailVisitorId }
			: null,
	].filter(Boolean)

	if (or.length === 0) return null
	return db.callTrackingSessionAttribution.findFirst({
		where: { OR: or },
		orderBy: { lastSeenAt: 'desc' },
		select: { id: true },
	})
}

function normalizeOptionalString(value?: string | null) {
	const trimmed = value?.trim()
	return trimmed ? trimmed : null
}

function omitNullish<T extends Record<string, unknown>>(data: T) {
	return Object.fromEntries(
		Object.entries(data).filter(
			([key, value]) =>
				key !== 'occurredAt' && value !== null && value !== undefined,
		),
	) as Partial<T>
}
