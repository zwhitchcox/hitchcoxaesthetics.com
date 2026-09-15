import { describe, expect, test } from 'vitest'
import {
	afterDecision,
	cardReadSeconds,
	clearReviewSitting,
	fitsLane,
	fitsRemaining,
	getReviewLane,
	getReviewSitting,
	holdReason,
	laneSeconds,
	orderCards,
	parseLane,
	parseSitting,
	remainingSeconds,
	serializeSitting,
	setReviewLane,
	setReviewSitting,
	startSitting,
	waitsOnPictures,
	type QueueArticle,
} from './review-queue.server.ts'

const NOW = new Date('2026-09-15T12:00:00.000Z')

function article(id: string, over: Partial<QueueArticle> = {}): QueueArticle {
	return {
		id,
		kind: 'guest',
		status: 'pending',
		isReference: false,
			wordCount: 400,
		imageCount: 2,
		writer: 'fable-5.1',
		publisherWaiting: false,
		placementUsd: null,
		revisionNote: null,
		readToParagraph: null,
		skippedUntil: null,
		editedAt: null,
		receivedAt: new Date('2026-09-01T00:00:00.000Z'),
		...over,
	}
}

const ids = (cards: ReturnType<typeof orderCards>) =>
	cards.map(c => c.article.id)

describe('lanes', () => {
	test('laneSeconds is the lane in seconds', () => {
		expect(laneSeconds(2)).toBe(120)
		expect(laneSeconds(5)).toBe(300)
		expect(laneSeconds(10)).toBe(600)
	})

	test('fitsLane caps 2 and 5, never 10', () => {
		expect(fitsLane(120, 2)).toBe(true)
		expect(fitsLane(121, 2)).toBe(false)
		expect(fitsLane(300, 5)).toBe(true)
		expect(fitsLane(301, 5)).toBe(false)
		expect(fitsLane(9999, 10)).toBe(true)
	})

	test('parseLane reads cookie strings and falls back to 5', () => {
		expect(parseLane('2')).toBe(2)
		expect(parseLane(10)).toBe(10)
		expect(parseLane('7')).toBe(5)
		expect(parseLane(undefined)).toBe(5)
		expect(parseLane('abc')).toBe(5)
	})

	test('cardReadSeconds prefers the stored estimate', () => {
		expect(
			cardReadSeconds({ wordCount: 460, estimatedReadSeconds: null }),
		).toBe(120)
		expect(cardReadSeconds({ wordCount: 460, estimatedReadSeconds: 90 })).toBe(
			90,
		)
		expect(cardReadSeconds({ wordCount: null })).toBe(0)
	})
})

describe('holdReason', () => {
	test('serves a plain pending guest article with pictures', () => {
		expect(holdReason(article('a'), NOW)).toBeNull()
	})

	test('holds own-words rows', () => {
		expect(holdReason(article('a', { isReference: true }), NOW)).toBe(
			'own-words',
		)
	})

	test('holds decided articles', () => {
		expect(holdReason(article('a', { status: 'approved' }), NOW)).toBe(
			'decided',
		)
		expect(holdReason(article('a', { status: 'denied' }), NOW)).toBe('decided')
		expect(holdReason(article('a', { status: 'changes_requested' }), NOW)).toBe(
			'decided',
		)
		expect(holdReason(article('a', { status: 'weird' }), NOW)).toBe('decided')
	})

	test('serves a decided article with new text only when asked', () => {
		const a = article('a', { status: 'approved', incomingBody: 'new text' })
		expect(holdReason(a, NOW)).toBe('decided')
		expect(holdReason(a, NOW, { includeIncoming: true })).toBeNull()
		const noText = article('b', { status: 'approved', incomingBody: '' })
		expect(holdReason(noText, NOW, { includeIncoming: true })).toBe('decided')
	})

	test('holds "Later" until skippedUntil passes', () => {
		const future = new Date(NOW.getTime() + 1000)
		const past = new Date(NOW.getTime() - 1000)
		expect(holdReason(article('a', { skippedUntil: future }), NOW)).toBe(
			'later',
		)
		expect(
			holdReason(article('a', { skippedUntil: past.toISOString() }), NOW),
		).toBeNull()
	})

	test('holds an article Zane edited in the last 10 minutes', () => {
		const nineMin = new Date(NOW.getTime() - 9 * 60 * 1000)
		const tenMin = new Date(NOW.getTime() - 10 * 60 * 1000)
		expect(holdReason(article('a', { editedAt: nineMin }), NOW)).toBe('editing')
		expect(holdReason(article('a', { editedAt: tenMin }), NOW)).toBeNull()
	})

	test('holds a fable guest article with no pictures, not a blog post', () => {
		expect(holdReason(article('a', { imageCount: 0 }), NOW)).toBe('pictures')
		expect(
			holdReason(article('a', { kind: 'blog', imageCount: 0 }), NOW),
		).toBeNull()
	})

	test('serves a Codex or Zane guest article with no pictures: none are coming', () => {
		expect(
			holdReason(article('a', { imageCount: 0, writer: 'codex' }), NOW),
		).toBeNull()
		expect(
			holdReason(article('a', { imageCount: 0, writer: 'zane' }), NOW),
		).toBeNull()
		expect(
			holdReason(article('a', { imageCount: 0, writer: null }), NOW),
		).toBeNull()
		expect(waitsOnPictures(article('a', { imageCount: 0 }))).toBe(true)
		expect(
			waitsOnPictures(article('a', { imageCount: 0, writer: 'codex' })),
		).toBe(false)
	})
})

