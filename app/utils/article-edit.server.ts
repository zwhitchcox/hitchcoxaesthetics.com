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
	changedParagraphShare,
	parseEditReply,
	pictureLines,
	type ArticleEditReply,
	type ArticleEditSelection,
} from '#app/utils/article-edit.ts'
import { type ArticleLink } from '#app/utils/articles.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_OUTPUT_TOKENS = 16_000
/** A passage edit that rewrites more than this share of paragraphs gets one retry. */
const PASSAGE_CHANGE_SHARE_MAX = 0.4
/** The request names a picture: then the picture lines may change. */
const NAMES_PICTURE_RE = /picture|image|photo/i

const JSON_REMINDER =
	'That was not a JSON object. Reply again with ONLY the JSON object { "markdown": "...", "summary": "..." } and nothing else.'
const PICTURE_REMINDER =
	'The picture lines changed. Keep every line that starts with ![ and its caption exactly as it was and where it was. Reply again with ONLY the JSON object { "markdown": "...", "summary": "..." }.'
const PASSAGE_REMINDER =
	'Change only the quoted passage. Leave every other paragraph exactly as it was. Reply again with ONLY the JSON object { "markdown": "...", "summary": "..." }.'

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
	// The abort covers the wait for headers only. Aborting while the body is
	// being read makes the fetch polyfill throw outside any handler, which
	// drops the whole response. The body read is bounded by a race instead.
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), remaining)
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
			signal: controller.signal,
		})
	} catch (error) {
		clearTimeout(timer)
		const name = error instanceof Error ? error.name : ''
		if (name === 'TimeoutError' || name === 'AbortError') return { kind: 'timeout' }
		throw error
	}
	clearTimeout(timer)
	const body = await readWithin(response.text(), deadline - Date.now())
	if (body === null) return { kind: 'timeout' }
	if (!response.ok) {
		return { kind: 'http', status: response.status, body: body.slice(0, 300) }
	}
	let payload: CompletionPayload | null = null
	try {
		payload = JSON.parse(body) as CompletionPayload
	} catch {
		payload = null
	}
	const text = payload?.choices?.[0]?.message?.content ?? ''
	return { kind: 'text', text }
}

type CompletionPayload = {
	choices?: Array<{ message?: { content?: string } }>
}

/** The body text, or null when it does not arrive within `ms`. */
async function readWithin(read: Promise<string>, ms: number): Promise<string | null> {
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

/**
 * Apply one change request. Sends response_format json_object first; when
 * the model rejects that parameter (HTTP 4xx naming it) the call is sent
 * again without it. A reply that is not JSON gets one more try with a
 * reminder, then the caller shows an error.
 *
 * Two more guards, one retry each: a reply that moved or dropped a picture
 * line when the request named no picture (the second reply must pass, or
 * the caller shows the "could not use" error); and a passage edit that
 * rewrote more than 40 percent of the paragraphs (the second reply is
 * returned as it is; she sees the marks and has Undo that).
 */
export async function editArticle({
	prompt,
	markdown,
	links,
	selection = null,
	config = getArticleEditConfig(),
	fetchImpl = fetch,
	timeoutMs = ARTICLE_EDIT_TIMEOUT_MS,
}: {
	prompt: string
	markdown: string
	links: ArticleLink[]
	selection?: ArticleEditSelection | null
	config?: ReturnType<typeof getArticleEditConfig>
	fetchImpl?: typeof fetch
	timeoutMs?: number
}): Promise<ArticleEditResult> {
	const model = config?.model ?? ARTICLE_EDIT_DEFAULT_MODEL
	if (!config) return { ok: false, model, error: 'missing_open_router_api_key' }
	const deadline = Date.now() + timeoutMs
	const messages: ChatMessage[] = [
		{ role: 'system', content: buildEditSystemPrompt(links) },
		{ role: 'user', content: buildEditUserMessage(prompt, markdown, selection) },
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
	const failure = (turn: Completion, label: string): ArticleEditResult | null => {
		if (turn.kind === 'timeout') return { ok: false, model, error: 'openrouter_timeout' }
		if (turn.kind === 'http') {
			console.error(`Article edit: OpenRouter ${label}${turn.status} (model ${model})`)
			return { ok: false, model, error: 'openrouter_http_error', status: turn.status }
		}
		return null
	}
	const failed = failure(first, '')
	if (failed) return failed
	if (first.kind !== 'text' || !first.text.trim()) {
		return { ok: false, model, error: 'openrouter_empty_response' }
	}

	/** One more turn: the last reply plus a reminder. Null on a transport failure. */
	const retry = async (
		lastText: string,
		reminder: string,
	): Promise<{ reply: ArticleEditReply | null } | ArticleEditResult> => {
		const again: ChatMessage[] = [
			...messages,
			{ role: 'assistant', content: lastText.slice(0, 4000) },
			{ role: 'user', content: reminder },
		]
		const turn = await complete({ ...base, messages: again, jsonMode })
		const lost = failure(turn, 'retry ')
		if (lost) return lost
		return { reply: turn.kind === 'text' ? parseEditReply(turn.text) : null }
	}

	let raw = first.text
	let reply = parseEditReply(raw)
	if (!reply) {
		const second = await retry(raw, JSON_REMINDER)
		if ('ok' in second) return second
		reply = second.reply
		if (!reply) return { ok: false, model, error: 'openrouter_unparseable_response' }
		raw = JSON.stringify(reply)
	}

	const picturesMoved = (next: string) =>
		pictureLines(next).join('\n') !== pictureLines(markdown).join('\n')
	if (picturesMoved(reply.markdown) && !NAMES_PICTURE_RE.test(prompt)) {
		console.log(`Article edit: picture lines changed, one retry (model ${model})`)
		const second = await retry(raw, PICTURE_REMINDER)
		if ('ok' in second) return second
		if (!second.reply || picturesMoved(second.reply.markdown)) {
			return { ok: false, model, error: 'openrouter_unparseable_response' }
		}
		reply = second.reply
		raw = JSON.stringify(reply)
	}

	if (
		selection &&
		changedParagraphShare(markdown, reply.markdown) > PASSAGE_CHANGE_SHARE_MAX
	) {
		console.log(`Article edit: passage edit changed too much, one retry (model ${model})`)
		const second = await retry(raw, PASSAGE_REMINDER)
		if ('ok' in second) return second
		if (second.reply) reply = second.reply
	}

	// Keep the shape of the stored body: a JSON reply often drops the final newline.
	if (markdown.endsWith('\n') && !reply.markdown.endsWith('\n')) {
		reply = { ...reply, markdown: `${reply.markdown}\n` }
	}

	console.log(
		`Article edit: model ${model}, prompt ${prompt.length} chars, selection ${selection?.text.length ?? 0} chars, in ${markdown.length} chars, out ${reply.markdown.length} chars, summary ${reply.summary.length} chars`,
	)
	return { ok: true, model, markdown: reply.markdown, summary: reply.summary }
}
