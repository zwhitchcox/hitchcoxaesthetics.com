import { afterEach, describe, expect, test, vi } from 'vitest'
import { action, loader } from '#app/routes/resources+/article-sync.ts'
import {
	SyncArticleSchema,
	estimateReadSeconds,
	hashBody,
	hashReviewAid,
	parseStoredReviewAid,
	upsertSyncedArticle,
	verifyReviewAidQuotes,
	type SyncArticle,
} from '#app/utils/articles.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * The approval-reset bug fix (spec section 6): a text push never changes a
 * decided article. These run against the per-worker copy of the test DB;
 * the harness empties every table after each test.
 */

const BODY = [
	'# Botox for TMJ',
	'',
	'Most patients need 20 to 30 units per side. Results last about 3 months.',
	'',
	'Sarah Hitchcox, RN, treats jaw pain at Sarah Hitchcox Aesthetics in Bearden.',
	'',
	'Book at [Botox Knox](https://botoxknox.com/) or read more on [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com/).',
].join('\n')

const HER_EDIT = BODY.replace('20 to 30 units', '20 to 40 units')
const NEW_TEXT = BODY.replace('about 3 months', 'about 4 months')

// A 1x1 PNG. Only the bytes matter to the upsert.
const PNG_B64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const NOW = new Date('2026-09-16T12:00:00.000Z')

function draft(
	sourceKey: string,
	over: Partial<SyncArticle> = {},
): SyncArticle {
	return SyncArticleSchema.parse({
		sourceKey,
		kind: 'guest',
		title: 'Botox for TMJ',
		publication: 'healthcareguys.com',
		body: BODY,
		wordCount: 46,
		links: [
			{ name: 'Botox Knox', url: 'https://botoxknox.com/' },
			{
				name: 'Sarah Hitchcox Aesthetics',
				url: 'https://hitchcoxaesthetics.com/',
			},
		],
		...over,
	})
}

function picture(fileName: string) {
	return {
		fileName,
		contentType: 'image/png',
		altText: `${fileName} alt`,
		caption: null,
		position: 0,
		dataBase64: PNG_B64,
	}
}

async function row(sourceKey: string) {
	return prisma.article.findUniqueOrThrow({
		where: { sourceKey },
		include: {
			images: { select: { fileName: true } },
			events: {
				select: { kind: true, note: true, at: true },
				orderBy: { at: 'asc' },
			},
		},
	})
}

/** Put a seeded article into a decided state, the way the admin page does. */
async function decide(
	sourceKey: string,
	status: 'approved' | 'denied' | 'changes_requested',
	extra: { body?: string; reviewNote?: string } = {},
) {
	const reviewedAt = new Date('2026-09-10T02:30:00.000Z')
	return prisma.article.update({
		where: { sourceKey },
		data: {
			status,
			reviewedAt,
			reviewedBy: 'Sarah Hitchcox',
			reviewNote: extra.reviewNote ?? null,
			...(extra.body
				? { body: extra.body, editedAt: reviewedAt, editedBy: 'Sarah Hitchcox' }
				: {}),
			...(status === 'approved' && extra.body
				? { approvedBodyHash: hashBody(extra.body) }
				: status === 'approved'
					? { approvedBodyHash: hashBody(BODY) }
					: {}),
		},
	})
}

