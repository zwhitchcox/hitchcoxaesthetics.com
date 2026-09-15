import { createHash } from 'node:crypto'
import { type Prisma } from '@prisma/client'
import { z } from 'zod'
import { countWords } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'

/**
 * Server side of the article review flow: the sync payload the outreach system
 * on the Mac mini sends (tools/article-writer/review_sync.py in the pbn repo)
 * and the upsert that keeps Sarah's edits and her decision safe across pushes.
 *
 * The one rule that matters: a text push never changes a decided article.
 * New text for an approved, denied or changes_requested article is held in
 * `incomingBody` and the decision stands (result `kept`).
 */

export const SyncImageSchema = z.object({
	fileName: z.string().min(1).max(200),
	contentType: z.string().min(1).max(100),
	altText: z.string().max(1000).nullish(),
	caption: z.string().max(2000).nullish(),
	position: z.number().int().min(0).default(0),
	dataBase64: z.string().min(1),
	/** Pixel size of the picture, so the page reserves the box. Omitted: unknown. */
	width: z.number().int().min(1).max(20000).nullish(),
	height: z.number().int().min(1).max(20000).nullish(),
})

export const ReviewAidQuoteSchema = z.object({
	quote: z.string().min(1).max(2000),
})

/** The "things to check" list the mini sends (review.json). */
export const ReviewAidSchema = z.object({
	claims: z.array(ReviewAidQuoteSchema).max(200).default([]),
	credentials: z.array(ReviewAidQuoteSchema).max(200).default([]),
	rules: z.array(z.string().max(2000)).max(100).default([]),
})

export type ReviewAid = z.infer<typeof ReviewAidSchema>

export const SyncArticleSchema = z.object({
	sourceKey: z.string().min(1).max(200),
	kind: z.enum(['guest', 'blog']),
	outreachRowId: z.number().int().nullish(),
	outreachArticleId: z.number().int().nullish(),
	publication: z.string().max(200).nullish(),
	publicationUrl: z.string().max(500).nullish(),
	slug: z
		.string()
		.max(200)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.nullish(),
	title: z.string().min(1).max(500),
	dek: z.string().max(2000).nullish(),
	byline: z.string().max(200).nullish(),
	/**
	 * Optional for a sourceKey the site knows: no body means metadata only.
	 * A create without a body is refused with a 400.
	 */
	body: z.string().min(1).nullish(),
	writer: z.string().max(100).nullish(),
	isReference: z.boolean().default(false),
	wordCount: z.number().int().nullish(),
	links: z.array(z.object({ name: z.string(), url: z.string() })).nullish(),
	notes: z.string().max(5000).nullish(),
	outreachStatus: z.string().max(50).nullish(),
	liveUrl: z.string().max(1000).nullish(),
	/** When present, the stored picture set is replaced by this one. */
	images: z.array(SyncImageSchema).nullish(),
	/** The claim list for the phone panel. Quotes are verified against the text here. */
	reviewAid: ReviewAidSchema.nullish(),
	/** True: this text answers her changes_requested note. */
	revision: z.boolean().optional(),
	/** Only then does an empty `images` list delete the stored pictures. */
	clearImages: z.boolean().optional(),
	/** The ledger row is waiting_on=review. Omitted: unchanged. */
	publisherWaiting: z.boolean().optional(),
	/** The ledger's approved_usd when above zero. Null clears it. Omitted: unchanged. */
	placementUsd: z.number().int().nullish(),
})

export const SyncPayloadSchema = z.object({
	articles: z.array(SyncArticleSchema).min(1).max(50),
})

export type SyncArticle = z.infer<typeof SyncArticleSchema>

export function hashBody(body: string): string {
	return createHash('sha256')
		.update(body.replace(/\r\n/g, '\n').trim())
		.digest('hex')
}

/** Reading speed used for "About N min". */
export const WORDS_PER_MINUTE = 230

