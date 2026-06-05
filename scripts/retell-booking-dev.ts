import { spawn, type ChildProcess } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ override: true })

const DEFAULT_PORT = 4000
const DEFAULT_AGENT_ID = 'agent_178c33cf9d7656523e2195005f'
const DEFAULT_LLM_ID = 'llm_07c575abf8676e565f273447b229'
const DEFAULT_PHONE_NUMBER = '+18656068139'
const DEFAULT_S2S_MODEL = 'gpt-realtime-2'
const REQUIRED_PHONE_NUMBER_TYPE = 'retell-twilio'

const port = Number(process.env.PORT || DEFAULT_PORT)
const agentId = process.env.RETELL_TEST_AGENT_ID?.trim() || DEFAULT_AGENT_ID
const llmId = process.env.RETELL_TEST_LLM_ID?.trim() || DEFAULT_LLM_ID
const configuredPhoneNumber =
	process.env.RETELL_TEST_PHONE_NUMBER?.trim() || DEFAULT_PHONE_NUMBER
const agentDisplayName =
	process.env.RETELL_TEST_AGENT_DISPLAY_NAME?.trim() || 'Adrian'
const realtimeModel =
	process.env.RETELL_TEST_AGENT_S2S_MODEL?.trim() || DEFAULT_S2S_MODEL
const apiKey = process.env.RETELL_API_KEY?.trim()
const sharedSecret = process.env.RETELL_TOOL_SHARED_SECRET?.trim()
const toolHeaders = sharedSecret
	? { 'x-retell-tool-secret': sharedSecret }
	: undefined
type RetellPhoneNumber = {
	e164: string
	pretty: string
	type: string | null
}
const retellAgentWatchFiles = [
	'scripts/retell-booking-agent-config.ts',
	'scripts/retell-booking-dev.ts',
	'scripts/retell-create-booking-agent.ts',
	'app/utils/service-pricing.ts',
	'app/routes/$token.retell-booking+/caller.ts',
	'app/routes/$token.retell-booking+/services.ts',
	'app/routes/$token.retell-booking+/availability.ts',
	'app/routes/$token.retell-booking+/availability-day.ts',
	'app/routes/$token.retell-booking+/appointments.ts',
	'app/routes/$token.retell-booking+/book.ts',
	'app/routes/$token.retell-booking+/cancel.ts',
	'app/routes/$token.retell-booking+/message.ts',
	'app/routes/$token.retell-booking+/reschedule-availability.ts',
	'app/routes/$token.retell-booking+/reschedule.ts',
	'app/routes/$token.retell-booking+/spam.ts',
	'app/utils/blvd-voice-booking.server.ts',
	'app/utils/retell-staff-message.server.ts',
	'app/utils/retell-tools.server.ts',
	'app/utils/callrail-spam.server.ts',
]

if (!apiKey) {
	throw new Error('RETELL_API_KEY is required in .env.')
}

const children: ChildProcess[] = []
const retellAgentWatchers: FSWatcher[] = []

process.on('SIGINT', () => {
	for (const child of children) child.kill('SIGINT')
	process.exit(0)
})

process.on('SIGTERM', () => {
	for (const child of children) child.kill('SIGTERM')
	process.exit(0)
})

await ensureAppServer()
const publicUrl = await ensureNgrok()
await updateEnvValue('RETELL_AGENT_WEBHOOK_BASE_URL', publicUrl)
await updateRetellToolUrls(publicUrl)
await smokeTest(publicUrl)
const phoneNumber = await findAgentPhoneNumber()
if (phoneNumber) await bindPhoneNumberToAgent(phoneNumber.e164)

console.log('')
console.log('Retell booking test environment is ready.')
console.log(`Local app: http://localhost:${port}`)
console.log(`ngrok URL: ${publicUrl}`)
console.log(`Retell agent: ${agentId}`)
console.log(`Retell LLM: ${llmId}`)
if (phoneNumber) {
	console.log(`Phone number: ${phoneNumber.pretty} (${phoneNumber.e164})`)
} else {
	console.log('Phone number: none found for this Retell agent')
}
if (!process.env.CALLRAIL_API_KEY?.trim()) {
	console.log(
		'CallRail spam blocking: disabled until CALLRAIL_API_KEY is set in .env and the app is restarted',
	)
} else {
	console.log('CallRail spam blocking: enabled')
}
console.log('')
console.log('Leave this process running while you test the Retell agent.')
watchRetellAgentFiles(publicUrl)

