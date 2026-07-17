/**
 * Texts the provider when their appointment is checked out so they remember to
 * ask for the Google review while the client is still at the desk. Piggybacks
 * on the Review Appointment Sync job (every ~10 min).
 *
 * Trigger is Boulevard's checkout, not the clock: when a sale closes, the
 * appointment's state flips to FINAL. We keep each appointment's last-seen
 * state in BlvdSyncState and text on the transition into FINAL. An appointment
 * we FIRST see already FINAL only texts when its scheduled end is recent
 * (walk-in checked out between two sync runs); anything older finished before
 * we started watching and stays silent — this also keeps the first run after a
 * deploy from blasting texts for the whole 2-day snapshot window.
 *
 * The text goes to the staff member's Boulevard mobilePhone, falling back to
 * REVIEW_REMINDER_SMS_TO when they don't have one.
 */
import { prisma } from '#app/utils/db.server.ts'
import {
	readAppointmentSnapshot,
	type CachedAppointment,
} from '#app/utils/review-link.server.ts'
import { sendSMS } from '#app/utils/sms.server.ts'

const LEDGER_KEY = 'review-reminder-sms:ledger'
// First-seen-FINAL appointments only text when scheduled to end this recently.
const FIRST_SEEN_GRACE_MS = 60 * 60 * 1000
const PRUNE_MS = 3 * 24 * 60 * 60 * 1000
const CHECKED_OUT_STATES = new Set(['FINAL', 'COMPLETED'])

type LedgerEntry = {
	state: string | null
	seenAt: string
	sentAt?: string
}
type Ledger = Record<string, LedgerEntry>

async function readLedger(): Promise<Ledger> {
	const row = await prisma.blvdSyncState.findUnique({
		where: { key: LEDGER_KEY },
	})
	try {
		return row?.value ? (JSON.parse(row.value) as Ledger) : {}
	} catch {
		return {}
	}
}

function reminderBody(appt: CachedAppointment) {
	const client = appt.clientFirstName ?? 'Your client'
	return `Review reminder: ${client} (${appt.serviceName}) is checking out. Ask for the Google review before they leave!`
}

const isCheckedOut = (state: string | null) =>
	CHECKED_OUT_STATES.has((state ?? '').toUpperCase())

export async function sendReviewReminderTexts(
	now = new Date(),
): Promise<{ sent: number }> {
	const snapshot = await readAppointmentSnapshot()
	if (!snapshot) return { sent: 0 }
	return runReminderPass(snapshot.appointments, now, FIRST_SEEN_GRACE_MS)
}

/**
 * Instant path: the Boulevard APPOINTMENT_COMPLETED webhook hands us one
 * appointment id the moment checkout happens. We re-fetch it from Boulevard
 * (never trusting the webhook payload) and run the same ledger logic. No
 * first-seen grace here: the webhook only fires at actual checkout, so a
 * first sighting in FINAL state is a live checkout by definition.
 */
export async function sendReviewReminderForAppointment(
	appointmentId: string,
	now = new Date(),
): Promise<{ sent: number }> {
	const { boulevardAdminFetch } = await import('#app/utils/blvd-admin.server.ts')
	const data = await boulevardAdminFetch<{
		appointment?: {
			id?: string | null
			startAt?: string | null
			endAt?: string | null
			state?: string | null
			client?: { firstName?: string | null } | null
			location?: { id?: string | null; name?: string | null } | null
			appointmentServices?: Array<{
				service?: { name?: string | null } | null
				staff?: {
					id?: string | null
					firstName?: string | null
					lastName?: string | null
					mobilePhone?: string | null
				} | null
			}> | null
		} | null
	}>(
		`query ReviewReminderAppt($id: ID!) {
			appointment(id: $id) {
				id startAt endAt state
				client { firstName }
				location { id name }
				appointmentServices { service { name } staff { id firstName lastName mobilePhone } }
			}
		}`,
		{ id: appointmentId },
	)
	const node = data.appointment
	const svc =
		node?.appointmentServices?.find(s => s.staff?.id) ??
		node?.appointmentServices?.[0]
	if (!node?.id || !node.startAt || !svc?.staff?.id) return { sent: 0 }
	const appt: CachedAppointment = {
		id: node.id,
		startAt: node.startAt,
		endAt: node.endAt ?? null,
		state: node.state ?? null,
		locationId: node.location?.id ?? '',
		locationName: node.location?.name ?? '',
		staffId: svc.staff.id,
		staffName: [svc.staff.firstName, svc.staff.lastName]
			.filter(Boolean)
			.join(' '),
		staffPhone: svc.staff.mobilePhone ?? null,
		clientFirstName: node.client?.firstName ?? null,
		serviceName: svc.service?.name ?? 'Aesthetic treatment',
	}
	return runReminderPass([appt], now, Infinity)
}

async function runReminderPass(
	appointments: CachedAppointment[],
	now: Date,
	firstSeenGraceMs: number,
): Promise<{ sent: number }> {
	const fallbackTo = process.env.REVIEW_REMINDER_SMS_TO?.trim() || null
	const ledger = await readLedger()
	const nowMs = now.getTime()
	let sent = 0

	for (const appt of appointments) {
		const prev = ledger[appt.id]
		const entry: LedgerEntry = {
			state: appt.state ?? null,
			seenAt: now.toISOString(),
			...(prev?.sentAt ? { sentAt: prev.sentAt } : {}),
		}
		ledger[appt.id] = entry
		if (entry.sentAt || !isCheckedOut(appt.state)) continue

		if (prev) {
			// Watched appointment: text only on the transition into checkout.
			if (isCheckedOut(prev.state)) continue
		} else if (firstSeenGraceMs !== Infinity) {
			// First sighting already checked out: only text if it was scheduled
			// to end within the last hour (fast walk-in / first run after boot).
			const end = appt.endAt ? new Date(appt.endAt).getTime() : NaN
			if (!Number.isFinite(end) || end < nowMs - firstSeenGraceMs) continue
		}

		const to = appt.staffPhone?.trim() || fallbackTo
		if (!to) continue
		const result = await sendSMS({ to, body: reminderBody(appt) })
		if (result.status !== 'success') {
			console.error('Review reminder SMS failed:', appt.id, result.error)
			// Roll the remembered state back so the next run still sees the
			// transition into checkout and retries the text.
			if (prev) entry.state = prev.state
			else delete ledger[appt.id]
			continue
		}
		entry.sentAt = now.toISOString()
		sent++
	}

	for (const [id, entry] of Object.entries(ledger)) {
		if (new Date(entry.seenAt).getTime() < nowMs - PRUNE_MS) delete ledger[id]
	}
	await prisma.blvdSyncState.upsert({
		where: { key: LEDGER_KEY },
		create: { key: LEDGER_KEY, value: JSON.stringify(ledger) },
		update: { value: JSON.stringify(ledger) },
	})
	return { sent }
}
