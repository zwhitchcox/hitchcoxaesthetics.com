import { z } from 'zod'

import { getMissingBlvdBookingPriceServiceNames } from '#app/utils/blvd-booking-pricing.ts'
import { prisma } from '#app/utils/db.server.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'

const attributionPropertiesSchema = z
	.object({
		book_entry_from_path: z.string().optional(),
		book_entry_page_prefix_type: z.string().optional(),
		book_entry_page_type: z.string().optional(),
		initial_landing_path: z.string().optional(),
		initial_landing_page_prefix_type: z.string().optional(),
		initial_landing_page_type: z.string().optional(),
		initial_referrer: z.string().optional(),
		initial_referring_domain: z.string().optional(),
		traffic_channel: z.string().optional(),
		traffic_platform: z.string().optional(),
		traffic_source_detail: z.string().optional(),
		posthog_distinct_id: z.string().optional(),
		posthog_session_id: z.string().optional(),
		utm_source: z.string().optional(),
		utm_medium: z.string().optional(),
		utm_campaign: z.string().optional(),
		utm_term: z.string().optional(),
		utm_content: z.string().optional(),
		gclid: z.string().optional(),
		gbraid: z.string().optional(),
		wbraid: z.string().optional(),
		fbclid: z.string().optional(),
		msclkid: z.string().optional(),
	})
	.catchall(z.unknown())

const bookingContextSchema = z.object({
	cartId: z.string().min(1).optional(),
	occurredAt: z.string().datetime().optional(),
	locationId: z.string().optional(),
	locationName: z.string().optional(),
	serviceId: z.string().optional(),
	serviceName: z.string().optional(),
	serviceCategory: z.string().optional(),
	selectedPaymentMethodType: z.string().optional(),
	valueUsd: z.number().optional(),
	hasVerifiedClient: z.boolean().optional(),
})

const clientContextSchema = z.object({
	boulevardClientId: z.string().min(1).optional(),
	email: z.string().email().optional(),
	phone: z.string().optional(),
	firstName: z.string().optional(),
	lastName: z.string().optional(),
})

const appointmentContextSchema = z.object({
	appointmentId: z.string().min(1),
	clientId: z.string().min(1).optional(),
	forCartOwner: z.boolean().optional(),
	startTime: z.string().datetime().optional(),
	endTime: z.string().datetime().optional(),
})

export const boulevardBookingAttributionInputSchema = z.object({
	client: clientContextSchema,
	appointments: z.array(appointmentContextSchema).min(1),
	booking: bookingContextSchema,
	attribution: attributionPropertiesSchema.default({}),
})

export type BoulevardBookingAttributionInput = z.infer<
	typeof boulevardBookingAttributionInputSchema
>

export const boulevardRevenueItemInputSchema = z.object({
	externalId: z.string().min(1),
	boulevardClientId: z.string().min(1).optional(),
	boulevardAppointmentId: z.string().min(1).optional(),
	boulevardInvoiceId: z.string().min(1).optional(),
	boulevardPaymentId: z.string().min(1).optional(),
	boulevardSaleId: z.string().min(1).optional(),
	occurredAt: z.coerce.date(),
	itemName: z.string().min(1),
	itemType: z.string().optional(),
	serviceCategory: z.string().optional(),
	grossAmountUsd: z.number(),
	netAmountUsd: z.number().optional(),
	discountAmountUsd: z.number().optional(),
	gratuityAmountUsd: z.number().optional(),
	currency: z.string().default('USD'),
	rawPayload: z.unknown().optional(),
})

export type BoulevardRevenueItemInput = z.infer<
	typeof boulevardRevenueItemInputSchema
>

type DbLike = typeof prisma

function getBookingClientType(hasVerifiedClient?: boolean | null) {
	return hasVerifiedClient ? 'returning_client' : 'new_client'
}

function getBookingClientTypeSource(hasVerifiedClient?: boolean | null) {
	return hasVerifiedClient
		? 'boulevard_sms_ownership'
		: 'default_unverified_booking_path'
}

function normalizeOptionalString(value?: string | null) {
	const trimmed = value?.trim()
	return trimmed ? trimmed : null
}

function normalizeOptionalEmail(value?: string | null) {
	return normalizeOptionalString(value)?.toLowerCase() ?? null
}