describe('upsertSyncedArticle', () => {
	test('creates a pending article with its hash and read time', async () => {
		const res = await upsertSyncedArticle(draft('t:create'), { now: NOW })
		expect(res).toMatchObject({ changed: 'created', status: 'pending' })
		const a = await row('t:create')
		expect(a.bodyHash).toBe(hashBody(BODY))
		expect(a.bodyOriginal).toBe(BODY)
		expect(a.estimatedReadSeconds).toBe(estimateReadSeconds(46))
		expect(a.estimatedReadSeconds).toBe(12)
		expect(a.publisherWaiting).toBe(false)
		expect(a.placementUsd).toBeNull()
		expect(a.events).toEqual([])
	})

	test('same hash: meta, body untouched', async () => {
		await upsertSyncedArticle(draft('t:same'))
		const res = await upsertSyncedArticle(
			draft('t:same', { title: 'Botox for jaw pain', body: BODY + '\n' }),
		)
		expect(res.changed).toBe('meta')
		const a = await row('t:same')
		expect(a.title).toBe('Botox for jaw pain')
		expect(a.body).toBe(BODY)
	})

	test('her edit echoed back: meta, status stays approved', async () => {
		await upsertSyncedArticle(draft('t:echo'))
		const before = await decide('t:echo', 'approved', { body: HER_EDIT })
		const res = await upsertSyncedArticle(draft('t:echo', { body: HER_EDIT }))
		expect(res).toMatchObject({ changed: 'meta', status: 'approved' })
		const a = await row('t:echo')
		expect(a.status).toBe('approved')
		expect(a.body).toBe(HER_EDIT)
		expect(a.bodyHash).toBe(hashBody(BODY))
		expect(a.reviewedAt).toEqual(before.reviewedAt)
		expect(a.editedAt).toEqual(before.editedAt)
		expect(a.incomingBody).toBeNull()
	})

	test('new text over approved: kept, incoming set, decision untouched', async () => {
		await upsertSyncedArticle(draft('t:kept'))
		const before = await decide('t:kept', 'approved', { body: HER_EDIT })
		const res = await upsertSyncedArticle(draft('t:kept', { body: NEW_TEXT }), {
			now: NOW,
		})
		expect(res).toMatchObject({ changed: 'kept', status: 'approved' })
		const a = await row('t:kept')
		expect(a.status).toBe('approved')
		expect(a.body).toBe(HER_EDIT)
		expect(a.bodyOriginal).toBe(BODY)
		expect(a.bodyHash).toBe(hashBody(BODY))
		expect(a.approvedBodyHash).toBe(hashBody(HER_EDIT))
		expect(a.reviewedAt).toEqual(before.reviewedAt)
		expect(a.reviewedBy).toBe('Sarah Hitchcox')
		expect(a.editedAt).toEqual(before.editedAt)
		expect(a.reviewNote).toBeNull()
		expect(a.incomingBody).toBe(NEW_TEXT)
		expect(a.incomingBodyHash).toBe(hashBody(NEW_TEXT))
		expect(a.incomingAt).toEqual(NOW)

		// the same held text pushed again: still kept, first-arrival time stays
		const later = new Date('2026-09-16T12:15:00.000Z')
		const again = await upsertSyncedArticle(
			draft('t:kept', { body: NEW_TEXT }),
			{
				now: later,
			},
		)
		expect(again.changed).toBe('kept')
		expect((await row('t:kept')).incomingAt).toEqual(NOW)
	})

	test('new text over denied: kept', async () => {
		await upsertSyncedArticle(draft('t:denied'))
		await decide('t:denied', 'denied', { reviewNote: 'Not our voice.' })
		const res = await upsertSyncedArticle(draft('t:denied', { body: NEW_TEXT }))
		expect(res).toMatchObject({ changed: 'kept', status: 'denied' })
		const a = await row('t:denied')
		expect(a.status).toBe('denied')
		expect(a.reviewNote).toBe('Not our voice.')
		expect(a.body).toBe(BODY)
		expect(a.incomingBody).toBe(NEW_TEXT)
	})

	test('new text over pending: text replaced, her edit cleared, note set', async () => {
		await upsertSyncedArticle(draft('t:pending'))
		await prisma.article.update({
			where: { sourceKey: 't:pending' },
			data: { body: HER_EDIT, editedAt: NOW, editedBy: 'Sarah Hitchcox' },
		})
		const res = await upsertSyncedArticle(
			draft('t:pending', { body: NEW_TEXT, wordCount: 460 }),
			{ now: NOW },
		)
		expect(res).toMatchObject({ changed: 'text', status: 'pending' })
		const a = await row('t:pending')
		expect(a.body).toBe(NEW_TEXT)
		expect(a.bodyOriginal).toBe(NEW_TEXT)
		expect(a.bodyHash).toBe(hashBody(NEW_TEXT))
		expect(a.previousBody).toBe(HER_EDIT)
		expect(a.editedAt).toBeNull()
		expect(a.editedBy).toBeNull()
		expect(a.reviewedAt).toBeNull()
		expect(a.reviewNote).toBe('The writer sent new text on 2026-09-16.')
		expect(a.receivedAt).toEqual(NOW)
		expect(a.estimatedReadSeconds).toBe(120)
	})

	test('revision over changes_requested: revision, status pending, note kept', async () => {
		await upsertSyncedArticle(draft('t:rev'))
		await decide('t:rev', 'changes_requested', {
			reviewNote: 'Say 2 to 4 units, not 5.',
		})
		const res = await upsertSyncedArticle(
			draft('t:rev', { body: NEW_TEXT, revision: true }),
			{ now: NOW },
		)
		expect(res).toMatchObject({ changed: 'revision', status: 'pending' })
		const a = await row('t:rev')
		expect(a.status).toBe('pending')
		expect(a.body).toBe(NEW_TEXT)
		expect(a.bodyHash).toBe(hashBody(NEW_TEXT))
		expect(a.revisionNote).toBe('Say 2 to 4 units, not 5.')
		expect(a.revisionBaseBody).toBe(BODY)
		expect(a.reviewNote).toBeNull()
		expect(a.reviewedAt).toBeNull()
		expect(a.reviewedBy).toBeNull()
		expect(a.receivedAt).toEqual(NOW)
	})

	test('new text over pending: read markers cleared', async () => {
		await upsertSyncedArticle(draft('t:pending-read'))
		await prisma.article.update({
			where: { sourceKey: 't:pending-read' },
			data: { readToParagraph: 2, readReachedEndAt: NOW },
		})
		const res = await upsertSyncedArticle(
			draft('t:pending-read', { body: NEW_TEXT }),
			{ now: NOW },
		)
		expect(res).toMatchObject({ changed: 'text' })
		const a = await row('t:pending-read')
		expect(a.readToParagraph).toBeNull()
		expect(a.readReachedEndAt).toBeNull()
	})

	test('revision over changes_requested: read markers cleared', async () => {
		await upsertSyncedArticle(draft('t:rev-read'))
		await decide('t:rev-read', 'changes_requested', {
			reviewNote: 'Say 2 to 4 units, not 5.',
		})
		await prisma.article.update({
			where: { sourceKey: 't:rev-read' },
			data: { readToParagraph: 2, readReachedEndAt: NOW },
		})
		const res = await upsertSyncedArticle(
			draft('t:rev-read', { body: NEW_TEXT, revision: true }),
			{ now: NOW },
		)
		expect(res).toMatchObject({ changed: 'revision', status: 'pending' })
		const a = await row('t:rev-read')
		expect(a.readToParagraph).toBeNull()
		expect(a.readReachedEndAt).toBeNull()
	})

	test('changes_requested without the flag: kept', async () => {
		await upsertSyncedArticle(draft('t:cr-noflag'))
		await decide('t:cr-noflag', 'changes_requested', { reviewNote: 'Shorter.' })
		const res = await upsertSyncedArticle(
			draft('t:cr-noflag', { body: NEW_TEXT }),
		)
		expect(res).toMatchObject({ changed: 'kept', status: 'changes_requested' })
		const a = await row('t:cr-noflag')
		expect(a.status).toBe('changes_requested')
		expect(a.reviewNote).toBe('Shorter.')
		expect(a.body).toBe(BODY)
		expect(a.incomingBody).toBe(NEW_TEXT)
	})

	test('revision flag over approved: kept', async () => {
		await upsertSyncedArticle(draft('t:rev-approved'))
		await decide('t:rev-approved', 'approved')
		const res = await upsertSyncedArticle(
			draft('t:rev-approved', { body: NEW_TEXT, revision: true }),
		)
		expect(res).toMatchObject({ changed: 'kept', status: 'approved' })
		const a = await row('t:rev-approved')
		expect(a.status).toBe('approved')
		expect(a.body).toBe(BODY)
		expect(a.revisionNote).toBeNull()
		expect(a.incomingBody).toBe(NEW_TEXT)
	})

	test('no body for a known article: meta, and the ledger fields land', async () => {
		await upsertSyncedArticle(draft('t:nobody'))
		const res = await upsertSyncedArticle(
			draft('t:nobody', {
				body: undefined,
				title: 'Renamed',
				publisherWaiting: true,
				placementUsd: 150,
			}),
		)
		expect(res.changed).toBe('meta')
		let a = await row('t:nobody')
		expect(a.title).toBe('Renamed')
		expect(a.body).toBe(BODY)
		expect(a.publisherWaiting).toBe(true)
		expect(a.placementUsd).toBe(150)

		// omitted: unchanged; null: cleared
		await upsertSyncedArticle(draft('t:nobody', { body: undefined }))
		a = await row('t:nobody')
		expect(a.publisherWaiting).toBe(true)
		expect(a.placementUsd).toBe(150)
		await upsertSyncedArticle(
			draft('t:nobody', {
				body: undefined,
				publisherWaiting: false,
				placementUsd: null,
			}),
		)
		a = await row('t:nobody')
		expect(a.publisherWaiting).toBe(false)
		expect(a.placementUsd).toBeNull()
	})

	test('no body for an unknown article: refused', async () => {
		await expect(
			upsertSyncedArticle(draft('t:unknown', { body: undefined })),
		).rejects.toMatchObject({ name: 'ArticleSyncError', status: 400 })
		expect(
			await prisma.article.count({ where: { sourceKey: 't:unknown' } }),
		).toBe(0)
	})
})

