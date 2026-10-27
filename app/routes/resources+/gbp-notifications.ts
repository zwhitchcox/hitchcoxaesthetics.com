/**
 * Google Business Profile pub/sub push. The account notification setting,
 * shared with findgood.work, publishes to the topic
 * projects/polished-bounty-395315/topics/gbp-review-notifications. Our push
 * subscription sha-listing-hours-push posts each message here.
 *
 * On GOOGLE_UPDATE for one of our listings, we read that listing's hours
 * again from Google. The payload gives us only the listing id. Pub/Sub
 * sends a message again after a non-2xx answer, so every message that
 * passes the token check gets 200, also when the sync fails (the hourly job
 * is the safety net).
 */
import { type ActionFunctionArgs } from '@remix-run/node'
import { googleUpdateLocation } from '#app/utils/gbp-listing-hours.ts'
import {
	LISTING_IDS,
	syncGbpListingHours,
	verifyPushToken,
} from '#app/utils/gbp-listing-hours.server.ts'
import { ensurePrimary } from '#app/utils/litefs.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	// The mirror is SQLite: pin to the LiteFS primary.
	await ensurePrimary()
	if (!(await verifyPushToken(request.headers.get('Authorization')))) {
		return new Response('Unauthorized', { status: 401 })
	}
	const locationId = googleUpdateLocation(
		await request.json().catch(() => null),
	)
	if (locationId && LISTING_IDS.includes(locationId)) {
		await syncGbpListingHours([locationId])
			.then(() => console.log(`GBP push: hours of ${locationId} read again`))
			.catch(error => console.error('GBP push: hours sync failed', error))
	}
	return new Response('OK')
}
