import { describe, expect, test, vi } from 'vitest'
import {
	ARTICLE_EDIT_MAX_MARKDOWN_CHARS,
	ARTICLE_EDIT_MAX_PROMPT_CHARS,
	ARTICLE_EDIT_MAX_SELECTION_CHARS,
	ArticleEditRequestSchema,
	ArticleSaveRequestSchema,
	appendSpeech,
	appendToPrompt,
	buildEditSystemPrompt,
	buildEditUserMessage,
	changedParagraphIndexes,
	changedParagraphShare,
	firstDiffRange,
	locatePassage,
	parseEditReply,
	pictureLines,
	saveArticleBody,
} from './article-edit.ts'

describe('parseEditReply', () => {
	test('reads a bare JSON object', () => {
		const reply = parseEditReply(
			'{"markdown":"## Title\\n\\nShort.","summary":"Shortened the first paragraph."}',
		)
		expect(reply).toEqual({
			markdown: '## Title\n\nShort.',
			summary: 'Shortened the first paragraph.',
		})
	})

	test('reads a JSON object inside a code fence', () => {
		const reply = parseEditReply(
			'```json\n{"markdown":"Body text","summary":"Changed one word."}\n```',
		)
		expect(reply?.markdown).toBe('Body text')
		expect(reply?.summary).toBe('Changed one word.')
	})

	test('reads the first object when text is around it', () => {
		const reply = parseEditReply(
			'Here you go:\n{"markdown":"Body","summary":"Done."}\nAnything else?',
		)
		expect(reply?.markdown).toBe('Body')
	})

	test('normalises CRLF in the markdown', () => {
		const reply = parseEditReply('{"markdown":"a\\r\\nb","summary":"x"}')
		expect(reply?.markdown).toBe('a\nb')
	})

	test('fills a default summary when the model sends none', () => {
		const reply = parseEditReply('{"markdown":"Body"}')
		expect(reply?.summary).toBe('Changed the text as you asked.')
	})

	test('returns null when markdown is missing, empty, or not a string', () => {
		expect(parseEditReply('{"summary":"x"}')).toBeNull()
		expect(parseEditReply('{"markdown":"   ","summary":"x"}')).toBeNull()
		expect(parseEditReply('{"markdown":42,"summary":"x"}')).toBeNull()
		expect(parseEditReply('not json at all')).toBeNull()
		expect(parseEditReply('')).toBeNull()
	})

	test('recovers the object when the model wraps it in an array', () => {
		expect(parseEditReply('[{"markdown":"a","summary":"b"}]')?.markdown).toBe('a')
	})
})

describe('buildEditSystemPrompt', () => {
	test('carries the rules and the links that must stay', () => {
		const prompt = buildEditSystemPrompt([
			{ name: 'Botox Knox', url: 'https://botoxknox.com' },
		])
		expect(prompt).toContain('Sarah Hitchcox, RN')
		expect(prompt).toContain('Apply ONLY the requested change')
		expect(prompt).toContain('Keep every other sentence exactly as it is')
		expect(prompt).toContain('Never add a new medical or clinical claim')
		expect(prompt).toContain('"links that must stay"')
		expect(prompt).toContain('- Botox Knox: https://botoxknox.com')
		expect(prompt).toContain('"markdown"')
		expect(prompt).toContain('"summary"')
		expect(prompt).toContain('A line that starts with ![ is a picture')
		expect(prompt).toContain('When a passage is quoted, change only that passage')
	})

	test('says (none) when there are no links', () => {
		expect(buildEditSystemPrompt([])).toContain('(none)')
	})
})

describe('buildEditUserMessage', () => {
	test('puts the request before the article', () => {
		const message = buildEditUserMessage('  Make it shorter ', '# Article')
		expect(message.indexOf('Make it shorter')).toBeLessThan(
			message.indexOf('# Article'),
		)
		expect(message).toContain('REQUESTED CHANGE:\nMake it shorter')
		expect(message).not.toContain('CHANGE ONLY THIS PASSAGE')
	})

	const ARTICLE =
		'# Title\n\nFirst paragraph with *emphasis* here.\n\nSecond paragraph says 20 units.\n\nThird.'

	test('puts a quoted passage first, with its source slice and paragraph', () => {
		const message = buildEditUserMessage('Say 10', ARTICLE, {
			text: 'Second paragraph says 20 units.',
			paragraph: 2,
		})
		expect(message.startsWith('CHANGE ONLY THIS PASSAGE')).toBe(true)
		expect(message).toContain('"Second paragraph says 20 units."')
		expect(message).toContain('IN THE SOURCE IT IS:\nSecond paragraph says 20 units.')
		expect(message).toContain('IT IS IN PARAGRAPH 3 OF THE ARTICLE.')
		expect(message.indexOf('CHANGE ONLY')).toBeLessThan(message.indexOf('REQUESTED CHANGE'))
		expect(message.indexOf('REQUESTED CHANGE')).toBeLessThan(message.indexOf('ARTICLE (markdown)'))
	})

	test('uses the given source slice and skips the paragraph line when unknown', () => {
		const message = buildEditUserMessage('Say 10', ARTICLE, {
			text: 'says 20 units',
			markdown: 'says **20** units',
		})
		expect(message).toContain('IN THE SOURCE IT IS:\nsays **20** units')
		expect(message).not.toContain('IT IS IN PARAGRAPH')
	})

	test('leaves the source line out when the passage is not found once', () => {
		const message = buildEditUserMessage('Say 10', ARTICLE, { text: 'not in the text' })
		expect(message).toContain('"not in the text"')
		expect(message).not.toContain('IN THE SOURCE IT IS:')
	})
})

