/**
 * Pure helpers shared by the article editor and the chat: the size limits,
 * the passage and diff helpers, the chips for the writer sheets, and the
 * auto-save client. No server imports, so the unit test runs without a
 * database and the resource routes stay thin.
 *
 * The AI entry point is the chat (article-chat.ts and its server module).
 */
import { z } from 'zod'
import { splitParagraphs } from '#app/utils/review-aid.ts'

export const ARTICLE_EDIT_MAX_MARKDOWN_CHARS = 60_000
export const ARTICLE_EDIT_MAX_SELECTION_CHARS = 2000
export const ARTICLE_EDIT_MIN_SELECTION_CHARS = 3
export const ARTICLE_EDIT_MAX_SELECTION_MARKDOWN_CHARS = 4000

/** Saves one admin may send per minute (auto-save posts often). */
export const ARTICLE_SAVE_RATE_LIMIT = { max: 30, windowMs: 60_000 }
export const ARTICLE_SAVE_ENDPOINT = '/resources/article-save'
/** A keepalive fetch on pagehide carries at most this many bytes. */
export const ARTICLE_SAVE_KEEPALIVE_MAX_BYTES = 60_000

export const ArticleSaveRequestSchema = z.object({
	articleId: z.string().trim().min(1).max(64),
	body: z.string().min(1).max(ARTICLE_EDIT_MAX_MARKDOWN_CHARS),
	baseHash: z.string().regex(/^[0-9a-f]{64}$/),
	source: z.enum(['auto', 'ai']).default('auto'),
})

export type ArticleSaveRequest = z.infer<typeof ArticleSaveRequestSchema>

/** Chips that fill the note box in the writer sheets. Exact copy from the spec. */
export const ARTICLE_EDIT_CHIPS = [
	'Wrong fact',
	'Not how I would say it',
	'Take this claim out',
	'Add a warning',
	'Shorter',
] as const

/** Speech results arrive in pieces; join them with single spaces. */
export function appendSpeech(current: string, spoken: string): string {
	const words = spoken.trim()
	if (!words) return current
	if (!current.trim()) return words
	return `${current.replace(/\s+$/, '')} ${words}`
}

/* ------------------------------------------------------------------------ */
/* Passages and diffs                                                       */
/* ------------------------------------------------------------------------ */

const QUOTE_FOLD: Record<string, string> = {
	'‘': "'",
	'’': "'",
	'‚': "'",
	'“': '"',
	'”': '"',
	'„': '"',
}

/**
 * Fold a string for a loose search: CRLF to LF, runs of whitespace to one
 * space, curly quotes to straight ones. Emphasis marks (* and `) are left
 * out too, because the selection comes from the rendered page and never
 * carries them. `map` points each folded index back at the source index.
 */
function fold(input: string, skipMarks: boolean): { text: string; map: number[] } {
	const map: number[] = []
	let text = ''
	let spaceStart = -1
	for (let i = 0; i < input.length; i++) {
		const ch = input[i] as string
		if (ch === '\r') continue
		if (skipMarks && (ch === '*' || ch === '`')) continue
		if (/\s/.test(ch)) {
			if (text.length > 0 && spaceStart < 0) spaceStart = i
			continue
		}
		if (spaceStart >= 0) {
			text += ' '
			map.push(spaceStart)
			spaceStart = -1
		}
		text += QUOTE_FOLD[ch] ?? ch
		map.push(i)
	}
	return { text, map }
}

/**
 * Where the selected passage sits in the markdown, as source offsets.
 * Whitespace, curly quotes and emphasis marks are folded on both sides.
 * Null when the passage is not there, or is there more than once (then the
 * model gets the text alone and finds it).
 */
export function locatePassage(
	markdown: string,
	text: string,
): { start: number; end: number } | null {
	const needle = fold(text, true).text
	if (!needle) return null
	const hay = fold(markdown, true)
	const first = hay.text.indexOf(needle)
	if (first < 0) return null
	if (hay.text.indexOf(needle, first + 1) >= 0) return null
	let start = hay.map[first] as number
	let end = (hay.map[first + needle.length - 1] as number) + 1
	// take the emphasis marks around the hit, so the slice is whole markdown
	while (start > 0 && isMark(markdown[start - 1])) start--
	while (end < markdown.length && isMark(markdown[end])) end++
	return { start, end }
}

/**
 * How many times the passage occurs in the markdown after the same folding
 * as `locatePassage`. Overlapping hits count once each from their start.
 */
/** The article's title as the text carries it: its first level-1 heading, or null. */
export function firstHeading(markdown: string): string | null {
	const m = /^#[ \t]+(.+?)[ \t#]*$/m.exec(markdown.replace(/\r\n/g, '\n'))
	const text = m?.[1]?.trim() ?? ''
	return text.length > 0 ? text.slice(0, 500) : null
}

