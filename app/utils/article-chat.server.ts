/**
 * The article chat, server side (spec phase 3, section 2; phase 5 adds
 * the grill): one turn that answers or edits.
 *
 * Order of work: the rules (missing, decided, base hash, picture, key);
 * her user row is written before the model runs, so a crash keeps her
 * words; the tool loop applies each call to a working copy; the copy is
 * saved once through saveWorkingCopy (the 409 rules apply); then one
 * change row per applied tool call and the assistant row are written.
 *
 * The grill (R2 to R5): mode 'grill' writes no user row; the model asks
 * the first question, stored as an assistant row marked grill_question.
 * While the last marker row is a question, every turn is an answer turn:
 * it runs with the GRILL rules and the two grill tools (save_fact,
 * end_grill), and its final row is marked grill_question or grill_done.
 * mode 'grill_stop', or her bare "stop", writes the grill_done row
 * 'Stopped.' with no model call.
 *
 * Logs carry lengths, counts and the model id. Never the text, never her
 * answers, never the key.
 */
import {
	ARTICLE_CHAT_DEFAULT_MODEL,
	ARTICLE_CHAT_GRILL_EXTRA_TOOL_CALLS,
	ARTICLE_CHAT_GRILL_MAX_QUESTIONS,
	ARTICLE_CHAT_HISTORY_ROWS,
	ARTICLE_CHAT_MAX_OUTPUT_TOKENS,
	ARTICLE_CHAT_MAX_TOOL_CALLS,
	ARTICLE_CHAT_TEMPERATURE,
	ARTICLE_CHAT_TIMEOUT_MS,
	CHAT_COPY,
	CHAT_ROLES,
	CHAT_TOOLS,
	EndGrillArgsSchema,
	GRILL_ROW_MARKERS,
	GRILL_TOOLS,
	ReplacePictureArgsSchema,
	ReplaceTextArgsSchema,
	RewriteArticleArgsSchema,
	SaveFactArgsSchema,
	applyReplaceText,
	applyRewrite,
	buildChatSystemPrompt,
	buildChatUserTurn,
	grillQuestionsAsked,
	grillStateOf,
	guardChange,
	historyToMessages,
	isGrillStop,
	looksLikeQuestion,
	saysGrillDone,
	turnNamesPicture,
	type ChatMessageJson,
	type ChatMode,
	type ChatRole,
	type EndGrillArgs,
	type GrillState,
	type SaveFactArgs,
	type ToolFailure,
} from '#app/utils/article-chat.ts'
import {
	applyPictureReplacement,
	articleImageUrl,
	pictureList,
} from '#app/utils/article-images.ts'
import {
	hashBody,
	reviewerName,
	saveWorkingCopy,
} from '#app/utils/articles.server.ts'
import { parseLinks, type ArticleLink } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	chatCompletion,
	openRouterApiKey,
	type ToolCall,
} from '#app/utils/openrouter.server.ts'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'
import { loadFactBank, saveFact } from '#app/utils/review-facts.server.ts'

export type ArticleChatConfig = { apiKey: string; model: string }

/** The key and the model, or null when the key is not set. */
export function getArticleChatConfig(): ArticleChatConfig | null {
	const apiKey = openRouterApiKey()
	if (!apiKey) return null
	return {
		apiKey,
		model: process.env.ARTICLE_CHAT_MODEL?.trim() || ARTICLE_CHAT_DEFAULT_MODEL,
	}
}

export type ChatTurnInput = {
	articleId: string
	userId: string
	/** Her words. Empty with a `mode`. */
	text: string
	quote?: string | null
	imageId?: string | null
	/** hashBody of the text her page shows. Must equal the stored text. */
	baseHash: string
	/**
	 * 'grill' starts a grill, 'grill_stop' ends one. Without it: a chat
	 * turn, or an answer turn while a grill is active.
	 */
	mode?: ChatMode | null
	config?: ArticleChatConfig | null
	fetchImpl?: typeof fetch
	/** The user row's time. Tests pass a fixed date. */
	now?: Date
	timeoutMs?: number
}

export type ChatTurnResult =
	| {
			ok: true
			/** The new rows, oldest first: her row, the change rows, the answer. */
			messages: ChatMessageJson[]
			body: string
			hash: string
			changed: boolean
			/** 'active' while a question waits for her, 'done' when this turn ended a grill. */
			grill: GrillState
	  }
	| { ok: false; kind: 'missing' }
	| { ok: false; kind: 'decided' }
	| { ok: false; kind: 'changed'; body: string; hash: string }
	| { ok: false; kind: 'unknown_image' }
	| { ok: false; kind: 'not_configured' }
	| { ok: false; kind: 'no_answer'; status?: number }
	| { ok: false; kind: 'timeout' }
	/** Grill me while a grill runs. */
	| { ok: false; kind: 'grill_active' }

