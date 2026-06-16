import { type LoaderFunctionArgs } from '@remix-run/node'
import { redirectPreservingQuery } from '#app/utils/redirect.server.ts'

// Map old service slugs to new paths
const redirectMap: Record<string, string> = {
	'hair-loss-prevention-regrowth': '/microneedling/hair-loss',
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	const { service } = params
	if (!service) {
		return redirectPreservingQuery(request, '/', { status: 301 })
	}
	// Check if there's a specific redirect mapping
	if (redirectMap[service]) {
		return redirectPreservingQuery(request, redirectMap[service], {
			status: 301,
		})
	}
	// Default: redirect to the same slug at root
	return redirectPreservingQuery(request, `/${service}`, { status: 301 })
}
