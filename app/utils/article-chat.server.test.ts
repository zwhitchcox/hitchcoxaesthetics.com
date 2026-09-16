import { describe, expect, test, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import {
	loadChatHistory,
	loadGrillState,
	runArticleChatTurn,
} from '#app/utils/article-chat.server.ts'
import { CHAT_COPY } from '#app/utils/article-chat.ts'
import { hashBody } from '#app/utils/articles.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * The tool loop and the save agree (spec phase 3, section 7). A scripted
 * fetch stands in for OpenRouter; the per-worker test DB holds the rows.
 */

const BODY = [
	'# Botox for TMJ',
	'',
	'![a jaw](images/image-1.png)',
	'*A jaw, at rest.*',
	'',
	'Most patients need 20 units per side. Results last about 3 months.',
	'',
	'Sarah Hitchcox, RN, treats jaw pain at Sarah Hitchcox Aesthetics in Bearden.',
	'',
	'Book at [Botox Knox](https://botoxknox.com/) or read more on [our site](https://hitchcoxaesthetics.com/).',
	'',
].join('\n')

const LINKS_JSON = JSON.stringify([
	{ name: 'Botox Knox', url: 'https://botoxknox.com/' },
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com/' },
])

const CONFIG = { apiKey: 'test-key', model: 'test/model' }
const NOW = new Date('2026-09-16T12:00:00.000Z')

let seeded = 0
async function seed(over: Record<string, unknown> = {}) {
	seeded++
	return prisma.article.create({
		data: {
			kind: 'guest',
			sourceKey: `t:chat:${seeded}`,
			title: 'Botox for TMJ',
			publication: 'healthcareguys.com',
			body: BODY,
			bodyOriginal: BODY,
			bodyHash: hashBody(BODY),
			linksJson: LINKS_JSON,
			...over,
		},
		select: { id: true },
	})
}

type Reply = { choices: Array<{ message: Record<string, unknown> }> }
type Call = { name: string; args: Record<string, unknown> }
type Step =
	| Reply
	| { status: number }
	| 'hang'
	| 'throw'
	| ((request: Record<string, unknown>) => Promise<Reply>)

function textReply(content: string | null): Reply {
	return { choices: [{ message: { role: 'assistant', content } }] }
}

function toolReply(calls: Call[], content: string | null = null): Reply {
	return {
		choices: [
			{
				message: {
					role: 'assistant',
					content,
					tool_calls: calls.map((c, i) => ({
						id: `call_${Date.now()}_${i}`,
						type: 'function',
						function: { name: c.name, arguments: JSON.stringify(c.args) },
					})),
				},
			},
		],
	}
}

const replaceText = (
	find: string,
	replace: string,
	summary = `Replaced ${find}.`,
): Call => ({
	name: 'replace_text',
	args: { find, replace, summary },
})

/** A fetch that answers the scripted steps in order and records each request body. */
function script(steps: Step[]) {
	const requests: Array<Record<string, unknown>> = []
	const fetchImpl = vi.fn(
		async (_url: string | URL | Request, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body)) as Record<string, unknown>
			requests.push(request)
			const step = steps.shift()
			if (step === undefined) throw new Error('no scripted reply left')
			if (step === 'throw') throw new TypeError('offline')
			if (step === 'hang') {
				return new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener('abort', () =>
						reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
					)
				})
			}
			if (typeof step === 'function') return jsonResponse(await step(request))
			if ('status' in step)
				return new Response('{"error":"x"}', { status: step.status })
			return jsonResponse(step)
		},
	)
	return { fetchImpl: fetchImpl as unknown as typeof fetch, requests }
}

function jsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

function turn(
	articleId: string,
	steps: Step[],
	over: Partial<Parameters<typeof runArticleChatTurn>[0]> = {},
) {
	const { fetchImpl, requests } = script(steps)
	const result = runArticleChatTurn({
		articleId,
		userId: 'u1',
		text: 'Say 15 to 25 units instead of 20 units.',
		baseHash: hashBody(BODY),
		config: CONFIG,
		fetchImpl,
		now: NOW,
		...over,
	})
	return { result, requests, fetchImpl }
}

