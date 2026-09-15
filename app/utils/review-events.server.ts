import { prisma } from '#app/utils/db.server.ts'

/**
 * The event log behind Sarah's article review (/review). One row per thing
 * that happened to an article. The feed, the digest and the metrics read it.
 * Nothing here is shown to her as a count or a streak.
 */

export const REVIEW_EVENT_KINDS = [
	'opened',
	'read_to',
	'approved',
	'changes_requested',
	'rewrite_requested',
	'later',
	'question',
	'denied',
	'reopened',
	'takedown',
	'ai_edit',
	'saved',
	'keep_approval',
	'sent',
	'live',
	'digest_sent',
	'weekly_sent',
] as const

export type ReviewEventKind = (typeof REVIEW_EVENT_KINDS)[number]

export function isReviewEventKind(value: unknown): value is ReviewEventKind {
	return (
		typeof value === 'string' &&
		(REVIEW_EVENT_KINDS as readonly string[]).includes(value)
	)
}

export type ReviewEventExtras = {
	/** The admin who did it. Null for the sync endpoint and the jobs. */
	userId?: string | null
	/** For read_to: the paragraph index she reached. */
	paragraph?: number | null
	/** For approved: seconds since the last `opened`. For ai_edit: prompt length. */
	seconds?: number | null
	/** Her note, her question, or a short label. Never the article text. */
	note?: string | null
	/** Defaults to now. Tests pass a fixed date. */
	at?: Date
}

/** Append one event. Returns the row id and its time. */
export async function recordReviewEvent(
	articleId: string,
	kind: ReviewEventKind,
	extras: ReviewEventExtras = {},
): Promise<{ id: string; at: Date }> {
	return prisma.articleReviewEvent.create({
		data: {
			articleId,
			kind,
			userId: extras.userId ?? null,
			paragraph: extras.paragraph ?? null,
			seconds: extras.seconds ?? null,
			note: extras.note ?? null,
			...(extras.at ? { at: extras.at } : {}),
		},
		select: { id: true, at: true },
	})
}

/**
 * Whole seconds from the most recent `opened` event on the article to `now`.
 * Null when she never opened it on the phone. Use it for the `approved`
 * event's `seconds`.
 */
export async function secondsSinceOpened(
	articleId: string,
	now: Date = new Date(),
): Promise<number | null> {
	const opened = await prisma.articleReviewEvent.findFirst({
		where: { articleId, kind: 'opened' },
		orderBy: { at: 'desc' },
		select: { at: true },
	})
	if (!opened) return null
	return Math.max(0, Math.round((now.getTime() - opened.at.getTime()) / 1000))
}
