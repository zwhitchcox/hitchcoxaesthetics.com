import { json, type MetaFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'

import { prisma } from '#app/utils/db.server.js'

export const meta: MetaFunction = () => [
	{ title: 'Sarah Hitchcox Aesthetics - Services' },
]

export async function loader() {
	const services = await prisma.service.findMany({})
	return json({ services })
}

export default function Index() {
	const { services: _services } = useLoaderData<typeof loader>()
	return (
		<div className="fixed left-0 hidden h-full max-h-[100vh] w-14 flex-col overflow-y-auto overflow-x-hidden border-r border-muted bg-muted md:sticky md:flex lg:w-56 lg:px-3">
			aside
		</div>
	)
}
