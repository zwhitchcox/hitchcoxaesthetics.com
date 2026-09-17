/**
 * What waits for Sarah right now: the articles she can act on (the same
 * rule as the phone lanes, every lane) and the open questions from the
 * outreach ledger. The review page and the reminder texts both read this,
 * so their numbers agree.
 */
import { laneRows, loadQueueRows } from '#app/routes/review+/_shared.server.ts'
import { listOpenAsks } from '#app/utils/review-asks.server.ts'
import { holdReason } from '#app/utils/review-queue.server.ts'
import {
	waitingSentence,
	waitingText,
	type WaitingCounts,
} from '#app/utils/review-waiting.ts'

export type WaitingArticle = { id: string; title: string; receivedAt: Date }
export type WaitingQuestion = {
	id: string
	ask: string
	domain: string
	openedAt: Date
}
export type Waiting = {
	articles: WaitingArticle[]
	questions: WaitingQuestion[]
}

export async function loadWaiting(now: Date): Promise<Waiting> {
	const [rows, asks] = await Promise.all([loadQueueRows(), listOpenAsks()])
	const articles = laneRows(rows)
		.filter(r => holdReason(r, now) === null)
		.map(r => ({
			id: r.id,
			title: r.title,
			receivedAt: new Date(r.receivedAt),
		}))
	const questions = asks.map(a => ({
		id: a.id,
		ask: a.ask,
		domain: a.domain,
		openedAt: new Date(a.openedAt),
	}))
	return { articles, questions }
}

/** The counts the sentence needs, with the title when it is exactly one. */
export function waitingCounts(w: Waiting): WaitingCounts {
	const total = w.articles.length + w.questions.length
	const onlyTitle =
		total === 1 ? (w.articles[0]?.title ?? w.questions[0]?.ask ?? null) : null
	return {
		articles: w.articles.length,
		questions: w.questions.length,
		onlyTitle,
	}
}

/** "3 articles and 2 questions are waiting." or ''. */
export function waitingSentenceFor(w: Waiting): string {
	return waitingSentence(waitingCounts(w))
}

/** The text message body, or ''. */
export function waitingTextFor(w: Waiting): string {
	return waitingText(waitingCounts(w))
}
