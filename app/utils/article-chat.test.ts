import { describe, expect, test } from 'vitest'
import {
	ARTICLE_CHAT_GRILL_MAX_QUESTIONS,
	ARTICLE_CHAT_HISTORY_CHARS,
	ARTICLE_CHAT_HISTORY_ROWS,
	ARTICLE_CHAT_MAX_TEXT_CHARS,
	ArticleChatRequestSchema,
	CHAT_COPY,
	CHAT_TOOL_NAMES,
	CHAT_TOOLS,
	EndGrillArgsSchema,
	GRILL_RULES,
	GRILL_TOOL_NAMES,
	GRILL_TOOLS,
	ReplacePictureArgsSchema,
	ReplaceTextArgsSchema,
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
	summaryLine,
	turnNamesPicture,
	type ChatHistoryRow,
} from './article-chat.ts'
import { pictureList } from '#app/utils/article-images.ts'

const HASH = 'a'.repeat(64)

const ARTICLE = [
	'# Botox for TMJ',
	'',
	'![a jaw](images/image-1.png)',
	'*A jaw, at rest.*',
	'',
	'Most patients need 20 units per side. Results last about 3 months.',
	'',
	'Sarah Hitchcox, RN, treats jaw pain at *Sarah Hitchcox Aesthetics* in Bearden.',
	'',
	'Book at [Botox Knox](https://botoxknox.com/) or read more on [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com/).',
	'',
].join('\n')

const LINKS = [
	{ name: 'Botox Knox', url: 'https://botoxknox.com/' },
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com/' },
]

const IMAGES = [{ id: 'img1', fileName: 'image-1.png', position: 0 }]

describe('ArticleChatRequestSchema', () => {
	test('accepts words and trims them', () => {
		const parsed = ArticleChatRequestSchema.parse({
			articleId: 'a1',
			text: '  Say 15 units  ',
			baseHash: HASH,
		})
		expect(parsed.text).toBe('Say 15 units')
		expect(parsed.quote).toBeUndefined()
		expect(parsed.imageId).toBeUndefined()
	})

	test('refuses empty text with no picture and no quote', () => {
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				text: '  ',
				baseHash: HASH,
			}).success,
		).toBe(false)
		expect(
			ArticleChatRequestSchema.safeParse({ articleId: 'a1', baseHash: HASH })
				.success,
		).toBe(false)
	})

	test('accepts empty text with a picture or a quote', () => {
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				text: '',
				imageId: 'img1',
				baseHash: HASH,
			}).success,
		).toBe(true)
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				text: '',
				quote: '20 units per side',
				baseHash: HASH,
			}).success,
		).toBe(true)
	})

	test('bounds the text, the quote and the base hash', () => {
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				text: 'x'.repeat(ARTICLE_CHAT_MAX_TEXT_CHARS + 1),
				baseHash: HASH,
			}).success,
		).toBe(false)
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				text: 'ok',
				quote: 'ab',
				baseHash: HASH,
			}).success,
		).toBe(false)
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				text: 'ok',
				baseHash: 'short',
			}).success,
		).toBe(false)
	})
})

describe('CHAT_TOOLS', () => {
	test('has the three functions with their required arguments', () => {
		expect(CHAT_TOOLS.map(t => t.function.name)).toEqual([...CHAT_TOOL_NAMES])
		expect(CHAT_TOOLS.every(t => t.type === 'function')).toBe(true)
		const required = Object.fromEntries(
			CHAT_TOOLS.map(t => [
				t.function.name,
				[...t.function.parameters.required],
			]),
		)
		expect(required).toEqual({
			replace_text: ['find', 'replace', 'summary'],
			rewrite_article: ['markdown', 'summary'],
			replace_picture: ['picture_number', 'image_id', 'summary'],
		})
	})

	test('argument schemas cut a long summary and default the alt', () => {
		const parsed = ReplaceTextArgsSchema.parse({
			find: 'a',
			replace: '',
			summary: 'x'.repeat(400),
		})
		expect(parsed.summary).toHaveLength(300)
		expect(
			ReplacePictureArgsSchema.parse({
				picture_number: 1,
				image_id: 'i',
				summary: 's',
			}).alt,
		).toBe('')
		expect(
			ReplaceTextArgsSchema.safeParse({ find: '', replace: 'x', summary: 's' })
				.success,
		).toBe(false)
	})
})