type StoredRow = {
	id: string
	role: string
	text: string
	quote: string | null
	imageId: string | null
	toolName: string | null
	createdAt: Date
}

type ImageRow = {
	id: string
	fileName: string
	position: number
	width: number | null
	height: number | null
}

type OutMessage =
	| { role: 'system' | 'user'; content: string }
	| { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
	| { role: 'tool'; tool_call_id: string; content: string }

type ToolResultJson = { ok: true } | ToolFailure

/** One applied tool call, kept until the copy is saved. */
type AppliedChange = { toolName: string; text: string; imageId: string | null }

type GrillMarker = (typeof GRILL_ROW_MARKERS)[keyof typeof GRILL_ROW_MARKERS]

const IMAGE_SELECT = {
	id: true,
	fileName: true,
	position: true,
	width: true,
	height: true,
} as const

function toJson(row: StoredRow): ChatMessageJson {
	const role: ChatRole = (CHAT_ROLES as readonly string[]).includes(row.role)
		? (row.role as ChatRole)
		: 'assistant'
	return {
		id: row.id,
		role,
		text: row.text,
		quote: row.quote,
		imageId: row.imageId,
		imageUrl: row.imageId ? articleImageUrl(row.imageId) : null,
		toolName: row.toolName,
		createdAt: row.createdAt.toISOString(),
	}
}

/** The last `take` rows of the article's chat, oldest first. */
export async function loadChatHistory(
	articleId: string,
	take = 200,
): Promise<ChatMessageJson[]> {
	const rows = await prisma.articleChatMessage.findMany({
		where: { articleId },
		orderBy: { createdAt: 'desc' },
		take,
	})
	return rows.reverse().map(toJson)
}

/**
 * The grill this thread is in, read from the marker rows: active while
 * the last one is a question (R4), with the questions asked so far.
 */
export async function loadGrillState(
	articleId: string,
): Promise<{ active: boolean; asked: number }> {
	const markers = await prisma.articleChatMessage.findMany({
		where: {
			articleId,
			toolName: { in: [GRILL_ROW_MARKERS.question, GRILL_ROW_MARKERS.done] },
		},
		orderBy: { createdAt: 'asc' },
		select: { toolName: true },
	})
	return {
		active: grillStateOf(markers) === 'active',
		asked: grillQuestionsAsked(markers),
	}
}

/** Strictly increasing row times, so the order on reload is the order here. */
function stamper(first: Date) {
	let last = first.getTime()
	return () => {
		last = Math.max(Date.now(), last + 1)
		return new Date(last)
	}
}

/**
 * One turn of the chat. See the module comment for the order of work and
 * section 2 of the plan for the response and the failures.
 */
export async function runArticleChatTurn({
	articleId,
	userId,
	text,
	quote = null,
	imageId = null,
	baseHash,
	mode = null,
	config = getArticleChatConfig(),
	fetchImpl = fetch,
	now = new Date(),
	timeoutMs = ARTICLE_CHAT_TIMEOUT_MS,
}: ChatTurnInput): Promise<ChatTurnResult> {
	const started = Date.now()
	const article = await prisma.article.findUnique({
		where: { id: articleId },
		select: {
			id: true,
			status: true,
			body: true,
			linksJson: true,
			images: { select: IMAGE_SELECT, orderBy: { position: 'asc' } },
		},
	})
	if (!article) return { ok: false, kind: 'missing' }
	if (article.status !== 'pending') return { ok: false, kind: 'decided' }
	const current = hashBody(article.body)
	if (baseHash !== current) {
		return { ok: false, kind: 'changed', body: article.body, hash: current }
	}
	const attached = imageId
		? (article.images.find(im => im.id === imageId) ?? null)
		: null
	if (imageId && !attached) return { ok: false, kind: 'unknown_image' }

	const before = await loadGrillState(articleId)
	const stamp = stamper(now)
	const unchanged = { body: article.body, hash: current, changed: false }

	// Stop grilling needs no model and no key. Stopping twice is not an error.
	if (mode === 'grill_stop') {
		if (!before.active) {
			return { ok: true, messages: [], ...unchanged, grill: null }
		}
		const row = await prisma.articleChatMessage.create({
			data: {
				articleId,
				role: 'assistant',
				text: CHAT_COPY.grillStopped,
				toolName: GRILL_ROW_MARKERS.done,
				createdAt: stamp(),
			},
		})
		console.log(`Article chat: grill stopped after ${before.asked} questions`)
		return { ok: true, messages: [toJson(row)], ...unchanged, grill: 'done' }
	}
	if (mode === 'grill' && before.active) {
		return { ok: false, kind: 'grill_active' }
	}
	if (!config) return { ok: false, kind: 'not_configured' }

	const grill = mode === 'grill' || before.active
	const links: ArticleLink[] = parseLinks(article.linksJson)
	const history = historyToMessages(
		await loadChatHistory(articleId, ARTICLE_CHAT_HISTORY_ROWS),
	)
	const userRow =
		mode === 'grill'
			? null
			: await prisma.articleChatMessage.create({
					data: {
						articleId,
						role: 'user',
						text,
						quote: quote?.trim() || null,
						imageId: attached?.id ?? null,
						createdAt: now,
					},
				})

	// Her bare "stop" ends the grill here, with no model call (R4).
	if (grill && userRow && isGrillStop(text)) {
		const row = await prisma.articleChatMessage.create({
			data: {
				articleId,
				role: 'assistant',
				text: CHAT_COPY.grillStopped,
				toolName: GRILL_ROW_MARKERS.done,
				createdAt: stamp(),
			},
		})
		console.log(
			`Article chat: grill stopped by her words after ${before.asked} questions`,
		)
		return {
			ok: true,
			messages: [userRow, row].map(toJson),
			...unchanged,
			grill: 'done',
		}
	}

	const facts = await loadFactBank()
	const userTurn =
		mode === 'grill'
			? CHAT_COPY.grillStart
			: buildChatUserTurn({
					text,
					quote,
					markdown: article.body,
					image: attached,
				})
	const messages: OutMessage[] = [
		{
			role: 'system',
			content: buildChatSystemPrompt({
				links,
				pictures: pictureList(article.body, article.images),
				markdown: article.body,
				facts,
				grill: grill ? { asked: before.asked, start: mode === 'grill' } : null,
			}),
		},
		...history,
		{ role: 'user', content: userTurn },
	]
	const inChars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0)
	const context: ToolContext = {
		links,
		images: article.images,
		quoted: Boolean(quote?.trim()),
		namesPicture: turnNamesPicture(text, attached?.id),
		grill,
	}
	const maxCalls = grill
		? ARTICLE_CHAT_MAX_TOOL_CALLS + ARTICLE_CHAT_GRILL_EXTRA_TOOL_CALLS
		: ARTICLE_CHAT_MAX_TOOL_CALLS

	const deadline = started + timeoutMs
	let working = article.body
	const applied: AppliedChange[] = []
	const factsToSave: SaveFactArgs[] = []
	let ended: EndGrillArgs | null = null
	let toolCalls = 0
	let replies = 0
	let outChars = 0
	let finalText = ''
	let failure:
		| { kind: 'timeout' }
		| { kind: 'no_answer'; status?: number }
		| null = null

	while (true) {
		let reply: Awaited<ReturnType<typeof chatCompletion>>
		try {
			reply = await chatCompletion({
				apiKey: config.apiKey,
				model: config.model,
				deadline,
				fetchImpl,
				body: {
					messages,
					tools: grill ? GRILL_TOOLS : CHAT_TOOLS,
					tool_choice: 'auto',
					temperature: ARTICLE_CHAT_TEMPERATURE,
					max_tokens: ARTICLE_CHAT_MAX_OUTPUT_TOKENS,
				},
			})
		} catch (error) {
			console.error(
				`Article chat: OpenRouter request failed (${error instanceof Error ? error.name : 'error'}, model ${config.model})`,
			)
			failure = { kind: 'no_answer' }
			break
		}
		if (reply.kind === 'timeout') {
			failure = { kind: 'timeout' }
			break
		}
		if (reply.kind === 'http') {
			console.error(
				`Article chat: OpenRouter ${reply.status} (model ${config.model})`,
			)
			failure = { kind: 'no_answer', status: reply.status }
			break
		}
		replies++
		outChars += reply.message.content?.length ?? 0
		const calls = reply.message.tool_calls ?? []
		if (calls.length === 0) {
			finalText = (reply.message.content ?? '').trim()
			break
		}
		messages.push({
			role: 'assistant',
			content: reply.message.content ?? null,
			tool_calls: calls,
		})
		for (const call of calls) {
			outChars += call.function.arguments.length
			let result: ToolResultJson
			if (toolCalls >= maxCalls) {
				result = { ok: false, reason: 'too_many_calls' }
			} else {
				toolCalls++
				const outcome = applyToolCall(call, working, context)
				result = outcome.result
				if (outcome.next !== undefined && outcome.change) {
					working = outcome.next
					applied.push(outcome.change)
				}
				if (outcome.fact) factsToSave.push(outcome.fact)
				if (outcome.end) ended = outcome.end
			}
			messages.push({
				role: 'tool',
				tool_call_id: call.id,
				content: JSON.stringify(result),
			})
		}
		if (toolCalls >= maxCalls) break
	}

	if (failure && replies === 0) {
		// no reply at all: the user row stays, the client offers Try again
		return { ok: false, ...failure }
	}

	// What she said is kept even when the article save fails below.
	for (const fact of factsToSave) {
		await saveFact({ ...fact, source: 'grill', articleId, userId })
	}

	let body = article.body
	let hash = current
	let changed = false
	const rows: StoredRow[] = userRow ? [userRow] : []

	if (applied.length > 0) {
		if (working !== article.body) {
			const outcome = await saveWorkingCopy({
				id: articleId,
				body: working,
				baseHash,
				who: await reviewerName(userId),
				userId,
				source: 'ai',
			})
			if (outcome.kind === 'changed') {
				return {
					ok: false,
					kind: 'changed',
					body: outcome.body,
					hash: outcome.hash,
				}
			}
			if (outcome.kind === 'decided') return { ok: false, kind: 'decided' }
			if (outcome.kind === 'missing') return { ok: false, kind: 'missing' }
			hash = outcome.hash
			if (outcome.kind === 'saved') {
				body = working
				changed = true
			}
		}
		for (const change of applied) {
			rows.push(
				await prisma.articleChatMessage.create({
					data: {
						articleId,
						role: 'change',
						text: change.text,
						toolName: change.toolName,
						imageId: change.imageId,
						createdAt: stamp(),
					},
				}),
			)
			await recordReviewEvent(articleId, 'ai_edit', {
				userId,
				note: change.text,
			})
		}
	}

	let grillState: GrillState = null
	if (!grill) {
		const answer = finalText || (applied.length === 0 ? CHAT_COPY.fallback : '')
		if (answer) {
			rows.push(
				await prisma.articleChatMessage.create({
					data: {
						articleId,
						role: 'assistant',
						text: answer,
						createdAt: stamp(),
					},
				}),
			)
		}
	} else {
		const closing = grillClosing({
			ended,
			finalText,
			failed: Boolean(failure),
			asked: before.asked,
			applied,
		})
		if (closing) {
			rows.push(
				await prisma.articleChatMessage.create({
					data: {
						articleId,
						role: 'assistant',
						text: closing.text,
						toolName: closing.marker,
						createdAt: stamp(),
					},
				}),
			)
			grillState =
				closing.marker === GRILL_ROW_MARKERS.question ? 'active' : 'done'
		} else if (rows.length === 0 && failure) {
			// a failed start with nothing to show: the client offers Try again
			return { ok: false, ...failure }
		} else {
			// the model failed mid-turn: the previous question, if any, stays open
			grillState = before.active ? 'active' : null
		}
	}

	console.log(
		`Article chat: ${mode ?? (grill ? 'answer' : 'chat')}, model ${config.model}, text ${text.length} chars, quote ${quote?.trim().length ?? 0} chars, image ${attached ? 'yes' : 'no'}, history ${history.length}, facts ${facts.length}, tools ${toolCalls}, applied ${applied.length}, saved ${factsToSave.length}, grill ${grillState ?? 'none'}, in ${inChars} chars, out ${outChars} chars, ${Date.now() - started} ms`,
	)
	return {
		ok: true,
		messages: rows.map(toJson),
		body,
		hash,
		changed,
		grill: grillState,
	}
}

