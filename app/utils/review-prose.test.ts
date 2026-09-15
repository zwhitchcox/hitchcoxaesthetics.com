import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { describe, expect, test } from 'vitest'
import { findHighlightRanges, splitParagraphs } from './review-aid.ts'
import {
	MARKER_ID,
	MARKER_TEXT,
	reviewProsePlugin,
	transformReviewProse,
	type MdNode,
} from './review-prose.ts'

const BODY = `## Botox for TMJ

Sarah Hitchcox, RN, treats jaw pain at her Bearden office. Most patients need **20 units** per side.

Results last 3 to 4 months. See [our site](https://hitchcoxaesthetics.com).

- One
- Two`

function render(body: string, quotes: string[], markerAt: number | null = null) {
	const paragraphs = splitParagraphs(body)
	const ranges = findHighlightRanges(body, quotes)
	return renderToStaticMarkup(
		createElement(
			ReactMarkdown,
			{ remarkPlugins: [reviewProsePlugin({ paragraphs, ranges, markerAt })] },
			body,
		),
	)
}

describe('reviewProsePlugin', () => {
	test('tags every top-level block with its paragraph index', () => {
		const html = render(BODY, [])
		expect(html).toContain('<h2 data-paragraph="0">')
		expect(html).toContain('<p data-paragraph="1">')
		expect(html).toContain('<p data-paragraph="2">')
		expect(html).toContain('<ul data-paragraph="3">')
	})

	test('wraps a quote in one mark with an id and the claim index', () => {
		const html = render(BODY, ['Results last 3 to 4 months.'])
		expect(html).toContain(
			'<mark class="review-mark" data-claim="0" id="hl-0">Results last 3 to 4 months.</mark>',
		)
	})

	test('a quote across bold text becomes two marks with one id', () => {
		const html = render(BODY, ['Most patients need **20 units** per side.'])
		expect(html).toContain(
			'<mark class="review-mark" data-claim="0" id="hl-0">Most patients need </mark>',
		)
		expect(html).toContain(
			'<strong><mark class="review-mark" data-claim="0">20 units</mark></strong>',
		)
		expect(html).toContain(
			'<mark class="review-mark" data-claim="0"> per side.</mark>',
		)
		expect(html.match(/id="hl-0"/g)?.length).toBe(1)
	})

	test('keeps the link when a quote covers link syntax', () => {
		// the fallback quotes raw sentences, link syntax included
		const html = render(BODY, ['See [our site](https://hitchcoxaesthetics.com).'])
		expect(html).toContain(
			'<a href="https://hitchcoxaesthetics.com"><mark class="review-mark" data-claim="0">our site</mark></a>',
		)
		expect(html).toContain(
			'<mark class="review-mark" data-claim="0" id="hl-0">See </mark>',
		)
	})

	test('a quote that is not in the body adds nothing', () => {
		const html = render(BODY, ['Not in the text at all.'])
		expect(html).not.toContain('<mark')
	})

	test('inserts the You were here marker before the paragraph reached', () => {
		const html = render(BODY, [], 2)
		expect(html).toMatch(
			new RegExp(
				`<div id="${MARKER_ID}" class="review-marker">${MARKER_TEXT}</div>\\s*<p data-paragraph="2">`,
			),
		)
	})

	test('no marker for paragraph zero or past the end', () => {
		expect(render(BODY, [], 0)).not.toContain(MARKER_ID)
		expect(render(BODY, [], 99)).not.toContain(MARKER_ID)
	})

	test('skips a text node whose value is shorter than its source', () => {
		const body = 'A 5\\* rating is rare. Ten percent is more.'
		const tree: MdNode = {
			type: 'root',
			children: [
				{
					type: 'paragraph',
					position: { start: { offset: 0 }, end: { offset: body.length } },
					children: [
						{
							type: 'text',
							value: 'A 5* rating is rare. Ten percent is more.',
							position: { start: { offset: 0 }, end: { offset: body.length } },
						},
					],
				},
			],
		}
		transformReviewProse(tree, {
			paragraphs: splitParagraphs(body),
			ranges: [{ start: 21, end: 41, index: 0 }],
		})
		const paragraph = tree.children?.[0]
		expect(paragraph?.children?.length).toBe(1)
		expect(paragraph?.children?.[0]?.type).toBe('text')
	})
})
