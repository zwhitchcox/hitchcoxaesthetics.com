/**
 * Podcast topic engine: pulls recent industry news from verified RSS feeds
 * and recent client questions from CallRail texts, then asks the LLM for
 * episode ideas Sarah can accept or dismiss in /admin/podcast.
 *
 * Feed URLs were fetch-verified 2026-09-09. Some hosts block generic
 * clients, so every fetch sends a browser User-Agent.
 */
import { getCallIntelligenceConfig } from '#app/utils/call-intelligence.server.ts'
import {
	callRailFetch,
	getCallRailAccountIds,
} from '#app/utils/callrail-booking.server.ts'
import { prisma } from '#app/utils/db.server.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const FEED_TIMEOUT_MS = 15_000
const NEWS_WINDOW_DAYS = 14
const QUESTION_WINDOW_DAYS = 30
const MAX_ITEMS_PER_FEED = 8
const MAX_NEWS_ITEMS = 70
const MAX_CLIENT_QUESTIONS = 50
const BROWSER_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

interface FeedSource {
	name: string
	url: string
	category: 'industry' | 'beauty press' | 'weight loss'
}

const FEED_SOURCES: FeedSource[] = [
	// Trade / industry
	{ name: 'AmSpa', url: 'https://www.americanmedspa.org/feed/', category: 'industry' },
	{ name: 'Plastic Surgery Practice', url: 'https://plasticsurgerypractice.com/feed/', category: 'industry' },
	{ name: 'Aesthetics Journal', url: 'https://aestheticsjournal.com/feed', category: 'industry' },
	{ name: 'Dermatology Times', url: 'https://news.google.com/rss/search?q=site:dermatologytimes.com+when:30d&hl=en-US&gl=US&ceid=US:en', category: 'industry' },
	{ name: 'Google News: botox', url: 'https://news.google.com/rss/search?q=botox+when:14d&hl=en-US&gl=US&ceid=US:en', category: 'industry' },
	{ name: 'Google News: med spa', url: 'https://news.google.com/rss/search?q=%22med+spa%22+when:14d&hl=en-US&gl=US&ceid=US:en', category: 'industry' },
	// Consumer beauty press (what clients read and react to)
	{ name: 'Allure Skin', url: 'https://www.allure.com/feed/skin-care/rss', category: 'beauty press' },
	{ name: 'NewBeauty', url: 'https://www.newbeauty.com/feed/', category: 'beauty press' },
	{ name: "Harper's Bazaar Beauty", url: 'https://www.harpersbazaar.com/rss/beauty.xml', category: 'beauty press' },
	{ name: 'Vogue Beauty', url: 'https://www.vogue.com/feed/beauty/rss', category: 'beauty press' },
	// GLP-1 / weight loss medicine
	{ name: 'STAT Obesity', url: 'https://www.statnews.com/topic/obesity/feed/', category: 'weight loss' },
	{ name: 'MedPage Endocrinology', url: 'https://www.medpagetoday.com/rss/endocrinology.xml', category: 'weight loss' },
	{ name: 'Google News: GLP-1', url: 'https://news.google.com/rss/search?q=semaglutide+OR+tirzepatide+when:14d&hl=en-US&gl=US&ceid=US:en', category: 'weight loss' },
]

export interface NewsItem {
	title: string
	url: string
	publisher: string
	publishedAt: string | null
	summary: string
}

export interface TopicCard {
	title: string
	hook: string
	outline: string
	score: number
	sources: NewsItem[]
	questions: string[]
}

export function hasPodcastTopicsConfig() {
	return Boolean(getCallIntelligenceConfig())
}

