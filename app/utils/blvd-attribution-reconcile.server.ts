/**
 * Self-healing attribution: the booking page persists its attribution touch
 * with one fire-and-forget browser POST, and when that single request dies
 * (tab closed, network blip) the booking shows up as "Online (unattributed)"
 * even though PostHog captured the full booking_completed event. This
 * reconciler finds client-booked Boulevard appointments with no touch, pulls
 * the matching booking_completed event from PostHog, and records the touch
 * from it — same code path as the live POST, so reports relabel automatically.
 *
 * Match rule: the appointment's Boulevard client phone equals the event's
 * phone identity AND the event fired within 30 minutes of the appointment
 * being created (or the event's booked appointment start equals the
 * appointment's start). Runs inside the Boulevard revenue sync job.
 */
import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import {
	recordBoulevardBookingAttributionTouch,
	type BoulevardBookingAttributionInput,
} from '#app/utils/blvd-attribution.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getBlvdAppointmentsCreatedInRange } from '#app/utils/revenue-by-source.server.ts'

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const CREATED_MATCH_MS = 30 * 60 * 1000

export type PostHogBookingEvent = {
	timestamp: string
	distinctId: string
	properties: Record<string, unknown>
}

function normalizePhone(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const digits = value.replace(/\D/g, '')
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	return digits ? `+${digits}` : null
}

async function fetchPostHogBookingEvents(
	since: Date,
): Promise<PostHogBookingEvent[]> {
	const key = process.env.POSTHOG_PERSONAL_API_KEY?.trim()
	const project = process.env.POSTHOG_PROJECT_ID?.trim()
	if (!key || !project) return []
	const query = `SELECT timestamp, distinct_id, properties FROM events
		WHERE event = 'booking_completed' AND timestamp >= toDateTime('${since.toISOString().slice(0, 19).replace('T', ' ')}')
		ORDER BY timestamp DESC LIMIT 500`
	const res = await fetch(`https://us.posthog.com/api/projects/${project}/query/`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
	})
	if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`)
	const json = (await res.json()) as { results?: Array<[string, string, string]> }
	return (json.results ?? []).map(([timestamp, distinctId, properties]) => ({
		timestamp,
		distinctId,
		properties: JSON.parse(properties) as Record<string, unknown>,
	}))
}

async function fetchClientContacts(clientIds: string[]) {
	const contacts = new Map<
		string,
		{ phone: string | null; firstName: string | null; lastName: string | null }
	>()
	for (const id of clientIds) {
		try {
			const data = await boulevardAdminFetch<{
				client?: {
					mobilePhone?: string | null
					firstName?: string | null
					lastName?: string | null
				} | null
			}>(
				`query ReconcileClient($id: ID!) { client(id: $id) { mobilePhone firstName lastName } }`,
				{ id },
			)
			contacts.set(id, {
				phone: normalizePhone(data.client?.mobilePhone),
				firstName: data.client?.firstName ?? null,
				lastName: data.client?.lastName ?? null,
			})
		} catch {
			contacts.set(id, { phone: null, firstName: null, lastName: null })
		}
	}
	return contacts
}

/** Attribution properties are all optional strings — drop everything else. */
function stringProps(props: Record<string, unknown>) {
	const out: Record<string, string> = {}
	for (const [k, v] of Object.entries(props)) {
		if (typeof v === 'string' && v.trim()) out[k] = v
	}
	return out
}

export async function reconcileMissingAttributionFromPostHog({
	now = new Date(),
	fetchEvents = fetchPostHogBookingEvents,
	db = prisma,
}: {
	now?: Date
	fetchEvents?: (since: Date) => Promise<PostHogBookingEvent[]>
	db?: typeof prisma
} = {}): Promise<{ candidates: number; reconciled: number }> {
	const since = new Date(now.getTime() - LOOKBACK_MS)
	const created = await getBlvdAppointmentsCreatedInRange(since, now)
	const clientBooked = created.filter(a => a.bookedByType === 'CLIENT')
	if (clientBooked.length === 0) return { candidates: 0, reconciled: 0 }

	const linked = await db.blvdAttributedAppointment.findMany({
		where: { boulevardAppointmentId: { in: clientBooked.map(a => a.id) } },
		select: { boulevardAppointmentId: true },
	})
	const linkedIds = new Set(linked.map(l => l.boulevardAppointmentId))
	const candidates = clientBooked.filter(a => !linkedIds.has(a.id) && a.clientId)
	if (candidates.length === 0) return { candidates: 0, reconciled: 0 }

	const [events, contacts] = await Promise.all([
		fetchEvents(since),
		fetchClientContacts([...new Set(candidates.map(a => a.clientId!))]),
	])
	if (events.length === 0) return { candidates: candidates.length, reconciled: 0 }

	let reconciled = 0
	for (const appt of candidates) {
		const contact = contacts.get(appt.clientId!)
		const createdMs = appt.createdAt?.getTime()
		if (!createdMs) continue

		const match = events.find(e => {
			const eventMs = new Date(e.timestamp).getTime()
			if (!Number.isFinite(eventMs)) return false
			const phoneMatches =
				contact?.phone &&
				normalizePhone(
					String(e.properties.posthog_distinct_id ?? e.distinctId).replace(/^phone:/, ''),
				) === contact.phone
			const startMatches =
				typeof e.properties.booking_appointment_start === 'string' &&
				Math.abs(
					new Date(e.properties.booking_appointment_start).getTime() -
						appt.startAt.getTime(),
				) < 60 * 1000
			const timeClose = Math.abs(eventMs - createdMs) < CREATED_MATCH_MS
			return timeClose && (phoneMatches || startMatches)
		})
		if (!match) continue

		const p = match.properties
		const input: BoulevardBookingAttributionInput = {
			client: {
				boulevardClientId: appt.clientId!,
				...(contact?.phone ? { phone: contact.phone } : {}),
				...(contact?.firstName ? { firstName: contact.firstName } : {}),
				...(contact?.lastName ? { lastName: contact.lastName } : {}),
			},
			appointments: [
				{
					appointmentId: appt.id,
					clientId: appt.clientId!,
					startTime: appt.startAt.toISOString(),
				},
			],
			booking: {
				occurredAt: new Date(match.timestamp).toISOString(),
				locationName:
					(typeof p.booking_location_name === 'string' ? p.booking_location_name : null) ??
					appt.locationName ??
					undefined,
				serviceName:
					(typeof p.service === 'string' ? p.service : null) ??
					(typeof p.booking_service_display_name === 'string'
						? p.booking_service_display_name
						: undefined),
				serviceCategory:
					typeof p.booking_service_category === 'string'
						? p.booking_service_category
						: undefined,
				valueUsd: typeof p.value === 'number' ? p.value : undefined,
				hasVerifiedClient:
					typeof p.booking_has_verified_client === 'boolean'
						? p.booking_has_verified_client
						: undefined,
			},
			attribution: stringProps(p),
		}
		try {
			await recordBoulevardBookingAttributionTouch(input, db)
			reconciled++
			console.log(
				`[attribution-reconcile] healed ${appt.id} from PostHog (${String(p.traffic_channel ?? 'unknown channel')})`,
			)
		} catch (error) {
			console.error('[attribution-reconcile] failed for', appt.id, error)
		}
	}
	if (reconciled > 0)
		console.log(
			`[attribution-reconcile] ${reconciled}/${candidates.length} unattributed bookings healed`,
		)
	return { candidates: candidates.length, reconciled }
}
