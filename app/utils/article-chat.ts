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
import {
	FACT_ANSWER_MAX_CHARS,
	FACT_MAX_CHARS,
	FACT_QUESTION_MAX_CHARS,
	FACT_TAGS_MAX_CHARS,
	factBankBlock,
	normaliseTags,
	type FactBankRow,
} from '#app/utils/review-facts.ts'

export const ARTICLE_CHAT_DEFAULT_MODEL = 'anthropic/claude-sonnet-5'
export const ARTICLE_CHAT_ENDPOINT = '/resources/article-chat'
export const ARTICLE_CHAT_MAX_TEXT_CHARS = 4000
/** Messages one admin may send per minute. */
export const ARTICLE_CHAT_RATE_LIMIT = { max: 10, windowMs: 60_000 }
/** The whole turn, every model call included. */
export const ARTICLE_CHAT_TIMEOUT_MS = 60_000
/** Tool calls in one turn. The loop stops here without another model call. */
export const ARTICLE_CHAT_MAX_TOOL_CALLS = 4
/** A grill turn may call this many more: save_fact and one edit must both fit. */
export const ARTICLE_CHAT_GRILL_EXTRA_TOOL_CALLS = 2
/** Questions in one grill. The prompt says it; the server holds it. */
export const ARTICLE_CHAT_GRILL_MAX_QUESTIONS = 6
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

/** `grill` starts a grill (R2), `grill_stop` ends one (R5). No text with either. */
export const CHAT_MODES = ['grill', 'grill_stop'] as const
export type ChatMode = (typeof CHAT_MODES)[number]

/**
 * POST /resources/article-chat. `text` may be empty only with a quote or a
 * picture attached (then the model asks what she wants), or with a `mode`.
 * `quote` is the passage she selected, as it reads on the page.
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
		mode: z.enum(CHAT_MODES).optional(),
	})
	.refine(
		v =>
			v.text.length > 0 ||
			Boolean(v.imageId) ||
			Boolean(v.quote) ||
			Boolean(v.mode),
		{
			message: 'Say something, or attach a quote or a picture.',
			path: ['text'],
		},
	)

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

/**
 * The assistant rows a grill writes carry a marker in `toolName`: the
 * question she is to answer, and the row that ends the grill.
 */
export const GRILL_ROW_MARKERS = {
	question: 'grill_question',
	done: 'grill_done',
} as const

/** What a turn's response says about the grill: active, ended by this turn, or none. */
export type GrillState = 'active' | 'done' | null

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
	/** The grill (phase 5). The buttons and the placeholder are the client's. */
	grillButton: 'Grill me',
	grillStopButton: 'Stop grilling',
	grillPlaceholder: 'Answer here, or say skip',
	/** The synthetic user turn the model sees before the first question. */
	grillStart: 'Grill me.',
	/** The grill_done row after Stop grilling or a bare "stop". */
	grillStopped: 'Stopped.',
	/** The grill_done row after the last answer. */
	grillDone: (summary: string) => `Done. Here is what changed: ${summary}`,
	grillNothingChanged: 'Nothing changed.',
	/** 409 when Grill me is pressed while a grill runs. */
	grillActive:
		'A grill is already running. Answer in the chat, or stop it first.',
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

export const SaveFactArgsSchema = z.object({
	question: z.string().trim().min(1).max(FACT_QUESTION_MAX_CHARS),
	answer: z.string().trim().min(1).max(FACT_ANSWER_MAX_CHARS),
	fact: z.string().trim().min(1).max(FACT_MAX_CHARS),
	tags: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.transform(normaliseTags)
		.transform(s => s.slice(0, FACT_TAGS_MAX_CHARS)),
})

export const EndGrillArgsSchema = z.object({
	summary: summaryField,
})

export type ReplaceTextArgs = z.infer<typeof ReplaceTextArgsSchema>
export type RewriteArticleArgs = z.infer<typeof RewriteArticleArgsSchema>
export type ReplacePictureArgs = z.infer<typeof ReplacePictureArgsSchema>
export type SaveFactArgs = z.infer<typeof SaveFactArgsSchema>
export type EndGrillArgs = z.infer<typeof EndGrillArgsSchema>

export const CHAT_TOOL_NAMES = [
	'replace_text',
	'rewrite_article',
	'replace_picture',
] as const
export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number]
/** The two tools a grill turn adds. */
export const GRILL_TOOL_NAMES = ['save_fact', 'end_grill'] as const
export type GrillToolName = (typeof GRILL_TOOL_NAMES)[number]

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