/** round(wordCount / 230 * 60). */
export function estimateReadSeconds(wordCount: number): number {
	return Math.round((Math.max(0, wordCount) / WORDS_PER_MINUTE) * 60)
}

function readSecondsFor(a: SyncArticle, body: string): number {
	return estimateReadSeconds(a.wordCount ?? countWords(body))
}

export type UpsertChange = 'created' | 'text' | 'meta' | 'kept' | 'revision'

export type UpsertResult = {
	sourceKey: string
	id: string
	status: string
	changed: UpsertChange
	/** Quotes in `reviewAid` that were not found in the text. Present only when an aid was stored. */
	reviewAidDropped?: number
}

/** A payload problem for one article. The route answers with `status`. */
export class ArticleSyncError extends Error {
	// Plain fields, not constructor parameter properties: Node's type stripping
	// rejects those when a test loads this module directly.
	readonly sourceKey: string
	readonly status: number
	constructor(message: string, sourceKey: string, status = 400) {
		super(message)
		this.name = 'ArticleSyncError'
		this.sourceKey = sourceKey
		this.status = status
	}
}

/**
 * Refuse the whole batch before any write when an unknown sourceKey has no
 * body. Call it from the route so a 400 never leaves half a batch applied.
 */
export async function assertBodiesForNewArticles(
	articles: SyncArticle[],
): Promise<void> {
	const noBody = articles.filter(a => a.body == null).map(a => a.sourceKey)
	if (noBody.length === 0) return
	const known = await prisma.article.findMany({
		where: { sourceKey: { in: noBody } },
		select: { sourceKey: true },
	})
	const knownKeys = new Set(known.map(k => k.sourceKey))
	const unknown = noBody.find(k => !knownKeys.has(k))
	if (unknown) {
		throw new ArticleSyncError(
			`${unknown}: body is required to create an article`,
			unknown,
		)
	}
}

// ---------------------------------------------------------------------------
// Review aid: the "things to check" list, verified word for word

/** What `Article.reviewAidJson` holds: the verified list plus how many quotes did not match. */
export type StoredReviewAid = ReviewAid & { dropped: number }

export function normalizeWhitespace(s: string): string {
	return s.replace(/\s+/g, ' ').trim()
}

/**
 * Collapse whitespace runs to one space and keep, for each kept character,
 * its index in the original string. A match in the collapsed text then maps
 * back to the exact substring of the original.
 */
function collapseWithMap(s: string): { text: string; map: number[] } {
	let text = ''
	const map: number[] = []
	let pendingSpace = -1
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]!
		if (/\s/.test(ch)) {
			if (pendingSpace < 0) pendingSpace = i
			continue
		}
		if (pendingSpace >= 0 && text.length > 0) {
			text += ' '
			map.push(pendingSpace)
		}
		pendingSpace = -1
		text += ch
		map.push(i)
	}
	return { text, map }
}

/**
 * Keep only the quotes that occur verbatim in the body after whitespace
 * normalisation. Each kept quote is stored as the exact substring of the
 * body, so `body.includes(quote)` holds and highlighting is a plain search.
 * Duplicates are folded. `dropped` counts the quotes that did not match.
 */
export function verifyReviewAidQuotes(
	body: string,
	aid: ReviewAid,
): StoredReviewAid {
	const { text, map } = collapseWithMap(body)
	let dropped = 0
	const keep = (items: Array<{ quote: string }>) => {
		const out: Array<{ quote: string }> = []
		const seen = new Set<string>()
		for (const item of items) {
			const q = normalizeWhitespace(item.quote)
			if (!q || seen.has(q)) continue
			seen.add(q)
			const idx = text.indexOf(q)
			if (idx < 0) {
				dropped++
				continue
			}
			const start = map[idx]!
			const end = map[idx + q.length - 1]! + 1
			out.push({ quote: body.slice(start, end) })
		}
		return out
	}
	return {
		claims: keep(aid.claims),
		credentials: keep(aid.credentials),
		rules: aid.rules.map(r => r.trim()).filter(Boolean),
		dropped,
	}
}

