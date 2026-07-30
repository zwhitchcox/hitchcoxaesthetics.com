/**
 * How a booked appointment becomes expected dollars (projection model
 * daily_v4_perkept).
 *
 * WHY v4 EXISTS. v1/v2 valued a service at the average of its PAID tickets and
 * then, for services where fewer than half of kept visits collected money,
 * fell back to revenue ÷ kept visits. Both denominators were counted over a
 * 365-day appointment history — but Boulevard only holds orders back to the
 * March 2026 migration, and appointments were backfilled to June 2024. So 58%
 * of the "kept visits" in the denominator sat in a period where no revenue
 * could exist. Two things broke at once:
 *
 *   1. revenue ÷ kept-visits was deflated by ~2.4x, and
 *   2. paid ÷ kept-visits looked like "under 50% collect" for nearly every
 *      service, so that deflated path fired on 15 of 17 services when it
 *      should have fired on 1.
 *
 * Backtested over 14 complete weeks the old model undershot actual revenue
 * every single week (median actual/predicted 2.2x-3.3x depending on lead).
 * v4 keeps the same idea — a service is worth its revenue per KEPT visit,
 * which correctly prices in no-shows and $0 comp visits — but only ever
 * counts visits inside the window where revenue data actually exists.
 *
 * Everything here is pure so it can be unit tested and shared by the weekly
 * projection and the per-appointment table (which must never disagree).
 */

/** A kept-or-cancelled appointment service segment. */
export type ValuationVisit = {
	clientId: string | null
	day: string
	kept: boolean
	serviceId: string | null
	serviceName: string
}

/** One allocated order line: money that actually landed. */
export type ValuationPayment = {
	clientId: string | null
	day: string
	serviceId: string | null
	serviceName: string
	usd: number
}

export const WL_INJECTION_RE = /weight loss injection/i
export const WL_ANY_RE = /weight loss/i

/**
 * Pseudo-visits at the global average blended into every per-service estimate.
 * Keeps a service seen twice from being priced off two samples without
 * meaningfully moving a service seen fifty times.
 */
export const DEFAULT_SHRINK_K = 3

