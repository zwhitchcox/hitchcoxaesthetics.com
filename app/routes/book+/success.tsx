import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'

import { Button } from '#app/components/ui/button'
import { Card } from '#app/components/ui/card'
import { AppointmentDetails } from '#app/routes/users+/$id_+/appointments/AppointmentDetails.js'
import { prisma } from '#app/utils/db.server'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const searchParams = url.searchParams
	const appointmentId = searchParams.get('appointment')
	if (!appointmentId) {
		return { appointment: null }
	}
	const appointment = await prisma.appointment.findUnique({
		where: {
			id: appointmentId,
		},
		include: {
			service: true,
		},
	})
	return json({ appointment })
}

export default function SuccessComponent() {
	const { appointment } = useLoaderData<typeof loader>()

	return (
		<div className="flex min-h-full w-full flex-col items-center justify-center">
			<Card className="mx-auto flex max-w-xl flex-col items-center space-y-4 px-12 py-8">
				<div className="flex flex-col space-y-1 text-center">
					<h2 className="text-2xl font-bold">Success! 🎉</h2>
					<p>Your appointment is confirmed.</p>
				</div>
				{appointment && (
					<AppointmentDetails
						service={appointment.service}
						date={new Date(appointment.windowStart)}
						direction="row"
					/>
				)}
				<div className="mt-6">
					<Link to="/account/appointments" prefetch="intent">
						<Button variant="secondary">View My Appointments</Button>
					</Link>
				</div>
			</Card>
		</div>
	)
}