function normalizeOptionalPhone(value?: string | null) {
	const trimmed = normalizeOptionalString(value)
	if (!trimmed) return null

	const digits = trimmed.replace(/\D/g, '')
	if (!digits) return null
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (trimmed.startsWith('+')) return trimmed
	return `+${digits}`
}

function parseOccurredAt(value?: string) {
	return value ? new Date(value) : new Date()
}

function serializeRawPayload(value: unknown) {
	return value == null ? null : JSON.stringify(value)
}

async function upsertBlvdClientRecord(
	db: DbLike,
	input: {
		boulevardClientId: string
		email?: string | null
		phone?: string | null
		firstName?: string | null
		lastName?: string | null
		latestTouchAt?: Date | null
	},
) {
	return db.blvdClient.upsert({
		where: { boulevardClientId: input.boulevardClientId },
		create: {
			boulevardClientId: input.boulevardClientId,
			email: normalizeOptionalEmail(input.email),
			phone: normalizeOptionalPhone(input.phone),
			firstName: normalizeOptionalString(input.firstName),
			lastName: normalizeOptionalString(input.lastName),
			latestTouchAt: input.latestTouchAt ?? null,
		},
		update: {
			email: normalizeOptionalEmail(input.email) ?? undefined,
			phone: normalizeOptionalPhone(input.phone) ?? undefined,
			firstName: normalizeOptionalString(input.firstName) ?? undefined,
			lastName: normalizeOptionalString(input.lastName) ?? undefined,
			latestTouchAt: input.latestTouchAt ?? undefined,
		},
	})
}

export async function refreshBlvdBookingPricingAudit(db: DbLike = prisma) {
	const [touchNames, revenueItemNames] = await Promise.all([
		db.blvdAttributionTouch.findMany({
			where: {
				bookingServiceName: { not: null },
			},
			select: {
				bookingServiceName: true,
			},
			distinct: ['bookingServiceName'],
		}),
		db.blvdRevenueItem.findMany({
			select: {
				itemName: true,
			},
			distinct: ['itemName'],
		}),
	])

	const serviceNames = [
		...touchNames.map(item => item.bookingServiceName).filter(Boolean),
		...revenueItemNames.map(item => item.itemName).filter(Boolean),
	] as string[]
	const missingServiceNames =
		getMissingBlvdBookingPriceServiceNames(serviceNames)

	await Promise.all([
		db.blvdSyncState.upsert({
			where: { key: 'blvd_missing_booking_pricing_names' },
			create: {
				key: 'blvd_missing_booking_pricing_names',
				value: JSON.stringify(missingServiceNames),
			},
			update: {
				value: JSON.stringify(missingServiceNames),
			},
		}),
		db.blvdSyncState.upsert({
			where: { key: 'blvd_missing_booking_pricing_count' },
			create: {
				key: 'blvd_missing_booking_pricing_count',
				value: String(missingServiceNames.length),
			},
			update: {
				value: String(missingServiceNames.length),
			},
		}),
	])

	return missingServiceNames
}

export async function resolveBlvdAttributionTouchForRevenueItem(
	db: DbLike,
	input: {
		boulevardClientId: string
		occurredAt: Date
	},
) {
	const client = await db.blvdClient.findUnique({
		where: { boulevardClientId: input.boulevardClientId },
		select: { id: true },
	})

	if (!client) return null

	return db.blvdAttributionTouch.findFirst({
		where: {
			blvdClientId: client.id,
			occurredAt: { lte: input.occurredAt },
		},
		orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
		select: { id: true },
	})
}

