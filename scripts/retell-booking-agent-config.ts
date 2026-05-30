import { getRetellPricingSummary } from '../app/utils/service-pricing.ts'

type ToolHeaders = Record<string, string> | undefined

export type RetellBookingBrandConfig = {
	businessName: string
	serviceFocus?: 'all' | 'botox' | 'weight-loss'
}

export const DEFAULT_RETELL_BOOKING_BRAND: RetellBookingBrandConfig = {
	businessName: 'Sarah Hitchcox Aesthetics',
	serviceFocus: 'all',
}

export function getRetellBookingBeginMessage(
	agentDisplayName = 'Adrian',
	brand: RetellBookingBrandConfig = DEFAULT_RETELL_BOOKING_BRAND,
) {
	return `This is ${agentDisplayName} with ${brand.businessName}. How may I help you?`
}

const HUMAN_TRANSFER_NUMBER = '+18652147238'

export function buildRetellToolUrl(publicUrl: string, toolPath: string) {
	const token = getRetellToolUrlToken()
	const normalizedBaseUrl = publicUrl.replace(/\/+$/, '')
	const normalizedToolPath = toolPath.replace(/^\/+|\/+$/g, '')
	return `${normalizedBaseUrl}/${encodeURIComponent(token)}/retell-booking/${normalizedToolPath}`
}

function getRetellToolUrlToken() {
	const token =
		process.env.RETELL_TOOL_URL_TOKEN?.trim() ||
		process.env.RETELL_TOOL_SHARED_SECRET?.trim()
	if (!token) {
		throw new Error(
			'RETELL_TOOL_URL_TOKEN or RETELL_TOOL_SHARED_SECRET is required for Retell tool URLs.',
		)
	}
	return token
}

export function upsertRetellTools({
	brand = DEFAULT_RETELL_BOOKING_BRAND,
	publicUrl,
	toolHeaders,
	tools,
}: {
	brand?: RetellBookingBrandConfig
	publicUrl: string
	toolHeaders: ToolHeaders
	tools: Array<unknown>
}) {
	const callerTool = buildCallerTool(publicUrl, toolHeaders)
	const servicesTool = buildServicesTool(publicUrl, toolHeaders)
	const availabilityTool = buildAvailabilitySummaryTool(publicUrl, toolHeaders)
	const dayAvailabilityTool = buildAvailabilityDayTool(publicUrl, toolHeaders)
	const appointmentsTool = buildAppointmentsTool(publicUrl, toolHeaders)
	const cancelTool = buildCancelTool(publicUrl, toolHeaders)
	const rescheduleAvailabilityTool = buildRescheduleAvailabilityTool(
		publicUrl,
		toolHeaders,
	)
	const rescheduleTool = buildRescheduleTool(publicUrl, toolHeaders)
	const spamTool = buildSpamTool(publicUrl, toolHeaders)
	const bookTool = buildBookTool(publicUrl, toolHeaders)
	const staffMessageTool = buildStaffMessageTool(publicUrl, toolHeaders, brand)
	const transferTool = buildTransferTool(brand)
	let sawCallerTool = false
	let sawServicesTool = false
	let sawAvailabilityTool = false
	let sawDayAvailabilityTool = false
	let sawAppointmentsTool = false
	let sawCancelTool = false
	let sawRescheduleAvailabilityTool = false
	let sawRescheduleTool = false
	let sawSpamTool = false
	let sawBookTool = false
	let sawStaffMessageTool = false
	let sawTransferTool = false
	let sawEndCall = false
	const nextTools = tools.map(tool => {
		if (!tool || typeof tool !== 'object') return tool
		const record = tool as Record<string, unknown>
		if (record.name === 'lookup_caller') {
			sawCallerTool = true
			return {
				...record,
				...callerTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: callerTool.url,
			}
		}
		if (record.name === 'lookup_services') {
			sawServicesTool = true
			return {
				...record,
				...servicesTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: servicesTool.url,
			}
		}
		if (record.name === 'lookup_appointment_availability') {
			sawAvailabilityTool = true
			return {
				...record,
				...availabilityTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: availabilityTool.url,
			}
		}
		if (record.name === 'lookup_appointment_day_availability') {
			sawDayAvailabilityTool = true
			return {
				...record,
				...dayAvailabilityTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: dayAvailabilityTool.url,
			}
		}
		if (record.name === 'lookup_caller_appointments') {
			sawAppointmentsTool = true
			return {
				...record,
				...appointmentsTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: appointmentsTool.url,
			}
		}
		if (record.name === 'cancel_appointment') {
			sawCancelTool = true
			return {
				...record,
				...cancelTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: cancelTool.url,
			}
		}
		if (record.name === 'lookup_reschedule_availability') {
			sawRescheduleAvailabilityTool = true
			return {
				...record,
				...rescheduleAvailabilityTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: rescheduleAvailabilityTool.url,
			}
		}
		if (record.name === 'reschedule_appointment') {
			sawRescheduleTool = true
			return {
				...record,
				...rescheduleTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: rescheduleTool.url,
			}
		}
		if (record.name === 'book_appointment') {
			sawBookTool = true
			return {
				...record,
				...bookTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: bookTool.url,
			}
		}
		if (record.name === 'block_spam_caller') {
			sawSpamTool = true
			return {
				...spamTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: spamTool.url,
			}
		}
		if (record.name === 'send_staff_message') {
			sawStaffMessageTool = true
			return {
				...record,
				...staffMessageTool,
				url:
					typeof record.url === 'string'
						? replaceToolOrigin(record.url, publicUrl)
						: staffMessageTool.url,
			}
		}
		if (
			record.name === 'transfer_to_human' ||
			record.type === 'transfer_call'
		) {
			sawTransferTool = true
			return transferTool
		}
		if (record.type === 'end_call') {
			sawEndCall = true
			return {
				...record,
				description:
					'End the call after the appointment is booked, the caller is done, or immediately after block_spam_caller returns.',
			}
		}
		return record
	})

	if (!sawCallerTool) nextTools.push(callerTool)
	if (!sawServicesTool) nextTools.push(servicesTool)
	if (!sawAvailabilityTool) nextTools.push(availabilityTool)
	if (!sawDayAvailabilityTool) nextTools.push(dayAvailabilityTool)
	if (!sawAppointmentsTool) nextTools.push(appointmentsTool)
	if (!sawCancelTool) nextTools.push(cancelTool)
	if (!sawRescheduleAvailabilityTool) nextTools.push(rescheduleAvailabilityTool)
	if (!sawRescheduleTool) nextTools.push(rescheduleTool)
	if (!sawBookTool) nextTools.push(bookTool)
	if (!sawStaffMessageTool) nextTools.push(staffMessageTool)
	if (!sawSpamTool) nextTools.push(spamTool)
	if (!sawTransferTool) nextTools.push(transferTool)
	if (!sawEndCall) {
		nextTools.push({
			type: 'end_call',
			name: 'end_call',
			description:
				'End the call after the appointment is booked, the caller is done, or immediately after block_spam_caller returns.',
		})
	}
	return nextTools
}

