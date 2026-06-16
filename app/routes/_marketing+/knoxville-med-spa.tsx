import { type LoaderFunctionArgs } from '@remix-run/node'
import { redirectPreservingQuery } from '#app/utils/redirect.server.ts'

export function loader({ request }: LoaderFunctionArgs) {
	return redirectPreservingQuery(request, '/bearden', { status: 301 })
}
