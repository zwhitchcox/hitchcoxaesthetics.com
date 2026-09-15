import { describe, expect, test } from 'vitest'
import {
	ARTICLE_EDIT_MAX_MARKDOWN_CHARS,
	ARTICLE_EDIT_MAX_PROMPT_CHARS,
	ArticleEditRequestSchema,
	appendSpeech,
	appendToPrompt,
	buildEditSystemPrompt,
	buildEditUserMessage,
	parseEditReply,
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
