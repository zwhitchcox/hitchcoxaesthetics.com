import { type LoaderFunctionArgs } from '@remix-run/node'
import { locations, formatAddress, PHONE } from '#app/utils/locations.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import {
	getAllEnabledPages,
	getCategoryPages,
} from '#app/utils/site-pages.server.js'

/**
 * llms.txt — a concise, link-rich summary of the site for AI assistants.
 * Spec: https://llmstxt.org
 */
export function loader({ request }: LoaderFunctionArgs) {
	const siteUrl = getDomainUrl(request)

	const categories = getCategoryPages()
	const allPages = getAllEnabledPages()

	const serviceSections = categories
		.map(category => {
			const children = allPages.filter(
				page => page.parent === category.path && page.enabled,
			)
			const lines = [
				`- [${category.name}](${siteUrl}/${category.path}): ${category.shortDescription ?? ''}`.trimEnd(),
				...children.map(page =>
					`  - [${page.name}](${siteUrl}/${page.path}): ${page.shortDescription ?? ''}`.trimEnd(),
				),
			]
			return lines.join('\n')
		})
		.join('\n')

	const locationLines = locations
		.map(
			location =>
				`- ${location.displayName}: ${formatAddress(location)} — ${location.phone}`,
		)
		.join('\n')

	const body = `# Sarah Hitchcox Aesthetics

> Med spa in Knoxville and Farragut, TN owned by Sarah Hitchcox, RN, an
> experienced aesthetic injector. Services include Botox, Dysport, Jeuveau,
> dermal fillers, Kybella, SkinVive, laser treatments, Everesse skin
> tightening, microneedling, and medically supervised GLP-1 weight loss
> (semaglutide and tirzepatide). Free consultations. Book online at
> ${siteUrl}/book or call ${PHONE}.

## Services

${serviceSections}

## Locations

${locationLines}

## Booking

- [Book Online](${siteUrl}/book): Real-time scheduling at either location
- [About Sarah](${siteUrl}/about): Credentials and approach
- [Contact & Support](${siteUrl}/support): Email, phone, and directions
`

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': `public, max-age=${60 * 60}`,
		},
	})
}
