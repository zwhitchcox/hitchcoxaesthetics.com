import { describe, expect, test, vi } from 'vitest'
import { action, loader } from '#app/routes/resources+/article-sync.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	answerAsk,
	listAnswersForSync,
	listOpenAsks,
	syncOpenAsks,
} from '#app/utils/review-asks.server.ts'
import { type SyncAsk } from '#app/utils/review-asks.ts'

/**
 * The questions for Sarah against the per-worker test DB (phase 6, A2 and
 * A3): the mirror of the open set, the page's list, her answer, the list
 * for the mini, and the sync route.
 */

const T0 = new Date('2026-09-17T13:00:00.000Z')
const T1 = new Date('2026-09-17T14:00:00.000Z')
const T2 = new Date('2026-09-17T15:00:00.000Z')

function ask(key: string, over: Partial<SyncAsk> = {}): SyncAsk {
	return { key, domain: 'example.com', ask: `Ask ${key}`, ...over }
}

async function row(key: string) {
	return prisma.reviewAsk.findUniqueOrThrow({ where: { key } })
}

describe('syncOpenAsks', () => {
	test('a new key opens now; a known key keeps openedAt and takes the new fields', async () => {
		expect(
			await syncOpenAsks(
				[
					ask('row:1:a', {
						effort: '15min',
						about: 'About it',
						standing: 'Where it stands',
						files: [{ name: 'notes.md', text: 'line one' }],
					}),
				],
				T0,
			),
		).toEqual({ open: 1, closed: 0 })
		const first = await row('row:1:a')
		expect(first).toMatchObject({
			targetId: null,
			domain: 'example.com',
			ask: 'Ask row:1:a',
			effort: '15min',
			about: 'About it',
			standing: 'Where it stands',
			filesJson: JSON.stringify([{ name: 'notes.md', text: 'line one' }]),
			openedAt: T0,
			closedAt: null,
			answer: null,
			answeredAt: null,
		})

		expect(
			await syncOpenAsks(
				[ask('row:1:a', { ask: 'Changed', effort: '2min', targetId: 7 })],
				T1,
			),
		).toEqual({ open: 1, closed: 0 })
		const again = await row('row:1:a')
		expect(again).toMatchObject({
			id: first.id,
			targetId: 7,
			ask: 'Changed',
			effort: '2min',
			about: null,
			standing: null,
			filesJson: null,
			openedAt: T0,
			closedAt: null,
		})
	})

	test('a key that stops coming is closed; sent again it reopens with its openedAt kept', async () => {
		await syncOpenAsks([ask('a'), ask('b')], T0)
		expect(await syncOpenAsks([ask('b')], T1)).toEqual({ open: 1, closed: 1 })
		expect((await row('a')).closedAt).toEqual(T1)
		expect((await row('b')).closedAt).toBeNull()

		expect(await syncOpenAsks([ask('a'), ask('b')], T2)).toEqual({
			open: 2,
			closed: 0,
		})
		expect(await row('a')).toMatchObject({ openedAt: T0, closedAt: null })
	})

	test('an empty list closes everything that was open', async () => {
		await syncOpenAsks([ask('a'), ask('b')], T0)
		expect(await syncOpenAsks([], T1)).toEqual({ open: 0, closed: 2 })
		expect(await prisma.reviewAsk.count({ where: { closedAt: null } })).toBe(0)
	})

	test('an answered row keeps her answer through a sync and stays off her page', async () => {
		await syncOpenAsks([ask('a')], T0)
		const { id } = await row('a')
		expect(await answerAsk(id, { answer: 'Yes.', who: 'Sarah', now: T1 })).toBe(
			true,
		)
		await syncOpenAsks([ask('a', { ask: 'Ask a, again' })], T2)
		expect(await row('a')).toMatchObject({
			ask: 'Ask a, again',
			answer: 'Yes.',
			answeredAt: T1,
			answeredBy: 'Sarah',
			closedAt: null,
		})
		expect(await listOpenAsks()).toEqual([])
	})
})

describe('listOpenAsks', () => {
	test('open and unanswered rows only: the 2-minute ones first, then the oldest first', async () => {
		const older = new Date(T0.getTime() - 60 * 60 * 1000)
		const make = (
			key: string,
			openedAt: Date,
			data: Record<string, unknown> = {},
		) =>
			prisma.reviewAsk.create({
				data: {
					key,
					domain: 'example.com',
					ask: `Ask ${key}`,
					openedAt,
					...data,
				},
				select: { id: true },
			})
		const c1 = await make('c1', T0, { effort: '15min' })
		const c2 = await make('c2', T1, { effort: '2min' })
		const c3 = await make('c3', older, { effort: null })
		const c4 = await make('c4', T0, { effort: '2min' })
		await make('c5', older, { effort: '2min', closedAt: T1 })
		await make('c6', older, {
			effort: '2min',
			answer: 'Done',
			answeredAt: T1,
			answeredBy: 'Sarah',
		})
		const open = await listOpenAsks()
		expect(open.map(a => a.id)).toEqual([c4.id, c2.id, c3.id, c1.id])
		expect(open[0]).toMatchObject({
			key: 'c4',
			domain: 'example.com',
			ask: 'Ask c4',
			effort: '2min',
			about: null,
			standing: null,
			filesJson: null,
			openedAt: T0,
		})
	})
})