describe('locatePassage', () => {
	const md = 'One *two* three.\n\nFour “five” six. Four five six.'

	test('finds one hit across emphasis marks and whitespace', () => {
		const range = locatePassage(md, 'two  three')
		expect(range).toEqual({ start: 4, end: 15 })
		expect(md.slice(range!.start, range!.end)).toBe('*two* three')
	})

	test('folds curly quotes', () => {
		const range = locatePassage(md, 'Four "five" six')
		expect(range).not.toBeNull()
		expect(md.slice(range!.start, range!.end)).toBe('Four “five” six')
	})

	test('returns null for zero hits and for two hits', () => {
		expect(locatePassage(md, 'seven')).toBeNull()
		expect(locatePassage(md, 'six')).toBeNull()
		expect(locatePassage(md, '')).toBeNull()
	})
})

describe('firstDiffRange', () => {
	test('is null for equal texts', () => {
		expect(firstDiffRange('same', 'same')).toBeNull()
	})

	test('spans the changed middle, as offsets in the new text', () => {
		const range = firstDiffRange('Say 20 units here.', 'Say 2 to 4 units here.')
		expect(range).toEqual({ start: 5, end: 10 })
		expect('Say 2 to 4 units here.'.slice(5, 10)).toBe(' to 4')
	})

	test('a pure deletion gives an empty span', () => {
		expect(firstDiffRange('a b c', 'a c')).toEqual({ start: 2, end: 2 })
	})

	test('ignores a missing trailing newline in the new text', () => {
		const base = 'One.\n\nTwo. Gone. Three.\n\nFour.\n'
		const next = 'One.\n\nTwo. Three.\n\nFour.'
		expect(firstDiffRange(base, next)).toEqual({ start: 11, end: 11 })
		expect(firstDiffRange(base, `${next}\n`)).toEqual({ start: 11, end: 11 })
		expect(firstDiffRange(base, base.trimEnd())).toBeNull()
	})
})

describe('pictureLines', () => {
	test('lists the picture lines sorted and without duplicates', () => {
		const md =
			'# T\n\n![b](images/image-2.png)\n*caption*\n\ntext ![inline](x.png) more\n\n![a](images/image-1.png)\n\n![a](images/image-1.png)'
		expect(pictureLines(md)).toEqual(['![a](images/image-1.png)', '![b](images/image-2.png)'])
	})
})

describe('changedParagraphIndexes', () => {
	const base = 'One.\n\nTwo.\n\nThree.'

	test('reports the paragraphs that are new in the next text', () => {
		expect(changedParagraphIndexes(base, 'One.\n\nTwo changed.\n\nThree.')).toEqual([1])
		expect(changedParagraphIndexes(base, base)).toEqual([])
		expect(changedParagraphIndexes(base, 'One.\n\nTwo.\n\nThree.\n\nFour.')).toEqual([3])
	})

	test('ignores whitespace differences', () => {
		expect(changedParagraphIndexes(base, 'One.\n\nTwo.  \n\n  Three.')).toEqual([])
	})

	test('share is the changed count over the next paragraph count', () => {
		expect(changedParagraphShare(base, 'One.\n\nX.\n\nY.')).toBeCloseTo(2 / 3)
		expect(changedParagraphShare(base, '')).toBe(0)
	})
})

