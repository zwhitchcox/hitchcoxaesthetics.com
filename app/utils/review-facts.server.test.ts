import { afterEach, describe, expect, test, vi } from 'vitest'
import { action, loader } from '#app/routes/resources+/article-sync.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	loadFactBank,
	saveFact,
	upsertDocFacts,
} from '#app/utils/review-facts.server.ts'

/**
 * The fact bank against the per-worker test DB: the upsert by normalised
 * question, the docs mirror, the prompt order, and the sync route.
 */

describe('saveFact', () => {
	test('creates a grill row, then updates the row that holds the same question', async () => {
		const first = await saveFact({
			question: 'Q1: What do you charge per unit of Botox?',
			answer: '12 dollars',
			fact: 'Sarah charges $12 per unit of Botox.',
			tags: ['Botox', 'pricing'],
			articleId: null,
			userId: 'u1',
		})
		expect(first.created).toBe(true)
		const second = await saveFact({
			question: "What's the charge per unit for Botox?",
			answer: '14 now',
			fact: 'Sarah charges $14 per unit of Botox.',
			tags: 'botox, pricing',
			userId: 'u2',
		})
		expect(second).toEqual({ id: first.id, created: false })
		const rows = await prisma.reviewFact.findMany()
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			source: 'grill',
			question: "What's the charge per unit for Botox?",
			answer: '14 now',
			fact: 'Sarah charges $14 per unit of Botox.',
			tags: 'botox, pricing',
			userId: 'u2',
			retiredAt: null,
		})
	})

	test('a retired row with the same question comes back; a docs row is never matched', async () => {
		const retired = await prisma.reviewFact.create({
			data: {
				source: 'manual',
				question: 'Which days are you open?',
				fact: 'old',
				retiredAt: new Date(),
			},
			select: { id: true },
		})
		await prisma.reviewFact.create({
			data: {
				source: 'docs',
				key: 'hours.md:1',
				question: 'Which days are you open?',
				fact: 'From the file.',
			},
		})
		const saved = await saveFact({
			question: 'Q2: which days are you open',
			answer: 'Tuesday to Saturday',
			fact: 'Sarah is open Tuesday to Saturday.',
			source: 'manual',
		})
		expect(saved).toEqual({ id: retired.id, created: false })
		expect(await prisma.reviewFact.count()).toBe(2)
		expect(
			await prisma.reviewFact.findUnique({ where: { id: retired.id } }),
		).toMatchObject({
			source: 'manual',
			fact: 'Sarah is open Tuesday to Saturday.',
			retiredAt: null,
		})
	})

	test('a row with no question is always new', async () => {
		await saveFact({ fact: 'One.', source: 'manual' })
		await saveFact({ fact: 'Two.', source: 'manual' })
		expect(await prisma.reviewFact.count()).toBe(2)
	})
})

describe('loadFactBank', () => {
	test('docs first by tags, then grill and manual newest first, non-retired only, within the limit', async () => {
		const at = (s: number) => new Date(Date.UTC(2026, 8, 16, 12, 0, s))
		await prisma.reviewFact.createMany({
			data: [
				{ source: 'grill', fact: 'grill old', updatedAt: at(1) },
				{ source: 'grill', fact: 'grill new', updatedAt: at(9) },
				{ source: 'manual', fact: 'manual mid', updatedAt: at(5) },
				{
					source: 'grill',
					fact: 'retired',
					updatedAt: at(8),
					retiredAt: at(8),
				},
				{
					source: 'docs',
					key: 'b',
					fact: 'docs pricing',
					tags: 'pricing',
					updatedAt: at(2),
				},
				{
					source: 'docs',
					key: 'a',
					fact: 'docs botox',
					tags: 'botox',
					updatedAt: at(3),
				},
			],
		})
		expect((await loadFactBank()).map(r => r.fact)).toEqual([
			'docs botox',
			'docs pricing',
			'grill new',
			'manual mid',
			'grill old',
		])
		// the limit keeps half for the docs rows and fills the rest newest first
		expect((await loadFactBank(3)).map(r => r.fact)).toEqual([
			'docs botox',
			'docs pricing',
			'grill new',
		])
	})
})

