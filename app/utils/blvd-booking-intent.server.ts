import { z } from 'zod'

import { prisma } from '#app/utils/db.server.ts'

const optionalTrimmedString = z.preprocess(
	value =>
		value === null || (typeof value === 'string' && !value.trim())
			? undefined
			: value,
	z.string().trim().optional(),
)

const attributionPropertiesSchema = z
	.object({
		book_entry_from_path: optionalTrimmedString,
		book_entry_page_prefix_type: optionalTrimmedString,
		book_entry_page_type: optionalTrimmedString,
		initial_landing_path: optionalTrimmedString,
		initial_landing_page_prefix_type: optionalTrimmedString,
		initial_landing_page_type: optionalTrimmedString,
		initial_referrer: optionalTrimmedString,
		initial_referring_domain: optionalTrimmedString,
		traffic_channel: optionalTrimmedString,
		traffic_platform: optionalTrimmedString,
		traffic_source_detail: optionalTrimmedString,
		posthog_distinct_id: optionalTrimmedString,
		posthog_session_id: optionalTrimmedString,
		callrail_account_id: optionalTrimmedString,
		callrail_call_id: optionalTrimmedString,
		callrail_session_id: optionalTrimmedString,
		callrail_visitor_id: optionalTrimmedString,
		callrail_person_id: optionalTrimmedString,
		callrail_timeline_url: optionalTrimmedString,
		callrail_source: optionalTrimmedString,
		callrail_medium: optionalTrimmedString,
		callrail_landing_page_url: optionalTrimmedString,
		callrail_last_requested_url: optionalTrimmedString,
		utm_source: optionalTrimmedString,
		utm_medium: optionalTrimmedString,
		utm_campaign: optionalTrimmedString,
		utm_term: optionalTrimmedString,
		utm_content: optionalTrimmedString,
		gclid: optionalTrimmedString,
		gbraid: optionalTrimmedString,
		wbraid: optionalTrimmedString,
		fbclid: optionalTrimmedString,
		msclkid: optionalTrimmedString,
	})
	.catchall(z.unknown())

const bookingIntentBookingSchema = z.object({
	appointmentCount: z.number().int().nonnegative().optional(),
	appointmentIds: z.array(z.string().min(1)).optional(),
	cartId: optionalTrimmedString,
	hasVerifiedClient: z.boolean().optional(),
	hasVerifiedMobile: z.boolean().optional(),
	locationId: optionalTrimmedString,
	locationName: optionalTrimmedString,
	requiresCard: z.boolean().optional(),
	selectedEndTime: z.string().datetime().optional(),
	selectedPaymentMethodType: optionalTrimmedString,
	selectedStartTime: z.string().datetime().optional(),
	serviceCategory: optionalTrimmedString,
	serviceId: optionalTrimmedString,
	serviceName: optionalTrimmedString,
	valueUsd: z.number().optional(),
})

const bookingIntentClientSchema = z.object({
	boulevardClientId: optionalTrimmedString,
	email: optionalTrimmedString,
	firstName: optionalTrimmedString,
	lastName: optionalTrimmedString,
	phone: optionalTrimmedString,
})

export const blvdBookingIntentInputSchema = z.object({
	attribution: attributionPropertiesSchema.default({}),
	booking: bookingIntentBookingSchema,
	client: bookingIntentClientSchema.default({}),
	occurred_at: z.string().datetime().optional(),
	status: z.string().trim().min(1).default('in_progress'),
	step: optionalTrimmedString,
})

type BlvdBookingIntentInput = z.output<typeof blvdBookingIntentInputSchema>
type DbLike = typeof prisma

