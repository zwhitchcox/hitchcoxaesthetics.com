import { createHmac } from 'node:crypto'

import { formatInTimeZone } from 'date-fns-tz'
import { z } from 'zod'

import {
	boulevardBookingAttributionInputSchema,
	recordBoulevardBookingAttributionTouch,
} from '#app/utils/blvd-attribution.server.ts'
import { isBlvdServiceCustomerBookable } from '#app/utils/blvd-service-display.ts'
import { getProjectedRevenueForBlvdService } from '#app/utils/service-pricing.ts'

type BlvdLocation = {
	address?: {
		city?: string | null
		line1?: string | null
		line2?: string | null
		state?: string | null
		zip?: string | null
	}
	id: string
	name: string
	tz?: string | null
}

type BlvdStaffVariant = {
	duration?: number | null
	id: string
	price?: number | null
	staff: {
		displayName?: string | null
		firstName?: string | null
		lastName?: string | null
	}
}

type BlvdBookableDate = {
	date: Date | string
	id: string
}

type BlvdBookableTime = {
	id: string
	startTime: Date | string
}

type BlvdRescheduleTime = {
	bookableTimeId?: string
	id?: string
	startTime: Date | string
}

type BlvdRescheduleDate = {
	date: Date | string
}

type BlvdAppointment = {
	appointmentServices?: Array<{
		service?: {
			id?: string | null
			name?: string | null
		} | null
		staff?: {
			displayName?: string | null
			firstName?: string | null
			lastName?: string | null
		} | null
	}>
	cancel(notes?: string, reason?: string): Promise<BlvdAppointment>
	cancellable?: boolean | null
	cancelled?: boolean | null
	clientId?: string | null
	endAt?: Date | string | null
	id: string
	location?: BlvdLocation | null
	manageUrl?: string | null
	reschedule(
		bookableTime: { id: string },
		sendNotification?: boolean,
	): Promise<BlvdAppointment>
	rescheduleAvailableDates(
		searchRangeLower: Date,
		searchRangeUpper: Date,
	): Promise<BlvdRescheduleDate[]>
	rescheduleAvailableTimes(date: Date | string): Promise<BlvdRescheduleTime[]>
	reschedulable?: boolean | null
	startAt?: Date | string | null
	state?: string | null
}

type BlvdAppointmentsApi = {
	get(id: string): Promise<BlvdAppointment>
	list(): Promise<BlvdAppointment[]>
}

type BlvdBookingQuestionOption = {
	id: string
	label: string
}

type BlvdBookingQuestion = {
	answer?: unknown
	displayType?: string | null
	id: string
	label: string
	options: BlvdBookingQuestionOption[]
	required: boolean
	valueType: string
	submitAnswer(answer: unknown): Promise<BlvdCart>
}

type BlvdServiceItem = {
	__typename?: string
	description?: string | null
	disabled?: boolean
	disabledDescription?: string | null
	id: string
	listDurationRange?: {
		max: number
		min: number
		variable: boolean
	} | null
	listPriceRange?: {
		max: number
		min: number
		variable: boolean
	} | null
	name: string
	getLocationVariants(): Promise<Array<{ location: BlvdLocation }>>
	getStaffVariants(): Promise<BlvdStaffVariant[]>
}

type BlvdCategory = {
	availableItems: BlvdServiceItem[]
	id: string
	name: string
}

type BlvdCart = {
	bookingQuestions: BlvdBookingQuestion[]
	clientInformation?: {
		email?: string | null
		externalId?: string | null
		firstName?: string | null
		lastName?: string | null
		phoneNumber?: string | null
	} | null
	endTime?: Date | string | null
	id: string
	summary: {
		depositAmount?: number | null
		paymentMethodRequired?: boolean | null
		subtotal?: number | null
		total?: number | null
	}
	startTime?: Date | string | null
	addBookableItem(
		item: BlvdServiceItem,
		opts?: { staffVariant?: BlvdStaffVariant },
	): Promise<BlvdCart>
	addCardPaymentMethod(details: {
		card: {
			address_postal_code: string
			cvv: string
			exp_month: number
			exp_year: number
			name: string
			number: string
		}
	}): Promise<BlvdCart>
	checkout(): Promise<{
		appointments: Array<{
			appointmentId: string
			clientId?: string | null
			forCartOwner?: boolean | null
		}>
		cart: BlvdCart
	}>
	getAvailableCategories(): Promise<BlvdCategory[]>
	getAvailablePaymentMethods(): Promise<BlvdPaymentMethod[]>
	getBookableDates(opts?: {
		location?: BlvdLocation
		timezone?: string
	}): Promise<BlvdBookableDate[]>
	getBookableTimes(
		date: BlvdBookableDate,
		opts?: { location?: BlvdLocation; timezone?: string },
	): Promise<BlvdBookableTime[]>
	reserveBookableItems(time: BlvdBookableTime): Promise<BlvdCart>
	selectPaymentMethod(paymentMethod: BlvdPaymentMethod): Promise<BlvdCart>
	sendOwnershipCodeBySms(mobilePhone: string): Promise<string>
	takeOwnershipByCode(codeId: string, codeValue: number): Promise<BlvdCart>
	update(opts: {
		clientInformation?: {
			email?: string
			firstName?: string
			lastName?: string
			phoneNumber?: string
		}
		clientMessage?: string
	}): Promise<BlvdCart>
}

type BlvdPaymentMethod = {
	id: string
	name: string
}

type BlvdAuthenticatedClient = {
	platformClient?: unknown
	takeCartOwnership(cart: BlvdCart): Promise<BlvdCart>
}

type BlvdClient = {
	businesses: {
		get(): Promise<{
			getLocations(): Promise<BlvdLocation[]>
		}>
	}
	carts: {
		create(location?: BlvdLocation): Promise<BlvdCart>
	}
	clients: {
		get(auth: { token: string }): Promise<BlvdAuthenticatedClient>
	}
	appointments: BlvdAppointmentsApi
}

type ServiceEntry = {
	categoryName: string
	categoryOrder: number
	id: string
	item: BlvdServiceItem
	itemOrder: number
	searchText: string
}

export type VoiceServiceSearchEntry = {
	categoryName: string
	categoryOrder?: number
	description?: string | null
	id?: string
	itemOrder?: number
	name: string
}

const optionalTrimmedString = z.preprocess(
	value => (value === null ? undefined : value),
	z.string().trim().optional(),
)

const optionalNumberWithDefault = (defaultValue: number) =>
	z.preprocess(
		value => (value === null || value === '' ? undefined : value),
		z.coerce.number().int().optional().default(defaultValue),
	)

const BUSINESS_TIMEZONE = 'America/New_York'
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const VOICE_AVAILABILITY_SLOT_LIMIT = 60
const VOICE_AVAILABILITY_SUMMARY_DAYS = 4

export const voiceServiceLookupSchema = z.object({
	client_type: optionalTrimmedString,
	limit: optionalNumberWithDefault(8).pipe(z.number().min(1).max(20)),
	service_query: optionalTrimmedString,
})

export const voiceAvailabilitySchema = z.object({
	client_type: optionalTrimmedString,
	days: optionalNumberWithDefault(14).pipe(z.number().min(1).max(45)),
	limit: optionalNumberWithDefault(8).pipe(z.number().min(1).max(25)),
	location_id: optionalTrimmedString,
	location_query: optionalTrimmedString,
	preferred_time: optionalTrimmedString,
	service_id: optionalTrimmedString,
	service_query: optionalTrimmedString,
	start_date: optionalTrimmedString,
})

export const voiceCallerLookupSchema = z.object({
	caller_phone_number: optionalTrimmedString,
})

export const voiceCallerAppointmentsSchema = z.object({
	caller_phone_number: optionalTrimmedString,
	include_cancelled: z.coerce.boolean().optional().default(false),
	limit: optionalNumberWithDefault(5).pipe(z.number().min(1).max(10)),
})

export const voiceCancelAppointmentSchema = z.object({
	appointment_id: z.string().trim().min(1),
	caller_phone_number: optionalTrimmedString,
	notes: optionalTrimmedString,
})

export const voiceRescheduleAvailabilitySchema = z.object({
	appointment_id: z.string().trim().min(1),
	caller_phone_number: optionalTrimmedString,
	days: optionalNumberWithDefault(14).pipe(z.number().min(1).max(60)),
	limit: optionalNumberWithDefault(20).pipe(z.number().min(1).max(40)),
	preferred_time: optionalTrimmedString,
	start_date: optionalTrimmedString,
})

export const voiceRescheduleAppointmentSchema = z.object({
	appointment_id: z.string().trim().min(1),
	caller_phone_number: optionalTrimmedString,
	time_id: z.string().trim().min(1),
})

export const voiceBookingQuestionAnswerSchema = z.object({
	question_id: optionalTrimmedString,
	question_label: optionalTrimmedString,
	value: z.unknown(),
})

export const voiceBookAppointmentSchema = z.object({
	card: z.preprocess(
		value => (value === null ? undefined : value),
		z
			.object({
				cvc: z.string().trim(),
				exp_month: z.coerce.number().int().min(1).max(12),
				exp_year: z.coerce
					.number()
					.int()
					.min(new Date().getFullYear())
					.max(2100),
				name: z.string().trim(),
				number: z.string().trim(),
				postal_code: z.string().trim(),
			})
			.optional(),
	),
	client: z.preprocess(
		value => (value === null ? undefined : value),
		z
			.object({
				email: z.string().trim().email().optional(),
				first_name: z.string().trim().min(1).optional(),
				last_name: z.string().trim().min(1).optional(),
				phone: z.string().trim().min(7).optional(),
			})
			.optional(),
	),
	booking_question_answers: z
		.preprocess(
			value => (value === null ? undefined : value),
			z.array(voiceBookingQuestionAnswerSchema),
		)
		.default([]),
	caller_phone_number: optionalTrimmedString,
	call_id: optionalTrimmedString,
	callrail_account_id: optionalTrimmedString,
	callrail_call_id: optionalTrimmedString,
	location_id: optionalTrimmedString,
	location_query: optionalTrimmedString,
	notes: optionalTrimmedString,
	ownership_code_id: optionalTrimmedString,
	ownership_code_value: optionalTrimmedString,
	retell_public_log_url: optionalTrimmedString,
	service_id: optionalTrimmedString,
	service_query: optionalTrimmedString,
	start_time: z.string().trim().min(1),
	time_id: optionalTrimmedString,
})

