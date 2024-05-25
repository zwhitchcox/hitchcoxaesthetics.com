import { type Prisma, type User } from '@prisma/client'
import { type SerializeFrom } from '@remix-run/node'
import { Link, useFetcher, useSubmit } from '@remix-run/react'
import { useEffect } from 'react'

import { AppointmentDetails } from '#app/routes/users+/$id_+/appointments/AppointmentDetails.js'

export default function AppointmentEdit({
	appointment,
	onSubmit,
	client,
}: {
	appointment: SerializeFrom<
		Prisma.AppointmentGetPayload<{ include: { service: true } }>
	>
	client?: SerializeFrom<User>
	onSubmit?: () => void
}) {
	const cancelFetcher = useFetcher()
	useEffect(() => {
		if (cancelFetcher.state !== 'idle') {
			onSubmit?.()
		}
	}, [cancelFetcher, onSubmit])
	const submit = useSubmit()
	return (
		<div
			className={`w-full ${
				appointment.status === 'Cancelled' ||
				cancelFetcher.formData?.get('appointmentId') === appointment.id
					? 'line-through opacity-50'
					: ''
			}`}
		>
			<AppointmentDetails
				key={appointment.id}
				service={appointment.service}
				date={new Date(appointment.windowStart)}
				direction="row"
				client={client}
			/>
			<div className="mt-2 flex w-full justify-center space-x-4 text-lg">
				<Link to={`/book?appointment=${appointment.id}`} className="underline">
					Edit
				</Link>
				<cancelFetcher.Form
					method="post"
					action="/account/appointments"
					onSubmit={e => {
						e.preventDefault()
						if (
							!window.confirm(
								'Are you sure you want to cancel this appointment?',
							)
						) {
							return
						}
						submit(e.currentTarget)
					}}
				>
					<input type="hidden" name="appointmentId" value={appointment.id} />
					<input type="hidden" name="intent" value="cancel" />
					<button
						className={`underline ${
							appointment.status === 'Cancelled' ||
							cancelFetcher.formData?.get('appointmentId') === appointment.id
								? 'line-through'
								: ''
						}`}
					>
						Cancel
					</button>
				</cancelFetcher.Form>
			</div>
		</div>
	)
}