/** The tools a grill turn gets: the three above, then these two. */
export const GRILL_TOOLS = [
	...CHAT_TOOLS,
	{
		type: 'function',
		function: {
			name: 'save_fact',
			description:
				'Remember what Sarah answered, so nobody asks it again. Call it once per answered question, after the edit. Never for "skip" or "I do not know", and never for an instruction about the text.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					question: {
						type: 'string',
						description: 'The question she answered, as asked.',
					},
					answer: {
						type: 'string',
						description: 'Her answer, in her words.',
					},
					fact: {
						type: 'string',
						description:
							'One plain sentence a writer can use, for example "Sarah charges $12 per unit of Botox."',
					},
					tags: {
						type: 'string',
						description:
							'Lowercase topics, comma-separated, for example "botox, pricing". Use botox, filler, weight-loss, skin, laser, farragut, bearden, pricing, hours, staff, voice, patients where they fit.',
					},
				},
				required: ['question', 'answer', 'fact'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'end_grill',
			description:
				'End the grill: nothing more is worth asking, she asked to stop, or the cap is reached. summary is one or two sentences that say what changed in the article across this grill, or "Nothing changed."',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					summary: {
						type: 'string',
						description: 'What changed in the article, or "Nothing changed."',
					},
				},
				required: ['summary'],
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
	'WHAT SARAH HAS ALREADY TOLD US lists facts from Sarah. Use them in the article without asking. Never ask a question the list answers. When a fact there conflicts with the article, apply the fact. When she asks a question the list answers, answer from it.',
].join(' ')

/**
 * The GRILL rules (R3), added to the system prompt of every grill turn.
 * The count line and the turn line are appended by `grillRulesBlock`.
 */
export const GRILL_RULES = [
	'GRILL MODE. Sarah pressed "Grill me". Your goal: make this article hers with facts only she knows. Interview her one question at a time until nothing important is still assumed, then end.',
	'Ask only what she alone knows: her experience, what she tells patients, numbers and specifics at her practice, her opinion on a claim, her own wording.',
	'Never ask: anything WHAT SARAH HAS ALREADY TOLD US answers; anything a writer can look up; anything the article already states from a cited source.',
	'Form: one question per turn, at most two sentences, concrete, with a suggested answer or options when that speeds her up. Number it "Q1", "Q2" and so on. She dictates on a phone: short is good.',
	'Each answer turn: first apply her answer to the article with replace_text (or rewrite_article when many paragraphs must change), her words where they fit, in her voice. Then call save_fact with the question, her answer, one plain sentence a writer can use, and tags. Then ask the next question, or end.',
	'"skip", "I don\'t know", "not sure": no edit, no fact; ask the next question. "stop", "enough", "that\'s all": end now.',
	`The cap is ${ARTICLE_CHAT_GRILL_MAX_QUESTIONS} questions per grill. End earlier when nothing is worth asking. To end, call end_grill with one or two sentences that say what changed in the article across this grill (or "Nothing changed."). Do not write the ending yourself.`,
].join('\n')

/** What the grill block needs to know about this turn. */
export type GrillPromptInput = {
	/** Questions already asked in this grill. */
	asked: number
	/** True on the turn that starts the grill: ask Q1, no answer to apply. */
	start: boolean
}

/** The GRILL rules with the count line and the line for this turn. */
export function grillRulesBlock({ asked, start }: GrillPromptInput): string {
	const lines = [
		GRILL_RULES,
		`Asked so far: ${asked} of ${ARTICLE_CHAT_GRILL_MAX_QUESTIONS}.`,
	]
	if (start) {
		lines.push(
			'This is the start: ask Q1 now, or call end_grill when the list already covers what matters.',
		)
	} else if (asked >= ARTICLE_CHAT_GRILL_MAX_QUESTIONS) {
		lines.push(
			'That was the last answer: apply it, save the fact, then call end_grill. Do not ask another question.',
		)
	}
	return lines.join('\n')
}

/** One picture line of the article, numbered from the top (article-images.ts). */
export type ChatPicture = PictureListItem

/**
 * The system prompt: the rules, the GRILL rules on a grill turn, the
 * links, the pictures, the fact bank, and the artifact last.
 */