setInterval(() => {}, 60_000)

async function ensureAppServer() {
	if (await isUrlOk(`http://localhost:${port}`)) {
		console.log(`App is already running on localhost:${port}.`)
		return
	}

	console.log(`Starting app on localhost:${port}...`)
	children.push(
		spawn('pnpm', ['run', 'dev'], {
			env: { ...process.env, PORT: String(port) },
			stdio: 'inherit',
		}),
	)
	await waitForUrl(`http://localhost:${port}`, 90_000)
}

async function ensureNgrok() {
	const existing = await getNgrokPublicUrl()
	if (existing) {
		console.log(`ngrok is already running at ${existing}.`)
		return existing
	}

	console.log(`Starting ngrok for localhost:${port}...`)
	children.push(spawn('ngrok', ['http', String(port)], { stdio: 'ignore' }))

	const startedAt = Date.now()
	while (Date.now() - startedAt < 45_000) {
		const publicUrl = await getNgrokPublicUrl()
		if (publicUrl) return publicUrl
		await sleep(1000)
	}

	throw new Error('Timed out waiting for ngrok to expose a public URL.')
}

async function updateRetellToolUrls(publicUrl: string) {
	const llm = await retellFetch(`/get-retell-llm/${llmId}`, undefined, 'GET')
	const existingTools = readArray(llm, 'general_tools')
	const agentConfig = await loadRetellAgentConfig()
	const tools = agentConfig
		.upsertRetellTools({
			publicUrl,
			toolHeaders,
			tools: existingTools,
		})
		.map(tool => {
			if (!tool || typeof tool !== 'object') return tool
			const record = tool as Record<string, unknown>
			if (record.type !== 'custom' || typeof record.url !== 'string')
				return tool

			return {
				...record,
				url: replaceToolOrigin(record.url, publicUrl),
			}
		})

	const updated = await retellFetch(`/update-retell-llm/${llmId}`, {
		begin_message: null,
		general_prompt: agentConfig.buildUpdatedPrompt(
			readString(llm, 'general_prompt'),
			undefined,
			agentDisplayName,
		),
		general_tools: tools,
		s2s_model: realtimeModel,
	})
	const firstToolUrl = readArray(updated, 'general_tools').find(
		tool =>
			tool &&
			typeof tool === 'object' &&
			(tool as Record<string, unknown>).type === 'custom',
	)

	console.log(
		`Updated Retell tool URLs. First custom tool: ${
			(firstToolUrl as Record<string, unknown> | undefined)?.url ?? 'none'
		}`,
	)
}

async function loadRetellAgentConfig() {
	const configUrl = pathToFileURL(
		`${process.cwd()}/scripts/retell-booking-agent-config.ts`,
	)
	configUrl.searchParams.set('updatedAt', String(Date.now()))
	try {
		const mod = (await import(configUrl.toString())) as {
			buildUpdatedPrompt: typeof buildUpdatedPrompt
			upsertRetellTools: (input: {
				publicUrl: string
				toolHeaders: typeof toolHeaders
				tools: Array<unknown>
			}) => Array<unknown>
		}
		return mod
	} catch (error) {
		console.error('Failed to load Retell agent config module', error)
		return {
			buildUpdatedPrompt,
			upsertRetellTools: ({
				publicUrl,
				tools,
			}: {
				publicUrl: string
				toolHeaders: typeof toolHeaders
				tools: Array<unknown>
			}) => upsertSpamTools(tools, publicUrl),
		}
	}
}

function watchRetellAgentFiles(publicUrl: string) {
	let debounce: NodeJS.Timeout | null = null
	let updating = false
	let queued = false

	async function runUpdate(changedPath: string) {
		if (updating) {
			queued = true
			return
		}
		updating = true
		try {
			console.log(`Retell agent file changed: ${changedPath}`)
			await updateRetellToolUrls(publicUrl)
			console.log('Retell dev agent updated.')
		} catch (error) {
			console.error(
				'Failed to update Retell dev agent after file change',
				error,
			)
		} finally {
			updating = false
			if (queued) {
				queued = false
				await runUpdate('queued change')
			}
		}
	}

	retellAgentWatchFiles.forEach(relativePath => {
		try {
			const watcher = watch(relativePath, { persistent: false }, eventType => {
				if (eventType !== 'change' && eventType !== 'rename') return
				if (debounce) clearTimeout(debounce)
				debounce = setTimeout(() => {
					void runUpdate(relativePath)
				}, 750)
			})
			retellAgentWatchers.push(watcher)
		} catch (error) {
			console.warn(`Could not watch ${relativePath}:`, error)
		}
	})

	console.log(
		`Watching ${retellAgentWatchers.length} Retell agent/config files for dev updates.`,
	)
}

