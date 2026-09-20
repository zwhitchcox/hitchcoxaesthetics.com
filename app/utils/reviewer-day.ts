/**
 * One provider's day, for the review-pace report: how much of her working
 * day was free, and how much of it went to reviewing articles. Pure: the
 * job feeds it spans in milliseconds and stores the minutes.
 */

export type Span = { start: number; end: number }

export type ReviewerDayInput = {
	/** Her shifts that day, from Boulevard. */
	shifts: Span[]
	/** Her personal time blocks that day, from Boulevard. */
	blocks: Span[]
	/** Her appointments that day, from the mirror; cancelled ones left out. */
	appointments: Span[]
	/** Her sessions on the review pages that day, from PostHog. */
	reviewSessions: Span[]
}

export type ReviewerDayMetrics = {
	/** Null when Boulevard gave no shift: the day's free time is unknown. */
	shiftMinutes: number | null
	blockMinutes: number | null
	appointmentMinutes: number | null
	freeMinutes: number | null
	reviewMinutes: number
	reviewSessions: number
}

/** A session's last event is not its end; allow this much after it. */
const SESSION_TAIL_MS = 60_000

/** Merge overlapping spans; the result is sorted and disjoint. */
export function mergeSpans(spans: ReadonlyArray<Span>): Span[] {
	const sorted = spans
		.filter(s => s.end >= s.start)
		.map(s => ({ ...s }))
		.sort((a, b) => a.start - b.start)
	const out: Span[] = []
	for (const s of sorted) {
		const last = out[out.length - 1]
		if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
		else out.push(s)
	}
	return out
}

/** The part of `spans` that lies inside `windows`, merged. */
export function clipSpans(
	spans: ReadonlyArray<Span>,
	windows: ReadonlyArray<Span>,
): Span[] {
	const out: Span[] = []
	for (const w of mergeSpans(windows)) {
		for (const s of spans) {
			const start = Math.max(s.start, w.start)
			const end = Math.min(s.end, w.end)
			const point = s.start === s.end && s.start >= w.start && s.start < w.end
			if (end > start || point) out.push({ start, end })
		}
	}
	return mergeSpans(out)
}

export function spanMinutes(spans: ReadonlyArray<Span>): number {
	return Math.round(
		mergeSpans(spans).reduce((n, s) => n + (s.end - s.start), 0) / 60_000,
	)
}

export function reviewerDayMetrics(input: ReviewerDayInput): ReviewerDayMetrics {
	const shifts = mergeSpans(input.shifts)
	const sessions = mergeSpans(
		input.reviewSessions.map(s => ({ start: s.start, end: s.end + SESSION_TAIL_MS })),
	)
	const reviewMinutes = spanMinutes(sessions)
	if (shifts.length === 0) {
		return {
			shiftMinutes: null,
			blockMinutes: null,
			appointmentMinutes: null,
			freeMinutes: null,
			reviewMinutes,
			reviewSessions: sessions.length,
		}
	}
	const shiftMinutes = spanMinutes(shifts)
	const blocks = clipSpans(input.blocks, shifts)
	const appointments = clipSpans(input.appointments, shifts)
	const busy = spanMinutes([...blocks, ...appointments])
	return {
		shiftMinutes,
		blockMinutes: spanMinutes(blocks),
		appointmentMinutes: spanMinutes(appointments),
		freeMinutes: Math.max(0, shiftMinutes - busy),
		reviewMinutes,
		reviewSessions: sessions.length,
	}
}

/** The calendar day after a yyyy-MM-dd day. */
export function nextDay(day: string): string {
	const [y, m, d] = day.split('-').map(Number) as [number, number, number]
	return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** The `n` calendar days ending on `endDay`, oldest first. */
export function dayRange(endDay: string, n: number): string[] {
	const [y, m, d] = endDay.split('-').map(Number) as [number, number, number]
	const out: string[] = []
	for (let i = n - 1; i >= 0; i--) {
		out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10))
	}
	return out
}

/** Event times become sittings: a gap over `gapMs` starts a new one. */
export function sessionsFromTimes(
	times: ReadonlyArray<number>,
	gapMs: number,
): Span[] {
	const out: Span[] = []
	for (const t of [...times].sort((a, b) => a - b)) {
		const last = out[out.length - 1]
		if (last && t - last.end <= gapMs) last.end = t
		else out.push({ start: t, end: t })
	}
	return out
}
