/**
 * The app-side half of the v4 valuation (model daily_v4_perkept).
 *
 * `scripts/blvd-project-weekly-revenue.ts` builds the same tables for the
 * weekly forecast. This module builds them for request-time callers (the
 * per-appointment table and the revenue-by-source rollups) so the two surfaces
 * quote the SAME dollar figure for the same visit. Both read Boulevard and
 * both call the pure functions in app/utils/revenue-valuation.server.ts; only
 * the plumbing and the caching differ.
 *
 * The denominator is the reason this module exists at all: a service is worth
 * its revenue per KEPT visit, and the count of kept visits cannot be derived
 * from revenue rows alone (a visit that collected nothing leaves no row). It
 * has to come from the appointment side.
 */
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	buildServiceValues,
	buildWeightLossClientValues,
	WL_INJECTION_RE,
	type ValuationPayment,
	type ValuationVisit,
	type WeightLossClientKind,
} from '#app/utils/revenue-valuation.server.ts'

/** Rebuilt at most this often; the inputs only move when a sync lands. */
const CACHE_TTL_MS = 30 * 60 * 1000
const MAX_PAGES_PER_LOCATION = 40

export type AppointmentValuation = {
	coverageStart: Date | null
	/** Expected dollars for one service segment of a visit. */
	valueSegment: (input: {
		clientId: string | null
		serviceId?: string | null
		serviceName: string
	}) => number
	/** Why a weight-loss client is worth what they are worth, for the UI. */
	describeWeightLossClient: (clientId: string | null) => {
		kind: WeightLossClientKind
		payCount: number
		visitCount: number
		usdPerVisit: number
	}
}

let cached: { at: number; value: AppointmentValuation } | null = null
let inFlight: Promise<AppointmentValuation> | null = null

export function __resetAppointmentValuationCache() {
	cached = null
	inFlight = null
}

export async function getAppointmentValuation(
	now = new Date(),
): Promise<AppointmentValuation> {
	if (cached && now.getTime() - cached.at < CACHE_TTL_MS) return cached.value
	// Concurrent loaders on the same request wave share one rebuild.
	inFlight ??= buildAppointmentValuation(now)
		.then(value => {
			cached = { at: now.getTime(), value }
			return value
		})
		.finally(() => {
			inFlight = null
		})
	return await inFlight
}

async function buildAppointmentValuation(
	now: Date,
): Promise<AppointmentValuation> {
	// Payments come from Boulevard, NOT from the synced BlvdRevenueItem
	// archive, so this matches the weekly projection exactly. The archive is a
	// rolling sync and can lag or start late (as of 2026-07-27 production held
	// nothing before 2026-05-04 while Boulevard goes back to 2026-03-23), which
	// would quietly give the two surfaces different history windows and so
	// different dollars for the same visit. The archive stays the fallback.
	const revenueRows = await listPaymentRows(now).catch(async error => {
		console.error('Boulevard order pull failed, falling back to the archive', error)
		return await listPaymentRowsFromArchive()
	})

	// Revenue coverage starts the first day money actually landed. Before the
	// March 2026 Boulevard migration there are appointments but no orders, and
	// counting those visits would deflate every average (the v2 bug). The
	// migration itself closed ~2,000 legacy orders at $0 on one day, so "first
	// row" is not good enough - it has to be the first row that collected.
	const coverageStart = revenueRows
		.filter(row => row.grossAmountUsd > 0)
		.reduce<Date | null>(
			(earliest, row) =>
				!earliest || row.occurredAt < earliest ? row.occurredAt : earliest,
			null,
		)
	if (!coverageStart) {
		// No revenue synced yet: no honest valuation is possible, so quote $0
		// rather than inventing numbers from an empty denominator.
		return {
			coverageStart: null,
			valueSegment: () => 0,
			describeWeightLossClient: () => ({
				kind: 'new_client',
				payCount: 0,
				visitCount: 0,
				usdPerVisit: 0,
			}),
		}
	}

	const visits = await listKeptVisits(coverageStart, now)
	const payments = allocateToServiceLines(
		revenueRows.filter(row => row.occurredAt >= coverageStart),
	)

	const serviceValues = buildServiceValues({ payments, visits })
	const weightLossValues = buildWeightLossClientValues({ payments, visits })

	return {
		coverageStart,
		valueSegment: ({ clientId, serviceId, serviceName }) =>
			WL_INJECTION_RE.test(serviceName)
				? weightLossValues.lookup(clientId)
				: serviceValues.lookup(serviceId ?? null, serviceName),
		describeWeightLossClient: weightLossValues.describe,
	}
}

/** The shape both the Boulevard pull and the archive fallback produce. */
type PaymentRow = {
	boulevardAppointmentId: string | null
	boulevardClientId: string | null
	grossAmountUsd: number
	itemName: string
	itemType: string | null
	occurredAt: Date
}

/** How far back to pull orders; matches the projection's history window. */
const REVENUE_HISTORY_DAYS = 365

