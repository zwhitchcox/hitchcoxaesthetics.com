import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	ArticleSyncError,
	SyncPayloadSchema,
	assertBodiesForNewArticles,
	upsertSyncedArticle,
	type UpsertResult,
} from '#app/utils/articles.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * Sync endpoint for the outreach system on the Mac mini
 * (tools/article-writer/review_sync.py in the pbn repo).
 *
 *   POST /resources/article-sync   {articles: [...]}   create or update articles and their pictures
 *   GET  /resources/article-sync?since=<ISO>            review state changed since then
 *
 * GET returns every row that changed, including status `changes_requested`
 * (her note is `reviewNote`; `rewriteRequested` true means she asked for a
 * different article), the approval record (`approvedBodyHash`), her question
 * for Zane with his answer, and `incomingAt` when writer text is held after
 * a decision. The body is returned for approved rows only.
 *
 * Guarded by ARTICLE_SYNC_TOKEN, same trust model as INTERNAL_COMMAND_TOKEN.
 * With the token unset the endpoint refuses everything.
 */
function authorized(request: Request) {
	const token = process.env.ARTICLE_SYNC_TOKEN
	const auth = request.headers.get('Authorization')
	return Boolean(token && auth === `Bearer ${token}`)
}

export async function loader({ request }: LoaderFunctionArgs) {
	if (!authorized(request))
		return json({ error: 'unauthorized' }, { status: 401 })
	const since = new URL(request.url).searchParams.get('since')
	const sinceDate = since ? new Date(since) : null
	const where =
		sinceDate && !Number.isNaN(sinceDate.getTime())
			? { updatedAt: { gt: sinceDate } }
			: {}
	const rows = await prisma.article.findMany({
		where,
		orderBy: { updatedAt: 'asc' },
		select: {
			id: true,
			sourceKey: true,
			kind: true,
			status: true,
			reviewNote: true,
			reviewedAt: true,
			reviewedBy: true,
			editedAt: true,
			editedBy: true,
			bodyHash: true,
			body: true,
			bodyOriginal: true,
			approvedBodyHash: true,
			question: true,
			questionAt: true,
			answer: true,
			rewriteRequested: true,
			incomingAt: true,
			updatedAt: true,
			_count: { select: { images: true } },
		},
	})
	return json({
		now: new Date().toISOString(),
		articles: rows.map(r => ({
			id: r.id,
			sourceKey: r.sourceKey,
			kind: r.kind,
			status: r.status,
			reviewNote: r.reviewNote,
			reviewedAt: r.reviewedAt,
			reviewedBy: r.reviewedBy,
			editedAt: r.editedAt,
			editedBy: r.editedBy,
			bodyHash: r.bodyHash,
			edited: r.body !== r.bodyOriginal,
			// the approved text is what gets submitted; other states only need the decision
			body: r.status === 'approved' ? r.body : undefined,
			// sha256 of the exact text she approved; null until she approves
			approvedBodyHash: r.approvedBodyHash,
			question: r.question,
			questionAt: r.questionAt,
			answer: r.answer,
			// "Write a different article": the mini queues a clean-room draft
			rewriteRequested: r.rewriteRequested,
			// when writer text was last held after a decision (null: none held)
			incomingAt: r.incomingAt,
			images: r._count.images,
			updatedAt: r.updatedAt,
		})),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	if (!authorized(request))
		return json({ error: 'unauthorized' }, { status: 401 })
	if (request.method !== 'POST')
		return json({ error: 'POST only' }, { status: 405 })
	let raw: unknown
	try {
		raw = await request.json()
	} catch {
		return json({ error: 'body must be JSON' }, { status: 400 })
	}
	const parsed = SyncPayloadSchema.safeParse(raw)
	if (!parsed.success) {
		return json(
			{ error: 'invalid payload', issues: parsed.error.issues.slice(0, 10) },
			{ status: 400 },
		)
	}
	const results: UpsertResult[] = []
	try {
		// a create needs a body; refuse the batch before any write
		await assertBodiesForNewArticles(parsed.data.articles)
		for (const article of parsed.data.articles) {
			results.push(await upsertSyncedArticle(article))
		}
	} catch (error) {
		if (error instanceof ArticleSyncError) {
			return json(
				{ error: error.message, sourceKey: error.sourceKey, results },
				{ status: error.status },
			)
		}
		throw error
	}
	return json({ results })
}
