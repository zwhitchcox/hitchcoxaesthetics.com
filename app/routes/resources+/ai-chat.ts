import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'

import {
	AI_CHAT_OFFICE_PHONE,
	isChatTurnCapped,
	parseChatDirective,
	RETELL_CHAT_AGENT_NAME,
	takeRateLimitToken,
	validateChatMessage,
	type AiChatAction,
} from '#app/utils/ai-chat.ts'

/**
 * Server proxy between the website chat widget and the Retell Chat API.
 * RETELL_API_KEY never leaves the server. Before any Retell call we enforce
 * hard abuse caps (message length, turns per chat, per-IP rate window) so
 * the widget cannot be farmed as a free general-purpose LLM. The caps are
 * per-machine in-memory state, which is acceptable on our two Fly machines.
 */

const RETELL_API_BASE_URL = 'https://api.retellai.com'
const RETELL_TIMEOUT_MS = 30_000

const FALLBACK_MESSAGE = `Sorry, I'm having trouble answering right now. Please call our office at ${AI_CHAT_OFFICE_PHONE} and we'll be glad to help.`
const RATE_LIMITED_MESSAGE = `You've sent quite a few messages in a short time, so I need a quick pause. Please try again in a few minutes, or call our office at ${AI_CHAT_OFFICE_PHONE}.`
const TURN_CAPPED_MESSAGE = `We've reached the length limit for this chat. For anything else, please call our office at ${AI_CHAT_OFFICE_PHONE} or tap Book Online below to schedule.`
const TOO_LONG_MESSAGE = `That message is a bit long for me. Could you shorten it to a sentence or two?`

type AiChatResponse = {
	action: AiChatAction | null
	chatId: string | null
	degraded?: boolean
	message: string
}

const requestSchema = z.object({
	chatId: z.string().trim().max(200).nullish(),
	message: z.unknown(),
})

// Per-IP sliding window of message timestamps.
const rateWindows = new Map<string, number[]>()
// Per-chat lifetime turn count (keyed by Retell chat_id).
const chatTurns = new Map<string, { count: number; lastAt: number }>()
const CHAT_TURNS_TTL_MS = 24 * 60 * 60 * 1000
// Cached agent id resolved from RETELL_CHAT_AGENT_ID or /list-chat-agents.
let cachedAgentId: string | null = null

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed' }, { status: 405 })
	}
	if (process.env.AI_CHAT_ENABLED !== 'true') {
		return json({ error: 'AI chat is not enabled' }, { status: 404 })
	}

	const body = await request.json().catch(() => null)
	const parsed = requestSchema.safeParse(body)
	if (!parsed.success) {
		return json({ error: 'Invalid request' }, { status: 400 })
	}
	const requestedChatId = parsed.data.chatId?.trim() || null

	pruneCapState()

	// Hard caps run BEFORE any Retell call: a tripped cap costs zero tokens.
	const ip = getClientIp(request)
	const window = takeRateLimitToken(rateWindows.get(ip) ?? [], Date.now())
	rateWindows.set(ip, window.timestamps)
	if (!window.allowed) {
		return chatJson({
			action: null,
			chatId: requestedChatId,
			degraded: true,
			message: RATE_LIMITED_MESSAGE,
		})
	}

	const validated = validateChatMessage(parsed.data.message)
	if (!validated.ok) {
		if (validated.reason === 'too_long') {
			return chatJson({
				action: null,
				chatId: requestedChatId,
				degraded: true,
				message: TOO_LONG_MESSAGE,
			})
		}
		return json({ error: 'Message is required' }, { status: 400 })
	}

	const turns = requestedChatId ? chatTurns.get(requestedChatId) : null
	if (turns && isChatTurnCapped(turns.count)) {
		return chatJson({
			action: null,
			chatId: requestedChatId,
			degraded: true,
			message: TURN_CAPPED_MESSAGE,
		})
	}

	const apiKey = process.env.RETELL_API_KEY?.trim()
	if (!apiKey) {
		console.error('AI chat: RETELL_API_KEY is not set')
		return chatJson({
			action: null,
			chatId: requestedChatId,
			degraded: true,
			message: FALLBACK_MESSAGE,
		})
	}

	try {
		const chatId = requestedChatId ?? (await createChat(apiKey))
		const previous = chatTurns.get(chatId)
		chatTurns.set(chatId, {
			count: (previous?.count ?? 0) + 1,
			lastAt: Date.now(),
		})

		const reply = await createChatCompletion(apiKey, chatId, validated.message)
		const { action: chatAction, message } = parseChatDirective(reply)
		return chatJson({
			action: chatAction,
			chatId,
			message: message || FALLBACK_MESSAGE,
		})
	} catch (error) {
		console.error('AI chat: Retell request failed', error)
		return chatJson({
			action: null,
			chatId: requestedChatId,
			degraded: true,
			message: FALLBACK_MESSAGE,
		})
	}
}