export function normalizeServiceName(value: string) {
	return value
		.toLowerCase()
		.replace(/®/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

export function serviceKey(
	serviceId: string | null | undefined,
	serviceName: string,
) {
	return serviceId
		? `service:${serviceId}`
		: `name:${normalizeServiceName(serviceName)}`
}

/**
 * First day revenue data can be trusted.
 *
 * The Boulevard migration closed ~2,000 legacy orders on a single day, all at
 * $0. Counting visits from before real money started flowing is exactly the
 * bug v4 exists to fix, so coverage starts at the first day that actually
 * collected money — and any single day holding a large pile of $0 orders is
 * treated as the migration dump rather than a real trading day.
 */
export function detectRevenueCoverageStart(
	payments: Array<{ day: string; usd: number }>,
): string | null {
	const paying = payments.filter(p => p.usd > 0).map(p => p.day).sort()
	return paying[0] ?? null
}

/**
 * Revenue per KEPT visit, per service, shrunk toward the global average.
 *
 * Counting every kept visit (not just the ones that paid) is what makes this
 * an unbiased expectation: a service where a quarter of visits are no-shows or
 * comped is genuinely worth a quarter less per booking.
 */
export function buildServiceValues({
	payments,
	shrinkK = DEFAULT_SHRINK_K,
	visits,
}: {
	payments: ValuationPayment[]
	shrinkK?: number
	visits: ValuationVisit[]
}) {
	const keptByKey = new Map<string, number>()
	const keptByName = new Map<string, number>()
	for (const visit of visits) {
		if (!visit.kept) continue
		const key = serviceKey(visit.serviceId, visit.serviceName)
		keptByKey.set(key, (keptByKey.get(key) ?? 0) + 1)
		const name = normalizeServiceName(visit.serviceName)
		keptByName.set(name, (keptByName.get(name) ?? 0) + 1)
	}

	const paidByKey = new Map<string, { count: number; usd: number }>()
	const paidByName = new Map<string, { count: number; usd: number }>()
	let globalUsd = 0
	for (const payment of payments) {
		const key = serviceKey(payment.serviceId, payment.serviceName)
		const entry = paidByKey.get(key) ?? { count: 0, usd: 0 }
		entry.count += 1
		entry.usd += payment.usd
		paidByKey.set(key, entry)
		const name = normalizeServiceName(payment.serviceName)
		const byName = paidByName.get(name) ?? { count: 0, usd: 0 }
		byName.count += 1
		byName.usd += payment.usd
		paidByName.set(name, byName)
		globalUsd += payment.usd
	}

	const globalKept = [...keptByKey.values()].reduce((sum, n) => sum + n, 0)
	const prior = globalKept > 0 ? globalUsd / globalKept : 0

	function lookup(serviceId: string | null, serviceName: string): number {
		const key = serviceKey(serviceId, serviceName)
		const name = normalizeServiceName(serviceName)
		// Orders and appointments name the same service differently ("| *In
		// Person*" vs "(In Person)"), so fall back to the normalized name.
		const kept = keptByKey.get(key) ?? keptByName.get(name) ?? 0
		const paid = paidByKey.get(key) ?? paidByName.get(name)
		if (!paid) return (shrinkK * prior) / (kept + shrinkK)
		// A service can collect on days it wasn't booked (package top-ups), so
		// never divide by fewer visits than there were payments.
		const denominator = Math.max(kept, paid.count)
		return (paid.usd + shrinkK * prior) / (denominator + shrinkK)
	}

	return { lookup, prior }
}

/**
 * Weight-loss clients are priced off their own history, because the spread is
 * enormous: weekly shot clients pay ~$85 a visit, monthly renewers ~$400 once
 * a month, and package clients $0 at the till.
 *
 * v2 tried to simulate WHICH visit a renewal lands on, which made a single
 * week nearly a coin flip. v4 spreads a client's observed payments across
 * their observed visits instead, which is the same total over a month but far
 * steadier week to week — and unbiased, which the simulation was not.
 */
export function buildWeightLossClientValues({
	payments,
	shrinkK = DEFAULT_SHRINK_K,
	visits,
}: {
	payments: ValuationPayment[]
	shrinkK?: number
	visits: ValuationVisit[]
}) {
	const visitsByClient = new Map<string, number>()
	let injectionVisits = 0
	for (const visit of visits) {
		if (!visit.kept || !WL_INJECTION_RE.test(visit.serviceName)) continue
		injectionVisits += 1
		if (!visit.clientId) continue
		visitsByClient.set(visit.clientId, (visitsByClient.get(visit.clientId) ?? 0) + 1)
	}

	const usdByClient = new Map<string, number>()
	// One payment EVENT per client-day: an order can split into several weight
	// loss lines, and "paid $500 on the 3rd" is one event, not three.
	const payDaysByClient = new Map<string, Set<string>>()
	let injectionUsd = 0
	for (const payment of payments) {
		if (!WL_ANY_RE.test(payment.serviceName) || payment.usd <= 0) continue
		if (WL_INJECTION_RE.test(payment.serviceName)) injectionUsd += payment.usd
		if (!payment.clientId) continue
		usdByClient.set(payment.clientId, (usdByClient.get(payment.clientId) ?? 0) + payment.usd)
		const days = payDaysByClient.get(payment.clientId) ?? new Set<string>()
		days.add(payment.day)
		payDaysByClient.set(payment.clientId, days)
	}

	const prior = injectionVisits > 0 ? injectionUsd / injectionVisits : 0

	function lookup(clientId: string | null): number {
		if (!clientId) return prior
		const visitCount = visitsByClient.get(clientId) ?? 0
		if (visitCount === 0) return prior
		const usd = usdByClient.get(clientId) ?? 0
		return (usd + shrinkK * prior) / (visitCount + shrinkK)
	}

	/**
	 * Why a client is worth what they are worth, for the per-appointment
	 * table's plain-English reason column. This is a description of the same
	 * arithmetic `lookup` does, NOT a second model: v4 deliberately does not
	 * predict WHICH visit a renewal lands on (v2 did, and it made a single week
	 * close to a coin flip), so there is no "this visit is the renewal" kind.
	 */
	function describe(clientId: string | null) {
		const visitCount = clientId ? (visitsByClient.get(clientId) ?? 0) : 0
		const payCount = clientId ? (payDaysByClient.get(clientId)?.size ?? 0) : 0
		const kind: WeightLossClientKind =
			visitCount === 0
				? 'new_client'
				: payCount === 0
					? 'never_pays'
					: payCount / visitCount >= PAYS_EVERY_VISIT_RATIO
						? 'per_visit'
						: 'spread'
		return { kind, payCount, visitCount, usdPerVisit: lookup(clientId) }
	}

	return { describe, lookup, prior }
}

/** payments ÷ visits at or above this means the client pays every time. */
const PAYS_EVERY_VISIT_RATIO = 0.7

export type WeightLossClientKind =
	/** No visit history yet: valued at the injection prior. */
	| 'new_client'
	/** Visits on record, never paid at the till: package or comp. */
	| 'never_pays'
	/** Pays at essentially every visit. */
	| 'per_visit'
	/** Pays less often than they visit, so each visit carries a share. */
	| 'spread'

/** Lead-day buckets for the survival curve; a lead falls in the largest bucket at or below it. */
const LEAD_BUCKETS = [0, 1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90]
const MIN_BUCKET_SAMPLE = 10
const FALLBACK_KEPT_PROBABILITY = 0.8

function bucketForLead(leadDays: number) {
	let bucket = LEAD_BUCKETS[0]!
	for (const candidate of LEAD_BUCKETS) if (candidate <= leadDays) bucket = candidate
	return bucket
}

/**
 * P(appointment is kept | it is on the books this many days out).
 *
 * A flat cancellation rate is wrong in both directions: something booked for
 * tomorrow almost always happens, something booked six weeks out often
 * doesn't. An appointment booked L days ahead was "on the books" at every lead
 * from 0 to L, so it informs every bucket up to its own.
 */
export function buildKeptProbability(
	appointments: Array<{ cancelled: boolean; leadDays: number }>,
) {
	const buckets = new Map<number, { kept: number; total: number }>()
	for (const appointment of appointments) {
		if (!Number.isFinite(appointment.leadDays) || appointment.leadDays < 0) continue
		for (const bucket of LEAD_BUCKETS) {
			if (bucket > appointment.leadDays) continue
			const entry = buckets.get(bucket) ?? { kept: 0, total: 0 }
			entry.total += 1
			if (!appointment.cancelled) entry.kept += 1
			buckets.set(bucket, entry)
		}
	}
	return function keptProbability(leadDays: number): number {
		const entry = buckets.get(bucketForLead(Math.max(0, leadDays)))
		if (!entry || entry.total < MIN_BUCKET_SAMPLE) return FALLBACK_KEPT_PROBABILITY
		return entry.kept / entry.total
	}
}
