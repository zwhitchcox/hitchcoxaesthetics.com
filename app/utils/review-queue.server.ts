import * as cookie from 'cookie'
import { estimateReadSeconds } from './review-aid.ts'

/**
 * The queue behind "Next one" on /review: the time-budget lanes, the order of
 * the cards, the hold-outs, and the sitting arithmetic (spec section 3).
 *
 * Everything here is pure. The routes read the cookies with getReviewLane and
 * getReviewSitting, load the pending articles, and call orderCards.
 */

/* ------------------------------------------------------------------------ */
/* Lanes                                                                    */
/* ------------------------------------------------------------------------ */

export const REVIEW_LANES = [2, 5, 10] as const
export type ReviewLane = (typeof REVIEW_LANES)[number]
export const DEFAULT_LANE: ReviewLane = 5

export const LANE_COOKIE = 'review_lane'
export const SITTING_COOKIE = 'review_sitting'

/** A sitting resets after this much idle time. */
export const SITTING_IDLE_MS = 30 * 60 * 1000
/** A card still fits when it is at most this much over the remaining time. */
export const SITTING_GRACE = 0.25
/** Articles Zane edited on the desktop this recently are held out. */
export const EDITING_HOLD_MS = 10 * 60 * 1000

export function isReviewLane(value: unknown): value is ReviewLane {
	return (REVIEW_LANES as ReadonlyArray<unknown>).includes(value)
}

/** A cookie or form value ("2", 2, "10") to a lane. Unknown values give the default. */
export function parseLane(value: unknown): ReviewLane {
	const n = typeof value === 'string' ? Number(value) : value
	return isReviewLane(n) ? n : DEFAULT_LANE
}

/** The sitting budget for a lane, in seconds. */
export function laneSeconds(lane: ReviewLane): number {
	return lane * 60
}

/** 2 min: 120 s or less. 5 min: 300 s or less. 10 min: any single article. */
export function fitsLane(readSeconds: number, lane: ReviewLane): boolean {
	if (lane === 10) return true
	return readSeconds <= laneSeconds(lane)
}

/* ------------------------------------------------------------------------ */
/* Cards                                                                    */
/* ------------------------------------------------------------------------ */

/** The Article columns the queue reads. Pass a Prisma row with `imageCount` added. */
export type QueueArticle = {
	id: string
	kind: string
	status: string
	isReference: boolean
	wordCount: number | null
	estimatedReadSeconds?: number | null
	imageCount: number
	/** Who wrote it (fable-5.1, codex, zane). Pictures are only made for the fable drafts. */
	writer: string | null
	publisherWaiting: boolean
	placementUsd: number | null
	revisionNote: string | null
	readToParagraph: number | null
	incomingBody?: string | null
	skippedUntil: Date | string | null
	editedAt: Date | string | null
	receivedAt: Date | string
}

/**
 * 1 started, 2 your change is in, 3 held spot with money, 4 held spot,
 * 5 blog post, 6 other guest article.
 */
export type QueueRank = 1 | 2 | 3 | 4 | 5 | 6

export type ReviewCard<A extends QueueArticle = QueueArticle> = {
	article: A
	readSeconds: number
	rank: QueueRank
	/** She opened it before and did not decide. The home card says "Pick up where you left off". */
	started: boolean
}

export type HoldReason =
	| 'later'
	| 'editing'
	| 'pictures'
	| 'own-words'
	| 'decided'

export const DECIDED_STATUSES = [
	'approved',
	'denied',
	'changes_requested',
] as const

export type OrderOptions = {
	/**
	 * Serve decided articles that got new text after the decision (S9) at rank 2.
	 * Off until the S9 screen exists.
	 */
	includeIncoming?: boolean
}

