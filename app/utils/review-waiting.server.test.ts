import { describe, expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	loadWaiting,
	waitingCounts,
	waitingSentenceFor,
	waitingTextFor,
} from '#app/utils/review-waiting.server.ts'

/**
 * What waits for Sarah, against the per-worker test DB (phase 6, A4): the
 * article count follows holdReason and the lane rules, the question count
 * follows the open asks, and the sentence follows both.
 */

const NOW = new Date('2026-09-17T13:00:00.000Z')
const RECEIVED = new Date('2026-09-10T12:00:00.000Z')

function article(key: string, over: Record<string, unknown> = {}) {
	const body = `# ${key}\n\nSome text about the practice.`
	return prisma.article.create({
		data: {
			kind: 'guest',
			sourceKey: `t:waiting:${key}`,
			title: `Title ${key}`,
			body,
			bodyOriginal: body,
			bodyHash: `hash-${key}`,
			writer: 'codex',
			wordCount: 100,
			receivedAt: RECEIVED,
			...over,
		},
		select: { id: true, title: true },
	})
}

function askRow(key: string, over: Record<string, unknown> = {}) {
	return prisma.reviewAsk.create({
		data: {
			key,
			domain: 'example.com',
			ask: `Ask ${key}`,
			openedAt: NOW,
			...over,
		},
		select: { id: true },
	})
}

describe('loadWaiting', () => {
	test('counts the articles she can act on and the open asks, nothing else', async () => {
		const ready = await article('ready')
		const blog = await article('blog', { kind: 'blog', writer: 'fable-5.1' })
		const answered = await article('answered', {
			question: 'Is this right?',
			answer: 'Yes.',
		})
		await article('own-words', { isReference: true })
		await article('decided', { status: 'approved' })
		await article('later', {
			skippedUntil: new Date(NOW.getTime() + 60 * 60 * 1000),
		})
		await article('editing', { editedAt: new Date(NOW.getTime() - 60 * 1000) })
		await article('pictures', { writer: 'fable-5.1' })
		await article('sent', { outreachStatus: 'submitted' })
		await article('asked', { question: 'Is this right?' })

		const open = await askRow('open')
		await askRow('closed', { closedAt: NOW })
		await askRow('done', {
			answer: 'Yes',
			answeredAt: NOW,
			answeredBy: 'Sarah',
		})

		const waiting = await loadWaiting(NOW)
		expect(waiting.articles.map(a => a.id).sort()).toEqual(
			[ready.id, blog.id, answered.id].sort(),
		)
		expect(waiting.articles.find(a => a.id === ready.id)).toEqual({
			id: ready.id,
			title: 'Title ready',
			receivedAt: RECEIVED,
		})
		expect(waiting.questions).toEqual([
			{ id: open.id, ask: 'Ask open', domain: 'example.com', openedAt: NOW },
		])

		expect(waitingCounts(waiting)).toEqual({
			articles: 3,
			questions: 1,
			onlyTitle: null,
		})
		expect(waitingSentenceFor(waiting)).toBe(
			'3 articles and 1 question are waiting.',
		)
		expect(waitingTextFor(waiting)).toBe(
			'3 articles and 1 question are waiting. hitchcoxaesthetics.com/review',
		)
	})

	test('one article: the sentence carries its title', async () => {
		await article('only')
		const waiting = await loadWaiting(NOW)
		expect(waitingCounts(waiting)).toEqual({
			articles: 1,
			questions: 0,
			onlyTitle: 'Title only',
		})
		expect(waitingSentenceFor(waiting)).toBe(
			'1 article is waiting: Title only.',
		)
	})

	test('one question: the sentence carries the ask', async () => {
		await askRow('only', { ask: 'Which days are you open?' })
		const waiting = await loadWaiting(NOW)
		expect(waitingSentenceFor(waiting)).toBe(
			'1 question is waiting: Which days are you open.',
		)
	})

	test('nothing waits: empty lists and an empty sentence', async () => {
		await article('decided', { status: 'denied' })
		await askRow('closed', { closedAt: NOW })
		const waiting = await loadWaiting(NOW)
		expect(waiting).toEqual({ articles: [], questions: [] })
		expect(waitingSentenceFor(waiting)).toBe('')
		expect(waitingTextFor(waiting)).toBe('')
	})
})