type VoiceServiceLookupInput = z.output<typeof voiceServiceLookupSchema>
type VoiceAvailabilityInput = z.output<typeof voiceAvailabilitySchema>
type VoiceCallerLookupInput = z.output<typeof voiceCallerLookupSchema>
type VoiceCallerAppointmentsInput = z.output<
	typeof voiceCallerAppointmentsSchema
>
type VoiceCancelAppointmentInput = z.output<typeof voiceCancelAppointmentSchema>
type VoiceRescheduleAvailabilityInput = z.output<
	typeof voiceRescheduleAvailabilitySchema
>
type VoiceRescheduleAppointmentInput = z.output<
	typeof voiceRescheduleAppointmentSchema
>
type VoiceBookAppointmentInput = z.output<typeof voiceBookAppointmentSchema>

let cachedCatalog:
	| {
			expiresAt: number
			locations: BlvdLocation[]
			services: ServiceEntry[]
	  }
	| undefined

export async function listVoiceBookingServices(input: VoiceServiceLookupInput) {
	const catalog = await getCatalog()
	const services = preferServicesForClientType(
		rankServices(catalog.services, input.service_query ?? ''),
		input.client_type,
	).slice(0, input.limit)

	return {
		ok: true,
		services: services.map(serializeService),
	}
}

export async function getVoiceBookingAvailability(
	input: VoiceAvailabilityInput,
) {
	const catalog = await getCatalog()
	const service = resolveService(catalog.services, input)
	if ('error' in service) return service

	const serviceLocations = sortLocations(
		dedupeLocations(
			(await service.item.getLocationVariants()).map(
				variant => variant.location,
			),
		),
	)
	const location = resolveLocation(serviceLocations, input)
	if ('error' in location) {
		return {
			...location,
			service: serializeService(service),
			locations: serviceLocations.map(serializeLocation),
		}
	}

	const startDate = parseStartDate(input.start_date)
	const availability = await collectAvailability({
		limit: VOICE_AVAILABILITY_SLOT_LIMIT,
		location,
		service,
		startDate,
		untilDate: addDays(startDate, input.days),
	})
	const preferredSlot = findPreferredSlot(availability, input.preferred_time)
	const prioritizedAvailability = prioritizePreferredSlot(
		availability,
		preferredSlot,
	)
	const nextAvailableSlot =
		prioritizedAvailability.length > 0
			? null
			: await collectNextAvailableSlot({
					location,
					service,
					startDate: addDays(startDate, input.days),
					untilDate: addDays(startDate, 90),
				})
	const availabilitySummary = summarizeAvailabilityByDate({
		days: Math.min(input.days, VOICE_AVAILABILITY_SUMMARY_DAYS),
		location,
		slots: prioritizedAvailability,
		startDate,
	})

	return {
		ok: true,
		message:
			prioritizedAvailability.length > 0
				? undefined
				: nextAvailableSlot
					? `No openings were found in the requested window. Offer the next available appointment at ${nextAvailableSlot.location_name}.`
					: 'No openings were found in the requested window. Ask the caller for another service, location, or broader date range.',
		next_available_slot: nextAvailableSlot,
		service: serializeService(service),
		location: serializeLocation(location),
		compact_summary_text: availabilitySummary.compact_summary_text,
		first_available_date: availabilitySummary.first_available_date,
		first_available_date_times_text:
			availabilitySummary.first_available_date_times_text,
		matched_requested_slot: preferredSlot,
		available_times_by_date: availabilitySummary.available_times_by_date,
		slots: prioritizedAvailability,
	}
}

function summarizeAvailabilityByDate({
	days,
	location,
	slots,
	startDate,
}: {
	days: number
	location: BlvdLocation
	slots: ReturnType<typeof serializeSlot>[]
	startDate: Date
}) {
	const timezone = location.tz ?? BUSINESS_TIMEZONE
	const byDate = new Map<
		string,
		{
			date: string
			spoken_date: string | null
			times: string[]
			times_text: string
			spoken_times: string[]
		}
	>()

	for (const slot of slots) {
		if (!slot.local_date || !slot.local_time) continue
		const existing = byDate.get(slot.local_date) ?? {
			date: slot.local_date,
			spoken_date: slot.spoken_date,
			times: [],
			times_text: '',
			spoken_times: [],
		}
		existing.times.push(slot.local_time)
		if (slot.spoken_time) existing.spoken_times.push(slot.spoken_time)
		existing.times_text = existing.times.join(', ')
		byDate.set(slot.local_date, existing)
	}

	const summaryDates = Array.from({ length: days }, (_, index) => {
		const date = addDays(startDate, index)
		const dateKey = formatInTimeZone(date, timezone, 'yyyy-MM-dd')
		const existing = byDate.get(dateKey)
		return (
			existing ?? {
				date: dateKey,
				spoken_date: formatSpokenDate(date, timezone),
				times: [],
				times_text: 'none',
				spoken_times: [],
			}
		)
	})
	const additionalDates = Array.from(byDate.values()).filter(
		day => !summaryDates.some(summaryDay => summaryDay.date === day.date),
	)
	const availableTimesByDate = [...summaryDates, ...additionalDates]
	const firstAvailableDate =
		availableTimesByDate.find(day => day.times.length > 0) ?? null

	return {
		compact_summary_text: summaryDates
			.map(day => `${day.spoken_date ?? day.date}: ${day.times_text}`)
			.join('\n'),
		first_available_date: firstAvailableDate,
		first_available_date_times_text: firstAvailableDate?.times_text ?? null,
		available_times_by_date: availableTimesByDate,
	}
}

export async function lookupVoiceCaller(input: VoiceCallerLookupInput) {
	const callerPhone = normalizePhoneNumber(input.caller_phone_number)
	if (!callerPhone) {
		return {
			ok: false,
			error: 'missing_caller_phone_number',
			message:
				'Retell did not provide a caller phone number. Continue as a new client unless the caller volunteers that they are returning.',
			client_type: 'unknown',
		}
	}

	const client = await findAdminClientByPhone(callerPhone)
	if (!client) {
		return {
			ok: true,
			client_found: false,
			client_type: 'new',
			caller_phone_number: callerPhone,
			message:
				'No Boulevard client matched this caller phone number. Treat the caller as a new client unless they say otherwise.',
		}
	}

	return {
		ok: true,
		client_found: true,
		client_type: 'returning',
		caller_phone_number: callerPhone,
		client: serializeAdminClientProfile(client),
		...(await lookupMostRecentCallerVisitContext(client.id)),
		message:
			'Boulevard matched this caller phone number. Treat the caller as a returning client and do not ask whether they are new or returning.',
	}
}

async function lookupMostRecentCallerVisitContext(clientId: string) {
	try {
		const now = new Date()
		const pastAppointments = (await listAdminClientAppointments(clientId))
			.filter(appointment => appointment.cancelled !== true)
			.filter(appointment => {
				const startAt = toDate(appointment.startAt)
				return startAt && startAt < now
			})
			.sort((a, b) => compareAppointments(b, a))
		const mostRecentAppointment = pastAppointments[0] ?? null
		const serializedAppointment = mostRecentAppointment
			? serializeAppointment(mostRecentAppointment)
			: null

		return {
			most_recent_location: serializedAppointment?.location ?? null,
		}
	} catch (error) {
		console.error('Failed to look up caller most recent visit', error)
		return {
			appointment_lookup_error: 'most_recent_visit_lookup_failed',
			most_recent_location: null,
		}
	}
}

export async function lookupVoiceCallerStaffContext(
	input: VoiceCallerLookupInput,
) {
	const caller = await lookupVoiceCaller(input)
	if (
		!caller ||
		typeof caller !== 'object' ||
		!('client' in caller) ||
		!caller.client
	) {
		return {
			...caller,
			most_recent_appointment: null,
			upcoming_appointments: [],
		}
	}

	try {
		const access = await getCallerAppointmentAccess(input.caller_phone_number)
		if ('error' in access) {
			return {
				...caller,
				appointment_lookup_error: access.error,
				most_recent_appointment: null,
				upcoming_appointments: [],
			}
		}

		const now = new Date()
		const activeAppointments = (await access.appointments.list())
			.filter(appointment => appointment.cancelled !== true)
			.sort(compareAppointments)
		const upcomingAppointments = activeAppointments.filter(appointment => {
			const startAt = toDate(appointment.startAt)
			return !startAt || startAt >= now
		})
		const pastAppointments = activeAppointments.filter(appointment => {
			const startAt = toDate(appointment.startAt)
			return startAt && startAt < now
		})
		const mostRecentAppointment =
			pastAppointments.sort((a, b) => compareAppointments(b, a))[0] ?? null

		return {
			...caller,
			client: serializeAdminClientProfile(access.client),
			most_recent_appointment: mostRecentAppointment
				? serializeAppointment(mostRecentAppointment)
				: null,
			upcoming_appointments: upcomingAppointments.map(serializeAppointment),
		}
	} catch (error) {
		console.error('Failed to enrich caller with Boulevard appointments', error)
		return {
			...caller,
			appointment_lookup_error: 'appointment_lookup_failed',
			most_recent_appointment: null,
			upcoming_appointments: [],
		}
	}
}

export async function listVoiceCallerAppointments(
	input: VoiceCallerAppointmentsInput,
) {
	const access = await getCallerAppointmentAccess(input.caller_phone_number)
	if ('error' in access) return access

	const appointments = (await access.appointments.list())
		.filter(appointment =>
			input.include_cancelled ? true : appointment.cancelled !== true,
		)
		.filter(appointment => {
			const startAt = toDate(appointment.startAt)
			return !startAt || startAt >= new Date()
		})
		.sort(compareAppointments)
		.slice(0, input.limit)
	const serializedAppointments = appointments.map(serializeAppointment)
	const appointmentsSummaryText = serializedAppointments
		.map((appointment, index) => {
			const service =
				appointment.spoken_service_names[0] ??
				appointment.service_names[0] ??
				'appointment'
			return `${index + 1}. ${service} on ${appointment.spoken_time}`
		})
		.join('\n')

	return {
		ok: true,
		client: serializeAdminClientProfile(access.client),
		appointment_count: serializedAppointments.length,
		appointments: serializedAppointments,
		appointments_summary_text: appointmentsSummaryText || null,
		message:
			appointments.length > 0
				? appointments.length === 1
					? 'One upcoming appointment was found. Use it as the target if the caller already asked to reschedule or cancel; otherwise ask what they want to do with it.'
					: 'Multiple upcoming appointments were found. Use appointments_summary_text to identify which appointment the caller means, then continue their requested change.'
				: 'No upcoming appointments were found for this caller.',
	}
}

