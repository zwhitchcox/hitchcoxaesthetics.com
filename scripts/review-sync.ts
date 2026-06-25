/**
 * Manually refresh the review-link appointment snapshot.
 *
 *   pnpm exec tsx scripts/review-sync.ts          # populate snapshot, no PostHog events
 *   pnpm exec tsx scripts/review-sync.ts --emit   # also emit review_appointment_eligible
 *
 * The background job does this automatically in production; this is for local
 * testing and one-off refreshes.
 */
import 'dotenv/config'

import {
	readAppointmentSnapshot,
	resolveCurrentAppointment,
} from '#app/utils/review-link.server.ts'
import { syncReviewAppointments } from '#app/utils/review-link-sync.server.ts'

async function main() {
	const emit = process.argv.includes('--emit')
	const result = await syncReviewAppointments({ emitEvents: emit })
	console.log('sync:', result, emit ? '(events emitted)' : '(no events)')

	const snap = await readAppointmentSnapshot()
	const byStaff = new Map<string, number>()
	for (const a of snap?.appointments ?? [])
		byStaff.set(a.staffId, (byStaff.get(a.staffId) ?? 0) + 1)

	console.log(`\nsnapshot: ${snap?.appointments.length ?? 0} recent appointments`)
	for (const [staffId, count] of byStaff) {
		const uuid = staffId.split(':').pop()
		const appt = resolveCurrentAppointment(snap, staffId)
		const resolved = appt ? `${appt.startAt} — ${appt.serviceName}` : 'no current appt in window'
		console.log(`  ${uuid}  (${count} appts)  ->  ${resolved}`)
	}
}

main().catch(e => {
	console.error(e?.message || e)
	process.exit(1)
})
