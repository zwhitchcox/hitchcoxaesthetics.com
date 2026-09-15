import { describe, expect, test } from 'vitest'
import {
	aboutMinutes,
	estimateReadSeconds,
	fallbackReviewAid,
	findHighlightRanges,
	findProducts,
	loadReviewAid,
	paragraphIndexAt,
	plainQuote,
	reviewAidNote,
	splitParagraphs,
	splitSentences,
	verifyReviewAid,
} from './review-aid.ts'

const BODY = `# Botox for TMJ

Sarah Hitchcox, RN, treats jaw pain at her Bearden office. Most patients need 20 units per side. Results last 3 to 4 months.

![A syringe on a tray](https://example.com/syringe.jpg)

Dysport is a second option. A visit costs about $150. Dr. Smith agrees that 10% of patients need a touch-up.

- Book at [Botox Knox](https://botoxknox.com)
- Ask about Juvéderm

That is all of it.`

describe('estimateReadSeconds', () => {
	test('rounds wordCount / 230 * 60', () => {
		expect(estimateReadSeconds(893)).toBe(233)
		expect(estimateReadSeconds(115)).toBe(30)
		expect(estimateReadSeconds(1688)).toBe(440)
		expect(estimateReadSeconds(230)).toBe(60)
	})

	test('never goes below zero', () => {
		expect(estimateReadSeconds(0)).toBe(0)
		expect(estimateReadSeconds(-5)).toBe(0)
		expect(estimateReadSeconds(Number.NaN)).toBe(0)
	})
})

describe('aboutMinutes', () => {
	test('rounds to whole minutes and never says 0', () => {
		expect(aboutMinutes(233)).toBe('About 4 min')
		expect(aboutMinutes(30)).toBe('About 1 min')
		expect(aboutMinutes(0)).toBe('About 1 min')
		expect(aboutMinutes(440)).toBe('About 7 min')
	})
})

describe('verifyReviewAid', () => {
	test('keeps a quote found verbatim and records its offset', () => {
		const aid = verifyReviewAid(BODY, {
			claims: [{ quote: 'Most patients need 20 units per side.' }],
		})
		expect(aid.source).toBe('writer')
		expect(aid.unmatched).toBe(0)
		expect(aid.claims).toHaveLength(1)
		const item = aid.claims[0]!
		expect(item.quote).toBe('Most patients need 20 units per side.')
		expect(BODY.slice(item.offset, item.offset + item.quote.length)).toBe(
			item.quote,
		)
	})

	test('drops a changed quote and counts it', () => {
		const aid = verifyReviewAid(BODY, {
			claims: [
				{ quote: 'Most patients need 25 units per side.' },
				{ quote: 'Results last 3 to 4 months.' },
			],
		})
		expect(aid.claims.map(c => c.quote)).toEqual([
			'Results last 3 to 4 months.',
		])
		expect(aid.unmatched).toBe(1)
	})

	test('matches across CRLF, extra spaces, and curly quotes', () => {
		const body = 'She said “we offer\r\nDysport   too” today.'
		const aid = verifyReviewAid(body, {
			claims: [{ quote: '"we offer Dysport too"' }],
		})
		expect(aid.unmatched).toBe(0)
		expect(aid.claims).toHaveLength(1)
		expect(aid.claims[0]!.quote).toBe('“we offer\r\nDysport   too”')
		expect(aid.claims[0]!.offset).toBe(9)
	})

	test('matches a quote that spans a paragraph break', () => {
		const aid = verifyReviewAid(BODY, {
			credentials: [{ quote: 'Results last 3 to 4 months. ![A syringe' }],
		})
		expect(aid.unmatched).toBe(0)
		expect(aid.credentials[0]!.offset).toBe(BODY.indexOf('Results last'))
	})

	test('drops empty, blank, and duplicate quotes', () => {
		const aid = verifyReviewAid(BODY, {
			claims: [
				{ quote: '' },
				{ quote: '   ' },
				{ quote: 'Dysport is a second option.' },
				{ quote: 'Dysport is a second option.' },
			],
			credentials: null,
		})
		expect(aid.claims).toHaveLength(1)
		expect(aid.unmatched).toBe(2)
		expect(aid.credentials).toEqual([])
	})

	test('sorts kept items by position in the text', () => {
		const aid = verifyReviewAid(BODY, {
			claims: [
				{ quote: 'A visit costs about $150.' },
				{ quote: 'Most patients need 20 units per side.' },
			],
		})
		expect(aid.claims.map(c => c.quote)).toEqual([
			'Most patients need 20 units per side.',
			'A visit costs about $150.',
		])
	})

	test('cleans the rules and lists the products', () => {
		const aid = verifyReviewAid(BODY, {
			rules: [' No prices ', 'No prices', '', 'Link once'],
		})
		expect(aid.rules).toEqual(['No prices', 'Link once'])
		expect(aid.products).toEqual(['Botox', 'Dysport', 'Juvederm'])
	})
})

