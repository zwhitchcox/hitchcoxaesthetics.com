import { describe, expect, test } from 'vitest'
import { parseRssItems, parseTopicsJson } from './podcast-topics.server.ts'

const RSS_SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>NewBeauty</title>
<item>
	<title><![CDATA[The Truth About &#8216;Baby Botox&#8217;]]></title>
	<link>https://www.newbeauty.com/baby-botox/</link>
	<pubDate>Mon, 08 Sep 2026 12:00:00 +0000</pubDate>
	<description><![CDATA[<p>Doctors weigh in on the <b>micro-dosing</b> trend.</p>]]></description>
</item>
<item>
	<title>Old story</title>
	<link>https://www.newbeauty.com/old/</link>
	<pubDate>Mon, 01 Jan 2024 12:00:00 +0000</pubDate>
</item>
</channel></rss>`

const ATOM_SAMPLE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
	<title>GLP-1 update</title>
	<link href="https://example.com/glp1" rel="alternate"/>
	<published>2026-09-07T09:00:00Z</published>
	<summary>Weekly roundup</summary>
</entry>
</feed>`

const GOOGLE_NEWS_SAMPLE = `<rss version="2.0"><channel>
<item>
	<title>Botox prices are changing - Dermatology Times</title>
	<link>https://news.google.com/rss/articles/abc123</link>
	<pubDate>Tue, 09 Sep 2026 08:00:00 GMT</pubDate>
	<source url="https://www.dermatologytimes.com">Dermatology Times</source>
</item>
</channel></rss>`

describe('parseRssItems', () => {
	test('parses RSS with CDATA, entities, and HTML in descriptions', () => {
		const items = parseRssItems(RSS_SAMPLE, 'NewBeauty')
		expect(items).toHaveLength(2)
		expect(items[0]).toMatchObject({
			title: "The Truth About 'Baby Botox'",
			url: 'https://www.newbeauty.com/baby-botox/',
			publisher: 'NewBeauty',
		})
		expect(items[0]!.summary).toContain('micro-dosing trend')
		expect(items[0]!.summary).not.toContain('<p>')
		expect(items[0]!.publishedAt).toContain('2026-09-08')
	})

	test('parses Atom entries with href links', () => {
		const items = parseRssItems(ATOM_SAMPLE, 'STAT Obesity')
		expect(items).toHaveLength(1)
		expect(items[0]).toMatchObject({
			title: 'GLP-1 update',
			url: 'https://example.com/glp1',
		})
	})

	test('uses the Google News source tag as publisher and trims it from the title', () => {
		const items = parseRssItems(GOOGLE_NEWS_SAMPLE, 'Google News: botox')
		expect(items).toHaveLength(1)
		expect(items[0]).toMatchObject({
			title: 'Botox prices are changing',
			publisher: 'Dermatology Times',
		})
	})
})

describe('parseTopicsJson', () => {
	test('parses a fenced JSON array and clamps fields', () => {
		const raw = [
			'Here are the ideas:',
			'```json',
			JSON.stringify([
				{
					title: 'Does Baby Botox actually last?',
					hook: 'Micro-dosing is trending.',
					outline: '- what it is\n- who it fits',
					score: 22,
					sourceIndexes: [0, 99],
					questions: ['how long does botox last?'],
				},
				{ notATopic: true },
			]),
			'```',
		].join('\n')
		const topics = parseTopicsJson(raw)
		expect(topics).toHaveLength(1)
		expect(topics[0]).toMatchObject({
			title: 'Does Baby Botox actually last?',
			score: 10,
			sourceIndexes: [0, 99],
			questions: ['how long does botox last?'],
		})
	})

	test('returns empty on junk', () => {
		expect(parseTopicsJson('no json here')).toEqual([])
		expect(parseTopicsJson('{"an":"object"}')).toEqual([])
	})
})