/** Strip tags, decode the entities feeds actually use, collapse whitespace. */
function cleanText(value: string) {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#8216;/g, "'")
		.replace(/&#82[20|21]\d?;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function firstTag(block: string, tags: string[]) {
	for (const tag of tags) {
		const match = block.match(
			new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'),
		)
		if (match?.[1]) return match[1]
	}
	return null
}

/**
 * Minimal RSS 2.0 / Atom item parser. The repo has no XML dependency and
 * these feeds are machine-generated, so tag-scoped regex is enough.
 */
export function parseRssItems(xml: string, publisher: string): NewsItem[] {
	const blocks = [
		...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
		...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
	].map(m => m[0])
	const items: NewsItem[] = []
	for (const block of blocks) {
		const rawTitle = firstTag(block, ['title'])
		if (!rawTitle) continue
		let title = cleanText(rawTitle)
		// Google News appends " - Publisher" to titles; keep it as the publisher.
		let itemPublisher = publisher
		const sourceTag = firstTag(block, ['source'])
		if (sourceTag) {
			itemPublisher = cleanText(sourceTag)
			title = title.replace(new RegExp(`\\s+-\\s+${escapeRegExp(itemPublisher)}$`), '')
		}
		let url = cleanText(firstTag(block, ['link', 'guid']) ?? '')
		if (!url) {
			// Atom links live in the href attribute.
			const href = block.match(/<link[^>]*href="([^"]+)"/i)
			url = href?.[1] ? cleanText(href[1]) : ''
		}
		const rawDate = firstTag(block, ['pubDate', 'published', 'updated', 'dc:date'])
		const parsedMs = rawDate ? Date.parse(cleanText(rawDate)) : NaN
		const summary = cleanText(
			firstTag(block, ['description', 'summary', 'content:encoded', 'content']) ?? '',
		).slice(0, 280)
		if (!title || !url) continue
		items.push({
			title,
			url,
			publisher: itemPublisher,
			publishedAt: Number.isFinite(parsedMs)
				? new Date(parsedMs).toISOString()
				: null,
			summary,
		})
	}
	return items
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function fetchFeed(source: FeedSource): Promise<NewsItem[]> {
	try {
		const response = await fetch(source.url, {
			headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
			signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
		})
		if (!response.ok) return []
		const xml = await response.text()
		const cutoffMs = Date.now() - NEWS_WINDOW_DAYS * 24 * 3600 * 1000
		return parseRssItems(xml, source.name)
			.filter(item => !item.publishedAt || Date.parse(item.publishedAt) >= cutoffMs)
			.slice(0, MAX_ITEMS_PER_FEED)
	} catch (error) {
		console.error(`Podcast topics: feed failed ${source.name}:`, error)
		return []
	}
}

/**
 * Recent client questions from CallRail text threads: inbound messages that
 * read like questions. The LLM does the final filtering, this just gathers
 * candidates.
 */
async function fetchClientQuestions(): Promise<string[]> {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) return []
	const cutoffMs = Date.now() - QUESTION_WINDOW_DAYS * 24 * 3600 * 1000
	const questions: string[] = []
	const seen = new Set<string>()
	try {
		for (const accountId of await getCallRailAccountIds(apiKey)) {
			const res = await callRailFetch(apiKey, `/a/${accountId}/text-messages.json`, {
				method: 'GET',
				params: new URLSearchParams({ per_page: '100' }),
			}).catch(() => null)
			for (const convo of (Array.isArray(res?.conversations)
				? res.conversations
				: []) as Array<Record<string, any>>) {
				for (const msg of (Array.isArray(convo.recent_messages)
					? convo.recent_messages
					: []) as Array<Record<string, any>>) {
					if (String(msg.direction ?? '').includes('out')) continue
					const atMs = Date.parse(String(msg.created_at ?? ''))
					if (!Number.isFinite(atMs) || atMs < cutoffMs) continue
					const content = String(msg.content ?? '').trim()
					if (content.length < 12 || content.length > 400) continue
					const looksLikeQuestion =
						content.includes('?') ||
						/^(how|what|when|do|does|can|is|are|will|should|would|any)\b/i.test(content)
					if (!looksLikeQuestion) continue
					const key = content.toLowerCase().slice(0, 60)
					if (seen.has(key)) continue
					seen.add(key)
					questions.push(content)
				}
			}
		}
	} catch (error) {
		console.error('Podcast topics: CallRail questions failed:', error)
	}
	return questions.slice(0, MAX_CLIENT_QUESTIONS)
}

/** Parse the LLM reply: a JSON array, possibly inside a code fence. */
export function parseTopicsJson(raw: string): Array<{
	title: string
	hook: string
	outline: string
	score: number
	sourceIndexes: number[]
	questions: string[]
}> {
	const unfenced = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim()
	const start = unfenced.indexOf('[')
	const end = unfenced.lastIndexOf(']')
	if (start < 0 || end <= start) return []
	let parsed: unknown
	try {
		parsed = JSON.parse(unfenced.slice(start, end + 1))
	} catch {
		return []
	}
	if (!Array.isArray(parsed)) return []
	return parsed
		.filter(
			(t): t is Record<string, unknown> =>
				Boolean(t) && typeof t === 'object' && typeof (t as any).title === 'string',
		)
		.map(t => ({
			title: String(t.title).slice(0, 160),
			hook: typeof t.hook === 'string' ? t.hook.slice(0, 500) : '',
			outline: typeof t.outline === 'string' ? t.outline.slice(0, 2000) : '',
			score: Math.max(1, Math.min(10, Math.round(Number(t.score) || 5))),
			sourceIndexes: Array.isArray(t.sourceIndexes)
				? t.sourceIndexes.map(Number).filter(Number.isInteger)
				: [],
			questions: Array.isArray(t.questions)
				? t.questions.map(String).slice(0, 6)
				: [],
		}))
}