describe('orderCards', () => {
	test('filters on the lane and reports read seconds', () => {
		const list = [
			article('short', { wordCount: 200 }), // 52 s
			article('mid', { wordCount: 900 }), // 235 s
			article('long', { wordCount: 1600 }), // 417 s
		]
		expect(ids(orderCards(list, 2, NOW))).toEqual(['short'])
		expect(ids(orderCards(list, 5, NOW))).toEqual(['short', 'mid'])
		expect(ids(orderCards(list, 10, NOW))).toEqual(['short', 'mid', 'long'])
		expect(orderCards(list, 10, NOW).map(c => c.readSeconds)).toEqual([
			52, 235, 417,
		])
	})

	test('orders by rank: started, revision, paid spot, held spot, blog, other', () => {
		const list = [
			article('other', { wordCount: 100 }),
			article('blog', { kind: 'blog', wordCount: 100 }),
			article('spot', { publisherWaiting: true, wordCount: 100 }),
			article('paid', {
				publisherWaiting: true,
				placementUsd: 150,
				wordCount: 100,
			}),
			article('revision', { revisionNote: 'say 2 to 4 units', wordCount: 100 }),
			article('started', { readToParagraph: 3, wordCount: 100 }),
		]
		const cards = orderCards(list, 5, NOW)
		expect(ids(cards)).toEqual([
			'started',
			'revision',
			'paid',
			'spot',
			'blog',
			'other',
		])
		expect(cards.map(c => c.rank)).toEqual([1, 2, 3, 4, 5, 6])
		expect(cards.map(c => c.started)).toEqual([
			true,
			false,
			false,
			false,
			false,
			false,
		])
	})

	test('a blog post with a held spot flag is still a blog post', () => {
		const cards = orderCards(
			[article('b', { kind: 'blog', publisherWaiting: true })],
			5,
			NOW,
		)
		expect(cards[0]!.rank).toBe(5)
	})

	test('shortest first inside a rank, then oldest', () => {
		const list = [
			article('long-old', {
				wordCount: 800,
				receivedAt: '2026-09-01T00:00:00.000Z',
			}),
			article('short-new', {
				wordCount: 200,
				receivedAt: '2026-09-10T00:00:00.000Z',
			}),
			article('short-old', {
				wordCount: 200,
				receivedAt: '2026-09-02T00:00:00.000Z',
			}),
		]
		expect(ids(orderCards(list, 5, NOW))).toEqual([
			'short-old',
			'short-new',
			'long-old',
		])
	})

	test('a started card and a revision go oldest first, not shortest first', () => {
		const list = [
			article('new-short', {
				readToParagraph: 1,
				wordCount: 100,
				receivedAt: '2026-09-10T00:00:00.000Z',
			}),
			article('old-long', {
				readToParagraph: 1,
				wordCount: 900,
				receivedAt: '2026-09-01T00:00:00.000Z',
			}),
		]
		expect(ids(orderCards(list, 5, NOW))).toEqual(['old-long', 'new-short'])
	})

	test('a paid spot without a waiting publisher is an ordinary guest article', () => {
		const cards = orderCards([article('a', { placementUsd: 200 })], 5, NOW)
		expect(cards[0]!.rank).toBe(6)
	})

	test('leaves out every hold-out', () => {
		const list = [
			article('later', { skippedUntil: new Date(NOW.getTime() + 60_000) }),
			article('editing', { editedAt: NOW }),
			article('pictures', { imageCount: 0 }),
			article('own-words', { isReference: true }),
			article('approved', { status: 'approved' }),
			article('sent-back', { status: 'changes_requested' }),
			article('ok'),
		]
		expect(ids(orderCards(list, 10, NOW))).toEqual(['ok'])
	})

	test('a started card that was later decided does not rank first', () => {
		const list = [
			article('a', {
				readToParagraph: 4,
				status: 'approved',
				incomingBody: 'x',
			}),
		]
		const cards = orderCards(list, 10, NOW, { includeIncoming: true })
		expect(cards[0]!.rank).toBe(2)
		expect(cards[0]!.started).toBe(false)
	})

	test('ties on the same second break on id so the order is stable', () => {
		const list = [article('b'), article('a')]
		expect(ids(orderCards(list, 5, NOW))).toEqual(['a', 'b'])
	})

	test('does not change the input order', () => {
		const list = [
			article('b', { wordCount: 800 }),
			article('a', { wordCount: 100 }),
		]
		orderCards(list, 5, NOW)
		expect(list.map(a => a.id)).toEqual(['b', 'a'])
	})

	test('returns nothing when nothing fits', () => {
		expect(orderCards([article('long', { wordCount: 1600 })], 2, NOW)).toEqual(
			[],
		)
		expect(orderCards([], 10, NOW)).toEqual([])
	})
})

