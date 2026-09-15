/**
 * Pure helpers for "Tell it what to change": the request shape, the prompt
 * the model gets, and the parser for its reply. No server imports, so the
 * unit test runs without a database and the resource route stays thin.
 */
import { z } from 'zod'
import { type ArticleLink } from '#app/utils/articles.ts'

export const ARTICLE_EDIT_DEFAULT_MODEL = 'anthropic/claude-sonnet-5'
export const ARTICLE_EDIT_MAX_PROMPT_CHARS = 4000
export const ARTICLE_EDIT_MAX_MARKDOWN_CHARS = 60_000
/** Requests one admin may send per minute. */
export const ARTICLE_EDIT_RATE_LIMIT = { max: 6, windowMs: 60_000 }
export const ARTICLE_EDIT_TIMEOUT_MS = 60_000

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
})

export type ArticleEditRequest = z.infer<typeof ArticleEditRequestSchema>

export type ArticleEditReply = { markdown: string; summary: string }

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

export function buildEditUserMessage(prompt: string, markdown: string): string {
	return `REQUESTED CHANGE:\n${prompt.trim()}\n\nARTICLE (markdown):\n${markdown}`
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
