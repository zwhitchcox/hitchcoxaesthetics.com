/**
 * Server helpers shared by the /review routes: which rows make the phone
 * queue, the decision writes, and the sitting cookie after a decision.
 * Not a route (the `.server.ts` suffix keeps it out of the route tree).
 */
import { redirect } from '@remix-run/node'
import { hashBody } from '#app/utils/articles.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { combineHeaders } from '#app/utils/misc.tsx'
import {
	recordReviewEvent,
	secondsSinceOpened,
} from '#app/utils/review-events.server.ts'
import {
	afterDecision,
	cardReadSeconds,
	getReviewLane,
	getReviewSitting,
	orderCards,
	setReviewSitting,
	type QueueArticle,
	type ReviewCard,
	type ReviewLane,
	type ReviewSitting,
} from '#app/utils/review-queue.server.ts'

export const TIME_ZONE = 'America/New_York'

/** Three days, for "Later". */
export const LATER_MS = 3 * 24 * 60 * 60 * 1000

/** The columns every /review list reads. Never the body. */
export const QUEUE_SELECT = {
	id: true,
	kind: true,
	title: true,
	slug: true,
	publication: true,
	status: true,
	isReference: true,
	wordCount: true,
	estimatedReadSeconds: true,
	writer: true,
	publisherWaiting: true,
	placementUsd: true,
	revisionNote: true,
	readToParagraph: true,
	skippedUntil: true,
	editedAt: true,
	editedBy: true,
	receivedAt: true,
	reviewedAt: true,
	outreachStatus: true,
	liveUrl: true,
	question: true,
	answer: true,
	_count: { select: { images: true } },
} as const

export type QueueRow = QueueArticle & {
	title: string
	slug: string | null
	publication: string | null
	editedBy: string | null
	reviewedAt: Date | string | null
	outreachStatus: string | null
	liveUrl: string | null
	question: string | null
	answer: string | null
}

/** Sent to a publisher before this review step existed. Not hers to decide. */
export function isSentBeforeReview(a: {
	kind: string
	status: string
	outreachStatus: string | null
}): boolean {
	return (
		a.kind === 'guest' &&
		a.status === 'pending' &&
		['submitted', 'live'].includes(a.outreachStatus ?? '')
	)
}

/** She asked Zane and he has not answered. The card waits in "Questions I asked". */
export function hasOpenQuestion(a: {
	question: string | null
	answer: string | null
}): boolean {
	return Boolean(a.question) && !a.answer
}

/** Every article, shaped for the queue. */
export async function loadQueueRows(): Promise<QueueRow[]> {
	const rows = await prisma.article.findMany({ select: QUEUE_SELECT })
	return rows.map(({ _count, ...r }) => ({ ...r, imageCount: _count.images }))
}

export type LaneOptions = {
	/** Rows already loaded, to save a query. */
	rows?: ReadonlyArray<QueueRow>
	/**
	 * The reviewer's own name (reviewerName). The queue holds out an article
	 * edited in the last 10 minutes so she does not read text Zane is still
	 * changing on the desktop; her own phone edits must not hide it from her.
	 */
	ownEditsBy?: string | null
}

/** The rows the phone lanes may serve. */
export function laneRows(
	rows: ReadonlyArray<QueueRow>,
	ownEditsBy?: string | null,
): QueueRow[] {
	return rows
		.filter(r => !isSentBeforeReview(r) && !hasOpenQuestion(r))
		.map(r =>
			ownEditsBy && r.editedBy === ownEditsBy ? { ...r, editedAt: null } : r,
		)
}

/** The ordered cards for a lane. */
export async function loadCards(
	lane: ReviewLane,
	now: Date,
	options: LaneOptions = {},
): Promise<ReviewCard<QueueRow>[]> {
	const all = options.rows ?? (await loadQueueRows())
	return orderCards(laneRows(all, options.ownEditsBy), lane, now)
}

/** "Goes on healthcareguys.com" or "Your blog". */
export function whereLabel(a: { kind: string; publication: string | null }) {
	if (a.kind === 'blog') return 'Your blog'
	return `Goes on ${a.publication ?? 'the publisher’s site'}`
}

/** Midnight today in the practice's time zone, as an instant. */
export function startOfTodayInZone(now: Date, timeZone = TIME_ZONE): Date {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(now)
	const get = (type: string) =>
		Number(parts.find(p => p.type === type)?.value ?? '0')
	// the zone's wall clock read as UTC, then shifted by the zone offset
	const wallAsUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	)
	const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000
	const midnightWallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'))
	return new Date(midnightWallAsUtc - offsetMs)
}