export async function recordBlvdBookingIntent(
	input: BlvdBookingIntentInput,
	db: DbLike = prisma,
) {
	const parsed = blvdBookingIntentInputSchema.parse(input)
	const existing = await findExistingBlvdBookingIntent(parsed, db)
	const occurredAt = parsed.occurred_at
		? new Date(parsed.occurred_at)
		: new Date()
	const lastSeenAt = occurredAt
	const data = {
		appointmentCount: parsed.booking.appointmentCount,
		appointmentIds: parsed.booking.appointmentIds?.join(',') ?? null,
		bookingCartId: normalizeOptionalString(parsed.booking.cartId),
		bookingHasVerifiedClient: parsed.booking.hasVerifiedClient,
		bookingHasVerifiedMobile: parsed.booking.hasVerifiedMobile,
		bookingLocationId: normalizeOptionalString(parsed.booking.locationId),
		bookingLocationName: normalizeOptionalString(parsed.booking.locationName),
		bookingRequiresCard: parsed.booking.requiresCard,
		bookingSelectedPaymentType: normalizeOptionalString(
			parsed.booking.selectedPaymentMethodType,
		),
		bookingServiceCategory: normalizeOptionalString(
			parsed.booking.serviceCategory,
		),
		bookingServiceId: normalizeOptionalString(parsed.booking.serviceId),
		bookingServiceName: normalizeOptionalString(parsed.booking.serviceName),
		bookingValueUsd: parsed.booking.valueUsd,
		bookEntryFromPath: normalizeOptionalString(
			parsed.attribution.book_entry_from_path,
		),
		bookEntryPagePrefixType: normalizeOptionalString(
			parsed.attribution.book_entry_page_prefix_type,
		),
		bookEntryPageType: normalizeOptionalString(
			parsed.attribution.book_entry_page_type,
		),
		boulevardClientId: normalizeOptionalString(parsed.client.boulevardClientId),
		callrailAccountId: normalizeOptionalString(
			parsed.attribution.callrail_account_id,
		),
		callrailCallId: normalizeOptionalString(parsed.attribution.callrail_call_id),
		callrailLandingPageUrl: normalizeOptionalString(
			parsed.attribution.callrail_landing_page_url,
		),
		callrailLastRequestedUrl: normalizeOptionalString(
			parsed.attribution.callrail_last_requested_url,
		),
		callrailMedium: normalizeOptionalString(parsed.attribution.callrail_medium),
		callrailPersonId: normalizeOptionalString(
			parsed.attribution.callrail_person_id,
		),
		callrailSessionId: normalizeOptionalString(
			parsed.attribution.callrail_session_id,
		),
		callrailSource: normalizeOptionalString(parsed.attribution.callrail_source),
		callrailTimelineUrl: normalizeOptionalString(
			parsed.attribution.callrail_timeline_url,
		),
		callrailVisitorId: normalizeOptionalString(
			parsed.attribution.callrail_visitor_id,
		),
		clientEmail: normalizeOptionalString(parsed.client.email),
		clientFirstName: normalizeOptionalString(parsed.client.firstName),
		clientLastName: normalizeOptionalString(parsed.client.lastName),
		clientPhone: normalizeOptionalString(parsed.client.phone),
		fbclid: normalizeOptionalString(parsed.attribution.fbclid),
		gbraid: normalizeOptionalString(parsed.attribution.gbraid),
		gclid: normalizeOptionalString(parsed.attribution.gclid),
		initialLandingPagePrefixType: normalizeOptionalString(
			parsed.attribution.initial_landing_page_prefix_type,
		),
		initialLandingPageType: normalizeOptionalString(
			parsed.attribution.initial_landing_page_type,
		),
		initialLandingPath: normalizeOptionalString(
			parsed.attribution.initial_landing_path,
		),
		initialReferrer: normalizeOptionalString(
			parsed.attribution.initial_referrer,
		),
		initialReferringDomain: normalizeOptionalString(
			parsed.attribution.initial_referring_domain,
		),
		lastSeenAt,
		msclkid: normalizeOptionalString(parsed.attribution.msclkid),
		posthogDistinctId: normalizeOptionalString(
			parsed.attribution.posthog_distinct_id,
		),
		posthogSessionId: normalizeOptionalString(
			parsed.attribution.posthog_session_id,
		),
		rawProperties: JSON.stringify(parsed),
		selectedEndTime: parsed.booking.selectedEndTime
			? new Date(parsed.booking.selectedEndTime)
			: null,
		selectedStartTime: parsed.booking.selectedStartTime
			? new Date(parsed.booking.selectedStartTime)
			: null,
		status: parsed.status,
		step: normalizeOptionalString(parsed.step),
		trafficChannel: normalizeOptionalString(
			parsed.attribution.traffic_channel,
		),
		trafficPlatform: normalizeOptionalString(
			parsed.attribution.traffic_platform,
		),
		trafficSourceDetail: normalizeOptionalString(
			parsed.attribution.traffic_source_detail,
		),
		utmCampaign: normalizeOptionalString(parsed.attribution.utm_campaign),
		utmContent: normalizeOptionalString(parsed.attribution.utm_content),
		utmMedium: normalizeOptionalString(parsed.attribution.utm_medium),
		utmSource: normalizeOptionalString(parsed.attribution.utm_source),
		utmTerm: normalizeOptionalString(parsed.attribution.utm_term),
		wbraid: normalizeOptionalString(parsed.attribution.wbraid),
	}

	const record = existing
		? await db.blvdBookingIntent.update({
				where: { id: existing.id },
				data: omitNullish(data),
				select: { id: true },
			})
		: await db.blvdBookingIntent.create({
				data: {
					...data,
					occurredAt,
				},
				select: { id: true },
			})

	return {
		ok: true,
		blvd_booking_intent_id: record.id,
	}
}

async function findExistingBlvdBookingIntent(
	input: BlvdBookingIntentInput,
	db: DbLike,
) {
	const bookingCartId = normalizeOptionalString(input.booking.cartId)
	if (bookingCartId) {
		const byCart = await db.blvdBookingIntent.findUnique({
			where: { bookingCartId },
			select: { id: true },
		})
		if (byCart) return byCart
	}

	const posthogSessionId = normalizeOptionalString(
		input.attribution.posthog_session_id,
	)
	const posthogDistinctId = normalizeOptionalString(
		input.attribution.posthog_distinct_id,
	)
	const callrailSessionId = normalizeOptionalString(
		input.attribution.callrail_session_id,
	)
	const callrailVisitorId = normalizeOptionalString(
		input.attribution.callrail_visitor_id,
	)
	const clientPhone = normalizeOptionalString(input.client.phone)

	const or = [
		posthogSessionId ? { posthogSessionId } : null,
		posthogDistinctId && clientPhone ? { posthogDistinctId, clientPhone } : null,
		callrailSessionId ? { callrailSessionId } : null,
		callrailVisitorId && clientPhone
			? { callrailVisitorId, clientPhone }
			: null,
	].filter(Boolean)
	if (or.length === 0) return null

	return db.blvdBookingIntent.findFirst({
		where: {
			OR: or,
			status: { not: 'completed' },
		},
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
