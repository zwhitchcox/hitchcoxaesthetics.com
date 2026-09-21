/**
 * Decides whether the /book flow must collect a card before checkout.
 *
 * The rule (Zane, 2026-09-21): a card is required only from a client who
 * has flaked late and has never paid us. Flaked late means a prior
 * appointment that the client cancelled inside 24 hours of its start, or
 * did not show up for (Boulevard marks a no-show as a cancellation after
 * the start time, so the same test covers it). Never paid means no revenue
 * item above $0 for that client.
 *
 * New clients are not asked. The first rule (2026-09-08) asked every new
 * client and every prior canceller; new-client completion on /book then
 * fell from 24.6% to 10.0% in two weeks while returning clients held.
 *
 * A client who already has a card on file with Boulevard is never asked
 * again. Both histories come from our own mirrors (BlvdAppointment,
 * BlvdRevenueItem); when either mirror is empty (right after a rebuild)
 * the rule fails open so nobody gets blocked on missing data.
 */
import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/** Cancellations the client caused. Staff cancels, mistakes, merges and voids do not count. */
export const FLAKE_CANCELLATION_REASONS = [
	'CLIENT_CANCEL',
	'CLIENT_LATE_CANCEL',
	'NO_SHOW',
]

/** A cancellation this close to the start, or after it, is a late flake. */
export const LATE_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000

export type BookingCardRiskReason = 'late-cancel-unpaid' | null

export type BookingCardRisk = {
	hasCardOnFile: boolean
	reason: BookingCardRiskReason
	requireCard: boolean
}

/** True when the client cancelled inside 24 hours of the start, or never showed. */
export function isLateFlake(appointment: {
	cancellationReason: string | null
	cancelledAt: Date | null
	startAt: Date
}): boolean {
	if (!appointment.cancellationReason) return false
	if (!FLAKE_CANCELLATION_REASONS.includes(appointment.cancellationReason)) {
		return false
	}
	// Boulevard's own late-cancel and no-show reasons are late by definition.
	if (appointment.cancellationReason !== 'CLIENT_CANCEL') return true
	if (!appointment.cancelledAt) return false
	return (
		appointment.startAt.getTime() - appointment.cancelledAt.getTime() <=
		LATE_CANCEL_WINDOW_MS
	)
}

export function decideCardRequirement({
	clientFound,
	hasCardOnFile,
	hasPriorRevenue,
	lateFlakes,
	mirrorHasData,
}: {
	clientFound: boolean
	hasCardOnFile: boolean
	hasPriorRevenue: boolean
	lateFlakes: number
	mirrorHasData: boolean
}): BookingCardRisk {
	if (!clientFound) {
		return { hasCardOnFile: false, reason: null, requireCard: false }
	}
	if (mirrorHasData && lateFlakes > 0 && !hasPriorRevenue) {
		return { hasCardOnFile, reason: 'late-cancel-unpaid', requireCard: true }
	}
	return { hasCardOnFile, reason: null, requireCard: false }
}

export async function getBookingCardRisk(
	phone: string,
): Promise<BookingCardRisk> {
	const client = await findAdminClientByExactPhone(phone)
	if (!client) {
		return decideCardRequirement({
			clientFound: false,
			hasCardOnFile: false,
			hasPriorRevenue: false,
			lateFlakes: 0,
			mirrorHasData: false,
		})
	}

	const [appointmentRows, revenueRows, flakes] = await Promise.all([
		prisma.blvdAppointment.count({ take: 1 }),
		prisma.blvdRevenueItem.count({ take: 1 }),
		// The client's own cancellations, by id or by the phone on the booking.
		prisma.blvdAppointment.findMany({
			where: {
				OR: [{ clientId: client.id }, { clientMobilePhone: phone }],
				cancellationReason: { in: FLAKE_CANCELLATION_REASONS },
			},
			select: {
				cancellationReason: true,
				cancelledAt: true,
				clientId: true,
				startAt: true,
			},
		}),
	])
	const lateFlakes = flakes.filter(isLateFlake).length
	// Revenue only matters once a late flake exists: skip the lookup otherwise.
	const clientIds = [
		...new Set([client.id, ...flakes.flatMap(f => (f.clientId ? [f.clientId] : []))]),
	]
	const paid =
		lateFlakes > 0
			? await prisma.blvdRevenueItem.findFirst({
					where: { boulevardClientId: { in: clientIds }, grossAmountUsd: { gt: 0 } },
					select: { id: true },
				})
			: null

	return decideCardRequirement({
		clientFound: true,
		hasCardOnFile: Boolean(client.hasCardOnFile),
		hasPriorRevenue: paid != null,
		lateFlakes,
		mirrorHasData: appointmentRows > 0 && revenueRows > 0,
	})
}

async function findAdminClientByExactPhone(phone: string) {
	if (!/^\+\d{10,15}$/.test(phone)) return null
	const response = await boulevardAdminFetch<{
		clients?: {
			edges?: Array<{
				node?: {
					active?: boolean | null
					hasCardOnFile?: boolean | null
					id?: string | null
				} | null
			}>
		}
	}>(
		// phone is regex-validated above, so inlining it cannot break the query
		`query ClientByPhone {
			clients(first: 10, query: "mobilePhone = '${phone}'") {
				edges { node { active hasCardOnFile id } }
			}
		}`,
	)
	const nodes =
		response.clients?.edges?.flatMap(edge => (edge.node ? [edge.node] : [])) ??
		[]
	const client = nodes.find(node => node.id && node.active !== false)
	return client?.id ? { hasCardOnFile: client.hasCardOnFile, id: client.id } : null
}
