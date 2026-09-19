import { zoneDate } from '#app/utils/article-reminder.ts'

/** A decision ends her work on an article, one way or the other. */
export const REVIEW_DECISION_KINDS = [
	'approved',
	'rewrite_requested',
	'changes_requested',
	'denied',
] as const

export type ReviewActivityEvent = { articleId: string; kind: string; at: Date }

export type ReviewDay = {
	/** YYYY-MM-DD in the report's time zone. */
	day: string
	/** Decisions made that day. */
	decided: number
	/** Distinct articles she opened, read, edited, asked about or decided. */
	worked: number
}

/**
 * Her review activity per day for the last `days` days, ending today in
 * `zone`. Days with nothing are present with zeros, so a chart shows the gaps.
 */
export function bucketReviewActivity(
	events: ReviewActivityEvent[],
	zone: string,
	days: number,
	now = new Date(),
): ReviewDay[] {
	const decided = new Map<string, number>()
	const worked = new Map<string, Set<string>>()
	for (const e of events) {
		const day = zoneDate(e.at, zone)
		if ((REVIEW_DECISION_KINDS as readonly string[]).includes(e.kind)) {
			decided.set(day, (decided.get(day) ?? 0) + 1)
		}
		let set = worked.get(day)
		if (!set) worked.set(day, (set = new Set()))
		set.add(e.articleId)
	}
	const today = zoneDate(now, zone)
	const [y, m, d] = today.split('-').map(Number) as [number, number, number]
	const noon = Date.UTC(y, m - 1, d, 12)
	const out: ReviewDay[] = []
	for (let i = days - 1; i >= 0; i--) {
		const day = new Date(noon - i * 86_400_000).toISOString().slice(0, 10)
		out.push({
			day,
			decided: decided.get(day) ?? 0,
			worked: worked.get(day)?.size ?? 0,
		})
	}
	return out
}
