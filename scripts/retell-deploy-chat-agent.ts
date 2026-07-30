/**
 * Create/update the website chat agent in Retell (Chat API, not voice).
 * Idempotent: finds the agent by name "Sarah Hitchcox Aesthetics Chat" and
 * updates its LLM + agent in place; creates both on first run. Never touches
 * the voice booking agents.
 *
 *   pnpm exec tsx scripts/retell-deploy-chat-agent.ts [--dry-run] [--base-url=https://...]
 */
import { config as loadDotenv } from 'dotenv'

import { RETELL_CHAT_AGENT_NAME } from '../app/utils/ai-chat.ts'
import {
	buildRetellChatPrompt,
	buildRetellChatTools,
	getRetellChatBeginMessage,
	loadChatKnowledge,
} from './retell-chat-agent-config.ts'

loadDotenv({ override: true })

const RETELL_API_BASE_URL = 'https://api.retellai.com'
const DEFAULT_PUBLIC_URL = 'https://hitchcoxaesthetics.com'
const CHAT_MODEL = 'gpt-5.1'

type ChatAgent = {
	agent_id?: string
	agent_name?: string
	response_engine?: {
		llm_id?: string
		type?: string
	}
}

const args = parseArgs(process.argv.slice(2))

const missingEnv: string[] = []
const apiKey = process.env.RETELL_API_KEY?.trim()
if (!apiKey) missingEnv.push('RETELL_API_KEY')
const toolToken =
	process.env.RETELL_TOOL_URL_TOKEN?.trim() ||
	process.env.RETELL_TOOL_SHARED_SECRET?.trim()
if (!toolToken) {
	missingEnv.push('RETELL_TOOL_URL_TOKEN or RETELL_TOOL_SHARED_SECRET')
}
if (missingEnv.length > 0) {
	console.error(
		`Missing required env for the chat agent deploy: ${missingEnv.join(', ')}. Set them in .env (they are also Fly secrets) and re-run.`,
	)
	process.exit(1)
}

const publicUrl = (
	args.baseUrl ??
	process.env.RETELL_DEPLOY_WEBHOOK_BASE_URL?.trim() ??
	process.env.RETELL_AGENT_WEBHOOK_BASE_URL?.trim() ??
	DEFAULT_PUBLIC_URL
).replace(/\/+$/, '')
if (/\.ngrok(-free)?\.app/i.test(publicUrl)) {
	throw new Error(
		`Refusing to point the production chat agent at ngrok URL ${publicUrl}. Pass --base-url for a real origin.`,
	)
}

const sharedSecret = process.env.RETELL_TOOL_SHARED_SECRET?.trim()
const toolHeaders = sharedSecret
	? { 'x-retell-tool-secret': sharedSecret }
	: undefined

const knowledge = loadChatKnowledge()
const llmPayload = {
	begin_message: getRetellChatBeginMessage(),
	general_prompt: buildRetellChatPrompt(knowledge),
	general_tools: buildRetellChatTools({ publicUrl, toolHeaders }),
	model: CHAT_MODEL,
	model_temperature: 0,
	start_speaker: 'agent',
	tool_call_strict_mode: true,
}

if (args.dryRun) {
	console.log(
		JSON.stringify(
			{
				agent_name: RETELL_CHAT_AGENT_NAME,
				dry_run: true,
				llm_payload: llmPayload,
				webhook_base_url: publicUrl,
			},
			null,
			2,
		),
	)
	process.exit(0)
}

const existingAgent = await findChatAgentByName(RETELL_CHAT_AGENT_NAME)
const existingLlmId = existingAgent?.response_engine?.llm_id

const llm = existingLlmId
	? await retellFetch(`/update-retell-llm/${existingLlmId}`, llmPayload)
	: await retellFetch('/create-retell-llm', llmPayload, 'POST')
const llmId = readRequiredString(llm, 'llm_id')

const agentPayload = {
	agent_name: RETELL_CHAT_AGENT_NAME,
	response_engine: {
		llm_id: llmId,
		type: 'retell-llm',
	},
}
const agent = existingAgent?.agent_id
	? await retellFetch(
			`/update-chat-agent/${existingAgent.agent_id}`,
			agentPayload,
		)
	: await retellFetch('/create-chat-agent', agentPayload, 'POST')
const agentId = readRequiredString(agent, 'agent_id')

console.log(
	JSON.stringify(
		{
			agent_id: agentId,
			agent_name: RETELL_CHAT_AGENT_NAME,
			created: !existingAgent,
			llm_id: llmId,
			model: CHAT_MODEL,
			webhook_base_url: publicUrl,
		},
		null,
		2,
	),
)

async function findChatAgentByName(
	agentName: string,
): Promise<ChatAgent | null> {
	const agents = (await retellFetch(
		'/list-chat-agents',
		undefined,
		'GET',
	)) as unknown
	if (!Array.isArray(agents)) return null
	const match = agents.find(
		(agent): agent is ChatAgent =>
			!!agent &&
			typeof agent === 'object' &&
			(agent as ChatAgent).agent_name === agentName,
	)
	return match ?? null
}

async function retellFetch(
	path: string,
	body?: Record<string, unknown>,
	method = 'PATCH',
) {
	const response = await fetch(`${RETELL_API_BASE_URL}${path}`, {
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

function parseArgs(argv: string[]) {
	let baseUrl: string | undefined
	let dryRun = false
	for (const arg of argv) {
		if (arg === '--') continue
		if (arg === '--dry-run') {
			dryRun = true
		} else if (arg.startsWith('--base-url=')) {
			baseUrl = arg.slice('--base-url='.length)
		} else {
			throw new Error(`Unknown argument: ${arg}`)
		}
	}
	return { baseUrl, dryRun }
}
