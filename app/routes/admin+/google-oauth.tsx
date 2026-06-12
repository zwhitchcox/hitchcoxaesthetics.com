import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import {
	buildGoogleOAuthUrl,
	exchangeGoogleOAuthCode,
} from '#app/utils/follow-ups.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

const STATE_COOKIE = 'google_oauth_state'

/**
 * Google OAuth connect flow for the Google Voice follow-up sync.
 * GET /admin/google-oauth         -> redirects to Google consent
 * GET /admin/google-oauth?code=.. -> exchanges the code, stores tokens
 */
export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const url = new URL(request.url)
	const redirectUri = `${url.origin}/admin/google-oauth`
	const code = url.searchParams.get('code')

	if (!code) {
		const state = crypto.randomUUID()
		const authUrl = buildGoogleOAuthUrl({ redirectUri, state })
		if (!authUrl) {
			return redirect('/admin/follow-ups?google=missing_env')
		}
		return redirect(authUrl, {
			headers: {
				'Set-Cookie': `${STATE_COOKIE}=${state}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=600`,
			},
		})
	}

	const cookieState = request.headers
		.get('Cookie')
		?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1]
	const clearStateCookie = `${STATE_COOKIE}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`
	if (!cookieState || cookieState !== url.searchParams.get('state')) {
		return redirect('/admin/follow-ups?google=state_mismatch', {
			headers: { 'Set-Cookie': clearStateCookie },
		})
	}

	const result = await exchangeGoogleOAuthCode({ code, redirectUri })
	return redirect(
		result.ok
			? '/admin/follow-ups?google=connected'
			: `/admin/follow-ups?google=${encodeURIComponent(result.error)}`,
		{ headers: { 'Set-Cookie': clearStateCookie } },
	)
}