describe('saveArticleBody', () => {
	const input = { articleId: 'a1', body: '# Hi', baseHash: 'f'.repeat(64) }
	const reply = (status: number, data: unknown) =>
		vi.fn(
			async () =>
				new Response(JSON.stringify(data), {
					status,
					headers: { 'Content-Type': 'application/json' },
				}),
		)

	test('posts the body with the base hash and maps a save', async () => {
		const fetchImpl = reply(200, { ok: true, hash: 'a'.repeat(64), changed: true })
		const result = await saveArticleBody(input, { fetchImpl })
		expect(result).toEqual({ ok: true, hash: 'a'.repeat(64), changed: true })
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
		expect(url).toBe('/resources/article-save')
		expect(init.keepalive).toBe(false)
		expect(JSON.parse(String(init.body))).toEqual({ ...input, source: 'auto' })
	})

	test('maps 409 changed with the server text', async () => {
		const result = await saveArticleBody(input, {
			fetchImpl: reply(409, { error: 'changed', body: 'new', hash: 'b'.repeat(64) }),
		})
		expect(result).toEqual({ ok: false, kind: 'changed', body: 'new', hash: 'b'.repeat(64) })
	})

	test('maps 409 decided, a server error, and a network failure', async () => {
		expect(await saveArticleBody(input, { fetchImpl: reply(409, { error: 'decided' }) })).toEqual({
			ok: false,
			kind: 'decided',
		})
		expect(
			await saveArticleBody(input, { fetchImpl: reply(429, { error: 'Too many.' }) }),
		).toEqual({ ok: false, kind: 'server', message: 'Too many.' })
		const failing = vi.fn(async () => {
			throw new TypeError('offline')
		})
		expect(await saveArticleBody(input, { fetchImpl: failing })).toEqual({
			ok: false,
			kind: 'network',
		})
	})

	test('passes keepalive through', async () => {
		const fetchImpl = reply(200, { ok: true, hash: 'a'.repeat(64), changed: false })
		await saveArticleBody({ ...input, source: 'ai' }, { fetchImpl, keepalive: true })
		const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
		expect(init.keepalive).toBe(true)
		expect((JSON.parse(String(init.body)) as { source: string }).source).toBe('ai')
	})
})

describe('ArticleSaveRequestSchema', () => {
	test('needs a sha256 base hash and defaults the source', () => {
		const ok = ArticleSaveRequestSchema.parse({
			articleId: 'a1',
			body: 'x',
			baseHash: 'a'.repeat(64),
		})
		expect(ok.source).toBe('auto')
		expect(
			ArticleSaveRequestSchema.safeParse({ articleId: 'a1', body: 'x', baseHash: 'short' })
				.success,
		).toBe(false)
		expect(
			ArticleSaveRequestSchema.safeParse({ articleId: 'a1', body: '', baseHash: 'a'.repeat(64) })
				.success,
		).toBe(false)
	})
})

describe('ArticleEditRequestSchema', () => {
	const valid = {
		articleId: 'abc',
		prompt: 'Shorter',
		markdown: '# Hi',
		links: [{ name: 'Site', url: 'https://example.com' }],
	}

	test('accepts a valid request and defaults links', () => {
		expect(ArticleEditRequestSchema.parse(valid)).toEqual(valid)
		const { links: _links, ...noLinks } = valid
		expect(ArticleEditRequestSchema.parse(noLinks).links).toEqual([])
	})

	test('rejects an empty or too long prompt', () => {
		expect(ArticleEditRequestSchema.safeParse({ ...valid, prompt: '  ' }).success).toBe(false)
		expect(
			ArticleEditRequestSchema.safeParse({
				...valid,
				prompt: 'x'.repeat(ARTICLE_EDIT_MAX_PROMPT_CHARS + 1),
			}).success,
		).toBe(false)
	})

	test('accepts and bounds a selection', () => {
		const withSelection = { ...valid, selection: { text: 'abc', paragraph: 0 } }
		expect(ArticleEditRequestSchema.parse(withSelection).selection).toEqual({
			text: 'abc',
			paragraph: 0,
		})
		expect(ArticleEditRequestSchema.parse(valid).selection).toBeUndefined()
		expect(
			ArticleEditRequestSchema.safeParse({ ...valid, selection: { text: 'ab' } }).success,
		).toBe(false)
		expect(
			ArticleEditRequestSchema.safeParse({
				...valid,
				selection: { text: 'x'.repeat(ARTICLE_EDIT_MAX_SELECTION_CHARS + 1) },
			}).success,
		).toBe(false)
		expect(
			ArticleEditRequestSchema.safeParse({ ...valid, selection: { text: 'abc', paragraph: -1 } })
				.success,
		).toBe(false)
		expect(
			ArticleEditRequestSchema.safeParse({
				...valid,
				selection: { text: 'abc', markdown: 'x'.repeat(4001) },
			}).success,
		).toBe(false)
	})

	test('rejects an empty or too long markdown', () => {
		expect(ArticleEditRequestSchema.safeParse({ ...valid, markdown: '' }).success).toBe(false)
		expect(
			ArticleEditRequestSchema.safeParse({
				...valid,
				markdown: 'x'.repeat(ARTICLE_EDIT_MAX_MARKDOWN_CHARS + 1),
			}).success,
		).toBe(false)
	})
})

describe('prompt box helpers', () => {
	test('appendToPrompt separates items with a period', () => {
		expect(appendToPrompt('', 'Shorter')).toBe('Shorter')
		expect(appendToPrompt('Wrong fact', 'Shorter')).toBe('Wrong fact. Shorter')
		expect(appendToPrompt('Wrong fact: ', '"20 units"')).toBe('Wrong fact: "20 units"')
	})

	test('appendSpeech joins spoken pieces with one space', () => {
		expect(appendSpeech('', ' make it shorter ')).toBe('make it shorter')
		expect(appendSpeech('make it shorter', 'and add Dysport')).toBe(
			'make it shorter and add Dysport',
		)
		expect(appendSpeech('keep', '   ')).toBe('keep')
	})
})
