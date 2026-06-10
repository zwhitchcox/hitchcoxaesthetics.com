import { json, type MetaFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'

import { LandingPageFrame } from '#app/components/landing-page-frame.tsx'
import { useBlvdHtml } from '#app/utils/blvd-context.tsx'
import { loadStaticLandingPage } from '#app/utils/landing-pages.server.ts'

const LANDING_PAGE_TITLE = 'Tirzepatide Landing Page'

// Ad landing page — noindex to avoid duplicate content with the main service pages
export const meta: MetaFunction = () => [
	{ title: 'Tirzepatide Weight Loss — Knoxville | Sarah Hitchcox Aesthetics' },
	{ name: 'robots', content: 'noindex' },
]

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
	const injectedHtml = useBlvdHtml(html)
	return <LandingPageFrame html={injectedHtml} title={LANDING_PAGE_TITLE} />
}