export function buildChatSystemPrompt({
	links,
	pictures,
	markdown,
	facts = [],
	grill = null,
}: {
	links: ArticleLink[]
	pictures: ChatPicture[]
	markdown: string
	/** The live bank (review-facts.server.ts loadFactBank). */
	facts?: FactBankRow[]
	grill?: GrillPromptInput | null
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
		...(grill ? ['', grillRulesBlock(grill)] : []),
		'',
		'LINKS THAT MUST STAY:',
		linkLines,
		'',
		'PICTURES IN THE ARTICLE:',
		pictureLinesText,
		'',
		'WHAT SARAH HAS ALREADY TOLD US:',
		factBankBlock(facts).text,
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
	toolName?: string | null
}

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string }

/**
 * The stored rows as model messages: the last ARTICLE_CHAT_HISTORY_ROWS,
 * user rows with their quote block first, change rows as
 * `Changed: <summary>`, the oldest dropped while the joined length passes
 * ARTICLE_CHAT_HISTORY_CHARS. A window opens with her turn, or with a
 * grill question (then the "Grill me." turn that asked for it is put
 * back in front, so the model sees a user turn first).
 */
export function historyToMessages(
	rows: ChatHistoryRow[],
): ChatHistoryMessage[] {
	const out = rows.slice(-ARTICLE_CHAT_HISTORY_ROWS).map(row => {
		const opens =
			row.role === 'user' || row.toolName === GRILL_ROW_MARKERS.question
		if (row.role === 'user') {
			return { role: 'user' as const, content: userRowText(row), opens }
		}
		if (row.role === 'change') {
			return {
				role: 'assistant' as const,
				content: summaryLine(row.text),
				opens,
			}
		}
		return { role: 'assistant' as const, content: row.text, opens }
	})
	let total = out.reduce((n, m) => n + m.content.length, 0)
	while (out.length > 0 && total > ARTICLE_CHAT_HISTORY_CHARS) {
		total -= (out.shift() as ChatHistoryMessage).content.length
	}
	// A window must open with her turn, never with an answer to a lost turn.
	while (out.length > 0 && !out[0]?.opens) out.shift()
	const messages: ChatHistoryMessage[] = out.map(({ role, content }) => ({
		role,
		content,
	}))
	if (messages[0]?.role === 'assistant') {
		messages.unshift({ role: 'user', content: CHAT_COPY.grillStart })
	}
	return messages
}

/* ------------------------------------------------------------------------ */
/* The grill (phase 5)                                                      */
/* ------------------------------------------------------------------------ */

/** What the grill helpers need from a stored row. */
export type GrillRow = { toolName?: string | null }

/**
 * The grill state a thread is in: active while the last marker row is a
 * question (R4), done when it is a grill_done row, null with no grill yet.
 */
export function grillStateOf(rows: GrillRow[]): GrillState {
	for (let i = rows.length - 1; i >= 0; i--) {
		const marker = rows[i]?.toolName
		if (marker === GRILL_ROW_MARKERS.question) return 'active'
		if (marker === GRILL_ROW_MARKERS.done) return 'done'
	}
	return null
}

/** Questions asked in the current grill: the question rows after the last grill_done. */
export function grillQuestionsAsked(rows: GrillRow[]): number {
	let asked = 0
	for (let i = rows.length - 1; i >= 0; i--) {
		const marker = rows[i]?.toolName
		if (marker === GRILL_ROW_MARKERS.done) break
		if (marker === GRILL_ROW_MARKERS.question) asked++
	}
	return asked
}

/** Her bare words that end a grill without a model call (R4). */
export const GRILL_STOP_RE =
	/^(stop|stop grilling|stop the grill|enough|that'?s all|that is all|that'?s it|that is it|no more|no more questions)[\s.!]*$/i

export function isGrillStop(text: string): boolean {
	return GRILL_STOP_RE.test(text.trim().replace(/[\u2018\u2019]/g, "'"))
}

/** True when the model's final text asks something: a "Q<n>" label or a closing question mark. */
export function looksLikeQuestion(text: string): boolean {
	const trimmed = text.trim()
	return /\bQ\d+\b/.test(trimmed) || trimmed.endsWith('?')
}

/** True when the model's final text says the grill is over without end_grill. */
export function saysGrillDone(text: string): boolean {
	const trimmed = text.trim()
	return (
		/^done\b/i.test(trimmed) ||
		/\bnothing (more|else) to ask\b/i.test(trimmed) ||
		/\bthat'?s all (I|i) need\b/.test(trimmed)
	)
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
