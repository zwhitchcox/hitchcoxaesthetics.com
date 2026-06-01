import { config as loadDotenv } from 'dotenv'

import {
	buildRetellToolUrl,
	buildRetellBookingPrompt,
	upsertRetellTools,
} from './retell-booking-agent-config.ts'

loadDotenv({ override: true })

const RETELL_API_BASE_URL = 'https://api.retellai.com'

const apiKey = process.env.RETELL_API_KEY?.trim()
const baseUrl = process.env.RETELL_AGENT_WEBHOOK_BASE_URL?.trim()
const sharedSecret = process.env.RETELL_TOOL_SHARED_SECRET?.trim()
const textModel = process.env.RETELL_TEST_AGENT_MODEL?.trim() || 'gpt-5.1'
const voiceId =
	process.env.RETELL_TEST_AGENT_VOICE_ID?.trim() ?? '11labs-Adrian'
const realtimeModel =
	process.env.RETELL_TEST_AGENT_S2S_MODEL?.trim() || 'gpt-realtime-2'

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
			'Look up the caller in Boulevard by caller ID before asking whether they are a new or returning client. Use this when the caller wants to book or asks about appointments.',
		name: 'lookup_caller',
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
		url: buildRetellToolUrl(normalizedBaseUrl, 'caller'),
	}),
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
		url: buildRetellToolUrl(normalizedBaseUrl, 'services'),
	}),
	customTool({
		description:
			'Get a compact Boulevard availability summary for one service and location. Use this first for booking: it returns today plus the next 3 days, the next available slot, and exact slot data for booking.',
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
					description:
						'The caller preferred location, usually Bearden or Farragut.',
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
		url: buildRetellToolUrl(normalizedBaseUrl, 'availability'),
	}),
	customTool({
		description:
			'Look up exact Boulevard availability for one specific date, service, and location. Use when the caller asks about a specific day, afternoon/morning/evening, closest time, or constraints like Thursdays around 6 PM.',
		name: 'lookup_appointment_day_availability',
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
						'Exact date to check, in YYYY-MM-DD format or ISO timestamp.',
				},
				days: {
					type: ['integer', 'null'],
					description: 'Ignored by this endpoint; it checks one day.',
				},
				limit: {
					type: ['integer', 'null'],
					description:
						'Maximum preferred result count. The server may return extra exact slots for accuracy.',
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
		url: buildRetellToolUrl(normalizedBaseUrl, 'availability-day'),
	}),
	customTool({
		description:
			'Book a Boulevard appointment after the caller has explicitly confirmed the service, location, date, and time. Use caller phone or SMS verification for returning clients before asking for email/name.',
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
				ownership_code_id: {
					type: ['string', 'null'],
					description:
						'The ownership_code_id returned by a previous client_verification_required result.',
				},
				ownership_code_value: {
					type: ['string', 'null'],
					description:
						'The 6-digit verification code the caller received by SMS.',
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
				'ownership_code_id',
				'ownership_code_value',
				'card',
				'booking_question_answers',
				'notes',
			],
			additionalProperties: false,
		},
		url: buildRetellToolUrl(normalizedBaseUrl, 'book'),
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
		url: buildRetellToolUrl(normalizedBaseUrl, 'spam'),
	}),
	{
		type: 'end_call',
		name: 'end_call',
		description:
			'End the call after the appointment is booked, the caller is done, or immediately after block_spam_caller returns.',
	},
]

const llm = await retellFetch('/create-retell-llm', {
	begin_message: null,
	general_prompt: buildRetellBookingPrompt(undefined, agentDisplayName),
	general_tools: upsertRetellTools({
		publicUrl: normalizedBaseUrl,
		toolHeaders,
		tools,
	}),
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
