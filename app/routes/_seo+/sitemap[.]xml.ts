import { type LoaderFunctionArgs } from '@remix-run/node'
import { locationServices } from '#app/utils/location-service-data.server.js'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { sitePages } from '#app/utils/site-pages.server.js'

export async function loader({ request }: LoaderFunctionArgs) {
	const siteUrl = getDomainUrl(request)

	// Static marketing/utility pages
	const staticPaths = [
		'',
		'about',
		'knoxville-med-spa',
		'farragut-med-spa',

		'support',
		'privacy',
		'tos',
	]

	// Main service pages now 301 redirect to knoxville equivalents,
	// so we only include location-prefixed pages in the sitemap.
	const servicePagePaths = Object.values(sitePages)
		.filter(p => p.enabled)
		.map(p => p.path)

	// All manually authored location-service pages (knoxville-botox, farragut-filler, etc.)
	const locationServicePaths = Object.keys(locationServices)

	// Auto-generated location-prefixed pages (Case 3 in $.tsx):
	// For every enabled service page, generate knoxville-{path} and farragut-{path}
	const locationPrefixes = ['knoxville', 'farragut']
	const autoLocationPaths = servicePagePaths.flatMap(p => {
		const [first, ...rest] = p.split('/')
		const locPath = rest.length ? `${first}/${rest.join('/')}` : first
		return locationPrefixes.map(loc => `${loc}-${locPath}`)
	})

	// Combine and deduplicate — exclude bare service paths (they redirect)
	const allPaths = [
		...new Set([...staticPaths, ...locationServicePaths, ...autoLocationPaths]),
	]

	const urls = allPaths
		.map(p => {
			const loc = p ? `${siteUrl}/${p}` : siteUrl
			// Higher priority for home, categories, and location pages
			const priority =
				p === '' ? '1.0' : !p.includes('/') && !p.includes('-') ? '0.9' : '0.7'
			return `  <url>\n    <loc>${loc}</loc>\n    <priority>${priority}</priority>\n  </url>`
		})
		.join('\n')

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': `public, max-age=${60 * 5}`,
		},
	})
}
