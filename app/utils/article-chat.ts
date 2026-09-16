/**
 * Pure pieces of the article chat (spec phase 3, R2): the request shape,
 * the tools the model gets, the system prompt and the user turn, the
 * history window, and the functions that apply one tool call to the
 * working copy and guard the result. No server imports, so the unit test
 * runs without a database and the editor shares the copy and the types.
 *
 * The flow: Sarah writes in the chat. The model answers a question in
 * plain text, or edits the article through a tool. The server
 * (article-chat.server.ts) applies the tool calls to a working copy and
 * saves it once.
 */
import { z } from 'zod'
import {
	ARTICLE_EDIT_MAX_MARKDOWN_CHARS,
	ARTICLE_EDIT_MAX_SELECTION_CHARS,
	ARTICLE_EDIT_MAX_SELECTION_MARKDOWN_CHARS,
	ARTICLE_EDIT_MIN_SELECTION_CHARS,
	changedParagraphShare,
	countPassage,
	locatePassage,
	pictureLines,
} from '#app/utils/article-edit.ts'
import { type PictureListItem } from '#app/utils/article-images.ts'
import { missingLinks, type ArticleLink } from '#app/utils/articles.ts'

export const ARTICLE_CHAT_DEFAULT_MODEL = 'anthropic/claude-sonnet-5'
export const ARTICLE_CHAT_ENDPOINT = '/resources/article-chat'
export const ARTICLE_CHAT_MAX_TEXT_CHARS = 4000
/** Messages one admin may send per minute. */
export const ARTICLE_CHAT_RATE_LIMIT = { max: 10, windowMs: 60_000 }
/** The whole turn, every model call included. */
export const ARTICLE_CHAT_TIMEOUT_MS = 60_000
/** Tool calls in one turn. The loop stops here without another model call. */
export const ARTICLE_CHAT_MAX_TOOL_CALLS = 4
/** The stored rows the model sees, newest last. */
export const ARTICLE_CHAT_HISTORY_ROWS = 30
/** The oldest rows drop while the joined history passes this many characters. */
export const ARTICLE_CHAT_HISTORY_CHARS = 24_000
export const ARTICLE_CHAT_TEMPERATURE = 0.2
export const ARTICLE_CHAT_MAX_OUTPUT_TOKENS = 16_000
/** A quoted turn that would rewrite more than this share of paragraphs is refused. */
export const ARTICLE_CHAT_QUOTED_CHANGE_SHARE_MAX = 0.4
/** Her words name a picture: then the picture lines may change. */
export const NAMES_PICTURE_RE = /picture|image|photo/i
/** How long a summary or an alt text may be after the model's reply is cut. */
const SUMMARY_MAX_CHARS = 300

/* ------------------------------------------------------------------------ */
/* The request and the rows                                                 */
/* ------------------------------------------------------------------------ */

/**
 * POST /resources/article-chat. `text` may be empty only with a quote or a
 * picture attached (then the model asks what she wants). `quote` is the
 * passage she selected, as it reads on the page.
 */