describe('pictures', () => {
	test('empty images without clearImages: pictures stay', async () => {
		await upsertSyncedArticle(
			draft('t:img', {
				images: [picture('image-1.png'), picture('image-2.png')],
			}),
		)
		expect((await row('t:img')).images).toHaveLength(2)
		await upsertSyncedArticle(draft('t:img', { images: [] }))
		expect((await row('t:img')).images).toHaveLength(2)
	})

	test('empty images with clearImages: pictures deleted', async () => {
		await upsertSyncedArticle(
			draft('t:img-clear', { images: [picture('image-1.png')] }),
		)
		await upsertSyncedArticle(
			draft('t:img-clear', { images: [], clearImages: true }),
		)
		expect((await row('t:img-clear')).images).toHaveLength(0)
	})

	test('a new list replaces the set, as before', async () => {
		await upsertSyncedArticle(
			draft('t:img-swap', {
				images: [picture('image-1.png'), picture('image-2.png')],
			}),
		)
		await upsertSyncedArticle(
			draft('t:img-swap', { images: [picture('image-3.png')] }),
		)
		expect((await row('t:img-swap')).images.map(i => i.fileName)).toEqual([
			'image-3.png',
		])
	})
})

describe('review aid', () => {
	const aid = {
		claims: [
			{ quote: 'Most patients need 20 to 30 units per side.' },
			// whitespace differs from the text: still a match
			{ quote: 'Results   last about\n3 months.' },
			// not in the text: dropped
			{ quote: 'Botox cures migraines.' },
			// duplicate: folded
			{ quote: 'Most patients need 20 to 30 units per side.' },
		],
		credentials: [{ quote: 'Sarah Hitchcox, RN, treats jaw pain' }],
		rules: ['No prices', ' '],
	}

	test('verifyReviewAidQuotes keeps exact substrings and counts the rest', () => {
		const v = verifyReviewAidQuotes(BODY, aid)
		expect(v.claims.map(c => c.quote)).toEqual([
			'Most patients need 20 to 30 units per side.',
			'Results last about 3 months.',
		])
		expect(v.credentials).toEqual([
			{ quote: 'Sarah Hitchcox, RN, treats jaw pain' },
		])
		expect(v.rules).toEqual(['No prices'])
		expect(v.dropped).toBe(1)
		for (const q of [...v.claims, ...v.credentials]) {
			expect(BODY.includes(q.quote)).toBe(true)
		}
	})

	test('a quote across a line break maps back to the exact body text', () => {
		const body = 'Take 20 units\nper side.  Then rest.'
		const v = verifyReviewAidQuotes(body, {
			claims: [{ quote: 'Take 20 units per side. Then' }],
			credentials: [],
			rules: [],
		})
		expect(v.claims).toEqual([{ quote: 'Take 20 units\nper side.  Then' }])
		expect(v.dropped).toBe(0)
	})

	test('stored on create and on a pending update, with its hash', async () => {
		const res = await upsertSyncedArticle(draft('t:aid', { reviewAid: aid }))
		expect(res.reviewAidDropped).toBe(1)
		const a = await row('t:aid')
		const stored = parseStoredReviewAid(a.reviewAidJson)
		expect(stored?.claims).toHaveLength(2)
		expect(stored?.dropped).toBe(1)
		expect(a.reviewAidHash).toBe(hashReviewAid(a.reviewAidJson!))

		// her edit changed a claim: the list is re-verified against what she sees
		await prisma.article.update({
			where: { sourceKey: 't:aid' },
			data: { body: HER_EDIT, editedAt: NOW, editedBy: 'Sarah Hitchcox' },
		})
		const meta = await upsertSyncedArticle(draft('t:aid', { reviewAid: aid }))
		expect(meta.changed).toBe('meta')
		expect(meta.reviewAidDropped).toBe(2)
		expect(
			parseStoredReviewAid((await row('t:aid')).reviewAidJson)?.claims,
		).toEqual([{ quote: 'Results last about 3 months.' }])
	})

	test('not stored on a decided article', async () => {
		await upsertSyncedArticle(draft('t:aid-decided'))
		await decide('t:aid-decided', 'approved')
		const res = await upsertSyncedArticle(
			draft('t:aid-decided', { body: NEW_TEXT, reviewAid: aid }),
		)
		expect(res.changed).toBe('kept')
		expect(res.reviewAidDropped).toBeUndefined()
		expect((await row('t:aid-decided')).reviewAidJson).toBeNull()
	})
})