function toTime(value: Date | string | null | undefined): number {
	if (!value) return Number.NaN
	return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

/** The read time for a card: the stored estimate, else one from the word count. */
export function cardReadSeconds(
	a: Pick<QueueArticle, 'wordCount' | 'estimatedReadSeconds'>,
): number {
	if (
		typeof a.estimatedReadSeconds === 'number' &&
		a.estimatedReadSeconds > 0
	) {
		return a.estimatedReadSeconds
	}
	return estimateReadSeconds(a.wordCount ?? 0)
}

export function isDecided(status: string): boolean {
	return (DECIDED_STATUSES as ReadonlyArray<string>).includes(status)
}

/**
 * A guest article whose pictures are still to come. Pictures are only made
 * for the Claude-written (fable) drafts, so a Codex draft with no pictures is
 * ready as it is. Same rule as articleGroup on the desktop page.
 */
export function waitsOnPictures(
	a: Pick<QueueArticle, 'kind' | 'imageCount' | 'writer'>,
): boolean {
	return (
		a.kind === 'guest' &&
		a.imageCount === 0 &&
		(a.writer ?? '').startsWith('fable')
	)
}

/** Why an article is out of every lane, or null when it can be served. */
export function holdReason(
	a: QueueArticle,
	now: Date,
	options: OrderOptions = {},
): HoldReason | null {
	const nowMs = now.getTime()
	if (a.isReference) return 'own-words'
	if (isDecided(a.status)) {
		const hasIncoming =
			typeof a.incomingBody === 'string' && a.incomingBody.length > 0
		if (!(options.includeIncoming && hasIncoming)) return 'decided'
	} else if (a.status !== 'pending') {
		return 'decided'
	}
	const skipped = toTime(a.skippedUntil)
	if (!Number.isNaN(skipped) && skipped > nowMs) return 'later'
	const edited = toTime(a.editedAt)
	if (!Number.isNaN(edited) && nowMs - edited < EDITING_HOLD_MS)
		return 'editing'
	if (waitsOnPictures(a)) return 'pictures'
	return null
}

export function cardRank(a: QueueArticle): QueueRank {
	if ((a.readToParagraph ?? 0) > 0 && !isDecided(a.status)) return 1
	if (isDecided(a.status)) return 2
	if (a.revisionNote) return 2
	if (a.kind === 'guest' && a.publisherWaiting) {
		return (a.placementUsd ?? 0) > 0 ? 3 : 4
	}
	if (a.kind === 'blog') return 5
	return 6
}

/**
 * The cards for a lane, in the order she should see them. Held-out articles
 * and articles that do not fit the lane are left out. Ties go to the oldest
 * receivedAt. The age is never shown to her.
 */
export function orderCards<A extends QueueArticle>(
	articles: ReadonlyArray<A>,
	lane: ReviewLane,
	now: Date,
	options: OrderOptions = {},
): ReviewCard<A>[] {
	const cards: ReviewCard<A>[] = []
	for (const article of articles) {
		if (holdReason(article, now, options)) continue
		const readSeconds = cardReadSeconds(article)
		if (!fitsLane(readSeconds, lane)) continue
		cards.push({
			article,
			readSeconds,
			rank: cardRank(article),
			started: (article.readToParagraph ?? 0) > 0 && !isDecided(article.status),
		})
	}
	return cards.sort(compareCards)
}

function compareCards<A extends QueueArticle>(
	x: ReviewCard<A>,
	y: ReviewCard<A>,
): number {
	if (x.rank !== y.rank) return x.rank - y.rank
	// ranks 1 and 2 keep the oldest first; the rest go shortest first
	if (x.rank >= 3 && x.readSeconds !== y.readSeconds)
		return x.readSeconds - y.readSeconds
	const xt = toTime(x.article.receivedAt)
	const yt = toTime(y.article.receivedAt)
	if (xt !== yt)
		return (
			(Number.isNaN(xt) ? Infinity : xt) - (Number.isNaN(yt) ? Infinity : yt)
		)
	return x.article.id < y.article.id ? -1 : x.article.id > y.article.id ? 1 : 0
}

/* ------------------------------------------------------------------------ */
/* The sitting                                                              */
/* ------------------------------------------------------------------------ */

/** The `review_sitting` cookie value. */
export type ReviewSitting = {
	lane: ReviewLane
	/** ISO time of the first card in this sitting. */
	startedAt: string
	/** ISO time of the last decision or start. Idle time counts from here. */
	updatedAt: string
	/** The read seconds of every card she decided in this sitting. */
	spentSeconds: number
}

export function startSitting(lane: ReviewLane, now: Date): ReviewSitting {
	const at = now.toISOString()
	return { lane, startedAt: at, updatedAt: at, spentSeconds: 0 }
}

/**
 * The sitting from its cookie value. A fresh one when the cookie is missing,
 * malformed, for another lane, or idle for 30 minutes.
 */
export function parseSitting(
	raw: string | null | undefined,
	lane: ReviewLane,
	now: Date,
): ReviewSitting {
	if (!raw) return startSitting(lane, now)
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return startSitting(lane, now)
	}
	if (typeof parsed !== 'object' || parsed === null)
		return startSitting(lane, now)
	const s = parsed as Partial<ReviewSitting>
	if (s.lane !== lane) return startSitting(lane, now)
	if (
		typeof s.spentSeconds !== 'number' ||
		!Number.isFinite(s.spentSeconds) ||
		s.spentSeconds < 0
	) {
		return startSitting(lane, now)
	}
	const updated = toTime(s.updatedAt)
	const started = toTime(s.startedAt)
	if (Number.isNaN(updated) || Number.isNaN(started))
		return startSitting(lane, now)
	if (now.getTime() - updated >= SITTING_IDLE_MS) return startSitting(lane, now)
	return {
		lane,
		startedAt: new Date(started).toISOString(),
		updatedAt: new Date(updated).toISOString(),
		spentSeconds: Math.round(s.spentSeconds),
	}
}

