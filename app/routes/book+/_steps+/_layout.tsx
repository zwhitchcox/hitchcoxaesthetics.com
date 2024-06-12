import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { type Prisma } from '@prisma/client'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Outlet, redirect, useLocation } from '@remix-run/react'
import { useEffect } from 'react'

import { StepTracker } from '#/app/routes/book+/_steps+/__step-tracker'
import { bookStepper } from '#/app/routes/book+/book.server'
import { Card } from '#app/components/ui/card.js'
import { AppointmentDetails } from '#app/routes/users+/$id_+/appointments/AppointmentDetails'
import { requireFullUser } from '#app/utils/auth.server'
import { resetSessionData } from '#app/utils/cookie.server'
import { prisma } from '#app/utils/db.server'
import { useMatchesData } from '#app/utils/misc'
import { getServices } from '#app/utils/service.server'
import { redirectWithToast } from '#app/utils/toast.server'
import { UserType } from '#app/utils/types'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	const services = await getServices()
	const providers = await prisma.user.findMany({
		where: {
			type: UserType.Provider,
			active: true,
		},
	})
	const url = new URL(request.url)
	const searchParams = url.searchParams
	const { sessionStorage, firstStep } = bookStepper
	const bookCookie = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const bookCookieAppointmentId = bookCookie.get('appointmentId')

	let appointment: null | Prisma.AppointmentGetPayload<{
		include: { service: true }
	}> = null
	const appointmentId = searchParams.get('appointment')
	if (appointmentId) {
		const user = await requireFullUser(request)
		appointment = await prisma.appointment.findUnique({
			where: {
				id: appointmentId,
			},
			include: {
				service: true,
			},
		})
		if (bookCookieAppointmentId !== appointmentId) {
			bookCookie.set('appointmentId', appointmentId)
			bookCookie.set('serviceId', appointment!.serviceId)
			bookCookie.set('date', appointment!.windowStart.toISOString())
			bookCookie.set('providerId', appointment!.providerId)
		}
		if (user.type !== UserType.Provider && appointment?.clientId !== user.id) {
			return redirectWithToast(
				`/book/${firstStep}`,
				{ title: 'Not Found', description: 'Appointment not found' },
				{
					headers: {
						'Set-Cookie':
							await bookStepper.sessionStorage.destroySession(bookCookie),
					},
				},
			)
		}
	} else if (bookCookieAppointmentId) {
		resetSessionData(bookCookie)
	}

	if (url.pathname === '/book') {
		return redirect(
			`/book/${appointmentId ? bookStepper.firstStep : await bookStepper.getLatestStep(request)}` +
				url.search,
			{
				headers: {
					'Set-Cookie':
						await bookStepper.sessionStorage.commitSession(bookCookie),
				},
			},
		)
	}

	return json(
		{
			services,
			appointment,
			providers,
			...bookCookie.data,
		},
		{
			headers: {
				'Set-Cookie':
					await bookStepper.sessionStorage.commitSession(bookCookie),
			},
		},
	)
}

export default function Book() {
	const { pathname } = useLocation()
	const data = useBookData()

	useEffect(() => {
		document.querySelector('h1')?.scrollIntoView({ behavior: 'smooth' })
	}, [pathname])
	const date = data.date ? new Date(data.date) : undefined

	return (
		<div
			className={`mx-auto my-4 flex min-h-full w-fit flex-col items-center justify-center space-y-4 px-2 transition-all duration-300`}
		>
			<h1 className="text-center font-semibold tracking-widest">
				Book an Appointment
			</h1>
			<StepTracker />
			<Card className="flex w-fit flex-col items-center p-4 pb-6 transition-all duration-300 lg:flex-row lg:space-x-8">
				<div className="w-64 flex-shrink-0">
					<AppointmentDetails
						service={data.services.find(({ id }) => id === data.serviceId)}
						provider={data.providers.find(({ id }) => id === data.providerId)}
						date={date}
						direction="column"
					/>
				</div>
				<Outlet />
			</Card>
		</div>
	)
}

export function useBookData() {
	return useMatchesData<typeof loader>('routes/book+/_steps+/_layout')
}
