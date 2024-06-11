import { invariant } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { promiseHash } from 'remix-utils/promise'

import { getAvailableWindows } from '#/app/routes/book+/available-windows/$providerId/route.server'
import { SEOHandle } from '@nasa-gcn/remix-seo'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	const providerId = params.providerId ?? process.env.DEFAULT_PROVIDER
	const url = new URL(request.url)
	const dates = url.searchParams.getAll('date')
	const dateHash: Record<string, Promise<{ start: number; end: number }[]>> = {}
	for (const date of dates) {
		invariant(typeof date === 'string', 'date is required')
		dateHash[date] = getAvailableWindows(date, providerId)
	}
	return json(await promiseHash(dateHash))
}
