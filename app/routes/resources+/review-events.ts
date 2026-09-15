import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'

/**
 * The reading beacon from /review/:id. Recorded, never policed.
 *
 *   POST /resources/review-events  { articleId, kind: 'opened' }
 *   POST /resources/review-events  { articleId, kind: 'read_to', paragraph, end? }
 *
 * `opened` logs an event (the approved event's seconds count from it).
 * `read_to` raises Article.readToParagraph (never lowers it), stamps
 * readReachedEndAt the first time `end` is true, and logs an event. Admin
 * only; JSON body, also as a sendBeacon Blob.
 */
const BeaconSchema = z.object({
	articleId: z.string().min(1).max(64),
	kind: z.enum(['opened', 'read_to']),
	paragraph: z.number().int().min(0).max(100000).optional(),
	end: z.boolean().optional(),
})

export function loader() {
	return json({ error: 'POST only' }, { status: 405 })
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'POST only' }, { status: 405 })
	}
	const userId = await requireUserWithRole(request, 'admin')
	const raw = await request.json().catch(() => null)
	const parsed = BeaconSchema.safeParse(raw)
	if (!parsed.success) {
		return json({ error: 'Bad beacon.' }, { status: 400 })
	}
	const { articleId, kind, paragraph, end } = parsed.data
	const article = await prisma.article.findUnique({
		where: { id: articleId },
		select: { id: true, readToParagraph: true, readReachedEndAt: true },
	})
	if (!article) return json({ error: 'Article not found.' }, { status: 404 })
	const now = new Date()

	if (kind === 'opened') {
		await recordReviewEvent(articleId, 'opened', { userId, at: now })
		return json({ ok: true })
	}

	if (paragraph === undefined) {
		return json({ error: 'read_to needs a paragraph.' }, { status: 400 })
	}
	const data: { readToParagraph?: number; readReachedEndAt?: Date } = {}
	if (paragraph > (article.readToParagraph ?? -1)) {
		data.readToParagraph = paragraph
	}
	if (end && !article.readReachedEndAt) data.readReachedEndAt = now
	if (Object.keys(data).length > 0) {
		await prisma.article.update({ where: { id: articleId }, data })
	}
	await recordReviewEvent(articleId, 'read_to', {
		userId,
		paragraph,
		note: end ? 'end' : null,
		at: now,
	})
	return json({ ok: true })
}