describe('feed events', () => {
	test('sent when outreachStatus becomes submitted, live when liveUrl appears', async () => {
		// a create never writes a feed event, even for an already-sent article
		await upsertSyncedArticle(draft('t:ev', { outreachStatus: 'quoted' }))
		expect((await row('t:ev')).events).toEqual([])

		await upsertSyncedArticle(
			draft('t:ev', { body: undefined, outreachStatus: 'submitted' }),
			{ now: NOW },
		)
		let events = (await row('t:ev')).events
		expect(events).toMatchObject([{ kind: 'sent', note: 'healthcareguys.com' }])
		expect(events[0]!.at).toEqual(NOW)

		// repeat pushes do not repeat the event
		await upsertSyncedArticle(
			draft('t:ev', { body: undefined, outreachStatus: 'submitted' }),
		)
		expect((await row('t:ev')).events).toHaveLength(1)

		await upsertSyncedArticle(
			draft('t:ev', {
				body: undefined,
				outreachStatus: 'live',
				liveUrl: 'https://healthcareguys.com/botox-tmj',
			}),
			{ now: new Date('2026-09-17T12:00:00.000Z') },
		)
		events = (await row('t:ev')).events
		expect(events.map(e => e.kind)).toEqual(['sent', 'live'])
		expect(events[1]!.note).toBe('https://healthcareguys.com/botox-tmj')
	})
})