export async function recordBoulevardBookingAttributionTouch(
	input: BoulevardBookingAttributionInput,
	db: DbLike = prisma,
) {
	const parsed = boulevardBookingAttributionInputSchema.parse(input)
	const appointmentClientIds = [
		...new Set(parsed.appointments.map(a => a.clientId).filter(Boolean)),
	]
	const boulevardClientId =
		normalizeOptionalString(parsed.client.boulevardClientId) ??
		normalizeOptionalString(appointmentClientIds[0])

	if (!boulevardClientId) {
		throw new Error('Missing Boulevard client ID for attribution touch')
	}

	if (appointmentClientIds.length > 1) {
		throw new Error('Expected one Boulevard client ID per booking checkout')
	}

	const occurredAt = parseOccurredAt(parsed.booking.occurredAt)
	const client = await upsertBlvdClientRecord(db, {
		boulevardClientId,
		email: parsed.client.email,
		phone: parsed.client.phone,
		firstName: parsed.client.firstName,
		lastName: parsed.client.lastName,
		latestTouchAt: occurredAt,
	})

	const rawProperties = serializeRawPayload(parsed.attribution)
	const existingTouch = parsed.booking.cartId
		? await db.blvdAttributionTouch.findUnique({
				where: { bookingCartId: parsed.booking.cartId },
				select: { id: true },
			})
		: null

	const touchData = {
		blvdClientId: client.id,
		occurredAt,
		bookingCartId: normalizeOptionalString(parsed.booking.cartId),
		bookingLocationId: normalizeOptionalString(parsed.booking.locationId),
		bookingLocationName: normalizeOptionalString(parsed.booking.locationName),
		bookingServiceId: normalizeOptionalString(parsed.booking.serviceId),
		bookingServiceName: normalizeOptionalString(parsed.booking.serviceName),
		bookingServiceCategory: normalizeOptionalString(
			parsed.booking.serviceCategory,
		),
		bookingSelectedPaymentType: normalizeOptionalString(
			parsed.booking.selectedPaymentMethodType,
		),
		bookingValueUsd: parsed.booking.valueUsd ?? null,
		bookingHasVerifiedClient: parsed.booking.hasVerifiedClient ?? null,
		appointmentCount: parsed.appointments.length,
		bookEntryFromPath: normalizeOptionalString(
			parsed.attribution.book_entry_from_path,
		),
		bookEntryPagePrefixType: normalizeOptionalString(
			parsed.attribution.book_entry_page_prefix_type,
		),
		bookEntryPageType: normalizeOptionalString(
			parsed.attribution.book_entry_page_type,
		),
		initialLandingPath: normalizeOptionalString(
			parsed.attribution.initial_landing_path,
		),
		initialLandingPagePrefixType: normalizeOptionalString(
			parsed.attribution.initial_landing_page_prefix_type,
		),
		initialLandingPageType: normalizeOptionalString(
			parsed.attribution.initial_landing_page_type,
		),
		initialReferrer: normalizeOptionalString(
			parsed.attribution.initial_referrer,
		),
		initialReferringDomain: normalizeOptionalString(
			parsed.attribution.initial_referring_domain,
		),
		trafficChannel: normalizeOptionalString(parsed.attribution.traffic_channel),
		trafficPlatform: normalizeOptionalString(
			parsed.attribution.traffic_platform,
		),
		trafficSourceDetail: normalizeOptionalString(
			parsed.attribution.traffic_source_detail,
		),
		posthogDistinctId: normalizeOptionalString(
			parsed.attribution.posthog_distinct_id,
		),
		posthogSessionId: normalizeOptionalString(
			parsed.attribution.posthog_session_id,
		),
		utmSource: normalizeOptionalString(parsed.attribution.utm_source),
		utmMedium: normalizeOptionalString(parsed.attribution.utm_medium),
		utmCampaign: normalizeOptionalString(parsed.attribution.utm_campaign),
		utmTerm: normalizeOptionalString(parsed.attribution.utm_term),
		utmContent: normalizeOptionalString(parsed.attribution.utm_content),
		gclid: normalizeOptionalString(parsed.attribution.gclid),
		gbraid: normalizeOptionalString(parsed.attribution.gbraid),
		wbraid: normalizeOptionalString(parsed.attribution.wbraid),
		fbclid: normalizeOptionalString(parsed.attribution.fbclid),
		msclkid: normalizeOptionalString(parsed.attribution.msclkid),
		rawProperties,
	}

	const touch = existingTouch
		? await db.blvdAttributionTouch.update({
				where: { id: existingTouch.id },
				data: touchData,
			})
		: await db.blvdAttributionTouch.create({ data: touchData })

	for (const appointment of parsed.appointments) {
		await db.blvdAttributedAppointment.upsert({
			where: { boulevardAppointmentId: appointment.appointmentId },
			create: {
				boulevardAppointmentId: appointment.appointmentId,
				boulevardClientId: normalizeOptionalString(
					appointment.clientId ?? boulevardClientId,
				),
				startTime: appointment.startTime
					? new Date(appointment.startTime)
					: null,
				endTime: appointment.endTime ? new Date(appointment.endTime) : null,
				touchId: touch.id,
			},
			update: {
				boulevardClientId: normalizeOptionalString(
					appointment.clientId ?? boulevardClientId,
				),
				startTime: appointment.startTime
					? new Date(appointment.startTime)
					: null,
				endTime: appointment.endTime ? new Date(appointment.endTime) : null,
				touchId: touch.id,
			},
		})
	}

	await refreshBlvdBookingPricingAudit(db)

	return {
		blvdClientId: client.id,
		boulevardClientId: client.boulevardClientId,
		touchId: touch.id,
	}
}

