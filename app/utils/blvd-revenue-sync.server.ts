import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import {
	type BoulevardRevenueItemInput,
	boulevardRevenueItemInputSchema,
	upsertBlvdRevenueItem,
} from '#app/utils/blvd-attribution.server.ts'
import { reportCallRailRealRevenueConversion } from '#app/utils/callrail-booking.server.ts'
import { prisma } from '#app/utils/db.server.ts'

const REVENUE_IMPORT_STATE_KEY = 'blvd_revenue_import_last_sync_at'
const CALLRAIL_REAL_REVENUE_STATE_KEY = 'blvd_real_revenue_callrail_last_sync_at'
const DEFAULT_INITIAL_LOOKBACK_DAYS = 30
const DEFAULT_IMPORT_OVERLAP_HOURS = 24
const DEFAULT_CALLRAIL_OVERLAP_HOURS = 6
const ORDER_PAGE_SIZE = 100
const MAX_ORDER_PAGES_PER_LOCATION = 50

type DbLike = typeof prisma

type SyncOptions = {
	db?: DbLike
	dryRun?: boolean
	limit?: number
	now?: Date
	since?: Date
	until?: Date
}

type BlvdOrderPayment = {
	id?: string | null
	orderId?: string | null
	paidAmount?: number | null
	refundAmount?: number | null
}

type BlvdOrderInvoiceAllocation = {
	amountPaid?: number | null
	amountUnpaid?: number | null
	invoiceId?: string | null
	invoiceNumber?: string | null
	refundAmount?: number | null
}

type BlvdOrderLine = {
	__typename?: string | null
	currentDiscountAmount?: number | null
	currentPrice?: number | null
	currentSubtotal?: number | null
	id?: string | null
	initialPrice?: number | null
	initialSubtotal?: number | null
	name?: string | null
	productId?: string | null
	quantity?: number | null
	serviceId?: string | null
	unitListPrice?: number | null
}

type BlvdOrderLineGroup = {
	__typename?: string | null
	id?: string | null
	lines?: BlvdOrderLine[] | null
}

type BlvdOrder = {
	clientId?: string | null
	closedAt?: string | null
	createdAt?: string | null
	id?: string | null
	lineGroups?: BlvdOrderLineGroup[] | null
	locationId?: string | null
	number?: string | null
	paymentGroups?: Array<{
		id?: string | null
		invoiceAllocations?: BlvdOrderInvoiceAllocation[] | null
		payments?: BlvdOrderPayment[] | null
		total?: number | null
		totalPaid?: number | null
		totalUnpaid?: number | null
	}> | null
	summary?: {
		currentDiscountAmount?: number | null
		currentFeeAmount?: number | null
		currentGratuityAmount?: number | null
		currentSubtotal?: number | null
		currentTaxAmount?: number | null
		currentTotal?: number | null
		refundAmount?: number | null
	} | null
	updatedAt?: string | null
}

type BlvdOrdersResponse = {
	orders?: {
		edges?: Array<{
			node?: BlvdOrder | null
		}>
		pageInfo?: BlvdPageInfo | null
	}
}

type BlvdPageInfo = {
	endCursor?: string | null
	hasNextPage?: boolean | null
}

export async function syncBoulevardRealRevenue(
	options: SyncOptions = {},
) {
	const db = options.db ?? prisma
	if (!hasBoulevardAdminEnv()) {
		return {
			ok: false,
			error: 'missing_boulevard_admin_env',
			callrail_reported: 0,
			dry_run: Boolean(options.dryRun),
			imported: 0,
			orders_scanned: 0,
			revenue_items_seen: 0,
		}
	}

	const now = options.now ?? new Date()
	const syncWindow = await getSyncWindow({
		db,
		initialLookbackDays: DEFAULT_INITIAL_LOOKBACK_DAYS,
		overlapHours: DEFAULT_IMPORT_OVERLAP_HOURS,
		since: options.since,
		stateKey: REVENUE_IMPORT_STATE_KEY,
		until: options.until ?? now,
	})
	const importResult = await importBoulevardClosedOrderRevenue({
		db,
		dryRun: options.dryRun,
		limit: options.limit,
		since: syncWindow.since,
		until: syncWindow.until,
	})
	const callRailResult = await syncBlvdRealRevenueToCallRail({
		db,
		dryRun: options.dryRun,
		now,
		since: syncWindow.since,
		until: syncWindow.until,
	})

	if (!options.dryRun) {
		await db.blvdSyncState.upsert({
			where: { key: REVENUE_IMPORT_STATE_KEY },
			create: {
				key: REVENUE_IMPORT_STATE_KEY,
				value: syncWindow.until.toISOString(),
			},
			update: {
				value: syncWindow.until.toISOString(),
			},
		})
	}

	return {
		ok: true,
		callrail_reported: callRailResult.reported,
		callrail_scanned: callRailResult.scanned,
		dry_run: Boolean(options.dryRun),
		imported: importResult.imported,
		locations_scanned: importResult.locationsScanned,
		orders_scanned: importResult.ordersScanned,
		revenue_items_seen: importResult.revenueItemsSeen,
		since: syncWindow.since.toISOString(),
		until: syncWindow.until.toISOString(),
	}
}

