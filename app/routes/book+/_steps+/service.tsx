import { type ActionFunctionArgs } from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import { z } from 'zod'

import { bookStepper } from '#/app/routes/book+/book.server'
import { GeneralErrorBoundary } from '#app/components/error-boundary.js'
import { ErrorList } from '#app/components/forms.js'
import { Label } from '#app/components/ui/label.js'
import { useBookData } from '#app/routes/book+/_steps+/_layout.js'
import { SEOHandle } from '@nasa-gcn/remix-seo'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const ServiceSchema = z.object({
	serviceId: z.string(),
})

export async function action({ request }: ActionFunctionArgs) {
	return bookStepper.action('service')({ request })
}
export async function loader({ request }: ActionFunctionArgs) {
	return bookStepper.loader('service')({ request })
}

export default function Service() {
	const { services, serviceId } = useBookData()
	const actionData = useActionData<typeof action>()
	return (
		<div className="flex w-full flex-col items-center">
			<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest">
				Service
			</h2>
			<Form
				className="flex w-full flex-col space-y-1 overflow-y-scroll lg:max-h-96"
				method="post"
			>
				{services.map((_service, index) => (
					<Label
						key={index}
						className={`rad-label font-lg flex  w-full cursor-pointer flex-col rounded-md border border-gray-200 p-3 px-4 transition duration-300 hover:border-foreground ${_service.id === serviceId ? 'border-2 border-muted-foreground' : ''}`}
					>
						<button
							className="text-md font-semibold tracking-widest transition duration-300"
							type="submit"
							name="serviceId"
							value={_service.id}
						>
							{_service.title}
						</button>
						<div className="text-md mt-1">{_service.hint}</div>
					</Label>
				))}
				<ErrorList errors={actionData?.result?.error?.serviceId} />
			</Form>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
