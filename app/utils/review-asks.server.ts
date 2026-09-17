/**
 * The questions for Sarah from the outreach ledger (phase 6), server side:
 * mirror the open set the mini sends, list the ones she has not answered,
 * store her answer, and list the answers for the mini to pull.
 *
 * Logs carry counts, never an ask or an answer.
 */
import { prisma } from '#app/utils/db.server.ts'
import { compareAsks, type SyncAsk } from '#app/utils/review-asks.ts'

/**
 * Mirror the open set. A known key gets its fields updated and is open
 * again (openedAt kept). A new key opens now. Every open row whose key is
 * not in the list is closed now. A row she already answered keeps her
 * answer, so it does not come back to her page.
 */
export async function syncOpenAsks(
	asks: SyncAsk[],
	now: Date = new Date(),
): Promise<{ open: number; closed: number }> {
	const keys: string[] = []
	for (const ask of asks) {
		keys.push(ask.key)
		const data = {
			targetId: ask.targetId ?? null,
			domain: ask.domain,
			ask: ask.ask,
			effort: ask.effort?.trim() || null,
			about: ask.about?.trim() || null,
			standing: ask.standing?.trim() || null,
			filesJson: ask.files?.length ? JSON.stringify(ask.files) : null,
			closedAt: null,
		}
		await prisma.reviewAsk.upsert({
			where: { key: ask.key },
			update: data,
			create: { ...data, key: ask.key, openedAt: now },
		})
	}
	const { count: closed } = await prisma.reviewAsk.updateMany({
		where: { closedAt: null, key: { notIn: keys } },
		data: { closedAt: now },
	})
	const open = await prisma.reviewAsk.count({ where: { closedAt: null } })
	console.log(
		`Review asks: sync ${asks.length} rows, ${open} open, ${closed} closed`,
	)
	return { open, closed }
}

const OPEN_SELECT = {
	id: true,
	key: true,
	targetId: true,
	domain: true,
	ask: true,
	effort: true,
	about: true,
	standing: true,
	filesJson: true,
	openedAt: true,
} as const

/** The rows on her page: open and not answered, the 2-minute ones first, then the oldest first. */
export async function listOpenAsks() {
	const rows = await prisma.reviewAsk.findMany({
		where: { closedAt: null, answeredAt: null },
		orderBy: { openedAt: 'asc' },
		select: OPEN_SELECT,
	})
	return rows.sort(compareAsks)
}

export type OpenAsk = Awaited<ReturnType<typeof listOpenAsks>>[number]

/**
 * Her answer: the text, the time and the reviewer's name. Nothing else is
 * written. False when the row is gone, was answered before, or the answer
 * is empty. The caller's userId is not stored.
 */
export async function answerAsk(
	id: string,
	opts: { answer: string; who: string; userId?: string; now?: Date },
): Promise<boolean> {
	const answer = opts.answer.trim()
	if (!answer) return false
	const { count } = await prisma.reviewAsk.updateMany({
		where: { id, answeredAt: null },
		data: {
			answer,
			answeredAt: opts.now ?? new Date(),
			answeredBy: opts.who,
		},
	})
	return count === 1
}

/** The answered rows for the mini, oldest answer first; `since` keeps answers after it. */
export async function listAnswersForSync(since?: Date | null) {
	return prisma.reviewAsk.findMany({
		where: { answeredAt: since ? { gt: since } : { not: null } },
		orderBy: { answeredAt: 'asc' },
		select: {
			key: true,
			targetId: true,
			answer: true,
			answeredAt: true,
			answeredBy: true,
		},
	})
}
