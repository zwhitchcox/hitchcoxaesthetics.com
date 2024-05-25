import { type LoaderFunctionArgs } from '@remix-run/node'

import { Button } from '#app/components/ui/button.js'
import { requestUser } from '#app/utils/auth.server.js'
import { checkFormRedirect, getForms } from '#app/utils/client.server.js'
import { redirectWithToast } from '#app/utils/toast.server.js'
import { bookStepper } from '../book.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const data = await bookStepper.loader('confirm')({ request })

	const url = new URL(request.url)
	const user = await requestUser(request)
	if (!user) {
		return redirectWithToast(`/auth?redirectTo=${url.pathname + url.search}`, {
			title: 'Can I get a name for the order?',
			description:
				"You'll need to sign in or create an account to complete your booking.",
		})
	}
	const forms = await getForms(user.id)
	await checkFormRedirect(forms, {
		title: 'We need a few more details',
		description: 'Please complete your profile to continue booking.',
	})
	return data
}

// export async function action({ request }: { request: Request }) {
// 	const userId = await requireUserId(request)
// 	const user = await requireFullUser(request)
// 	const formData = await request.formData()

// 	const dob = user.dob
// 	const age = getAge(new Date(dob!))
// 	const service = await prisma.service.findUnique({
// 		where: { id: serviceId },
// 	})
// 	if (age < 18) {
// 		return {
// 			error: 'All clients must be 18 years or older.',
// 		}
// 	}
// 	if (service?.slug.includes('filler') && age < 21) {
// 		return {
// 			error: 'Clients under 21 cannot book filler services',
// 		}
// 	}

// 	let appointment
// 	if (appointmentId) {
// 		invariant(typeof appointmentId === 'string', 'Invalid appointment ID')
// 		appointment = await prisma.appointment.findUnique({
// 			where: { id: appointmentId },
// 		})
// 		if (appointment?.clientId !== user.id && user.type !== UserType.Provider) {
// 			throw new Error('You do not have permission to update this appointment')
// 		}
// 		appointment = await prisma.appointment.update({
// 			where: { id: appointmentId },
// 			data: {
// 				serviceId,
// 				windowStart: new Date(date),
// 				providerId,
// 				status: AppointmentStatus.Active,
// 			},
// 		})
// 	} else {
// 		appointment = await createAppointment({
// 			serviceId,
// 			windowStart: new Date(date),
// 			clientId: user.id,
// 			providerId,
// 		})
// 	}

// 	if (user.type === UserType.Provider) {
// 		return redirect('/schedule')
// 	}n
// 	const { categories, missingCategories } = await promiseHash({
// 		categories: getCategories(),
// 		missingCategories: getMissingCategories(userId),
// 	})
// 	const nextSection = getNextSection(user, categories, missingCategories)

// 	return redirectWithToast(
// 		nextSection?.to ?? '/book/success?appointment=' + appointment.id,
// 		{
// 			title: 'Success!',
// 			type: 'success',
// 			description: 'Your appointment has been booked.',
// 		},
// 	)
// }

export default function Confirm() {
	return (
		<div className="flex h-full w-64 flex-col items-center justify-center p-4 transition duration-300">
			<Button variant="secondary" className="w-full text-xl">
				Confirm
			</Button>
		</div>
	)
}