export function buildRetellBookingPrompt(
	brand: RetellBookingBrandConfig = DEFAULT_RETELL_BOOKING_BRAND,
) {
	return buildUpdatedPrompt(buildBasePrompt(brand), brand)
}

export function buildUpdatedPrompt(
	currentPrompt: string | null,
	brand: RetellBookingBrandConfig = DEFAULT_RETELL_BOOKING_BRAND,
) {
	const businessName = brand.businessName
	const staffRecipient =
		businessName === DEFAULT_RETELL_BOOKING_BRAND.businessName
			? 'Sarah'
			: 'the team'
	const availabilityInstruction =
		'Availability handling: Use lookup_appointment_availability first. It returns a compact summary like "today: none; tomorrow: 1:30 PM, 2:30 PM" for today plus the next 3 days, plus exact slot data. Tell the caller the next available appointment first, then offer one or two nearby choices only if helpful. If you offer only some returned times for a date, explicitly say there are other times that day. If the caller asks what times are available, what availability you have, or asks for all options on a specific day, read all returned times for that date when there are six or fewer. If there are more than six returned times, read the first six and say there are more later that day. If the caller asks for a specific day, time window, closest time, exact time, or recurring constraint like Thursdays around 6 PM, call lookup_appointment_day_availability for the relevant date and pass preferred_time when they gave one. If a tool returns matched_requested_slot, say that requested time is available and use that exact slot if the caller confirms. Once the caller selects one of the returned slots, do not switch back to first_available_slot or next_available_slot; book or reschedule the exact selected slot. Only use exact local_time/spoken_time values returned by tools; never invent, round, interpolate, or choose a time from another date. If the requested date has no slots, ask whether they want another day or location.'
	const brandInstruction = buildBrandInstruction(brand)
	const pricingInstruction = `Pricing guidance: Use this as the source of truth for estimated caller-facing prices: ${getRetellPricingSummary({ serviceFocus: brand.serviceFocus })} Say pricing is an estimate or starting point when appropriate, and do not invent exact totals.`
	const identityInstruction =
		'Caller identity: Treat the caller profile returned by lookup_caller or lookup_caller_appointments as the single source of truth for name, phone, email, client type, saved card status, and other contact details. If the caller already stated their name in this call, such as "this is Zane", "my name is Zane", or gave a first and/or last name, and the returned profile name matches that stated name or first name, treat identity as already confirmed and do not ask "Am I speaking with..." again. If a returned profile has a name and the caller has not already stated or confirmed a matching name in this call, ask exactly once, "Am I speaking with [full name]?" After identity is confirmed or matched from their stated name, reuse that profile anywhere a name, phone, email, client type, or caller details are needed; do not ask for first name, last name, phone number, or email again unless a tool explicitly returns missing_client_details or the caller says the profile is wrong. If the profile is missing or the caller says it is not them, ask only for the missing details needed for the current task. For messages or follow-up, use the confirmed profile if available, ask for a name only when no profile/name is available, and ask "Can Sarah call you back at this number?" before asking for another callback number. Keep any context the caller gives and pass it to send_staff_message.'
	const callerLookupInstruction =
		'Caller lookup: When a caller asks to schedule, book, make an appointment, check availability, leave a message, send a message, take a message, request a callback, ask Sarah to call them back, cancel, reschedule, or view appointments, your first action must be the appropriate caller lookup tool: lookup_caller for booking, availability, messages, and callbacks, or lookup_caller_appointments for existing appointments. Run this lookup silently before saying anything else. Do not say "let me look up your profile", "let me check who I am speaking with", "one moment while I look that up", "I will grab a couple details", or any similar narration for caller lookup. For message or callback requests, do not ask "what is your name", "what name should I put on it", or "what is your phone number" until lookup_caller has returned no matched profile or the caller says the matched profile is wrong. Never ask for the caller phone number at the start of booking or message taking. Retell already sends caller ID to tools. Call lookup_caller with caller_phone_number set to null unless the caller has already volunteered a different phone number. Only ask for a phone number if lookup_caller returns new, unknown, or client_not_found and the caller says they are an existing client or says the detected profile is wrong. If lookup_caller returns client_type new or unknown, treat them as a new client unless they correct you. Pass client_type as "returning" or "new" to service and availability tools whenever you know it. If lookup_services returns both new-client and existing-client options, use the confirmed caller status from lookup_caller or lookup_caller_appointments to choose the matching service.'
	const dateSpeechInstruction =
		'When speaking appointment dates, say "today" for appointments on the current date and "tomorrow" for appointments on the next date. For dates after tomorrow, say the normal date, like Monday, June 1st. When offering appointment times, read the slot.spoken_time field exactly. Do not convert start_time yourself because start_time is UTC for booking. Use start_time and time_id only when calling book_appointment. Never invent, round, interpolate, or average appointment times. Only say exact local_time/spoken_time values returned by availability tools. For spoken service names, use service.spoken_name or appointment.spoken_service_names when present. If the caller said Botox, Tox, Dysport, Jeuveau, or Xeomin, do not ask which one they mean; treat it as a Botox appointment and say "Botox appointment" to the caller. Do not say internal Boulevard labels like "Existing Client Tox", "New Client Tox", "Existing Patient", or the full parenthetical Botox/Dysport/Jeuveau/Xeomin name out loud. Use exact internal service.name and service.id only inside tool calls.'
	const returningClientInstruction =
		'Returning-client booking: After the caller chooses a time, call book_appointment with caller_phone_number set to null unless the call object already exposes a number, and set client to null. Do this before asking for email, first name, last name, phone, or SMS verification. Follow Caller identity and do not ask for details already present in the confirmed caller profile. Do not send, request, or mention an SMS verification code for booking; caller ID or a looked-up phone number is enough. Only ask for first name, last name, email, and phone if book_appointment returns missing_client_details. If a saved payment method is available, book_appointment will use it; only collect card details if the tool returns missing_card.'
	const appointmentManagementInstruction =
		'Appointment changes: If the caller wants to cancel, reschedule, move, change, check, or ask when their next existing appointment is, call lookup_caller_appointments first. Never ask for their phone number first, and never ask for SMS verification just to view, cancel, or reschedule upcoming appointments. Do not narrate caller lookup before calling the tool. Follow Caller identity before discussing appointment details. If lookup_caller_appointments returns more than one upcoming appointment, say "I see [number] upcoming appointments," then read every appointment using appointments_summary_text before asking which one they want to reschedule, cancel, or leave as is. Do not mention only the closest appointment when multiple appointments are returned. If lookup_caller_appointments returns one appointment, read that appointment using its exact service/date/time, then ask "Would you like to reschedule it, cancel it, or leave it as is?" Put reschedule before cancel in that order. Before rescheduling, tell the caller the current appointment you found using its exact service/date/time, and confirm that is the appointment they want to move. The service and location are already known from the existing appointment; do not ask what service they want during rescheduling. When the caller says they want to reschedule but has not given a new day, time, or time window yet, ask "Do you have another day or time that works better? Morning or afternoon?" Do this before checking reschedule availability. If they answer morning, afternoon, evening, later, earlier, or a specific day/time, call lookup_reschedule_availability using limit 20 and then only offer times that match that preference. Morning means before noon. Afternoon means noon through 5 PM. Evening or later means after 5 PM. If no returned times match the preferred window, say that and offer the nearest returned times or ask for a different window. To cancel, call cancel_appointment only after the caller confirms the exact appointment. Do not ask for a cancellation reason; use notes like "Caller requested cancellation." To reschedule, call lookup_reschedule_availability for the confirmed appointment. For an open-ended "what availability do you have" reschedule question, ask whether they prefer morning or afternoon unless they already gave a day/time preference. If you offer only the next few reschedule times for a date, explicitly say there are other times that day. If the caller asks for all options or all times on a date, read all returned times for that date when there are six or fewer, otherwise read the first six and say there are more later that day. If the caller asks for a specific new date or time, pass that date and preferred_time; if matched_requested_slot is returned, offer that exact slot first. After the caller confirms a new time returned by lookup_reschedule_availability, call reschedule_appointment only, with the original appointment_id and exact time_id from that slot. Never call book_appointment to reschedule an existing appointment. If tools say not_cancellable or not_reschedulable, tell the caller a team member will need to help.'
	const staffMessageInstruction = `Staff message email: If the caller needs something you cannot complete, prefer taking a message for ${staffRecipient} instead of transferring. For direct message or callback requests, first call lookup_caller silently, then follow Caller identity. If lookup_caller returns a name and the caller has not already stated a matching name in this call, ask exactly once, "Am I speaking with [full name]?" before asking for any missing message details. If the caller already stated a matching name, do not confirm their name again. Do not ask for a caller name when a profile/name is available. If callback is needed and the caller phone is known, ask "Can ${staffRecipient} call you back at this number?" and only ask for a different callback number if they say no. If no profile/name is available after lookup_caller, ask for their name. Collect a brief message and any relevant context, then call send_staff_message with notification_type "left_message" or "needs_follow_up". If send_staff_message returns ok false, say there was a problem sending the message and offer to connect them to ${staffRecipient}. If the caller started booking, asked about availability, pricing, services, or showed interest but chooses not to book, call send_staff_message before ending the call with notification_type "booking_not_completed". Include the service, location, preferred date/time if known, the reason they did not book, and a short message in the caller’s own words. Do not look up appointments just to send a staff message; the send_staff_message endpoint automatically enriches from caller ID with client details, upcoming appointments, most recent appointment, Boulevard links, and a Retell call link when available. Do not send this for spam calls or successfully completed bookings. If the caller insists on speaking to someone live instead of leaving a message, call transfer_to_human.`
	const transferInstruction =
		'Human transfer: If the caller asks to speak to a human, person, staff member, team member, front desk, receptionist, office, Sarah, or says they do not want the AI to continue, briefly say "Sure, I can connect you now." Then immediately call transfer_to_human and stop talking while the transfer runs. Do not explain the transfer, do not give a handoff summary, and do not say you cannot transfer.'
	const spamInstruction = `Spam handling is a hard stop. If the caller is trying to sell ${businessName} anything, asks whether the business is interested in buying anything, offers a long-distance plan, phone plan, warranty, extended warranty, insurance, marketing, SEO, ads, financing, merchant services, staffing, supplies, or any unrelated product or service, immediately call block_spam_caller with a short reason. Also do this if they say they are spam or a spammer, are a robocall, are telemarketing, are abusive, are prank-calling, or explicitly ask to be blocked. Do not clarify first. After block_spam_caller returns, immediately call end_call regardless of whether CallRail marked the call. Do not continue the conversation, do not ask appointment questions, and do not try to book.`
	const phoneInstruction =
		'When calling block_spam_caller, pass caller_phone_number from the current call object if available. If Retell does not expose it, pass null; the tool server will also try to infer it from the call payload.'
	const prompt = currentPrompt?.trim()
	if (!prompt) {
		return `${brandInstruction}\n${pricingInstruction}\n${availabilityInstruction}\n${identityInstruction}\n${callerLookupInstruction}\n${dateSpeechInstruction}\n${returningClientInstruction}\n${appointmentManagementInstruction}\n${staffMessageInstruction}\n${transferInstruction}\n${spamInstruction}\n${phoneInstruction}`
	}
	if (
		prompt.includes(brandInstruction) &&
		prompt.includes(pricingInstruction) &&
		prompt.includes(availabilityInstruction) &&
		prompt.includes(identityInstruction) &&
		prompt.includes(callerLookupInstruction) &&
		prompt.includes(dateSpeechInstruction) &&
		prompt.includes(returningClientInstruction) &&
		prompt.includes(appointmentManagementInstruction) &&
		prompt.includes(staffMessageInstruction) &&
		prompt.includes(transferInstruction) &&
		prompt.includes(spamInstruction) &&
		prompt.includes(phoneInstruction)
	) {
		return prompt
	}

	const withoutManagedLines = prompt
		.split('\n')
		.filter(
			line =>
				!line.includes('If the caller is clearly spam') &&
				!line.includes('Spam handling is a hard stop.') &&
				!line.includes('Brand identity:') &&
				!line.includes('Pricing guidance:') &&
				!line.includes(
					'When calling block_spam_caller, pass caller_phone_number',
				) &&
				!line.includes('Availability handling:') &&
				!line.includes('Availability follow-up:') &&
				!line.includes('Use lookup_appointment_availability first.') &&
				!line.includes(
					'Only say there is no availability when lookup_appointment_availability',
				) &&
				!line.includes('If lookup_appointment_availability returns no slots') &&
				!line.includes('If the caller asks for a later time, afternoon time') &&
				!line.includes('Caller lookup:') &&
				!line.includes('Caller identity:') &&
				!line.includes('When a caller asks to schedule') &&
				!line.includes('Run this lookup silently in the background') &&
				!line.includes(
					'If lookup_caller or lookup_caller_appointments returns a client name',
				) &&
				!line.includes(
					'Never ask for the caller phone number at the start of booking',
				) &&
				!line.includes('When speaking appointment dates, say "today"') &&
				!line.includes('Returning-client booking:') &&
				!line.includes('Do not send, request, or mention an SMS') &&
				!line.includes('Appointment changes:') &&
				!line.includes('Staff message email:') &&
				!line.includes('Human transfer:') &&
				!line.includes(
					'Before booking, confirm the service, location, appointment date and time, first and last name',
				),
		)
		.join('\n')
	return `${withoutManagedLines}\n${brandInstruction}\n${pricingInstruction}\n${availabilityInstruction}\n${identityInstruction}\n${callerLookupInstruction}\n${dateSpeechInstruction}\n${returningClientInstruction}\n${appointmentManagementInstruction}\n${staffMessageInstruction}\n${transferInstruction}\n${spamInstruction}\n${phoneInstruction}`
}