describe('the sitting', () => {
	test('startSitting is empty and stamped with now', () => {
		expect(startSitting(5, NOW)).toEqual({
			lane: 5,
			startedAt: NOW.toISOString(),
			updatedAt: NOW.toISOString(),
			spentSeconds: 0,
		})
	})

	test('parseSitting round-trips through serializeSitting', () => {
		const s = { ...startSitting(2, NOW), spentSeconds: 40 }
		expect(parseSitting(serializeSitting(s), 2, NOW)).toEqual(s)
	})

	test('parseSitting starts fresh on missing, bad, or foreign values', () => {
		const fresh = startSitting(5, NOW)
		expect(parseSitting(undefined, 5, NOW)).toEqual(fresh)
		expect(parseSitting('', 5, NOW)).toEqual(fresh)
		expect(parseSitting('not json', 5, NOW)).toEqual(fresh)
		expect(parseSitting('[]', 5, NOW)).toEqual(fresh)
		expect(parseSitting('{"lane":5}', 5, NOW)).toEqual(fresh)
		expect(
			parseSitting(JSON.stringify({ ...fresh, spentSeconds: -1 }), 5, NOW),
		).toEqual(fresh)
		expect(
			parseSitting(JSON.stringify({ ...fresh, spentSeconds: 'x' }), 5, NOW),
		).toEqual(fresh)
		expect(
			parseSitting(JSON.stringify({ ...fresh, updatedAt: 'never' }), 5, NOW),
		).toEqual(fresh)
	})

	test('parseSitting starts fresh when the lane changed', () => {
		const s = { ...startSitting(2, NOW), spentSeconds: 100 }
		expect(parseSitting(serializeSitting(s), 5, NOW)).toEqual(
			startSitting(5, NOW),
		)
	})

	test('parseSitting keeps a sitting idle for 29 minutes and resets at 30', () => {
		const s = { ...startSitting(5, NOW), spentSeconds: 100 }
		const later29 = new Date(NOW.getTime() + 29 * 60 * 1000)
		const later30 = new Date(NOW.getTime() + 30 * 60 * 1000)
		expect(parseSitting(serializeSitting(s), 5, later29)).toEqual(s)
		expect(parseSitting(serializeSitting(s), 5, later30)).toEqual(
			startSitting(5, later30),
		)
	})

	test('remainingSeconds and fitsRemaining use the 25 percent grace', () => {
		const s = { ...startSitting(5, NOW), spentSeconds: 200 }
		expect(remainingSeconds(s)).toBe(100)
		expect(fitsRemaining(s, 125)).toBe(true)
		expect(fitsRemaining(s, 126)).toBe(false)
		expect(remainingSeconds({ ...s, spentSeconds: 999 })).toBe(0)
		expect(fitsRemaining({ ...s, spentSeconds: 999 }, 1)).toBe(false)
	})

	test('afterDecision adds the card and stamps updatedAt', () => {
		const s = startSitting(5, NOW)
		const later = new Date(NOW.getTime() + 60_000)
		const out = afterDecision(s, 90, later, [{ readSeconds: 60 }])
		expect(out.sitting).toEqual({
			lane: 5,
			startedAt: NOW.toISOString(),
			updatedAt: later.toISOString(),
			spentSeconds: 90,
		})
		expect(out.showPlenty).toBe(false)
	})

	test('afterDecision shows S8 when the lane time is spent', () => {
		const s = { ...startSitting(2, NOW), spentSeconds: 60 }
		expect(afterDecision(s, 60, NOW, [{ readSeconds: 1 }]).showPlenty).toBe(
			true,
		)
		// 1 s left: a 1 s card still fits, so this is not S8 yet
		expect(afterDecision(s, 59, NOW, [{ readSeconds: 1 }]).showPlenty).toBe(
			false,
		)
	})

	test('afterDecision shows S8 when cards remain and none fits the time left', () => {
		const s = { ...startSitting(5, NOW), spentSeconds: 100 }
		// 100 s left after this: 125 s fits with grace, 126 s does not
		expect(afterDecision(s, 100, NOW, [{ readSeconds: 126 }]).showPlenty).toBe(
			true,
		)
		expect(
			afterDecision(s, 100, NOW, [{ readSeconds: 126 }, { readSeconds: 125 }])
				.showPlenty,
		).toBe(false)
	})

	test('afterDecision with no cards left is not S8 while time remains', () => {
		const s = startSitting(5, NOW)
		expect(afterDecision(s, 30, NOW, []).showPlenty).toBe(false)
	})

	test('afterDecision ignores a negative or fractional read time', () => {
		const s = startSitting(5, NOW)
		expect(afterDecision(s, -20, NOW, []).sitting.spentSeconds).toBe(0)
		expect(afterDecision(s, 30.4, NOW, []).sitting.spentSeconds).toBe(30)
	})
})

