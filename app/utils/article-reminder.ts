/**
 * When to text Sarah about the articles and questions that wait for her.
 * Pure and browser safe: the job (article-reminder.server.ts) reads the
 * inputs, this file decides. Every clock rule uses the practice's wall clock
 * in `zone`.
 *
 * The kinds, checked in this order, one text per tick:
 * - gap: a break of 30 minutes or more between two clients, 10 minutes after
 *   the checkout. Once a day, only when she has not opened /review today.
 * - eod: 20 minutes after her last client, when she made no decision today.
 * - morning: from 09:00 until her first client, on a day that starts at 10:00
 *   or later (until 11:00 when she has no clients). Once a day, only when she
 *   has not opened /review today.
 * - alert: something new landed after she cleared the queue, or after the
 *   last text told her what waited. At most one text per 4 hours, never in
 *   the 10 minutes after a checkout.
 *
 * Nothing on a day off, before 09:00, from 21:00, while she is with a client,
 * when nothing waits, or within 90 minutes of the last text (a reminder that
 * falls inside that spacing goes out once the spacing has passed).
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { waitingText } from '#app/utils/review-waiting.ts'

export type ReminderKind = 'gap' | 'eod' | 'morning' | 'alert'

export type ReminderLedger = {
	/** The zone's date (yyyy-MM-dd) the once-a-day stamps belong to. */
	day: string
	morningAt?: string
	gapAt?: string
	eodAt?: string
	/** The last text of any kind. */
	lastTextAt?: string
	lastAlertAt?: string
	/** Appointment id -> when its checkout was first seen (ISO). */
	checkouts: Record<string, string>
}

export type ReminderAppointment = {
	id: string
	startAt: string
	endAt: string | null
	state: string | null
}

export type ReminderWaiting = {
	articles: { receivedAt: Date; title: string }[]
	questions: { openedAt: Date; ask: string }[]
}

export type ReminderInput = {
	now: Date
	zone: string
	/** False on a day off: no text at all. */
	working: boolean
	/** Her appointments today, any state. */
	appointments: ReminderAppointment[]
	waiting: ReminderWaiting
	/** When she last opened /review. */
	lastOpenAt: Date | null
	/** She approved, denied or asked for changes today, or answered a question. */
	decidedToday: boolean
	ledger: ReminderLedger
}

export type ReminderDecision = { kind: ReminderKind; body: string }

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const OPEN_MINUTES = 9 * 60
const CLOSE_MINUTES = 21 * 60
const MORNING_END_MINUTES = 11 * 60
const LATE_START_MINUTES = 10 * 60
const GAP_AFTER_CHECKOUT_MS = 10 * MINUTE_MS
const GAP_MIN_MS = 30 * MINUTE_MS
const EOD_AFTER_MS = 20 * MINUTE_MS
/** An appointment nobody checked out counts as ended this long after its end. */
const RUN_OVER_MS = 30 * MINUTE_MS
const ALERT_EVERY_MS = 4 * HOUR_MS
const ALERT_AFTER_CHECKOUT_MS = 10 * MINUTE_MS
/** No two texts closer than this, whatever their kinds. */
const TEXT_SPACING_MS = 90 * MINUTE_MS
const CHECKOUT_KEEP_MS = 2 * 24 * HOUR_MS

const SKIPPED_STATES = new Set(['CANCELLED', 'NO_SHOW', 'NOSHOW'])
const CHECKED_OUT_STATES = new Set(['FINAL', 'COMPLETED'])

const stateOf = (a: ReminderAppointment) => (a.state ?? '').toUpperCase()
const isCheckedOut = (a: ReminderAppointment) =>
	CHECKED_OUT_STATES.has(stateOf(a))

/** The zone's calendar date of an instant, yyyy-MM-dd. */
export function zoneDate(at: Date, zone: string): string {
	return formatInTimeZone(at, zone, 'yyyy-MM-dd')
}

/** Midnight of a zone date, as an instant. */
export function zoneDayStart(day: string, zone: string): Date {
	return fromZonedTime(`${day}T00:00:00`, zone)
}

