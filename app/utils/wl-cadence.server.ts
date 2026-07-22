/**
 * Per-client weight-loss visit valuation (projection model daily_v2_cadence).
 *
 * Weight-loss patients follow one of three real-world patterns (verified
 * against 90 days of Boulevard orders, 2026-07-22):
 *   - monthly payers: ~1 visit / month, pay $250–600 each visit
 *   - weekly payers: 2–4 visits / month, pay $50–130 per shot
 *   - package/comp clients: visit but pay $0 at the till
 * The v1 model valued every booked visit at the average of PAYING visits
 * only, so a weekly $85 shot client booked on a Tuesday was "expected" to
 * bring the monthly-payer average. This module values each visit from that
 * client's own history instead.
 */

export const WL_INJECTION_RE = /weight loss injection/i
export const WL_ANY_RE = /weight loss/i

const DAY_MS = 24 * 60 * 60 * 1000
/** A payment counts as "due" this many days before the median interval. */
const DUE_TOLERANCE_DAYS = 3
/** payments ÷ visits at or above this = the client pays every visit. */
const PAYS_EVERY_VISIT_RATIO = 0.7
/** Without visit history, payments closer together than this imply per-visit
 * payers; wider gaps imply monthly renewals whose off weeks owe $0. */
const PAYMENTS_ONLY_MONTHLY_MIN_INTERVAL_DAYS = 21

export type WlPayment = { clientId: string; atMs: number; usd: number }
export type WlVisit = { clientId: string; atMs: number }

export type WlClientProfile = {
	visitCount: number
	payCount: number
	avgPaidUsd: number
	medPayIntervalDays: number | null
	lastPaidMs: number | null
	paysEveryVisit: boolean
}

function median(sorted: number[]): number | null {
	if (sorted.length === 0) return null
	return sorted[Math.floor(sorted.length / 2)] ?? null
}

export function buildWlProfiles(
	payments: WlPayment[],
	visits: WlVisit[],
): Map<string, WlClientProfile> {
	const payByClient = new Map<string, Array<{ atMs: number; usd: number }>>()
	for (const p of payments) {
		if (!payByClient.has(p.clientId)) payByClient.set(p.clientId, [])
		payByClient.get(p.clientId)!.push({ atMs: p.atMs, usd: p.usd })
	}
	const visitCountByClient = new Map<string, number>()
	for (const v of visits) {
		visitCountByClient.set(
			v.clientId,
			(visitCountByClient.get(v.clientId) ?? 0) + 1,
		)
	}

	const profiles = new Map<string, WlClientProfile>()
	for (const clientId of new Set([
		...payByClient.keys(),
		...visitCountByClient.keys(),
	])) {
		const pays = (payByClient.get(clientId) ?? []).sort(
			(a, b) => a.atMs - b.atMs,
		)
		const visitCount = visitCountByClient.get(clientId) ?? 0
		const intervals: number[] = []
		for (let i = 1; i < pays.length; i++) {
			intervals.push((pays[i]!.atMs - pays[i - 1]!.atMs) / DAY_MS)
		}
		const total = pays.reduce((s, p) => s + p.usd, 0)
		const medPayIntervalDays = median(intervals.sort((a, b) => a - b))
		profiles.set(clientId, {
			visitCount,
			payCount: pays.length,
			avgPaidUsd: pays.length ? total / pays.length : 0,
			medPayIntervalDays,
			lastPaidMs: pays.at(-1)?.atMs ?? null,
			// With visit history, the direct signal; without it (payments-only
			// callers pass visits = []), tight payment spacing implies a per-visit
			// payer and wide spacing a monthly renewer.
			paysEveryVisit:
				visitCount > 0
					? pays.length / visitCount >= PAYS_EVERY_VISIT_RATIO
					: medPayIntervalDays == null ||
						medPayIntervalDays < PAYMENTS_ONLY_MONTHLY_MIN_INTERVAL_DAYS,
		})
	}
	return profiles
}

/**
 * Mutable per-client state for valuing a sequence of future visits in
 * chronological order: once a renewal payment is assigned to one visit, the
 * client's next due date advances so later visits in the window aren't all
 * valued as renewals.
 */
export type WlSimState = Map<string, { nextDueMs: number | null }>

export function valueWlVisit({
	clientId,
	visitAtMs,
	profile,
	fallbackUsd,
	sim,
}: {
	clientId: string | null
	visitAtMs: number
	profile: WlClientProfile | undefined
	/** Service revenue per KEPT visit (all visits, $0 included), new clients. */
	fallbackUsd: number
	sim?: WlSimState
}): { usd: number; kind: 'new_client' | 'per_visit' | 'renewal' | 'mid_cycle' | 'non_paying' } {
	if (!clientId || !profile) return { usd: fallbackUsd, kind: 'new_client' }
	// Seen ≥2 visits, never paid: package/comp, expect nothing.
	if (profile.payCount === 0) {
		return profile.visitCount >= 2
			? { usd: 0, kind: 'non_paying' }
			: { usd: fallbackUsd, kind: 'new_client' }
	}
	if (profile.paysEveryVisit) {
		return { usd: profile.avgPaidUsd, kind: 'per_visit' }
	}

	// Pays less often than they visit: expect their payment only when due.
	const intervalDays = profile.medPayIntervalDays ?? 28
	const state = sim?.get(clientId) ?? {
		nextDueMs:
			profile.lastPaidMs != null
				? profile.lastPaidMs + (intervalDays - DUE_TOLERANCE_DAYS) * DAY_MS
				: null,
	}
	const due = state.nextDueMs == null || visitAtMs >= state.nextDueMs
	if (due) {
		state.nextDueMs = visitAtMs + (intervalDays - DUE_TOLERANCE_DAYS) * DAY_MS
		sim?.set(clientId, state)
		return { usd: profile.avgPaidUsd, kind: 'renewal' }
	}
	sim?.set(clientId, state)
	return { usd: 0, kind: 'mid_cycle' }
}

/** Revenue per kept visit for a service: all visits count, $0 ones included. */
export function revenuePerKeptVisit(totalRevenueUsd: number, keptVisits: number) {
	return keptVisits > 0 ? totalRevenueUsd / keptVisits : 0
}

/**
 * Average first payment across clients, what a NEW patient typically spends
 * on their first paying visit (start packages run higher than the ongoing
 * per-visit price, so new bookings shouldn't be valued at the blended average).
 */
export function avgFirstPaymentUsd(payments: WlPayment[]): number {
	const firstByClient = new Map<string, { atMs: number; usd: number }>()
	for (const p of payments) {
		const current = firstByClient.get(p.clientId)
		if (!current || p.atMs < current.atMs)
			firstByClient.set(p.clientId, { atMs: p.atMs, usd: p.usd })
	}
	const values = [...firstByClient.values()].map(p => p.usd)
	return values.length
		? values.reduce((sum, usd) => sum + usd, 0) / values.length
		: 0
}