describe('cookies', () => {
	test('getReviewLane reads the lane cookie and defaults to 5', () => {
		expect(getReviewLane(new Request('http://x/review'))).toBe(5)
		expect(
			getReviewLane(
				new Request('http://x/review', {
					headers: { cookie: 'review_lane=2' },
				}),
			),
		).toBe(2)
		expect(
			getReviewLane(
				new Request('http://x/review', {
					headers: { cookie: 'review_lane=9' },
				}),
			),
		).toBe(5)
	})

	test('setReviewLane and setReviewSitting round-trip through the request', () => {
		const laneHeader = setReviewLane(10)
		expect(laneHeader).toMatch(
			/^review_lane=10; Max-Age=31536000; Path=\/review/,
		)
		const s = { ...startSitting(10, NOW), spentSeconds: 45 }
		const sittingHeader = setReviewSitting(s)
		const cookieValue = [laneHeader, sittingHeader]
			.map(h => h.split(';')[0])
			.join('; ')
		const request = new Request('http://x/review', {
			headers: { cookie: cookieValue },
		})
		expect(getReviewLane(request)).toBe(10)
		expect(getReviewSitting(request, 10, NOW)).toEqual(s)
	})

	test('getReviewSitting starts fresh without a cookie', () => {
		expect(getReviewSitting(new Request('http://x/review'), 5, NOW)).toEqual(
			startSitting(5, NOW),
		)
	})

	test('clearReviewSitting expires the cookie', () => {
		expect(clearReviewSitting()).toMatch(
			/^review_sitting=; Max-Age=-1; Path=\/review/,
		)
	})
})