/** Minutes since the zone's midnight. */
function zoneMinutes(at: Date, zone: string): number {
	const [hours, minutes] = formatInTimeZone(at, zone, 'HH:mm').split(':')
	return Number(hours) * 60 + Number(minutes)
}

/** Texts go out from 09:00 to 21:00 on the zone's wall clock. */
export function inTextWindow(now: Date, zone: string): boolean {
	const minutes = zoneMinutes(now, zone)
	return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES
}

/** Drops the once-a-day stamps when the zone's date has changed. */
export function ledgerForDay(
	ledger: ReminderLedger,
	day: string,
): ReminderLedger {
	if (ledger.day === day) return ledger
	const { morningAt: _m, gapAt: _g, eodAt: _e, ...kept } = ledger
	return { ...kept, day }
}

/** Records a checkout time when the appointment has none yet. */
export function withCheckout(
	ledger: ReminderLedger,
	appointmentId: string,
	at: Date,
): ReminderLedger {
	if (ledger.checkouts[appointmentId]) return ledger
	return {
		...ledger,
		checkouts: { ...ledger.checkouts, [appointmentId]: at.toISOString() },
	}
}

/**
 * Records the time each checked-out appointment was first seen checked out
 * and forgets checkouts older than 2 days. The webhook writes the exact time;
 * this catches the checkouts it missed, within one tick.
 */
export function checkoutsAfter(
	appointments: ReminderAppointment[],
	ledger: ReminderLedger,
	now: Date,
): ReminderLedger {
	const keepFrom = now.getTime() - CHECKOUT_KEEP_MS
	const checkouts: Record<string, string> = {}
	for (const [id, at] of Object.entries(ledger.checkouts)) {
		if (Date.parse(at) >= keepFrom) checkouts[id] = at
	}
	let next = { ...ledger, checkouts }
	for (const a of appointments) {
		if (isCheckedOut(a)) next = withCheckout(next, a.id, now)
	}
	return next
}

/** The ledger after a text of this kind went out. */
export function stampReminder(
	ledger: ReminderLedger,
	kind: ReminderKind,
	at: Date,
): ReminderLedger {
	const iso = at.toISOString()
	const stamped = { ...ledger, lastTextAt: iso }
	if (kind === 'gap') return { ...stamped, gapAt: iso }
	if (kind === 'eod') return { ...stamped, eodAt: iso }
	if (kind === 'morning') return { ...stamped, morningAt: iso }
	return { ...stamped, lastAlertAt: iso }
}

type Visit = ReminderAppointment & {
	start: number
	end: number
	/** When it ended, or null while it may still run. */
	ended: number | null
	checkedOut: boolean
}

/** Her live appointments today, in start order, with their end times. */
function visitsToday(
	appointments: ReminderAppointment[],
	day: string,
	zone: string,
	ledger: ReminderLedger,
	nowMs: number,
): Visit[] {
	return appointments
		.filter(
			a =>
				!SKIPPED_STATES.has(stateOf(a)) &&
				zoneDate(new Date(a.startAt), zone) === day,
		)
		.map(a => {
			const start = Date.parse(a.startAt)
			// An appointment without an end is treated as over when it starts.
			const end = a.endAt ? Date.parse(a.endAt) : start
			const checkout = ledger.checkouts[a.id]
			const ended = checkout
				? Date.parse(checkout)
				: end + RUN_OVER_MS <= nowMs
					? end + RUN_OVER_MS
					: null
			return {
				...a,
				start,
				end,
				ended,
				checkedOut: Boolean(checkout) || isCheckedOut(a),
			}
		})
		.sort((a, b) => a.start - b.start)
}