function upsertSpamTools(tools: Array<unknown>, publicUrl: string) {
	const callerTool = buildCallerTool(publicUrl)
	const spamTool = buildSpamTool(publicUrl)
	const bookTool = buildBookTool(publicUrl)
	let sawCallerTool = false
	let sawSpamTool = false
	let sawBookTool = false
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
		if (record.type === 'end_call') {
			sawEndCall = true
			return {
				...record,
				description:
					'End the call only after the appointment is booked, immediately after block_spam_caller returns, or after the caller clearly says goodbye or says they need no more help. Do not end the call after an incomplete or ambiguous phrase like "okay", "that is", or "I will think about it"; ask one brief follow-up instead.',
			}
		}
		return record
	})

	if (!sawCallerTool) nextTools.push(callerTool)
	if (!sawBookTool) nextTools.push(bookTool)
	if (!sawSpamTool) nextTools.push(spamTool)
	if (!sawEndCall) {
		nextTools.push({
			type: 'end_call',
			name: 'end_call',
			description:
				'End the call only after the appointment is booked, immediately after block_spam_caller returns, or after the caller clearly says goodbye or says they need no more help. Do not end the call after an incomplete or ambiguous phrase like "okay", "that is", or "I will think about it"; ask one brief follow-up instead.',
		})
	}
	return nextTools
}

function buildCallerTool(publicUrl: string) {
	return {
		type: 'custom',
		name: 'lookup_caller',
		url: buildRetellToolUrl(publicUrl, 'caller'),
		description:
			'Look up the caller in Boulevard by caller ID before asking whether they are a new or returning client. Use this when the caller wants to book or asks about appointments.',
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
		speak_during_execution: true,
		execution_message_description:
			'Say a brief natural message like "One moment."',
	}
}

