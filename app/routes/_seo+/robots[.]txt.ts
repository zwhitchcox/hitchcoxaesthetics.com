import { generateRobotsTxt } from '@nasa-gcn/remix-seo'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { getDomainUrl } from '#app/utils/misc.tsx'

export function loader({ request }: LoaderFunctionArgs) {
	return generateRobotsTxt([
		// Non-public app areas — keep crawlers out
		// (note: /lp is intentionally crawlable so its noindex meta is seen)
		{ type: 'disallow', value: '/admin' },
		{ type: 'disallow', value: '/auth' },
		{ type: 'disallow', value: '/account' },
		{ type: 'disallow', value: '/cache' },
		{ type: 'disallow', value: '/me' },
		{ type: 'disallow', value: '/resources' },
		{ type: 'disallow', value: '/settings' },
		{ type: 'disallow', value: '/users' },
		{ type: 'sitemap', value: `${getDomainUrl(request)}/sitemap.xml` },
	])
}
