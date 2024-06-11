import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'

import { useBookData } from '#/app/routes/book+/_steps+/_layout'
import { bookStepper } from '#/app/routes/book+/book.server'
import { ErrorList } from '#app/components/forms.js'
import { Label } from '#app/components/ui/label'
import { SEOHandle } from '@nasa-gcn/remix-seo'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function action({ request }: ActionFunctionArgs) {
	return bookStepper.action('provider')({ request })
}

export async function loader({ request }: LoaderFunctionArgs) {
	return bookStepper.loader('service')({ request })
}

export default function ProviderStep() {
	const { providers, providerId } = useBookData()
	const actionData = useActionData<typeof action>()

	return (
		<div className="flex w-full flex-col items-center">
			<h2 className="tracking-wides mb-2 text-center text-2xl font-semibold">
				Choose a Provider
			</h2>
			<Form
				className="flex w-full flex-col space-y-1 overflow-y-scroll lg:max-h-96"
				method="post"
			>
				{providers.map((provider, index) => (
					<Label
						key={index}
						className={`rad-label font-lg  flex w-full cursor-pointer flex-col rounded-md border border-gray-200 p-3 px-4 transition duration-300 hover:border-foreground ${provider.id === providerId ? 'border-2 border-muted-foreground' : ''}`}
					>
						<button
							className="text-md font-semibold tracking-widest transition duration-300"
							type="submit"
							name="providerId"
							value={provider.id}
						>
							{provider.name}
						</button>
					</Label>
				))}
				<ErrorList errors={actionData?.result?.error?.providerId} />
			</Form>
		</div>
	)
}
