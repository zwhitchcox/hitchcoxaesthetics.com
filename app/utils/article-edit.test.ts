import { describe, expect, test, vi } from 'vitest'
import {
	ArticleSaveRequestSchema,
	appendSpeech,
	changedParagraphIndexes,
	changedParagraphShare,
	countPassage,
	firstDiffRange,
	firstHeading,
	locatePassage,
	pictureLines,
	saveArticleBody,
} from './article-edit.ts'

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

	test('countPassage counts the folded hits', () => {
		expect(countPassage(md, 'six')).toBe(2)
		expect(countPassage(md, 'two three')).toBe(1)
		expect(countPassage(md, 'seven')).toBe(0)
		expect(countPassage(md, '')).toBe(0)
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

describe('appendSpeech', () => {
	test('joins spoken pieces with one space', () => {
		expect(appendSpeech('', ' make it shorter ')).toBe('make it shorter')
		expect(appendSpeech('make it shorter', 'and add Dysport')).toBe(
			'make it shorter and add Dysport',
		)
		expect(appendSpeech('keep', '   ')).toBe('keep')
	})
})

describe('firstHeading', () => {
	test('reads the first level-1 heading and ignores lower ones', () => {
		expect(firstHeading('intro\n\n## Not it\n# The Title  \n\ntext')).toBe('The Title')
	})
	test('null without a level-1 heading; CRLF is fine', () => {
		expect(firstHeading('## Only a section\r\ntext')).toBeNull()
		expect(firstHeading('# Windows\r\n')).toBe('Windows')
	})
})
