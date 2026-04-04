import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'

import { LandingPageFrame } from '#app/components/landing-page-frame.tsx'
import { loadStaticLandingPage } from '#app/utils/landing-pages.server.ts'

const LANDING_PAGE_TITLE = 'Tirzepatide Landing Page'

export async function loader() {
	const html = await loadStaticLandingPage({
		relativeHtmlPath:
			'Semaglutide Weight Loss/Weight-Loss-Tirzepatide/index.html',
		serviceSlug: 'tirzepatide',
	})

	return json({ html })
}

export default function LandingPage() {
	const { html } = useLoaderData<typeof loader>()
	return <LandingPageFrame html={html} title={LANDING_PAGE_TITLE} />
}
