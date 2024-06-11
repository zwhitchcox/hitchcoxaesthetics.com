import { json } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'

import { prisma } from '#app/utils/db.server.js'
import { SEOHandle } from '@nasa-gcn/remix-seo'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader() {
	const categories = await prisma.clientHistoryForm.findMany({
		orderBy: {
			order: 'asc',
		},
	})
	return json(categories)
}

export default function () {
	const data = useLoaderData<typeof loader>()
	return (
		<div className="mx-auto grid w-full max-w-3xl grid-cols-12 gap-4">
			<div className="col-span-3 flex flex-col">
				{data.map(category => (
					<Link key={category.id} to={`/admin/client-history/${category.slug}`}>
						{category.name}
					</Link>
				))}
			</div>
			<div className="col-span-9">
				<Outlet />
			</div>
		</div>
	)
}