function chatJson(data: AiChatResponse) {
	return json(data)
}

function getClientIp(request: Request) {
	return (
		request.headers.get('fly-client-ip')?.trim() ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		'unknown'
	)
}

/** Keep the in-memory cap maps from growing unbounded. */
function pruneCapState() {
	const now = Date.now()
	for (const [key, value] of chatTurns) {
		if (now - value.lastAt > CHAT_TURNS_TTL_MS) chatTurns.delete(key)
	}
	for (const [key, timestamps] of rateWindows) {
		if (!timestamps.some(t => t > now - 60 * 60 * 1000)) {
			rateWindows.delete(key)
		}
	}
}

async function createChat(apiKey: string) {
	const agentId = await resolveAgentId(apiKey)
	const payload = await retellFetch(apiKey, '/create-chat', {
		agent_id: agentId,
	})
	const chatId =
		payload && typeof payload === 'object'
			? (payload as Record<string, unknown>).chat_id
			: null
	if (typeof chatId !== 'string' || !chatId) {
		throw new Error('Retell create-chat returned no chat_id')
	}
	return chatId
}

async function createChatCompletion(
	apiKey: string,
	chatId: string,
	content: string,
) {
	const payload = await retellFetch(apiKey, '/create-chat-completion', {
		chat_id: chatId,
		content,
	})
	const messages =
		payload && typeof payload === 'object'
			? (payload as Record<string, unknown>).messages
			: null
	if (!Array.isArray(messages)) {
		throw new Error('Retell create-chat-completion returned no messages')
	}
	const reply = messages
		.map(message =>
			message && typeof message === 'object'
				? (message as Record<string, unknown>)
				: null,
		)
		.filter(message => message?.role !== 'user')
		.map(message =>
			typeof message?.content === 'string' ? message.content : '',
		)
		.filter(Boolean)
		.join('\n\n')
	if (!reply.trim()) {
		throw new Error('Retell create-chat-completion returned an empty reply')
	}
	return reply
}

async function resolveAgentId(apiKey: string) {
	const configured = process.env.RETELL_CHAT_AGENT_ID?.trim()
	if (configured) return configured
	if (cachedAgentId) return cachedAgentId

	const agents = await retellFetch(
		apiKey,
		'/list-chat-agents',
		undefined,
		'GET',
	)
	if (!Array.isArray(agents)) {
		throw new Error('Retell list-chat-agents returned an unexpected payload')
	}
	const match = agents.find(agent => {
		if (!agent || typeof agent !== 'object') return false
		const name = (agent as Record<string, unknown>).agent_name
		return name === RETELL_CHAT_AGENT_NAME
	}) as Record<string, unknown> | undefined
	const agentId = match?.agent_id
	if (typeof agentId !== 'string' || !agentId) {
		throw new Error(
			`Retell chat agent "${RETELL_CHAT_AGENT_NAME}" not found; run scripts/retell-deploy-chat-agent.ts or set RETELL_CHAT_AGENT_ID`,
		)
	}
	cachedAgentId = agentId
	return agentId
}

async function retellFetch(
	apiKey: string,
	path: string,
	body?: Record<string, unknown>,
	method = 'POST',
) {
	const response = await fetch(`${RETELL_API_BASE_URL}${path}`, {
		body: body ? JSON.stringify(body) : undefined,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		method,
		signal: AbortSignal.timeout(RETELL_TIMEOUT_MS),
	})
	const payload = (await response.json().catch(() => null)) as unknown
	if (!response.ok) {
		throw new Error(
			`Retell ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
		)
	}
	return payload
}
