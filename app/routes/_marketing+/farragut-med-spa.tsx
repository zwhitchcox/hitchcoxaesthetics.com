import { type LoaderFunctionArgs } from '@remix-run/node'
import { redirectPreservingQuery } from '#app/utils/redirect.server.ts'

export function loader({ request }: LoaderFunctionArgs) {
	return redirectPreservingQuery(request, '/farragut', { status: 301 })
}
