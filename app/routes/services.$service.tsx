import { redirect, type LoaderFunctionArgs } from '@remix-run/node'

// Map old service slugs to new paths
const redirectMap: Record<string, string> = {
	'hair-loss-prevention-regrowth': '/microneedling/hair-loss',
}

export async function loader({ params }: LoaderFunctionArgs) {
	const { service } = params
	if (!service) {
		return redirect('/', { status: 301 })
	}
	// Check if there's a specific redirect mapping
	if (redirectMap[service]) {
		return redirect(redirectMap[service], { status: 301 })
	}
	// Default: redirect to the same slug at root
	return redirect(`/${service}`, { status: 301 })
}
