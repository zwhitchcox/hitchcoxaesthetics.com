import { config as loadDotenv } from 'dotenv'
import OpenAI from 'openai'
import {
	type ChatCompletionMessageParam,
	type ChatCompletionMessageToolCall,
	type ChatCompletionTool,
} from 'openai/resources/chat/completions'

import {
	buildRetellBookingPrompt,
	getRetellBookingBeginMessage,
	upsertRetellTools,
} from './retell-booking-agent-config.ts'
import {
	getRetellBookingAgentBrand,
	getRetellBookingAgentBrandKeys,
	type RetellBookingBrandKey,
} from './retell-booking-brands.ts'

loadDotenv()

const DEFAULT_AGENT_MODEL =
	process.env.RETELL_A2A_AGENT_MODEL ?? 'openai/gpt-5.1-mini'
const DEFAULT_CALLER_MODEL =
	process.env.RETELL_A2A_CALLER_MODEL ?? 'openai/gpt-5.1-mini'
const TEST_LOCAL_DATE = 'Saturday, May 30, 2026'
const TEST_TIME_ZONE = 'America/New_York'
const TEST_PHONE = '+18652101404'

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue }

type JsonRecord = Record<string, JsonValue>

type ToolCallLog = {
	args: JsonRecord
	name: string
	result: JsonValue
}

type TranscriptEntry = {
	speaker: 'agent' | 'caller' | 'tool'
	text: string
	tool?: ToolCallLog
}

type ToolArgExpectation = {
	message: string
	predicate: (args: JsonRecord, calls: ToolCallLog[]) => boolean
	tool: string
}

type Scenario = {
	callerFacts: string[]
	description: string
	expectedToolSubsequence: string[]
	firstCallerUtterance: string
	forbiddenAgentPatterns?: Array<{ message: string; pattern: RegExp }>
	forbiddenTools?: string[]
	maxTurns?: number
	name: string
	requiredAgentPatterns?: Array<{ message: string; pattern: RegExp }>
	requiredToolArgs?: ToolArgExpectation[]
	stopAfterTools?: string[]
}

type CliOptions = {
	agentModel: string
	brand: RetellBookingBrandKey
	callerModel: string
	list: boolean
	maxTurns: number
	scenario: string
	verbose: boolean
}

type RetellToolRecord = {
	description?: unknown
	name?: unknown
	parameters?: unknown
	type?: unknown
}

const baseClient = {
	email: 'emily.carter@example.com',
	first_name: 'Emily',
	has_card_on_file: true,
	id: 'blvd_client_emily',
	last_name: 'Carter',
	name: 'Emily Carter',
	phone: TEST_PHONE,
	profile_url: 'https://dashboard.boulevard.io/clients/blvd_client_emily',
}

const beardenLocation = {
	address: '5113 Kingston Pike Suite 15, Knoxville, TN 37919',
	id: 'blvd_location_bearden',
	landmark_hints: {
		fallbacks: ['near Kroger', 'near Harvest'],
		primary: 'near Nama',
	},
	name: 'Knoxville (Bearden)',
	spoken_name: 'Bearden on Kingston Pike',
}

const farragutLocation = {
	address: '102 S Campbell Station Rd Suite 8, Knoxville, TN 37934',
	id: 'blvd_location_farragut',
	landmark_hints: {
		fallbacks: [
			'across from the Starbucks at Kingston Pike and Campbell Station',
		],
		primary: "in old Aubrey's off Kingston Pike",
	},
	name: 'Farragut',
	spoken_name: 'Farragut on Campbell Station',
}

const botoxService = {
	duration_minutes: 30,
	id: 'svc_existing_tox',
	name: 'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
	price_display: 'Tox pricing starts at $13/unit',
	spoken_name: 'Botox appointment',
}

const todaySlots = [
	{
		date_label: 'today',
		local_date: '2026-05-30',
		local_time: '2:45 PM',
		spoken_time: 'today at 2:45 PM',
		start_time: '2026-05-30T18:45:00.000Z',
		time_id: 'time_today_245',
	},
	{
		date_label: 'today',
		local_date: '2026-05-30',
		local_time: '4:45 PM',
		spoken_time: 'today at 4:45 PM',
		start_time: '2026-05-30T20:45:00.000Z',
		time_id: 'time_today_445',
	},
]

