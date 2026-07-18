/**
 * Per-appointment expected vs actual revenue. Expected values each booked
 * service the same way the projections do: the booked price when Boulevard
 * has one, otherwise the service's average paid ticket over the last 90 days.
 * Actual is the closed-order revenue linked to the appointment. The delta and
 * a plain-English reason make underperformers self-explanatory.
 */
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'

const EXCLUDED_CLIENT_NAMES = new Set(['zane hitchcox'])

export type AppointmentPerformanceRow = {
	appointmentId: string
	startAt: string
	locationName: string
	clientName: string
	manageUrl: string | null
	services: string[]
	status: 'completed' | 'cancelled' | 'no_show' | 'upcoming'
	expectedUsd: number
	actualUsd: number
	deltaUsd: number
	reason: string
}

type ApptNode = {
	id?: string | null
	startAt?: string | null
	state?: string | null
	cancelled?: boolean | null
	cancellation?: { reason?: string | null } | null
	manageUrl?: string | null
	client?: { name?: string | null } | null
	appointmentServices?: Array<{
		price?: number | null
		service?: { name?: string | null } | null
	}> | null
}

async function avgPaidTicketByName(names: string[]) {
	if (names.length === 0) return new Map<string, number>()
	const items = await prisma.blvdRevenueItem.groupBy({
		by: ['itemName'],
		where: {
			itemName: { in: names },
			grossAmountUsd: { gt: 0 },
			occurredAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
		},
		_avg: { grossAmountUsd: true },
	})
	return new Map(items.map(i => [i.itemName, i._avg.grossAmountUsd ?? 0]))
}

export async function loadAppointmentPerformance(
	since: Date,
	until: Date,
	now = new Date(),
): Promise<AppointmentPerformanceRow[]> {
	const locations = await listBlvdAdminLocations()
	const appointments: Array<ApptNode & { locationName: string }> = []
	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < 30; page++) {
			const res: any = await boulevardAdminFetch(
				`query PerfAppointments($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId,
						query: "startAt >= '${since.toISOString()}' AND startAt <= '${until.toISOString()}'") {
						pageInfo { endCursor hasNextPage }
						edges { node {
							id startAt state cancelled manageUrl
							cancellation { reason }
							client { name }
							appointmentServices { price service { name } }
						} }
					}
				}`,
				{ after, locationId: location.id },
			)
			for (const edge of res.appointments?.edges ?? []) {
				if (edge?.node?.id)
					appointments.push({
						...edge.node,
						locationName: location.name ?? location.id,
					})
			}
			if (!res.appointments?.pageInfo?.hasNextPage) break
			after = res.appointments.pageInfo.endCursor
		}
	}

	const kept = appointments.filter(
		a =>
			!EXCLUDED_CLIENT_NAMES.has((a.client?.name ?? '').trim().toLowerCase()),
	)

	const serviceNames = [
		...new Set(
			kept.flatMap(a =>
				(a.appointmentServices ?? [])
					.map(s => s.service?.name)
					.filter((n): n is string => Boolean(n)),
			),
		),
	]
	const [avgByName, revenueItems] = await Promise.all([
		avgPaidTicketByName(serviceNames),
		prisma.blvdRevenueItem.findMany({
			where: { boulevardAppointmentId: { in: kept.map(a => a.id!) } },
			select: { boulevardAppointmentId: true, grossAmountUsd: true },
		}),
	])
	const actualByAppt = new Map<string, number>()
	for (const item of revenueItems) {
		if (!item.boulevardAppointmentId) continue
		actualByAppt.set(
			item.boulevardAppointmentId,
			(actualByAppt.get(item.boulevardAppointmentId) ?? 0) + item.grossAmountUsd,
		)
	}

	const rows = kept.map((a): AppointmentPerformanceRow => {
		const services = (a.appointmentServices ?? [])
			.map(s => s.service?.name)
			.filter((n): n is string => Boolean(n))
		const expectedUsd = Math.round(
			(a.appointmentServices ?? []).reduce((sum, s) => {
				const booked = (s.price ?? 0) / 100
				const name = s.service?.name ?? ''
				return sum + (booked > 0 ? booked : (avgByName.get(name) ?? 0))
			}, 0),
		)
		const actualUsd = Math.round(actualByAppt.get(a.id!) ?? 0)
		const startAt = a.startAt ?? ''
		const isNoShow =
			a.state === 'NO_SHOW' || a.cancellation?.reason === 'NO_SHOW'
		const status: AppointmentPerformanceRow['status'] = a.cancelled
			? 'cancelled'
			: isNoShow
				? 'no_show'
				: new Date(startAt) > now
					? 'upcoming'
					: 'completed'
		const deltaUsd =
			status === 'cancelled' || status === 'no_show'
				? -expectedUsd
				: actualUsd - expectedUsd
		const reason =
			status === 'cancelled'
				? 'cancelled'
				: status === 'no_show'
					? 'no-show'
					: status === 'upcoming'
						? 'not happened yet'
						: actualUsd === 0
							? 'completed but $0 collected (membership, package, or unlinked order)'
							: deltaUsd <= -100
								? 'lighter ticket than the service average'
								: deltaUsd >= 100
									? 'above average'
									: 'on target'
		return {
			appointmentId: a.id!,
			startAt,
			locationName: a.locationName,
			clientName: a.client?.name ?? '—',
			manageUrl: a.manageUrl ?? null,
			services,
			status,
			expectedUsd,
			actualUsd,
			deltaUsd,
			reason,
		}
	})

	return rows.sort((x, y) => x.deltaUsd - y.deltaUsd)
}