describe('/resources/article-sync', () => {
	const TOKEN = 'test-sync-token'
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	function post(body: unknown) {
		vi.stubEnv('ARTICLE_SYNC_TOKEN', TOKEN)
		return action({
			request: new Request('http://localhost/resources/article-sync', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			}),
			params: {},
			context: {},
		})
	}

	function get(since?: string) {
		vi.stubEnv('ARTICLE_SYNC_TOKEN', TOKEN)
		const url = new URL('http://localhost/resources/article-sync')
		if (since) url.searchParams.set('since', since)
		return loader({
			request: new Request(url, {
				headers: { Authorization: `Bearer ${TOKEN}` },
			}),
			params: {},
			context: {},
		})
	}

	test('create without body: 400 and nothing written', async () => {
		const res = await post({
			articles: [
				draft('t:route-ok'),
				{ ...draft('t:route-nobody'), body: undefined },
			],
		})
		expect(res.status).toBe(400)
		const data = (await res.json()) as { error: string; sourceKey: string }
		expect(data.sourceKey).toBe('t:route-nobody')
		expect(data.error).toMatch(/body is required/)
		// the batch was refused before any write
		expect(
			await prisma.article.count({ where: { sourceKey: 't:route-ok' } }),
		).toBe(0)
	})

	test('results carry kept and revision; GET returns the new fields', async () => {
		let res = await post({ articles: [draft('t:route-a'), draft('t:route-b')] })
		expect(res.status).toBe(200)
		await decide('t:route-a', 'approved', { body: HER_EDIT })
		await decide('t:route-b', 'changes_requested', {
			reviewNote: 'Add a warning.',
		})
		await prisma.article.update({
			where: { sourceKey: 't:route-a' },
			data: {
				question: 'Is this publisher real?',
				questionAt: NOW,
				answer: 'Yes.',
			},
		})

		res = await post({
			articles: [
				draft('t:route-a', { body: NEW_TEXT }),
				draft('t:route-b', { body: NEW_TEXT, revision: true }),
			],
		})
		expect(res.status).toBe(200)
		const { results } = (await res.json()) as {
			results: Array<{ sourceKey: string; changed: string; status: string }>
		}
		expect(results).toMatchObject([
			{ sourceKey: 't:route-a', changed: 'kept', status: 'approved' },
			{ sourceKey: 't:route-b', changed: 'revision', status: 'pending' },
		])

		const got = (await get()).json() as Promise<{
			articles: Array<Record<string, unknown>>
		}>
		const rows = (await got).articles
		const a = rows.find(r => r.sourceKey === 't:route-a')!
		expect(a).toMatchObject({
			status: 'approved',
			approvedBodyHash: hashBody(HER_EDIT),
			body: HER_EDIT,
			question: 'Is this publisher real?',
			answer: 'Yes.',
		})
		expect(a.questionAt).toBe(NOW.toISOString())
		const b = rows.find(r => r.sourceKey === 't:route-b')!
		expect(b).toMatchObject({ status: 'pending', approvedBodyHash: null })
		expect(b.body).toBeUndefined()
	})

	test('GET lists a changes_requested row with her note', async () => {
		await post({ articles: [draft('t:route-cr')] })
		await decide('t:route-cr', 'changes_requested', { reviewNote: 'Shorter.' })
		const { articles } = (await (await get()).json()) as {
			articles: Array<Record<string, unknown>>
		}
		expect(articles.find(r => r.sourceKey === 't:route-cr')).toMatchObject({
			status: 'changes_requested',
			reviewNote: 'Shorter.',
		})
	})

	test('no token: 401', async () => {
		vi.stubEnv('ARTICLE_SYNC_TOKEN', TOKEN)
		const res = await action({
			request: new Request('http://localhost/resources/article-sync', {
				method: 'POST',
				body: '{}',
			}),
			params: {},
			context: {},
		})
		expect(res.status).toBe(401)
	})
})
