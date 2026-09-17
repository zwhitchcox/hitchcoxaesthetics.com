import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRole } from '#app/utils/permissions.server'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/** The old address of the Outreach page. Old links and bookmarks go there. */
export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const { search } = new URL(request.url)
	return redirect(`/admin/outreach${search}`, 301)
}