/** Closed-order lines from Boulevard, the same source the projection reads. */
async function listPaymentRows(now: Date): Promise<PaymentRow[]> {
	const start = new Date(now.getTime() - REVENUE_HISTORY_DAYS * 86400_000)
	const locations = await listBlvdAdminLocations()
	const rows: PaymentRow[] = []
	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < MAX_PAGES_PER_LOCATION; page += 1) {
			const response: any = await boulevardAdminFetch(
				`query ValuationOrders($after: String, $locationId: ID!) {
					orders(first: 100, after: $after, locationId: $locationId) {
						pageInfo { endCursor hasNextPage }
						edges { node {
							id clientId closedAt
							lineGroups {
								__typename id
								lines {
									__typename id currentPrice currentSubtotal
									... on OrderServiceLine { name serviceId }
									... on OrderProductLine { name }
								}
							}
						} }
					}
				}`,
				{ after, locationId: location.id },
			)
			const orders = (response.orders?.edges ?? [])
				.map((edge: any) => edge?.node)
				.filter((node: any) => node?.id)
			if (orders.length === 0) break

			let oldest: Date | null = null
			for (const order of orders) {
				if (!order.closedAt) continue
				const occurredAt = new Date(order.closedAt)
				if (!oldest || occurredAt < oldest) oldest = occurredAt
				if (occurredAt < start) continue
				for (const group of order.lineGroups ?? []) {
					// Appointment groups only: retail is not something a booked
					// slot predicts, and the projection scopes it the same way.
					if (group.__typename !== 'OrderAppointmentLineGroup') continue
					for (const line of group.lines ?? []) {
						rows.push({
							boulevardAppointmentId: group.id ?? null,
							boulevardClientId: order.clientId ?? null,
							grossAmountUsd:
								(line.currentSubtotal ?? line.currentPrice ?? 0) / 100,
							itemName: line.name ?? 'Unknown service',
							itemType:
								line.__typename === 'OrderServiceLine' || line.serviceId
									? 'service'
									: 'product',
							occurredAt,
						})
					}
				}
			}
			// Orders come back newest first, so once a page predates the window
			// there is nothing older worth paging for.
			if (oldest && oldest < start) break
			const pageInfo = response.orders?.pageInfo
			if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break
			after = pageInfo.endCursor
		}
	}
	return rows
}

/** Fallback when Boulevard is unreachable: the synced archive. */
async function listPaymentRowsFromArchive(): Promise<PaymentRow[]> {
	return await prisma.blvdRevenueItem.findMany({
		where: { boulevardAppointmentId: { not: null } },
		select: {
			boulevardAppointmentId: true,
			boulevardClientId: true,
			grossAmountUsd: true,
			itemName: true,
			itemType: true,
			occurredAt: true,
		},
	})
}

/**
 * Turn per-line revenue rows into per-service payments the same way
 * `buildRevenueSamplesForOrder` does in the projection script, so both models
 * are fed the identical shape.
 *
 * The whole appointment's takings are attributed to its SERVICE lines: a
 * moisturiser rung up at the same checkout is revenue that visit produced, and
 * the projection counts it that way too. Gratuity is excluded, because it sits
 * on the order summary rather than in a line group and so never reaches the
 * projection's totals either.
 */
function allocateToServiceLines(items: PaymentRow[]): ValuationPayment[] {
	const byAppointment = new Map<string, PaymentRow[]>()
	for (const item of items) {
		if (!item.boulevardAppointmentId) continue
		if (item.itemType === 'gratuity') continue
		const group = byAppointment.get(item.boulevardAppointmentId) ?? []
		group.push(item)
		byAppointment.set(item.boulevardAppointmentId, group)
	}

	const payments: ValuationPayment[] = []
	for (const group of byAppointment.values()) {
		const groupTotal = group.reduce((sum, i) => sum + i.grossAmountUsd, 0)
		if (groupTotal <= 0) continue
		const serviceLines = group.filter(i => i.itemType === 'service')
		if (serviceLines.length === 0) continue
		const serviceTotal = serviceLines.reduce((sum, i) => sum + i.grossAmountUsd, 0)
		for (const line of serviceLines) {
			const usd =
				serviceTotal > 0
					? (groupTotal * line.grossAmountUsd) / serviceTotal
					: groupTotal / serviceLines.length
			payments.push({
				clientId: line.boulevardClientId,
				day: line.occurredAt.toISOString().slice(0, 10),
				// BlvdRevenueItem stores the line name, not the service id; the
				// shared lookup falls back to the normalized name, which is why
				// order names like "(In Person)" still match appointment names
				// like "| *In Person*".
				serviceId: null,
				serviceName: line.itemName,
				usd,
			})
		}
	}
	return payments
}

/** Every appointment service segment since revenue coverage began. */
async function listKeptVisits(
	coverageStart: Date,
	now: Date,
): Promise<ValuationVisit[]> {
	const locations = await listBlvdAdminLocations()
	const visits: ValuationVisit[] = []
	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < MAX_PAGES_PER_LOCATION; page += 1) {
			const response: any = await boulevardAdminFetch(
				`query ValuationVisits($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId,
						query: "startAt >= '${coverageStart.toISOString()}' AND startAt <= '${now.toISOString()}'") {
						pageInfo { endCursor hasNextPage }
						edges { node {
							id startAt cancelled
							client { id }
							appointmentServices { service { id name } }
						} }
					}
				}`,
				{ after, locationId: location.id },
			)
			const nodes = (response.appointments?.edges ?? [])
				.map((edge: any) => edge?.node)
				.filter((node: any) => node?.id)
			if (nodes.length === 0) break
			for (const node of nodes) {
				for (const segment of node.appointmentServices ?? []) {
					visits.push({
						clientId: node.client?.id ?? null,
						day: new Date(node.startAt).toISOString().slice(0, 10),
						kept: node.cancelled !== true,
						serviceId: segment.service?.id ?? null,
						serviceName: segment.service?.name ?? 'Unknown service',
					})
				}
			}
			const pageInfo = response.appointments?.pageInfo
			if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break
			after = pageInfo.endCursor
		}
	}
	return visits
}
