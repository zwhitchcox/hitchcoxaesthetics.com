import { type LoaderFunctionArgs } from '@remix-run/node'
import { redirectPreservingQuery } from '#app/utils/redirect.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	return redirectPreservingQuery(request, '/lp/weight-loss-semaglutide', {
		status: 301,
	})
}

export default function LegacyTelehealthWeightLossRoute() {
	return null
}
