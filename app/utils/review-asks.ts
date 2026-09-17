/**
 * The questions for Sarah from the outreach ledger (phase 6), pure pieces:
 * the sync payload the mini sends, the effort words on a card, the order
 * of the cards, and the files an ask carries. No server imports;
 * review-asks.server.ts does the reads and writes.
 */
import { z } from 'zod'

/** Rows in one sync POST. */
export const ASK_SYNC_MAX_ROWS = 200
export const ASK_KEY_MAX_CHARS = 120
export const ASK_DOMAIN_MAX_CHARS = 200
export const ASK_MAX_CHARS = 2000
export const ASK_EFFORT_MAX_CHARS = 40
export const ASK_ABOUT_MAX_CHARS = 600
export const ASK_STANDING_MAX_CHARS = 1500
export const ASK_FILE_NAME_MAX_CHARS = 120
export const ASK_FILE_TEXT_MAX_CHARS = 6000
export const ASK_FILES_MAX = 3

/** One handoff file the ask names, inlined by the mini. */
export const SyncAskFileSchema = z.object({
	name: z.string().trim().min(1).max(ASK_FILE_NAME_MAX_CHARS),
	text: z.string().max(ASK_FILE_TEXT_MAX_CHARS),
})

/** One open ask: POST /resources/article-sync { asks: [...] }. */
export const SyncAskSchema = z.object({
	key: z.string().trim().min(1).max(ASK_KEY_MAX_CHARS),
	targetId: z.number().int().nullish(),
	domain: z.string().trim().min(1).max(ASK_DOMAIN_MAX_CHARS),
	ask: z.string().trim().min(1).max(ASK_MAX_CHARS),
	effort: z.string().trim().max(ASK_EFFORT_MAX_CHARS).nullish(),
	about: z.string().trim().max(ASK_ABOUT_MAX_CHARS).nullish(),
	standing: z.string().trim().max(ASK_STANDING_MAX_CHARS).nullish(),
	files: z.array(SyncAskFileSchema).max(ASK_FILES_MAX).nullish(),
})

export const SyncAsksPayloadSchema = z.object({
	asks: z.array(SyncAskSchema).max(ASK_SYNC_MAX_ROWS),
})

export type SyncAsk = z.infer<typeof SyncAskSchema>
export type AskFile = z.infer<typeof SyncAskFileSchema>

/** True when a sync POST body is the asks shape, not the articles or facts shape. */
export function isAsksPayload(raw: unknown): boolean {
	return Boolean(raw && typeof raw === 'object' && 'asks' in (raw as object))
}

/* ------------------------------------------------------------------------ */
/* The card                                                                  */
/* ------------------------------------------------------------------------ */

const EFFORT_WORDS: Record<string, string> = {
	'2min': 'about 2 minutes',
	'15min': 'about 15 minutes',
	'1h': 'about an hour',
	'half-day': 'half a day',
}

/** "about 2 minutes" for 2min, and so on. Null for anything else. */
export function effortWords(effort: string | null | undefined): string | null {
	return EFFORT_WORDS[effort?.trim().toLowerCase() ?? ''] ?? null
}

function effortRank(effort: string | null | undefined): number {
	return effort?.trim().toLowerCase() === '2min' ? 0 : 1
}

/** The 2-minute asks first; inside a group the one opened first. */
export function compareAsks(
	a: { effort: string | null; openedAt: Date },
	b: { effort: string | null; openedAt: Date },
): number {
	return (
		effortRank(a.effort) - effortRank(b.effort) ||
		a.openedAt.getTime() - b.openedAt.getTime()
	)
}

/** The files an ask carries, from the stored JSON. Bad or missing JSON gives none. */
export function parseAskFiles(filesJson: string | null | undefined): AskFile[] {
	if (!filesJson) return []
	try {
		const parsed = z.array(SyncAskFileSchema).safeParse(JSON.parse(filesJson))
		return parsed.success ? parsed.data : []
	} catch {
		return []
	}
}
