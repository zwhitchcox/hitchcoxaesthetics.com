import { json, type ActionFunctionArgs } from '@remix-run/node'
import { takeRateLimitToken } from '#app/utils/ai-chat.ts'
import {
	ARTICLE_SAVE_RATE_LIMIT,
	ArticleSaveRequestSchema,
} from '#app/utils/article-edit.ts'
import { reviewerName, saveWorkingCopy } from '#app/utils/articles.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

/**
 * Auto-save for the article review pages.
 *
 *   POST /resources/article-save  { articleId, body, baseHash, source? }
 *   -> 200 { ok: true, hash, changed }      saved, or the same text (no write)
 *   -> 409 { error: 'changed', message, body, hash }
 *                                           the writer sent new text meanwhile
 *   -> 409 { error: 'decided', message }    the article is not pending
 *
 * Admin only, JSON only. `baseHash` is hashBody(article.body) as the page
 * loaded it, so a save never overwrites text the page has not seen. The
 * rules live in saveWorkingCopy (articles.server.ts). Logs carry lengths
 * only, and only on an error.
 */

export const ARTICLE_SAVE_COPY = {
	changed: 'The writer sent new text while you were editing.',
	decided: 'This one is already decided. Reopen it first.',
	empty: 'The article text cannot be empty.',
	tooMany: 'That is many saves in one minute. Wait a moment and try again.',
} as const

// Per-user sliding window of request timestamps. In-memory per machine.
const rateWindows = new Map<string, number[]>()

export function loader() {
	return json({ error: 'POST only' }, { status: 405 })
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'POST only' }, { status: 405 })
	}
	const userId = await requireUserWithRole(request, 'admin')

	const raw = await request.json().catch(() => null)
	const parsed = ArticleSaveRequestSchema.safeParse(raw)
	if (!parsed.success) {
		const tooLong = parsed.error.issues.some(
			i => i.path[0] === 'body' && i.code === 'too_big',
		)
		return json(
			{
				error: tooLong
					? 'The text is too long to save. It must be under 60,000 characters.'
					: ARTICLE_SAVE_COPY.empty,
			},
			{ status: 400 },
		)
	}
	const { articleId, body, baseHash, source } = parsed.data
	if (!body.trim()) {
		return json({ error: ARTICLE_SAVE_COPY.empty }, { status: 400 })
	}

	pruneRateWindows()
	const window = takeRateLimitToken(
		rateWindows.get(userId) ?? [],
		Date.now(),
		ARTICLE_SAVE_RATE_LIMIT,
	)
	rateWindows.set(userId, window.timestamps)
	if (!window.allowed) {
		return json({ error: ARTICLE_SAVE_COPY.tooMany }, { status: 429 })
	}

	const outcome = await saveWorkingCopy({
		id: articleId,
		body,
		baseHash,
		who: await reviewerName(userId),
		userId,
		source,
	})
	switch (outcome.kind) {
		case 'saved':
			return json({ ok: true, hash: outcome.hash, changed: true })
		case 'same':
			return json({ ok: true, hash: outcome.hash, changed: false })
		case 'changed':
			return json(
				{
					error: 'changed',
					message: ARTICLE_SAVE_COPY.changed,
					body: outcome.body,
					hash: outcome.hash,
				},
				{ status: 409 },
			)
		case 'decided':
			return json(
				{ error: 'decided', message: ARTICLE_SAVE_COPY.decided },
				{ status: 409 },
			)
		case 'missing':
			return json({ error: 'Article not found.' }, { status: 404 })
	}
}

/** Keep the in-memory window map from growing without bound. */
function pruneRateWindows() {
	const cutoff = Date.now() - ARTICLE_SAVE_RATE_LIMIT.windowMs
	for (const [key, timestamps] of rateWindows) {
		if (!timestamps.some(t => t > cutoff)) rateWindows.delete(key)
	}
}