/**
 * The row that closes a grill turn (R3, R4). end_grill wins. Else the
 * model's text is the ending when it says so, and the next question
 * otherwise (she can answer or say skip). No text ends the grill with
 * what this turn changed. At the cap a further question becomes the
 * ending. Null: the model failed mid-turn with nothing to store.
 */
function grillClosing({
	ended,
	finalText,
	failed,
	asked,
	applied,
}: {
	ended: EndGrillArgs | null
	finalText: string
	failed: boolean
	asked: number
	applied: AppliedChange[]
}): { text: string; marker: GrillMarker } | null {
	const turnSummary = applied.length
		? applied.map(c => c.text).join(' ')
		: CHAT_COPY.grillNothingChanged
	const done = (text: string) => ({ text, marker: GRILL_ROW_MARKERS.done })
	if (ended) return done(CHAT_COPY.grillDone(ended.summary))
	if (!finalText) return failed ? null : done(CHAT_COPY.grillDone(turnSummary))
	if (saysGrillDone(finalText) && !looksLikeQuestion(finalText)) {
		return done(finalText)
	}
	if (asked >= ARTICLE_CHAT_GRILL_MAX_QUESTIONS) {
		return done(CHAT_COPY.grillDone(turnSummary))
	}
	return { text: finalText, marker: GRILL_ROW_MARKERS.question }
}

