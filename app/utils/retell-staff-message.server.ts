import { z } from 'zod'

import { lookupVoiceCallerStaffContext } from '#app/utils/blvd-voice-booking.server.ts'
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

	const enrichedInput = await enrichStaffMessageInput(input)
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
		client_enriched: Boolean(enrichedInput.client_details),
		email_id: result.data.id,
		has_most_recent_appointment: Boolean(enrichedInput.most_recent_appointment),
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
