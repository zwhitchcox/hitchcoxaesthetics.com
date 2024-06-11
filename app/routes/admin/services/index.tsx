import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json } from '@remix-run/node'
import { Link, Outlet, useLoaderData, useMatches } from '@remix-run/react'

import { Icon } from '#app/components/ui/icon.js'
import { prisma } from '#app/utils/db.server.js'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader() {
	const services = await prisma.service.findMany({})
	return json({ services })
}

export default function ServicesIndex() {
	const { services } = useLoaderData<typeof loader>()
	const matches = useMatches()
	const isServiceSelected = matches.some(
		match => match.pathname.endsWith('/new') || match.params.serviceId,
	)

	return (
		<div className="flex w-full flex-col items-center">
			<h1 className="my-4 text-3xl font-bold">Services</h1>
			<div className="flex w-full max-w-4xl">
				<div className={`px-4 py-5 ${isServiceSelected ? 'w-1/2' : 'w-full'}`}>
					<ul className="space-y-2">
						{services.map(service => (
							<li key={service.id}>
								<Link to={`/admin/services/${service.id}`}>
									{service.title}
								</Link>
							</li>
						))}
						<li>
							<Link
								to="/admin/services/new"
								className="flex items-center gap-1"
							>
								<Icon name="plus" className="size-4" /> <div>Create New</div>
							</Link>
						</li>
					</ul>
				</div>
				{isServiceSelected && (
					<div className="w-1/2 px-4 py-5">
						<Outlet />
					</div>
				)}
			</div>
		</div>
	)
}
