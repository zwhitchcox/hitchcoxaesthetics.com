import { invariant } from '@epic-web/invariant'

import { prisma } from '#/app/utils/db.server'
import { AppointmentStatus } from './types'

export async function createAppointment({
	windowStart,
	serviceId,
	clientId,
	providerId,
}: {
	windowStart: Date
	serviceId: string
	clientId: string
	providerId: string
}) {
	const service = await prisma.service.findUnique({
		where: {
			id: serviceId,
		},
	})
	const provider = await prisma.user.findUnique({
		where: { id: providerId },
	})
	invariant(provider, 'Provider not found')
	invariant(service, 'Service not found')
	const windowEnd = new Date(
		windowStart.getTime() + service.duration * 60 * 1000,
	)
	const overlappingAppointments = await prisma.appointment.findMany({
		where: {
			providerId: providerId,
			status: {
				not: AppointmentStatus.Cancelled,
			},
			windowStart: {
				lt: windowEnd,
			},
			windowEnd: {
				gt: windowStart,
			},
		},
	})

	invariant(
		overlappingAppointments.length === 0,
		'Overlapping appointments found',
	)

	return await prisma.appointment.create({
		data: {
			windowStart,
			windowEnd,
			service: {
				connect: { id: serviceId },
			},
			client: {
				connect: { id: clientId },
			},
			provider: {
				connect: { id: providerId },
			},
		},
	})
}