export async function cancelVoiceAppointment(
	input: VoiceCancelAppointmentInput,
) {
	const access = await getCallerAppointmentAccess(input.caller_phone_number)
	if ('error' in access) return access

	const appointment = await findCallerAppointment(
		access.appointments,
		input.appointment_id,
	)
	if (!appointment) return appointmentNotFound()
	if (appointment.cancelled) {
		return {
			ok: false,
			error: 'already_cancelled',
			message: 'That appointment is already cancelled.',
			appointment: serializeAppointment(appointment),
		}
	}
	if (appointment.cancellable === false) {
		return {
			ok: false,
			error: 'not_cancellable',
			message:
				'Boulevard says this appointment cannot be cancelled online. Tell the caller a team member will need to help.',
			appointment: serializeAppointment(appointment),
		}
	}

	const cancelled = await appointment.cancel(
		input.notes || 'Cancelled by Sarah Hitchcox Aesthetics voice assistant.',
		'CLIENT_CANCEL',
	)
	return {
		ok: true,
		appointment: serializeAppointment(cancelled),
		message: 'The appointment has been cancelled.',
	}
}

export async function lookupVoiceRescheduleAvailability(
	input: VoiceRescheduleAvailabilityInput,
) {
	const access = await getCallerAppointmentAccess(input.caller_phone_number)
	if ('error' in access) return access

	const appointment = await findCallerAppointment(
		access.appointments,
		input.appointment_id,
	)
	if (!appointment) return appointmentNotFound()
	if (appointment.reschedulable === false) {
		return {
			ok: false,
			error: 'not_reschedulable',
			message:
				'Boulevard says this appointment cannot be rescheduled online. Tell the caller a team member will need to help.',
			appointment: serializeAppointment(appointment),
		}
	}

	const startDate = parseStartDate(input.start_date)
	const endDate = addDays(startDate, input.days)
	const slotLimit = Math.max(input.limit, 20)
	const availableDates = await appointment.rescheduleAvailableDates(
		startDate,
		endDate,
	)
	const slots: Array<ReturnType<typeof serializeRescheduleSlot>> = []

	for (const date of availableDates) {
		if (slots.length >= slotLimit) break
		const times = await appointment.rescheduleAvailableTimes(date.date)
		for (const time of times) {
			const slot = serializeRescheduleSlot(time)
			if (!slot.time_id) continue
			slots.push(slot)
			if (slots.length >= slotLimit) break
		}
	}

	const preferredSlot = findPreferredSlot(slots, input.preferred_time)
	const prioritizedSlots = prioritizePreferredSlot(slots, preferredSlot)
	const summary = summarizeRescheduleSlots(
		prioritizedSlots,
		startDate,
		input.days,
	)

	return {
		ok: true,
		appointment: serializeAppointment(appointment),
		compact_summary_text: summary.compact_summary_text,
		first_available_slot: prioritizedSlots[0] ?? null,
		matched_requested_slot: preferredSlot,
		available_times_by_date: summary.available_times_by_date,
		slots: prioritizedSlots,
		message:
			prioritizedSlots.length > 0
				? preferredSlot
					? 'The caller requested time is available. Offer matched_requested_slot first and use its exact time_id if the caller confirms.'
					: 'Ask whether the caller prefers morning or afternoon if they have not already said. If they gave a day or window, offer only exact returned slot times from that date/window. If you offer only some returned times for a date, say there are other times that day.'
				: 'No reschedule slots were found in the requested window. Ask whether they want another day or a team member to follow up.',
	}
}

export async function rescheduleVoiceAppointment(
	input: VoiceRescheduleAppointmentInput,
) {
	const access = await getCallerAppointmentAccess(input.caller_phone_number)
	if ('error' in access) return access

	const appointment = await findCallerAppointment(
		access.appointments,
		input.appointment_id,
	)
	if (!appointment) return appointmentNotFound()
	if (appointment.reschedulable === false) {
		return {
			ok: false,
			error: 'not_reschedulable',
			message:
				'Boulevard says this appointment cannot be rescheduled online. Tell the caller a team member will need to help.',
			appointment: serializeAppointment(appointment),
		}
	}

	const updated = await rescheduleAppointmentWithFallback(
		appointment,
		input.time_id,
	)
	return {
		ok: true,
		appointment: serializeAppointment(updated),
		message: 'The appointment has been rescheduled.',
	}
}

async function rescheduleAppointmentWithFallback(
	appointment: BlvdAppointment,
	timeId: string,
) {
	try {
		return await appointment.reschedule({ id: timeId }, true)
	} catch (error) {
		if (!isBoulevardInternalServerError(error)) throw error
		console.error(
			'Boulevard reschedule failed with notification enabled; retrying without notification.',
			error,
		)
		return appointment.reschedule({ id: timeId }, false)
	}
}

function isBoulevardInternalServerError(error: unknown) {
	if (!(error instanceof Error)) return false
	return (
		error.message.includes('INTERNAL_SERVER_ERROR') ||
		error.message.includes('Internal Server Error') ||
		error.message.includes('status_code":500')
	)
}

export async function bookVoiceAppointment(input: VoiceBookAppointmentInput) {
	if (looksLikeRescheduleBookingAttempt(input)) {
		return {
			error: 'use_reschedule_appointment',
			message:
				'This is a reschedule request for an existing appointment. Do not ask the caller which service they want. Use reschedule_appointment with the original appointment_id from lookup_caller_appointments and the exact time_id from lookup_reschedule_availability.',
			ok: false,
			required_tool: 'reschedule_appointment',
		}
	}

	const catalog = await getCatalog()
	const service = resolveService(catalog.services, input)
	if ('error' in service) return service

	const serviceLocations = dedupeLocations(
		(await service.item.getLocationVariants()).map(variant => variant.location),
	)
	const location = resolveLocation(serviceLocations, input)
	if ('error' in location) {
		return {
			...location,
			service: serializeService(service),
			locations: serviceLocations.map(serializeLocation),
		}
	}

	const startTime = new Date(input.start_time)
	if (Number.isNaN(startTime.getTime())) {
		return {
			error: 'invalid_start_time',
			message: 'start_time must be an ISO timestamp returned by availability.',
			ok: false,
		}
	}

	let { cart, selectedTime } = await createCartForService(service, location)
	const targetDate = await findBookableDate(cart, location, startTime)
	if (!targetDate) {
		return {
			error: 'slot_not_available',
			message: 'That appointment date is no longer available.',
			ok: false,
		}
	}

	selectedTime = await findBookableTime({
		cart,
		location,
		startTime,
		targetDate,
		timeId: input.time_id,
	})

	if (!selectedTime) {
		return {
			error: 'slot_not_available',
			message: 'That appointment time is no longer available.',
			ok: false,
		}
	}

	cart = await cart.reserveBookableItems(selectedTime)
	const callerPhone = normalizePhoneNumber(
		input.caller_phone_number ?? input.client?.phone,
	)
	const clientProfile =
		input.ownership_code_id && input.ownership_code_value
			? await takeCartOwnershipByCode({
					cart,
					codeId: input.ownership_code_id,
					codeValue: input.ownership_code_value,
				})
			: await takeCartOwnershipByCallerPhone({
					callerPhone,
					cart,
				})
	cart = clientProfile.cart

	const clientInformation = buildClientInformation(input, clientProfile.client)
	if (!clientInformation) {
		const requiredClientFields = [
			'first_name',
			'last_name',
			'email',
			...(callerPhone ? [] : ['phone']),
		]
		return {
			error: 'missing_client_details',
			message: callerPhone
				? 'No complete Boulevard client profile could be identified from the caller phone number. Ask for first name, last name, and email. For the phone number, first ask "Is this a good phone number for you?" If yes, call book_appointment again without client.phone so caller ID is used. If no, ask for the best phone number where they can be reached. Do not send or ask for an SMS verification code.'
				: 'No complete Boulevard client profile could be identified because caller phone number is unavailable. Ask for first name, last name, email, and the best phone number where they can be reached, then call book_appointment again. Do not send or ask for an SMS verification code.',
			ok: false,
			required_client_fields: requiredClientFields,
		}
	}

	cart = await cart.update({
		clientInformation,
		clientMessage: input.notes || undefined,
	})

	const missingQuestions = getMissingRequiredQuestions(
		cart.bookingQuestions,
		input.booking_question_answers,
	)
	if (missingQuestions.length > 0) {
		return {
			error: 'missing_booking_questions',
			message:
				'Boulevard requires these booking question answers before checkout.',
			ok: false,
			questions: missingQuestions,
		}
	}

	for (const answer of input.booking_question_answers) {
		const question = findQuestion(cart.bookingQuestions, answer)
		if (!question) continue
		cart = await question.submitAnswer(
			coerceQuestionAnswer(question, answer.value),
		)
	}

	const requiresPayment = Boolean(cart.summary.paymentMethodRequired)
	const existingPaymentMethod = requiresPayment
		? await getFirstAvailablePaymentMethod(cart)
		: null
	if (requiresPayment && existingPaymentMethod) {
		cart = await cart.selectPaymentMethod(existingPaymentMethod)
	}

	if (requiresPayment && !existingPaymentMethod && !input.card) {
		return {
			error: 'missing_card',
			message:
				'Boulevard requires a card to reserve this appointment and no saved card was available for this client.',
			ok: false,
			payment: serializePaymentSummary(cart),
		}
	}

	if (requiresPayment && !existingPaymentMethod && input.card) {
		cart = await cart.addCardPaymentMethod({
			card: {
				address_postal_code: input.card.postal_code,
				cvv: input.card.cvc.replace(/\D/g, ''),
				exp_month: input.card.exp_month,
				exp_year: input.card.exp_year,
				name: input.card.name.toUpperCase(),
				number: input.card.number.replace(/\D/g, ''),
			},
		})
	}

	const checkout = await cart.checkout()
	const appointmentIds = checkout.appointments.map(
		appointment => appointment.appointmentId,
	)
	const projectedRevenueUsd = getProjectedRevenueForBlvdService(
		service.item.name,
	)

	void recordBoulevardBookingAttributionTouch(
		boulevardBookingAttributionInputSchema.parse({
			appointments: checkout.appointments.map(appointment => ({
				appointmentId: appointment.appointmentId,
				clientId: appointment.clientId ?? undefined,
				endTime: toIso(checkout.cart.endTime),
				forCartOwner: appointment.forCartOwner ?? undefined,
				startTime: toIso(checkout.cart.startTime),
			})),
			attribution: {
				booking_channel: 'retell_test_agent',
				callrail_account_id: input.callrail_account_id,
				callrail_call_id: input.callrail_call_id,
				retell_call_id: input.call_id,
				retell_public_log_url: input.retell_public_log_url,
			},
			booking: {
				cartId: checkout.cart.id,
				hasVerifiedClient: false,
				locationId: location.id,
				locationName: location.name,
				occurredAt: new Date().toISOString(),
				selectedPaymentMethodType: requiresPayment
					? existingPaymentMethod
						? 'saved_card'
						: 'new_card'
					: 'none_required',
				serviceCategory: service.categoryName,
				serviceId: service.item.id,
				serviceName: service.item.name,
				valueUsd: projectedRevenueUsd,
			},
			client: {
				boulevardClientId:
					checkout.appointments.find(appointment => appointment.clientId)
						?.clientId ??
					checkout.cart.clientInformation?.externalId ??
					undefined,
				email:
					checkout.cart.clientInformation?.email ??
					clientInformation.email ??
					undefined,
				firstName:
					checkout.cart.clientInformation?.firstName ??
					clientInformation.firstName ??
					undefined,
				lastName:
					checkout.cart.clientInformation?.lastName ??
					clientInformation.lastName ??
					undefined,
				phone:
					checkout.cart.clientInformation?.phoneNumber ??
					clientInformation.phoneNumber,
			},
		}),
	).catch(error => {
		console.error('Failed to persist Retell Boulevard attribution touch', error)
	})

	return {
		ok: true,
		appointment_ids: appointmentIds,
		location: serializeLocation(location),
		payment: serializePaymentSummary(checkout.cart),
		service: serializeService(service),
		start_time: toIso(checkout.cart.startTime) ?? input.start_time,
		end_time: toIso(checkout.cart.endTime),
	}
}

