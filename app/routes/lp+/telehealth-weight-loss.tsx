import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'

import { LandingPageFrame } from '#app/components/landing-page-frame.tsx'
import { useBlvdHtml } from '#app/utils/blvd-context.tsx'
import { loadStaticLandingPage } from '#app/utils/landing-pages.server.ts'

const LANDING_PAGE_TITLE = 'Telehealth Weight Loss Landing Page'

export async function loader() {
	const html = await loadStaticLandingPage({
		relativeHtmlPath:
			'Telehealth Weight Loss/Telehealth-Weight-Loss/index.html',
		serviceSlug: 'telehealth-weight-loss',
	})

	return json({ html })
}

export default function LandingPage() {
	const { html } = useLoaderData<typeof loader>()
	// Pre-fill the source hint with the telehealth slug so the booking form knows what to select
	const injectedHtml = useBlvdHtml(html, '?source=/lp/telehealth-weight-loss')
	return <LandingPageFrame html={injectedHtml} title={LANDING_PAGE_TITLE} />
}