function buildBasePrompt(brand: RetellBookingBrandConfig) {
	return [
		`You are a booking and follow-up agent for ${brand.businessName}.`,
		'Your job is to help callers choose a service, choose Bearden or Farragut, find live Boulevard availability, collect booking details, and book the appointment.',
		'Important service mapping: callers usually say Botox, but Boulevard often names those services Tox. Treat Botox, Tox, Dysport, Jeuveau, Xeomin, neurotoxin, and wrinkle relaxer as the same service family.',
		'Use caller-friendly location names: say "Bearden on Kingston Pike" and "Farragut on Campbell Station" instead of vague labels like Knoxville or raw Boulevard location names.',
		'Do not say an appointment is booked until book_appointment returns ok: true.',
		'Read card collection carefully and do not repeat the full card number back to the caller. Confirm only the name, expiration month/year, and billing ZIP.',
		'If a tool returns ambiguous_service or ambiguous_location, ask one concise question using the returned options.',
		'Offer two or three nearby times at once. If the caller asks for a different day or time window, check availability again using that preference.',
		'If a tool returns missing_booking_questions, ask the required question answers and call book_appointment again with booking_question_answers.',
		'If booking fails because a slot is no longer available, apologize briefly, check availability again, and offer alternatives.',
		'Keep responses concise and conversational.',
	].join('\n')
}