async function rowsOf(articleId: string) {
	return prisma.articleChatMessage.findMany({
		where: { articleId },
		orderBy: { createdAt: 'asc' },
	})
}

async function eventsOf(articleId: string) {
	const events = await prisma.articleReviewEvent.findMany({
		where: { articleId },
		select: { kind: true, note: true },
	})
	return events.sort((a, b) => a.kind.localeCompare(b.kind))
}

/** The messages of the n-th request the model got. */
function messagesOf(request: Record<string, unknown>) {
	return request.messages as Array<Record<string, unknown>>
}

describe('runArticleChatTurn', () => {
	test('an answer with no tool: one assistant row, nothing saved', async () => {
		const { id } = await seed()
		const { result, requests } = turn(
			id,
			[textReply('Yes. 20 units per side is a common starting dose.')],
			{ text: 'Is 20 units the usual dose?' },
		)
		const out = await result
		expect(out).toMatchObject({
			ok: true,
			changed: false,
			body: BODY,
			hash: hashBody(BODY),
		})
		if (!out.ok) return
		expect(out.messages.map(m => m.role)).toEqual(['user', 'assistant'])
		expect(out.messages[1]?.text).toBe(
			'Yes. 20 units per side is a common starting dose.',
		)
		expect(await rowsOf(id)).toHaveLength(2)
		expect(await eventsOf(id)).toEqual([])
		const article = await prisma.article.findUniqueOrThrow({ where: { id } })
		expect(article.body).toBe(BODY)
		expect(article.editedAt).toBeNull()

		expect(requests).toHaveLength(1)
		const request = requests[0]!
		expect(request.model).toBe('test/model')
		expect(request.tool_choice).toBe('auto')
		expect((request.tools as unknown[]).length).toBe(3)
		const messages = messagesOf(request)
		expect(messages[0]?.role).toBe('system')
		expect(String(messages[0]?.content)).toContain(
			`ARTIFACT (markdown):\n${BODY}`,
		)
		expect(String(messages[0]?.content)).toContain(
			'Botox Knox: https://botoxknox.com/',
		)
		expect(String(messages[0]?.content)).toContain(
			'1. a jaw (images/image-1.png)',
		)
		expect(messages.at(-1)).toEqual({
			role: 'user',
			content: 'Is 20 units the usual dose?',
		})
	})

	test('replace_text ok: a change row, the events, the new body and hash', async () => {
		const { id } = await seed()
		const { result, requests } = turn(id, [
			toolReply([
				replaceText('20 units', '15 to 25 units', 'Said 15 to 25 units.'),
			]),
			textReply(''),
		])
		const out = await result
		expect(out.ok).toBe(true)
		if (!out.ok) return
		const expected = BODY.replace('20 units', '15 to 25 units')
		expect(out).toMatchObject({
			changed: true,
			body: expected,
			hash: hashBody(expected),
		})
		expect(out.messages.map(m => m.role)).toEqual(['user', 'change'])
		expect(out.messages[1]).toMatchObject({
			toolName: 'replace_text',
			text: 'Said 15 to 25 units.',
			imageId: null,
		})
		const article = await prisma.article.findUniqueOrThrow({ where: { id } })
		expect(article.body).toBe(expected)
		expect(article.editedBy).toBe('admin')
		expect(await eventsOf(id)).toEqual([
			{ kind: 'ai_edit', note: 'Said 15 to 25 units.' },
			{ kind: 'saved', note: 'ai' },
		])
		// the second call carries the tool call and its result
		const second = messagesOf(requests[1]!)
		expect(second.at(-2)?.role).toBe('assistant')
		expect(Array.isArray(second.at(-2)?.tool_calls)).toBe(true)
		expect(second.at(-1)).toMatchObject({
			role: 'tool',
			content: '{"ok":true}',
		})
	})

	test('ambiguous, then ok on the second call', async () => {
		const { id } = await seed()
		const { result, requests } = turn(id, [
			// 'Sarah Hitchcox' is in the body twice (the RN line and the clinic name)
			toolReply([replaceText('Sarah Hitchcox', 'the nurse')]),
			toolReply([
				replaceText('about 3 months', 'about 4 months', 'Said 4 months.'),
			]),
			textReply('Done.'),
		])
		const out = await result
		expect(out.ok).toBe(true)
		if (!out.ok) return
		expect(out.messages.map(m => m.role)).toEqual([
			'user',
			'change',
			'assistant',
		])
		expect(out.messages[2]?.text).toBe('Done.')
		expect(out.body).toContain('about 4 months')
		expect(out.body).toContain('Sarah Hitchcox Aesthetics in Bearden')
		expect(
			JSON.parse(String(messagesOf(requests[1]!).at(-1)?.content)),
		).toEqual({
			ok: false,
			reason: 'ambiguous',
			count: 2,
		})
		expect(requests).toHaveLength(3)
	})

	test('not_found twice, then the sentence: no change row', async () => {
		const { id } = await seed()
		const { result, requests } = turn(id, [
			toolReply([replaceText('Dysport', 'x')]),
			toolReply([replaceText('Xeomin', 'x')]),
			textReply('I could not find that sentence.'),
		])
		const out = await result
		expect(out.ok).toBe(true)
		if (!out.ok) return
		expect(out.changed).toBe(false)
		expect(out.messages.map(m => m.role)).toEqual(['user', 'assistant'])
		expect(out.messages[1]?.text).toBe('I could not find that sentence.')
		expect(await eventsOf(id)).toEqual([])
		expect(requests).toHaveLength(3)
		expect(
			JSON.parse(String(messagesOf(requests[2]!).at(-1)?.content)),
		).toEqual({
			ok: false,
			reason: 'not_found',
		})
	})

	test('the picture guard refuses when no picture is named, and the fallback row lands', async () => {
		const { id } = await seed()
		const { result, requests } = turn(
			id,
			[
				toolReply([
					replaceText(
						'![a jaw](images/image-1.png)\n*A jaw, at rest.*\n\n',
						'',
					),
				]),
				textReply(null),
			],
			{ text: 'Shorter at the top.' },
		)
		const out = await result
		expect(out.ok).toBe(true)
		if (!out.ok) return
		expect(out.changed).toBe(false)
		expect(out.body).toBe(BODY)
		expect(
			JSON.parse(String(messagesOf(requests[1]!).at(-1)?.content)),
		).toEqual({
			ok: false,
			reason: 'picture_lines_changed',
		})
		expect(out.messages.map(m => m.role)).toEqual(['user', 'assistant'])
		expect(out.messages[1]?.text).toBe(CHAT_COPY.fallback)
	})

	test('the picture lines may change when her words name a picture', async () => {
		const { id } = await seed()
		const { result } = turn(
			id,
			[
				toolReply([
					replaceText(
						'![a jaw](images/image-1.png)\n*A jaw, at rest.*\n\n',
						'',
						'Took the picture out.',
					),
				]),
				textReply(null),
			],
			{ text: 'Take the picture out.' },
		)
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: true })
		if (out.ok) expect(out.body).not.toContain('image-1.png')
	})

	test('the link guard refuses a dropped link with its url', async () => {
		const { id } = await seed()
		const { result, requests } = turn(id, [
			toolReply([
				replaceText('[Botox Knox](https://botoxknox.com/)', 'Botox Knox'),
			]),
			textReply('I kept the link.'),
		])
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: false, body: BODY })
		expect(
			JSON.parse(String(messagesOf(requests[1]!).at(-1)?.content)),
		).toEqual({
			ok: false,
			reason: 'link_removed',
			url: 'https://botoxknox.com/',
		})
	})

	test('replace_picture with a stored picture she sent', async () => {
		const { id } = await seed()
		const image = await prisma.articleImage.create({
			data: {
				articleId: id,
				fileName: 'user-abc123.jpg',
				contentType: 'image/jpeg',
				blob: Buffer.from([0xff, 0xd8, 0xff]),
				position: 1,
				width: 800,
				height: 600,
			},
			select: { id: true },
		})
		const { result, requests } = turn(
			id,
			[
				toolReply([
					{
						name: 'replace_picture',
						args: {
							picture_number: 1,
							image_id: image.id,
							alt: '',
							summary: 'Swapped the first picture.',
						},
					},
				]),
				textReply(null),
			],
			{ text: 'Use this instead of the first picture.', imageId: image.id },
		)
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: true })
		if (!out.ok) return
		expect(out.body).toContain(
			'![a jaw](images/user-abc123.jpg)\n*A jaw, at rest.*',
		)
		expect(out.messages[0]).toMatchObject({
			role: 'user',
			imageId: image.id,
			imageUrl: `/resources/article-images/${image.id}`,
		})
		expect(out.messages[1]).toMatchObject({
			role: 'change',
			toolName: 'replace_picture',
			imageId: image.id,
			text: 'picture 1 is now the one you sent.',
		})
		expect(String(messagesOf(requests[0]!).at(-1)?.content)).toContain(
			`ATTACHED PICTURE: id ${image.id}, 800x600 px.`,
		)
		expect(await eventsOf(id)).toEqual([
			{ kind: 'ai_edit', note: 'picture 1 is now the one you sent.' },
			{ kind: 'saved', note: 'ai' },
		])
	})

	test('a picture that is not on the article is refused before any call', async () => {
		const { id } = await seed()
		const { result, fetchImpl } = turn(id, [], { imageId: 'nope' })
		expect(await result).toEqual({ ok: false, kind: 'unknown_image' })
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(await rowsOf(id)).toHaveLength(0)
	})

	test('the 4-call cap stops the loop and refuses the fifth call', async () => {
		const { id } = await seed()
		const { result, requests } = turn(id, [
			toolReply([
				replaceText('20 units', '15 units'),
				replaceText('3 months', '4 months'),
			]),
			toolReply([
				replaceText('Bearden', 'Farragut'),
				replaceText('jaw pain', 'TMJ pain'),
				replaceText('Botox for TMJ', 'Botox for jaw pain'),
			]),
			textReply('never called'),
		])
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: true })
		if (!out.ok) return
		expect(requests).toHaveLength(2)
		expect(out.messages.filter(m => m.role === 'change')).toHaveLength(4)
		expect(out.messages.some(m => m.role === 'assistant')).toBe(false)
		expect(out.body).toContain('# Botox for TMJ')
		expect(out.body).toContain('TMJ pain')
		expect(out.body).toContain('Farragut')
	})

	test('the cap with nothing applied and no text stores the fallback line', async () => {
		const { id } = await seed()
		const miss = () => [replaceText('Dysport', 'x'), replaceText('Xeomin', 'x')]
		const { result, requests } = turn(id, [
			toolReply(miss()),
			toolReply(miss()),
		])
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: false })
		if (!out.ok) return
		expect(requests).toHaveLength(2)
		expect(out.messages.map(m => m.role)).toEqual(['user', 'assistant'])
		expect(out.messages[1]?.text).toBe(CHAT_COPY.fallback)
	})

	test('the deadline with no reply: timeout, only the user row', async () => {
		const { id } = await seed()
		const { result } = turn(id, ['hang'], { timeoutMs: 1500 })
		expect(await result).toEqual({ ok: false, kind: 'timeout' })
		const rows = await rowsOf(id)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			role: 'user',
			text: 'Say 15 to 25 units instead of 20 units.',
		})
	})

	test('a base hash that is not the stored text: changed, before any call', async () => {
		const { id } = await seed()
		const { result, fetchImpl } = turn(id, [], { baseHash: 'b'.repeat(64) })
		expect(await result).toEqual({
			ok: false,
			kind: 'changed',
			body: BODY,
			hash: hashBody(BODY),
		})
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(await rowsOf(id)).toHaveLength(0)
	})

	test('a decided article: decided, before any call', async () => {
		const { id } = await seed({ status: 'approved' })
		const { result, fetchImpl } = turn(id, [])
		expect(await result).toEqual({ ok: false, kind: 'decided' })
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	test('a missing article, and a missing key', async () => {
		expect(await turn('nope', []).result).toEqual({
			ok: false,
			kind: 'missing',
		})
		const { id } = await seed()
		expect(await turn(id, [], { config: null }).result).toEqual({
			ok: false,
			kind: 'not_configured',
		})
		expect(await rowsOf(id)).toHaveLength(0)
	})

	test('a throwing fetch and an HTTP error keep the user row', async () => {
		consoleError.mockImplementation(() => {})
		const { id } = await seed()
		expect(await turn(id, ['throw']).result).toEqual({
			ok: false,
			kind: 'no_answer',
		})
		expect(await rowsOf(id)).toHaveLength(1)
		const { id: other } = await seed()
		expect(await turn(other, [{ status: 500 }]).result).toEqual({
			ok: false,
			kind: 'no_answer',
			status: 500,
		})
		expect(await rowsOf(other)).toHaveLength(1)
		expect(consoleError).toHaveBeenCalledTimes(2)
	})

	test('a writer push during the turn: changed, her row stays, no change row', async () => {
		const { id } = await seed()
		const pushed = BODY.replace('3 months', '4 months')
		const { result } = turn(id, [
			async () => {
				await prisma.article.update({ where: { id }, data: { body: pushed } })
				return toolReply([replaceText('20 units', '15 units')])
			},
			textReply(null),
		])
		expect(await result).toEqual({
			ok: false,
			kind: 'changed',
			body: pushed,
			hash: hashBody(pushed),
		})
		const rows = await rowsOf(id)
		expect(rows.map(r => r.role)).toEqual(['user'])
		expect(await eventsOf(id)).toEqual([])
	})

	test('the stored rows go to the model on the next turn, oldest first', async () => {
		const { id } = await seed()
		await turn(id, [textReply('It is a common dose.')], {
			text: 'Is 20 units usual?',
		}).result
		const { result, requests } = turn(id, [textReply('Sure.')], {
			text: 'Thanks. And 3 months?',
		})
		expect(await result).toMatchObject({ ok: true })
		const messages = messagesOf(requests[0]!)
		expect(messages.map(m => m.role)).toEqual([
			'system',
			'user',
			'assistant',
			'user',
		])
		expect(messages[1]?.content).toBe('Is 20 units usual?')
		expect(messages[2]?.content).toBe('It is a common dose.')
		expect(messages[3]?.content).toBe('Thanks. And 3 months?')
	})
})

