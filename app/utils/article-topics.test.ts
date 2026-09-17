import { expect, test } from 'vitest'
import {
	ARTICLE_TOPICS,
	rewriteNote,
	rewriteWords,
	isRewriteNote,
} from './article-topics.ts'

test('the topic bank has unique keys and titles', () => {
	const keys = new Set(ARTICLE_TOPICS.map(t => t.key))
	expect(keys.size).toBe(ARTICLE_TOPICS.length)
	expect(ARTICLE_TOPICS.every(t => t.title.length > 10)).toBe(true)
})

test('a chosen topic wins, then her words, then the default', () => {
	expect(rewriteNote({ topic: 'laser-hair-prep', words: 'ignored' })).toBe(
		'NEW ARTICLE: topic=laser-hair-prep',
	)
	expect(
		rewriteNote({
			topic: 'not-a-key',
			words: '  lip filler   before a wedding ',
		}),
	).toBe('NEW ARTICLE: lip filler before a wedding')
	expect(rewriteNote({})).toBe('NEW ARTICLE: a different article')
	expect(rewriteNote({ words: 'x'.repeat(400) })).toHaveLength(
		'NEW ARTICLE: '.length + 300,
	)
})

test('the words for display: a title for a key, her words, nothing for the default', () => {
	expect(rewriteWords('NEW ARTICLE: topic=microneedling')).toBe(
		'Microneedling explained by a nurse',
	)
	expect(rewriteWords('NEW ARTICLE: topic=unknown-key')).toBe('unknown-key')
	expect(rewriteWords('NEW ARTICLE: lip filler before a wedding')).toBe(
		'lip filler before a wedding',
	)
	expect(rewriteWords('NEW ARTICLE: a different article')).toBe('')
	expect(rewriteWords('Please fix the dose line')).toBe('')
	expect(isRewriteNote('NEW ARTICLE: x')).toBe(true)
	expect(isRewriteNote(null)).toBe(false)
})
