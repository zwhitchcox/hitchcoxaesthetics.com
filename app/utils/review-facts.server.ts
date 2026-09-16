/**
 * The fact bank (review phase 5, R6 to R8), server side: load the rows for
 * a prompt, save a grill answer without a duplicate question, mirror the
 * docs rows the mini sends, list rows for the mini and for /admin/facts.
 *
 * Logs carry counts and lengths, never a fact or an answer.
 */
import { prisma } from '#app/utils/db.server.ts'
import {
	FACT_BANK_MAX_ROWS,
	normaliseQuestion,
	normaliseTags,
	orderFactBank,
	type FactBankRow,
	type SyncFact,
} from '#app/utils/review-facts.ts'

const BANK_SELECT = {
	id: true,
	source: true,
	fact: true,
	tags: true,
	question: true,
	updatedAt: true,
} as const

/**
 * The live bank for a prompt: non-retired rows, the docs rows first
 * grouped by tags, then grill and manual newest first, at most `limit`
 * rows in all. The docs rows keep at least half of the room, so many grill
 * rows never push the files out.
 */
export async function loadFactBank(
	limit = FACT_BANK_MAX_ROWS,
): Promise<Array<FactBankRow & { id: string }>> {
	const [docs, others] = await Promise.all([
		prisma.reviewFact.findMany({
			where: { retiredAt: null, source: 'docs' },
			orderBy: [{ tags: 'asc' }, { updatedAt: 'desc' }],
			take: limit,
			select: BANK_SELECT,
		}),
		prisma.reviewFact.findMany({
			where: { retiredAt: null, source: { not: 'docs' } },
			orderBy: { updatedAt: 'desc' },
			take: limit,
			select: BANK_SELECT,
		}),
	])
	const docsRoom = Math.max(Math.ceil(limit / 2), limit - others.length)
	const pickedDocs = docs.slice(0, docsRoom)
	const pickedOthers = others.slice(0, limit - pickedDocs.length)
	return orderFactBank([...pickedDocs, ...pickedOthers])
}

export type SaveFactInput = {
	question?: string | null
	answer?: string | null
	/** One sentence a writer can use. */
	fact: string
	tags?: string | string[] | null
	source?: 'grill' | 'manual'
	/** The article the question came from. */
	articleId?: string | null
	userId?: string | null
}

/**
 * Create a grill or manual row. When a grill or manual row already holds
 * the same normalised question, that row is updated instead (the newest
 * answer wins, and a retired row comes back), so a question asked twice
 * makes one row. Docs rows are never matched: the file is their truth.
 */
export async function saveFact(
	input: SaveFactInput,
): Promise<{ id: string; created: boolean }> {
	const question = input.question?.trim() || null
	const data = {
		question,
		answer: input.answer?.trim() || null,
		fact: input.fact.trim(),
		tags: normaliseTags(input.tags),
		articleId: input.articleId ?? null,
		userId: input.userId ?? null,
	}
	const key = question ? normaliseQuestion(question) : ''
	if (key) {
		const candidates = await prisma.reviewFact.findMany({
			where: { source: { not: 'docs' }, question: { not: null } },
			orderBy: { updatedAt: 'desc' },
			select: { id: true, question: true },
		})
		const match = candidates.find(
			c => normaliseQuestion(c.question ?? '') === key,
		)
		if (match) {
			await prisma.reviewFact.update({
				where: { id: match.id },
				data: { ...data, retiredAt: null },
			})
			return { id: match.id, created: false }
		}
	}
	const row = await prisma.reviewFact.create({
		data: { ...data, source: input.source ?? 'grill' },
		select: { id: true },
	})
	return { id: row.id, created: true }
}

/**
 * Mirror the docs rows: one upsert per key with source `docs`. A row with
 * the same content counts as unchanged. A key that is not sent is left
 * alone (retiring is manual), and a retired row that is sent again stays
 * retired.
 */
export async function upsertDocFacts(
	rows: SyncFact[],
): Promise<{ upserted: number; unchanged: number }> {
	let upserted = 0
	let unchanged = 0
	for (const row of rows) {
		const data = {
			fact: row.fact,
			tags: row.tags,
			question: row.question?.trim() || null,
			answer: row.answer?.trim() || null,
		}
		const existing = await prisma.reviewFact.findUnique({
			where: { key: row.key },
			select: {
				id: true,
				fact: true,
				tags: true,
				question: true,
				answer: true,
			},
		})
		if (
			existing &&
			existing.fact === data.fact &&
			existing.tags === data.tags &&
			existing.question === data.question &&
			existing.answer === data.answer
		) {
			unchanged++
			continue
		}
		if (existing) {
			await prisma.reviewFact.update({ where: { id: existing.id }, data })
		} else {
			await prisma.reviewFact.create({
				data: { ...data, key: row.key, source: 'docs' },
			})
		}
		upserted++
	}
	console.log(
		`Review facts: docs sync ${rows.length} rows, ${upserted} upserted, ${unchanged} unchanged`,
	)
	return { upserted, unchanged }
}

const SYNC_SELECT = {
	id: true,
	key: true,
	source: true,
	fact: true,
	tags: true,
	question: true,
	answer: true,
	updatedAt: true,
} as const

/** The non-retired rows for the mini, oldest change first; `since` keeps rows updated after it. */
export async function listFactsForSync(since?: Date | null) {
	return prisma.reviewFact.findMany({
		where: {
			retiredAt: null,
			...(since ? { updatedAt: { gt: since } } : {}),
		},
		orderBy: { updatedAt: 'asc' },
		select: SYNC_SELECT,
	})
}