export function hashReviewAid(json: string): string {
	return createHash('sha256').update(json).digest('hex')
}

/** The stored aid as fields for a create or update. */
function reviewAidFields(aid: StoredReviewAid) {
	const reviewAidJson = JSON.stringify(aid)
	return { reviewAidJson, reviewAidHash: hashReviewAid(reviewAidJson) }
}

export function parseStoredReviewAid(
	json: string | null | undefined,
): StoredReviewAid | null {
	if (!json) return null
	try {
		const parsed = ReviewAidSchema.extend({
			dropped: z.number().int().min(0).default(0),
		}).safeParse(JSON.parse(json))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

// ---------------------------------------------------------------------------
// The upsert

async function syncImages(articleId: string, a: SyncArticle): Promise<void> {
	if (!a.images) return
	// An empty list only clears the pictures when the mini says so.
	if (a.images.length === 0 && a.clearImages !== true) return
	const keep = a.images.map(i => i.fileName)
	await prisma.articleImage.deleteMany({
		where: { articleId, fileName: { notIn: keep } },
	})
	for (const im of a.images) {
		const blob = Buffer.from(im.dataBase64, 'base64')
		const fields = {
			contentType: im.contentType,
			altText: im.altText ?? null,
			caption: im.caption ?? null,
			position: im.position,
			width: im.width ?? null,
			height: im.height ?? null,
			blob,
		}
		await prisma.articleImage.upsert({
			where: { articleId_fileName: { articleId, fileName: im.fileName } },
			create: { ...fields, articleId, fileName: im.fileName },
			update: fields,
		})
	}
}

/**
 * Create or update one article from the writer's side.
 *
 * Results:
 * - `created`: new sourceKey (a body is required).
 * - `meta`: no body, or the same text (her own edit echoed back counts as the
 *   same text). Metadata only. Her edits and her decision are untouched.
 * - `text`: different text for a pending article. Body replaced, review note
 *   set, her edit cleared.
 * - `revision`: different text with `revision: true` for a changes_requested
 *   article. Body replaced, her note kept in `revisionNote`, status pending.
 * - `kept`: different text for an approved, denied, or changes_requested
 *   article (no flag). Held in `incomingBody`. The decision stands. Also for
 *   a pending article she has edited (auto-save):
 *   her saved edit stays and the mini sends the text again on a later run.
 *   Also for `revision: true` on a pending article: she kept this one after
 *   the writer started a new draft, so the new draft waits as incoming text.
 *   The pictures in a `kept` push are not written either.
 *
 * The claim list (`reviewAid`) is verified against the text she will see and
 * stored only while the article is pending, so a decided record keeps the
 * list she was shown. Events `sent` and `live` are written when the outreach
 * status or the live URL changes on an existing row.
 */
export async function upsertSyncedArticle(
	a: SyncArticle,
	opts: { now?: Date } = {},
): Promise<UpsertResult> {
	const now = opts.now ?? new Date()
	// the text in this push, or null for a metadata-only push
	const incoming =
		a.body == null ? null : { body: a.body, hash: hashBody(a.body) }
	const meta = {
		kind: a.kind,
		outreachRowId: a.outreachRowId ?? null,
		outreachArticleId: a.outreachArticleId ?? null,
		publication: a.publication ?? null,
		publicationUrl: a.publicationUrl ?? null,
		slug: a.slug ?? null,
		title: a.title,
		dek: a.dek ?? null,
		byline: a.byline ?? null,
		writer: a.writer ?? null,
		isReference: a.isReference,
		wordCount: a.wordCount ?? null,
		linksJson: a.links ? JSON.stringify(a.links) : null,
		notes: a.notes ?? null,
		outreachStatus: a.outreachStatus ?? null,
		liveUrl: a.liveUrl ?? null,
		...(a.publisherWaiting !== undefined
			? { publisherWaiting: a.publisherWaiting }
			: {}),
		...(a.placementUsd !== undefined ? { placementUsd: a.placementUsd } : {}),
	}
	const existing = await prisma.article.findUnique({
		where: { sourceKey: a.sourceKey },
		select: {
			id: true,
			bodyHash: true,
			body: true,
			status: true,
			reviewNote: true,
			editedAt: true,
			incomingBodyHash: true,
			outreachStatus: true,
			liveUrl: true,
		},
	})

	if (!existing) {
		if (incoming === null) {
			throw new ArticleSyncError(
				`${a.sourceKey}: body is required to create an article`,
				a.sourceKey,
			)
		}
		const aid = a.reviewAid
			? verifyReviewAidQuotes(incoming.body, a.reviewAid)
			: null
		const created = await prisma.article.create({
			data: {
				...meta,
				sourceKey: a.sourceKey,
				body: incoming.body,
				bodyOriginal: incoming.body,
				bodyHash: incoming.hash,
				estimatedReadSeconds: readSecondsFor(a, incoming.body),
				receivedAt: now,
				...(aid ? reviewAidFields(aid) : {}),
			},
			select: { id: true },
		})
		await syncImages(created.id, a)
		return {
			sourceKey: a.sourceKey,
			id: created.id,
			status: 'pending',
			changed: 'created',
			...(aid ? { reviewAidDropped: aid.dropped } : {}),
		}
	}

	// Her own edit echoed back hashes like existing.body: it is not new text.
	const sameText =
		incoming !== null &&
		(incoming.hash === existing.bodyHash ||
			incoming.hash === hashBody(existing.body))
	// She has edited this text: hold the writer's text instead of replacing
	// hers (Zane sees "New text arrived" on the desktop list).
	const editingNow = existing.editedAt !== null
	const when = now.toISOString().slice(0, 10)
	let changed: UpsertChange
	let status = existing.status
	let data: Prisma.ArticleUncheckedUpdateInput = { ...meta }

	if (incoming === null || sameText) {
		changed = 'meta'
		if (incoming !== null) {
			data.estimatedReadSeconds = readSecondsFor(a, incoming.body)
		}
	} else if (existing.status === 'pending' && !editingNow && a.revision !== true) {
		changed = 'text'
		data = {
			...data,
			body: incoming.body,
			bodyOriginal: incoming.body,
			bodyHash: incoming.hash,
			previousBody: existing.editedAt ? existing.body : null,
			reviewNote: `The writer sent new text on ${when}.`,
			receivedAt: now,
			editedAt: null,
			editedBy: null,
			// new text: her read marker points into text she has not seen
			readToParagraph: null,
			readReachedEndAt: null,
			incomingBody: null,
			incomingBodyHash: null,
			incomingAt: null,
			estimatedReadSeconds: readSecondsFor(a, incoming.body),
		}
	} else if (existing.status === 'changes_requested' && a.revision === true) {
		changed = 'revision'
		status = 'pending'
		data = {
			...data,
			revisionBaseBody: existing.body,
			revisionNote: existing.reviewNote,
			body: incoming.body,
			bodyOriginal: incoming.body,
			bodyHash: incoming.hash,
			previousBody: existing.editedAt ? existing.body : null,
			status: 'pending',
			reviewNote: null,
			reviewedAt: null,
			reviewedBy: null,
			rewriteRequested: false,
			receivedAt: now,
			editedAt: null,
			editedBy: null,
			// new text: her read marker points into text she has not seen
			readToParagraph: null,
			readReachedEndAt: null,
			incomingBody: null,
			incomingBodyHash: null,
			incomingAt: null,
			estimatedReadSeconds: readSecondsFor(a, incoming.body),
		}
	} else {
		// approved, denied, changes_requested without the revision flag,
		// pending while she is editing it, or a revision for a pending row
		// (she kept this one after asking for a different article)
		changed = 'kept'
		data = {
			...data,
			incomingBody: incoming.body,
			incomingBodyHash: incoming.hash,
			// the first arrival of this text, not the latest repeat push
			...(existing.incomingBodyHash !== incoming.hash
				? { incomingAt: now }
				: {}),
		}
	}

	let aid: StoredReviewAid | null = null
	if (a.reviewAid && status === 'pending') {
		// verify against the text she will see after this write
		const shownBody =
			changed === 'meta' ? existing.body : (incoming?.body ?? existing.body)
		aid = verifyReviewAidQuotes(shownBody, a.reviewAid)
		data = { ...data, ...reviewAidFields(aid) }
	}

	await prisma.article.update({ where: { id: existing.id }, data })

	if (
		a.outreachStatus === 'submitted' &&
		existing.outreachStatus !== 'submitted'
	) {
		await recordReviewEvent(existing.id, 'sent', {
			at: now,
			note: a.publication ?? null,
		})
	}
	if (a.liveUrl && !existing.liveUrl) {
		await recordReviewEvent(existing.id, 'live', { at: now, note: a.liveUrl })
	}

	// Held text keeps its pictures too: a v2 draft shares the file names
	// (image-1.png, ...), so a write here would swap the pictures under the
	// text she kept or approved.
	if (changed !== 'kept') await syncImages(existing.id, a)
	return {
		sourceKey: a.sourceKey,
		id: existing.id,
		status,
		changed,
		...(aid ? { reviewAidDropped: aid.dropped } : {}),
	}
}

// ---------------------------------------------------------------------------
// Auto-save: the working copy she edits on the phone or the desktop

export type SaveOutcome =
	/** Written. `hash` is the new base for the next save. */
	| { kind: 'saved'; hash: string }
	/** The same text as stored. Nothing written, no event. */
	| { kind: 'same'; hash: string }
	/** The stored text moved on (the writer pushed) since `baseHash`. Her copy is not written. */
	| { kind: 'changed'; body: string; hash: string }
	/** Approved, denied or changes_requested. Reopen first. */
	| { kind: 'decided' }
	| { kind: 'missing' }

export type SaveWorkingCopyInput = {
	id: string
	body: string
	/** hashBody of the text her copy started from. */
	baseHash: string
	/** The reviewer's name for `editedBy`. Never the phone number. */
	who: string
	userId: string
	/** What made the change: her typing or an AI edit. Stored on the `saved` event. */
	source?: 'auto' | 'ai'
	now?: Date
}

/**
 * Save the working copy without a button (spec phase 2, R5). Rules in order:
 * not pending -> `decided`; `baseHash` is not the stored text -> `changed`
 * with the stored text; the same text -> `same` (no write); else write the
 * body (CRLF folded), `editedAt`, `editedBy`, and one `saved` event.
 */
export async function saveWorkingCopy(
	input: SaveWorkingCopyInput,
): Promise<SaveOutcome> {
	const now = input.now ?? new Date()
	const article = await prisma.article.findUnique({
		where: { id: input.id },
		select: { status: true, body: true },
	})
	if (!article) return { kind: 'missing' }
	if (article.status !== 'pending') return { kind: 'decided' }
	const current = hashBody(article.body)
	if (input.baseHash !== current) {
		return { kind: 'changed', body: article.body, hash: current }
	}
	const body = input.body.replace(/\r\n/g, '\n')
	const hash = hashBody(body)
	if (hash === current) return { kind: 'same', hash }
	// The status is checked again in the write, so a decision that lands
	// between the read and the write is never overwritten.
	const written = await prisma.article.updateMany({
		where: { id: input.id, status: 'pending' },
		data: { body, editedAt: now, editedBy: input.who },
	})
	if (written.count === 0) return { kind: 'decided' }
	await recordReviewEvent(input.id, 'saved', {
		userId: input.userId,
		note: input.source ?? 'auto',
		at: now,
	})
	return { kind: 'saved', hash }
}

/** The name shown as the reviewer. Never the phone number. */
export async function reviewerName(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { name: true },
	})
	return user?.name?.trim() || 'admin'
}
