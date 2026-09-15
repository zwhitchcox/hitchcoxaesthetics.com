/**
 * Pure helpers for "Tell it what to change" and "Change this": the request
 * shape, the prompt the model gets, the parser for its reply, the passage
 * and diff helpers, and the auto-save client. No server imports, so the
 * unit test runs without a database and the resource routes stay thin.
 */
import { z } from 'zod'
import { type ArticleLink } from '#app/utils/articles.ts'
import { splitParagraphs } from '#app/utils/review-aid.ts'

export const ARTICLE_EDIT_DEFAULT_MODEL = 'anthropic/claude-sonnet-5'
export const ARTICLE_EDIT_MAX_PROMPT_CHARS = 4000
export const ARTICLE_EDIT_MAX_MARKDOWN_CHARS = 60_000
export const ARTICLE_EDIT_MAX_SELECTION_CHARS = 2000
export const ARTICLE_EDIT_MIN_SELECTION_CHARS = 3
export const ARTICLE_EDIT_MAX_SELECTION_MARKDOWN_CHARS = 4000
/** Requests one admin may send per minute. */
export const ARTICLE_EDIT_RATE_LIMIT = { max: 6, windowMs: 60_000 }
export const ARTICLE_EDIT_TIMEOUT_MS = 60_000

/** Saves one admin may send per minute (auto-save posts often). */
export const ARTICLE_SAVE_RATE_LIMIT = { max: 30, windowMs: 60_000 }
export const ARTICLE_SAVE_ENDPOINT = '/resources/article-save'
/** A keepalive fetch on pagehide carries at most this many bytes. */
export const ARTICLE_SAVE_KEEPALIVE_MAX_BYTES = 60_000

/** The passage she selected, or the claim row she tapped. */
export const ArticleEditSelectionSchema = z.object({
	text: z
		.string()
		.trim()
		.min(ARTICLE_EDIT_MIN_SELECTION_CHARS)
		.max(ARTICLE_EDIT_MAX_SELECTION_CHARS),
	paragraph: z.number().int().min(0).optional(),
	markdown: z.string().max(ARTICLE_EDIT_MAX_SELECTION_MARKDOWN_CHARS).optional(),
})

export type ArticleEditSelection = z.infer<typeof ArticleEditSelectionSchema>

export const ArticleEditRequestSchema = z.object({
	articleId: z.string().trim().min(1).max(64),
	prompt: z.string().trim().min(1).max(ARTICLE_EDIT_MAX_PROMPT_CHARS),
	markdown: z.string().min(1).max(ARTICLE_EDIT_MAX_MARKDOWN_CHARS),
	links: z
		.array(
			z.object({
				name: z.string().max(200),
				url: z.string().max(2000),
			}),
		)
		.max(20)
		.default([]),
	selection: ArticleEditSelectionSchema.optional(),
})

export type ArticleEditRequest = z.infer<typeof ArticleEditRequestSchema>

export type ArticleEditReply = { markdown: string; summary: string }

export const ArticleSaveRequestSchema = z.object({
	articleId: z.string().trim().min(1).max(64),
	body: z.string().min(1).max(ARTICLE_EDIT_MAX_MARKDOWN_CHARS),
	baseHash: z.string().regex(/^[0-9a-f]{64}$/),
	source: z.enum(['auto', 'ai']).default('auto'),
})

export type ArticleSaveRequest = z.infer<typeof ArticleSaveRequestSchema>

