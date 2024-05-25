import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'

import { Card } from '#app/components/ui/card'
import { requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { AppointmentStatus, UserType } from '#app/utils/types'
import AppointmentEdit from './AppointmentEdit'

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const appointmentId = formData.get('appointmentId')
	invariant(typeof appointmentId === 'string', 'No appointmentId provided')
	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId },
	})
	invariant(appointment, 'Appointment not found')
	if (appointment.clientId !== userId) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
		})
		if (user?.type !== UserType.Provider) {
			return json(
				{ message: 'You do not have permission to cancel this appointment' },
				{ status: 403 },
			)
		}
	}
	await prisma.appointment.update({
		where: { id: appointmentId },
		data: {
			status: AppointmentStatus.Cancelled,
		},
	})
	return json({ success: true })
}

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			clientAppointments: {
				orderBy: {
					windowStart: 'desc',
				},
				include: {
					service: true,
				},
			},
		},
	})
	return json({ user })
}

export default function Appointments() {
	const { user } = useLoaderData<typeof loader>()
	return (
		<div className="mx-auto mb-8 flex h-full w-full flex-col items-center  space-y-4">
			<div className="grid gap-2 md:grid-cols-2">
				{user!.clientAppointments.map(appointment => (
					<Card className="py-4" key={appointment.id}>
						<AppointmentEdit appointment={appointment} key={appointment.id} />
					</Card>
				))}
			</div>
		</div>
	)
}