export const ArticleChatRequestSchema = z
	.object({
		articleId: z.string().trim().min(1).max(64),
		text: z.string().trim().max(ARTICLE_CHAT_MAX_TEXT_CHARS).default(''),
		quote: z
			.string()
			.trim()
			.min(ARTICLE_EDIT_MIN_SELECTION_CHARS)
			.max(ARTICLE_EDIT_MAX_SELECTION_CHARS)
			.nullish(),
		imageId: z.string().trim().min(1).max(64).nullish(),
		baseHash: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.refine(v => v.text.length > 0 || Boolean(v.imageId) || Boolean(v.quote), {
		message: 'Say something, or attach a quote or a picture.',
		path: ['text'],
	})

export type ArticleChatRequest = z.infer<typeof ArticleChatRequestSchema>

export type ChatRole = 'user' | 'assistant' | 'change'

export const CHAT_ROLES: readonly ChatRole[] = ['user', 'assistant', 'change']

/** One stored row, as the pages and the resource send it. */
export type ChatMessageJson = {
	id: string
	role: ChatRole
	text: string
	quote: string | null
	imageId: string | null
	/** /resources/article-images/<imageId> when a picture is attached. */
	imageUrl: string | null
	toolName: string | null
	createdAt: string
}

/** The copy the server and the chat UI share. Exact strings from the plan. */
export const CHAT_COPY = {
	/** Stored as the assistant row when a turn ends with no change and no text. */
	fallback:
		'I could not make that change. Try saying it in other words, or change it under Markdown.',
	badRequest: 'Say what to change, in up to 4000 characters.',
	notFound: 'Article not found.',
	unknownImage: 'That picture is not on this article.',
	decided: 'This one is already decided. Reopen it first.',
	changed: 'The writer sent new text while you were editing.',
	tooMany: 'That is many messages in one minute. Wait a moment and try again.',
	notSetUp: 'The chat is not set up on this server. Ask Zane.',
	noAnswer: 'The assistant did not answer. Try again in a moment.',
	tooLong: 'That took too long. Try again, or say it in fewer words.',
	/** Client side only. */
	network: 'Could not reach the server. Check the connection and try again.',
	conflict:
		'The writer sent new text while you were editing. Choose Use the new text or Keep mine, then send again.',
	notSaved: 'Your typed change has not saved yet. Wait for Saved, then send.',
	/** The change row for replace_picture. `summaryLine` adds "Changed: ". */
	pictureChanged: (n: number) => `picture ${n} is now the one you sent.`,
} as const

/** `Changed: <summary>` with the first letter lowered when the word allows it. */
export function summaryLine(summary: string): string {
	const second = summary.charAt(1)
	const lowered =
		second && second === second.toLowerCase()
			? summary.charAt(0).toLowerCase() + summary.slice(1)
			: summary
	return `Changed: ${lowered}`
}

/* ------------------------------------------------------------------------ */
/* Tools                                                                    */
/* ------------------------------------------------------------------------ */

const summaryField = z
	.string()
	.trim()
	.min(1)
	.transform(s => s.slice(0, SUMMARY_MAX_CHARS))

export const ReplaceTextArgsSchema = z.object({
	find: z.string().min(1).max(2000),
	replace: z.string().max(6000),
	summary: summaryField,
})

export const RewriteArticleArgsSchema = z.object({
	markdown: z.string().min(1).max(ARTICLE_EDIT_MAX_MARKDOWN_CHARS),
	summary: summaryField,
})

export const ReplacePictureArgsSchema = z.object({
	picture_number: z.number().int().min(1),
	image_id: z.string().min(1).max(64),
	alt: z
		.string()
		.default('')
		.transform(s => s.trim().slice(0, SUMMARY_MAX_CHARS)),
	summary: summaryField,
})

export type ReplaceTextArgs = z.infer<typeof ReplaceTextArgsSchema>
export type RewriteArticleArgs = z.infer<typeof RewriteArticleArgsSchema>
export type ReplacePictureArgs = z.infer<typeof ReplacePictureArgsSchema>

export const CHAT_TOOL_NAMES = [
	'replace_text',
	'rewrite_article',
	'replace_picture',
] as const
export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number]

/** The tools, as sent to OpenRouter. */
export const CHAT_TOOLS = [
	{
		type: 'function',
		function: {
			name: 'replace_text',
			description:
				'Change one passage. find is an exact substring of the article as it stands (copy it, marks and all); it must occur exactly once. replace is the new text (empty deletes it). Use it for every small change.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					find: {
						type: 'string',
						description: 'The exact text to replace, as it is in the markdown.',
					},
					replace: {
						type: 'string',
						description: 'The new text. Empty removes the passage.',
					},
					summary: {
						type: 'string',
						description: 'One plain sentence that says what changed.',
					},
				},
				required: ['find', 'replace', 'summary'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'rewrite_article',
			description:
				'Replace the whole article. Only for a change that touches most paragraphs. markdown is the complete article.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					markdown: {
						type: 'string',
						description: 'The whole article after the change.',
					},
					summary: {
						type: 'string',
						description: 'One plain sentence that says what changed.',
					},
				},
				required: ['markdown', 'summary'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'replace_picture',
			description:
				'Swap one picture for the picture she sent. picture_number counts the picture lines from the top, starting at 1. image_id is the ATTACHED PICTURE id. The caption line stays.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					picture_number: { type: 'integer', minimum: 1 },
					image_id: { type: 'string' },
					alt: {
						type: 'string',
						description:
							'A short description of the new picture. Empty keeps the old one.',
					},
					summary: {
						type: 'string',
						description: 'One plain sentence that says what changed.',
					},
				},
				required: ['picture_number', 'image_id', 'summary'],
			},
		},
	},
] as const

/* ------------------------------------------------------------------------ */
/* Prompts                                                                  */
/* ------------------------------------------------------------------------ */