function buildBrandInstruction(brand: RetellBookingBrandConfig) {
	const identityBoundary =
		brand.businessName === DEFAULT_RETELL_BOOKING_BRAND.businessName
			? 'Answer as Sarah Hitchcox Aesthetics.'
			: 'Do not answer as Sarah Hitchcox Aesthetics; this is a separate caller-facing brand.'
	const focus =
		brand.serviceFocus === 'botox'
			? 'This brand focuses on Botox and other neurotoxin appointment requests. If callers ask for Botox, Tox, Dysport, Jeuveau, or Xeomin, treat it as a Botox appointment.'
			: brand.serviceFocus === 'weight-loss'
				? 'This brand focuses on medical weight loss appointments, including semaglutide, tirzepatide, Lipo B12 injections, and weight loss consultations.'
				: 'This brand can help with aesthetics, injectable, laser, skincare, and weight loss appointment requests.'

	return `Brand identity: You answer for ${brand.businessName}. ${identityBoundary} ${focus}`
}

function buildTransferTool(brand: RetellBookingBrandConfig) {
	return {
		type: 'transfer_call',
		name: 'transfer_to_human',
		description: `Transfer the caller to a human at ${brand.businessName} when they ask to speak with a person, staff member, office, front desk, receptionist, Sarah, or say they do not want the AI to continue.`,
		transfer_destination: {
			type: 'predefined',
			number: HUMAN_TRANSFER_NUMBER,
			ignore_e164_validation: false,
		},
		transfer_option: {
			type: 'cold_transfer',
			show_transferee_as_caller: true,
		},
		speak_after_execution: false,
		speak_during_execution: false,
	}
}

