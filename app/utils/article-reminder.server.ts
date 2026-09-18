/**
 * The article reminder job. Every few minutes one tick decides whether to
 * text Sarah about the articles and questions that wait for her, and sends
 * at most one text. The rules live in article-reminder.ts. This file reads
 * the inputs (Boulevard, the appointment snapshot, the review tables) and
 * keeps the ledger in BlvdSyncState.
 *
 * The destination comes from the environment only. Her number is never in
 * the code, the tests or the logs.
 */
import { TIME_ZONE } from '#app/routes/review+/_shared.server.ts'
import {
	checkoutsAfter,
	decideReminder,
	inTextWindow,
	ledgerForDay,
	stampReminder,
	withCheckout,
	zoneDate,
	zoneDayStart,
	type ReminderKind,
	type ReminderLedger,
} from '#app/utils/article-reminder.ts'
import { readStaffAvailability } from '#app/utils/blvd-availability.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { listAnswersForSync } from '#app/utils/review-asks.server.ts'
import { readAppointmentSnapshot } from '#app/utils/review-link.server.ts'
import { loadWaiting } from '#app/utils/review-waiting.server.ts'
import { isPermanentSMSError, sendSMS } from '#app/utils/sms.server.ts'

/** Sarah's Boulevard staff id: her shifts, her blocks, her appointments. */
export const REVIEWER_STAFF_URN =
	'urn:blvd:Staff:c0069cf2-aee2-4a2c-a6eb-5abe62192e89'
export const REMINDER_LEDGER_KEY = 'article-reminder:ledger'
/** The review events that count as a decision. */
const DECISION_KINDS = [
	'approved',
	'rewrite_requested',
	'changes_requested',
	'denied',
]

export type ReminderResult = {
	sent: 0 | 1
	kind?: ReminderKind
	skipped?: string
}

/** ARTICLE_REMINDER_SMS_TO, else REVIEW_REMINDER_SMS_TO. Null when unset. */
export function articleReminderDestination(): string | null {
	return (
		process.env.ARTICLE_REMINDER_SMS_TO?.trim() ||
		process.env.REVIEW_REMINDER_SMS_TO?.trim() ||
		null
	)
}

let warnedNoReviewer = false

function latestDate(...dates: Array<Date | null | undefined>): Date | null {
	const times = dates.flatMap(d => (d ? [d.getTime()] : []))
	return times.length ? new Date(Math.max(...times)) : null
}

/**
 * The reviewer: the user whose phone ends with the destination's last 10
 * digits, else the admin named Sarah.
 */
async function findReviewer(destination: string) {
	const last10 = destination.replace(/\D/g, '').slice(-10)
	const byPhone =
		last10.length === 10
			? await prisma.user.findFirst({
					where: { phone: { endsWith: last10 } },
					select: { id: true },
				})
			: null
	if (byPhone) return byPhone
	return prisma.user.findFirst({
		where: { roles: { some: { name: 'admin' } }, name: { contains: 'sarah' } },
		select: { id: true },
	})
}

async function readLedger(day: string): Promise<ReminderLedger> {
	const row = await prisma.blvdSyncState.findUnique({
		where: { key: REMINDER_LEDGER_KEY },
	})
	let stored: Partial<ReminderLedger> = {}
	try {
		stored = row?.value
			? (JSON.parse(row.value) as Partial<ReminderLedger>)
			: {}
	} catch {
		stored = {}
	}
	return ledgerForDay(
		{ ...stored, day: stored.day ?? day, checkouts: stored.checkouts ?? {} },
		day,
	)
}

async function writeLedger(ledger: ReminderLedger) {
	const value = JSON.stringify(ledger)
	await prisma.blvdSyncState.upsert({
		where: { key: REMINDER_LEDGER_KEY },
		create: { key: REMINDER_LEDGER_KEY, value },
		update: { value },
	})
}