describe('fallbackReviewAid', () => {
	const aid = fallbackReviewAid(BODY)

	test('is labelled as a word search with no rules', () => {
		expect(aid.source).toBe('search')
		expect(aid.rules).toEqual([])
		expect(aid.unmatched).toBe(0)
	})

	test('finds sentences with numbers and units', () => {
		const quotes = aid.claims.map(c => c.quote)
		expect(quotes).toContain('Most patients need 20 units per side.')
		expect(quotes).toContain('Results last 3 to 4 months.')
		expect(quotes).toContain('A visit costs about $150.')
		expect(quotes).toContain(
			'Dr. Smith agrees that 10% of patients need a touch-up.',
		)
	})

	test('finds sentences that name a drug or product', () => {
		const quotes = aid.claims.map(c => c.quote)
		expect(quotes).toContain('Dysport is a second option.')
		expect(quotes).toContain('Ask about Juvéderm')
		// A heading is a title, not a claim.
		expect(quotes).not.toContain('Botox for TMJ')
	})

	test('does not flag a plain sentence or the image line', () => {
		const quotes = aid.claims.map(c => c.quote)
		expect(quotes).not.toContain('That is all of it.')
		expect(quotes.some(q => q.includes('syringe'))).toBe(false)
	})

	test('finds credential sentences: RN, the office, the sister brand', () => {
		const quotes = aid.credentials.map(c => c.quote)
		expect(quotes).toEqual([
			'Sarah Hitchcox, RN, treats jaw pain at her Bearden office.',
			'Book at [Botox Knox](https://botoxknox.com)',
		])
	})

	test('"Botox Knox" alone is a credential, not a product claim', () => {
		const one = fallbackReviewAid('Book at Botox Knox today.')
		expect(one.claims).toEqual([])
		expect(one.credentials.map(c => c.quote)).toEqual([
			'Book at Botox Knox today.',
		])
		expect(one.products).toEqual([])
	})

	test('RN is case-sensitive, nurse is not', () => {
		expect(fallbackReviewAid('Turn the corn.').credentials).toEqual([])
		expect(fallbackReviewAid('Our Nurse will call.').credentials).toHaveLength(
			1,
		)
		expect(
			fallbackReviewAid('Sarah, R.N., will call.').credentials,
		).toHaveLength(1)
	})

	test('every quote is a verbatim slice at its offset', () => {
		for (const item of [...aid.claims, ...aid.credentials]) {
			expect(BODY.slice(item.offset, item.offset + item.quote.length)).toBe(
				item.quote,
			)
		}
	})

	test('skips headings and leaves bullet marks out of the quote', () => {
		expect(aid.claims.map(c => c.quote)).not.toContain('Botox for TMJ')
		expect(aid.claims.map(c => c.quote)).not.toContain('# Botox for TMJ')
		expect(aid.credentials.map(c => c.quote)).toContain(
			'Book at [Botox Knox](https://botoxknox.com)',
		)
	})

	test('lists the products in order of first use', () => {
		expect(aid.products).toEqual(['Botox', 'Dysport', 'Juvederm'])
		expect(findProducts('PRP then hyaluronic  acid then prp')).toEqual([
			'PRP',
			'hyaluronic acid',
		])
	})

	test('skips code fences and table rows', () => {
		const body = '```\n20 units\n```\n| 20 units | x |\n\nTake 5 mg.'
		expect(fallbackReviewAid(body).claims.map(c => c.quote)).toEqual([
			'Take 5 mg.',
		])
	})
})

describe('splitSentences', () => {
	test('does not split on decimals or Dr.', () => {
		const s = splitSentences('Use 0.5 ml. Dr. Lee agrees. Done!').map(
			x => x.text,
		)
		expect(s).toEqual(['Use 0.5 ml.', 'Dr. Lee agrees.', 'Done!'])
	})

	test('splits after a closing quote or bracket', () => {
		const s = splitSentences('She said "no." Then she left.').map(x => x.text)
		expect(s).toEqual(['She said "no."', 'Then she left.'])
	})
})

describe('splitParagraphs and paragraphIndexAt', () => {
	test('returns blank-line blocks with offsets', () => {
		const ps = splitParagraphs(BODY)
		expect(ps[0]!.text).toBe('# Botox for TMJ')
		expect(ps[0]!.start).toBe(0)
		expect(ps.at(-1)!.text).toBe('That is all of it.')
		for (const p of ps) expect(BODY.slice(p.start, p.end)).toBe(p.text)
		expect(ps).toHaveLength(6)
	})

	test('handles CRLF and trailing blank lines', () => {
		const ps = splitParagraphs('One.\r\n\r\nTwo.\r\n\r\n')
		expect(ps.map(p => p.text)).toEqual(['One.', 'Two.'])
	})

	test('maps an offset to its paragraph', () => {
		const ps = splitParagraphs(BODY)
		expect(paragraphIndexAt(ps, BODY.indexOf('Dysport is'))).toBe(3)
		expect(paragraphIndexAt(ps, BODY.indexOf('That is all'))).toBe(5)
		expect(paragraphIndexAt(ps, BODY.length + 10)).toBe(-1)
	})
})

