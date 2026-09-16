/**
 * The fact bank (review phase 5, R6), pure pieces: what a fact row looks
 * like, how a question is normalised so the same question is stored once,
 * how the rows are ordered and cut for a prompt, and the sync payloads.
 * No server imports; review-facts.server.ts does the reads and writes.
 *
 * The canonical bank is a set of markdown files in the pbn repo
 * (knowledge/sarah/*.md). Their rows arrive through the sync with source
 * `docs` and a stable `key`. The grill's answers (source `grill`) and the
 * admin page's rows (source `manual`) live only here until the mini pulls
 * them into the files.
 */
import { z } from 'zod'

export const FACT_SOURCES = ['grill', 'docs', 'manual'] as const
export type FactSource = (typeof FACT_SOURCES)[number]

/** The prompt block carries at most this many rows ... */
export const FACT_BANK_MAX_ROWS = 150
/** ... and at most this many characters. */
export const FACT_BANK_MAX_CHARS = 30_000
/** Rows in one sync POST. */
export const FACT_SYNC_MAX_ROWS = 500
export const FACT_MAX_CHARS = 600
export const FACT_QUESTION_MAX_CHARS = 500
export const FACT_ANSWER_MAX_CHARS = 4000
export const FACT_TAGS_MAX_CHARS = 200
export const FACT_KEY_MAX_CHARS = 200
/** The line under the heading when the bank is empty. */
export const FACT_BANK_EMPTY = '(nothing yet)'

/** What the prompt block needs from a row. */
export type FactBankRow = {
	source: string
	fact: string
	tags: string
	question: string | null
	updatedAt: Date
}

/* ------------------------------------------------------------------------ */
/* Normalising                                                              */
/* ------------------------------------------------------------------------ */

const STOP_WORDS = new Set([
	'a',
	'an',
	'the',
	'of',
	'to',
	'in',
	'on',
	'at',
	'for',
	'and',
	'or',
	'is',
	'are',
	'was',
	'were',
	'be',
	'do',
	'does',
	'did',
	'you',
	'your',
	'yours',
	'we',
	'our',
	'ours',
	'us',
	'i',
	'me',
	'my',
	'it',
	'its',
	'this',
	'that',
	'these',
	'those',
	'there',
	'with',
	'by',
	'from',
	'as',
	'about',
	'any',
	'some',
	'per',
	'have',
	'has',
	'had',
	'can',
	'could',
	'would',
	'should',
	'will',
	'please',
	'tell',
	'so',
	'if',
	'when',
	'what',
	'which',
	'how',
	'many',
	'much',
	'often',
	'usually',
	'typically',
	'sarah',
	's',
])

/**
 * The key two askings of one question share: lowercase, the "Q1" label
 * gone, punctuation gone, stop words gone, one space between words.
 * "Q3: What do you charge per unit of Botox?" and "what's the charge, per
 * unit, for botox" both become "charge unit botox".
 */
export function normaliseQuestion(question: string): string {
	return question
		.toLowerCase()
		.replace(/^\s*q\s*\d+\s*[:.)-]?\s*/i, '')
		.replace(/[‘’']/g, ' ')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(word => word && !STOP_WORDS.has(word))
		.join(' ')
}

/** Lowercase topics, trimmed, no repeats, joined with ", ". */
export function normaliseTags(
	tags: string | string[] | null | undefined,
): string {
	const list = Array.isArray(tags) ? tags : (tags ?? '').split(',')
	const seen = new Set<string>()
	for (const raw of list) {
		const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ')
		if (tag) seen.add(tag)
	}
	return [...seen].join(', ')
}

/* ------------------------------------------------------------------------ */
/* The prompt block                                                         */
/* ------------------------------------------------------------------------ */

/**
 * The order the model reads: the docs rows first, grouped by their tags,
 * then the grill and manual rows newest first.
 */
export function orderFactBank<T extends FactBankRow>(rows: T[]): T[] {
	const docs = rows
		.filter(r => r.source === 'docs')
		.sort(
			(a, b) =>
				a.tags.localeCompare(b.tags) ||
				b.updatedAt.getTime() - a.updatedAt.getTime(),
		)
	const rest = rows
		.filter(r => r.source !== 'docs')
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
	return [...docs, ...rest]
}

/** One row as a prompt line: `- [tags] fact (asked: "question")`. */
export function factBankLine(row: FactBankRow): string {
	const tags = row.tags ? `[${row.tags}] ` : ''
	const question = row.question?.trim()
		? ` (asked: "${row.question.trim()}")`
		: ''
	return `- ${tags}${row.fact.trim()}${question}`
}

/**
 * The text under WHAT SARAH HAS ALREADY TOLD US: the ordered rows, at most
 * `maxRows`, cut where the joined lines would pass `maxChars`.
 */
export function factBankBlock(
	rows: FactBankRow[],
	{
		maxRows = FACT_BANK_MAX_ROWS,
		maxChars = FACT_BANK_MAX_CHARS,
	}: { maxRows?: number; maxChars?: number } = {},
): { text: string; rows: number } {
	const lines: string[] = []
	let total = 0
	for (const row of orderFactBank(rows).slice(0, maxRows)) {
		const line = factBankLine(row)
		if (total + line.length + 1 > maxChars) break
		lines.push(line)
		total += line.length + 1
	}
	return {
		text: lines.length ? lines.join('\n') : FACT_BANK_EMPTY,
		rows: lines.length,
	}
}

/* ------------------------------------------------------------------------ */
/* The sync payloads (R8)                                                   */
/* ------------------------------------------------------------------------ */

const tagsField = z
	.union([z.string(), z.array(z.string())])
	.optional()
	.transform(normaliseTags)
	.refine(s => s.length <= FACT_TAGS_MAX_CHARS, { message: 'tags too long' })

/** One docs row: POST /resources/article-sync { facts: [...] }. */
export const SyncFactSchema = z.object({
	key: z.string().trim().min(1).max(FACT_KEY_MAX_CHARS),
	fact: z.string().trim().min(1).max(FACT_MAX_CHARS),
	tags: tagsField,
	question: z.string().trim().max(FACT_QUESTION_MAX_CHARS).nullish(),
	answer: z.string().trim().max(FACT_ANSWER_MAX_CHARS).nullish(),
})

export const SyncFactsPayloadSchema = z.object({
	facts: z.array(SyncFactSchema).max(FACT_SYNC_MAX_ROWS),
})

export type SyncFact = z.infer<typeof SyncFactSchema>

/** True when a sync POST body is the facts shape, not the articles shape. */
export function isFactsPayload(raw: unknown): boolean {
	return Boolean(raw && typeof raw === 'object' && 'facts' in (raw as object))
}
