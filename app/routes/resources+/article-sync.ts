import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	SyncPayloadSchema,
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
 * Guarded by ARTICLE_SYNC_TOKEN, same trust model as INTERNAL_COMMAND_TOKEN.
 * With the token unset the endpoint refuses everything.
 */
function authorized(request: Request) {
	const token = process.env.ARTICLE_SYNC_TOKEN
	const auth = request.headers.get('Authorization')
	return Boolean(token && auth === `Bearer ${token}`)
}

export async function loader({ request }: LoaderFunctionArgs) {
	if (!authorized(request)) return json({ error: 'unauthorized' }, { status: 401 })
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
			images: r._count.images,
			updatedAt: r.updatedAt,
		})),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	if (!authorized(request)) return json({ error: 'unauthorized' }, { status: 401 })
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
	for (const article of parsed.data.articles) {
		results.push(await upsertSyncedArticle(article))
	}
	return json({ results })
}
