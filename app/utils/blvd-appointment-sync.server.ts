/**
 * Mirrors Boulevard appointments into the BlvdAppointment table so report
 * loaders read our own database instead of calling the Boulevard API per
 * request (Zane, 2026-08-03).
 *
 * Two modes, both driven by Temporal (app/temporal/) with a legacy
 * setInterval fallback:
 *   hot  - every few minutes: appointments STARTING soon (today−3d..+120d,
 *          covers the revenue chart's booked-by window) plus appointments
 *          CREATED in the last 3 days (covers the bookings funnel).
 *   full - daily: the entire history, so first-visit-per-client questions
 *          ("is this booking a new client?") have the complete record.
 */
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { normalizeBlvdEntityId } from '#app/utils/blvd-attribution.server.ts'
import { prisma } from '#app/utils/db.server.ts'

const HOT_START_BACK_DAYS = 3
const HOT_START_FORWARD_DAYS = 120
const HOT_CREATED_BACK_DAYS = 3
const FULL_PAGE_CAP = 500
const HOT_PAGE_CAP = 30

const APPOINTMENT_FIELDS = `id startAt createdAt state cancelled bookedByType manageUrl duration
	cancellation { reason notes cancelledAt }
	location { id name }
	client { id name mobilePhone appointmentCount createdAt }
	appointmentServices { price duration service { name } }`

type ApptNode = {
	id?: string | null
	startAt?: string | null
	createdAt?: string | null
	state?: string | null
	cancelled?: boolean | null
	bookedByType?: string | null
	manageUrl?: string | null
	duration?: number | null
	cancellation?: {
		reason?: string | null
		notes?: string | null
		cancelledAt?: string | null
	} | null
	location?: { id?: string | null; name?: string | null } | null
	client?: {
		id?: string | null
		name?: string | null
		mobilePhone?: string | null
		appointmentCount?: number | null
		createdAt?: string | null
	} | null
	appointmentServices?: Array<{
		price?: number | null
		duration?: number | null
		service?: { name?: string | null } | null
	}> | null
}

async function upsertPage(nodes: ApptNode[], fallbackLocation: { id: string; name?: string | null }) {
	let upserted = 0
	for (const node of nodes) {
		const id = normalizeBlvdEntityId('Appointment', node.id ?? null)
		if (!id || !node.startAt) continue
		const data = {
			locationId: node.location?.id ?? fallbackLocation.id,
			locationName: node.location?.name ?? fallbackLocation.name ?? null,
			startAt: new Date(node.startAt),
			createdAt: node.createdAt ? new Date(node.createdAt) : null,
			state: node.state ?? null,
			cancelled: Boolean(node.cancelled),
			cancellationReason: node.cancellation?.reason ?? null,
			cancellationNotes: node.cancellation?.notes ?? null,
			cancelledAt: node.cancellation?.cancelledAt
				? new Date(node.cancellation.cancelledAt)
				: null,
			bookedByType: node.bookedByType ?? null,
			manageUrl: node.manageUrl ?? null,
			durationMinutes: typeof node.duration === 'number' ? node.duration : null,
			clientId: node.client?.id ?? null,
			clientName: node.client?.name ?? null,
			clientMobilePhone: node.client?.mobilePhone ?? null,
			clientAppointmentCount:
				typeof node.client?.appointmentCount === 'number'
					? node.client.appointmentCount
					: null,
			clientCreatedAt: node.client?.createdAt
				? new Date(node.client.createdAt)
				: null,
			services: JSON.stringify(
				(node.appointmentServices ?? []).map(s => ({
					name: s.service?.name ?? 'Unknown service',
					price: s.price ?? null,
					minutes: typeof s.duration === 'number' ? s.duration : null,
				})),
			),
		}
		await prisma.blvdAppointment.upsert({
			where: { id },
			create: { id, ...data },
			update: data,
		})
		upserted++
	}
	return upserted
}

async function pullQuery(query: string | null, pageCap: number) {
	const locations = await listBlvdAdminLocations()
	let upserted = 0
	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < pageCap; page++) {
			const res: any = await boulevardAdminFetch(
				`query SyncAppointments($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId${
						query ? `, query: "${query}"` : ''
					}) {
						pageInfo { endCursor hasNextPage }
						edges { node { ${APPOINTMENT_FIELDS} } }
					}
				}`,
				{ after, locationId: location.id },
			)
			const nodes = (res.appointments?.edges ?? [])
				.map((e: any) => e?.node)
				.filter(Boolean) as ApptNode[]
			upserted += await upsertPage(nodes, {
				id: location.id,
				name: location.name,
			})
			if (!res.appointments?.pageInfo?.hasNextPage) break
			after = res.appointments.pageInfo.endCursor ?? null
		}
	}
	return upserted
}

const day = (offsetDays: number) =>
	new Date(Date.now() + offsetDays * 24 * 3600 * 1000).toISOString()

export async function syncBlvdAppointments(
	mode: 'hot' | 'full',
): Promise<{ mode: string; upserted: number }> {
	if (mode === 'full') {
		const upserted = await pullQuery(null, FULL_PAGE_CAP)
		return { mode, upserted }
	}
	const upcoming = await pullQuery(
		`startAt >= '${day(-HOT_START_BACK_DAYS)}' AND startAt <= '${day(HOT_START_FORWARD_DAYS)}'`,
		HOT_PAGE_CAP,
	)
	const created = await pullQuery(
		`createdAt >= '${day(-HOT_CREATED_BACK_DAYS)}'`,
		HOT_PAGE_CAP,
	)
	return { mode, upserted: upcoming + created }
}

/** True once at least one sync has landed; loaders fall back to live pulls
 * until then so a fresh deploy is never blank. */
export async function hasBlvdAppointmentMirror(): Promise<boolean> {
	return (
		(await prisma.blvdAppointment.findFirst({ select: { id: true } })) != null
	)
}