export function serializeSitting(s: ReviewSitting): string {
	return JSON.stringify(s)
}

/** Seconds left in the lane budget. Never below zero. */
export function remainingSeconds(s: ReviewSitting): number {
	return Math.max(0, laneSeconds(s.lane) - s.spentSeconds)
}

/** A card fits the rest of the sitting when it is within 25 percent of the time left. */
export function fitsRemaining(s: ReviewSitting, readSeconds: number): boolean {
	return readSeconds <= remainingSeconds(s) * (1 + SITTING_GRACE)
}

export type DecisionOutcome = {
	sitting: ReviewSitting
	/** Show S8 "That is plenty for now" instead of the next card. */
	showPlenty: boolean
}

/**
 * Add a decided card to the sitting. S8 shows when the lane time is spent,
 * or when cards remain and none fits the time left. "One more anyway" is the
 * caller serving `remaining[0]` regardless.
 */
export function afterDecision(
	s: ReviewSitting,
	readSeconds: number,
	now: Date,
	remaining: ReadonlyArray<{ readSeconds: number }>,
): DecisionOutcome {
	const sitting: ReviewSitting = {
		...s,
		updatedAt: now.toISOString(),
		spentSeconds: s.spentSeconds + Math.max(0, Math.round(readSeconds)),
	}
	const timeSpent = sitting.spentSeconds >= laneSeconds(sitting.lane)
	const nothingFits =
		remaining.length > 0 &&
		!remaining.some(c => fitsRemaining(sitting, c.readSeconds))
	return { sitting, showPlenty: timeSpent || nothingFits }
}

/* ------------------------------------------------------------------------ */
/* Cookies                                                                  */
/* ------------------------------------------------------------------------ */

export function getReviewLane(request: Request): ReviewLane {
	const header = request.headers.get('cookie')
	const raw = header ? cookie.parse(header)[LANE_COOKIE] : undefined
	return parseLane(raw)
}

/** The Set-Cookie value that remembers the lane for a year. */
export function setReviewLane(lane: ReviewLane): string {
	return cookie.serialize(LANE_COOKIE, String(lane), {
		path: '/review',
		maxAge: 365 * 24 * 60 * 60,
		sameSite: 'lax',
		httpOnly: true,
	})
}

export function getReviewSitting(
	request: Request,
	lane: ReviewLane,
	now: Date = new Date(),
): ReviewSitting {
	const header = request.headers.get('cookie')
	const raw = header ? cookie.parse(header)[SITTING_COOKIE] : undefined
	return parseSitting(raw, lane, now)
}

/** The Set-Cookie value for the sitting. It outlives the idle window by a little. */
export function setReviewSitting(s: ReviewSitting): string {
	return cookie.serialize(SITTING_COOKIE, serializeSitting(s), {
		path: '/review',
		maxAge: 60 * 60,
		sameSite: 'lax',
		httpOnly: true,
	})
}

/** The Set-Cookie value that ends the sitting ("Stop here"). */
export function clearReviewSitting(): string {
	return cookie.serialize(SITTING_COOKIE, '', { path: '/review', maxAge: -1 })
}