function gapDue(visits: Visit[], nowMs: number, ledger: ReminderLedger) {
	if (ledger.gapAt) return false
	const ended = visits.filter(v => v.ended !== null)
	if (ended.length === 0) return false
	const last = ended.reduce((a, b) => (b.ended! > a.ended! ? b : a))
	if (last.ended! > nowMs - GAP_AFTER_CHECKOUT_MS) return false
	// After the day's last appointment the eod rule applies instead.
	const next = visits.find(v => v.start > last.ended!)
	if (!next) return false
	return next.start - last.ended! >= GAP_MIN_MS && nowMs < next.start
}

function eodDue(visits: Visit[], nowMs: number, ledger: ReminderLedger) {
	if (ledger.eodAt || visits.length === 0) return false
	const last = visits[visits.length - 1]!
	return last.ended !== null && nowMs >= last.ended + EOD_AFTER_MS
}

function morningDue(
	visits: Visit[],
	now: Date,
	zone: string,
	ledger: ReminderLedger,
) {
	if (ledger.morningAt) return false
	const first = visits[0]
	if (!first) return zoneMinutes(now, zone) < MORNING_END_MINUTES
	return (
		zoneMinutes(new Date(first.start), zone) >= LATE_START_MINUTES &&
		now.getTime() < first.start
	)
}

function alertDue(
	arrivals: number[],
	visits: Visit[],
	nowMs: number,
	lastOpenAt: Date | null,
	ledger: ReminderLedger,
) {
	// Seen: she looked at the page, or a text told her what waited.
	const lastTextMs = ledger.lastTextAt ? Date.parse(ledger.lastTextAt) : 0
	const seenUntil = Math.max(lastOpenAt?.getTime() ?? 0, lastTextMs)
	const unseen = arrivals.filter(t => t > seenUntil)
	const seenPending = arrivals.filter(t => t <= seenUntil)
	// Things she knows about still wait: the daily reminders cover that.
	if (unseen.length === 0 || seenPending.length > 0) return false
	if (ledger.lastTextAt && nowMs - lastTextMs < ALERT_EVERY_MS) return false
	// A client just left: wait for the next gap.
	const recentCheckout = visits.some(v => {
		const checkout = ledger.checkouts[v.id]
		return checkout && Date.parse(checkout) > nowMs - ALERT_AFTER_CHECKOUT_MS
	})
	return !recentCheckout
}

/** The counts the text needs, with the title when it is exactly one item. */
function countsOf(waiting: ReminderWaiting) {
	const articles = waiting.articles.length
	const questions = waiting.questions.length
	const onlyTitle =
		articles + questions === 1
			? (waiting.articles[0]?.title ?? waiting.questions[0]?.ask ?? null)
			: null
	return { articles, questions, onlyTitle }
}

export function decideReminder(input: ReminderInput): ReminderDecision | null {
	const { now, zone, lastOpenAt } = input
	const body = waitingText(countsOf(input.waiting))
	if (!body || !input.working || !inTextWindow(now, zone)) return null

	const nowMs = now.getTime()
	const day = zoneDate(now, zone)
	const ledger = ledgerForDay(input.ledger, day)
	const visits = visitsToday(input.appointments, day, zone, ledger, nowMs)
	const busy = visits.some(
		v => v.start <= nowMs && nowMs < v.end && !v.checkedOut,
	)
	if (busy) return null
	if (
		ledger.lastTextAt &&
		nowMs - Date.parse(ledger.lastTextAt) < TEXT_SPACING_MS
	)
		return null

	const openedToday =
		lastOpenAt !== null &&
		lastOpenAt.getTime() >= zoneDayStart(day, zone).getTime()
	const arrivals = [
		...input.waiting.articles.map(a => a.receivedAt.getTime()),
		...input.waiting.questions.map(q => q.openedAt.getTime()),
	]

	const kind: ReminderKind | null =
		!openedToday && gapDue(visits, nowMs, ledger)
			? 'gap'
			: !input.decidedToday && eodDue(visits, nowMs, ledger)
				? 'eod'
				: !openedToday && morningDue(visits, now, zone, ledger)
					? 'morning'
					: alertDue(arrivals, visits, nowMs, lastOpenAt, ledger)
						? 'alert'
						: null
	return kind ? { kind, body } : null
}
