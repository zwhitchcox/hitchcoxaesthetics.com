import { redirect } from '@remix-run/node'

/**
 * Redirect that preserves the incoming query string so tracking params
 * (gclid, gbraid, gad_*, utm_*) survive the hop. A plain redirect('/path')
 * drops the query, which silently breaks Google Ads / analytics attribution
 * when an ad or shared link points at a redirecting URL.
 */
export function redirectPreservingQuery(
	request: Request,
	path: string,
	init?: Parameters<typeof redirect>[1],
) {
	const { search } = new URL(request.url)
	return redirect(`${path}${search}`, init)
}
