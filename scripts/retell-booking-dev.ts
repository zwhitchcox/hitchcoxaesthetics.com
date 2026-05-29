import 'dotenv/config'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const DEFAULT_PORT = 4000
const DEFAULT_AGENT_ID = 'agent_178c33cf9d7656523e2195005f'
const DEFAULT_LLM_ID = 'llm_07c575abf8676e565f273447b229'
const DEFAULT_PHONE_NUMBER = '+18653389694'

const port = Number(process.env.PORT || DEFAULT_PORT)
const agentId = process.env.RETELL_TEST_AGENT_ID?.trim() || DEFAULT_AGENT_ID
const llmId = process.env.RETELL_TEST_LLM_ID?.trim() || DEFAULT_LLM_ID
const configuredPhoneNumber =
	process.env.RETELL_TEST_PHONE_NUMBER?.trim() || DEFAULT_PHONE_NUMBER
const apiKey = process.env.RETELL_API_KEY?.trim()
const sharedSecret = process.env.RETELL_TOOL_SHARED_SECRET?.trim()
const toolHeaders = sharedSecret
	? { 'x-retell-tool-secret': sharedSecret }
	: undefined

if (!apiKey) {
	throw new Error('RETELL_API_KEY is required in .env.')
}

const children: ChildProcess[] = []

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
	const tools = upsertSpamTools(existingTools, publicUrl).map(tool => {
		if (!tool || typeof tool !== 'object') return tool
		const record = tool as Record<string, unknown>
		if (record.type !== 'custom' || typeof record.url !== 'string') return tool

		return {
			...record,
			url: replaceToolOrigin(record.url, publicUrl),
		}
	})

	const updated = await retellFetch(`/update-retell-llm/${llmId}`, {
		general_prompt: buildUpdatedPrompt(readString(llm, 'general_prompt')),
		general_tools: tools,
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

function upsertSpamTools(tools: Array<unknown>, publicUrl: string) {
	const spamTool = buildSpamTool(publicUrl)
	let sawSpamTool = false
	let sawEndCall = false
	const nextTools = tools.map(tool => {
		if (!tool || typeof tool !== 'object') return tool
		const record = tool as Record<string, unknown>
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
					'End the call after the appointment is booked, the caller is done, or immediately after block_spam_caller returns.',
			}
		}
		return record
	})

	if (!sawSpamTool) nextTools.push(spamTool)
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

function buildSpamTool(publicUrl: string) {
	return {
		type: 'custom',
		name: 'block_spam_caller',
		url: `${publicUrl.replace(/\/+$/, '')}/resources/retell-callrail/spam`,
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

function buildUpdatedPrompt(currentPrompt: string | null) {
	const spamInstruction =
		'Spam handling is a hard stop. If the caller is trying to sell Sarah Hitchcox Aesthetics anything, asks whether the business is interested in buying anything, offers a long-distance plan, phone plan, warranty, extended warranty, insurance, marketing, SEO, ads, financing, merchant services, staffing, supplies, or any unrelated product or service, immediately call block_spam_caller with a short reason. Also do this if they say they are spam or a spammer, are a robocall, are telemarketing, are abusive, are prank-calling, or explicitly ask to be blocked. Do not clarify first. After block_spam_caller returns, immediately call end_call regardless of whether CallRail marked the call. Do not continue the conversation, do not ask appointment questions, and do not try to book.'
	const phoneInstruction =
		'When calling block_spam_caller, pass caller_phone_number from the current call object if available. If Retell does not expose it, pass null; the tool server will also try to infer it from the call payload.'
	const prompt = currentPrompt?.trim()
	if (!prompt) return `${spamInstruction}\n${phoneInstruction}`
	if (prompt.includes(spamInstruction) && prompt.includes(phoneInstruction)) {
		return prompt
	}

	const withoutOldSpamLine = prompt
		.split('\n')
		.filter(
			line =>
				!line.includes('If the caller is clearly spam') &&
				!line.includes('Spam handling is a hard stop.') &&
				!line.includes('When calling block_spam_caller, pass caller_phone_number'),
		)
		.join('\n')
	return `${withoutOldSpamLine}\n${spamInstruction}\n${phoneInstruction}`
}

async function smokeTest(publicUrl: string) {
	const response = await fetch(`${publicUrl}/resources/retell-booking/services`, {
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

async function findAgentPhoneNumber() {
	const configured = await getConfiguredPhoneNumber()
	if (configured) return configured

	const phoneNumbers = (await retellFetch(
		'/list-phone-numbers',
		undefined,
		'GET',
	)) as unknown

	if (!Array.isArray(phoneNumbers)) return null

	const match = phoneNumbers.find(phoneNumber => {
		if (!phoneNumber || typeof phoneNumber !== 'object') return false
		const record = phoneNumber as Record<string, unknown>
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
	const e164 = typeof record.phone_number === 'string' ? record.phone_number : null
	const pretty =
		typeof record.phone_number_pretty === 'string'
			? record.phone_number_pretty
			: e164

	return e164 && pretty ? { e164, pretty } : null
}

async function getConfiguredPhoneNumber() {
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
		return e164 && pretty ? { e164, pretty } : null
	} catch {
		return null
	}
}

async function bindPhoneNumberToAgent(phoneNumber: string) {
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
		`Bound phone number to Retell agent: ${
			record.inbound_agent_id ?? agentId
		}`,
	)
}

function replaceToolOrigin(url: string, publicUrl: string) {
	const current = new URL(url)
	return `${publicUrl.replace(/\/+$/, '')}${current.pathname}`
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
