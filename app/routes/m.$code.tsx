import { randomUUID } from 'node:crypto'
import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import {
	POSTCARD_LINKS,
	postcardRedirectUrl,
} from '#app/utils/postcard-links.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'

/**
 * Postcard QR codes land here. Count the scan on the server (ad blockers
 * cannot hide it), then go to the page with the postcard's UTM tags.
 * ?test=1 skips the count, for checks before the cards are mailed.
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
	const code = params.code ?? ''
	const to = postcardRedirectUrl(code)
	if (!to) return redirect('/')

	const link = POSTCARD_LINKS[code]!
	if (new URL(request.url).searchParams.get('test') !== '1') {
		await captureServerPostHogEvent({
			distinctId: `postcard-scan:${randomUUID()}`,
			event: 'postcard_scanned',
			insertId: `postcard-scanned:${randomUUID()}`,
			properties: {
				postcard_code: code,
				utm_campaign: link.campaign,
				utm_content: link.content,
				$process_person_profile: false,
			},
		})
	}
	return redirect(to, { headers: { 'Cache-Control': 'no-store' } })
}