describe('buildChatSystemPrompt', () => {
	test('carries the rules, the links, the pictures and the artifact last', () => {
		const prompt = buildChatSystemPrompt({
			links: LINKS,
			pictures: pictureList(ARTICLE, IMAGES),
			markdown: ARTICLE,
		})
		expect(
			prompt.startsWith('You help Sarah Hitchcox, RN, review an article'),
		).toBe(true)
		expect(prompt).toContain(
			'LINKS THAT MUST STAY:\nBotox Knox: https://botoxknox.com/\n',
		)
		expect(prompt).toContain(
			'PICTURES IN THE ARTICLE:\n1. a jaw (image-1.png)\n',
		)
		expect(prompt.endsWith(`ARTIFACT (markdown):\n${ARTICLE}`)).toBe(true)
		expect(prompt.indexOf('LINKS THAT MUST STAY')).toBeLessThan(
			prompt.indexOf('PICTURES IN THE ARTICLE'),
		)
	})

	test('says (none) for no links and no pictures', () => {
		const prompt = buildChatSystemPrompt({
			links: [],
			pictures: [],
			markdown: '# T',
		})
		expect(prompt).toContain('LINKS THAT MUST STAY:\n(none)')
		expect(prompt).toContain('PICTURES IN THE ARTICLE:\n(none)')
	})
})

describe('buildChatUserTurn', () => {
	test('words alone are the turn', () => {
		expect(
			buildChatUserTurn({ text: ' Say 15 units. ', markdown: ARTICLE }),
		).toBe('Say 15 units.')
	})

	test('puts the quote first with the source slice when it is found once', () => {
		const turn = buildChatUserTurn({
			text: 'Drop the office name.',
			quote: 'treats jaw pain at Sarah Hitchcox Aesthetics in Bearden',
			markdown: ARTICLE,
		})
		expect(
			turn.startsWith(
				'ABOUT THIS PASSAGE (as it reads on the page):\n"treats jaw pain',
			),
		).toBe(true)
		expect(turn).toContain(
			'IN THE SOURCE IT IS:\ntreats jaw pain at *Sarah Hitchcox Aesthetics* in Bearden',
		)
		expect(turn.endsWith('\n\nDrop the office name.')).toBe(true)
	})

	test('leaves the source slice out when the passage is there twice', () => {
		const turn = buildChatUserTurn({
			text: 'x',
			quote: 'Sarah Hitchcox Aesthetics',
			markdown: ARTICLE,
		})
		expect(turn).toContain('"Sarah Hitchcox Aesthetics"')
		expect(turn).not.toContain('IN THE SOURCE IT IS:')
	})

	test('names the attached picture and says (no words) for an empty text', () => {
		expect(
			buildChatUserTurn({
				text: '',
				markdown: ARTICLE,
				image: { id: 'img9', width: 800, height: 600 },
			}),
		).toBe('ATTACHED PICTURE: id img9, 800x600 px.\n\n(no words)')
		expect(
			buildChatUserTurn({
				text: 'use it',
				markdown: ARTICLE,
				image: { id: 'img9' },
			}),
		).toBe('ATTACHED PICTURE: id img9.\n\nuse it')
	})
})

