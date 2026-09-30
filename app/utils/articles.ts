/**
 * Shared, browser-safe helpers for the article review pages (/admin/outreach).
 * Server-only logic lives in articles.server.ts.
 */

export const ARTICLE_STATUSES = [
	'pending',
	'approved',
	'denied',
	'changes_requested',
] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export type ArticleGroupKey =
	| 'review'
	| 'questions'
	| 'writer'
	| 'images'
	| 'reference'
	| 'approved'
	| 'denied'
	| 'sent'
	| 'withdrawn'

/**
 * Articles taken out of Sarah's review, by sync key, with the reason. They
 * never reach her phone, and /admin/outreach lists them in their own group.
 * Nothing the mini sends changes this list, so a metadata push never brings
 * one back. To bring one back, delete its line.
 *
 * Not a denial (2026-09-30): review_sync pull turns a denial into a ledger
 * change (needs_human).
 */
export const WITHDRAWN_ARTICLES: Readonly<Record<string, string>> = {
	'outreach:18':
		'Ledger row 1394. The newer article for this publisher, outreach:82, is approved.',
	'outreach:20':
		'Ledger row 1501 is on hold. The publisher cannot be reached.',
	'outreach:22':
		'Ledger row 1525 is bot_blocked. The publisher site does not load.',
	'outreach:36':
		'Ledger row 1523. The newer article for this publisher, outreach:94, is approved.',
	'outreach:39':
		'Ledger row 689. The newer article for this publisher, outreach:68, is approved.',
	'outreach:55':
		'Ledger row 1298. The text is the writer brief (brief.json), not an article. The article is outreach:78.',
	'outreach:56':
		'Ledger row 506. The text is the writer brief (brief.json), not an article. The article is outreach:76, approved.',
	'outreach:57':
		'Ledger row 658. The text is the writer brief (brief.json), not an article. No article was written.',
	'outreach:58':
		'Ledger row 730. The text is the writer brief (brief.json), not an article. No article was written.',
	'outreach:59':
		'Ledger row 583. The text is the writer brief (brief.json), not an article. No article was written.',
	'outreach:61':
		'Ledger row 729. The text is a 138-word placeholder. The article is outreach:86, approved.',
	'outreach:95':
		'Ledger row 1523. A second draft. Sarah approved outreach:94, and that text went to the publisher on 2026-09-30.',
}

/** Why an article is out of Sarah's review, or null when it is not. */
export function withdrawnReason(sourceKey: string): string | null {
	return WITHDRAWN_ARTICLES[sourceKey] ?? null
}

/** How long a Claude draft with no pictures waits for them. */
export const PICTURES_WAIT_MS = 24 * 60 * 60 * 1000

/**
 * A guest article whose pictures can still come. The mini makes pictures
 * only for the Claude-written (fable) drafts, a few runs after the text
 * arrives. After a day with none, none are coming (the draft has no picture
 * prompts, or the publisher takes no pictures), so it is ready as it is.
 */
export function waitsOnPictures(
	a: {
		kind: string
		imageCount: number
		writer: string | null
		receivedAt: Date | string
	},
	now: Date,
): boolean {
	return (
		a.kind === 'guest' &&
		a.imageCount === 0 &&
		(a.writer ?? '').startsWith('fable') &&
		now.getTime() - new Date(a.receivedAt).getTime() < PICTURES_WAIT_MS
	)
}

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
		key: 'questions',
		title: 'Questions',
		blurb:
			'Sarah asked something about these from her phone. Answer on the article page. The answer shows on her card.',
	},
	{
		key: 'writer',
		title: 'Waiting on the writer',
		blurb:
			'Sarah sent these back with a note. The writer makes the change and the article comes back to her as "Your change is in".',
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
	{
		key: 'withdrawn',
		title: 'Withdrawn from review',
		blurb:
			'Not for Sarah. The text is a writer brief or a placeholder, a newer article replaced it, or the work with the publisher stopped. The article page gives the reason. Sarah does not see these on her phone.',
	},
]

export function articleGroup(
	a: {
		sourceKey: string
		kind: string
		status: string
		isReference: boolean
		imageCount: number
		outreachStatus: string | null
		writer: string | null
		receivedAt: Date | string
		/** "Ask Zane" from the phone. An open question moves the row to Questions. */
		question?: string | null
		answer?: string | null
	},
	now: Date,
): ArticleGroupKey {
	if (a.status === 'approved') return 'approved'
	if (a.status === 'denied') return 'denied'
	if (a.status === 'changes_requested') return 'writer'
	if (withdrawnReason(a.sourceKey)) return 'withdrawn'
	if (a.question && !a.answer) return 'questions'
	if (a.kind === 'guest' && ['submitted', 'live'].includes(a.outreachStatus ?? ''))
		return 'sent'
	if (a.isReference) return 'reference'
	if (waitsOnPictures(a, now)) return 'images'
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
	if (status === 'changes_requested') return 'Changes requested'
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

/** The note above the editor for a publisher that takes only her own words. */
export const REFERENCE_NOTE =
	'This publisher takes only text you wrote yourself. Change the words below in your own way.'
