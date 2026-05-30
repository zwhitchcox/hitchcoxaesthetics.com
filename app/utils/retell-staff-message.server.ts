import { z } from 'zod'

import { lookupVoiceCallerStaffContext } from '#app/utils/blvd-voice-booking.server.ts'
import {
	findRecentCallRailCallForCaller,
	type CallRailCallAttributionResult,
} from '#app/utils/callrail-booking.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'

const optionalTrimmedString = z.preprocess(
	value =>
		value === null || (typeof value === 'string' && !value.trim())
			? undefined
			: value,
	z.string().trim().optional(),
)

export const retellStaffMessageSchema = z.object({
	call_id: optionalTrimmedString,
	callrail_account_id: optionalTrimmedString,
	callrail_call_id: optionalTrimmedString,
	callback_phone: optionalTrimmedString,
	caller_name: optionalTrimmedString,
	caller_phone_number: optionalTrimmedString,
	location_interest: optionalTrimmedString,
	message: optionalTrimmedString,
	notification_type: z
		.enum(['left_message', 'booking_not_completed', 'needs_follow_up'])
		.default('needs_follow_up'),
	preferred_time: optionalTrimmedString,
	reason: optionalTrimmedString,
	requested_action: optionalTrimmedString,
	retell_public_log_url: optionalTrimmedString,
	service_interest: optionalTrimmedString,
	urgency: optionalTrimmedString,
})

type RetellStaffMessageInput = z.output<typeof retellStaffMessageSchema>
type StaffMessageClientDetails = {
	email?: string | null
	first_name?: string | null
	has_card_on_file?: boolean | null
	id?: string | null
	last_name?: string | null
	name?: string | null
	phone?: string | null
	profile_url?: string | null
}
type StaffMessageAppointmentDetails = {
	booking_management_url?: string | null
	boulevard_url?: string | null
	cancelled?: boolean | null
	id?: string | null
	local_date?: string | null
	local_time?: string | null
	service_names?: string[] | null
	spoken_service_names?: string[] | null
	spoken_time?: string | null
	staff_names?: string[] | null
	start_time?: string | null
	state?: string | null
}
type EnrichedStaffMessageInput = RetellStaffMessageInput & {
	callrail_attribution?: CallRailCallAttributionResult | null
	client_details?: StaffMessageClientDetails | null
	most_recent_appointment?: StaffMessageAppointmentDetails | null
	upcoming_appointments?: StaffMessageAppointmentDetails[]
}

export async function sendRetellStaffMessage(input: RetellStaffMessageInput) {
	if (!input.message && !input.reason && !input.requested_action) {
		return {
			ok: false,
			error: 'missing_message',
			message:
				'Ask the caller for a brief message or reason before notifying Sarah.',
		}
	}

	let enrichedInput = await enrichStaffMessageInput(input)
	enrichedInput = {
		...enrichedInput,
		callrail_attribution: await lookupCallRailAttribution(enrichedInput),
	}
	const savedOutcome = await recordRetellCallOutcome(enrichedInput).catch(
		error => {
			console.error('Failed to save Retell call outcome', error)
			return null
		},
	)
	if (!savedOutcome) {
		return {
			ok: false,
			error: 'database_failed',
			message:
				'There was a problem saving this follow-up. Offer to connect the caller to Sarah.',
		}
	}
	if (!process.env.RESEND_API_KEY?.trim() && process.env.MOCKS !== 'true') {
		return {
			ok: false,
			error: 'email_not_configured',
			message:
				'Email is not configured because RESEND_API_KEY is missing on the running server.',
		}
	}

	const to = process.env.RETELL_STAFF_MESSAGE_TO_EMAIL?.trim()
		? process.env.RETELL_STAFF_MESSAGE_TO_EMAIL.trim()
		: 'sarah@hitchcoxaesthetics.com'
	const from = process.env.RETELL_STAFF_MESSAGE_FROM_EMAIL?.trim()
		? process.env.RETELL_STAFF_MESSAGE_FROM_EMAIL.trim()
		: 'sarah@hitchcoxaesthetics.com'
	const subject = buildSubject(enrichedInput)
	const text = buildText(enrichedInput)
	const html = buildHtml(enrichedInput)
	const result = await sendEmail({ from, html, subject, text, to })

	if (result.status === 'error') {
		return {
			ok: false,
			error: 'email_failed',
			message: result.error.message,
		}
	}

	return {
		ok: true,
		callrail_session_id: savedOutcome.callrailSessionId,
		client_enriched: Boolean(enrichedInput.client_details),
		email_id: result.data.id,
		has_most_recent_appointment: Boolean(enrichedInput.most_recent_appointment),
		posthog_session_id: savedOutcome.posthogSessionId,
		retell_call_outcome_id: savedOutcome.id,
		upcoming_appointment_count:
			enrichedInput.upcoming_appointments?.length ?? 0,
		message:
			enrichedInput.notification_type === 'booking_not_completed'
				? 'Sarah has been emailed about this booking follow-up.'
				: 'Sarah has been emailed the message.',
	}
}

