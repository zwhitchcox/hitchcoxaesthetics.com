import { describe, expect, test } from 'vitest'
import {
	REVIEW_LINK,
	cutAtWord,
	waitingSentence,
	waitingText,
} from './review-waiting.ts'

/** The sentence Sarah reads about her queue (phase 6, A4). */

describe('cutAtWord', () => {
	test('a short title is folded and kept', () => {
		expect(cutAtWord('  Botox   for a\ttight jaw ')).toBe(
			'Botox for a tight jaw',
		)
	})

	test('a long title is cut at a word, with an ellipsis', () => {
		const title = 'abcdefghij '.repeat(8).trim()
		const cut = cutAtWord(title)
		expect(cut).toBe(`${'abcdefghij '.repeat(7).trim()}…`)
		expect(cut.length).toBeLessThanOrEqual(81)
	})

	test('one very long word is cut hard', () => {
		const word = 'x'.repeat(100)
		expect(cutAtWord(word)).toBe(`${'x'.repeat(80)}…`)
	})
})

describe('waitingSentence', () => {
	test('nothing waits: an empty string', () => {
		expect(waitingSentence({ articles: 0, questions: 0 })).toBe('')
		expect(waitingSentence({ articles: 0, questions: 0, onlyTitle: 'x' })).toBe(
			'',
		)
	})

	test('one article carries its title', () => {
		expect(
			waitingSentence({
				articles: 1,
				questions: 0,
				onlyTitle: 'Botox for a tight jaw',
			}),
		).toBe('1 article is waiting: Botox for a tight jaw.')
	})

	test('one question carries the ask; its end mark makes way for the period', () => {
		expect(
			waitingSentence({
				articles: 0,
				questions: 1,
				onlyTitle: 'Which days are you open?',
			}),
		).toBe('1 question is waiting: Which days are you open.')
	})

	test('a long title is cut at 80 characters at a word', () => {
		const title = 'word '.repeat(30).trim()
		expect(
			waitingSentence({ articles: 1, questions: 0, onlyTitle: title }),
		).toBe(`1 article is waiting: ${'word '.repeat(16).trim()}.`)
	})

	test('one item with no title falls back to the count', () => {
		expect(waitingSentence({ articles: 1, questions: 0 })).toBe(
			'1 article is waiting.',
		)
		expect(
			waitingSentence({ articles: 0, questions: 1, onlyTitle: '  ' }),
		).toBe('1 question is waiting.')
	})

	test('the counts: singular, plural, is and are', () => {
		expect(waitingSentence({ articles: 3, questions: 2 })).toBe(
			'3 articles and 2 questions are waiting.',
		)
		expect(waitingSentence({ articles: 3, questions: 0 })).toBe(
			'3 articles are waiting.',
		)
		expect(waitingSentence({ articles: 1, questions: 2 })).toBe(
			'1 article and 2 questions are waiting.',
		)
		expect(waitingSentence({ articles: 0, questions: 2 })).toBe(
			'2 questions are waiting.',
		)
		// two items in total: the title is not used
		expect(
			waitingSentence({ articles: 1, questions: 1, onlyTitle: 'Some title' }),
		).toBe('1 article and 1 question are waiting.')
	})
})

describe('waitingText', () => {
	test('the sentence and the link', () => {
		expect(waitingText({ articles: 3, questions: 2 })).toBe(
			'3 articles and 2 questions are waiting. hitchcoxaesthetics.com/review',
		)
		expect(REVIEW_LINK).toBe('hitchcoxaesthetics.com/review')
	})

	test('nothing waits: an empty string, no link', () => {
		expect(waitingText({ articles: 0, questions: 0 })).toBe('')
	})
})
