/**
 * Shared, browser-safe helpers for the article review pages (/admin/articles).
 * Server-only logic lives in articles.server.ts.
 */

export const ARTICLE_STATUSES = ['pending', 'approved', 'denied'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export type ArticleGroupKey =
	| 'review'
	| 'images'
	| 'reference'
	| 'approved'
	| 'denied'
	| 'sent'

export const ARTICLE_GROUPS: Array<{
	key: ArticleGroupKey
	title: string
	blurb: string
}> = [
	{
		key: 'review',
		title: 'Ready for your review',
		blurb:
			'Read it, change anything you want, then approve or deny. An approved guest article goes to the publisher. An approved guide goes live on the blog.',
	},
	{
		key: 'images',
		title: 'Waiting on pictures',
		blurb:
			'The text is done and the pictures are still being made. You can read ahead. They are meant to be reviewed with the pictures.',
	},
	{
		key: 'reference',
		title: 'Needs your own words',
		blurb:
			'These publishers only take human-written text. Read the draft, change it into your own words, then approve. Your approved text is what gets sent.',
	},
	{ key: 'approved', title: 'Approved', blurb: '' },
	{ key: 'denied', title: 'Denied', blurb: '' },
	{
		key: 'sent',
		title: 'Sent before this review step existed',
		blurb:
			'These were sent to publishers earlier. They are here for the record. Changes on this page do not reach the publisher.',
	},
]

export function articleGroup(a: {
	kind: string
	status: string
	isReference: boolean
	imageCount: number
	outreachStatus: string | null
	writer: string | null
}): ArticleGroupKey {
	if (a.status === 'approved') return 'approved'
	if (a.status === 'denied') return 'denied'
	if (a.kind === 'guest' && ['submitted', 'live'].includes(a.outreachStatus ?? ''))
		return 'sent'
	if (a.isReference) return 'reference'
	// pictures are only planned for the Claude-written articles
	if (a.imageCount === 0 && (a.writer ?? '').startsWith('fable')) return 'images'
	return 'review'
}

export function countWords(text: string): number {
	const words = text
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/[#*_>`]/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
	return words.length
}

export function destinationLabel(a: {
	kind: string
	publication: string | null
	slug: string | null
}): string {
	if (a.kind === 'blog') return `hitchcoxaesthetics.com/blog/${a.slug ?? ''}`
	return a.publication ?? 'unknown publication'
}

export type ArticleLink = { name: string; url: string }

export function parseLinks(linksJson: string | null | undefined): ArticleLink[] {
	if (!linksJson) return []
	try {
		const parsed: unknown = JSON.parse(linksJson)
		if (!Array.isArray(parsed)) return []
		return parsed
			.filter(
				(l): l is ArticleLink =>
					typeof l === 'object' &&
					l !== null &&
					typeof (l as ArticleLink).url === 'string',
			)
			.map(l => ({ name: String(l.name ?? l.url), url: l.url }))
	} catch {
		return []
	}
}

/** The links the writer was told to place. Sarah can move them, but they must stay in the text. */
export function missingLinks(body: string, links: ArticleLink[]): ArticleLink[] {
	const text = body.toLowerCase()
	return links.filter(l => {
		const url = l.url.toLowerCase().replace(/\/+$/, '')
		return !text.includes(url)
	})
}

export function statusLabel(status: string): string {
	if (status === 'approved') return 'Approved'
	if (status === 'denied') return 'Denied'
	return 'Waiting for review'
}

export function formatDate(value: string | Date | null | undefined): string {
	if (!value) return ''
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return ''
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'America/New_York',
	})
}