export function countPassage(markdown: string, text: string): number {
	const needle = fold(text, true).text
	if (!needle) return 0
	const hay = fold(markdown, true).text
	let count = 0
	let from = 0
	while (true) {
		const at = hay.indexOf(needle, from)
		if (at < 0) return count
		count++
		from = at + 1
	}
}

function isMark(ch: string | undefined): boolean {
	return ch === '*' || ch === '`'
}

/**
 * The span that changed between two texts, as offsets in `b` (end
 * exclusive): what is left after the common prefix and suffix are removed.
 * Trailing whitespace is ignored on both sides, so a reply that drops the
 * final newline does not mark the whole tail as changed. Null when the
 * texts are equal. A pure deletion gives an empty span.
 */
export function firstDiffRange(
	a: string,
	b: string,
): { start: number; end: number } | null {
	const a2 = a.replace(/\s+$/, '')
	const b2 = b.replace(/\s+$/, '')
	if (a2 === b2) return null
	let start = 0
	const max = Math.min(a2.length, b2.length)
	while (start < max && a2[start] === b2[start]) start++
	let endA = a2.length
	let endB = b2.length
	while (endA > start && endB > start && a2[endA - 1] === b2[endB - 1]) {
		endA--
		endB--
	}
	return { start, end: endB }
}

const PICTURE_LINE_RE = /^!\[[^\]]*\]\([^)]*\)\s*$/

/** The picture lines of the markdown, trimmed, sorted, without duplicates. */
export function pictureLines(markdown: string): string[] {
	const out = new Set<string>()
	for (const line of markdown.split('\n')) {
		const trimmed = line.trim()
		if (PICTURE_LINE_RE.test(trimmed)) out.add(trimmed)
	}
	return Array.from(out).sort()
}

function foldParagraph(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

/**
 * Indexes of the paragraphs of `next` whose text is not in `base`, after
 * whitespace folding. Used for the "changed" highlights and the guard that
 * a passage edit did not rewrite the article.
 */
export function changedParagraphIndexes(base: string, next: string): number[] {
	const known = new Set(splitParagraphs(base).map(p => foldParagraph(p.text)))
	const out: number[] = []
	splitParagraphs(next).forEach((p, index) => {
		if (!known.has(foldParagraph(p.text))) out.push(index)
	})
	return out
}

/** Share of `next` paragraphs that are not in `base`, from 0 to 1. */
export function changedParagraphShare(base: string, next: string): number {
	const total = splitParagraphs(next).length
	if (total === 0) return 0
	return changedParagraphIndexes(base, next).length / total
}

/* ------------------------------------------------------------------------ */
/* Auto-save client                                                         */
/* ------------------------------------------------------------------------ */

export type SaveResult =
	| { ok: true; hash: string; changed: boolean }
	| { ok: false; kind: 'changed'; body: string; hash: string }
	| { ok: false; kind: 'decided' }
	| { ok: false; kind: 'network' | 'server'; message?: string }

/**
 * POST the working copy to /resources/article-save and map the answer.
 * A 409 `changed` carries the server's text and hash, so the caller can
 * offer "Use the new text" or "Keep mine" without a second request.
 */
export async function saveArticleBody(
	input: { articleId: string; body: string; baseHash: string; source?: 'auto' | 'ai' },
	{ fetchImpl = fetch, keepalive = false }: { fetchImpl?: typeof fetch; keepalive?: boolean } = {},
): Promise<SaveResult> {
	const payload = JSON.stringify({
		articleId: input.articleId,
		body: input.body,
		baseHash: input.baseHash,
		source: input.source ?? 'auto',
	})
	let response: Response
	try {
		response = await fetchImpl(ARTICLE_SAVE_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: payload,
			keepalive,
		})
	} catch {
		return { ok: false, kind: 'network' }
	}
	const data = (await response.json().catch(() => null)) as {
		ok?: unknown
		hash?: unknown
		changed?: unknown
		error?: unknown
		message?: unknown
		body?: unknown
	} | null
	if (response.ok && typeof data?.hash === 'string') {
		return { ok: true, hash: data.hash, changed: data.changed === true }
	}
	if (response.status === 409 && data?.error === 'changed') {
		if (typeof data.body === 'string' && typeof data.hash === 'string') {
			return { ok: false, kind: 'changed', body: data.body, hash: data.hash }
		}
	}
	if (response.status === 409 && data?.error === 'decided') {
		return { ok: false, kind: 'decided' }
	}
	const message =
		typeof data?.message === 'string'
			? data.message
			: typeof data?.error === 'string'
				? data.error
				: undefined
	return { ok: false, kind: 'server', message }
}