async function generateTopics(input: {
	news: NewsItem[]
	clientQuestions: string[]
	existingTitles: string[]
	limit: number
}): Promise<TopicCard[]> {
	const config = getCallIntelligenceConfig()
	if (!config) return []
	const newsList = input.news
		.map(
			(n, i) =>
				`${i}. [${n.publisher}] ${n.title}${n.summary ? ` :: ${n.summary}` : ''}`,
		)
		.join('\n')
	const questionList = input.clientQuestions.length
		? input.clientQuestions.map(q => `- ${q}`).join('\n')
		: '(none gathered this run)'
	const avoidList = input.existingTitles.length
		? input.existingTitles.map(t => `- ${t}`).join('\n')
		: '(none)'
	const prompt = `You plan podcast episodes for "Sarah Hitchcox, RN, BSN", who owns a med spa in Knoxville, TN (Botox/Dysport, dermal filler, skincare, laser, and a GLP-1 weight loss program). The audience is her clients and local prospective clients, not industry peers. Episodes are 15-25 minutes, one host talking to a camera, sometimes reacting to an article on screen.

Propose up to ${input.limit} episode ideas. Good ideas are timely (tied to the news below), answer what real clients ask, and let a nurse give a grounded, myth-busting, non-salesy take. Skip: pure business/industry-ops stories clients would not care about, anything she covered before (list below), and celebrity gossip without a treatment angle.

RECENT NEWS (numbered):
${newsList}

REAL CLIENT QUESTIONS (from texts to the spa, last 30 days):
${questionList}

ALREADY COVERED OR REJECTED (do not repeat or lightly rephrase):
${avoidList}

Reply with ONLY a JSON array. Each element:
{
  "title": "episode title, spoken language, no clickbait",
  "hook": "1-2 sentences: the angle and why now",
  "outline": "4-6 markdown bullet talking points",
  "score": 1-10 how strong this idea is for HER audience,
  "sourceIndexes": [numbers of the news items it draws on, can be empty],
  "questions": ["verbatim client questions it answers, can be empty"]
}`
	const response = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: config.model,
			messages: [{ role: 'user', content: prompt }],
		}),
		signal: AbortSignal.timeout(120_000),
	})
	if (!response.ok) {
		console.error(`Podcast topics: OpenRouter ${response.status}`)
		return []
	}
	const payload = (await response.json().catch(() => null)) as {
		choices?: Array<{ message?: { content?: string } }>
	} | null
	const raw = payload?.choices?.[0]?.message?.content ?? ''
	return parseTopicsJson(raw).map(t => ({
		title: t.title,
		hook: t.hook,
		outline: t.outline,
		score: t.score,
		sources: t.sourceIndexes
			.filter(i => i >= 0 && i < input.news.length)
			.map(i => input.news[i]!),
		questions: t.questions,
	}))
}

/** One mining run: gather news + questions, generate cards, store proposed. */
export async function minePodcastTopics(limit = 8): Promise<{
	newsItems: number
	clientQuestions: number
	proposed: number
}> {
	const feedResults = await Promise.all(FEED_SOURCES.map(fetchFeed))
	// Interleave so one chatty feed cannot crowd the rest out of the cap.
	const news: NewsItem[] = []
	const seenUrls = new Set<string>()
	for (let round = 0; news.length < MAX_NEWS_ITEMS; round++) {
		let added = false
		for (const items of feedResults) {
			const item = items[round]
			if (!item || news.length >= MAX_NEWS_ITEMS) continue
			if (seenUrls.has(item.url)) continue
			seenUrls.add(item.url)
			news.push(item)
			added = true
		}
		if (!added) break
	}

	const clientQuestions = await fetchClientQuestions()

	// Everything proposed in the last 90 days, INCLUDING dismissed: a
	// dismissed idea must not come back reworded next run.
	const existing = await prisma.podcastTopic.findMany({
		where: {
			createdAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
		},
		select: { title: true },
		orderBy: { createdAt: 'desc' },
		take: 120,
	})

	const cards = await generateTopics({
		news,
		clientQuestions,
		existingTitles: existing.map(e => e.title),
		limit,
	})

	const batchKey = new Date().toISOString().slice(0, 10)
	let proposed = 0
	for (const card of cards) {
		if (!card.title || !card.outline) continue
		await prisma.podcastTopic.create({
			data: {
				title: card.title,
				hook: card.hook,
				outline: card.outline,
				score: card.score,
				sourcesJson: JSON.stringify(card.sources),
				questionsJson: JSON.stringify(card.questions),
				batchKey,
			},
		})
		proposed++
	}
	console.log(
		`Podcast topics: ${news.length} news items + ${clientQuestions.length} client questions -> ${proposed} proposed`,
	)
	return { newsItems: news.length, clientQuestions: clientQuestions.length, proposed }
}