export async function sendArticleReminderText(
	now = new Date(),
): Promise<ReminderResult> {
	const to = articleReminderDestination()
	if (!to) return { sent: 0, skipped: 'no destination' }
	const reviewer = await findReviewer(to)
	if (!reviewer) {
		if (!warnedNoReviewer) {
			console.error('Article reminder: no user matches the destination')
			warnedNoReviewer = true
		}
		return { sent: 0, skipped: 'no reviewer user' }
	}

	const day = zoneDate(now, TIME_ZONE)
	const dayStart = zoneDayStart(day, TIME_ZONE)
	const snapshot = await readAppointmentSnapshot()
	const appointments = (snapshot?.appointments ?? [])
		.filter(
			a =>
				a.staffId === REVIEWER_STAFF_URN &&
				zoneDate(new Date(a.startAt), TIME_ZONE) === day,
		)
		.map(a => ({
			id: a.id,
			startAt: a.startAt,
			endAt: a.endAt,
			state: a.state,
		}))
	const ledger = checkoutsAfter(appointments, await readLedger(day), now)

	// Boulevard and the review tables are only asked when a text is possible.
	const waiting = await loadWaiting(now)
	const counts = {
		articles: waiting.articles.length,
		questions: waiting.questions.length,
	}
	const possible =
		counts.articles + counts.questions > 0 && inTextWindow(now, TIME_ZONE)
	if (!possible) {
		await writeLedger(ledger)
		return { sent: 0 }
	}

	const [availability, setting, lastEvent, decisions, answers] =
		await Promise.all([
		readStaffAvailability(REVIEWER_STAFF_URN, day, TIME_ZONE, now),
		prisma.reviewSetting.findUnique({
			where: { userId: reviewer.id },
			select: { lastOpenAt: true },
		}),
		// Only /review stamps lastOpenAt. She also works on /admin/outreach,
		// so a save, an edit or a decision there counts as "she opened it".
		prisma.articleReviewEvent.findFirst({
			where: { userId: reviewer.id },
			orderBy: { at: 'desc' },
			select: { at: true },
		}),
		prisma.articleReviewEvent.count({
			where: {
				userId: reviewer.id,
				kind: { in: DECISION_KINDS },
				at: { gte: dayStart },
			},
		}),
		listAnswersForSync(dayStart),
	])
	const decision = decideReminder({
		now,
		zone: TIME_ZONE,
		working: availability.working ?? appointments.length > 0,
		appointments,
		waiting,
		lastOpenAt: latestDate(setting?.lastOpenAt, lastEvent?.at),
		decidedToday: decisions > 0 || answers.length > 0,
		ledger,
	})
	if (!decision) {
		await writeLedger(ledger)
		return { sent: 0 }
	}

	// The stamp is written before the send. If the write fails, no text went
	// out, and the retry cannot send the same text twice.
	await writeLedger(stampReminder(ledger, decision.kind, now))
	const result = await sendSMS({ to, body: decision.body })
	if (result.status !== 'success') {
		console.error('Article reminder text failed:', decision.kind, result.error)
		// The number replied STOP, or is not a mobile: the stamp stays, so the
		// job does not try again every tick. A person must text START.
		if (isPermanentSMSError(result)) {
			return { sent: 0, kind: decision.kind, skipped: 'recipient blocked' }
		}
		// Unstamped, so the next tick tries again.
		await writeLedger(ledger)
		return { sent: 0, kind: decision.kind, skipped: 'send failed' }
	}
	console.log(
		`Article reminder text sent: kind=${decision.kind} articles=${counts.articles} questions=${counts.questions}`,
	)
	return { sent: 1, kind: decision.kind }
}

/** The webhook's exact checkout time. The first note for an id wins. */
export async function noteCheckout(
	appointmentId: string,
	now = new Date(),
): Promise<void> {
	const ledger = await readLedger(zoneDate(now, TIME_ZONE))
	if (ledger.checkouts[appointmentId]) return
	await writeLedger(withCheckout(ledger, appointmentId, now))
}