async function enrichStaffMessageInput(
	input: RetellStaffMessageInput,
): Promise<EnrichedStaffMessageInput> {
	const callerContext = await lookupCallerContext(input.caller_phone_number)
	const clientDetails = callerContext?.client ?? null
	if (!clientDetails) {
		return {
			...input,
			most_recent_appointment: null,
			upcoming_appointments: [],
		}
	}

	return {
		...input,
		caller_name:
			input.caller_name ?? buildClientName(clientDetails) ?? undefined,
		caller_phone_number:
			input.caller_phone_number ?? clientDetails.phone ?? undefined,
		client_details: clientDetails,
		most_recent_appointment: callerContext?.most_recent_appointment ?? null,
		upcoming_appointments: callerContext?.upcoming_appointments ?? [],
	}
}

function buildClientName(client: StaffMessageClientDetails) {
	const fullName =
		client.name ??
		[client.first_name, client.last_name].filter(Boolean).join(' ').trim()
	return fullName || null
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

function serializeRawPayload(value: unknown) {
	return value == null ? null : JSON.stringify(value)
}

async function lookupCallerContext(callerPhone?: string | null) {
	if (!callerPhone) return null
	try {
		const result = await lookupVoiceCallerStaffContext({
			caller_phone_number: callerPhone,
		})
		if (!result || typeof result !== 'object' || !('client' in result)) {
			return null
		}
		const client = result.client
		const upcomingAppointments =
			'upcoming_appointments' in result &&
			Array.isArray(result.upcoming_appointments)
				? (result.upcoming_appointments as StaffMessageAppointmentDetails[])
				: []
		const mostRecentAppointment =
			'most_recent_appointment' in result &&
			result.most_recent_appointment &&
			typeof result.most_recent_appointment === 'object'
				? (result.most_recent_appointment as StaffMessageAppointmentDetails)
				: null
		return {
			client:
				client && typeof client === 'object'
					? (client as StaffMessageClientDetails)
					: null,
			most_recent_appointment: mostRecentAppointment,
			upcoming_appointments: upcomingAppointments,
		}
	} catch (error) {
		console.error(
			'Failed to enrich Retell staff message with caller context',
			error,
		)
		return null
	}
}

async function lookupCallRailAttribution(input: RetellStaffMessageInput) {
	const callerPhoneNumber = input.caller_phone_number ?? input.callback_phone
	if (!callerPhoneNumber && !input.callrail_call_id) return null

	try {
		const result = await findRecentCallRailCallForCaller({
			callrailAccountId: input.callrail_account_id,
			callrailCallId: input.callrail_call_id,
			callerPhoneNumber,
		})
		return result.ok ? result : null
	} catch (error) {
		console.error(
			'Failed to look up CallRail attribution for Retell call',
			error,
		)
		return null
	}
}

async function recordRetellCallOutcome(input: EnrichedStaffMessageInput) {
	const callrail = input.callrail_attribution
	const client = input.client_details
	const data = {
		retellCallId: normalizeOptionalString(input.call_id),
		retellPublicLogUrl: normalizeOptionalString(input.retell_public_log_url),
		notificationType: input.notification_type,
		callerName: normalizeOptionalString(
			input.caller_name ?? client?.name ?? buildClientName(client ?? {}),
		),
		callerPhone: normalizeOptionalPhone(
			input.caller_phone_number ?? client?.phone,
		),
		callbackPhone: normalizeOptionalPhone(input.callback_phone),
		boulevardClientId: normalizeOptionalString(client?.id),
		clientName: normalizeOptionalString(client?.name),
		clientEmail: normalizeOptionalEmail(client?.email),
		clientPhone: normalizeOptionalPhone(client?.phone),
		clientProfileUrl: normalizeOptionalString(client?.profile_url),
		serviceInterest: normalizeOptionalString(input.service_interest),
		locationInterest: normalizeOptionalString(input.location_interest),
		preferredTime: normalizeOptionalString(input.preferred_time),
		bookingNotCompletedReason:
			input.notification_type === 'booking_not_completed'
				? normalizeOptionalString(
						input.reason ?? input.message ?? input.requested_action,
					)
				: null,
		message: normalizeOptionalString(input.message),
		requestedAction: normalizeOptionalString(input.requested_action),
		urgency: normalizeOptionalString(input.urgency),
		callrailAccountId: normalizeOptionalString(callrail?.account_id),
		callrailCallId: normalizeOptionalString(
			callrail?.callrail_call_id ?? input.callrail_call_id,
		),
		callrailSessionId: normalizeOptionalString(callrail?.callrail_session_id),
		callrailPersonId: normalizeOptionalString(callrail?.callrail_person_id),
		callrailTimelineUrl: normalizeOptionalString(
			callrail?.callrail_timeline_url,
		),
		callrailSource: normalizeOptionalString(callrail?.callrail_source),
		callrailMedium: normalizeOptionalString(callrail?.callrail_medium),
		callrailLandingPageUrl: normalizeOptionalString(
			callrail?.callrail_landing_page_url,
		),
		callrailLastRequestedUrl: normalizeOptionalString(
			callrail?.callrail_last_requested_url,
		),
		posthogDistinctId: normalizeOptionalString(callrail?.posthog_distinct_id),
		posthogSessionId: normalizeOptionalString(callrail?.posthog_session_id),
		rawPayload: serializeRawPayload({
			callrail,
			input: {
				...input,
				callrail_attribution: undefined,
				client_details: undefined,
				most_recent_appointment: undefined,
				upcoming_appointments: undefined,
			},
		}),
	}
	const select = {
		id: true,
		callrailSessionId: true,
		posthogSessionId: true,
	}
	if (data.retellCallId) {
		return prisma.retellCallOutcome.upsert({
			where: { retellCallId: data.retellCallId },
			create: data,
			update: data,
			select,
		})
	}

	return prisma.retellCallOutcome.create({
		data,
		select,
	})
}

function buildSubject(input: EnrichedStaffMessageInput) {
	const prefix =
		input.notification_type === 'booking_not_completed'
			? 'Booking follow-up'
			: input.notification_type === 'left_message'
				? 'Caller message'
				: 'Caller follow-up'
	const nameOrPhone =
		input.caller_name ?? input.callback_phone ?? input.caller_phone_number
	return nameOrPhone ? `${prefix}: ${nameOrPhone}` : prefix
}

function buildText(input: EnrichedStaffMessageInput) {
	return buildRows(input)
		.map(
			row =>
				`${row.label}: ${row.href ? `${row.value} (${row.href})` : row.value}`,
		)
		.join('\n')
}

function buildHtml(input: EnrichedStaffMessageInput) {
	const rows = buildRows(input)
		.map(
			row =>
				`<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top;">${escapeHtml(row.label)}</th><td style="padding:6px 0;">${formatHtmlValue(row.value, row.href)}</td></tr>`,
		)
		.join('')

	return `<div style="font-family:Arial,sans-serif;line-height:1.45;color:#111827;">
		<h2 style="margin:0 0 12px;">${escapeHtml(buildSubject(input))}</h2>
		<table cellpadding="0" cellspacing="0">${rows}</table>
	</div>`
}

function buildRows(input: EnrichedStaffMessageInput) {
	const retellCallUrl = buildRetellCallUrl(input.call_id)
	const upcomingAppointmentRows = (input.upcoming_appointments ?? []).map(
		(appointment, index) =>
			buildRow(
				`Upcoming appointment ${index + 1}`,
				formatAppointmentSummary(appointment),
				appointment.boulevard_url ?? appointment.booking_management_url,
			),
	)
	return [
		buildRow('Type', formatNotificationType(input.notification_type)),
		buildRow('Caller', input.caller_name),
		buildRow('Caller phone', input.caller_phone_number),
		buildRow('Callback phone', input.callback_phone),
		buildRow('Client ID', input.client_details?.id),
		buildRow(
			'Client name',
			input.client_details?.name,
			input.client_details?.profile_url,
		),
		buildRow('Client first name', input.client_details?.first_name),
		buildRow('Client last name', input.client_details?.last_name),
		buildRow('Client email', input.client_details?.email),
		buildRow('Client phone', input.client_details?.phone),
		buildRow(
			'Client has card on file',
			input.client_details
				? input.client_details.has_card_on_file
					? 'yes'
					: 'no'
				: null,
		),
		buildRow(
			'Most recent appointment',
			formatAppointmentSummary(input.most_recent_appointment),
			input.most_recent_appointment?.boulevard_url ??
				input.most_recent_appointment?.booking_management_url,
		),
		...upcomingAppointmentRows,
		buildRow('Service interest', input.service_interest),
		buildRow('Location interest', input.location_interest),
		buildRow('Preferred time', input.preferred_time),
		buildRow('Reason', input.reason),
		buildRow('Message', input.message),
		buildRow('Requested action', input.requested_action),
		buildRow('Urgency', input.urgency),
		buildRow('Retell call', retellCallUrl),
		buildRow('Retell public log', input.retell_public_log_url),
		buildRow('Call ID', input.call_id),
		buildRow(
			'CallRail call',
			input.callrail_attribution?.callrail_call_id,
			input.callrail_attribution?.callrail_timeline_url,
		),
		buildRow(
			'CallRail session',
			input.callrail_attribution?.callrail_session_id,
		),
		buildRow('PostHog session', input.callrail_attribution?.posthog_session_id),
		buildRow(
			'PostHog distinct ID',
			input.callrail_attribution?.posthog_distinct_id,
		),
	].filter((row): row is EmailRow => Boolean(row))
}

type EmailRow = {
	href: string | null
	label: string
	value: string
}

function buildRow(
	label: string,
	value?: boolean | number | string | null,
	href?: string | null,
): EmailRow | null {
	if (value === null || value === undefined || value === '') return null
	return { href: href ?? null, label, value: String(value) }
}

function formatAppointmentSummary(
	appointment?: StaffMessageAppointmentDetails | null,
) {
	if (!appointment) return null
	const service =
		appointment.spoken_service_names?.[0] ??
		appointment.service_names?.[0] ??
		'Appointment'
	const time =
		appointment.spoken_time ??
		[appointment.local_date, appointment.local_time].filter(Boolean).join(' ')
	const staff = appointment.staff_names?.length
		? ` with ${appointment.staff_names.join(', ')}`
		: ''
	const state = appointment.state ? ` (${appointment.state})` : ''
	return [service, time ? `on ${time}` : null]
		.filter(Boolean)
		.join(' ')
		.concat(staff, state)
}

function buildRetellCallUrl(callId?: string) {
	if (!callId) return null
	const template = process.env.RETELL_CALL_URL_TEMPLATE?.trim()
	if (template) return template.replace('{call_id}', encodeURIComponent(callId))
	return `https://dashboard.retellai.com/calls/${encodeURIComponent(callId)}`
}

function formatNotificationType(
	type: RetellStaffMessageInput['notification_type'],
) {
	if (type === 'booking_not_completed') return 'Booking not completed'
	if (type === 'left_message') return 'Caller left a message'
	return 'Needs follow-up'
}

function formatHtmlValue(value: string, href?: string | null) {
	if (href) {
		return `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>`
	}
	if (/^https?:\/\//i.test(value)) {
		const escaped = escapeHtml(value)
		return `<a href="${escaped}">${escaped}</a>`
	}
	return escapeHtml(value).replace(/\n/g, '<br />')
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}
