import { getBookingAnalyticsExclusionReason } from '#app/utils/analytics-exclusions.ts'
import { getCallRailAccountIds } from '#app/utils/callrail-booking.server.ts'
import {
	isConversionCall,
	listRecentCallRailCalls,
	parseMoneyValue,
	type CallRailConversionCall,
} from '#app/utils/callrail-posthog-conversions.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	GA4_MEASUREMENT_PROTOCOL_MAX_EVENT_AGE_MS,
	getGa4MeasurementProtocolConfig,
	sendGa4PurchaseEvent,
} from '#app/utils/ga4-measurement-protocol.server.ts'


type DbLike = typeof prisma

export type SyncCallRailPhoneConversionsToGa4Options = {
	accountIds?: string[]
	db?: DbLike
	dryRun?: boolean
	fetchImpl?: typeof fetch
	limit?: number
	now?: Date
	since?: Date
	until?: Date
}

/**
 * Sends converted CallRail phone calls (calls matched to a booking, whose
 * CallRail value holds the projected revenue) to GA4 as purchase events —
 * the phone analog of the website booking's client-side gtag purchase.
 *
 * Attribution works by joining the call back onto the originating web
 * session: the call's gclid (or CallRail session/visitor id) is matched to a
 * CallTrackingSessionAttribution row, whose stored GA client_id/session_id
 * let GA4 attribute the purchase to the original ad click.
 */
export async function syncCallRailPhoneConversionsToGa4(
	options: SyncCallRailPhoneConversionsToGa4Options = {},
) {
	const db = options.db ?? prisma
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) {
		return { ok: false as const, error: 'missing_callrail_api_key' }
	}
	if (!options.dryRun && !getGa4MeasurementProtocolConfig()) {
		return {
			ok: false as const,
			error: 'missing_ga4_measurement_protocol_config',
		}
	}

	const now = options.now ?? new Date()
	const syncWindow = await getSyncWindow(db, options, now)
	const accountIds =
		options.accountIds && options.accountIds.length > 0
			? options.accountIds
			: await getCallRailAccountIds(apiKey)

	const stats = {
		account_count: accountIds.length,
		already_synced: 0,
		dry_run: Boolean(options.dryRun),
		excluded: 0,
		failed: 0,
		scanned: 0,
		sent: 0,
		since: syncWindow.since.toISOString(),
		skipped: 0,
		unmatched: 0,
		until: syncWindow.until.toISOString(),
	}

	for (const accountId of accountIds) {
		const calls = await listRecentCallRailCalls({
			accountId,
			apiKey,
			limit: options.limit,
			since: syncWindow.since,
			until: syncWindow.until,
		})
		stats.scanned += calls.length

		for (const call of calls) {
			if (!isConversionCall(call)) {
				stats.skipped += 1
				continue
			}

			const result = await sendCallRailPhoneConversionToGa4({
				accountId,
				call,
				db,
				dryRun: options.dryRun,
				fetchImpl: options.fetchImpl,
				now,
			})
			if (result.alreadySynced) stats.already_synced += 1
			else if (result.excluded) stats.excluded += 1
			else if (result.unmatched) stats.unmatched += 1
			else if (result.ok) stats.sent += 1
			else stats.failed += 1
		}
	}

	return { ok: true as const, ...stats }
}

export async function sendCallRailPhoneConversionToGa4({
	accountId,
	call,
	db = prisma,
	dryRun = false,
	fetchImpl,
	now = new Date(),
}: {
	accountId: string
	call: CallRailConversionCall
	db?: DbLike
	dryRun?: boolean
	fetchImpl?: typeof fetch
	now?: Date
}) {
	const callId = typeof call.id === 'string' ? call.id.trim() : ''
	if (!callId) {
		return { ok: false as const, error: 'missing_call_id' }
	}

	const existing = await db.ga4PhoneConversion.findUnique({
		where: { callrailCallId: callId },
		select: { id: true },
	})
	if (existing) {
		return { ok: true as const, alreadySynced: true as const }
	}

	const exclusionReason = getBookingAnalyticsExclusionReason({
		phones: [call.customer_phone_number, call.formatted_customer_phone_number],
	})
	if (exclusionReason) {
		return { ok: true as const, excluded: true as const, exclusionReason }
	}

	const gclid = pickOptionalString(call.gclid)
	const session = await findGaSessionForCall({ call, db, gclid })
	if (!session?.gaClientId) {
		return { ok: true as const, unmatched: true as const }
	}

	const callStartedAt = parseDateString(call.start_time) ?? now
	if (
		now.getTime() - callStartedAt.getTime() >
		GA4_MEASUREMENT_PROTOCOL_MAX_EVENT_AGE_MS
	) {
		// GA4 drops events older than ~72h — nothing we send will attribute.
		return { ok: true as const, unmatched: true as const }
	}

	const valueUsd = parseMoneyValue(call.value)

	if (dryRun) {
		return {
			ok: true as const,
			dryRun: true as const,
			gaClientId: session.gaClientId,
			valueUsd,
		}
	}

	const result = await sendGa4PurchaseEvent(
		{
			clientId: session.gaClientId,
			sessionId: session.gaSessionId,
			transactionId: `callrail:${callId}`,
			valueUsd,
			occurredAt: callStartedAt,
			extraParams: {
				conversion_channel: 'phone',
				callrail_call_id: callId,
			},
		},
		undefined,
		fetchImpl,
	)
	if (!result.ok) {
		return { ok: false as const, error: result.error }
	}

	await db.ga4PhoneConversion.create({
		data: {
			callrailCallId: callId,
			callrailAccountId: accountId,
			gclid,
			gaClientId: session.gaClientId,
			gaSessionId: session.gaSessionId,
			attributionMatch: session.match,
			valueUsd,
			callStartedAt,
			sentAt: now,
		},
		select: { id: true },
	})

	return { ok: true as const, sent: true as const, valueUsd }
}

async function findGaSessionForCall({
	call,
	db,
	gclid,
}: {
	call: CallRailConversionCall
	db: DbLike
	gclid: string | null
}) {
	const callrailSessionId = pickOptionalString(call.session_uuid)
	const callrailVisitorId = pickOptionalString(call.person_id)

	const candidates = [
		gclid ? { match: 'gclid', where: { gclid } } : null,
		callrailSessionId
			? { match: 'callrail_session', where: { callrailSessionId } }
			: null,
		callrailVisitorId
			? { match: 'callrail_visitor', where: { callrailVisitorId } }
			: null,
	].filter(Boolean)

	for (const candidate of candidates) {
		const session = await db.callTrackingSessionAttribution.findFirst({
			where: { ...candidate.where, gaClientId: { not: null } },
			orderBy: { lastSeenAt: 'desc' },
			select: { gaClientId: true, gaSessionId: true },
		})
		if (session?.gaClientId) {
			return { ...session, match: candidate.match }
		}
	}

	return null
}

async function getSyncWindow(
	_db: DbLike,
	options: SyncCallRailPhoneConversionsToGa4Options,
	now: Date,
) {
	if (options.since) {
		return { since: options.since, until: options.until ?? now }
	}

	// Re-scan the full backdating window every run: calls get tagged as
	// conversions days late, and GA4 drops events older than ~72h anyway.
	// The Ga4PhoneConversion table dedupes already-sent calls.
	return {
		since: new Date(now.getTime() - GA4_MEASUREMENT_PROTOCOL_MAX_EVENT_AGE_MS),
		until: options.until ?? now,
	}
}

function parseDateString(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) return null
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function pickOptionalString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}