/** The rules, exact text from the plan (section 2). */
export const CHAT_SYSTEM_RULES = [
	'You help Sarah Hitchcox, RN, review an article that will be published under her name.',
	'The article is the ARTIFACT below. Sarah asks questions or asks for changes.',
	'For a question, answer in two or three short plain sentences and do not change the article.',
	'For a change, use the tools: replace_text for one passage, rewrite_article only when many paragraphs must change, replace_picture when she sent a picture or names a picture.',
	'Change only what she asks. Keep every other sentence exactly as it is.',
	'Never add a medical or clinical claim, statistic, price, or named product she did not ask for.',
	'Keep every link in LINKS THAT MUST STAY, URL byte for byte; you may move a link to another sentence, never drop it.',
	'A line that starts with ![ is a picture and the italic line under it is its caption; keep both unless she names a picture.',
	'Keep the markdown style. When a passage is quoted, change only that passage.',
	'After a tool answers ok, reply with nothing or one short sentence.',
	'When a tool answers not_found or ambiguous, try once more with a longer or shorter find, then tell her in one sentence what you could not find.',
	'Plain words. No headings and no long lists in answers.',
	'If she sends a picture with no words, do not change anything; ask which picture it should replace, for example "the second one", or whether to add it.',
].join(' ')

/** One picture line of the article, numbered from the top (article-images.ts). */
export type ChatPicture = PictureListItem

export function buildChatSystemPrompt({
	links,
	pictures,
	markdown,
}: {
	links: ArticleLink[]
	pictures: ChatPicture[]
	markdown: string
}): string {
	const linkLines = links.length
		? links.map(l => `${l.name}: ${l.url}`).join('\n')
		: '(none)'
	const pictureLinesText = pictures.length
		? pictures
				.map(
					p =>
						`${p.n}. ${p.alt || '(no description)'} (${p.fileName ?? p.src})`,
				)
				.join('\n')
		: '(none)'
	return [
		CHAT_SYSTEM_RULES,
		'',
		'LINKS THAT MUST STAY:',
		linkLines,
		'',
		'PICTURES IN THE ARTICLE:',
		pictureLinesText,
		'',
		'ARTIFACT (markdown):',
		markdown,
	].join('\n')
}

/** The picture she attached to this message. */
export type ChatImageRef = {
	id: string
	width?: number | null
	height?: number | null
}

/**
 * The new user turn: the quote first (with the source slice when it is
 * found exactly once), the attached picture, then her words or `(no words)`.
 */
export function buildChatUserTurn({
	text,
	quote,
	markdown,
	image,
}: {
	text: string
	quote?: string | null
	markdown: string
	image?: ChatImageRef | null
}): string {
	const parts: string[] = []
	if (quote?.trim()) {
		const lines = [
			'ABOUT THIS PASSAGE (as it reads on the page):',
			`"${quote.trim()}"`,
		]
		const range = locatePassage(markdown, quote)
		if (range) {
			const slice = markdown.slice(range.start, range.end)
			if (slice.length <= ARTICLE_EDIT_MAX_SELECTION_MARKDOWN_CHARS) {
				lines.push('IN THE SOURCE IT IS:', slice)
			}
		}
		parts.push(lines.join('\n'))
	}
	if (image) parts.push(pictureLine(image))
	parts.push(text.trim() || '(no words)')
	return parts.join('\n\n')
}

function pictureLine(image: ChatImageRef): string {
	const size =
		image.width && image.height ? `, ${image.width}x${image.height} px` : ''
	return `ATTACHED PICTURE: id ${image.id}${size}.`
}

/** What `historyToMessages` needs from a stored row. */
export type ChatHistoryRow = {
	role: ChatRole
	text: string
	quote?: string | null
	imageId?: string | null
}

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string }

/**
 * The stored rows as model messages: the last ARTICLE_CHAT_HISTORY_ROWS,
 * user rows with their quote block first, change rows as
 * `Changed: <summary>`, the oldest dropped while the joined length passes
 * ARTICLE_CHAT_HISTORY_CHARS.
 */
export function historyToMessages(
	rows: ChatHistoryRow[],
): ChatHistoryMessage[] {
	const out: ChatHistoryMessage[] = rows
		.slice(-ARTICLE_CHAT_HISTORY_ROWS)
		.map(row => {
			if (row.role === 'user')
				return { role: 'user', content: userRowText(row) }
			if (row.role === 'change') {
				return { role: 'assistant', content: summaryLine(row.text) }
			}
			return { role: 'assistant', content: row.text }
		})
	let total = out.reduce((n, m) => n + m.content.length, 0)
	while (out.length > 0 && total > ARTICLE_CHAT_HISTORY_CHARS) {
		total -= (out.shift() as ChatHistoryMessage).content.length
	}
	// A window must open with her turn, never with an answer to a lost turn.
	while (out.length > 0 && out[0]?.role !== 'user') out.shift()
	return out
}

function userRowText(row: ChatHistoryRow): string {
	const parts: string[] = []
	if (row.quote?.trim()) {
		parts.push(
			`ABOUT THIS PASSAGE (as it reads on the page):\n"${row.quote.trim()}"`,
		)
	}
	if (row.imageId) parts.push(`ATTACHED PICTURE: id ${row.imageId}.`)
	parts.push(row.text.trim() || '(no words)')
	return parts.join('\n\n')
}