describe('upsertDocFacts', () => {
	test('creates by key, counts an identical row as unchanged, updates a changed one, keeps a retired one retired', async () => {
		const rows = [
			{
				key: 'voice.md:1',
				fact: 'First person.',
				tags: 'voice',
				question: null,
				answer: null,
			},
			{
				key: 'hours.md:1',
				fact: 'Open Tuesday to Saturday.',
				tags: 'hours',
				question: 'Days?',
				answer: 'Tue to Sat',
			},
		]
		expect(await upsertDocFacts(rows)).toEqual({ upserted: 2, unchanged: 0 })
		expect(await upsertDocFacts(rows)).toEqual({ upserted: 0, unchanged: 2 })
		await prisma.reviewFact.update({
			where: { key: 'hours.md:1' },
			data: { retiredAt: new Date() },
		})
		expect(
			await upsertDocFacts([
				{ ...rows[0]!, fact: 'First person, short sentences.' },
				rows[1]!,
			]),
		).toEqual({ upserted: 1, unchanged: 1 })
		const all = await prisma.reviewFact.findMany({ orderBy: { key: 'asc' } })
		expect(
			all.map(r => [r.key, r.source, r.fact, Boolean(r.retiredAt)]),
		).toEqual([
			['hours.md:1', 'docs', 'Open Tuesday to Saturday.', true],
			['voice.md:1', 'docs', 'First person, short sentences.', false],
		])
	})
})

describe('/resources/article-sync facts', () => {
	const TOKEN = 'test-sync-token'
	afterEach(() => {
		vi.unstubAllEnvs()
	})

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

	type FactsJson = {
		now: string
		facts: Array<{
			id: string
			key: string | null
			source: string
			fact: string
			tags: string
			question: string | null
			answer: string | null
			updatedAt: string
		}>
	}

	test('POST { facts } mirrors the docs rows and answers the counts', async () => {
		const res = await post({
			facts: [
				{ key: 'voice.md:1', fact: 'First person.', tags: ['Voice'] },
				{
					key: 'hours.md:1',
					fact: 'Open Tuesday to Saturday.',
					tags: 'hours',
					question: 'Days?',
					answer: 'Tue to Sat',
				},
			],
		})
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ upserted: 2, unchanged: 0 })
		const again = await post({
			facts: [{ key: 'voice.md:1', fact: 'First person.', tags: 'voice' }],
		})
		expect(await again.json()).toEqual({ upserted: 0, unchanged: 1 })
		expect(await prisma.reviewFact.count({ where: { source: 'docs' } })).toBe(2)

		const bad = await post({ facts: [{ key: 'k' }] })
		expect(bad.status).toBe(400)
		expect(((await bad.json()) as { error: string }).error).toBe(
			'invalid payload',
		)
		expect((await post({ facts: [] }, 'wrong')).status).toBe(401)
	})

	test('GET ?facts=1 lists the non-retired rows; &since= keeps the newer ones', async () => {
		const at = (s: number) => new Date(Date.UTC(2026, 8, 16, 12, 0, s))
		await prisma.reviewFact.createMany({
			data: [
				{
					source: 'docs',
					key: 'a',
					fact: 'docs',
					tags: 'voice',
					updatedAt: at(1),
				},
				{
					source: 'grill',
					fact: 'Sarah uses 20 units per side.',
					tags: 'botox',
					question: 'Q1: units?',
					answer: '20',
					updatedAt: at(5),
				},
				{
					source: 'grill',
					fact: 'retired',
					updatedAt: at(9),
					retiredAt: at(9),
				},
			],
		})
		const res = await get({ facts: '1' })
		expect(res.status).toBe(200)
		const data = (await res.json()) as FactsJson
		expect(new Date(data.now).getTime()).toBeGreaterThan(0)
		expect(data.facts.map(f => f.fact)).toEqual([
			'docs',
			'Sarah uses 20 units per side.',
		])
		expect(data.facts[1]).toMatchObject({
			key: null,
			source: 'grill',
			tags: 'botox',
			question: 'Q1: units?',
			answer: '20',
			updatedAt: at(5).toISOString(),
		})
		expect(typeof data.facts[1]?.id).toBe('string')

		const since = (await get({ facts: '1', since: at(2).toISOString() })).json()
		expect(((await since) as FactsJson).facts.map(f => f.fact)).toEqual([
			'Sarah uses 20 units per side.',
		])
		const badSince = (await get({ facts: '1', since: 'yesterday' })).json()
		expect(((await badSince) as FactsJson).facts).toHaveLength(2)
	})
})
