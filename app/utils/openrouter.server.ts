/**
 * One transport for OpenRouter chat completions. The article chat
 * (article-chat.server.ts) and the transcriber (transcribe.server.ts) call
 * it. Same fetch pattern as podcast-topics.server.ts: the abort covers the
 * wait for headers, and the body read is bounded by `readWithin`.
 *
 * Key: OPEN_ROUTER_API_KEY. Callers log lengths and the model id only,
 * never the text and never the key.
 */

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_REFERER = 'https://hitchcoxaesthetics.com'
export const OPENROUTER_TITLE = 'Hitchcox article review'

/** The key from the environment, or null when it is not set. */
export function openRouterApiKey(): string | null {
	return process.env.OPEN_ROUTER_API_KEY?.trim() || null
}

/** The three headers every OpenRouter call carries, plus the content type. */
export function openRouterHeaders(apiKey: string): Record<string, string> {
	return {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json',
		'HTTP-Referer': OPENROUTER_REFERER,
		'X-Title': OPENROUTER_TITLE,
	}
}

/** One tool call in a reply, in the OpenAI shape OpenRouter uses. */
export type ToolCall = {
	id: string
	type: 'function'
	function: { name: string; arguments: string }
}

export type ChatCompletionMessage = {
	content: string | null
	tool_calls?: ToolCall[]
}

export type ChatCompletionResult =
	| { kind: 'reply'; message: ChatCompletionMessage }
	| { kind: 'http'; status: number; body: string }
	| { kind: 'timeout' }

/**
 * One chat completion. `body` is the request body without `model`
 * (messages, tools, temperature, max_tokens, tool_choice, ...). `deadline`
 * is an absolute time in ms; the call answers `timeout` when it cannot
 * finish before it. A reply that does not parse answers `reply` with a null
 * content, so the caller decides what an empty answer means.
 */
export async function chatCompletion({
	apiKey,
	model,
	body,
	deadline,
	fetchImpl = fetch,
}: {
	apiKey: string
	model: string
	body: Record<string, unknown>
	deadline: number
	fetchImpl?: typeof fetch
}): Promise<ChatCompletionResult> {
	const remaining = deadline - Date.now()
	if (remaining < 1000) return { kind: 'timeout' }
	// The abort covers the wait for headers only. Aborting while the body is
	// being read makes the fetch polyfill throw outside any handler, which
	// drops the whole response. The body read is bounded by a race instead.
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), remaining)
	let response: Response
	try {
		response = await fetchImpl(OPENROUTER_URL, {
			method: 'POST',
			headers: openRouterHeaders(apiKey),
			body: JSON.stringify({ model, ...body }),
			signal: controller.signal,
		})
	} catch (error) {
		clearTimeout(timer)
		const name = error instanceof Error ? error.name : ''
		if (name === 'TimeoutError' || name === 'AbortError')
			return { kind: 'timeout' }
		throw error
	}
	clearTimeout(timer)
	const text = await readWithin(response.text(), deadline - Date.now())
	if (text === null) return { kind: 'timeout' }
	if (!response.ok) {
		return { kind: 'http', status: response.status, body: text.slice(0, 300) }
	}
	return { kind: 'reply', message: parseReply(text) }
}

type CompletionPayload = {
	choices?: Array<{
		message?: { content?: unknown; tool_calls?: unknown }
	}>
}

/** The first choice's message. Malformed tool calls are dropped. */
function parseReply(text: string): ChatCompletionMessage {
	let payload: CompletionPayload | null = null
	try {
		payload = JSON.parse(text) as CompletionPayload
	} catch {
		payload = null
	}
	const message = payload?.choices?.[0]?.message
	const content = typeof message?.content === 'string' ? message.content : null
	const calls = Array.isArray(message?.tool_calls)
		? message.tool_calls.filter(isToolCall)
		: []
	return calls.length > 0 ? { content, tool_calls: calls } : { content }
}

function isToolCall(value: unknown): value is ToolCall {
	if (!value || typeof value !== 'object') return false
	const call = value as {
		id?: unknown
		function?: { name?: unknown; arguments?: unknown }
	}
	return (
		typeof call.id === 'string' &&
		typeof call.function?.name === 'string' &&
		typeof call.function?.arguments === 'string'
	)
}

/** The body text, or null when it does not arrive within `ms`. */
export async function readWithin(
	read: Promise<string>,
	ms: number,
): Promise<string | null> {
	if (ms <= 0) return null
	let timer: ReturnType<typeof setTimeout> | undefined
	const late = new Promise<null>(resolve => {
		timer = setTimeout(() => resolve(null), ms)
	})
	try {
		return await Promise.race([read.catch(() => null), late])
	} finally {
		clearTimeout(timer)
	}
}