export async function importBoulevardClosedOrderRevenue({
	db = prisma,
	dryRun,
	limit,
	since,
	until,
}: {
	db?: DbLike
	dryRun?: boolean
	limit?: number
	since: Date
	until: Date
}) {
	const locations = await listBlvdAdminLocations()
	let imported = 0
	let ordersScanned = 0
	let revenueItemsSeen = 0

	for (const location of locations) {
		if (limit && ordersScanned >= limit) break
		for await (const order of listBlvdClosedOrdersForLocation({
			limit: limit ? Math.max(0, limit - ordersScanned) : undefined,
			locationId: location.id,
			since,
			until,
		})) {
			ordersScanned += 1
			const revenueItems = buildRevenueItemsForOrder(order)
			revenueItemsSeen += revenueItems.length
			if (dryRun) continue

			for (const item of revenueItems) {
				await upsertBlvdRevenueItem(boulevardRevenueItemInputSchema.parse(item), db)
				imported += 1
			}
		}
	}

	return {
		imported,
		locationsScanned: locations.length,
		ordersScanned,
		revenueItemsSeen,
	}
}

export async function syncBlvdRealRevenueToCallRail({
	db = prisma,
	dryRun,
	now = new Date(),
	since,
	until,
}: {
	db?: DbLike
	dryRun?: boolean
	now?: Date
	since?: Date
	until?: Date
} = {}) {
	const syncWindow = await getSyncWindow({
		db,
		initialLookbackDays: DEFAULT_INITIAL_LOOKBACK_DAYS,
		overlapHours: DEFAULT_CALLRAIL_OVERLAP_HOURS,
		since,
		stateKey: CALLRAIL_REAL_REVENUE_STATE_KEY,
		until: until ?? now,
	})
	const touches = await db.blvdAttributionTouch.findMany({
		where: {
			callrailCallId: { not: null },
			revenueItems: {
				some: {
					updatedAt: { gte: syncWindow.since },
				},
			},
		},
		include: {
			blvdClient: true,
			revenueItems: true,
		},
	})
	let reported = 0
	let skipped = 0

	for (const touch of touches) {
		if (!touch.callrailCallId) {
			skipped += 1
			continue
		}
		const totalGrossRevenueUsd = touch.revenueItems.reduce(
			(total, item) => total + item.grossAmountUsd,
			0,
		)
		if (totalGrossRevenueUsd <= 0) {
			skipped += 1
			continue
		}

		if (dryRun) {
			reported += 1
			continue
		}

		const sortedRevenueItems = [...touch.revenueItems].sort(
			(a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
		)
		const result = await reportCallRailRealRevenueConversion({
			attributionTouchId: touch.id,
			bookingCartId: touch.bookingCartId,
			callrailAccountId: touch.callrailAccountId,
			callrailCallId: touch.callrailCallId,
			currency: sortedRevenueItems[0]?.currency,
			customerName: [touch.blvdClient.firstName, touch.blvdClient.lastName]
				.filter(Boolean)
				.join(' '),
			firstRevenueAt: sortedRevenueItems[0]?.occurredAt.toISOString(),
			lastRevenueAt:
				sortedRevenueItems[
					Math.max(0, sortedRevenueItems.length - 1)
				]?.occurredAt.toISOString(),
			revenueItemCount: touch.revenueItems.length,
			serviceNames: [
				...new Set(touch.revenueItems.map(item => item.itemName).filter(Boolean)),
			],
			totalGrossRevenueUsd,
		})
		if (result.ok) reported += 1
		else skipped += 1
	}

	if (!dryRun) {
		await db.blvdSyncState.upsert({
			where: { key: CALLRAIL_REAL_REVENUE_STATE_KEY },
			create: {
				key: CALLRAIL_REAL_REVENUE_STATE_KEY,
				value: syncWindow.until.toISOString(),
			},
			update: {
				value: syncWindow.until.toISOString(),
			},
		})
	}

	return {
		reported,
		scanned: touches.length,
		skipped,
	}
}

export function buildRevenueItemsForOrder(order: BlvdOrder) {
	const orderId = requireString(order.id, 'Boulevard order is missing id')
	const occurredAt =
		parseDateString(order.closedAt) ??
		parseDateString(order.updatedAt) ??
		parseDateString(order.createdAt) ??
		new Date()
	const firstPaymentId = pickFirstPayment(order)?.id ?? undefined
	const firstInvoiceId = pickFirstInvoiceAllocation(order)?.invoiceId ?? undefined
	const revenueItems: BoulevardRevenueItemInput[] = (order.lineGroups ?? []).flatMap(group => {
		const appointmentId = getAppointmentIdForLineGroup(group)
		return (group.lines ?? []).flatMap(line => {
			if (!line.id) return []
			const grossAmountUsd = centsToUsd(
				line.currentSubtotal ?? line.currentPrice ?? 0,
			)
			if (grossAmountUsd === 0) return []
			return [
				{
					boulevardAppointmentId: appointmentId,
					boulevardClientId: order.clientId ?? undefined,
					boulevardInvoiceId: firstInvoiceId,
					boulevardPaymentId: firstPaymentId,
					boulevardSaleId: orderId,
					currency: 'USD',
					discountAmountUsd: centsToUsd(line.currentDiscountAmount ?? 0),
					externalId: `blvd-order-line:${orderId}:${line.id}`,
					grossAmountUsd,
					itemName: line.name ?? line.__typename ?? 'Boulevard line item',
					itemType: getOrderLineItemType(line),
					netAmountUsd: grossAmountUsd,
					occurredAt,
					rawPayload: {
						line,
						lineGroup: {
							__typename: group.__typename,
							id: group.id,
						},
						order: {
							clientId: order.clientId,
							closedAt: order.closedAt,
							id: order.id,
							number: order.number,
							summary: order.summary,
						},
					},
				},
			]
		})
	})

	const gratuityAmountUsd = centsToUsd(order.summary?.currentGratuityAmount ?? 0)
	if (gratuityAmountUsd > 0) {
		const appointmentId = pickSingleAppointmentId(order.lineGroups ?? [])
		revenueItems.push({
			boulevardAppointmentId: appointmentId,
			boulevardClientId: order.clientId ?? undefined,
			boulevardInvoiceId: firstInvoiceId,
			boulevardPaymentId: firstPaymentId,
			boulevardSaleId: orderId,
			currency: 'USD',
			discountAmountUsd: 0,
			externalId: `blvd-order-gratuity:${orderId}`,
			grossAmountUsd: gratuityAmountUsd,
			gratuityAmountUsd,
			itemName: 'Gratuity',
			itemType: 'gratuity',
			netAmountUsd: gratuityAmountUsd,
			occurredAt,
			rawPayload: {
				order: {
					clientId: order.clientId,
					closedAt: order.closedAt,
					id: order.id,
					number: order.number,
					summary: order.summary,
				},
			},
		})
	}

	return revenueItems
}

async function* listBlvdClosedOrdersForLocation({
	limit,
	locationId,
	since,
	until,
}: {
	limit?: number
	locationId: string
	since: Date
	until: Date
}) {
	let after: string | null = null
	let page = 0
	let yielded = 0

	while (page < MAX_ORDER_PAGES_PER_LOCATION) {
		page += 1
		const response: BlvdOrdersResponse =
			await boulevardAdminFetch<BlvdOrdersResponse>(
			`query Orders($after: String, $locationId: ID!) {
				orders(after: $after, first: ${ORDER_PAGE_SIZE}, locationId: $locationId) {
					pageInfo {
						endCursor
						hasNextPage
					}
					edges {
						node {
							clientId
							closedAt
							createdAt
							id
							locationId
							number
							updatedAt
							summary {
								currentDiscountAmount
								currentFeeAmount
								currentGratuityAmount
								currentSubtotal
								currentTaxAmount
								currentTotal
								refundAmount
							}
							lineGroups {
								__typename
								id
								lines {
									__typename
									currentDiscountAmount
									currentPrice
									currentSubtotal
									id
									initialPrice
									initialSubtotal
									quantity
									... on OrderServiceLine {
										name
										serviceId
										unitListPrice
									}
									... on OrderProductLine {
										name
										productId
									}
								}
							}
							paymentGroups {
								id
								total
								totalPaid
								totalUnpaid
								payments {
									__typename
									id
									orderId
									paidAmount
									refundAmount
								}
								invoiceAllocations {
									amountPaid
									amountUnpaid
									invoiceId
									invoiceNumber
									refundAmount
								}
							}
						}
					}
				}
			}`,
			{ after, locationId },
		)
		const orders =
			response.orders?.edges
				?.map((edge: { node?: BlvdOrder | null }) => edge.node)
				.filter((order: BlvdOrder | null | undefined): order is BlvdOrder =>
					Boolean(order?.id),
				) ?? []

		for (const order of orders) {
			const closedAt = parseDateString(order.closedAt)
			if (!closedAt) continue
			if (closedAt > until) continue
			if (closedAt < since) continue
			yield order
			yielded += 1
			if (limit && yielded >= limit) return
		}

		const oldestClosedAt = orders
			.map((order: BlvdOrder) => parseDateString(order.closedAt))
			.filter((date: Date | null): date is Date => Boolean(date))
			.sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]
		if (oldestClosedAt && oldestClosedAt < since) break

		const pageInfo: BlvdPageInfo | null | undefined = response.orders?.pageInfo
		if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break
		after = pageInfo.endCursor
	}
}

