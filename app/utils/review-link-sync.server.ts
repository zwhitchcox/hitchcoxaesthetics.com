/**
 * Keeps a small snapshot of recent Boulevard appointments in BlvdSyncState so
 * the review-link scan path (review-link.server.ts) can resolve a provider's
 * current appointment without paginating on the request. Also emits the
 * `review_appointment_eligible` PostHog event (top of the review funnel) once
 * per completed appointment.
 *
 * The Boulevard Admin API can't filter appointments by date/staff, so we
 * paginate (startAt-ascending) and keep only the recent window.
 */
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'
import {
	getServiceProfile,
	REVIEW_EVENTS,
	REVIEW_RECENT_APPOINTMENTS_KEY,
	reviewDistinctId,
	type CachedAppointment,
	type ReviewAppointmentSnapshot,
} from '#app/utils/review-link.server.ts'

const PAGE_SIZE = 100
const MAX_PAGES_PER_LOCATION = 80
const WINDOW_PAST_MS = 2 * 24 * 60 * 60 * 1000
const WINDOW_FUTURE_MS = 24 * 60 * 60 * 1000
const COMPLETED_STATES = new Set(['FINAL', 'COMPLETED', 'ARRIVED', 'CONFIRMED'])

type ApptNode = {
	id?: string | null
	startAt?: string | null
	endAt?: string | null
	state?: string | null
	client?: { firstName?: string | null } | null
	appointmentServices?: Array<{
		service?: { name?: string | null } | null
		staff?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null
	}> | null
}

const APPOINTMENTS_QUERY = `query ReviewAppts($after: String, $locationId: ID!) {
	appointments(first: ${PAGE_SIZE}, after: $after, locationId: $locationId) {
		pageInfo { endCursor hasNextPage }
		edges { node {
			id startAt endAt state
			client { firstName }
			appointmentServices { service { name } staff { id firstName lastName } }
		} }
	}
}`

export async function syncReviewAppointments({
	now = new Date(),
	emitEvents = true,
}: { now?: Date; emitEvents?: boolean } = {}): Promise<{
	cached: number
	eligibleEmitted: number
}> {
	const locations = await listBlvdAdminLocations()
	const minStart = now.getTime() - WINDOW_PAST_MS
	const maxStart = now.getTime() + WINDOW_FUTURE_MS
	const recent: CachedAppointment[] = []

	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < MAX_PAGES_PER_LOCATION; page++) {
			const resp: any = await boulevardAdminFetch(APPOINTMENTS_QUERY, {
				after,
				locationId: location.id,
			})
			const edges = resp.appointments?.edges ?? []
			if (edges.length === 0) break
			for (const edge of edges) {
				const node = edge.node as ApptNode
				const startMs = node.startAt ? new Date(node.startAt).getTime() : NaN
				if (!Number.isFinite(startMs) || startMs < minStart || startMs > maxStart) continue
				const svc = node.appointmentServices?.find(s => s.staff?.id) ?? node.appointmentServices?.[0]
				if (!node.id || !svc?.staff?.id) continue
				recent.push({
					id: node.id,
					startAt: node.startAt!,
					endAt: node.endAt ?? null,
					state: node.state ?? null,
					locationId: location.id,
					locationName: location.name ?? location.id,
					staffId: svc.staff.id,
					staffName: [svc.staff.firstName, svc.staff.lastName].filter(Boolean).join(' '),
					clientFirstName: node.client?.firstName ?? null,
					serviceName: svc.service?.name ?? 'Aesthetic treatment',
				})
			}
			const pageInfo = resp.appointments?.pageInfo
			if (!pageInfo?.hasNextPage) break
			after = pageInfo.endCursor
		}
	}

	const snapshot: ReviewAppointmentSnapshot = {
		refreshedAt: now.toISOString(),
		appointments: recent,
	}
	await prisma.blvdSyncState.upsert({
		where: { key: REVIEW_RECENT_APPOINTMENTS_KEY },
		create: { key: REVIEW_RECENT_APPOINTMENTS_KEY, value: JSON.stringify(snapshot) },
		update: { value: JSON.stringify(snapshot) },
	})

	// Emit the funnel-top event for completed appointments. insertId dedupes in
	// PostHog so re-running the job never double-counts.
	let eligibleEmitted = 0
	if (!emitEvents) return { cached: recent.length, eligibleEmitted }
	for (const appt of recent) {
		const started = new Date(appt.startAt).getTime()
		const isDone = COMPLETED_STATES.has((appt.state ?? '').toUpperCase()) || started <= now.getTime()
		if (!isDone) continue
		const profile = getServiceProfile(appt.serviceName)
		await captureServerPostHogEvent({
			distinctId: reviewDistinctId(appt.id, appt.staffId),
			event: REVIEW_EVENTS.eligible,
			insertId: `review-eligible:${appt.id}`,
			timestamp: appt.startAt,
			properties: {
				appointment_id: appt.id,
				provider_id: appt.staffId,
				provider_name: appt.staffName,
				service_name: appt.serviceName,
				service_category: profile.category,
				location_id: appt.locationId,
				location_name: appt.locationName,
			},
		})
		eligibleEmitted++
	}

	return { cached: recent.length, eligibleEmitted }
}