describe('historyToMessages', () => {
	test('maps the three roles', () => {
		const rows: ChatHistoryRow[] = [
			{ role: 'user', text: 'Say 15 units.', quote: '20 units per side' },
			{ role: 'change', text: 'Said 15 units.' },
			{ role: 'assistant', text: 'Done.' },
			{ role: 'user', text: '', imageId: 'img1' },
		]
		expect(historyToMessages(rows)).toEqual([
			{
				role: 'user',
				content:
					'ABOUT THIS PASSAGE (as it reads on the page):\n"20 units per side"\n\nSay 15 units.',
			},
			{ role: 'assistant', content: 'Changed: said 15 units.' },
			{ role: 'assistant', content: 'Done.' },
			{ role: 'user', content: 'ATTACHED PICTURE: id img1.\n\n(no words)' },
		])
	})

	test('keeps the last 30 rows', () => {
		// her turns only: a window must open with one of hers
		const rows: ChatHistoryRow[] = Array.from({ length: 35 }, (_, i) => ({
			role: 'user',
			text: `row ${i}`,
		}))
		const out = historyToMessages(rows)
		expect(out).toHaveLength(ARTICLE_CHAT_HISTORY_ROWS)
		expect(out[0]?.content).toBe('row 5')
		expect(out.at(-1)?.content).toBe('row 34')
	})

	test('drops the oldest while the joined length passes the cap', () => {
		const rows: ChatHistoryRow[] = Array.from({ length: 6 }, (_, i) => ({
			role: 'user',
			text: String(i).repeat(5000),
		}))
		const out = historyToMessages(rows)
		expect(out.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(
			ARTICLE_CHAT_HISTORY_CHARS,
		)
		expect(out).toHaveLength(4)
		expect(out[0]?.content.startsWith('2')).toBe(true)
	})

	test('never opens with an answer to a lost turn', () => {
		const rows: ChatHistoryRow[] = [
			{ role: 'assistant', text: 'an old answer' },
			{ role: 'user', text: 'her turn' },
			{ role: 'assistant', text: 'its answer' },
		]
		expect(historyToMessages(rows).map(m => m.role)).toEqual([
			'user',
			'assistant',
		])
	})
})

describe('applyReplaceText', () => {
	test('replaces an exact substring that occurs once', () => {
		const out = applyReplaceText(ARTICLE, {
			find: '20 units',
			replace: '15 to 25 units',
		})
		expect(out).toMatchObject({ ok: true })
		if (out.ok) expect(out.markdown).toContain('need 15 to 25 units per side')
	})

	test('finds a folded passage across emphasis marks and curly quotes', () => {
		const out = applyReplaceText(ARTICLE, {
			find: 'treats jaw pain at Sarah Hitchcox Aesthetics in Bearden',
			replace: 'treats jaw pain in Bearden',
		})
		expect(out.ok).toBe(true)
		if (out.ok) {
			expect(out.markdown).toContain(
				'Sarah Hitchcox, RN, treats jaw pain in Bearden.',
			)
			expect(out.markdown).not.toContain('*Sarah Hitchcox Aesthetics*')
		}
		const curly = applyReplaceText('She said “yes” twice.', {
			find: 'said "yes"',
			replace: 'said no',
		})
		expect(curly).toEqual({ ok: true, markdown: 'She said no twice.' })
	})

	test('refuses an ambiguous find with the count', () => {
		expect(
			applyReplaceText(ARTICLE, {
				find: 'Sarah Hitchcox Aesthetics',
				replace: 'x',
			}),
		).toEqual({ ok: false, reason: 'ambiguous', count: 2 })
		expect(
			applyReplaceText('x *b* c and x  b c', { find: 'x b c', replace: 'y' }),
		).toEqual({
			ok: false,
			reason: 'ambiguous',
			count: 2,
		})
	})

	test('answers not_found', () => {
		expect(
			applyReplaceText(ARTICLE, { find: 'Dysport', replace: 'x' }),
		).toEqual({
			ok: false,
			reason: 'not_found',
		})
	})

	test('an empty replace deletes the passage and one of the spaces around it', () => {
		expect(
			applyReplaceText('one two three', { find: 'two', replace: '' }),
		).toEqual({
			ok: true,
			markdown: 'one three',
		})
		expect(applyReplaceText('a\n\nb\n\nc', { find: 'b', replace: '' })).toEqual(
			{
				ok: true,
				markdown: 'a\n\nc',
			},
		)
	})
})

describe('applyRewrite', () => {
	test('folds CRLF and keeps the final newline', () => {
		expect(applyRewrite('old\n', { markdown: 'new\r\nline' })).toEqual({
			ok: true,
			markdown: 'new\nline\n',
		})
		expect(applyRewrite('old', { markdown: 'new' })).toEqual({
			ok: true,
			markdown: 'new',
		})
	})
})

describe('guardChange', () => {
	const base = {
		before: ARTICLE,
		links: LINKS,
		quoted: false,
		namesPicture: false,
	}

	test('passes a small change', () => {
		expect(
			guardChange({ ...base, after: ARTICLE.replace('20 units', '15 units') }),
		).toEqual({
			ok: true,
		})
	})

	test('refuses moved picture lines unless the turn names a picture', () => {
		const after = ARTICLE.replace('![a jaw](images/image-1.png)\n', '')
		expect(guardChange({ ...base, after })).toEqual({
			ok: false,
			reason: 'picture_lines_changed',
		})
		expect(guardChange({ ...base, after, namesPicture: true })).toEqual({
			ok: true,
		})
	})

	test('refuses a dropped link with its url', () => {
		const after = ARTICLE.replace(
			'[Botox Knox](https://botoxknox.com/)',
			'Botox Knox',
		)
		expect(guardChange({ ...base, after })).toEqual({
			ok: false,
			reason: 'link_removed',
			url: 'https://botoxknox.com/',
		})
	})

	test('a link that was already missing does not count', () => {
		const before = ARTICLE.replace(
			'[Botox Knox](https://botoxknox.com/)',
			'Botox Knox',
		)
		expect(
			guardChange({
				...base,
				before,
				after: before.replace('20 units', '15 units'),
			}),
		).toEqual({ ok: true })
	})

	test('refuses a quoted turn that rewrites most paragraphs, but not a plain one', () => {
		// the links stay, so only the share of changed paragraphs is judged
		const after =
			'# Botox for TMJ\n\nAll new.\n\nAlso new.\n\nStill new.\n\n[Botox Knox](https://botoxknox.com/) [SHA](https://hitchcoxaesthetics.com/)\n'
		expect(
			guardChange({ ...base, after, namesPicture: true, quoted: true }),
		).toEqual({
			ok: false,
			reason: 'too_much_changed',
		})
		expect(
			guardChange({ ...base, after, namesPicture: true, quoted: false }),
		).toEqual({
			ok: true,
		})
	})

	test('the link guard runs before the share guard on a quoted turn', () => {
		const after = '# Botox for TMJ\n\nAll new.\n\nAlso new.\n\nStill new.\n'
		expect(
			guardChange({ ...base, after, namesPicture: true, quoted: true }),
		).toMatchObject({
			ok: false,
			reason: 'link_removed',
		})
	})
})

describe('turnNamesPicture and summaryLine', () => {
	test('a picture is named by words or by an attachment', () => {
		expect(turnNamesPicture('use this photo instead')).toBe(true)
		expect(turnNamesPicture('shorter')).toBe(false)
		expect(turnNamesPicture('shorter', 'img1')).toBe(true)
	})

	test('summaryLine lowers the first letter of a plain word only', () => {
		expect(summaryLine('Shortened the second paragraph.')).toBe(
			'Changed: shortened the second paragraph.',
		)
		expect(summaryLine('RN credentials kept.')).toBe(
			'Changed: RN credentials kept.',
		)
	})
})

describe('the grill (phase 5)', () => {
	const FACTS = [
		{
			source: 'grill',
			fact: 'Sarah uses 20 units per side.',
			tags: 'botox',
			question: 'Q1: How many units per side?',
			updatedAt: new Date('2026-09-16T12:00:00Z'),
		},
		{
			source: 'docs',
			fact: 'Sarah charges $12 per unit of Botox.',
			tags: 'botox, pricing',
			question: null,
			updatedAt: new Date('2026-09-10T12:00:00Z'),
		},
	]

	test('the request accepts a mode with no text and refuses an unknown one', () => {
		const parsed = ArticleChatRequestSchema.parse({
			articleId: 'a1',
			baseHash: HASH,
			mode: 'grill',
		})
		expect(parsed).toMatchObject({ text: '', mode: 'grill' })
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				baseHash: HASH,
				mode: 'grill_stop',
			}).success,
		).toBe(true)
		expect(
			ArticleChatRequestSchema.safeParse({
				articleId: 'a1',
				baseHash: HASH,
				mode: 'roast',
			}).success,
		).toBe(false)
	})

	test('the grill tools are the three plus save_fact and end_grill', () => {
		expect(GRILL_TOOLS.map(t => t.function.name)).toEqual([
			...CHAT_TOOL_NAMES,
			...GRILL_TOOL_NAMES,
		])
		const required = Object.fromEntries(
			GRILL_TOOLS.slice(3).map(t => [
				t.function.name,
				[...t.function.parameters.required],
			]),
		)
		expect(required).toEqual({
			save_fact: ['question', 'answer', 'fact'],
			end_grill: ['summary'],
		})
		expect(
			SaveFactArgsSchema.parse({
				question: 'q',
				answer: 'a',
				fact: 'f',
				tags: ['Botox', ' pricing ', 'botox'],
			}).tags,
		).toBe('botox, pricing')
		expect(
			SaveFactArgsSchema.parse({ question: 'q', answer: 'a', fact: 'f' }).tags,
		).toBe('')
		expect(
			SaveFactArgsSchema.safeParse({ question: '', answer: 'a', fact: 'f' })
				.success,
		).toBe(false)
		expect(
			EndGrillArgsSchema.parse({ summary: 'x'.repeat(400) }).summary,
		).toHaveLength(300)
	})

	test('the system prompt carries the bank on every turn and the grill rules on a grill turn', () => {
		const plain = buildChatSystemPrompt({
			links: LINKS,
			pictures: [],
			markdown: ARTICLE,
		})
		expect(plain).toContain('WHAT SARAH HAS ALREADY TOLD US:\n(nothing yet)\n')
		expect(plain).not.toContain('GRILL MODE.')
		expect(plain.endsWith(`ARTIFACT (markdown):\n${ARTICLE}`)).toBe(true)

		const withFacts = buildChatSystemPrompt({
			links: LINKS,
			pictures: [],
			markdown: ARTICLE,
			facts: FACTS,
		})
		// docs rows first, then the grill row with its question
		expect(withFacts).toContain(
			'WHAT SARAH HAS ALREADY TOLD US:\n- [botox, pricing] Sarah charges $12 per unit of Botox.\n- [botox] Sarah uses 20 units per side. (asked: "Q1: How many units per side?")\n',
		)
		expect(withFacts.indexOf('WHAT SARAH HAS ALREADY TOLD US')).toBeLessThan(
			withFacts.indexOf('ARTIFACT (markdown)'),
		)

		const grill = buildChatSystemPrompt({
			links: LINKS,
			pictures: [],
			markdown: ARTICLE,
			facts: FACTS,
			grill: { asked: 2, start: false },
		})
		expect(grill).toContain(
			`\n\n${GRILL_RULES}\nAsked so far: 2 of ${ARTICLE_CHAT_GRILL_MAX_QUESTIONS}.\n\nLINKS THAT MUST STAY:`,
		)
		expect(grill).not.toContain('This is the start')
		expect(grill).not.toContain('That was the last answer')
		expect(GRILL_RULES).toContain('one question per turn')
		expect(GRILL_RULES).toContain('call end_grill')

		expect(
			buildChatSystemPrompt({
				links: [],
				pictures: [],
				markdown: '# T',
				grill: { asked: 0, start: true },
			}),
		).toContain('Asked so far: 0 of 6.\nThis is the start: ask Q1 now')
		expect(
			buildChatSystemPrompt({
				links: [],
				pictures: [],
				markdown: '# T',
				grill: { asked: ARTICLE_CHAT_GRILL_MAX_QUESTIONS, start: false },
			}),
		).toContain(
			'That was the last answer: apply it, save the fact, then call end_grill.',
		)
	})

	test('the history window may open with a grill question, behind "Grill me."', () => {
		const rows: ChatHistoryRow[] = [
			{ role: 'assistant', text: 'Q1: units?', toolName: 'grill_question' },
			{ role: 'user', text: '20' },
			{ role: 'change', text: 'Said 20 units.', toolName: 'replace_text' },
			{ role: 'assistant', text: 'Q2: months?', toolName: 'grill_question' },
		]
		expect(historyToMessages(rows)).toEqual([
			{ role: 'user', content: CHAT_COPY.grillStart },
			{ role: 'assistant', content: 'Q1: units?' },
			{ role: 'user', content: '20' },
			{ role: 'assistant', content: 'Changed: said 20 units.' },
			{ role: 'assistant', content: 'Q2: months?' },
		])
		// a plain answer or a grill_done row in front is still dropped
		expect(
			historyToMessages([
				{ role: 'assistant', text: 'Stopped.', toolName: 'grill_done' },
				{ role: 'user', text: 'hi' },
			]),
		).toEqual([{ role: 'user', content: 'hi' }])
	})

	test('grillStateOf and grillQuestionsAsked read the marker rows', () => {
		expect(grillStateOf([])).toBeNull()
		expect(
			grillStateOf([{ toolName: null }, { toolName: 'replace_text' }]),
		).toBeNull()
		expect(
			grillStateOf([
				{ toolName: 'grill_question' },
				{ toolName: 'replace_text' },
			]),
		).toBe('active')
		expect(
			grillStateOf([
				{ toolName: 'grill_question' },
				{ toolName: 'grill_done' },
			]),
		).toBe('done')
		expect(
			grillQuestionsAsked([
				{ toolName: 'grill_question' },
				{ toolName: 'grill_done' },
				{ toolName: 'grill_question' },
				{ toolName: null },
				{ toolName: 'grill_question' },
			]),
		).toBe(2)
	})

	test('her stop words, a question, and a done line', () => {
		for (const words of [
			'stop',
			'Stop.',
			'enough',
			"that's all",
			'That’s all!',
			'no more questions',
		]) {
			expect(isGrillStop(words)).toBe(true)
		}
		for (const words of ['stop saying Botox', '20 units', 'skip', 'done']) {
			expect(isGrillStop(words)).toBe(false)
		}
		expect(looksLikeQuestion('Q2: How long does it last?')).toBe(true)
		expect(looksLikeQuestion('Q2 next: the price, 12 or 14 dollars')).toBe(true)
		expect(looksLikeQuestion('Thanks, I added that.')).toBe(false)
		expect(saysGrillDone('Done. Nothing more to ask.')).toBe(true)
		expect(saysGrillDone('I have nothing else to ask.')).toBe(true)
		expect(saysGrillDone('Q3: Is that done by you or by staff?')).toBe(false)
	})
})