describe('loadChatHistory', () => {
	test('answers oldest first with the picture url', async () => {
		const { id } = await seed()
		const at = (s: number) => new Date(NOW.getTime() + s * 1000)
		await prisma.articleChatMessage.createMany({
			data: [
				{ articleId: id, role: 'assistant', text: 'second', createdAt: at(2) },
				{
					articleId: id,
					role: 'user',
					text: 'first',
					imageId: 'img1',
					createdAt: at(1),
				},
				{
					articleId: id,
					role: 'change',
					text: 'third',
					toolName: 'replace_text',
					createdAt: at(3),
				},
			],
		})
		const history = await loadChatHistory(id)
		expect(history.map(m => m.text)).toEqual(['first', 'second', 'third'])
		expect(history[0]).toMatchObject({
			role: 'user',
			imageId: 'img1',
			imageUrl: '/resources/article-images/img1',
			createdAt: at(1).toISOString(),
		})
		expect(history[2]).toMatchObject({
			role: 'change',
			toolName: 'replace_text',
			imageUrl: null,
		})
		expect(await loadChatHistory(id, 2)).toHaveLength(2)
		expect((await loadChatHistory(id, 2))[0]?.text).toBe('second')
	})
})

describe('the grill (phase 5)', () => {
	// normalises to "units side use", like the reworded asking below
	const Q1 = 'Q1: How many units per side do you use?'
	const saveFact = (
		question: string,
		answer: string,
		fact: string,
		tags: string | string[] = 'botox, pricing',
	): Call => ({ name: 'save_fact', args: { question, answer, fact, tags } })
	const endGrill = (summary: string): Call => ({
		name: 'end_grill',
		args: { summary },
	})
	const toolNames = (request: Record<string, unknown>) =>
		(request.tools as Array<{ function: { name: string } }>).map(
			t => t.function.name,
		)
	const markers = (out: Awaited<ReturnType<typeof runArticleChatTurn>>) =>
		out.ok ? out.messages.map(m => [m.role, m.toolName]) : out

	async function start(id: string, question = Q1) {
		const out = await turn(id, [textReply(question)], {
			text: '',
			mode: 'grill',
		}).result
		expect(out).toMatchObject({ ok: true, grill: 'active' })
		return out
	}

	test('grill start: the first question is a grill_question row and no user row', async () => {
		const { id } = await seed()
		const { result, requests } = turn(id, [textReply(Q1)], {
			text: '',
			mode: 'grill',
		})
		const out = await result
		expect(out).toMatchObject({
			ok: true,
			changed: false,
			body: BODY,
			grill: 'active',
		})
		expect(markers(out)).toEqual([['assistant', 'grill_question']])
		const rows = await rowsOf(id)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			role: 'assistant',
			text: Q1,
			toolName: 'grill_question',
		})
		expect(await loadGrillState(id)).toEqual({ active: true, asked: 1 })

		expect(requests).toHaveLength(1)
		const request = requests[0]!
		expect(toolNames(request)).toEqual([
			'replace_text',
			'rewrite_article',
			'replace_picture',
			'save_fact',
			'end_grill',
		])
		const messages = messagesOf(request)
		const system = String(messages[0]?.content)
		expect(system).toContain('GRILL MODE.')
		expect(system).toContain('Asked so far: 0 of 6.')
		expect(system).toContain('This is the start')
		expect(system).toContain('WHAT SARAH HAS ALREADY TOLD US:\n(nothing yet)')
		expect(messages.at(-1)).toEqual({
			role: 'user',
			content: CHAT_COPY.grillStart,
		})
	})

	test('an answer turn: the edit, save_fact and the next question; the same question twice makes one bank row', async () => {
		const { id } = await seed()
		await start(id)
		const { result, requests } = turn(
			id,
			[
				toolReply([
					replaceText('20 units', '15 to 25 units', 'Said 15 to 25 units.'),
					saveFact(
						Q1,
						'15 to 25, it depends on the jaw',
						'Sarah uses 15 to 25 units per side for TMJ.',
					),
				]),
				textReply('Q2: How long do your patients say it lasts?'),
			],
			{ text: '15 to 25, it depends on the jaw' },
		)
		const first = await result
		expect(first).toMatchObject({ ok: true, changed: true, grill: 'active' })
		if (!first.ok) return
		expect(markers(first)).toEqual([
			['user', null],
			['change', 'replace_text'],
			['assistant', 'grill_question'],
		])
		expect(first.body).toContain('15 to 25 units')
		expect(first.messages[2]?.text).toBe(
			'Q2: How long do your patients say it lasts?',
		)
		expect(await loadGrillState(id)).toEqual({ active: true, asked: 2 })

		// the answer turn carried the grill rules, the count, and the history
		// opened with "Grill me." then the question
		const messages = messagesOf(requests[0]!)
		expect(String(messages[0]?.content)).toContain('Asked so far: 1 of 6.')
		expect(String(messages[0]?.content)).not.toContain('This is the start')
		expect(messages.slice(1, 4)).toEqual([
			{ role: 'user', content: CHAT_COPY.grillStart },
			{ role: 'assistant', content: Q1 },
			{ role: 'user', content: '15 to 25, it depends on the jaw' },
		])
		expect(
			JSON.parse(String(messagesOf(requests[1]!).at(-1)?.content)),
		).toEqual({ ok: true })

		const facts = await prisma.reviewFact.findMany()
		expect(facts).toHaveLength(1)
		expect(facts[0]).toMatchObject({
			source: 'grill',
			question: Q1,
			answer: '15 to 25, it depends on the jaw',
			fact: 'Sarah uses 15 to 25 units per side for TMJ.',
			tags: 'botox, pricing',
			articleId: id,
			userId: 'u1',
			retiredAt: null,
		})

		// the same question, worded again: the row is updated, not doubled;
		// end_grill closes the grill with its summary
		const second = await turn(
			id,
			[
				toolReply([
					saveFact(
						'Units per side: how many do you use?',
						'about 20',
						'Sarah uses about 20 units per side for TMJ.',
						['Botox', 'dose'],
					),
					endGrill('The unit count is now hers.'),
				]),
				textReply(''),
			],
			{ text: 'about 20', baseHash: hashBody(first.body) },
		).result
		expect(second).toMatchObject({ ok: true, changed: false, grill: 'done' })
		expect(markers(second)).toEqual([
			['user', null],
			['assistant', 'grill_done'],
		])
		if (second.ok) {
			expect(second.messages[1]?.text).toBe(
				'Done. Here is what changed: The unit count is now hers.',
			)
		}
		const after = await prisma.reviewFact.findMany()
		expect(after).toHaveLength(1)
		expect(after[0]).toMatchObject({
			id: facts[0]!.id,
			question: 'Units per side: how many do you use?',
			fact: 'Sarah uses about 20 units per side for TMJ.',
			tags: 'botox, dose',
		})
		expect(await loadGrillState(id)).toEqual({ active: false, asked: 0 })
	})

	test('a bare "stop" ends the grill with no model call', async () => {
		const { id } = await seed()
		await start(id)
		const { result, fetchImpl } = turn(id, [], { text: "That's all." })
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: false, grill: 'done' })
		expect(markers(out)).toEqual([
			['user', null],
			['assistant', 'grill_done'],
		])
		if (out.ok) expect(out.messages[1]?.text).toBe(CHAT_COPY.grillStopped)
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(await loadGrillState(id)).toEqual({ active: false, asked: 0 })
		expect(await prisma.reviewFact.count()).toBe(0)
	})

	test('grill_stop writes Stopped. once; Grill me while a grill runs is grill_active', async () => {
		const { id } = await seed()
		expect(await turn(id, [], { text: '', mode: 'grill_stop' }).result).toEqual(
			{
				ok: true,
				messages: [],
				body: BODY,
				hash: hashBody(BODY),
				changed: false,
				grill: null,
			},
		)
		await start(id)
		const { result, fetchImpl } = turn(id, [], { text: '', mode: 'grill' })
		expect(await result).toEqual({ ok: false, kind: 'grill_active' })
		expect(fetchImpl).not.toHaveBeenCalled()
		const stopped = await turn(id, [], { text: '', mode: 'grill_stop' }).result
		expect(stopped).toMatchObject({ ok: true, grill: 'done' })
		expect(markers(stopped)).toEqual([['assistant', 'grill_done']])
		// a stop needs no key
		expect(
			await turn(id, [], { text: '', mode: 'grill_stop', config: null }).result,
		).toMatchObject({ ok: true, messages: [], grill: null })
		expect((await rowsOf(id)).map(r => r.toolName)).toEqual([
			'grill_question',
			'grill_done',
		])
	})

	test('an ordinary turn reads the bank in its prompt and cannot save a fact', async () => {
		const { id } = await seed()
		await prisma.reviewFact.create({
			data: {
				source: 'docs',
				key: 'pricing.md:1',
				fact: 'Sarah charges $12 per unit of Botox.',
				tags: 'botox, pricing',
				question: 'What do you charge per unit?',
			},
		})
		const { result, requests } = turn(
			id,
			[
				toolReply([saveFact('x', 'y', 'z')]),
				textReply('We charge $12 per unit.'),
			],
			{ text: 'What do we charge?' },
		)
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: false, grill: null })
		expect(markers(out)).toEqual([
			['user', null],
			['assistant', null],
		])
		const request = requests[0]!
		expect(toolNames(request)).toHaveLength(3)
		const system = String(messagesOf(request)[0]?.content)
		expect(system).not.toContain('GRILL MODE.')
		expect(system).toContain(
			'WHAT SARAH HAS ALREADY TOLD US:\n- [botox, pricing] Sarah charges $12 per unit of Botox. (asked: "What do you charge per unit?")\n',
		)
		expect(
			JSON.parse(String(messagesOf(requests[1]!).at(-1)?.content)),
		).toEqual({ ok: false, reason: 'bad_arguments' })
		expect(await prisma.reviewFact.count()).toBe(1)
	})

	test('no text and no end_grill: the grill ends with what this turn changed', async () => {
		const { id } = await seed()
		await start(id)
		const out = await turn(
			id,
			[
				toolReply([replaceText('3 months', '4 months', 'Said 4 months.')]),
				textReply(null),
			],
			{ text: 'four months' },
		).result
		expect(out).toMatchObject({ ok: true, changed: true, grill: 'done' })
		expect(markers(out)).toEqual([
			['user', null],
			['change', 'replace_text'],
			['assistant', 'grill_done'],
		])
		if (out.ok) {
			expect(out.messages[2]?.text).toBe(
				'Done. Here is what changed: Said 4 months.',
			)
		}
	})

	test('at the cap a further question becomes the ending', async () => {
		const { id } = await seed()
		const at = (s: number) => new Date(NOW.getTime() + s * 1000)
		await prisma.articleChatMessage.createMany({
			data: Array.from({ length: 6 }, (_, i) => ({
				articleId: id,
				role: 'assistant',
				text: `Q${i + 1}: something?`,
				toolName: 'grill_question',
				createdAt: at(i),
			})),
		})
		expect(await loadGrillState(id)).toEqual({ active: true, asked: 6 })
		const { result, requests } = turn(id, [textReply('Q7: one more?')], {
			text: 'skip',
			now: at(10),
		})
		const out = await result
		expect(out).toMatchObject({ ok: true, grill: 'done' })
		expect(markers(out)).toEqual([
			['user', null],
			['assistant', 'grill_done'],
		])
		if (out.ok) {
			expect(out.messages[1]?.text).toBe(
				`Done. Here is what changed: ${CHAT_COPY.grillNothingChanged}`,
			)
		}
		expect(String(messagesOf(requests[0]!)[0]?.content)).toContain(
			'That was the last answer',
		)
	})

	test('a grill turn may make six tool calls; the seventh is refused', async () => {
		const { id } = await seed()
		await start(id)
		const { result, requests } = turn(
			id,
			[
				toolReply([
					replaceText('20 units', '15 units'),
					replaceText('3 months', '4 months'),
					replaceText('Bearden', 'Farragut'),
					replaceText('jaw pain', 'TMJ pain'),
					saveFact(Q1, '15', 'Sarah uses 15 units per side.'),
					replaceText('Most patients', 'Many patients'),
					replaceText('at rest', 'resting'),
				]),
				textReply('never called'),
			],
			{ text: '15' },
		)
		const out = await result
		expect(out).toMatchObject({ ok: true, changed: true, grill: 'done' })
		expect(requests).toHaveLength(1)
		if (!out.ok) return
		expect(out.messages.filter(m => m.role === 'change')).toHaveLength(5)
		expect(out.body).toContain('at rest')
		expect(await prisma.reviewFact.count()).toBe(1)
	})
})