function looksLikeRescheduleBookingAttempt(input: VoiceBookAppointmentInput) {
	const text = normalizeText(
		[
			input.notes,
			input.service_query,
			input.location_query,
			input.booking_question_answers
				.map(answer => answer.value)
				.filter(value => typeof value === 'string')
				.join(' '),
		]
			.filter(Boolean)
			.join(' '),
	)
	return (
		text.includes('reschedul') ||
		text.includes('move appointment') ||
		text.includes('change appointment')
	)
}

async function getCatalog() {
	const now = Date.now()
	if (cachedCatalog && cachedCatalog.expiresAt > now) return cachedCatalog

	const client = await getBlvdClient()
	const business = await client.businesses.get()
	const locations = await business.getLocations()
	const cart = await client.carts.create()
	const categories = await cart.getAvailableCategories()

	cachedCatalog = {
		expiresAt: now + 5 * 60 * 1000,
		locations,
		services: buildServiceEntries(categories),
	}
	return cachedCatalog
}

async function getBlvdClient() {
	const apiKey = process.env['BLVD_API_KEY']?.trim()
	const businessId = process.env['BLVD_BUSINESS_ID']?.trim()
	if (!apiKey || !businessId) {
		throw new Error('BLVD_API_KEY and BLVD_BUSINESS_ID are required.')
	}

	const sdk = (await import('@boulevard/blvd-book-sdk')) as unknown as {
		Blvd: new (
			apiKey: string,
			businessId: string,
			target?: number,
		) => BlvdClient
		PlatformTarget?: { Live: number }
	}

	return new sdk.Blvd(apiKey, businessId, sdk.PlatformTarget?.Live)
}

export type AdminClientProfile = {
	active?: boolean | null
	email?: string | null
	firstName?: string | null
	hasCardOnFile?: boolean | null
	id: string
	lastName?: string | null
	mobilePhone?: string | null
	name?: string | null
}

type ClientOwnershipResult = {
	cart: BlvdCart
	client: AdminClientProfile | null
}

async function takeCartOwnershipByCallerPhone({
	callerPhone,
	cart,
}: {
	callerPhone: string | null
	cart: BlvdCart
}): Promise<ClientOwnershipResult> {
	const client = await findAdminClientByPhone(callerPhone)
	if (!client) return { cart, client: null }

	try {
		const blvdClient = await getBlvdClient()
		const authenticatedClient = await blvdClient.clients.get({
			token: generateClientToken(client.id),
		})
		return {
			cart: await authenticatedClient.takeCartOwnership(cart),
			client,
		}
	} catch (error) {
		console.error('Failed to take Boulevard cart ownership by phone', error)
		return { cart, client }
	}
}

async function takeCartOwnershipByCode({
	cart,
	codeId,
	codeValue,
}: {
	cart: BlvdCart
	codeId: string
	codeValue: string
}): Promise<ClientOwnershipResult> {
	const digits = codeValue.replace(/\D/g, '')
	if (digits.length !== 6) {
		throw new Error('ownership_code_value must be the 6-digit SMS code.')
	}
	const nextCart = await cart.takeOwnershipByCode(codeId, Number(digits))
	return {
		cart: nextCart,
		client: serializeCartClientInformation(nextCart),
	}
}

async function getCallerAppointmentAccess(callerPhoneInput?: string | null) {
	const callerPhone = normalizePhoneNumber(callerPhoneInput)
	if (!callerPhone) {
		return {
			ok: false,
			error: 'missing_caller_phone_number',
			message:
				'Retell did not provide a caller phone number. Ask a team member to help with cancelling or rescheduling.',
		}
	}

	const client = await findAdminClientByPhone(callerPhone)
	if (!client) {
		return {
			ok: false,
			error: 'client_not_found',
			caller_phone_number: callerPhone,
			message:
				'No Boulevard client matched this caller phone number. Ask a team member to help with cancelling or rescheduling.',
		}
	}

	const appointments: BlvdAppointmentsApi = {
		get: id => getAdminAppointment(id, client.id),
		list: () => listAdminClientAppointments(client.id),
	}

	return { appointments, client, ok: true }
}

async function findCallerAppointment(
	appointmentsApi: BlvdAppointmentsApi,
	appointmentId: string,
) {
	const appointments = await appointmentsApi.list()
	return (
		appointments.find(appointment => appointment.id === appointmentId) ?? null
	)
}

function appointmentNotFound() {
	return {
		ok: false,
		error: 'appointment_not_found',
		message:
			'That appointment was not found for this caller. Ask which upcoming appointment they mean or ask a team member to help.',
	}
}

export async function findAdminClientByPhone(phone: string | null) {
	if (!phone) return null
	const normalizedPhone = normalizePhoneNumber(phone)
	if (!normalizedPhone) return null

	const candidates = await fetchRecentAdminClientsForPhoneMatch()
	return (
		candidates.find(client => {
			const clientPhone = normalizePhoneNumber(client.mobilePhone)
			return client.active !== false && clientPhone === normalizedPhone
		}) ?? null
	)
}

async function fetchRecentAdminClientsForPhoneMatch() {
	try {
		return await fetchAdminClientsPage()
	} catch (error) {
		console.error('Boulevard Admin recent client fallback failed', error)
		return []
	}
}

async function fetchAdminClientsPage() {
	const response = await boulevardAdminFetch<{
		clients?: {
			edges?: Array<{
				node?: AdminClientProfile | null
			}>
		}
	}>(
		`query Clients {
			clients(first: 1000) {
				edges {
					node {
						active
						email
						firstName
						hasCardOnFile
						id
						lastName
						mobilePhone
						name
					}
				}
			}
		}`,
	)
	return (
		response.clients?.edges
			?.map(edge => edge.node)
			.filter((client): client is AdminClientProfile => Boolean(client?.id)) ??
		[]
	)
}

async function listAdminClientAppointments(clientId: string) {
	const catalog = await getCatalog()
	const appointmentGroups: AdminAppointmentNode[][] = []
	for (const location of catalog.locations) {
		const appointments = await listAdminLocationAppointmentsForClient(
			location.id,
			clientId,
		)
		appointmentGroups.push(
			appointments.map(appointment => ({ ...appointment, location })),
		)
	}
	return appointmentGroups.flat().map(hydrateAdminAppointment)
}

async function listAdminLocationAppointmentsForClient(
	locationId: string,
	clientId: string,
) {
	const matchingAppointments: AdminAppointmentNode[] = []
	let after: string | null = null
	let page = 0

	while (page < 50) {
		page += 1
		const response: AdminAppointmentsResponse = await boulevardAdminFetch(
			`query LocationAppointments($after: String, $locationId: ID!) {
				appointments(after: $after, locationId: $locationId, first: 100) {
					pageInfo {
						endCursor
						hasNextPage
					}
					edges {
						node {
							${ADMIN_APPOINTMENT_FIELDS}
						}
					}
				}
			}`,
			{ after, locationId },
		)
		const appointments =
			response.appointments?.edges
				?.map((edge: AdminAppointmentEdge) => edge.node)
				.filter((appointment): appointment is AdminAppointmentNode =>
					Boolean(appointment?.id),
				) ?? []

		matchingAppointments.push(
			...appointments.filter(appointment => appointment.clientId === clientId),
		)

		const pageInfo = response.appointments?.pageInfo
		if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break
		after = pageInfo.endCursor
	}

	return matchingAppointments
}

async function getAdminAppointment(id: string, expectedClientId?: string) {
	const response = await boulevardAdminFetch<{
		appointment?: AdminAppointmentNode | null
	}>(
		`query Appointment($id: ID!) {
			appointment(id: $id) {
				${ADMIN_APPOINTMENT_FIELDS}
			}
		}`,
		{ id },
	)
	const appointment = response.appointment
	if (!appointment?.id) throw new Error('Appointment not found.')
	if (expectedClientId && appointment.clientId !== expectedClientId) {
		throw new Error('Appointment does not belong to this caller.')
	}
	return hydrateAdminAppointment(appointment)
}

