import { expect, test } from 'vitest'

import {
	hasSpeech,
	narrationTokens,
	normalizeNarrationText,
	wordAt,
	wordTimings,
} from './narration.ts'

test('the spoken text has one space between words and no ends', () => {
	expect(normalizeNarrationText('  Botox\n\tfor  TMJ \n')).toBe('Botox for TMJ')
})

test('a picture line or a bare dash has nothing to say', () => {
	expect(hasSpeech('Botox for TMJ')).toBe(true)
	expect(hasSpeech('2 units')).toBe(true)
	expect(hasSpeech(' - ')).toBe(false)
	expect(hasSpeech('')).toBe(false)
})

test('tokens are runs of non-space characters with their spans', () => {
	expect(narrationTokens('Ask who reviews.')).toEqual([
		{ start: 0, end: 3 },
		{ start: 4, end: 7 },
		{ start: 8, end: 16 },
	])
})

test('a word runs from its first character start to its last character end', () => {
	const text = 'Ask who'
	const alignment = {
		chars: text.split(''),
		starts: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
		ends: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
	}
	expect(wordTimings(text, alignment)).toEqual({
		durationS: 0.7,
		words: [
			[0, 3, 0, 0.3],
			[4, 7, 0.4, 0.7],
		],
	})
})

test('a short alignment does not throw, the last words clamp to the end', () => {
	const timing = wordTimings('one two three', {
		chars: ['o', 'n', 'e'],
		starts: [0, 0.1, 0.2],
		ends: [0.1, 0.2, 0.3],
	})
	expect(timing.words).toHaveLength(3)
	expect(timing.words[2]).toEqual([8, 13, 0.2, 0.3])
})

test('wordAt finds the word being spoken', () => {
	const words: Array<[number, number, number, number]> = [
		[0, 3, 0, 0.3],
		[4, 7, 0.4, 0.7],
		[8, 13, 0.8, 1.2],
	]
	expect(wordAt(words, -1)).toBe(-1)
	expect(wordAt(words, 0)).toBe(0)
	expect(wordAt(words, 0.45)).toBe(1)
	expect(wordAt(words, 5)).toBe(2)
})
