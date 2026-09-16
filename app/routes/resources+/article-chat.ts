import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { takeRateLimitToken } from '#app/utils/ai-chat.ts'
import {
	getArticleChatConfig,
	loadChatHistory,
	loadGrillState,
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
 * The chat that edits the article (spec phase 3, section 2; phase 5 adds
 * the grill).
 *
 *   POST /resources/article-chat  { articleId, text, quote?, imageId?, baseHash, mode? }
 *   -> 200 { messages, body, hash, changed, grill }
 *                                               the new rows, the working copy after the turn,
 *                                               grill: 'active' | 'done' | null
 *   -> 400 { error }                            bad request, or a picture that is not on this article
 *   -> 404 { error }
 *   -> 409 { error: 'decided', message }        the article is not pending
 *   -> 409 { error: 'changed', message, body, hash }
 *                                               the stored text moved on since baseHash
 *   -> 409 { error: 'grill_active', message }   mode 'grill' while a grill runs
 *   -> 429 | 502 | 503 | 504 { error }
 *
 *   mode 'grill' (no text): the first question lands as an assistant row
 *   with toolName 'grill_question'. mode 'grill_stop' (no text): a
 *   grill_done row 'Stopped.'. A plain turn while a grill runs is her
 *   answer; the turn ends with a grill_question or a grill_done row.
 *
 *   GET /resources/article-chat?articleId=<id>
 *   -> 200 { messages, grill }                  the last 200 rows, oldest first; grill: 'active' | null
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
	const [messages, grill] = await Promise.all([
		loadChatHistory(articleId),
		loadGrillState(articleId),
	])
	return json(
		{ messages, grill: grill.active ? ('active' as const) : null },
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
	const { articleId, text, quote, imageId, baseHash, mode } = parsed.data

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
		mode,
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
		case 'grill_active':
			return json(
				{ error: 'grill_active', message: CHAT_COPY.grillActive },
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
