import 'dotenv/config'

const RETELL_API_BASE_URL = 'https://api.retellai.com'

const apiKey = process.env.RETELL_API_KEY?.trim()
const baseUrl = process.env.RETELL_AGENT_WEBHOOK_BASE_URL?.trim()
const sharedSecret = process.env.RETELL_TOOL_SHARED_SECRET?.trim()
const textModel = process.env.RETELL_TEST_AGENT_MODEL?.trim() || 'gpt-5.1'
const voiceId = process.env.RETELL_TEST_AGENT_VOICE_ID?.trim() ?? '11labs-Adrian'
const realtimeModel =
	process.env.RETELL_TEST_AGENT_S2S_MODEL?.trim() || null

if (!apiKey) {
	throw new Error('RETELL_API_KEY is required.')
}

if (!baseUrl) {
	throw new Error(
		'RETELL_AGENT_WEBHOOK_BASE_URL is required, for example https://abc123.ngrok-free.app',
	)
}

const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
const toolHeaders = sharedSecret
	? { 'x-retell-tool-secret': sharedSecret }
	: undefined
const agentDisplayName =
	process.env.RETELL_TEST_AGENT_DISPLAY_NAME?.trim() ?? 'Adrian'

const tools = [
	customTool({
		description:
			'Search Boulevard services when the caller describes what treatment they want. Use before checking availability if the service is unclear.',
		name: 'lookup_services',
		parameters: {
			type: 'object',
			properties: {
				service_query: {
					type: ['string', 'null'],
					description:
						'The service or treatment the caller is asking about, such as Botox, lip filler, consultation, or weight loss.',
				},
				limit: {
					type: ['integer', 'null'],
					description: 'Maximum number of matching services to return.',
				},
			},
			required: ['service_query', 'limit'],
			additionalProperties: false,
		},
		url: `${normalizedBaseUrl}/resources/retell-booking/services`,
	}),
	customTool({
		description:
			'Check real Boulevard appointment availability for one service and one preferred location. If the response asks for a service or location, ask the caller a short follow-up question.',
		name: 'lookup_appointment_availability',
		parameters: {
			type: 'object',
			properties: {
				service_query: {
					type: ['string', 'null'],
					description: 'The service the caller wants to book.',
				},
				service_id: {
					type: ['string', 'null'],
					description:
						'The Boulevard service id returned by lookup_services, if already known.',
				},
				location_query: {
					type: ['string', 'null'],
					description: 'The caller preferred location, usually Bearden or Farragut.',
				},
				location_id: {
					type: ['string', 'null'],
					description:
						'The Boulevard location id returned by this tool, if already known.',
				},
				start_date: {
					type: ['string', 'null'],
					description:
						'Optional earliest date to check, in YYYY-MM-DD format or ISO timestamp.',
				},
				days: {
					type: ['integer', 'null'],
					description: 'How many days to search from start_date.',
				},
				limit: {
					type: ['integer', 'null'],
					description: 'Maximum number of appointment slots to return.',
				},
			},
			required: [
				'service_query',
				'service_id',
				'location_query',
				'location_id',
				'start_date',
				'days',
				'limit',
			],
			additionalProperties: false,
		},
		url: `${normalizedBaseUrl}/resources/retell-booking/availability`,
	}),
	customTool({
		description:
			'Book a Boulevard appointment after the caller has explicitly confirmed the service, location, date, time, contact information, and card details if required.',
		name: 'book_appointment',
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
					type: 'object',
					required: ['first_name', 'last_name', 'email', 'phone'],
					properties: {
						first_name: { type: 'string', description: 'Caller first name.' },
						last_name: { type: 'string', description: 'Caller last name.' },
						email: { type: 'string', description: 'Caller email address.' },
						phone: { type: 'string', description: 'Caller mobile phone.' },
					},
					additionalProperties: false,
				},
				card: {
					type: ['object', 'null'],
					description:
						'Card details for Boulevard when a card is required to reserve the appointment.',
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
						exp_year: { type: 'integer', description: 'Four digit expiration year.' },
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
				'card',
				'booking_question_answers',
				'notes',
			],
			additionalProperties: false,
		},
		url: `${normalizedBaseUrl}/resources/retell-booking/book`,
	}),
	customTool({
		description:
			'Mark the current caller as spam in CallRail when the call is spam, a robocall, telemarketing, abusive, prank, or the caller says they are a spammer. Pass the current caller phone number from the call object when available; if unavailable, pass null. After this tool returns, immediately call end_call even if CallRail could not find the call.',
		name: 'block_spam_caller',
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
		url: `${normalizedBaseUrl}/resources/retell-callrail/spam`,
	}),
	{
		type: 'end_call',
		name: 'end_call',
		description:
			'End the call after the appointment is booked, the caller is done, or immediately after block_spam_caller returns.',
	},
]