/** The system prompt from the 2026-09-15 addendum, with the links list inline. */
export function buildEditSystemPrompt(links: ArticleLink[]): string {
	const linkLines = links.length
		? links.map(l => `- ${l.name}: ${l.url}`).join('\n')
		: '(none)'
	return [
		'You edit an article written under the byline of Sarah Hitchcox, RN.',
		'The reviewer tells you one change. Apply ONLY the requested change.',
		'Keep every other sentence exactly as it is. Do not reword, reorder, or trim text the request does not name.',
		'Never add a new medical or clinical claim, statistic, price, or named product that is not in the request.',
		'Keep every link in the "links that must stay" list. Keep its URL byte for byte. You may move a link to another sentence, but never drop it.',
		'A line that starts with ![ is a picture, and the italic line under it is its caption. Keep every picture line and caption exactly as it is and where it is, unless the request names a picture.',
		'When a passage is quoted, change only that passage and leave the rest of the article untouched.',
		'Keep the markdown style of the document: the same heading marks, list marks, emphasis marks, and blank lines.',
		'Return ONLY a JSON object with two string fields:',
		'{ "markdown": "<the whole article after the change>", "summary": "<one or two plain sentences that say what changed>" }',
		'"markdown" is the complete article, not a fragment and not a diff.',
		'If the request cannot be applied, return the article unchanged and say why in "summary".',
		'',
		'Links that must stay:',
		linkLines,
	].join('\n')
}

/**
 * The user message. With a selection the quoted passage comes first, then
 * the source slice when it is known (given, or found once in the markdown),
 * then the paragraph number, then the request and the article.
 */
export function buildEditUserMessage(
	prompt: string,
	markdown: string,
	selection?: ArticleEditSelection | null,
): string {
	const request = `REQUESTED CHANGE:\n${prompt.trim()}\n\nARTICLE (markdown):\n${markdown}`
	if (!selection) return request
	const lines = [
		'CHANGE ONLY THIS PASSAGE (quoted as it reads on the page; markdown marks or link syntax may sit inside it in the source):',
		`"${selection.text.trim()}"`,
	]
	const slice = selection.markdown ?? passageSlice(markdown, selection.text)
	if (slice) lines.push('IN THE SOURCE IT IS:', slice)
	if (typeof selection.paragraph === 'number') {
		lines.push(`IT IS IN PARAGRAPH ${selection.paragraph + 1} OF THE ARTICLE.`)
	}
	return `${lines.join('\n')}\n\n${request}`
}

function passageSlice(markdown: string, text: string): string | null {
	const range = locatePassage(markdown, text)
	if (!range) return null
	const slice = markdown.slice(range.start, range.end)
	return slice.length <= ARTICLE_EDIT_MAX_SELECTION_MARKDOWN_CHARS ? slice : null
}

/**
 * Parse the model reply. Accepts a bare JSON object, one inside a code
 * fence, or one with text around it. Returns null when there is no object
 * with a non-empty "markdown" string.
 */
export function parseEditReply(raw: string): ArticleEditReply | null {
	const unfenced = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim()
	const candidates = [unfenced]
	const start = unfenced.indexOf('{')
	const end = unfenced.lastIndexOf('}')
	if (start >= 0 && end > start) candidates.push(unfenced.slice(start, end + 1))
	for (const candidate of candidates) {
		let parsed: unknown
		try {
			parsed = JSON.parse(candidate)
		} catch {
			continue
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
		const record = parsed as Record<string, unknown>
		if (typeof record.markdown !== 'string') continue
		const markdown = record.markdown.replace(/\r\n/g, '\n')
		if (!markdown.trim()) continue
		const summary =
			typeof record.summary === 'string' && record.summary.trim()
				? record.summary.trim()
				: 'Changed the text as you asked.'
		return { markdown, summary: summary.slice(0, 600) }
	}
	return null
}

/** Chips that fill the prompt box. Exact copy from the spec. */
export const ARTICLE_EDIT_CHIPS = [
	'Wrong fact',
	'Not how I would say it',
	'Take this claim out',
	'Add a warning',
	'Shorter',
] as const

/** Append a chip or a claim quote to what is already in the box. */
export function appendToPrompt(current: string, addition: string): string {
	const trimmed = current.replace(/\s+$/, '')
	if (!trimmed) return addition
	const separator = /[.!?:]$/.test(trimmed) ? ' ' : '. '
	return `${trimmed}${separator}${addition}`
}

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
