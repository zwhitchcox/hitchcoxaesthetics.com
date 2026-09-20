/**
 * How much of her working day went to reviewing articles. One row per New
 * York day for the reviewer, from three places: her shifts and blocks in
 * Boulevard, the appointment mirror for the booked minutes, and PostHog for
 * the minutes she spent on the review pages. On a day PostHog has none of
 * her sessions (before her events carried her user id, or when a blocker ate
 * them), the review events in our own database stand in.
 */
import {
	findReviewerUser,
	REVIEWER_STAFF_URN,
} from '#app/utils/article-reminder.server.ts'
import { zoneDate, zoneDayStart } from '#app/utils/article-reminder.ts'
import {
	fetchStaffDay,
	shiftSpan,
} from '#app/utils/blvd-availability.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { hogql } from '#app/utils/gmb-bookings.server.ts'
import {
	clipSpans,
	dayRange,
	nextDay,
	reviewerDayMetrics,
	sessionsFromTimes,
	type Span,
} from '#app/utils/reviewer-day.ts'

const TIME_ZONE = 'America/New_York'
/** Days kept in the table. */
export const REVIEWER_DAY_WINDOW = 35
/** Days read again on every run: today is still going and bookings move. */
const REFRESH_DAYS = 3
/** Two review events this far apart are two sittings. */
const EVENT_GAP_MS = 10 * 60_000
/** Appointments that took none of her time. */
const SKIPPED_STATES = new Set(['CANCELLED', 'NO_SHOW', 'NOSHOW'])
/** The pages she reviews on. */
const REVIEW_PATHS = ['/review', '/admin/outreach', '/admin/articles']

export type ReviewerDaysResult = { days: number; skipped?: string }

export async function syncReviewerDays(
	now = new Date(),
): Promise<ReviewerDaysResult> {
	const reviewer = await findReviewerUser()
	if (!reviewer) return { days: 0, skipped: 'no reviewer user' }
	// The booked minutes need the staff ids on the mirror. A mirror synced
	// before they were recorded would make every day look free.
	const tagged = await prisma.blvdAppointment.count({
		where: { staffIds: { not: null } },
	})
	if (tagged === 0) {
		return { days: 0, skipped: 'appointment mirror has no staff ids yet' }
	}

	const days = dayRange(zoneDate(now, TIME_ZONE), REVIEWER_DAY_WINDOW)
	const kept = new Set(
		(
			await prisma.reviewerDay.findMany({
				where: { staffId: REVIEWER_STAFF_URN, day: { in: days } },
				select: { day: true },
			})
		).map(r => r.day),
	)
	const todo = days.filter(
		(day, i) => !kept.has(day) || i >= days.length - REFRESH_DAYS,
	)
	if (todo.length === 0) return { days: 0 }
	const from = zoneDayStart(todo[0]!, TIME_ZONE)
	const to = zoneDayStart(nextDay(days[days.length - 1]!), TIME_ZONE)
	const [posthogSessions, eventSessions, appointments] = await Promise.all([
		readPostHogSessions(reviewer.id, from),
		readEventSessions(reviewer.id, from),
		readAppointments(from, to),
	])

	let written = 0
	for (const day of todo) {
		const window = {
			start: zoneDayStart(day, TIME_ZONE).getTime(),
			end: zoneDayStart(nextDay(day), TIME_ZONE).getTime(),
		}
		let staffDay: Awaited<ReturnType<typeof fetchStaffDay>>
		try {
			staffDay = await fetchStaffDay(REVIEWER_STAFF_URN, day, TIME_ZONE)
		} catch (error) {
			// Keep the row from the last run; the next run tries again.
			console.error(
				`Reviewer days: Boulevard read failed for ${day}`,
				error instanceof Error ? error.message : String(error),
			)
			continue
		}
		const fromPostHog = clipSpans(posthogSessions, [window])
		const sessions = fromPostHog.length
			? fromPostHog
			: clipSpans(eventSessions, [window])
		const metrics = reviewerDayMetrics({
			shifts: staffDay.shifts.map(shift => {
				const [start, end] = shiftSpan(shift, day, TIME_ZONE)
				return { start, end }
			}),
			blocks: staffDay.blocks.map(b => ({
				start: Date.parse(b.startAt),
				end: Date.parse(b.endAt),
			})),
			appointments: clipSpans(appointments, [window]),
			reviewSessions: sessions,
		})
		const data = {
			...metrics,
			reviewSource: fromPostHog.length ? 'posthog' : 'events',
			fetchedAt: now,
		}
		await prisma.reviewerDay.upsert({
			where: { staffId_day: { staffId: REVIEWER_STAFF_URN, day } },
			create: { staffId: REVIEWER_STAFF_URN, day, ...data },
			update: data,
		})
		written++
	}
	await prisma.reviewerDay.deleteMany({
		where: { staffId: REVIEWER_STAFF_URN, day: { lt: days[0]! } },
	})
	return { days: written }
}

/** Her sessions on the review pages: first event to last event, each. */
async function readPostHogSessions(
	userId: string,
	since: Date,
): Promise<Span[]> {
	// The id goes into the query text; ours are cuids, letters and digits.
	if (!/^[a-z0-9]+$/i.test(userId)) return []
	const days = Math.ceil((Date.now() - since.getTime()) / 86_400_000) + 1
	const onReviewPages = REVIEW_PATHS.map(
		p => `properties.$pathname = '${p}' OR properties.$pathname LIKE '${p}/%'`,
	).join(' OR ')
	const rows = await hogql<[number, number]>(
		`SELECT toUnixTimestamp(min(timestamp)), toUnixTimestamp(max(timestamp))
		FROM events
		WHERE properties.app_user_id = '${userId}'
			AND timestamp >= now() - INTERVAL ${days} DAY
			AND properties.$session_id != ''
			AND (${onReviewPages})
		GROUP BY properties.$session_id
		LIMIT 5000`,
	)
	return rows
		.filter(r => Number.isFinite(r[0]) && Number.isFinite(r[1]))
		.map(([start, end]) => ({ start: start * 1000, end: end * 1000 }))
}

/** Her saved edits, questions and decisions, grouped into sittings. */
async function readEventSessions(
	userId: string,
	since: Date,
): Promise<Span[]> {
	const events = await prisma.articleReviewEvent.findMany({
		where: { userId, at: { gte: since } },
		orderBy: { at: 'asc' },
		select: { at: true },
	})
	return sessionsFromTimes(
		events.map(e => e.at.getTime()),
		EVENT_GAP_MS,
	)
}

/** Her booked appointments from the mirror; cancellations and no-shows out. */
async function readAppointments(from: Date, to: Date): Promise<Span[]> {
	const rows = await prisma.blvdAppointment.findMany({
		where: {
			staffIds: { contains: REVIEWER_STAFF_URN },
			cancelled: false,
			startAt: { gte: from, lt: to },
		},
		select: { startAt: true, durationMinutes: true, state: true },
	})
	return rows
		.filter(r => !SKIPPED_STATES.has((r.state ?? '').toUpperCase()))
		.map(r => ({
			start: r.startAt.getTime(),
			end: r.startAt.getTime() + (r.durationMinutes ?? 0) * 60_000,
		}))
}