export async function approvedSince(since: Date): Promise<number> {
	return prisma.article.count({
		where: { status: 'approved', reviewedAt: { gte: since } },
	})
}

/** "n done today." */
export async function approvedToday(now: Date): Promise<number> {
	return approvedSince(startOfTodayInZone(now))
}

/** "Done this week: n · Live under your name: n" for the home page. */
export async function weekCounts(now: Date) {
	const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
	const [done, live] = await Promise.all([
		approvedSince(since),
		prisma.articleReviewEvent
			.findMany({
				where: { kind: 'live', at: { gte: since } },
				select: { articleId: true },
				distinct: ['articleId'],
			})
			.then(rows => rows.length),
	])
	return { done, live }
}

/* ------------------------------------------------------------------------ */
/* Decisions                                                                */
/* ------------------------------------------------------------------------ */

export type DecisionArticle = {
	id: string
	kind: string
	body: string
	publishedAt: Date | null
	wordCount: number | null
	estimatedReadSeconds: number | null
}

/**
 * Approve: store the exact text she approved (approvedBodyHash), set the
 * review stamp, publish a blog post, and log the event with the seconds
 * since she opened it. `body` is the working copy from "Change it".
 */
export async function approveArticle(
	article: DecisionArticle,
	opts: { userId: string; who: string; body?: string | null; now: Date },
) {
	const { userId, who, now } = opts
	const changed =
		typeof opts.body === 'string' && opts.body.trim() !== article.body.trim()
	const finalBody = changed && typeof opts.body === 'string' ? opts.body : article.body
	const edited = changed ? { body: finalBody, editedAt: now, editedBy: who } : {}
	await prisma.article.update({
		where: { id: article.id },
		data: {
			...edited,
			status: 'approved',
			reviewedAt: now,
			reviewedBy: who,
			reviewNote: null,
			approvedBodyHash: hashBody(finalBody),
			skippedUntil: null,
			publishedAt:
				article.kind === 'blog'
					? (article.publishedAt ?? now)
					: article.publishedAt,
		},
	})
	await recordReviewEvent(article.id, 'approved', {
		userId,
		seconds: await secondsSinceOpened(article.id, now),
	})
}

/** Undo (reopened) and "Take it down" (takedown): back to pending, the approval record cleared. */
export async function reopenArticle(
	id: string,
	opts: { userId: string; kind: 'reopened' | 'takedown' },
) {
	await prisma.article.update({
		where: { id },
		data: {
			status: 'pending',
			reviewedAt: null,
			reviewedBy: null,
			approvedBodyHash: null,
		},
	})
	await recordReviewEvent(id, opts.kind, { userId: opts.userId })
}

export type Settled = {
	headers: Headers
	sitting: ReviewSitting
	showPlenty: boolean
	next: ReviewCard<QueueRow> | null
}

/**
 * The sitting after a decision: add the card's read time, work out whether
 * "That is plenty" shows, and build the Set-Cookie header.
 */
export async function settleSitting(
	request: Request,
	decided: Pick<QueueArticle, 'id' | 'wordCount' | 'estimatedReadSeconds'>,
	now: Date,
	ownEditsBy?: string | null,
): Promise<Settled> {
	const lane = getReviewLane(request)
	const sitting = getReviewSitting(request, lane, now)
	const cards = (await loadCards(lane, now, { ownEditsBy })).filter(
		c => c.article.id !== decided.id,
	)
	const outcome = afterDecision(sitting, cardReadSeconds(decided), now, cards)
	const headers = new Headers({ 'set-cookie': setReviewSitting(outcome.sitting) })
	return {
		headers,
		sitting: outcome.sitting,
		showPlenty: outcome.showPlenty,
		next: cards[0] ?? null,
	}
}

/** Where the next card is, or the plenty screen on the home page. */
export function afterDecisionUrl(settled: Settled): string {
	return settled.showPlenty ? '/review?plenty=1' : '/review'
}

/** Whether the current sitting is spent, for the home page and S7. */
export function plentyNow(
	sitting: ReviewSitting,
	cards: ReadonlyArray<{ readSeconds: number }>,
	now: Date,
): boolean {
	return afterDecision(sitting, 0, now, cards).showPlenty
}

export function redirectWithHeaders(url: string, ...headers: Array<Headers | null>) {
	return redirect(url, { headers: combineHeaders(...headers) })
}