function buildStaffMessageTool(
	publicUrl: string,
	toolHeaders: ToolHeaders,
	brand: RetellBookingBrandConfig,
) {
	const staffRecipient =
		brand.businessName === DEFAULT_RETELL_BOOKING_BRAND.businessName
			? 'Sarah'
			: `${brand.businessName} staff`

	return {
		type: 'custom',
		name: 'send_staff_message',
		url: buildRetellToolUrl(publicUrl, 'message'),
		description: `Email ${staffRecipient} when a caller leaves a message, needs human follow-up, or showed booking interest but did not book. Include the reason and service/location/time details when relevant.`,
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				notification_type: {
					type: 'string',
					enum: ['left_message', 'booking_not_completed', 'needs_follow_up'],
					description:
						'Use booking_not_completed when someone was interested or started booking but did not book. Use left_message when taking a message for Sarah. Use needs_follow_up for anything Sarah should handle.',
				},
				caller_name: {
					type: ['string', 'null'],
					description:
						'Caller name from the confirmed caller profile, if known. Do not ask for it if lookup already returned a name. Use null if unknown.',
				},
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number from the call object if known. Use null to rely on server-inferred caller ID and Boulevard client enrichment.',
				},
				callback_phone: {
					type: ['string', 'null'],
					description:
						'Best callback number only if the caller gives a different one. Use null to rely on caller ID.',
				},
				service_interest: {
					type: ['string', 'null'],
					description: 'Service the caller was interested in, if any.',
				},
				location_interest: {
					type: ['string', 'null'],
					description: 'Preferred location, if any.',
				},
				preferred_time: {
					type: ['string', 'null'],
					description: 'Preferred date or time, if any.',
				},
				reason: {
					type: ['string', 'null'],
					description: 'Why they did not book or why Sarah needs to follow up.',
				},
				message: {
					type: ['string', 'null'],
					description:
						'Brief caller message in their own words. Required unless reason or requested_action fully explains the follow-up.',
				},
				requested_action: {
					type: ['string', 'null'],
					description:
						'What Sarah should do next, such as call back, answer a question, or follow up about booking.',
				},
				urgency: {
					type: ['string', 'null'],
					description: 'Urgency if known, such as normal, soon, or urgent.',
				},
				call_id: {
					type: ['string', 'null'],
					description:
						'Retell call id if visible. Use null; the server will infer it when available.',
				},
				retell_public_log_url: {
					type: ['string', 'null'],
					description:
						'Retell public log URL if visible. Use null; the server will infer it when available.',
				},
			},
			required: [
				'notification_type',
				'caller_name',
				'caller_phone_number',
				'callback_phone',
				'service_interest',
				'location_interest',
				'preferred_time',
				'reason',
				'message',
				'requested_action',
				'urgency',
				'call_id',
				'retell_public_log_url',
			],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: false,
		execution_message_description:
			'Do not say anything while sending the message.',
	}
}

function buildCallerTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return {
		type: 'custom',
		name: 'lookup_caller',
		url: buildRetellToolUrl(publicUrl, 'caller'),
		description:
			'Look up the caller in Boulevard by caller ID before asking whether they are a new or returning client, before asking for their name, or before taking a message/callback request. Use this when the caller wants to book, asks about availability, or wants to leave a message.',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number from the Retell call object, if known. Use null if unavailable; the tool server will also infer it from the call payload.',
				},
			},
			required: ['caller_phone_number'],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: false,
		execution_message_description:
			'Do not say anything while this lookup runs.',
	}
}

function buildServicesTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return {
		type: 'custom',
		name: 'lookup_services',
		url: buildRetellToolUrl(publicUrl, 'services'),
		description:
			'Search Boulevard services by caller request. Pass client_type when known so Botox resolves to the right new-client or returning-client service without asking the caller to clarify.',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				service_query: {
					type: ['string', 'null'],
					description:
						'What the caller wants to book, for example Botox, filler, facial, or consultation.',
				},
				client_type: {
					type: ['string', 'null'],
					description:
						'Use returning for a confirmed existing client, new for a new client, or null if unknown.',
				},
				limit: {
					type: ['integer', 'null'],
					description: 'Maximum services to return.',
				},
			},
			required: ['service_query', 'client_type', 'limit'],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment, I am checking that."',
	}
}

function buildAvailabilitySummaryTool(
	publicUrl: string,
	toolHeaders: ToolHeaders,
) {
	return buildAvailabilityTool({
		description:
			'Get a compact Boulevard availability summary for one service and location. Use this first for booking: it returns today plus the next 3 days, the next available slot, and exact slot data for booking.',
		name: 'lookup_appointment_availability',
		url: buildRetellToolUrl(publicUrl, 'availability'),
		toolHeaders,
	})
}

function buildAvailabilityDayTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return buildAvailabilityTool({
		description:
			'Look up exact Boulevard availability for one specific date, service, and location. Use when the caller asks about a specific day, afternoon/morning/evening, closest time, or constraints like Thursdays around 6 PM.',
		name: 'lookup_appointment_day_availability',
		url: buildRetellToolUrl(publicUrl, 'availability-day'),
		toolHeaders,
	})
}

function buildAvailabilityTool({
	description,
	name,
	toolHeaders,
	url,
}: {
	description: string
	name: string
	toolHeaders: ToolHeaders
	url: string
}) {
	return {
		type: 'custom',
		name,
		url,
		description,
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				service_query: {
					type: ['string', 'null'],
					description: 'The service the caller wants to book.',
				},
				client_type: {
					type: ['string', 'null'],
					description:
						'Use returning for a confirmed existing client, new for a new client, or null if unknown.',
				},
				service_id: {
					type: ['string', 'null'],
					description:
						'The Boulevard service id returned by lookup_services, if already known.',
				},
				location_query: {
					type: ['string', 'null'],
					description:
						'The caller preferred location, usually Bearden or Farragut.',
				},
				location_id: {
					type: ['string', 'null'],
					description:
						'The Boulevard location id returned by lookup_services or an availability tool, if known.',
				},
				start_date: {
					type: ['string', 'null'],
					description:
						'Date to start checking, in YYYY-MM-DD format. For the day tool, this is the exact date to check.',
				},
				preferred_time: {
					type: ['string', 'null'],
					description:
						'The exact time the caller requested, like 10:00 AM, if any. Use null if they did not ask for a specific time.',
				},
				days: {
					type: ['integer', 'null'],
					description:
						'How many days to search. Use 4 for the summary tool. The day tool always checks one day.',
				},
				limit: {
					type: ['integer', 'null'],
					description:
						'Maximum preferred result count. The server may return extra exact slots for accuracy.',
				},
			},
			required: [
				'service_query',
				'client_type',
				'service_id',
				'location_query',
				'location_id',
				'start_date',
				'preferred_time',
				'days',
				'limit',
			],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment, I am checking that."',
	}
}

function buildAppointmentsTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return {
		type: 'custom',
		name: 'lookup_caller_appointments',
		url: buildRetellToolUrl(publicUrl, 'appointments'),
		description:
			'Look up upcoming Boulevard appointments for the current caller before cancelling or rescheduling. Use caller_phone_number null so the server can infer caller ID.',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number from the Retell call object, if known. Use null if unavailable.',
				},
				include_cancelled: {
					type: ['boolean', 'null'],
					description:
						'Usually false. Use true only if caller asks about cancelled appointments.',
				},
				limit: {
					type: ['integer', 'null'],
					description: 'Maximum upcoming appointments to return.',
				},
			},
			required: ['caller_phone_number', 'include_cancelled', 'limit'],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: false,
		execution_message_description:
			'Do not say anything while checking appointments.',
	}
}

function buildCancelTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return {
		type: 'custom',
		name: 'cancel_appointment',
		url: buildRetellToolUrl(publicUrl, 'cancel'),
		description:
			'Cancel one caller-owned Boulevard appointment after the caller confirms the exact appointment to cancel. Do not ask the caller for a cancellation reason; use a short note such as "Caller requested cancellation."',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number from the Retell call object, if known. Use null if unavailable.',
				},
				appointment_id: {
					type: 'string',
					description:
						'The exact appointment id returned by lookup_caller_appointments.',
				},
				notes: {
					type: ['string', 'null'],
					description: 'Brief cancellation note or reason.',
				},
			},
			required: ['caller_phone_number', 'appointment_id', 'notes'],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment, I am cancelling that."',
	}
}

function buildRescheduleAvailabilityTool(
	publicUrl: string,
	toolHeaders: ToolHeaders,
) {
	return {
		type: 'custom',
		name: 'lookup_reschedule_availability',
		url: buildRetellToolUrl(publicUrl, 'reschedule-availability'),
		description:
			'Look up exact reschedule times for one caller-owned appointment. Use this after lookup_caller_appointments and before reschedule_appointment. The existing appointment already supplies the service and location.',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number from the Retell call object, if known. Use null if unavailable.',
				},
				appointment_id: {
					type: 'string',
					description:
						'The exact appointment id returned by lookup_caller_appointments.',
				},
				start_date: {
					type: ['string', 'null'],
					description:
						'Date to start checking, in YYYY-MM-DD format. Use caller requested date if any.',
				},
				preferred_time: {
					type: ['string', 'null'],
					description:
						'The exact new appointment time the caller requested, like 10:00 AM, if any. Use null if they did not ask for a specific time.',
				},
				days: {
					type: ['integer', 'null'],
					description: 'How many days to search from start_date.',
				},
				limit: {
					type: ['integer', 'null'],
					description:
						'Maximum reschedule slots to return. Use 20 for open-ended availability questions and 40 if the caller asks for all options.',
				},
			},
			required: [
				'caller_phone_number',
				'appointment_id',
				'start_date',
				'preferred_time',
				'days',
				'limit',
			],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment, I am checking reschedule options."',
	}
}

function buildRescheduleTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return {
		type: 'custom',
		name: 'reschedule_appointment',
		url: buildRetellToolUrl(publicUrl, 'reschedule'),
		description:
			'Move one caller-owned Boulevard appointment to an exact time_id returned by lookup_reschedule_availability after caller confirmation. This is the only tool to use for rescheduling; do not call book_appointment for reschedules.',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number from the Retell call object, if known. Use null if unavailable.',
				},
				appointment_id: {
					type: 'string',
					description:
						'The exact appointment id returned by lookup_caller_appointments.',
				},
				time_id: {
					type: 'string',
					description:
						'The exact time_id returned by lookup_reschedule_availability.',
				},
			},
			required: ['caller_phone_number', 'appointment_id', 'time_id'],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment, I am rescheduling that."',
	}
}

function buildBookTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return {
		type: 'custom',
		name: 'book_appointment',
		url: buildRetellToolUrl(publicUrl, 'book'),
		description:
			'Book a brand-new Boulevard appointment after the caller has explicitly confirmed the service, location, date, and time. Never use this tool to reschedule, move, or change an existing appointment; use reschedule_appointment instead.',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				service_query: {
					type: ['string', 'null'],
					description: 'The confirmed service name.',
				},
				service_id: {
					type: ['string', 'null'],
					description: 'The Boulevard service id, if known.',
				},
				location_query: {
					type: ['string', 'null'],
					description: 'The confirmed location name.',
				},
				location_id: {
					type: ['string', 'null'],
					description: 'The Boulevard location id, if known.',
				},
				start_time: {
					type: 'string',
					description:
						'The exact ISO start_time returned by lookup_appointment_availability.',
				},
				time_id: {
					type: ['string', 'null'],
					description:
						'The exact time_id returned by lookup_appointment_availability.',
				},
				client: {
					type: ['object', 'null'],
					description:
						'Only provide this if Boulevard cannot identify the caller from caller_phone_number or SMS verification.',
					properties: {
						first_name: { type: 'string', description: 'Caller first name.' },
						last_name: { type: 'string', description: 'Caller last name.' },
						email: { type: 'string', description: 'Caller email address.' },
						phone: { type: 'string', description: 'Caller mobile phone.' },
					},
					additionalProperties: false,
				},
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number from the Retell call object, if known. Use null if unavailable; the tool server will also infer it from the call payload.',
				},
				card: {
					type: ['object', 'null'],
					description:
						'Card details for Boulevard when a card is required and no saved payment method is available.',
					required: [
						'name',
						'number',
						'exp_month',
						'exp_year',
						'cvc',
						'postal_code',
					],
					properties: {
						name: { type: 'string', description: 'Name on card.' },
						number: { type: 'string', description: 'Card number.' },
						exp_month: { type: 'integer', description: 'Expiration month.' },
						exp_year: {
							type: 'integer',
							description: 'Four digit expiration year.',
						},
						cvc: { type: 'string', description: 'Card security code.' },
						postal_code: { type: 'string', description: 'Billing ZIP code.' },
					},
					additionalProperties: false,
				},
				booking_question_answers: {
					type: 'array',
					description:
						'Answers to required Boulevard booking questions returned by a previous book_appointment error.',
					items: {
						type: 'object',
						properties: {
							question_id: { type: ['string', 'null'] },
							question_label: { type: ['string', 'null'] },
							value: {
								type: ['string', 'number', 'boolean', 'array', 'null'],
								description:
									'Answer value. For select questions, use the option id or label.',
								items: { type: 'string' },
							},
						},
						required: ['question_id', 'question_label', 'value'],
						additionalProperties: false,
					},
				},
				notes: {
					type: ['string', 'null'],
					description: 'Optional notes for the Boulevard appointment.',
				},
			},
			required: [
				'service_query',
				'service_id',
				'location_query',
				'location_id',
				'start_time',
				'time_id',
				'client',
				'caller_phone_number',
				'card',
				'booking_question_answers',
				'notes',
			],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment, I am booking that."',
	}
}

function buildSpamTool(publicUrl: string, toolHeaders: ToolHeaders) {
	return {
		type: 'custom',
		name: 'block_spam_caller',
		url: buildRetellToolUrl(publicUrl, 'spam'),
		description:
			'Mark the current caller as spam in CallRail when the call is spam, a robocall, telemarketing, abusive, prank, or the caller says they are a spammer. Pass the current caller phone number from the call object when available; if unavailable, pass null. After this tool returns, immediately call end_call even if CallRail could not find the call.',
		headers: toolHeaders,
		method: 'POST',
		parameters: {
			type: 'object',
			properties: {
				caller_phone_number: {
					type: ['string', 'null'],
					description:
						'Caller phone number in E.164 format if known. Use null if the call object already provides it.',
				},
				callrail_call_id: {
					type: ['string', 'null'],
					description:
						'CallRail call id if known from metadata. Use null if unavailable.',
				},
				account_id: {
					type: ['string', 'null'],
					description:
						'CallRail account id if known. Use null to use CALLRAIL_ACCOUNT_ID or auto-discovery.',
				},
				reason: {
					type: ['string', 'null'],
					description:
						'Short reason the caller is spam, for example robocall, telemarketer, abusive, or prank.',
				},
			},
			required: [
				'caller_phone_number',
				'callrail_call_id',
				'account_id',
				'reason',
			],
			additionalProperties: false,
		},
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say only "One moment." Do not ask booking questions for spam callers.',
	}
}

function replaceToolOrigin(url: string, publicUrl: string) {
	try {
		const parsed = new URL(url)
		const nextBase = new URL(publicUrl)
		const retellBookingMatch = parsed.pathname.match(
			/(?:^|\/)(?:resources\/)?retell-booking\/(.+)$/,
		)
		if (retellBookingMatch?.[1]) {
			return buildRetellToolUrl(publicUrl, retellBookingMatch[1])
		}
		if (
			/(?:^|\/)(?:resources\/)?retell-callrail\/spam$/.test(parsed.pathname)
		) {
			return buildRetellToolUrl(publicUrl, 'spam')
		}
		parsed.protocol = nextBase.protocol
		parsed.host = nextBase.host
		return parsed.toString()
	} catch {
		return url
	}
}
