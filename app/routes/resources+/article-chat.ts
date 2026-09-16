import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { takeRateLimitToken } from '#app/utils/ai-chat.ts'
import {
	getArticleChatConfig,
	loadChatHistory,
	runArticleChatTurn,
} from '#app/utils/article-chat.server.ts'
import {
	ARTICLE_CHAT_RATE_LIMIT,
	ArticleChatRequestSchema,
	CHAT_COPY,
} from '#app/utils/article-chat.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

/**
 * The chat that edits the article (spec phase 3, section 2).
 *
 *   POST /resources/article-chat  { articleId, text, quote?, imageId?, baseHash }
 *   -> 200 { messages, body, hash, changed }   the new rows, the working copy after the turn
 *   -> 400 { error }                            bad request, or a picture that is not on this article
 *   -> 404 { error }
 *   -> 409 { error: 'decided', message }        the article is not pending
 *   -> 409 { error: 'changed', message, body, hash }
 *                                               the stored text moved on since baseHash
 *   -> 429 | 502 | 503 | 504 { error }
 *
 *   GET /resources/article-chat?articleId=<id>
 *   -> 200 { messages }                         the last 200 rows, oldest first
 *
 * Admin only, JSON only. The turn itself lives in article-chat.server.ts.
 * Logs carry lengths, counts and the model id, never the text.
 */

// Per-user sliding window of request timestamps. In-memory per machine,
// like the AI chat caps; enough to stop a runaway tap loop.
const rateWindows = new Map<string, number[]>()

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const articleId = new URL(request.url).searchParams.get('articleId')?.trim()
	if (!articleId)
		return json({ error: 'articleId is required.' }, { status: 400 })
	const article = await prisma.article.findUnique({
		where: { id: articleId },
		select: { id: true },
	})
	if (!article) return json({ error: CHAT_COPY.notFound }, { status: 404 })
	return json(
		{ messages: await loadChatHistory(articleId) },
		{ headers: { 'Cache-Control': 'no-store' } },
	)
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'POST only' }, { status: 405 })
	}
	const userId = await requireUserWithRole(request, 'admin')

	const raw = await request.json().catch(() => null)
	const parsed = ArticleChatRequestSchema.safeParse(raw)
	if (!parsed.success) {
		return json({ error: CHAT_COPY.badRequest }, { status: 400 })
	}
	const { articleId, text, quote, imageId, baseHash } = parsed.data

	pruneRateWindows()
	const window = takeRateLimitToken(
		rateWindows.get(userId) ?? [],
		Date.now(),
		ARTICLE_CHAT_RATE_LIMIT,
	)
	rateWindows.set(userId, window.timestamps)
	if (!window.allowed) {
		return json({ error: CHAT_COPY.tooMany }, { status: 429 })
	}

	const config = getArticleChatConfig()
	if (!config) console.error('Article chat: OPEN_ROUTER_API_KEY is not set')

	const result = await runArticleChatTurn({
		articleId,
		userId,
		text,
		quote,
		imageId,
		baseHash,
		config,
	})
	if (result.ok) {
		const { ok: _ok, ...payload } = result
		return json(payload)
	}
	switch (result.kind) {
		case 'missing':
			return json({ error: CHAT_COPY.notFound }, { status: 404 })
		case 'decided':
			return json(
				{ error: 'decided', message: CHAT_COPY.decided },
				{ status: 409 },
			)
		case 'changed':
			return json(
				{
					error: 'changed',
					message: CHAT_COPY.changed,
					body: result.body,
					hash: result.hash,
				},
				{ status: 409 },
			)
		case 'unknown_image':
			return json({ error: CHAT_COPY.unknownImage }, { status: 400 })
		case 'not_configured':
			return json({ error: CHAT_COPY.notSetUp }, { status: 503 })
		case 'no_answer':
			return json({ error: CHAT_COPY.noAnswer }, { status: 502 })
		case 'timeout':
			return json({ error: CHAT_COPY.tooLong }, { status: 504 })
	}
}

/** Keep the in-memory window map from growing without bound. */
function pruneRateWindows() {
	const cutoff = Date.now() - ARTICLE_CHAT_RATE_LIMIT.windowMs
	for (const [key, timestamps] of rateWindows) {
		if (!timestamps.some(t => t > cutoff)) rateWindows.delete(key)
	}
}