async function getSyncWindow({
	db,
	initialLookbackDays,
	overlapHours,
	since,
	stateKey,
	until,
}: {
	db: DbLike
	initialLookbackDays: number
	overlapHours: number
	since?: Date
	stateKey: string
	until: Date
}) {
	if (since) return { since, until }

	const state = await db.blvdSyncState.findUnique({
		where: { key: stateKey },
		select: { value: true },
	})
	const lastSyncedAt = state?.value ? new Date(state.value) : null
	const fallbackSince = new Date(
		until.getTime() - initialLookbackDays * 24 * 60 * 60 * 1000,
	)
	const overlappedSince =
		lastSyncedAt && !Number.isNaN(lastSyncedAt.getTime())
			? new Date(lastSyncedAt.getTime() - overlapHours * 60 * 60 * 1000)
			: fallbackSince

	return {
		since: overlappedSince,
		until,
	}
}

function hasBoulevardAdminEnv() {
	return Boolean(
		process.env.BLVD_API_KEY?.trim() &&
			process.env.BLVD_BUSINESS_ID?.trim() &&
			process.env.BLVD_SECRET_KEY?.trim(),
	)
}

function getAppointmentIdForLineGroup(group: BlvdOrderLineGroup) {
	if (group.__typename !== 'OrderAppointmentLineGroup') return undefined
	if (!group.id) return undefined
	return group.id.startsWith('urn:blvd:Appointment:')
		? group.id
		: `urn:blvd:Appointment:${group.id}`
}

function pickSingleAppointmentId(groups: BlvdOrderLineGroup[]) {
	const appointmentIds = [
		...new Set(groups.map(getAppointmentIdForLineGroup).filter(Boolean)),
	]
	return appointmentIds.length === 1 ? appointmentIds[0] : undefined
}

function getOrderLineItemType(line: BlvdOrderLine) {
	return (
		line.__typename
			?.replace(/^Order/, '')
			.replace(/Line$/, '')
			.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)
			.replace(/^_/, '') ?? 'line_item'
	)
}

function pickFirstPayment(order: BlvdOrder) {
	return order.paymentGroups?.flatMap(group => group.payments ?? [])[0] ?? null
}

function pickFirstInvoiceAllocation(order: BlvdOrder) {
	return (
		order.paymentGroups?.flatMap(group => group.invoiceAllocations ?? [])[0] ??
		null
	)
}

function centsToUsd(value: number) {
	return Number((value / 100).toFixed(2))
}

function parseDateString(value?: string | null) {
	if (!value) return null
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function requireString(value: unknown, message: string) {
	if (typeof value === 'string' && value.trim()) return value.trim()
	throw new Error(message)
}