const tomorrowSlots = [
	{
		date_label: 'tomorrow',
		local_date: '2026-05-31',
		local_time: '10:30 AM',
		spoken_time: 'tomorrow at 10:30 AM',
		start_time: '2026-05-31T14:30:00.000Z',
		time_id: 'time_tomorrow_1030',
	},
	{
		date_label: 'tomorrow',
		local_date: '2026-05-31',
		local_time: '11:30 AM',
		spoken_time: 'tomorrow at 11:30 AM',
		start_time: '2026-05-31T15:30:00.000Z',
		time_id: 'time_tomorrow_1130',
	},
	{
		date_label: 'tomorrow',
		local_date: '2026-05-31',
		local_time: '1:00 PM',
		spoken_time: 'tomorrow at 1:00 PM',
		start_time: '2026-05-31T17:00:00.000Z',
		time_id: 'time_tomorrow_100',
	},
	{
		date_label: 'tomorrow',
		local_date: '2026-05-31',
		local_time: '2:00 PM',
		spoken_time: 'tomorrow at 2:00 PM',
		start_time: '2026-05-31T18:00:00.000Z',
		time_id: 'time_tomorrow_200',
	},
	{
		date_label: 'tomorrow',
		local_date: '2026-05-31',
		local_time: '2:30 PM',
		spoken_time: 'tomorrow at 2:30 PM',
		start_time: '2026-05-31T18:30:00.000Z',
		time_id: 'time_tomorrow_230',
	},
	{
		date_label: 'tomorrow',
		local_date: '2026-05-31',
		local_time: '3:30 PM',
		spoken_time: 'tomorrow at 3:30 PM',
		start_time: '2026-05-31T19:30:00.000Z',
		time_id: 'time_tomorrow_330',
	},
]

const thursdayRescheduleSlots = [
	{
		date_label: 'Thursday, June 4th',
		local_date: '2026-06-04',
		local_time: '1:30 PM',
		spoken_time: 'Thursday, June 4th at 1:30 PM',
		start_time: '2026-06-04T17:30:00.000Z',
		time_id: 'resched_thu_130',
	},
	{
		date_label: 'Thursday, June 4th',
		local_date: '2026-06-04',
		local_time: '2:30 PM',
		spoken_time: 'Thursday, June 4th at 2:30 PM',
		start_time: '2026-06-04T18:30:00.000Z',
		time_id: 'resched_thu_230',
	},
	{
		date_label: 'Thursday, June 4th',
		local_date: '2026-06-04',
		local_time: '3:30 PM',
		spoken_time: 'Thursday, June 4th at 3:30 PM',
		start_time: '2026-06-04T19:30:00.000Z',
		time_id: 'resched_thu_330',
	},
]

const singleUpcomingAppointment = {
	appointment_id: 'apt_botox_1',
	boulevard_url:
		'https://dashboard.boulevard.io/calendar?appointmentId=apt_botox_1',
	local_date: '2026-06-02',
	local_time: '11:00 AM',
	location: beardenLocation,
	service_names: [botoxService.name],
	spoken_service_names: [botoxService.spoken_name],
	spoken_time: 'Tuesday, June 2nd at 11:00 AM',
	staff_names: ['Sarah Hitchcox'],
}

const weightLossAppointment = {
	appointment_id: 'apt_weight_loss_1',
	boulevard_url:
		'https://dashboard.boulevard.io/calendar?appointmentId=apt_weight_loss_1',
	local_date: '2026-06-05',
	local_time: '12:45 PM',
	location: farragutLocation,
	service_names: ['Weight Loss Injection (In Person)'],
	spoken_service_names: ['Weight loss appointment'],
	spoken_time: 'Friday, June 5th at 12:45 PM',
	staff_names: ['Sarah Hitchcox'],
}