async function syncBlvdRevenueItemToPostHog(
	input: { revenueItemId: string },
	db: DbLike,
) {
	const revenueItem = await db.blvdRevenueItem.findUnique({
		where: { id: input.revenueItemId },
		include: {
			blvdClient: true,
			attributionTouch: true,
		},
	})

	if (!revenueItem) return

	const touch = revenueItem.attributionTouch
	const distinctId =
		touch?.posthogDistinctId ??
		revenueItem.boulevardClientId ??
		revenueItem.blvdClient?.boulevardClientId

	if (!distinctId) return

	await captureServerPostHogEvent({
		distinctId,
		event: 'blvd_revenue_recorded',
		insertId: `blvd-revenue:${revenueItem.externalId}:${touch?.id ?? 'unattributed'}`,
		properties: {
			blvd_client_id:
				revenueItem.boulevardClientId ??
				revenueItem.blvdClient?.boulevardClientId ??
				null,
			blvd_invoice_id: revenueItem.boulevardInvoiceId,
			blvd_payment_id: revenueItem.boulevardPaymentId,
			blvd_sale_id: revenueItem.boulevardSaleId,
			blvd_appointment_id: revenueItem.boulevardAppointmentId,
			external_id: revenueItem.externalId,
			gross_amount_usd: revenueItem.grossAmountUsd,
			net_amount_usd: revenueItem.netAmountUsd,
			discount_amount_usd: revenueItem.discountAmountUsd,
			gratuity_amount_usd: revenueItem.gratuityAmountUsd,
			currency: revenueItem.currency,
			item_name: revenueItem.itemName,
			item_type: revenueItem.itemType,
			service_category: revenueItem.serviceCategory,
			attribution_method: revenueItem.attributionMethod,
			traffic_source_detail: touch?.trafficSourceDetail,
			traffic_channel: touch?.trafficChannel,
			traffic_platform: touch?.trafficPlatform,
			book_entry_page_prefix_type: touch?.bookEntryPagePrefixType,
			book_entry_page_type: touch?.bookEntryPageType,
			book_entry_from_path: touch?.bookEntryFromPath,
			initial_landing_path: touch?.initialLandingPath,
			initial_landing_page_prefix_type: touch?.initialLandingPagePrefixType,
			initial_landing_page_type: touch?.initialLandingPageType,
			booking_service_name: touch?.bookingServiceName,
			booking_service_category: touch?.bookingServiceCategory,
			booking_location_name: touch?.bookingLocationName,
			booking_cart_id: touch?.bookingCartId,
			booking_has_verified_client: touch?.bookingHasVerifiedClient,
			booking_client_type: getBookingClientType(
				touch?.bookingHasVerifiedClient,
			),
			booking_client_type_source: getBookingClientTypeSource(
				touch?.bookingHasVerifiedClient,
			),
			utm_source: touch?.utmSource,
			utm_medium: touch?.utmMedium,
			utm_campaign: touch?.utmCampaign,
			utm_term: touch?.utmTerm,
			utm_content: touch?.utmContent,
			gclid: touch?.gclid,
			gbraid: touch?.gbraid,
			wbraid: touch?.wbraid,
			fbclid: touch?.fbclid,
			msclkid: touch?.msclkid,
			posthog_session_id: touch?.posthogSessionId,
		},
		timestamp: revenueItem.occurredAt.toISOString(),
	})
}

