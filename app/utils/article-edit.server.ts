/**
 * "Tell it what to change": one OpenRouter chat completion that applies the
 * reviewer's request to the article markdown and returns { markdown, summary }.
 *
 * Same fetch pattern as podcast-topics.server.ts and call-intelligence.server.ts.
 * Key: OPEN_ROUTER_API_KEY. Model: ARTICLE_EDIT_MODEL (default in article-edit.ts).
 * Logs carry lengths and the model id only, never the text or the key.
 */
import {
	ARTICLE_EDIT_DEFAULT_MODEL,
	ARTICLE_EDIT_TIMEOUT_MS,
	buildEditSystemPrompt,
	buildEditUserMessage,
	parseEditReply,
	type ArticleEditReply,
} from '#app/utils/article-edit.ts'
import { type ArticleLink } from '#app/utils/articles.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_OUTPUT_TOKENS = 16_000

export type ArticleEditErrorCode =
	| 'missing_open_router_api_key'
	| 'openrouter_http_error'
	| 'openrouter_timeout'
	| 'openrouter_empty_response'
	| 'openrouter_unparseable_response'

export type ArticleEditResult =
	| ({ ok: true; model: string } & ArticleEditReply)
	| { ok: false; model: string; error: ArticleEditErrorCode; status?: number }

export function getArticleEditConfig() {
	const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim()
	if (!apiKey) return null
	return {
		apiKey,
		model: process.env.ARTICLE_EDIT_MODEL?.trim() || ARTICLE_EDIT_DEFAULT_MODEL,
	}
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type Completion =
	| { kind: 'text'; text: string }
	| { kind: 'http'; status: number; body: string }
	| { kind: 'timeout' }

async function complete({
	apiKey,
	model,
	messages,
	jsonMode,
	deadline,
	fetchImpl,
}: {
	apiKey: string
	model: string
	messages: ChatMessage[]
	jsonMode: boolean
	deadline: number
	fetchImpl: typeof fetch
}): Promise<Completion> {
	const remaining = deadline - Date.now()
	if (remaining < 1000) return { kind: 'timeout' }
	let response: Response
	try {
		response = await fetchImpl(OPENROUTER_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://hitchcoxaesthetics.com',
				'X-Title': 'Hitchcox article review',
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: 0.2,
				max_tokens: MAX_OUTPUT_TOKENS,
				...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
			}),
			signal: AbortSignal.timeout(remaining),
		})
	} catch (error) {
		const name = error instanceof Error ? error.name : ''
		if (name === 'TimeoutError' || name === 'AbortError') return { kind: 'timeout' }
		throw error
	}
	if (!response.ok) {
		const body = await response.text().catch(() => '')
		return { kind: 'http', status: response.status, body: body.slice(0, 300) }
	}
	const payload = (await response.json().catch(() => null)) as {
		choices?: Array<{ message?: { content?: string } }>
	} | null
	const text = payload?.choices?.[0]?.message?.content ?? ''
	return { kind: 'text', text }
}

/**
 * Apply one change request. Sends response_format json_object first; when
 * the model rejects that parameter (HTTP 4xx naming it) the call is sent
 * again without it. A reply that is not JSON gets one more try with a
 * reminder, then the caller shows an error.
 */
export async function editArticle({
	prompt,
	markdown,
	links,
	config = getArticleEditConfig(),
	fetchImpl = fetch,
	timeoutMs = ARTICLE_EDIT_TIMEOUT_MS,
}: {
	prompt: string
	markdown: string
	links: ArticleLink[]
	config?: ReturnType<typeof getArticleEditConfig>
	fetchImpl?: typeof fetch
	timeoutMs?: number
}): Promise<ArticleEditResult> {
	const model = config?.model ?? ARTICLE_EDIT_DEFAULT_MODEL
	if (!config) return { ok: false, model, error: 'missing_open_router_api_key' }
	const deadline = Date.now() + timeoutMs
	const messages: ChatMessage[] = [
		{ role: 'system', content: buildEditSystemPrompt(links) },
		{ role: 'user', content: buildEditUserMessage(prompt, markdown) },
	]
	const base = { apiKey: config.apiKey, model, deadline, fetchImpl }

	let jsonMode = true
	let first = await complete({ ...base, messages, jsonMode })
	if (
		first.kind === 'http' &&
		first.status >= 400 &&
		first.status < 500 &&
		/response_format|json_object|structured/i.test(first.body)
	) {
		jsonMode = false
		first = await complete({ ...base, messages, jsonMode })
	}
	if (first.kind === 'timeout') return { ok: false, model, error: 'openrouter_timeout' }
	if (first.kind === 'http') {
		console.error(`Article edit: OpenRouter ${first.status} (model ${model})`)
		return { ok: false, model, error: 'openrouter_http_error', status: first.status }
	}
	if (!first.text.trim()) return { ok: false, model, error: 'openrouter_empty_response' }

	let reply = parseEditReply(first.text)
	if (!reply) {
		const retryMessages: ChatMessage[] = [
			...messages,
			{ role: 'assistant', content: first.text.slice(0, 4000) },
			{
				role: 'user',
				content:
					'That was not a JSON object. Reply again with ONLY the JSON object { "markdown": "...", "summary": "..." } and nothing else.',
			},
		]
		const second = await complete({ ...base, messages: retryMessages, jsonMode })
		if (second.kind === 'timeout') return { ok: false, model, error: 'openrouter_timeout' }
		if (second.kind === 'http') {
			console.error(`Article edit: OpenRouter retry ${second.status} (model ${model})`)
			return { ok: false, model, error: 'openrouter_http_error', status: second.status }
		}
		reply = parseEditReply(second.text)
		if (!reply) return { ok: false, model, error: 'openrouter_unparseable_response' }
	}
	console.log(
		`Article edit: model ${model}, prompt ${prompt.length} chars, in ${markdown.length} chars, out ${reply.markdown.length} chars, summary ${reply.summary.length} chars`,
	)
	return { ok: true, model, markdown: reply.markdown, summary: reply.summary }
}