type ToolContext = {
	links: ArticleLink[]
	images: ImageRow[]
	quoted: boolean
	namesPicture: boolean
	/** The two grill tools answer only on a grill turn. */
	grill: boolean
}

const BAD_ARGUMENTS: ToolResultJson = { ok: false, reason: 'bad_arguments' }

/**
 * Apply one tool call to the working copy. `next` and `change` are set
 * only when the call was applied; `fact` and `end` carry the two grill
 * tools' arguments; `result` is what the model reads.
 */
function applyToolCall(
	call: ToolCall,
	working: string,
	context: ToolContext,
): {
	result: ToolResultJson
	next?: string
	change?: AppliedChange
	fact?: SaveFactArgs
	end?: EndGrillArgs
} {
	let args: unknown
	try {
		args = JSON.parse(call.function.arguments || '{}')
	} catch {
		return { result: BAD_ARGUMENTS }
	}
	const guard = (next: string): ToolResultJson =>
		guardChange({
			before: working,
			after: next,
			links: context.links,
			quoted: context.quoted,
			namesPicture: context.namesPicture,
		})

	switch (call.function.name) {
		case 'replace_text': {
			const parsed = ReplaceTextArgsSchema.safeParse(args)
			if (!parsed.success) return { result: BAD_ARGUMENTS }
			const outcome = applyReplaceText(working, parsed.data)
			if (!outcome.ok) return { result: outcome }
			const checked = guard(outcome.markdown)
			if (!checked.ok) return { result: checked }
			return {
				result: { ok: true },
				next: outcome.markdown,
				change: {
					toolName: 'replace_text',
					text: parsed.data.summary,
					imageId: null,
				},
			}
		}
		case 'rewrite_article': {
			const parsed = RewriteArticleArgsSchema.safeParse(args)
			if (!parsed.success) return { result: BAD_ARGUMENTS }
			const outcome = applyRewrite(working, parsed.data)
			const checked = guard(outcome.markdown)
			if (!checked.ok) return { result: checked }
			return {
				result: { ok: true },
				next: outcome.markdown,
				change: {
					toolName: 'rewrite_article',
					text: parsed.data.summary,
					imageId: null,
				},
			}
		}
		case 'replace_picture': {
			const parsed = ReplacePictureArgsSchema.safeParse(args)
			if (!parsed.success) return { result: BAD_ARGUMENTS }
			const image = context.images.find(im => im.id === parsed.data.image_id)
			if (!image) return { result: { ok: false, reason: 'unknown_image' } }
			const outcome = applyPictureReplacement(
				working,
				parsed.data.picture_number,
				image.fileName,
				parsed.data.alt,
			)
			if (!outcome.ok) return { result: outcome }
			return {
				result: { ok: true },
				next: outcome.markdown,
				change: {
					toolName: 'replace_picture',
					text: CHAT_COPY.pictureChanged(parsed.data.picture_number),
					imageId: image.id,
				},
			}
		}
		case 'save_fact': {
			if (!context.grill) return { result: BAD_ARGUMENTS }
			const parsed = SaveFactArgsSchema.safeParse(args)
			if (!parsed.success) return { result: BAD_ARGUMENTS }
			return { result: { ok: true }, fact: parsed.data }
		}
		case 'end_grill': {
			if (!context.grill) return { result: BAD_ARGUMENTS }
			const parsed = EndGrillArgsSchema.safeParse(args)
			if (!parsed.success) return { result: BAD_ARGUMENTS }
			return { result: { ok: true }, end: parsed.data }
		}
		default:
			return { result: BAD_ARGUMENTS }
	}
}
