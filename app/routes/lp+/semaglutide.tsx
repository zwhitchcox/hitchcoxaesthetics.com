import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'

import { LandingPageFrame } from '#app/components/landing-page-frame.tsx'
import { useBlvdHtml } from '#app/utils/blvd-context.tsx'
import { loadStaticLandingPage } from '#app/utils/landing-pages.server.ts'

const LANDING_PAGE_TITLE = 'Semaglutide Landing Page'

export async function loader() {
	const html = await loadStaticLandingPage({
		relativeHtmlPath:
			'Semaglutide Weight Loss/Weight-Loss-Semaglutide/index.html',
		serviceSlug: 'semaglutide',
	})

	return json({ html })
}

export default function LandingPage() {
	const { html } = useLoaderData<typeof loader>()
	const injectedHtml = useBlvdHtml(html)
	return <LandingPageFrame html={injectedHtml} title={LANDING_PAGE_TITLE} />
}
