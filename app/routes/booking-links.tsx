/**
 * Hidden, unlisted reference page for the ads contractor: every canonical
 * /book?service=<slug> deep-link, generated live from the Boulevard catalog
 * so it can never drift from what the booking wizard accepts. Not indexed
 * (robots noindex + excluded from the sitemap) and linked from nowhere -
 * share the URL directly.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, type MetaFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { listBookingSlugGroups } from '#app/utils/booking-service-slugs.server.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: MetaFunction = () => [
	{ title: 'Booking deep-links' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

export async function loader() {
	const groups = await listBookingSlugGroups()
	return json(
		{ groups },
		{ headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
	)
}

export default function BookingLinks() {
	const { groups } = useLoaderData<typeof loader>()
	return (
		<main className="mx-auto max-w-3xl px-5 py-10">
			<h1 className="text-2xl font-semibold">Booking deep-links</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Point each ad at its service. The link pre-selects the service and skips
				the service list; the "have you been here before?" question still runs
				and picks the New/Existing version automatically. A bad or missing slug
				just shows the normal booking page. Add{' '}
				<code className="rounded bg-muted px-1">&amp;location=bearden</code> or{' '}
				<code className="rounded bg-muted px-1">&amp;location=farragut</code> to
				bias the office. This list is generated live from the service catalog.
			</p>
			<ul className="mt-8 space-y-5">
				{groups.map(g => (
					<li key={g.slug} className="rounded-lg border p-4">
						<code className="block break-all text-sm font-medium">{g.url}</code>
						<p className="mt-1 text-sm text-muted-foreground">
							{g.hasVariants
								? `Books: ${g.serviceNames.join(' or ')} (picked by the new/returning answer)`
								: `Books: ${g.serviceNames.join(' | ')}`}
						</p>
					</li>
				))}
			</ul>
			<p className="mt-8 text-xs text-muted-foreground">
				{groups.length} links · not indexed · questions → Zane
			</p>
		</main>
	)
}
