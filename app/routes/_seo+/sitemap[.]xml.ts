import { type LoaderFunctionArgs } from '@remix-run/node'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { sitePages } from '#app/utils/site-pages.server.js'

export async function loader({ request }: LoaderFunctionArgs) {
	const siteUrl = getDomainUrl(request)

	// Static marketing/utility pages
	const staticPaths = [
		'',
		'about',
		'bearden',
		'farragut',
		'support',
		'privacy',
		'tos',
	]

	// All enabled service pages (directly served, Knoxville-optimized)
	const servicePagePaths = Object.values(sitePages)
		.filter(p => p.enabled)
		.map(p => p.path)

	const allPaths = [...new Set([...staticPaths, ...servicePagePaths])]

	const urls = allPaths
		.map(p => {
			const loc = p ? `${siteUrl}/${p}` : siteUrl
			const priority = p === '' ? '1.0' : !p.includes('/') ? '0.9' : '0.7'
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
