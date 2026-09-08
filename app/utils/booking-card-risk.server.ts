/**
 * Decides whether the /book flow must collect a card before checkout
 * (Zane, 2026-09-08): every new client, and every client who has cancelled
 * or no-showed before, needs a card on file to hold the appointment.
 * Clients who already have a card on file with Boulevard are never asked
 * again. Flake history comes from the BlvdAppointment mirror; when the
 * mirror is empty (right after a rebuild) the rule fails open so nobody
 * gets blocked on missing data.
 */
import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'

export const FLAKE_CANCELLATION_REASONS = [
	'CLIENT_CANCEL',
	'CLIENT_LATE_CANCEL',
	'NO_SHOW',
]

export type BookingCardRiskReason = 'new-client' | 'prior-cancel' | null

export type BookingCardRisk = {
	hasCardOnFile: boolean
	reason: BookingCardRiskReason
	requireCard: boolean
}

export function decideCardRequirement({
	clientFound,
	completedAppointments,
	hasCardOnFile,
	mirrorHasData,
	priorFlakes,
}: {
	clientFound: boolean
	completedAppointments: number
	hasCardOnFile: boolean
	mirrorHasData: boolean
	priorFlakes: number
}): BookingCardRisk {
	if (!clientFound) {
		return { hasCardOnFile: false, reason: 'new-client', requireCard: true }
	}
	if (mirrorHasData && priorFlakes > 0) {
		return { hasCardOnFile, reason: 'prior-cancel', requireCard: true }
	}
	if (mirrorHasData && completedAppointments === 0) {
		// A profile exists (created by staff, or from an earlier cancelled
		// booking) but the client has never completed a visit: still new.
		return { hasCardOnFile, reason: 'new-client', requireCard: true }
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
			completedAppointments: 0,
			hasCardOnFile: false,
			mirrorHasData: false,
			priorFlakes: 0,
		})
	}

	const clientWhere = {
		OR: [{ clientId: client.id }, { clientMobilePhone: phone }],
	}
	const now = new Date()
	const [mirrorRows, priorFlakes, completedAppointments] = await Promise.all([
		prisma.blvdAppointment.count({ take: 1 }),
		prisma.blvdAppointment.count({
			where: {
				...clientWhere,
				cancellationReason: { in: FLAKE_CANCELLATION_REASONS },
			},
		}),
		prisma.blvdAppointment.count({
			where: { ...clientWhere, cancelled: false, startAt: { lt: now } },
		}),
	])

	return decideCardRequirement({
		clientFound: true,
		completedAppointments,
		hasCardOnFile: Boolean(client.hasCardOnFile),
		mirrorHasData: mirrorRows > 0,
		priorFlakes,
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