/* ------------------------------------------------------------------------ */
/* Applying a tool call                                                     */
/* ------------------------------------------------------------------------ */

/** Why a tool call was refused. The model reads it and tries once more. */
export type ToolFailReason =
	| 'not_found'
	| 'ambiguous'
	| 'picture_lines_changed'
	| 'link_removed'
	| 'too_much_changed'
	| 'no_such_picture'
	| 'unknown_image'
	| 'bad_arguments'
	| 'too_many_calls'

export type ToolFailure = {
	ok: false
	reason: ToolFailReason
	/** For ambiguous and no_such_picture: how many there are. */
	count?: number
	/** For link_removed: the URL that went missing. */
	url?: string
}

export type ReplaceTextResult = { ok: true; markdown: string } | ToolFailure

/**
 * replace_text: the exact substring first, else the folded match
 * (whitespace, curly quotes, emphasis marks) through `locatePassage`.
 * Exactly one hit replaces it. More than one is `ambiguous` with the
 * count. None is `not_found`. An empty `replace` deletes the passage and
 * the doubled space it leaves.
 */
export function applyReplaceText(
	markdown: string,
	args: { find: string; replace: string },
): ReplaceTextResult {
	const exact = countOccurrences(markdown, args.find)
	if (exact === 1) {
		const start = markdown.indexOf(args.find)
		return {
			ok: true,
			markdown: splice(markdown, start, start + args.find.length, args.replace),
		}
	}
	if (exact > 1) return { ok: false, reason: 'ambiguous', count: exact }
	const range = locatePassage(markdown, args.find)
	if (range) {
		return {
			ok: true,
			markdown: splice(markdown, range.start, range.end, args.replace),
		}
	}
	const folded = countPassage(markdown, args.find)
	if (folded > 1) return { ok: false, reason: 'ambiguous', count: folded }
	return { ok: false, reason: 'not_found' }
}

function countOccurrences(hay: string, needle: string): number {
	if (!needle) return 0
	let count = 0
	let from = 0
	while (true) {
		const at = hay.indexOf(needle, from)
		if (at < 0) return count
		count++
		from = at + needle.length
	}
}

function splice(
	text: string,
	start: number,
	end: number,
	replacement: string,
): string {
	let before = text.slice(0, start)
	let after = text.slice(end)
	if (replacement === '') {
		// a deleted passage leaves two spaces or two blank lines; keep one
		if (before.endsWith(' ') && after.startsWith(' ')) after = after.slice(1)
		else if (/\n\n$/.test(before) && /^\n\n/.test(after)) after = after.slice(2)
		else if (before.endsWith('\n') && after.startsWith('\n'))
			after = after.slice(1)
	}
	return before + replacement + after
}

/** rewrite_article: the markdown as given, CRLF folded, the final newline kept. */
export function applyRewrite(
	markdown: string,
	args: { markdown: string },
): { ok: true; markdown: string } {
	let next = args.markdown.replace(/\r\n/g, '\n')
	if (markdown.endsWith('\n') && !next.endsWith('\n')) next += '\n'
	return { ok: true, markdown: next }
}

/**
 * The guards after replace_text and rewrite_article. A refusal leaves the
 * working copy as it was: the picture lines moved while the turn named no
 * picture; a link that must stay went missing; a quoted turn rewrote more
 * than ARTICLE_CHAT_QUOTED_CHANGE_SHARE_MAX of the paragraphs.
 */
export function guardChange({
	before,
	after,
	links,
	quoted,
	namesPicture,
}: {
	before: string
	after: string
	links: ArticleLink[]
	quoted: boolean
	namesPicture: boolean
}): { ok: true } | ToolFailure {
	if (
		!namesPicture &&
		pictureLines(before).join('\n') !== pictureLines(after).join('\n')
	) {
		return { ok: false, reason: 'picture_lines_changed' }
	}
	const wasMissing = new Set(missingLinks(before, links).map(l => l.url))
	const lost = missingLinks(after, links).find(l => !wasMissing.has(l.url))
	if (lost) return { ok: false, reason: 'link_removed', url: lost.url }
	if (
		quoted &&
		changedParagraphShare(before, after) > ARTICLE_CHAT_QUOTED_CHANGE_SHARE_MAX
	) {
		return { ok: false, reason: 'too_much_changed' }
	}
	return { ok: true }
}

/** True when this turn may change the picture lines: her words name one, or a picture is attached. */
export function turnNamesPicture(
	text: string,
	imageId?: string | null,
): boolean {
	return Boolean(imageId) || NAMES_PICTURE_RE.test(text)
}