async function cancelAdminAppointment(
	id: string,
	notes?: string,
	reason = 'CLIENT_CANCEL',
) {
	const response = await boulevardAdminFetch<{
		cancelAppointment?: {
			appointment?: AdminAppointmentNode | null
		}
	}>(
		`mutation CancelAppointment($input: CancelAppointmentInput!) {
			cancelAppointment(input: $input) {
				appointment {
					${ADMIN_APPOINTMENT_FIELDS}
				}
			}
		}`,
		{ input: { id, notes, notifyClient: true, reason } },
	)
	const appointment = response.cancelAppointment?.appointment
	if (!appointment?.id) throw new Error('Boulevard did not return appointment.')
	return hydrateAdminAppointment(appointment)
}

async function getAdminRescheduleDates(
	appointmentId: string,
	searchRangeLower: Date,
	searchRangeUpper: Date,
) {
	const response = await boulevardAdminFetch<{
		appointmentRescheduleAvailableDates?: {
			availableDates?: BlvdRescheduleDate[]
		}
	}>(
		`mutation AppointmentRescheduleAvailableDates($input: AppointmentRescheduleAvailableDatesInput!) {
			appointmentRescheduleAvailableDates(input: $input) {
				availableDates {
					date
				}
			}
		}`,
		{
			input: {
				appointmentId,
				searchRangeLower: formatAdminDate(searchRangeLower),
				searchRangeUpper: formatAdminDate(searchRangeUpper),
				tz: BUSINESS_TIMEZONE,
			},
		},
	)
	return response.appointmentRescheduleAvailableDates?.availableDates ?? []
}

async function getAdminRescheduleTimes(
	appointmentId: string,
	date: Date | string,
) {
	const response = await boulevardAdminFetch<{
		appointmentRescheduleAvailableTimes?: {
			availableTimes?: BlvdRescheduleTime[]
		}
	}>(
		`mutation AppointmentRescheduleAvailableTimes($input: AppointmentRescheduleAvailableTimesInput!) {
			appointmentRescheduleAvailableTimes(input: $input) {
				availableTimes {
					bookableTimeId
					startTime
				}
			}
		}`,
		{
			input: {
				appointmentId,
				date: formatAdminDate(date),
				tz: BUSINESS_TIMEZONE,
			},
		},
	)
	return response.appointmentRescheduleAvailableTimes?.availableTimes ?? []
}

function formatAdminDate(value: Date | string) {
	const date = toDate(value)
	return date
		? formatInTimeZone(date, BUSINESS_TIMEZONE, 'yyyy-MM-dd')
		: String(value)
}

async function rescheduleAdminAppointment(
	appointmentId: string,
	bookableTimeId: string,
	sendNotification = true,
) {
	const response = await boulevardAdminFetch<{
		appointmentReschedule?: {
			appointment?: { id?: string | null } | null
		}
	}>(
		`mutation AppointmentReschedule($input: AppointmentRescheduleInput!) {
			appointmentReschedule(input: $input) {
				appointment {
					id
				}
			}
		}`,
		{ input: { appointmentId, bookableTimeId, sendNotification } },
	)
	const updatedId = response.appointmentReschedule?.appointment?.id
	if (!updatedId) throw new Error('Boulevard did not return appointment.')
	return getAdminAppointment(updatedId)
}

type AdminAppointmentNode = Omit<
	BlvdAppointment,
	| 'cancel'
	| 'reschedule'
	| 'rescheduleAvailableDates'
	| 'rescheduleAvailableTimes'
>

type AdminAppointmentEdge = {
	node?: AdminAppointmentNode | null
}

type AdminAppointmentsResponse = {
	appointments?: {
		edges?: AdminAppointmentEdge[]
		pageInfo?: {
			endCursor?: string | null
			hasNextPage?: boolean | null
		}
	}
}

const ADMIN_APPOINTMENT_FIELDS = `
	id
	clientId
	cancelled
	duration
	endAt
	manageUrl
	startAt
	state
	appointmentServices {
		service {
			id
			name
		}
		staff {
			displayName
			firstName
			lastName
		}
	}
`

function hydrateAdminAppointment(
	appointment: AdminAppointmentNode,
): BlvdAppointment {
	const startAt = toDate(appointment.startAt)
	const isFuture = !startAt || startAt > new Date()
	const canChange = appointment.cancelled !== true && isFuture
	return {
		...appointment,
		cancellable: canChange,
		cancel: (notes, reason) =>
			cancelAdminAppointment(appointment.id, notes, reason),
		reschedulable: canChange,
		reschedule: (bookableTime, sendNotification = true) =>
			rescheduleAdminAppointment(
				appointment.id,
				bookableTime.id,
				sendNotification,
			),
		rescheduleAvailableDates: (searchRangeLower, searchRangeUpper) =>
			getAdminRescheduleDates(
				appointment.id,
				searchRangeLower,
				searchRangeUpper,
			),
		rescheduleAvailableTimes: date =>
			getAdminRescheduleTimes(appointment.id, date),
	}
}

async function boulevardAdminFetch<TData>(
	query: string,
	variables?: Record<string, unknown>,
) {
	const response = await boulevardAdminRequest(query, variables)
	let payload = (await response.json().catch(() => null)) as {
		data?: TData
		errors?: Array<{ message?: string }>
	} | null

	if (response.status === 401) {
		await sleep(1200)
		const retryResponse = await boulevardAdminRequest(query, variables)
		payload = (await retryResponse.json().catch(() => null)) as {
			data?: TData
			errors?: Array<{ message?: string }>
		} | null
		if (!retryResponse.ok || payload?.errors?.length || !payload?.data) {
			throw new Error(
				`Boulevard Admin API failed: ${JSON.stringify(
					payload?.errors ?? payload ?? { status: retryResponse.status },
				)}`,
			)
		}
		return payload.data
	}

	if (!response.ok || payload?.errors?.length || !payload?.data) {
		throw new Error(
			`Boulevard Admin API failed: ${JSON.stringify(
				payload?.errors ?? payload ?? { status: response.status },
			)}`,
		)
	}
	return payload.data
}