function buildBookTool(publicUrl: string) {
	return {
		type: 'custom',
		name: 'book_appointment',
		url: buildRetellToolUrl(publicUrl, 'book'),
		description:
			'Book a Boulevard appointment after the caller has explicitly confirmed the service, location, date, and time. Use caller phone or SMS verification for returning clients before asking for email/name.',
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
				'ownership_code_id',
				'ownership_code_value',
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

function buildSpamTool(publicUrl: string) {
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

function buildUpdatedPrompt(
	currentPrompt: string | null,
	_brand?: unknown,
	agentDisplayName = 'Adrian',
) {
	const openingInstruction = `Start of call: Dynamically generate the first spoken message. Your first sentence must be exactly "This is ${agentDisplayName} with Sarah Hitchcox Aesthetics. How may I help you?" Do not add anything before it.`
	const availabilityInstruction =
		'Availability handling: When calling lookup_appointment_availability, location_id must be a full Boulevard id returned by a tool, such as urn:blvd:Location:... Do not put Bearden, Farragut, Knoxville, or any plain location name in location_id. Put plain names only in location_query. If lookup_appointment_availability returns location_unavailable, do not tell the caller that there are no appointments. If the returned locations include the caller requested location, call lookup_appointment_availability again using that returned location id. Otherwise ask one concise location follow-up. Only say there is no availability when lookup_appointment_availability returns ok: true with an empty slots array. If slots are returned, offer two or three of those times immediately. If the caller asks for a later time, afternoon time, or a specific time like 3:30 PM, only compare slots on the requested date using available_times_by_date or slots with the matching local_date/spoken_date. Do not choose a time from another date. Do not say there are only earlier slots if a later returned slot exists on that same date.'
	const callerLookupInstruction =
		'Caller lookup: Never ask for the caller phone number at the start of booking. Retell already sends caller ID to tools. If a caller wants to book or asks for availability, call lookup_caller before asking whether they are new or returning, with caller_phone_number set to null if you do not already have it. If the caller asks to book but has not said the service yet, still call lookup_caller first. If lookup_caller returns client_type returning, treat them as a returning client and do not ask whether they are new or returning. If lookup_caller returns a client name, remember it and use it when the caller asks how you know they are returning or asks whether you know their name. Do not say you do not have their name when lookup_caller returned client.first_name, client.last_name, or client.name. If lookup_caller returns client_type new or unknown, treat them as a new client unless they correct you. If lookup_services returns both new-client and existing-client options, use the status from lookup_caller to choose the matching service.'
	const dateSpeechInstruction =
		'When speaking appointment dates, say "today" for appointments on the current date and "tomorrow" for appointments on the next date. For dates after tomorrow, say the normal date, like Monday, June 1st. When offering appointment times, read the slot.spoken_time field exactly. Do not convert start_time yourself because start_time is UTC for booking. Use start_time and time_id only when calling book_appointment. Never invent, round, interpolate, or average appointment times. Only say exact local_time/spoken_time values returned by lookup_appointment_availability. When offering appointment times, say the exact matched service name once, such as "for Existing Client Tox" or "for New Client Tox", so callers know which service availability you checked.'
	const returningClientInstruction =
		'Returning-client booking: After the caller chooses a time, call book_appointment with caller_phone_number from the current call object if available, and set client to null. Do this before asking for email or name. If book_appointment returns client_verification_required, ask for the SMS code and call book_appointment again with the same appointment plus ownership_code_id and ownership_code_value. Only ask for first name, last name, email, and phone if book_appointment returns missing_client_details. If a saved payment method is available, book_appointment will use it; only collect card details if the tool returns missing_card.'
	const closingInstruction =
		'Closing calls: Do not call end_call just because a caller says "okay", "thanks", "that is", pauses, trails off, or says they need to look into pricing. For pricing or service questions, answer the question, then ask one concise follow-up like "Would you like me to check availability?" or "Would you like Sarah to follow up?" Only call end_call after the caller clearly says goodbye, says they do not need anything else, or after block_spam_caller returns.'
	const spamInstruction =
		'Spam handling is a hard stop. If the caller is trying to sell Sarah Hitchcox Aesthetics anything, asks whether the business is interested in buying anything, offers a long-distance plan, phone plan, warranty, extended warranty, insurance, marketing, SEO, ads, financing, merchant services, staffing, supplies, or any unrelated product or service, immediately call block_spam_caller with a short reason. Also do this if they say they are spam or a spammer, are a robocall, are telemarketing, are abusive, are prank-calling, or explicitly ask to be blocked. Do not clarify first. After block_spam_caller returns, immediately call end_call regardless of whether CallRail marked the call. Do not continue the conversation, do not ask appointment questions, and do not try to book.'
	const phoneInstruction =
		'When calling block_spam_caller, pass caller_phone_number from the current call object if available. If Retell does not expose it, pass null; the tool server will also try to infer it from the call payload.'
	const prompt = currentPrompt?.trim()
	if (!prompt) {
		return `${openingInstruction}\n${availabilityInstruction}\n${callerLookupInstruction}\n${dateSpeechInstruction}\n${returningClientInstruction}\n${closingInstruction}\n${spamInstruction}\n${phoneInstruction}`
	}
	if (
		prompt.includes(openingInstruction) &&
		prompt.includes(availabilityInstruction) &&
		prompt.includes(callerLookupInstruction) &&
		prompt.includes(dateSpeechInstruction) &&
		prompt.includes(returningClientInstruction) &&
		prompt.includes(closingInstruction) &&
		prompt.includes(spamInstruction) &&
		prompt.includes(phoneInstruction)
	) {
		return prompt
	}

	const withoutOldSpamLine = prompt
		.split('\n')
		.filter(
			line =>
				!line.includes('If the caller is clearly spam') &&
				!line.includes('Spam handling is a hard stop.') &&
				!line.includes('Start of call:') &&
				!line.includes(
					'When calling block_spam_caller, pass caller_phone_number',
				) &&
				!line.includes('Availability handling:') &&
				!line.includes('Caller lookup:') &&
				!line.includes('When speaking appointment dates, say "today"') &&
				!line.includes('Returning-client booking:') &&
				!line.includes('Closing calls:') &&
				!line.includes(
					'Before booking, confirm the service, location, appointment date and time, first and last name',
				),
		)
		.join('\n')
	return `${withoutOldSpamLine}\n${openingInstruction}\n${availabilityInstruction}\n${callerLookupInstruction}\n${dateSpeechInstruction}\n${returningClientInstruction}\n${closingInstruction}\n${spamInstruction}\n${phoneInstruction}`
}

async function smokeTest(publicUrl: string) {
	const response = await fetch(buildRetellToolUrl(publicUrl, 'services'), {
		body: JSON.stringify({
			args: {
				limit: 1,
				service_query: 'botox',
			},
		}),
		headers: {
			'Content-Type': 'application/json',
			...(process.env.RETELL_TOOL_SHARED_SECRET
				? { 'x-retell-tool-secret': process.env.RETELL_TOOL_SHARED_SECRET }
				: {}),
		},
		method: 'POST',
	})

	if (!response.ok) {
		throw new Error(`Retell tool smoke test failed with ${response.status}.`)
	}
}

async function findAgentPhoneNumber(): Promise<RetellPhoneNumber | null> {
	const configured = await getConfiguredPhoneNumber()
	if (configured) {
		assertTwilioPhoneNumber(configured)
		return configured
	}

	const phoneNumbers = await listRetellPhoneNumbers()

	const match = phoneNumbers.find(phoneNumber => {
		if (!phoneNumber || typeof phoneNumber !== 'object') return false
		const record = phoneNumber as Record<string, unknown>
		if (record.phone_number_type !== REQUIRED_PHONE_NUMBER_TYPE) return false
		return (
			record.inbound_agent_id === agentId ||
			(Array.isArray(record.inbound_agents) &&
				record.inbound_agents.some(
					inboundAgent =>
						inboundAgent &&
						typeof inboundAgent === 'object' &&
						(inboundAgent as Record<string, unknown>).agent_id === agentId,
				))
		)
	})

	if (!match || typeof match !== 'object') return null
	const record = match as Record<string, unknown>
	const e164 =
		typeof record.phone_number === 'string' ? record.phone_number : null
	const pretty =
		typeof record.phone_number_pretty === 'string'
			? record.phone_number_pretty
			: e164
	const type =
		typeof record.phone_number_type === 'string'
			? record.phone_number_type
			: null

	return e164 && pretty ? { e164, pretty, type } : null
}

async function listRetellPhoneNumbers() {
	const phoneNumbers: Array<unknown> = []
	let paginationKey: string | null = null
	let hasMore = true

	while (hasMore) {
		const params = new URLSearchParams({ limit: '1000' })
		if (paginationKey) params.set('pagination_key', paginationKey)
		const payload = (await retellFetch(
			`/v2/list-phone-numbers?${params}`,
			undefined,
			'GET',
		)) as unknown
		phoneNumbers.push(...readArray(payload, 'items'))
		paginationKey = readString(payload, 'pagination_key')
		hasMore =
			Boolean(
				payload &&
					typeof payload === 'object' &&
					(payload as Record<string, unknown>).has_more,
			) && Boolean(paginationKey)
	}

	return phoneNumbers
}

async function getConfiguredPhoneNumber(): Promise<RetellPhoneNumber | null> {
	try {
		const phoneNumber = (await retellFetch(
			`/get-phone-number/${encodeURIComponent(configuredPhoneNumber)}`,
			undefined,
			'GET',
		)) as unknown
		if (!phoneNumber || typeof phoneNumber !== 'object') return null
		const record = phoneNumber as Record<string, unknown>
		const e164 =
			typeof record.phone_number === 'string' ? record.phone_number : null
		const pretty =
			typeof record.phone_number_pretty === 'string'
				? record.phone_number_pretty
				: e164
		const type =
			typeof record.phone_number_type === 'string'
				? record.phone_number_type
				: null
		return e164 && pretty ? { e164, pretty, type } : null
	} catch {
		return null
	}
}

async function bindPhoneNumberToAgent(phoneNumber: string) {
	const retellPhoneNumber = await getRetellPhoneNumber(phoneNumber)
	assertTwilioPhoneNumber(retellPhoneNumber)

	const updated = await retellFetch(
		`/update-phone-number/${encodeURIComponent(phoneNumber)}`,
		{
			inbound_agent_id: agentId,
			inbound_agents: [
				{
					agent_id: agentId,
					weight: 1,
				},
			],
			inbound_webhook_url: null,
		},
	)
	const record =
		updated && typeof updated === 'object'
			? (updated as Record<string, unknown>)
			: {}
	console.log(
		`Bound phone number to Retell agent: ${record.inbound_agent_id ?? agentId}`,
	)
}

async function getRetellPhoneNumber(
	phoneNumber: string,
): Promise<RetellPhoneNumber> {
	const phoneNumberRecord = (await retellFetch(
		`/get-phone-number/${encodeURIComponent(phoneNumber)}`,
		undefined,
		'GET',
	)) as unknown
	if (!phoneNumberRecord || typeof phoneNumberRecord !== 'object') {
		throw new Error(`Retell phone number not found: ${phoneNumber}`)
	}
	const record = phoneNumberRecord as Record<string, unknown>
	const e164 =
		typeof record.phone_number === 'string' ? record.phone_number : null
	const pretty =
		typeof record.phone_number_pretty === 'string'
			? record.phone_number_pretty
			: e164
	const type =
		typeof record.phone_number_type === 'string'
			? record.phone_number_type
			: null
	if (!e164 || !pretty) {
		throw new Error('Retell phone number response was missing phone fields.')
	}
	return { e164, pretty, type }
}

function assertTwilioPhoneNumber(phoneNumber: RetellPhoneNumber) {
	if (phoneNumber.type === REQUIRED_PHONE_NUMBER_TYPE) return
	throw new Error(
		`Refusing to use ${phoneNumber.pretty} (${phoneNumber.e164}) because it is ${phoneNumber.type ?? 'unknown type'}, not ${REQUIRED_PHONE_NUMBER_TYPE}. Use a Retell Twilio number so transferred calls can preserve caller ID.`,
	)
}

function replaceToolOrigin(url: string, publicUrl: string) {
	const current = new URL(url)
	const retellBookingMatch = current.pathname.match(
		/(?:^|\/)(?:resources\/)?retell-booking\/(.+)$/,
	)
	if (retellBookingMatch?.[1]) {
		return buildRetellToolUrl(publicUrl, retellBookingMatch[1])
	}
	if (/(?:^|\/)(?:resources\/)?retell-callrail\/spam$/.test(current.pathname)) {
		return buildRetellToolUrl(publicUrl, 'spam')
	}
	return `${publicUrl.replace(/\/+$/, '')}${current.pathname}`
}

function buildRetellToolUrl(publicUrl: string, toolPath: string) {
	const token =
		process.env.RETELL_TOOL_URL_TOKEN?.trim() ||
		process.env.RETELL_TOOL_SHARED_SECRET?.trim()
	if (!token) {
		throw new Error(
			'RETELL_TOOL_URL_TOKEN or RETELL_TOOL_SHARED_SECRET is required for Retell tool URLs.',
		)
	}
	return `${publicUrl.replace(/\/+$/, '')}/${encodeURIComponent(token)}/retell-booking/${toolPath.replace(/^\/+|\/+$/g, '')}`
}

async function getNgrokPublicUrl() {
	try {
		const response = await fetch('http://127.0.0.1:4040/api/tunnels')
		if (!response.ok) return null
		const data = (await response.json()) as {
			tunnels?: Array<{ public_url?: string; proto?: string }>
		}
		return (
			data.tunnels?.find(tunnel => tunnel.proto === 'https')?.public_url ?? null
		)
	} catch {
		return null
	}
}

async function isUrlOk(url: string) {
	try {
		const response = await fetch(url)
		return response.ok || response.status < 500
	} catch {
		return false
	}
}

async function waitForUrl(url: string, timeoutMs: number) {
	const startedAt = Date.now()
	while (Date.now() - startedAt < timeoutMs) {
		if (await isUrlOk(url)) return
		await sleep(1000)
	}
	throw new Error(`Timed out waiting for ${url}.`)
}

async function retellFetch(
	path: string,
	body?: Record<string, unknown>,
	method = 'PATCH',
) {
	const response = await fetch(`https://api.retellai.com${path}`, {
		body: body ? JSON.stringify(body) : undefined,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		method,
	})
	const payload = (await response.json().catch(() => null)) as unknown
	if (!response.ok) {
		throw new Error(
			`Retell ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
		)
	}
	return payload
}

function readArray(value: unknown, key: string) {
	if (!value || typeof value !== 'object') return []
	const raw = (value as Record<string, unknown>)[key]
	return Array.isArray(raw) ? raw : []
}

function readString(value: unknown, key: string) {
	if (!value || typeof value !== 'object') return null
	const raw = (value as Record<string, unknown>)[key]
	return typeof raw === 'string' ? raw : null
}

async function updateEnvValue(key: string, value: string) {
	const envPath = '.env'
	let contents = ''
	try {
		contents = await readFile(envPath, 'utf8')
	} catch {
		contents = ''
	}

	const line = `${key}=${value}`
	const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm')
	const nextContents = pattern.test(contents)
		? contents.replace(pattern, line)
		: `${contents.trimEnd()}\n${line}\n`

	if (nextContents !== contents) {
		await writeFile(envPath, nextContents)
		console.log(`Updated ${envPath}: ${key}`)
	}
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}
