import { describe, expect, test } from 'vitest'
import {
	FACT_BANK_EMPTY,
	SyncFactSchema,
	SyncFactsPayloadSchema,
	factBankBlock,
	factBankLine,
	isFactsPayload,
	normaliseQuestion,
	normaliseTags,
	orderFactBank,
	type FactBankRow,
} from './review-facts.ts'

const at = (day: number) =>
	new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`)

function row(over: Partial<FactBankRow> & { fact: string }): FactBankRow {
	return {
		source: 'grill',
		tags: '',
		question: null,
		updatedAt: at(1),
		...over,
	}
}

describe('normaliseQuestion', () => {
	test('two askings of one question share a key', () => {
		expect(normaliseQuestion('Q3: What do you charge per unit of Botox?')).toBe(
			'charge unit botox',
		)
		expect(normaliseQuestion("what's the charge, per unit, for botox")).toBe(
			'charge unit botox',
		)
		expect(normaliseQuestion('Q12) How many units per side?')).toBe(
			'units side',
		)
		expect(normaliseQuestion('Units per side, how many?')).toBe('units side')
	})

	test('keeps numbers and words that carry meaning, drops the rest', () => {
		expect(normaliseQuestion('Do you treat patients under 21?')).toBe(
			'treat patients under 21',
		)
		expect(normaliseQuestion('  The   ??? ')).toBe('')
	})
})

describe('normaliseTags', () => {
	test('lowercases, trims, drops repeats, joins with a comma', () => {
		expect(normaliseTags(' Botox, pricing ,botox,, Weight Loss ')).toBe(
			'botox, pricing, weight loss',
		)
		expect(normaliseTags(['Farragut', 'hours'])).toBe('farragut, hours')
		expect(normaliseTags(null)).toBe('')
		expect(normaliseTags('')).toBe('')
	})
})

describe('the prompt block', () => {
	const rows: FactBankRow[] = [
		row({ fact: 'newest grill', updatedAt: at(16), tags: 'voice' }),
		row({
			source: 'docs',
			fact: 'docs pricing',
			tags: 'pricing',
			updatedAt: at(2),
		}),
		row({ fact: 'older grill', updatedAt: at(10), question: 'Q1: Why?' }),
		row({
			source: 'manual',
			fact: 'manual middle',
			updatedAt: at(12),
			tags: 'hours',
		}),
		row({
			source: 'docs',
			fact: 'docs botox',
			tags: 'botox',
			updatedAt: at(1),
		}),
	]

	test('docs rows first grouped by tags, then the rest newest first', () => {
		expect(orderFactBank(rows).map(r => r.fact)).toEqual([
			'docs botox',
			'docs pricing',
			'newest grill',
			'manual middle',
			'older grill',
		])
	})

	test('a line carries the tags, the fact and the question', () => {
		expect(
			factBankLine(row({ fact: 'F.', tags: 'a, b', question: ' Q? ' })),
		).toBe('- [a, b] F. (asked: "Q?")')
		expect(factBankLine(row({ fact: 'F.' }))).toBe('- F.')
	})

	test('the block is cut by rows and by characters, and says when it is empty', () => {
		const block = factBankBlock(rows)
		expect(block.rows).toBe(5)
		expect(block.text.split('\n')[0]).toBe('- [botox] docs botox')
		expect(block.text.split('\n').at(-1)).toBe(
			'- older grill (asked: "Q1: Why?")',
		)
		expect(factBankBlock(rows, { maxRows: 2 })).toEqual({
			text: '- [botox] docs botox\n- [pricing] docs pricing',
			rows: 2,
		})
		// 21 + 25 characters fit, the third line (23) does not
		expect(factBankBlock(rows, { maxChars: 50 }).rows).toBe(2)
		expect(factBankBlock([])).toEqual({ text: FACT_BANK_EMPTY, rows: 0 })
	})
})

describe('the sync payload', () => {
	test('a docs row needs a key and a fact; tags may be a list', () => {
		expect(
			SyncFactSchema.parse({
				key: 'voice.md:3f9a',
				fact: ' Sarah writes in the first person. ',
				tags: ['Voice', 'style'],
			}),
		).toEqual({
			key: 'voice.md:3f9a',
			fact: 'Sarah writes in the first person.',
			tags: 'voice, style',
			question: undefined,
			answer: undefined,
		})
		expect(SyncFactSchema.safeParse({ key: '', fact: 'x' }).success).toBe(false)
		expect(SyncFactSchema.safeParse({ key: 'k' }).success).toBe(false)
		expect(
			SyncFactsPayloadSchema.safeParse({
				facts: Array.from({ length: 501 }, (_, i) => ({
					key: `k${i}`,
					fact: 'f',
				})),
			}).success,
		).toBe(false)
	})

	test('isFactsPayload tells the two POST shapes apart', () => {
		expect(isFactsPayload({ facts: [] })).toBe(true)
		expect(isFactsPayload({ articles: [] })).toBe(false)
		expect(isFactsPayload(null)).toBe(false)
	})
})