const llm = await retellFetch('/create-retell-llm', {
	begin_message: `Sarah Hitchcox Aesthetics, this is ${agentDisplayName}. How may I help you?`,
	general_prompt: buildPrompt(),
	general_tools: tools,
	...(realtimeModel ? { s2s_model: realtimeModel } : { model: textModel }),
	model_temperature: 0,
	start_speaker: 'agent',
	tool_call_strict_mode: true,
})

const llmId = readRequiredString(llm, 'llm_id')
const agent = await retellFetch('/create-agent', {
	agent_name: 'SHA Booking Test Agent',
	response_engine: {
		llm_id: llmId,
		type: 'retell-llm',
	},
	voice_id: voiceId,
})

console.log(
	JSON.stringify(
		{
			agent_id: readRequiredString(agent, 'agent_id'),
			llm_id: llmId,
			webhook_base_url: normalizedBaseUrl,
		},
		null,
		2,
	),
)

function customTool({
	description,
	name,
	parameters,
	url,
}: {
	description: string
	name: string
	parameters: Record<string, unknown>
	url: string
}) {
	return {
		type: 'custom',
		name,
		url,
		description,
		headers: toolHeaders,
		method: 'POST',
		parameters,
		speak_after_execution: true,
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment, I am checking that."',
	}
}

function buildPrompt() {
	return [
		'You are a test booking agent for Sarah Hitchcox Aesthetics in Knoxville, TN.',
		'Your job is to help callers choose a service, choose Bearden or Farragut, find live Boulevard availability, collect booking details, and book the appointment.',
		'Important service mapping: callers usually say Botox, but Boulevard often names those services Tox. Treat Botox, Tox, Dysport, Jeuveau, Xeomin, neurotoxin, and wrinkle relaxer as the same service family.',
		'If a caller asks for Botox and lookup_services returns both new-client and existing-client Tox services, ask whether they are a new or returning client, then use that exact service id for availability.',
		'Use caller-friendly location names: say "Bearden on Kingston Pike" and "Farragut on Campbell Station" instead of vague labels like Knoxville or raw Boulevard location names.',
		'Do not say an appointment is booked until book_appointment returns ok: true.',
		'Before booking, confirm the service, location, appointment date and time, first and last name, email, phone, and required card details.',
		'Read card collection carefully and do not repeat the full card number back to the caller. Confirm only the name, expiration month/year, and billing ZIP.',
		'If a tool returns ambiguous_service or ambiguous_location, ask one concise question using the returned options.',
		'If lookup_appointment_availability returns no slots but includes next_available_slot, offer that exact next opening and ask if it works. If it returns no next_available_slot, ask what day or time range the caller would like to try next.',
		'When offering appointment times, prefer slots that are close together on the same day or adjacent days, especially the earliest clustered group returned by availability. Do not scatter options across many dates unless the caller asks for more choices or only scattered times are available.',
		'Offer two or three nearby times at once. If the caller asks for a different day or time window, check availability again using that preference.',
		'If a tool returns missing_booking_questions, ask the required question answers and call book_appointment again with booking_question_answers.',
		'If booking fails because a slot is no longer available, apologize briefly, check availability again, and offer alternatives.',
		'Spam handling is a hard stop. If the caller is trying to sell Sarah Hitchcox Aesthetics anything, asks whether the business is interested in buying anything, offers a long-distance plan, phone plan, warranty, extended warranty, insurance, marketing, SEO, ads, financing, merchant services, staffing, supplies, or any unrelated product or service, immediately call block_spam_caller with a short reason. Also do this if they say they are spam or a spammer, are a robocall, are telemarketing, are abusive, are prank-calling, or explicitly ask to be blocked. Do not clarify first. After block_spam_caller returns, immediately call end_call regardless of whether CallRail marked the call. Do not continue the conversation, do not ask appointment questions, and do not try to book.',
		'When calling block_spam_caller, pass caller_phone_number from the current call object if available. If Retell does not expose it, pass null; the tool server will also try to infer it from the call payload.',
		'Keep responses concise and conversational.',
	].join('\n')
}

async function retellFetch(path: string, body: Record<string, unknown>) {
	const response = await fetch(`${RETELL_API_BASE_URL}${path}`, {
		body: JSON.stringify(body),
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		method: 'POST',
	})
	const payload = (await response.json().catch(() => null)) as unknown
	if (!response.ok) {
		throw new Error(
			`Retell ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
		)
	}
	return payload
}

function readRequiredString(value: unknown, key: string) {
	if (!value || typeof value !== 'object') {
		throw new Error(`Expected Retell response object with ${key}.`)
	}
	const record = value as Record<string, unknown>
	if (typeof record[key] !== 'string' || !record[key]) {
		throw new Error(`Expected Retell response field ${key}.`)
	}
	return record[key]
}