describe('findHighlightRanges', () => {
	test('returns ranges in text order with the quote index', () => {
		const ranges = findHighlightRanges(BODY, [
			'A visit costs about $150.',
			'Most patients need 20 units per side.',
			'not in the text',
		])
		expect(ranges.map(r => r.index)).toEqual([1, 0])
		for (const r of ranges) expect(BODY.slice(r.start, r.end)).toBe(r.quote)
	})

	test('drops a range that overlaps an earlier one', () => {
		const ranges = findHighlightRanges(BODY, [
			'Most patients need 20 units per side.',
			'20 units per side. Results last',
			'Results last 3 to 4 months.',
		])
		expect(ranges.map(r => r.index)).toEqual([0, 2])
	})

	test('matches through normalised whitespace and returns body coordinates', () => {
		const body = 'Take\r\n20   units.'
		const ranges = findHighlightRanges(body, ['Take 20 units.'])
		expect(ranges).toEqual([
			{ start: 0, end: body.length, quote: body, index: 0 },
		])
	})

	test('returns nothing for an empty list or an empty body', () => {
		expect(findHighlightRanges(BODY, [])).toEqual([])
		expect(findHighlightRanges('', ['x'])).toEqual([])
	})
})

describe('plainQuote', () => {
	test('shows link text without the URL', () => {
		expect(
			plainQuote(
				'Ours at [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com), whether',
			),
		).toBe('Ours at Sarah Hitchcox Aesthetics, whether')
		expect(plainQuote('Book at [Botox Knox](https://botoxknox.com)')).toBe(
			'Book at Botox Knox',
		)
	})

	test('removes emphasis marks and backticks', () => {
		expect(plainQuote("*A nurse's checklist for a clear head.*")).toBe(
			"A nurse's checklist for a clear head.",
		)
		expect(plainQuote('Use **20 units** of `Botox` _per side_.')).toBe(
			'Use 20 units of Botox per side.',
		)
	})

	test('leaves plain text and in-word underscores alone', () => {
		expect(plainQuote('Results last 3 to 4 months.')).toBe(
			'Results last 3 to 4 months.',
		)
		expect(plainQuote('See topic_key for details.')).toBe(
			'See topic_key for details.',
		)
	})
})

describe('reviewAidNote', () => {
	test('uses the exact copy for each source', () => {
		expect(reviewAidNote({ source: 'search', unmatched: 0 })).toBe(
			'The writing system sent no claim list for this one. These were found by a word search.',
		)
		expect(reviewAidNote({ source: 'writer', unmatched: 0 })).toBe(
			'Pulled out by the writing system and checked word for word against the text.',
		)
		expect(reviewAidNote({ source: 'writer', unmatched: 1 })).toBe(
			'Pulled out by the writing system and checked word for word against the text. 1 item could not be matched to the text.',
		)
		expect(reviewAidNote({ source: 'writer', unmatched: 3 })).toContain(
			'3 items could not be matched to the text.',
		)
	})
})

describe('loadReviewAid', () => {
	test('falls back to the word search when nothing is stored', () => {
		expect(loadReviewAid(null, BODY).source).toBe('search')
		expect(loadReviewAid('', BODY).source).toBe('search')
		expect(loadReviewAid('not json', BODY).source).toBe('search')
		expect(loadReviewAid('[]', BODY).source).toBe('search')
	})

	test('reads the stored shape with `dropped` and adds fresh offsets', () => {
		const json = JSON.stringify({
			claims: [{ quote: 'Most patients need 20 units per side.' }],
			credentials: [
				{ quote: 'Sarah Hitchcox, RN, treats jaw pain at her Bearden office.' },
			],
			rules: ['No prices'],
			dropped: 1,
		})
		const aid = loadReviewAid(json, BODY)
		expect(aid.source).toBe('writer')
		expect(aid.unmatched).toBe(1)
		expect(aid.rules).toEqual(['No prices'])
		expect(aid.claims[0]!.offset).toBe(BODY.indexOf('Most patients'))
		expect(aid.credentials[0]!.offset).toBe(BODY.indexOf('Sarah Hitchcox, RN'))
	})

	test('reads its own stored shape and drops a quote she edited away', () => {
		const stored = verifyReviewAid(BODY, {
			claims: [
				{ quote: 'Most patients need 20 units per side.' },
				{ quote: 'A visit costs about $150.' },
			],
		})
		const edited = BODY.replace('A visit costs about $150. ', '')
		const aid = loadReviewAid(JSON.stringify(stored), edited)
		expect(aid.claims.map(c => c.quote)).toEqual([
			'Most patients need 20 units per side.',
		])
		expect(aid.unmatched).toBe(1)
		expect(aid.source).toBe('writer')
	})

	test('ignores junk inside a stored list', () => {
		const json = JSON.stringify({
			claims: [null, 5, { quote: 7 }, { quote: 'Results last 3 to 4 months.' }],
			rules: [1, 'Link once'],
			unmatched: 'many',
		})
		const aid = loadReviewAid(json, BODY)
		expect(aid.claims).toHaveLength(1)
		expect(aid.rules).toEqual(['Link once'])
		expect(aid.unmatched).toBe(0)
	})
})
