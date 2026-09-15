import { json, type ActionFunctionArgs } from '@remix-run/node'
import { takeRateLimitToken } from '#app/utils/ai-chat.ts'
import { editArticle, getArticleEditConfig } from '#app/utils/article-edit.server.ts'
import {
	ARTICLE_EDIT_RATE_LIMIT,
	ArticleEditRequestSchema,
} from '#app/utils/article-edit.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'

/**
 * "Tell it what to change" for the article review pages.
 *
 *   POST /resources/article-edit  { articleId, prompt, markdown, links }
 *   -> { markdown, summary }      the working copy after the change
 *
 * Admin only. The markdown is the reviewer's CURRENT working copy, not the
 * saved body, so one request can build on the last one. Nothing is saved
 * here: the page's Save edits / Approve buttons store the result. Each
 * applied change writes an ArticleReviewEvent of kind ai_edit whose note is
 * the model's summary. Logs carry lengths and the model id, never the text.
 */

// Per-user sliding window of request timestamps. In-memory per machine,
// like the AI chat caps; enough to stop a runaway tap loop.
const rateWindows = new Map<string, number[]>()

const ERROR_MESSAGES = {
	missing_open_router_api_key:
		'The change tool is not set up on this server. Ask Zane.',
	openrouter_http_error:
		'The change tool did not answer. Try again in a moment.',
	openrouter_timeout:
		'That took too long. Try a smaller change, or try again in a moment.',
	openrouter_empty_response:
		'The change tool sent nothing back. Try again in a moment.',
	openrouter_unparseable_response:
		'The change tool sent an answer it could not use. Try again, or say the change in other words.',
} as const

export function loader() {
	return json({ error: 'POST only' }, { status: 405 })
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'POST only' }, { status: 405 })
	}
	const userId = await requireUserWithRole(request, 'admin')

	const raw = await request.json().catch(() => null)
	const parsed = ArticleEditRequestSchema.safeParse(raw)
	if (!parsed.success) {
		return json(
			{ error: 'Say what to change, in up to 4000 characters.' },
			{ status: 400 },
		)
	}
	const { articleId, prompt, markdown, links } = parsed.data

	pruneRateWindows()
	const window = takeRateLimitToken(
		rateWindows.get(userId) ?? [],
		Date.now(),
		ARTICLE_EDIT_RATE_LIMIT,
	)
	rateWindows.set(userId, window.timestamps)
	if (!window.allowed) {
		return json(
			{ error: 'That is many changes in one minute. Wait a moment and try again.' },
			{ status: 429 },
		)
	}

	const article = await prisma.article.findUnique({
		where: { id: articleId },
		select: { id: true },
	})
	if (!article) return json({ error: 'Article not found.' }, { status: 404 })

	const config = getArticleEditConfig()
	if (!config) {
		console.error('Article edit: OPEN_ROUTER_API_KEY is not set')
		return json(
			{ error: ERROR_MESSAGES.missing_open_router_api_key },
			{ status: 503 },
		)
	}

	const result = await editArticle({ prompt, markdown, links, config })
	if (!result.ok) {
		console.error(
			`Article edit: ${result.error} (model ${result.model}, prompt ${prompt.length} chars, in ${markdown.length} chars)`,
		)
		const status = result.error === 'openrouter_timeout' ? 504 : 502
		return json({ error: ERROR_MESSAGES[result.error] }, { status })
	}

	await recordReviewEvent(articleId, 'ai_edit', {
		userId,
		note: result.summary,
		seconds: null,
	})

	return json({ markdown: result.markdown, summary: result.summary })
}

/** Keep the in-memory window map from growing without bound. */
function pruneRateWindows() {
	const cutoff = Date.now() - ARTICLE_EDIT_RATE_LIMIT.windowMs
	for (const [key, timestamps] of rateWindows) {
		if (!timestamps.some(t => t > cutoff)) rateWindows.delete(key)
	}
}