const scenarios: Scenario[] = [
	{
		callerFacts: [
			'You are Emily Carter calling from the phone number on your profile.',
			'You are a returning client and want Botox at Bearden today.',
			'If offered today at 2:45 PM, choose it and confirm you want to book.',
		],
		description:
			'Returning Botox booking should use caller lookup, exact slots, and book with the existing profile.',
		expectedToolSubsequence: [
			'lookup_caller',
			'lookup_services',
			'lookup_appointment_availability',
			'book_appointment',
		],
		firstCallerUtterance:
			"Hi, this is Emily. I'd like to book Botox at Bearden today.",
		forbiddenAgentPatterns: [
			{
				message: 'Asked whether a looked-up caller is new or returning.',
				pattern: /\b(new|returning) client\b.*\?/i,
			},
			{
				message: 'Asked for caller phone or email even though profile exists.',
				pattern: /(phone number|email address|verification code)/i,
			},
			{
				message: 'Used internal Boulevard tox label instead of Botox.',
				pattern: /(Existing Client Tox|New Client Tox|Botox\/Dysport)/i,
			},
			{
				message: 'Invented a time that was not returned by the tool.',
				pattern: /(7:00 PM|8:45 PM|9:45 PM|3:00 PM|5:45 PM)/i,
			},
		],
		forbiddenTools: ['reschedule_appointment', 'cancel_appointment'],
		maxTurns: 10,
		name: 'book-returning-botox',
		requiredAgentPatterns: [
			{
				message: 'Did not speak about the selected service as Botox.',
				pattern: /Botox/i,
			},
			{
				message: 'Did not offer the exact 2:45 PM slot.',
				pattern: /2:45 PM/i,
			},
		],
		requiredToolArgs: [
			{
				message:
					'book_appointment did not use the exact selected 2:45 PM slot.',
				predicate: args =>
					args.time_id === 'time_today_245' ||
					args.start_time === '2026-05-30T18:45:00.000Z',
				tool: 'book_appointment',
			},
			{
				message:
					'book_appointment should rely on caller ID/profile for a returning client.',
				predicate: args => args.client === null,
				tool: 'book_appointment',
			},
		],
		stopAfterTools: ['book_appointment'],
	},
	{
		callerFacts: [
			'You are Emily Carter.',
			'You only want to hear all Botox times available today at Bearden.',
			'Do not book anything in this scenario.',
		],
		description:
			'Availability readback should use exact returned times and say today/tomorrow naturally.',
		expectedToolSubsequence: [
			'lookup_caller',
			'lookup_services',
			'lookup_appointment_availability',
		],
		firstCallerUtterance:
			'What Botox times do you have today at the Bearden office?',
		forbiddenAgentPatterns: [
			{
				message:
					'Said today has no availability even though the tool returned slots.',
				pattern: /(no availability|nothing available|not available today)/i,
			},
			{
				message: 'Invented one of the historically wrong availability times.',
				pattern: /(7:00 PM|8:45 PM|9:45 PM|3:00 PM|5:45 PM|3:15 PM)/i,
			},
			{
				message: 'Said the full date instead of today for the current date.',
				pattern: /(May 30|Sat, May 30|Saturday, May 30)/i,
			},
		],
		forbiddenTools: ['book_appointment', 'reschedule_appointment'],
		maxTurns: 6,
		name: 'availability-exact-times',
		requiredAgentPatterns: [
			{
				message: 'Did not include today at 2:45 PM.',
				pattern: /today.*2:45 PM|2:45 PM.*today/i,
			},
			{
				message: 'Did not include today at 4:45 PM.',
				pattern: /today.*4:45 PM|4:45 PM.*today/i,
			},
		],
	},
	{
		callerFacts: [
			'You are Emily Carter.',
			'You have one upcoming Botox appointment already.',
			'You want to move that existing appointment to Thursday afternoon.',
			'If offered Thursday at 3:30 PM, choose it and confirm.',
		],
		description:
			'Rescheduling should use the existing appointment service/location and never create a second appointment.',
		expectedToolSubsequence: [
			'lookup_caller_appointments',
			'lookup_reschedule_availability',
			'reschedule_appointment',
		],
		firstCallerUtterance:
			'I need to move my appointment to Thursday afternoon.',
		forbiddenAgentPatterns: [
			{
				message: 'Asked what service to book while rescheduling.',
				pattern: /(what service|which service|Botox, filler|looking to book)/i,
			},
			{
				message:
					'Asked whether to cancel/reschedule/leave as-is after the caller already requested a move.',
				pattern: /(cancel,? reschedule|reschedule,? cancel|leave (it )?as is)/i,
			},
			{
				message: 'Mentioned the historically wrong 3:15 PM slot.',
				pattern: /3:15 PM/i,
			},
		],
		forbiddenTools: ['book_appointment', 'lookup_services'],
		maxTurns: 10,
		name: 'reschedule-thursday-afternoon',
		requiredAgentPatterns: [
			{
				message: 'Did not offer the exact 3:30 PM reschedule slot.',
				pattern: /3:30 PM/i,
			},
		],
		requiredToolArgs: [
			{
				message:
					'lookup_reschedule_availability should preserve the Thursday afternoon preference.',
				predicate: args =>
					String(args.start_date ?? '').includes('2026-06-04') ||
					/thursday|afternoon/i.test(String(args.preferred_time ?? '')),
				tool: 'lookup_reschedule_availability',
			},
			{
				message:
					'reschedule_appointment did not use the selected 3:30 PM slot.',
				predicate: args => args.time_id === 'resched_thu_330',
				tool: 'reschedule_appointment',
			},
		],
		stopAfterTools: ['reschedule_appointment'],
	},
	{
		callerFacts: [
			'You are Emily Carter.',
			'You want to know every upcoming appointment you have.',
			'Do not cancel or reschedule anything.',
		],
		description:
			'Appointment lookup should report all upcoming appointments instead of only one.',
		expectedToolSubsequence: ['lookup_caller_appointments'],
		firstCallerUtterance: 'Can you tell me what appointments I have coming up?',
		forbiddenTools: [
			'book_appointment',
			'cancel_appointment',
			'reschedule_appointment',
		],
		maxTurns: 5,
		name: 'multiple-upcoming-appointments',
		requiredAgentPatterns: [
			{
				message: 'Did not say there are two upcoming appointments.',
				pattern: /\b(2|two) upcoming appointments\b/i,
			},
			{
				message: 'Did not mention the Botox appointment.',
				pattern: /Botox/i,
			},
			{
				message: 'Did not mention the weight loss appointment.',
				pattern: /weight loss/i,
			},
		],
	},
	{
		callerFacts: [
			'You are Emily Carter and you said your name in the first sentence.',
			'You want to leave Sarah a message that you are running ten minutes late.',
			'If asked whether Sarah can call back at this number, say yes.',
		],
		description:
			'Message taking should silently look up the caller and avoid duplicate name/phone questions.',
		expectedToolSubsequence: ['lookup_caller', 'send_staff_message'],
		firstCallerUtterance:
			'This is Emily. Can you tell Sarah I am running ten minutes late?',
		forbiddenAgentPatterns: [
			{
				message: 'Asked for a name even though profile/name already matched.',
				pattern:
					/(what(?:'s| is) your name|what name|first and last name|Am I speaking with Emily Carter)/i,
			},
			{
				message: 'Asked for phone number even though caller ID is enough.',
				pattern: /(phone number|callback number)/i,
			},
			{
				message: 'Announced profile lookup instead of doing it silently.',
				pattern:
					/(look up your profile|pull up your profile|check who I am speaking with)/i,
			},
		],
		forbiddenTools: ['book_appointment'],
		maxTurns: 8,
		name: 'staff-message-uses-profile',
		requiredToolArgs: [
			{
				message: 'send_staff_message should pass the caller name from lookup.',
				predicate: args => args.caller_name === 'Emily Carter',
				tool: 'send_staff_message',
			},
			{
				message: 'send_staff_message should include the late-arrival context.',
				predicate: args => /ten minutes late/i.test(JSON.stringify(args)),
				tool: 'send_staff_message',
			},
		],
		stopAfterTools: ['send_staff_message'],
	},
	{
		callerFacts: [
			'You are a telemarketer.',
			'You are trying to sell the business a long-distance phone plan.',
			'Do not ask for appointments.',
		],
		description:
			'Spam sales calls should be blocked and ended without appointment questions.',
		expectedToolSubsequence: ['block_spam_caller', 'end_call'],
		firstCallerUtterance:
			'Hi, would you be interested in buying a long-distance phone plan?',
		forbiddenAgentPatterns: [
			{
				message: 'Asked appointment questions after a spam sales pitch.',
				pattern: /(appointment|service|availability|book)/i,
			},
		],
		forbiddenTools: [
			'lookup_caller',
			'lookup_services',
			'lookup_appointment_availability',
			'book_appointment',
		],
		maxTurns: 4,
		name: 'spam-blocks-and-hangs-up',
		stopAfterTools: ['end_call'],
	},
	{
		callerFacts: [
			'You want to speak to a human immediately.',
			'If the agent offers a message instead, insist on being transferred.',
		],
		description:
			'Human requests should cold-transfer without a long warm-transfer handoff.',
		expectedToolSubsequence: ['transfer_to_human'],
		firstCallerUtterance: 'I want to speak to a person at the office.',
		forbiddenAgentPatterns: [
			{
				message:
					'Gave a long transfer explanation instead of a quick cold transfer.',
				pattern:
					/(I(?:'| wi)ll let them know|explain the situation|summary|handoff|brief them)/i,
			},
		],
		forbiddenTools: ['send_staff_message', 'book_appointment'],
		maxTurns: 4,
		name: 'cold-transfer-human',
		stopAfterTools: ['transfer_to_human'],
	},
]

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		agentModel: DEFAULT_AGENT_MODEL,
		brand: 'sarah',
		callerModel: DEFAULT_CALLER_MODEL,
		list: false,
		maxTurns: 10,
		scenario: 'all',
		verbose: false,
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		const next = argv[index + 1]
		if (arg === '--list') {
			options.list = true
		} else if (arg === '--verbose') {
			options.verbose = true
		} else if (arg === '--scenario' && next) {
			options.scenario = next
			index += 1
		} else if (arg === '--brand' && next) {
			assertBrandKey(next)
			options.brand = next
			index += 1
		} else if (arg === '--agent-model' && next) {
			options.agentModel = next
			index += 1
		} else if (arg === '--caller-model' && next) {
			options.callerModel = next
			index += 1
		} else if (arg === '--max-turns' && next) {
			options.maxTurns = Number.parseInt(next, 10)
			index += 1
		} else {
			throw new Error(`Unknown argument: ${arg}`)
		}
	}

	return options
}

function assertBrandKey(value: string): asserts value is RetellBookingBrandKey {
	const allowed = getRetellBookingAgentBrandKeys()
	if (!allowed.includes(value as RetellBookingBrandKey)) {
		throw new Error(
			`Unknown brand "${value}". Expected one of: ${allowed.join(', ')}`,
		)
	}
}

function pickScenarios(name: string) {
	if (name === 'all') return scenarios
	const scenario = scenarios.find(candidate => candidate.name === name)
	if (!scenario) {
		throw new Error(
			`Unknown scenario "${name}". Run with --list to see available scenarios.`,
		)
	}
	return [scenario]
}

function buildOpenAiTools(brand: RetellBookingBrandKey): ChatCompletionTool[] {
	if (!process.env.RETELL_TOOL_URL_TOKEN) {
		process.env.RETELL_TOOL_URL_TOKEN = 'agent2agent-test-token'
	}
	const retellTools = upsertRetellTools({
		brand: getRetellBookingAgentBrand(brand),
		publicUrl: 'https://agent2agent.test',
		toolHeaders: undefined,
		tools: [],
	})

	return retellTools
		.map(tool => toOpenAiTool(tool as RetellToolRecord))
		.filter((tool): tool is ChatCompletionTool => tool !== null)
}

function toOpenAiTool(tool: RetellToolRecord): ChatCompletionTool | null {
	const name =
		typeof tool.name === 'string'
			? tool.name
			: tool.type === 'end_call'
				? 'end_call'
				: null
	if (!name) return null

	const parameters =
		isJsonObject(tool.parameters) && tool.parameters.type === 'object'
			? tool.parameters
			: {
					additionalProperties: false,
					properties: {},
					type: 'object',
				}

	return {
		function: {
			description:
				typeof tool.description === 'string' ? tool.description : name,
			name,
			parameters,
		},
		type: 'function',
	}
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function runScenario({
	openai,
	options,
	scenario,
	tools,
}: {
	openai: OpenAI
	options: CliOptions
	scenario: Scenario
	tools: ChatCompletionTool[]
}) {
	const brand = getRetellBookingAgentBrand(options.brand)
	const transcript: TranscriptEntry[] = [
		{
			speaker: 'agent',
			text: getRetellBookingBeginMessage(brand.agentDisplayName, brand),
		},
		{ speaker: 'caller', text: scenario.firstCallerUtterance },
	]
	const toolCalls: ToolCallLog[] = []
	const agentMessages: ChatCompletionMessageParam[] = [
		{
			content: [
				buildRetellBookingPrompt(brand, brand.agentDisplayName),
				'',
				'Manual agent-to-agent test harness:',
				`- Current local date is ${TEST_LOCAL_DATE} in ${TEST_TIME_ZONE}.`,
				'- Use tools exactly as you would in Retell.',
				'- Do not mention that this is a test.',
				'- Keep spoken responses short and natural for a phone call.',
				'- Do not invent tool outputs. Only say appointment times and caller details returned by tools.',
			].join('\n'),
			role: 'system',
		},
		{ content: transcript[0]?.text ?? '', role: 'assistant' },
		{ content: scenario.firstCallerUtterance, role: 'user' },
	]
	let totalInputTokens = 0
	let totalOutputTokens = 0
	let stoppedByTerminalTool = false
	const maxTurns = scenario.maxTurns ?? options.maxTurns

	for (let turn = 0; turn < maxTurns; turn += 1) {
		const agentResult = await runAgentUntilSpoken({
			agentMessages,
			openai,
			scenario,
			tools,
			toolCalls,
			transcript,
			model: options.agentModel,
		})
		totalInputTokens += agentResult.inputTokens
		totalOutputTokens += agentResult.outputTokens
		if (agentResult.stoppedByTerminalTool) {
			stoppedByTerminalTool = true
			break
		}

		const callerResult = await runCallerTurn({
			openai,
			scenario,
			transcript,
			model: options.callerModel,
		})
		totalInputTokens += callerResult.inputTokens
		totalOutputTokens += callerResult.outputTokens

		if (callerResult.text === '[DONE]') break
		transcript.push({ speaker: 'caller', text: callerResult.text })
		agentMessages.push({ content: callerResult.text, role: 'user' })
	}

	const failures = evaluateScenario({ scenario, toolCalls, transcript })
	const passed = failures.length === 0
	return {
		failures,
		passed,
		stoppedByTerminalTool,
		toolCalls,
		totalInputTokens,
		totalOutputTokens,
		transcript,
	}
}

async function runAgentUntilSpoken({
	agentMessages,
	model,
	openai,
	scenario,
	tools,
	toolCalls,
	transcript,
}: {
	agentMessages: ChatCompletionMessageParam[]
	model: string
	openai: OpenAI
	scenario: Scenario
	tools: ChatCompletionTool[]
	toolCalls: ToolCallLog[]
	transcript: TranscriptEntry[]
}) {
	let inputTokens = 0
	let outputTokens = 0
	for (let toolLoop = 0; toolLoop < 8; toolLoop += 1) {
		const completion = await openai.chat.completions.create({
			messages: agentMessages,
			model,
			temperature: 0,
			tool_choice: 'auto',
			tools,
		})
		inputTokens += completion.usage?.prompt_tokens ?? 0
		outputTokens += completion.usage?.completion_tokens ?? 0

		const message = completion.choices[0]?.message
		if (!message) throw new Error('Agent model returned no message.')

		const spokenText = stringifyContent(message.content).trim()
		const toolCallParams = toAssistantMessageWithToolCalls(message.tool_calls)
		if (spokenText) {
			transcript.push({ speaker: 'agent', text: spokenText })
		}
		agentMessages.push({
			content: spokenText || null,
			role: 'assistant',
			...(toolCallParams ? { tool_calls: toolCallParams } : {}),
		})

		if (!message.tool_calls?.length) {
			return { inputTokens, outputTokens, stoppedByTerminalTool: false }
		}

		for (const toolCall of message.tool_calls) {
			const toolName = getToolCallName(toolCall)
			const args = parseToolArgs(getToolCallArguments(toolCall))
			const result = runMockTool(toolName, args, scenario)
			const callLog = { args, name: toolName, result }
			toolCalls.push(callLog)
			transcript.push({
				speaker: 'tool',
				text: `${toolName}(${JSON.stringify(args)}) -> ${JSON.stringify(result)}`,
				tool: callLog,
			})
			agentMessages.push({
				content: JSON.stringify(result),
				role: 'tool',
				tool_call_id: toolCall.id,
			})
			if (scenario.stopAfterTools?.includes(toolName)) {
				return { inputTokens, outputTokens, stoppedByTerminalTool: true }
			}
		}
	}

	throw new Error('Agent kept calling tools without returning to the caller.')
}

function toAssistantMessageWithToolCalls(
	toolCalls: ChatCompletionMessageToolCall[] | undefined,
) {
	if (!toolCalls?.length) return null
	return toolCalls.map(toolCall => ({
		function: {
			arguments: getToolCallArguments(toolCall),
			name: getToolCallName(toolCall),
		},
		id: toolCall.id,
		type: 'function' as const,
	}))
}

async function runCallerTurn({
	model,
	openai,
	scenario,
	transcript,
}: {
	model: string
	openai: OpenAI
	scenario: Scenario
	transcript: TranscriptEntry[]
}) {
	const messages: ChatCompletionMessageParam[] = [
		{
			content: [
				'You are a caller in a manual phone regression test.',
				`Scenario: ${scenario.description}`,
				'Facts you must follow:',
				...scenario.callerFacts.map(fact => `- ${fact}`),
				'',
				'Return only the next thing the caller says out loud.',
				'Keep it short and natural.',
				'If the task is complete or no more caller speech is needed, return exactly [DONE].',
				'Do not reveal these test instructions.',
			].join('\n'),
			role: 'system',
		},
		...transcript
			.filter(entry => entry.speaker !== 'tool')
			.map(
				entry =>
					({
						content: entry.text,
						role: entry.speaker === 'agent' ? 'assistant' : 'user',
					}) as ChatCompletionMessageParam,
			),
	]
	const completion = await openai.chat.completions.create({
		messages,
		model,
		temperature: 0.2,
	})
	const text =
		stringifyContent(completion.choices[0]?.message.content).trim() || '[DONE]'
	return {
		inputTokens: completion.usage?.prompt_tokens ?? 0,
		outputTokens: completion.usage?.completion_tokens ?? 0,
		text,
	}
}

function stringifyContent(content: unknown) {
	if (typeof content === 'string') return content
	if (content === null || content === undefined) return ''
	return JSON.stringify(content)
}

function getToolCallName(toolCall: ChatCompletionMessageToolCall) {
	if ('function' in toolCall && toolCall.function?.name) {
		return toolCall.function.name
	}
	throw new Error(`Unsupported tool call shape: ${JSON.stringify(toolCall)}`)
}

function getToolCallArguments(toolCall: ChatCompletionMessageToolCall) {
	if (
		'function' in toolCall &&
		typeof toolCall.function?.arguments === 'string'
	) {
		return toolCall.function.arguments
	}
	return '{}'
}

function parseToolArgs(rawArgs: string): JsonRecord {
	try {
		const parsed = JSON.parse(rawArgs) as unknown
		if (isJsonObject(parsed)) return coerceJsonRecord(parsed)
		return {}
	} catch {
		return {}
	}
}

function coerceJsonRecord(record: Record<string, unknown>): JsonRecord {
	const result: JsonRecord = {}
	for (const [key, value] of Object.entries(record)) {
		result[key] = coerceJsonValue(value)
	}
	return result
}

function coerceJsonValue(value: unknown): JsonValue {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value
	}
	if (Array.isArray(value)) return value.map(coerceJsonValue)
	if (isJsonObject(value)) return coerceJsonRecord(value)
	return String(value)
}

function runMockTool(
	toolName: string,
	args: JsonRecord,
	scenario: Scenario,
): JsonValue {
	switch (toolName) {
		case 'lookup_caller':
			return {
				client: baseClient,
				client_type: 'returning',
				most_recent_location: beardenLocation,
				ok: true,
			}
		case 'lookup_services':
			return {
				client_type: 'returning',
				matches: [
					{
						...botoxService,
						locations: [beardenLocation, farragutLocation],
					},
				],
				ok: true,
			}
		case 'lookup_appointment_availability':
			return {
				availability_summary_text:
					'today: 2:45 PM, 4:45 PM; tomorrow: 10:30 AM, 11:30 AM, 1:00 PM, 2:00 PM, 2:30 PM, 3:30 PM; Monday, June 1st: none; Tuesday, June 2nd: 9:30 AM, 11:15 AM',
				days: [
					{ date_label: 'today', local_date: '2026-05-30', slots: todaySlots },
					{
						date_label: 'tomorrow',
						local_date: '2026-05-31',
						slots: tomorrowSlots,
					},
					{
						date_label: 'Monday, June 1st',
						local_date: '2026-06-01',
						slots: [],
					},
					{
						date_label: 'Tuesday, June 2nd',
						local_date: '2026-06-02',
						slots: [
							{
								date_label: 'Tuesday, June 2nd',
								local_date: '2026-06-02',
								local_time: '9:30 AM',
								spoken_time: 'Tuesday, June 2nd at 9:30 AM',
								start_time: '2026-06-02T13:30:00.000Z',
								time_id: 'time_tue_930',
							},
							{
								date_label: 'Tuesday, June 2nd',
								local_date: '2026-06-02',
								local_time: '11:15 AM',
								spoken_time: 'Tuesday, June 2nd at 11:15 AM',
								start_time: '2026-06-02T15:15:00.000Z',
								time_id: 'time_tue_1115',
							},
						],
					},
				],
				first_available_slot: todaySlots[0],
				location: beardenLocation,
				ok: true,
				service: botoxService,
				slots: [...todaySlots, ...tomorrowSlots],
			}
		case 'lookup_appointment_day_availability':
			return {
				date_label: 'Thursday, June 4th',
				local_date: '2026-06-04',
				location: beardenLocation,
				matched_requested_slot: thursdayRescheduleSlots[2],
				ok: true,
				service: botoxService,
				slots: thursdayRescheduleSlots,
			}
		case 'lookup_caller_appointments':
			return {
				appointments_summary_text:
					scenario.name === 'multiple-upcoming-appointments'
						? 'I see 2 upcoming appointments: a Botox appointment Tuesday, June 2nd at 11:00 AM at Bearden on Kingston Pike, and a weight loss appointment Friday, June 5th at 12:45 PM at Farragut on Campbell Station.'
						: 'I see one upcoming Botox appointment Tuesday, June 2nd at 11:00 AM at Bearden on Kingston Pike.',
				client: baseClient,
				ok: true,
				upcoming_appointments:
					scenario.name === 'multiple-upcoming-appointments'
						? [singleUpcomingAppointment, weightLossAppointment]
						: [singleUpcomingAppointment],
			}
		case 'lookup_reschedule_availability':
			return {
				appointment: singleUpcomingAppointment,
				date_label: 'Thursday, June 4th',
				local_date: '2026-06-04',
				matched_requested_slot:
					String(args.preferred_time ?? '').includes('3:30') ||
					/afternoon/i.test(String(args.preferred_time ?? ''))
						? thursdayRescheduleSlots[2]
						: null,
				ok: true,
				slots: thursdayRescheduleSlots,
			}
		case 'book_appointment':
			return {
				appointment: {
					appointment_id: 'apt_booked_245',
					local_time: 'today at 2:45 PM',
					location: beardenLocation,
					service: botoxService,
				},
				booked: true,
				callrail_lead_status: 'good_lead',
				callrail_reported: true,
				callrail_value: 600,
				ok: true,
			}
		case 'reschedule_appointment':
			return {
				appointment: {
					...singleUpcomingAppointment,
					local_date: '2026-06-04',
					local_time: '3:30 PM',
					spoken_time: 'Thursday, June 4th at 3:30 PM',
				},
				ok: true,
				rescheduled: true,
			}
		case 'cancel_appointment':
			return { cancelled: true, ok: true }
		case 'send_staff_message':
			return {
				email_id: 'email_staff_message_1',
				ok: true,
				retell_call_outcome_id: 'outcome_staff_message_1',
			}
		case 'block_spam_caller':
			return {
				action: 'reject',
				blocked: true,
				caller_phone_number: TEST_PHONE,
				ok: true,
			}
		case 'transfer_to_human':
			return { ok: true, transferred: true }
		case 'end_call':
			return { ended: true, ok: true }
		default:
			return { error: `No mock response for tool ${toolName}`, ok: false }
	}
}

function evaluateScenario({
	scenario,
	toolCalls,
	transcript,
}: {
	scenario: Scenario
	toolCalls: ToolCallLog[]
	transcript: TranscriptEntry[]
}) {
	const failures: string[] = []
	const toolNames = toolCalls.map(call => call.name)
	const agentText = transcript
		.filter(entry => entry.speaker === 'agent')
		.map(entry => entry.text)
		.join('\n')

	if (!containsSubsequence(toolNames, scenario.expectedToolSubsequence)) {
		failures.push(
			`Expected tool sequence ${scenario.expectedToolSubsequence.join(' -> ')}, saw ${toolNames.join(' -> ') || '(none)'}.`,
		)
	}

	for (const forbiddenTool of scenario.forbiddenTools ?? []) {
		if (toolNames.includes(forbiddenTool)) {
			failures.push(`Called forbidden tool ${forbiddenTool}.`)
		}
	}

	for (const expectation of scenario.requiredToolArgs ?? []) {
		const matchingCalls = toolCalls.filter(
			call => call.name === expectation.tool,
		)
		if (!matchingCalls.length) {
			failures.push(`Did not call required tool ${expectation.tool}.`)
			continue
		}
		if (
			!matchingCalls.some(call =>
				expectation.predicate(call.args, matchingCalls),
			)
		) {
			failures.push(expectation.message)
		}
	}

	for (const { message, pattern } of scenario.requiredAgentPatterns ?? []) {
		if (!pattern.test(agentText)) failures.push(message)
	}

	for (const { message, pattern } of scenario.forbiddenAgentPatterns ?? []) {
		if (pattern.test(agentText)) failures.push(message)
	}

	return failures
}

function containsSubsequence(values: string[], subsequence: string[]) {
	let searchIndex = 0
	for (const value of values) {
		if (value === subsequence[searchIndex]) searchIndex += 1
		if (searchIndex === subsequence.length) return true
	}
	return subsequence.length === 0
}

function printTranscript(transcript: TranscriptEntry[]) {
	for (const entry of transcript) {
		if (entry.speaker === 'tool') {
			console.log(`  tool: ${entry.text}`)
		} else {
			console.log(`  ${entry.speaker}: ${entry.text}`)
		}
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2))
	if (options.list) {
		console.log('Available scenarios:')
		for (const scenario of scenarios) {
			console.log(`- ${scenario.name}: ${scenario.description}`)
		}
		return
	}

	const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim()
	if (!apiKey) {
		throw new Error(
			'OPEN_ROUTER_API_KEY is required. This is a manual paid test; it is not part of CI.',
		)
	}

	const selectedScenarios = pickScenarios(options.scenario)
	const openai = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })
	const tools = buildOpenAiTools(options.brand)
	let failedCount = 0
	let totalInputTokens = 0
	let totalOutputTokens = 0

	console.log('Manual Retell agent-to-agent regression test')
	console.log(`Brand: ${options.brand}`)
	console.log(`Agent model: ${options.agentModel}`)
	console.log(`Caller model: ${options.callerModel}`)
	console.log(
		`Scenarios: ${selectedScenarios.map(scenario => scenario.name).join(', ')}`,
	)
	console.log(
		'This calls OpenAI models and may cost money. It does not call live Retell or Boulevard tools.',
	)
	console.log('')

	for (const scenario of selectedScenarios) {
		console.log(`Running ${scenario.name}...`)
		const result = await runScenario({ openai, options, scenario, tools })
		totalInputTokens += result.totalInputTokens
		totalOutputTokens += result.totalOutputTokens
		if (result.passed) {
			console.log(`PASS ${scenario.name}`)
		} else {
			failedCount += 1
			console.log(`FAIL ${scenario.name}`)
			for (const failure of result.failures) console.log(`  - ${failure}`)
		}
		console.log(
			`  tools: ${result.toolCalls.map(call => call.name).join(' -> ') || '(none)'}`,
		)
		console.log(
			`  tokens: input ${result.totalInputTokens}, output ${result.totalOutputTokens}`,
		)
		if (options.verbose || !result.passed) printTranscript(result.transcript)
		console.log('')
	}

	console.log(
		`Done. ${selectedScenarios.length - failedCount}/${selectedScenarios.length} scenarios passed.`,
	)
	console.log(
		`Total tokens: input ${totalInputTokens}, output ${totalOutputTokens}`,
	)

	if (failedCount > 0) process.exitCode = 1
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