describe('answerAsk', () => {
	test('writes the answer, the time and the name once; nothing else', async () => {
		await syncOpenAsks([ask('a')], T0)
		const before = await row('a')
		expect(
			await answerAsk(before.id, {
				answer: '  Tuesday to Saturday.  ',
				who: 'Sarah Hitchcox',
				userId: 'user_sarah',
				now: T1,
			}),
		).toBe(true)
		const after = await row('a')
		expect(after).toMatchObject({
			answer: 'Tuesday to Saturday.',
			answeredAt: T1,
			answeredBy: 'Sarah Hitchcox',
			openedAt: T0,
			closedAt: null,
		})
		// a second answer does not replace the first
		expect(
			await answerAsk(before.id, { answer: 'No.', who: 'Sarah', now: T2 }),
		).toBe(false)
		expect((await row('a')).answer).toBe('Tuesday to Saturday.')
	})

	test('false for an unknown id or an empty answer', async () => {
		await syncOpenAsks([ask('a')], T0)
		const { id } = await row('a')
		expect(await answerAsk('nope', { answer: 'Yes', who: 'Sarah' })).toBe(false)
		expect(await answerAsk(id, { answer: '   ', who: 'Sarah' })).toBe(false)
		expect((await row('a')).answeredAt).toBeNull()
	})
})

describe('listAnswersForSync', () => {
	test('answered rows only, oldest answer first, and only after since when given', async () => {
		await syncOpenAsks([ask('a', { targetId: 3 }), ask('b'), ask('c')], T0)
		await answerAsk((await row('b')).id, { answer: 'B', who: 'Sarah', now: T2 })
		await answerAsk((await row('a')).id, { answer: 'A', who: 'Sarah', now: T0 })
		expect(await listAnswersForSync()).toEqual([
			{
				key: 'a',
				targetId: 3,
				answer: 'A',
				answeredAt: T0,
				answeredBy: 'Sarah',
			},
			{
				key: 'b',
				targetId: null,
				answer: 'B',
				answeredAt: T2,
				answeredBy: 'Sarah',
			},
		])
		expect((await listAnswersForSync(T1)).map(a => a.key)).toEqual(['b'])
		expect((await listAnswersForSync(T2)).map(a => a.key)).toEqual([])
	})
})

describe('the sync route', () => {
	const TOKEN = 'test-token'

	function post(body: unknown, token = TOKEN) {
		vi.stubEnv('ARTICLE_SYNC_TOKEN', TOKEN)
		return action({
			request: new Request('http://localhost/resources/article-sync', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			}),
			params: {},
			context: {},
		})
	}

	function get(query: Record<string, string>) {
		vi.stubEnv('ARTICLE_SYNC_TOKEN', TOKEN)
		const url = new URL('http://localhost/resources/article-sync')
		for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
		return loader({
			request: new Request(url, {
				headers: { Authorization: `Bearer ${TOKEN}` },
			}),
			params: {},
			context: {},
		})
	}

	type AsksJson = {
		now: string
		asks: Array<{
			key: string
			targetId: number | null
			answer: string | null
			answeredAt: string | null
			answeredBy: string | null
		}>
	}

	test('POST { asks } mirrors the open set and answers the counts', async () => {
		const res = await post({
			asks: [
				{
					key: 'row:1:abc',
					targetId: 1,
					domain: 'example.com',
					ask: 'Which days are you open?',
					effort: '2min',
					files: [{ name: 'notes.md', text: 'line one' }],
				},
				{ key: 'row:2:def', domain: 'other.com', ask: 'Do you treat men?' },
			],
		})
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ open: 2, closed: 0 })

		const again = await post({
			asks: [
				{ key: 'row:2:def', domain: 'other.com', ask: 'Do you treat men?' },
			],
		})
		expect(await again.json()).toEqual({ open: 1, closed: 1 })
		expect((await row('row:1:abc')).closedAt).not.toBeNull()

		const bad = await post({ asks: [{ key: 'k' }] })
		expect(bad.status).toBe(400)
		expect(((await bad.json()) as { error: string }).error).toBe(
			'invalid payload',
		)
		expect((await post({ asks: [] }, 'wrong')).status).toBe(401)
	})

	test('GET ?asks=1 lists her answers, and only after since when given', async () => {
		await syncOpenAsks([ask('a', { targetId: 9 }), ask('b')], T0)
		await answerAsk((await row('a')).id, {
			answer: 'Yes.',
			who: 'Sarah',
			now: T1,
		})
		const all = (await (await get({ asks: '1' })).json()) as AsksJson
		expect(typeof all.now).toBe('string')
		expect(all.asks).toEqual([
			{
				key: 'a',
				targetId: 9,
				answer: 'Yes.',
				answeredAt: T1.toISOString(),
				answeredBy: 'Sarah',
			},
		])
		const later = (await (
			await get({ asks: '1', since: T2.toISOString() })
		).json()) as AsksJson
		expect(later.asks).toEqual([])
	})
})