export async function upsertBlvdRevenueItem(
	input: BoulevardRevenueItemInput,
	db: DbLike = prisma,
) {
	const parsed = boulevardRevenueItemInputSchema.parse(input)
	const boulevardClientId = normalizeOptionalString(parsed.boulevardClientId)

	const client = boulevardClientId
		? await upsertBlvdClientRecord(db, {
				boulevardClientId,
			})
		: null

	const attributionTouch = boulevardClientId
		? await resolveBlvdAttributionTouchForRevenueItem(db, {
				boulevardClientId,
				occurredAt: parsed.occurredAt,
			})
		: null

	const revenueItem = await db.blvdRevenueItem.upsert({
		where: { externalId: parsed.externalId },
		create: {
			externalId: parsed.externalId,
			boulevardClientId,
			boulevardAppointmentId: normalizeOptionalString(
				parsed.boulevardAppointmentId,
			),
			boulevardInvoiceId: normalizeOptionalString(parsed.boulevardInvoiceId),
			boulevardPaymentId: normalizeOptionalString(parsed.boulevardPaymentId),
			boulevardSaleId: normalizeOptionalString(parsed.boulevardSaleId),
			blvdClientId: client?.id,
			occurredAt: parsed.occurredAt,
			itemName: parsed.itemName,
			itemType: normalizeOptionalString(parsed.itemType),
			serviceCategory: normalizeOptionalString(parsed.serviceCategory),
			grossAmountUsd: parsed.grossAmountUsd,
			netAmountUsd: parsed.netAmountUsd ?? null,
			discountAmountUsd: parsed.discountAmountUsd ?? null,
			gratuityAmountUsd: parsed.gratuityAmountUsd ?? null,
			currency: parsed.currency,
			rawPayload: serializeRawPayload(parsed.rawPayload),
			attributionTouchId: attributionTouch?.id ?? null,
			attributionMethod: attributionTouch
				? 'last_touch_before_revenue'
				: 'unattributed',
			attributedAt: attributionTouch ? new Date() : null,
		},
		update: {
			boulevardClientId,
			boulevardAppointmentId: normalizeOptionalString(
				parsed.boulevardAppointmentId,
			),
			boulevardInvoiceId: normalizeOptionalString(parsed.boulevardInvoiceId),
			boulevardPaymentId: normalizeOptionalString(parsed.boulevardPaymentId),
			boulevardSaleId: normalizeOptionalString(parsed.boulevardSaleId),
			blvdClientId: client?.id,
			occurredAt: parsed.occurredAt,
			itemName: parsed.itemName,
			itemType: normalizeOptionalString(parsed.itemType),
			serviceCategory: normalizeOptionalString(parsed.serviceCategory),
			grossAmountUsd: parsed.grossAmountUsd,
			netAmountUsd: parsed.netAmountUsd ?? null,
			discountAmountUsd: parsed.discountAmountUsd ?? null,
			gratuityAmountUsd: parsed.gratuityAmountUsd ?? null,
			currency: parsed.currency,
			rawPayload: serializeRawPayload(parsed.rawPayload),
			attributionTouchId: attributionTouch?.id ?? null,
			attributionMethod: attributionTouch
				? 'last_touch_before_revenue'
				: 'unattributed',
			attributedAt: attributionTouch ? new Date() : null,
		},
	})

	await refreshBlvdBookingPricingAudit(db)
	await syncBlvdRevenueItemToPostHog({ revenueItemId: revenueItem.id }, db)

	return revenueItem
}

export async function reconcileBlvdRevenueItemAttribution(
	input: { revenueItemId: string },
	db: DbLike = prisma,
) {
	const revenueItem = await db.blvdRevenueItem.findUnique({
		where: { id: input.revenueItemId },
		select: {
			id: true,
			boulevardClientId: true,
			occurredAt: true,
		},
	})

	if (!revenueItem?.boulevardClientId) return null

	const touch = await resolveBlvdAttributionTouchForRevenueItem(db, {
		boulevardClientId: revenueItem.boulevardClientId,
		occurredAt: revenueItem.occurredAt,
	})

	const updated = await db.blvdRevenueItem.update({
		where: { id: revenueItem.id },
		data: {
			attributionTouchId: touch?.id ?? null,
			attributionMethod: touch ? 'last_touch_before_revenue' : 'unattributed',
			attributedAt: new Date(),
		},
	})

	await refreshBlvdBookingPricingAudit(db)
	await syncBlvdRevenueItemToPostHog({ revenueItemId: updated.id }, db)

	return updated
}
