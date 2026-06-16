import { type LoaderFunctionArgs } from '@remix-run/node'
import { redirectPreservingQuery } from '#app/utils/redirect.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	return redirectPreservingQuery(request, '/', { status: 301 })
}
