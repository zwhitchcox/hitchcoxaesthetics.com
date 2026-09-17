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
import {
	listAnswersForSync,
	syncOpenAsks,
} from '#app/utils/review-asks.server.ts'
import { SyncAsksPayloadSchema, isAsksPayload } from '#app/utils/review-asks.ts'
import {
	listFactsForSync,
	upsertDocFacts,
} from '#app/utils/review-facts.server.ts'
import {
	SyncFactsPayloadSchema,
	isFactsPayload,
} from '#app/utils/review-facts.ts'

/**
 * Sync endpoint for the outreach system on the Mac mini
 * (tools/article-writer/review_sync.py in the pbn repo).
 *
 *   POST /resources/article-sync   {articles: [...]}   create or update articles and their pictures
 *   POST /resources/article-sync   {facts: [...]}      mirror the docs rows of the fact bank (phase 5, R8):
 *                                                       [{ key, fact, tags, question?, answer? }], at most 500,
 *                                                       upserted by key with source 'docs'; a key that is not
 *                                                       sent is left alone. -> { upserted, unchanged }
 *   POST /resources/article-sync   {asks: [...]}       mirror the open questions for Sarah (phase 6, A2):
 *                                                       [{ key, targetId?, domain, ask, effort?, about?,
 *                                                       standing?, files? }], at most 200, upserted by key;
 *                                                       an open key that is not sent is closed.
 *                                                       -> { open, closed }
 *   GET  /resources/article-sync?since=<ISO>            review state changed since then
 *   GET  /resources/article-sync?facts=1                the non-retired fact rows: { now, facts: [{ id, key,
 *                                                       source, fact, tags, question, answer, updatedAt }] };
 *                                                       add &since=<ISO> for rows updated after that time
 *   GET  /resources/article-sync?asks=1                 her answers: { now, asks: [{ key, targetId, answer,
 *                                                       answeredAt, answeredBy }] }; add &since=<ISO> for
 *                                                       answers after that time
 *   GET  /resources/article-sync?image=<id>             the bytes of one stored picture (a picture Sarah
 *                                                       added in the chat, named images/user-<id>.<ext>
 *                                                       in approved.md; the mini's pull downloads it)
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
	const params = new URL(request.url).searchParams
	const imageId = params.get('image')
	if (imageId) return imageResponse(imageId)
	const since = params.get('since')
	if (params.get('facts')) return factsResponse(since)
	if (params.get('asks')) return asksResponse(since)
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

/** The fact bank for the mini (R8). The token was checked by the caller. */
async function factsResponse(since: string | null) {
	const sinceDate = since ? new Date(since) : null
	const facts = await listFactsForSync(
		sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null,
	)
	return json({ now: new Date().toISOString(), facts })
}

/** Her answers for the mini (phase 6). The token was checked by the caller. */
async function asksResponse(since: string | null) {
	const sinceDate = since ? new Date(since) : null
	const asks = await listAnswersForSync(
		sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null,
	)
	return json({ now: new Date().toISOString(), asks })
}

/** One stored picture as a download. The token was checked by the caller. */
async function imageResponse(imageId: string) {
	const image = await prisma.articleImage.findUnique({
		where: { id: imageId },
		select: { fileName: true, contentType: true, blob: true },
	})
	if (!image) return json({ error: 'not found' }, { status: 404 })
	const fileName = image.fileName.replace(/["\\\r\n]/g, '')
	return new Response(image.blob, {
		headers: {
			'Content-Type': image.contentType,
			'Content-Length': image.blob.byteLength.toString(),
			'Content-Disposition': `attachment; filename="${fileName}"`,
			'Cache-Control': 'private, no-store',
		},
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
	if (isFactsPayload(raw)) {
		const facts = SyncFactsPayloadSchema.safeParse(raw)
		if (!facts.success) {
			return json(
				{ error: 'invalid payload', issues: facts.error.issues.slice(0, 10) },
				{ status: 400 },
			)
		}
		return json(await upsertDocFacts(facts.data.facts))
	}
	if (isAsksPayload(raw)) {
		const asks = SyncAsksPayloadSchema.safeParse(raw)
		if (!asks.success) {
			return json(
				{ error: 'invalid payload', issues: asks.error.issues.slice(0, 10) },
				{ status: 400 },
			)
		}
		return json(await syncOpenAsks(asks.data.asks))
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