async function boulevardAdminRequest(
	query: string,
	variables?: Record<string, unknown>,
) {
	return fetch('https://dashboard.boulevard.io/api/2020-01/admin', {
		body: JSON.stringify({ query, variables }),
		headers: {
			Accept: 'application/json',
			Authorization: generateAdminAuthorizationHeader(),
			'Content-Type': 'application/json',
		},
		method: 'POST',
	})
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function generateAdminAuthorizationHeader() {
	const apiKey = process.env['BLVD_API_KEY']?.trim()
	const businessId = process.env['BLVD_BUSINESS_ID']?.trim()
	if (!apiKey || !businessId) {
		throw new Error('BLVD_API_KEY and BLVD_BUSINESS_ID are required.')
	}
	const token = generateSignedBlvdToken('blvd-admin-v1', businessId)
	return `Basic ${Buffer.from(`${apiKey}:${token}`).toString('base64')}`
}

function generateClientToken(clientId: string) {
	const businessId = process.env['BLVD_BUSINESS_ID']?.trim()
	if (!businessId) throw new Error('BLVD_BUSINESS_ID is required.')
	return generateSignedBlvdToken('blvd-client-v1', businessId, clientId)
}

function generateSignedBlvdToken(
	prefix: 'blvd-admin-v1' | 'blvd-client-v1',
	businessId: string,
	clientId = '',
) {
	const secretKey = process.env['BLVD_SECRET_KEY']?.trim()
	if (!secretKey) throw new Error('BLVD_SECRET_KEY is required.')
	const payload = `${prefix}${businessId}${clientId}${Math.floor(
		Date.now() / 1000,
	)}`
	const signature = createHmac('sha256', Buffer.from(secretKey, 'base64'))
		.update(payload)
		.digest('base64')
	return `${signature}${payload}`
}

function buildClientInformation(
	input: VoiceBookAppointmentInput,
	client: AdminClientProfile | null,
) {
	const phoneNumber = normalizePhoneNumber(
		input.client?.phone ?? input.caller_phone_number ?? client?.mobilePhone,
	)
	const firstName = input.client?.first_name ?? client?.firstName ?? null
	const lastName = input.client?.last_name ?? client?.lastName ?? null
	const email = input.client?.email ?? client?.email ?? null

	if (!firstName || !lastName || !email || !phoneNumber) return null
	return {
		email,
		firstName,
		lastName,
		phoneNumber,
	}
}

function serializeCartClientInformation(
	cart: BlvdCart,
): AdminClientProfile | null {
	const client = cart.clientInformation
	if (!client?.externalId) return null
	return {
		email: client.email,
		firstName: client.firstName,
		id: client.externalId,
		lastName: client.lastName,
		mobilePhone: client.phoneNumber,
	}
}

export function serializeAdminClientProfile(client: AdminClientProfile) {
	return {
		email: client.email ?? null,
		first_name: client.firstName ?? null,
		has_card_on_file: Boolean(client.hasCardOnFile),
		id: client.id,
		last_name: client.lastName ?? null,
		name: client.name ?? null,
		phone: normalizePhoneNumber(client.mobilePhone),
		profile_url: buildBoulevardClientUrl(client.id),
	}
}

async function getFirstAvailablePaymentMethod(cart: BlvdCart) {
	try {
		return (await cart.getAvailablePaymentMethods())[0] ?? null
	} catch {
		return null
	}
}

function resolveService(
	services: ServiceEntry[],
	input: { client_type?: string; service_id?: string; service_query?: string },
) {
	if (input.service_id) {
		const service = services.find(
			candidate => candidate.id === input.service_id,
		)
		if (service) return service
	}

	const ranked = preferServicesForClientType(
		rankServices(services, input.service_query ?? ''),
		input.client_type,
	)
	if (ranked.length === 1) return ranked[0]!

	const topScore = input.service_query
		? scoreService(ranked[0]!, input.service_query)
		: 0
	const secondScore =
		input.service_query && ranked[1]
			? scoreService(ranked[1], input.service_query)
			: 0

	if (ranked[0] && (ranked.length === 1 || topScore >= secondScore + 25)) {
		return ranked[0]
	}

	return {
		error: 'ambiguous_service',
		message: 'Ask which service the caller wants before checking availability.',
		ok: false,
		services: ranked.slice(0, 8).map(serializeService),
	}
}

function preferServicesForClientType(
	services: ServiceEntry[],
	clientType?: string | null,
) {
	const normalizedClientType = normalizeText(clientType ?? '')
	if (!normalizedClientType) return services

	const wantsExisting =
		normalizedClientType.includes('return') ||
		normalizedClientType.includes('existing')
	const wantsNew =
		normalizedClientType.includes('new') ||
		normalizedClientType.includes('first')

	if (!wantsExisting && !wantsNew) return services

	const filtered = services.filter(service => {
		const text = normalizeText(`${service.categoryName} ${service.item.name}`)
		const isExistingSpecific =
			text.includes('existing') || text.includes('returning')
		const isNewSpecific = text.includes('new') || text.includes('first')
		if (wantsExisting) return !isNewSpecific
		if (wantsNew) return !isExistingSpecific
		return true
	})

	return filtered.length > 0 ? filtered : services
}

function resolveLocation(
	locations: BlvdLocation[],
	input: { location_id?: string; location_query?: string },
) {
	if (input.location_id) {
		const location = locations.find(
			candidate => candidate.id === input.location_id,
		)
		if (location) return location

		if (input.location_query) {
			const normalizedQuery = normalizeText(input.location_query)
			const matchedLocation =
				locations.find(location =>
					locationMatchesQuery(location, normalizedQuery),
				) ?? null
			if (matchedLocation) return matchedLocation
		}

		const normalizedId = normalizeText(
			extractLocationSearchTerm(input.location_id),
		)
		const matchedLocation =
			locations.find(location =>
				locationMatchesQuery(location, normalizedId),
			) ?? null
		if (matchedLocation) return matchedLocation

		return {
			error: 'location_unavailable',
			message:
				'That location id did not match Boulevard. Use one of the returned location ids before saying a location is unavailable.',
			ok: false,
		}
	}

	if (input.location_query) {
		const normalizedQuery = normalizeText(input.location_query)
		const matchedLocation =
			locations.find(location =>
				locationMatchesQuery(location, normalizedQuery),
			) ?? null
		if (matchedLocation) return matchedLocation

		return {
			error: 'location_unavailable',
			message:
				'That location is not available for this service. Ask the caller if one of the returned locations works.',
			ok: false,
		}
	}

	const ranked = rankLocations(locations, '')
	if (ranked.length === 1) return ranked[0]!

	return {
		error: 'ambiguous_location',
		message:
			'Ask whether the caller prefers the Bearden or Farragut location before checking availability.',
		ok: false,
	}
}

async function collectAvailability({
	limit,
	location,
	service,
	startDate,
	untilDate,
}: {
	limit: number
	location: BlvdLocation
	service: ServiceEntry
	startDate: Date
	untilDate: Date
}) {
	const { cart } = await createCartForService(service, location)
	const dates = await cart.getBookableDates({
		location,
		timezone: location.tz ?? undefined,
	})
	const slots: Array<ReturnType<typeof serializeSlot>> = []

	for (const date of dates) {
		const dateValue = toDate(date.date)
		if (
			!dateValue ||
			dateValue < startOfDay(startDate) ||
			dateValue >= untilDate
		) {
			continue
		}

		const times = await cart.getBookableTimes(date, {
			location,
			timezone: location.tz ?? undefined,
		})

		for (const time of times) {
			slots.push(serializeSlot(time, location))
			if (slots.length >= limit) return slots
		}
	}

	return slots
}

async function collectNextAvailableSlot({
	location,
	service,
	startDate,
	untilDate,
}: {
	location: BlvdLocation
	service: ServiceEntry
	startDate: Date
	untilDate: Date
}) {
	const slots = await collectAvailability({
		limit: 1,
		location,
		service,
		startDate,
		untilDate,
	})
	return slots[0] ?? null
}

async function createCartForService(
	service: ServiceEntry,
	location: BlvdLocation,
) {
	const client = await getBlvdClient()
	let cart = await client.carts.create(location)
	const preferredStaffVariant = await getPreferredStaffVariant(service.item)
	cart = await cart.addBookableItem(service.item, {
		...(preferredStaffVariant ? { staffVariant: preferredStaffVariant } : {}),
	})

	return { cart, selectedTime: null as BlvdBookableTime | null }
}

async function findBookableDate(
	cart: BlvdCart,
	location: BlvdLocation,
	startTime: Date,
) {
	const dates = await cart.getBookableDates({
		location,
		timezone: location.tz ?? undefined,
	})
	const targetDay = startOfDay(startTime).getTime()
	return (
		dates.find(date => {
			const candidate = toDate(date.date)
			return candidate ? startOfDay(candidate).getTime() === targetDay : false
		}) ?? null
	)
}

async function findBookableTime({
	cart,
	location,
	startTime,
	targetDate,
	timeId,
}: {
	cart: BlvdCart
	location: BlvdLocation
	startTime: Date
	targetDate: BlvdBookableDate
	timeId?: string
}) {
	const times = await cart.getBookableTimes(targetDate, {
		location,
		timezone: location.tz ?? undefined,
	})
	const targetTime = startTime.getTime()

	return (
		times.find(time => timeId && time.id === timeId) ??
		times.find(time => {
			const candidate = toDate(time.startTime)
			return candidate
				? Math.abs(candidate.getTime() - targetTime) < 60_000
				: false
		}) ??
		null
	)
}

function buildServiceEntries(categories: BlvdCategory[]) {
	const services = new Map<string, ServiceEntry>()

	for (const [categoryOrder, category] of categories.entries()) {
		for (const [itemOrder, item] of category.availableItems.entries()) {
			if (item.__typename !== 'CartAvailableBookableItem' || item.disabled) {
				continue
			}
			if (
				!isBlvdServiceCustomerBookable({
					categoryName: category.name,
					id: item.id,
					name: item.name,
				})
			) {
				continue
			}
			if (services.has(item.id)) continue

			services.set(item.id, {
				categoryName: category.name,
				categoryOrder,
				id: item.id,
				item,
				itemOrder,
				searchText: normalizeText(
					[
						category.name,
						item.name,
						item.description ?? '',
						...getServiceAliases(category.name, item.name, item.description),
					].join(' '),
				),
			})
		}
	}

	return [...services.values()]
}

function rankServices(services: ServiceEntry[], search: string) {
	if (!search.trim()) {
		return [...services].sort((a, b) => {
			if (a.categoryOrder !== b.categoryOrder) {
				return a.categoryOrder - b.categoryOrder
			}
			if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder
			return a.item.name.localeCompare(b.item.name)
		})
	}

	return [...services]
		.map(service => ({ score: scoreService(service, search), service }))
		.filter(result => result.score > 0)
		.sort((a, b) => {
			if (a.score !== b.score) return b.score - a.score
			return a.service.item.name.localeCompare(b.service.item.name)
		})
		.map(result => result.service)
}

export function rankVoiceServiceSearchEntries(
	entries: VoiceServiceSearchEntry[],
	search: string,
	clientType?: string | null,
) {
	const services = entries.map((entry, index): ServiceEntry => {
		const categoryOrder = entry.categoryOrder ?? index
		const itemOrder = entry.itemOrder ?? index
		const item = {
			__typename: 'CartAvailableBookableItem',
			description: entry.description ?? null,
			disabled: false,
			id: entry.id ?? `test-service-${index}`,
			name: entry.name,
			getLocationVariants: async () => [],
			getStaffVariants: async () => [],
		} satisfies BlvdServiceItem

		return {
			categoryName: entry.categoryName,
			categoryOrder,
			id: item.id,
			item,
			itemOrder,
			searchText: normalizeText(
				[
					entry.categoryName,
					entry.name,
					entry.description ?? '',
					...getServiceAliases(
						entry.categoryName,
						entry.name,
						entry.description,
					),
				].join(' '),
			),
		}
	})

	return preferServicesForClientType(
		rankServices(services, search),
		clientType,
	).map(service => ({
		category: service.categoryName,
		id: service.id,
		name: service.item.name,
		score: scoreService(service, search),
	}))
}

function scoreService(service: ServiceEntry, search: string) {
	const normalizedSearch = normalizeText(search)
	const expandedSearch = expandServiceSearch(search)
	const searchTokens = tokenize(expandedSearch)
	const normalizedName = normalizeText(service.item.name)
	const normalizedServiceText = normalizeText(
		[
			service.categoryName,
			service.item.name,
			service.item.description ?? '',
		].join(' '),
	)
	let score = 0

	if (normalizedName === normalizedSearch) score += 150
	if (normalizedName.startsWith(normalizedSearch)) score += 80
	if (service.searchText.includes(normalizedSearch)) score += 60
	if (service.searchText.includes(normalizeText(expandedSearch))) score += 45
	if (isWeightLossQuery(normalizedSearch)) {
		if (isWeightLossConsultationService(normalizedServiceText)) score += 120
		else if (isWeightLossService(normalizedServiceText)) score += 40
		else if (normalizedServiceText.includes('hair loss')) score -= 50
	}

	for (const token of searchTokens) {
		if (normalizedName.includes(token)) {
			score += 25
		} else if (service.searchText.includes(token)) {
			score += 10
		}
	}

	return score
}

function expandServiceSearch(search: string) {
	const normalized = normalizeText(search)
	const aliases = new Set(tokenize(search))

	if (isToxQuery(normalized)) {
		for (const token of [
			'botox',
			'tox',
			'neurotoxin',
			'wrinkle',
			'relaxer',
			'dysport',
			'jeuveau',
			'xeomin',
		]) {
			aliases.add(token)
		}
	}

	if (isWeightLossQuery(normalized)) {
		for (const token of [
			'weight loss',
			'medical weight loss',
			'weight loss consultation',
			'weight loss appointment',
			'glp',
			'glp 1',
			'glp one',
			'semaglutide',
			'tirzepatide',
			'wellness',
		]) {
			aliases.add(token)
		}
	}

	return [...aliases].join(' ')
}

function getServiceAliases(
	categoryName: string,
	serviceName: string,
	description?: string | null,
) {
	const text = normalizeText(
		[categoryName, serviceName, description ?? ''].join(' '),
	)
	const aliases: string[] = []

	if (isToxService(text)) {
		aliases.push(
			'botox',
			'botox treatment',
			'botox appointment',
			'tox',
			'neurotoxin',
			'wrinkle relaxer',
			'wrinkle relaxing treatment',
			'dysport',
			'jeuveau',
			'xeomin',
		)

		if (text.includes('new client') || text.includes('new patient')) {
			aliases.push('new client botox', 'new patient botox', 'first time botox')
		}
		if (text.includes('existing client') || text.includes('existing patient')) {
			aliases.push('existing client botox', 'returning client botox')
		}
	}

	if (isWeightLossService(text)) {
		aliases.push(
			'weight loss',
			'medical weight loss',
			'weight loss consultation',
			'weight loss appointment',
			'glp',
			'glp 1',
			'glp one',
			'glp-1',
			'semaglutide',
			'tirzepatide',
			'wellness',
		)
	}

	return aliases
}

function isToxQuery(normalizedSearch: string) {
	return [
		'botox',
		'tox',
		'neurotoxin',
		'wrinkle relaxer',
		'wrinkle relaxing',
		'dysport',
		'jeuveau',
		'xeomin',
	].some(term => normalizedSearch.includes(term))
}

function isToxService(normalizedServiceText: string) {
	return [
		' tox ',
		' botox ',
		'dysport',
		'jeuveau',
		'xeomin',
		'neurotoxin',
	].some(term => ` ${normalizedServiceText} `.includes(term))
}

function isWeightLossQuery(normalizedSearch: string) {
	return [
		'weight loss',
		'glp',
		'glp 1',
		'glp one',
		'semaglutide',
		'tirzepatide',
	].some(term => normalizedSearch.includes(term))
}

function isWeightLossService(normalizedServiceText: string) {
	return [
		'weight loss',
		'weight management',
		'glp',
		'glp 1',
		'semaglutide',
		'tirzepatide',
	].some(term => normalizedServiceText.includes(term))
}

function isWeightLossConsultationService(normalizedServiceText: string) {
	return (
		isWeightLossService(normalizedServiceText) &&
		normalizedServiceText.includes('consultation')
	)
}

function rankLocations(locations: BlvdLocation[], search: string) {
	if (!search.trim()) return sortLocations(locations)

	const normalizedSearch = normalizeText(search)
	return [...locations].sort((a, b) => {
		const aText = normalizeText([a.name, formatAddress(a)].join(' '))
		const bText = normalizeText([b.name, formatAddress(b)].join(' '))
		const aScore = aText.includes(normalizedSearch) ? 1 : 0
		const bScore = bText.includes(normalizedSearch) ? 1 : 0
		if (aScore !== bScore) return bScore - aScore
		return a.name.localeCompare(b.name)
	})
}

function locationMatchesQuery(location: BlvdLocation, normalizedQuery: string) {
	const aliases = getLocationAliases(location)
	return aliases.some(alias => {
		const normalizedAlias = normalizeText(alias)
		return (
			normalizedAlias.includes(normalizedQuery) ||
			normalizedQuery.includes(normalizedAlias)
		)
	})
}

function extractLocationSearchTerm(value: string) {
	return value.split(':').at(-1) ?? value
}

function getLocationAliases(location: BlvdLocation) {
	const address = formatAddress(location)
	const aliases = [location.name, address]
	const normalizedAddress = normalizeText(address)

	if (normalizedAddress.includes('kingston pike')) {
		aliases.push(
			'bearden',
			'knoxville bearden',
			'5113 kingston pike',
			'nama',
			'kroger',
			'harvest',
		)
	}
	if (normalizedAddress.includes('campbell station')) {
		aliases.push(
			'farragut',
			'102 s campbell station',
			'old aubreys',
			"old aubrey's",
			'aubreys',
			"aubrey's",
			'starbucks',
			'campbell station and kingston pike',
		)
	}

	return aliases
}

function sortLocations(locations: BlvdLocation[]) {
	return [...locations].sort((a, b) => a.name.localeCompare(b.name))
}

function dedupeLocations(locations: BlvdLocation[]) {
	const uniqueLocations = new Map<string, BlvdLocation>()
	for (const location of locations) {
		if (!uniqueLocations.has(location.id)) {
			uniqueLocations.set(location.id, location)
		}
	}
	return [...uniqueLocations.values()]
}

async function getPreferredStaffVariant(item: BlvdServiceItem) {
	const uniqueVariants = new Map<string, BlvdStaffVariant>()
	for (const variant of await item.getStaffVariants()) {
		if (!uniqueVariants.has(variant.id)) {
			uniqueVariants.set(variant.id, variant)
		}
	}

	const staffVariants = [...uniqueVariants.values()]
	return (
		staffVariants.find(variant =>
			normalizeText(getStaffDisplayName(variant.staff)).includes(
				'sarah hitchcox',
			),
		) ?? staffVariants[0]
	)
}

function getMissingRequiredQuestions(
	questions: BlvdBookingQuestion[],
	answers: Array<z.infer<typeof voiceBookingQuestionAnswerSchema>>,
) {
	return questions
		.filter(question => question.required)
		.filter(
			question => !answers.some(answer => findQuestion([question], answer)),
		)
		.map(serializeQuestion)
}

function findQuestion(
	questions: BlvdBookingQuestion[],
	answer: z.infer<typeof voiceBookingQuestionAnswerSchema>,
) {
	return (
		questions.find(question => answer.question_id === question.id) ??
		questions.find(
			question =>
				answer.question_label &&
				normalizeText(question.label) === normalizeText(answer.question_label),
		) ??
		null
	)
}

function coerceQuestionAnswer(question: BlvdBookingQuestion, value: unknown) {
	if (question.valueType === 'BOOLEAN') return Boolean(value)
	if (question.valueType === 'DATETIME' && typeof value === 'string') {
		return new Date(value)
	}
	if (question.valueType === 'SELECT') {
		return (
			question.options.find(option => option.id === value) ??
			question.options.find(
				option =>
					typeof value === 'string' &&
					normalizeText(option.label) === normalizeText(value),
			) ??
			value
		)
	}
	if (question.valueType === 'MULTI_SELECT' && Array.isArray(value)) {
		return value.map(
			item =>
				question.options.find(option => option.id === item) ??
				question.options.find(
					option =>
						typeof item === 'string' &&
						normalizeText(option.label) === normalizeText(item),
				) ??
				item,
		)
	}
	return value
}

function serializeService(service: ServiceEntry) {
	const spokenName = getSpokenServiceName(
		service.item.name,
		service.categoryName,
	)
	return {
		aliases: getServiceAliases(
			service.categoryName,
			service.item.name,
			service.item.description,
		),
		category: service.categoryName,
		description: service.item.description ?? null,
		duration: formatDurationRange(service.item.listDurationRange),
		id: service.item.id,
		name: service.item.name,
		price: formatPriceRange(service.item.listPriceRange),
		spoken_name: spokenName,
	}
}

function serializeLocation(location: BlvdLocation) {
	return {
		address: formatAddress(location),
		boulevard_name: location.name,
		description: getLocationDescription(location),
		display_name: getLocationDisplayName(location),
		id: location.id,
		landmark_hints: getLocationLandmarkHints(location),
		name: getLocationDisplayName(location),
		timezone: location.tz ?? null,
	}
}

function serializeSlot(time: BlvdBookableTime, location: BlvdLocation) {
	const timezone = location.tz ?? BUSINESS_TIMEZONE
	const startTime = toDate(time.startTime)
	const localDate = startTime
		? formatInTimeZone(startTime, timezone, 'yyyy-MM-dd')
		: null
	const localTime = startTime
		? formatInTimeZone(startTime, timezone, 'h:mm a')
		: null
	const spokenDate = startTime ? formatSpokenDate(startTime, timezone) : null

	return {
		location_id: location.id,
		location_name: getLocationDisplayName(location),
		location_description: getLocationDescription(location),
		local_date: localDate,
		local_time: localTime,
		spoken_date: spokenDate,
		spoken_time:
			spokenDate && localTime ? `${spokenDate} at ${localTime}` : null,
		start_time: toIso(time.startTime),
		time_id: time.id,
		timezone,
	}
}

function serializeRescheduleSlot(time: BlvdRescheduleTime) {
	const startTime = toDate(time.startTime)
	const localDate = startTime
		? formatInTimeZone(startTime, BUSINESS_TIMEZONE, 'yyyy-MM-dd')
		: null
	const localTime = startTime
		? formatInTimeZone(startTime, BUSINESS_TIMEZONE, 'h:mm a')
		: null
	const spokenDate = startTime
		? formatSpokenDate(startTime, BUSINESS_TIMEZONE)
		: null

	return {
		local_date: localDate,
		local_time: localTime,
		spoken_date: spokenDate,
		spoken_time:
			spokenDate && localTime ? `${spokenDate} at ${localTime}` : null,
		start_time: toIso(time.startTime),
		time_id: time.bookableTimeId ?? time.id ?? null,
		timezone: BUSINESS_TIMEZONE,
	}
}

function serializeAppointment(appointment: BlvdAppointment) {
	const startAt = toDate(appointment.startAt)
	const location = appointment.location
		? serializeLocation(appointment.location)
		: null
	const serviceNames =
		appointment.appointmentServices
			?.map(item => item.service?.name)
			.filter((name): name is string => Boolean(name)) ?? []
	const spokenServiceNames = serviceNames.map(name =>
		getSpokenServiceName(name),
	)
	const staffNames =
		appointment.appointmentServices
			?.map(
				item =>
					item.staff?.displayName ??
					[item.staff?.firstName, item.staff?.lastName]
						.filter(Boolean)
						.join(' '),
			)
			.filter((name): name is string => Boolean(name)) ?? []

	return {
		id: appointment.id,
		booking_management_url: appointment.manageUrl ?? null,
		boulevard_url: buildBoulevardAppointmentUrl(appointment),
		cancellable: appointment.cancellable !== false,
		cancelled: Boolean(appointment.cancelled),
		end_time: toIso(appointment.endAt),
		location,
		local_date: startAt
			? formatInTimeZone(startAt, BUSINESS_TIMEZONE, 'yyyy-MM-dd')
			: null,
		local_time: startAt
			? formatInTimeZone(startAt, BUSINESS_TIMEZONE, 'h:mm a')
			: null,
		reschedulable: appointment.reschedulable !== false,
		service_names: serviceNames,
		spoken_service_names: [...new Set(spokenServiceNames)],
		spoken_time: startAt
			? `${formatSpokenDate(startAt, BUSINESS_TIMEZONE)} at ${formatInTimeZone(
					startAt,
					BUSINESS_TIMEZONE,
					'h:mm a',
				)}`
			: null,
		staff_names: [...new Set(staffNames)],
		start_time: toIso(appointment.startAt),
		state: appointment.state ?? null,
	}
}

function buildBoulevardClientUrl(clientId?: string | null) {
	return buildBoulevardDashboardUrl(
		'BLVD_CLIENT_URL_TEMPLATE',
		clientId,
		'https://dashboard.boulevard.io/clients/{id}',
	)
}

function buildBoulevardAppointmentUrl(appointment: BlvdAppointment) {
	return (
		appointment.manageUrl ??
		buildBoulevardDashboardUrl(
			'BLVD_APPOINTMENT_URL_TEMPLATE',
			appointment.id,
			null,
		)
	)
}

function buildBoulevardDashboardUrl(
	envKey: string,
	id?: string | null,
	defaultTemplate?: string | null,
) {
	if (!id) return null
	const template = process.env[envKey]?.trim() || defaultTemplate
	if (!template) return null
	return template.replace('{id}', encodeURIComponent(id))
}

type VoiceSlot = {
	local_time: string | null
	start_time?: string | null
	time_id?: string | null
}

function findPreferredSlot<TSlot extends VoiceSlot>(
	slots: TSlot[],
	preferredTime?: string | null,
) {
	const preferredMinutes = parsePreferredTimeMinutes(preferredTime)
	if (preferredMinutes === null) return null

	return (
		slots.find(slot => {
			const slotMinutes = parsePreferredTimeMinutes(slot.local_time)
			return slotMinutes !== null && slotMinutes === preferredMinutes
		}) ?? null
	)
}

function prioritizePreferredSlot<TSlot extends VoiceSlot>(
	slots: TSlot[],
	preferredSlot: TSlot | null,
) {
	if (!preferredSlot) return slots
	return [
		preferredSlot,
		...slots.filter(
			slot =>
				slot.time_id !== preferredSlot.time_id ||
				slot.start_time !== preferredSlot.start_time,
		),
	]
}

function parsePreferredTimeMinutes(value?: string | null) {
	if (!value) return null
	const match = value
		.trim()
		.toLowerCase()
		.replace(/\./g, '')
		.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
	if (!match) return null

	let hour = Number(match[1])
	const minute = match[2] ? Number(match[2]) : 0
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
	if (minute < 0 || minute > 59 || hour < 1 || hour > 12) return null
	if (match[3] === 'pm' && hour !== 12) hour += 12
	if (match[3] === 'am' && hour === 12) hour = 0
	return hour * 60 + minute
}

function getSpokenServiceName(serviceName: string, categoryName = '') {
	const normalized = normalizeText(`${serviceName} ${categoryName}`)
	if (
		normalized.includes('tox') ||
		normalized.includes('botox') ||
		normalized.includes('dysport') ||
		normalized.includes('jeuveau') ||
		normalized.includes('xeomin')
	) {
		return 'Botox appointment'
	}
	if (
		normalized.includes('weight loss') &&
		normalized.includes('consultation')
	) {
		return 'weight loss consultation'
	}
	if (normalized.includes('weight loss') && normalized.includes('injection')) {
		return 'weight loss injection'
	}
	return serviceName
		.replace(/\bnew client\b/gi, '')
		.replace(/\bexisting client\b/gi, '')
		.replace(/\bnew patient\b/gi, '')
		.replace(/\bexisting patient\b/gi, '')
		.replace(/\s+/g, ' ')
		.trim()
}

function summarizeRescheduleSlots(
	slots: ReturnType<typeof serializeRescheduleSlot>[],
	startDate: Date,
	days: number,
) {
	const byDate = new Map<
		string,
		{
			date: string
			spoken_date: string | null
			times: string[]
			times_text: string
			spoken_times: string[]
		}
	>()

	for (const slot of slots) {
		if (!slot.local_date || !slot.local_time) continue
		const existing = byDate.get(slot.local_date) ?? {
			date: slot.local_date,
			spoken_date: slot.spoken_date,
			times: [],
			times_text: '',
			spoken_times: [],
		}
		existing.times.push(slot.local_time)
		if (slot.spoken_time) existing.spoken_times.push(slot.spoken_time)
		existing.times_text = existing.times.join(', ')
		byDate.set(slot.local_date, existing)
	}

	const summaryDays = Math.min(days, VOICE_AVAILABILITY_SUMMARY_DAYS)
	const summaryDates = Array.from({ length: summaryDays }, (_, index) => {
		const date = addDays(startDate, index)
		const dateKey = formatInTimeZone(date, BUSINESS_TIMEZONE, 'yyyy-MM-dd')
		const existing = byDate.get(dateKey)
		return (
			existing ?? {
				date: dateKey,
				spoken_date: formatSpokenDate(date, BUSINESS_TIMEZONE),
				times: [],
				times_text: 'none',
				spoken_times: [],
			}
		)
	})

	return {
		compact_summary_text: summaryDates
			.map(day => `${day.spoken_date ?? day.date}: ${day.times_text}`)
			.join('\n'),
		available_times_by_date: [
			...summaryDates,
			...Array.from(byDate.values()).filter(
				day => !summaryDates.some(summaryDay => summaryDay.date === day.date),
			),
		],
	}
}

function compareAppointments(a: BlvdAppointment, b: BlvdAppointment) {
	return (
		(toDate(a.startAt)?.getTime() ?? 0) - (toDate(b.startAt)?.getTime() ?? 0)
	)
}

function formatSpokenDate(date: Date, timezone: string) {
	const dateKey = formatInTimeZone(date, timezone, 'yyyy-MM-dd')
	const today = new Date()
	const todayKey = formatInTimeZone(today, timezone, 'yyyy-MM-dd')
	const tomorrow = addDays(parseDateOnly(todayKey) ?? today, 1)
	const tomorrowKey = formatInTimeZone(tomorrow, timezone, 'yyyy-MM-dd')

	if (dateKey === todayKey) return 'today'
	if (dateKey === tomorrowKey) return 'tomorrow'

	return `${formatInTimeZone(date, timezone, 'EEEE, MMMM')} ${formatOrdinalDay(
		Number(formatInTimeZone(date, timezone, 'd')),
	)}`
}

function formatOrdinalDay(day: number) {
	const mod100 = day % 100
	if (mod100 >= 11 && mod100 <= 13) return `${day}th`
	switch (day % 10) {
		case 1:
			return `${day}st`
		case 2:
			return `${day}nd`
		case 3:
			return `${day}rd`
		default:
			return `${day}th`
	}
}

function serializeQuestion(question: BlvdBookingQuestion) {
	return {
		display_type: question.displayType ?? null,
		id: question.id,
		label: question.label,
		options: question.options.map(option => ({
			id: option.id,
			label: option.label,
		})),
		required: question.required,
		value_type: question.valueType,
	}
}

function serializePaymentSummary(cart: BlvdCart) {
	return {
		deposit_amount_cents: cart.summary.depositAmount ?? 0,
		payment_method_required: Boolean(cart.summary.paymentMethodRequired),
		subtotal_cents: cart.summary.subtotal ?? 0,
		total_cents: cart.summary.total ?? 0,
	}
}

function formatAddress(location: BlvdLocation) {
	return [
		location.address?.line1,
		location.address?.line2,
		location.address?.city,
		location.address?.state,
		location.address?.zip,
	]
		.filter(Boolean)
		.join(', ')
}

function getLocationDisplayName(location: BlvdLocation) {
	const address = normalizeText(formatAddress(location))
	if (address.includes('kingston pike')) return 'Bearden on Kingston Pike'
	if (address.includes('campbell station'))
		return 'Farragut on Campbell Station'
	return location.name
}

function getLocationDescription(location: BlvdLocation) {
	const address = normalizeText(formatAddress(location))
	if (address.includes('kingston pike')) {
		return 'the Bearden location on Kingston Pike in West Knoxville'
	}
	if (address.includes('campbell station')) {
		return 'the Farragut location on South Campbell Station Road'
	}
	return formatAddress(location) || location.name
}

function getLocationLandmarkHints(location: BlvdLocation) {
	const address = normalizeText(formatAddress(location))
	if (address.includes('kingston pike')) {
		return {
			primary: 'near Nama on Kingston Pike',
			fallbacks: [
				'near the Kroger on Kingston Pike',
				'near Harvest on Kingston Pike',
			],
		}
	}
	if (address.includes('campbell station')) {
		return {
			primary: "in the old Aubrey's off Kingston Pike",
			fallbacks: [
				'across the street from the Starbucks at the corner of Kingston Pike and Campbell Station',
			],
		}
	}
	return null
}

function formatDurationRange(range: BlvdServiceItem['listDurationRange']) {
	if (!range) return null
	if (range.variable && range.min !== range.max) {
		return `${range.min}-${range.max} min`
	}
	return `${range.min} min`
}

function formatPriceRange(range: BlvdServiceItem['listPriceRange']) {
	if (!range) return null
	if (range.variable && range.min !== range.max) {
		return `${formatMoney(range.min)}-${formatMoney(range.max)}`
	}
	return formatMoney(range.min)
}

function formatMoney(value: number) {
	return new Intl.NumberFormat('en-US', {
		currency: 'USD',
		style: 'currency',
	}).format(value / 100)
}

function parseStartDate(value?: string) {
	if (!value) {
		return (
			parseDateOnly(
				formatInTimeZone(new Date(), BUSINESS_TIMEZONE, 'yyyy-MM-dd'),
			) ?? startOfDay(new Date())
		)
	}
	const dateOnly = parseDateOnly(value)
	if (dateOnly) return startOfDay(dateOnly)
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime())
		? startOfDay(new Date())
		: startOfDay(parsed)
}

function parseDateOnly(value: string) {
	const match = DATE_ONLY_PATTERN.exec(value.trim())
	if (!match) return null
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
	const nextDate = new Date(date)
	nextDate.setDate(nextDate.getDate() + days)
	return nextDate
}

function toDate(value: Date | string | null | undefined) {
	if (!value) return null
	if (value instanceof Date) return value
	const dateOnly = parseDateOnly(value)
	if (dateOnly) return dateOnly
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toIso(value: Date | string | null | undefined) {
	return toDate(value)?.toISOString()
}

function normalizePhoneNumber(value: string | null | undefined) {
	if (!value) return null
	const digits = value.replace(/\D/g, '')
	if (!digits) return null
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (value.trim().startsWith('+')) return value.trim()
	return `+${digits}`
}

function getStaffDisplayName(staff: BlvdStaffVariant['staff']) {
	return (
		staff.displayName?.trim() ||
		[staff.firstName, staff.lastName].filter(Boolean).join(' ').trim()
	)
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

function tokenize(value: string) {
	return normalizeText(value).split(/\s+/).filter(Boolean)
}
