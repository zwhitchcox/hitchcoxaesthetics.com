/**
 * One-shot: push every Google review in the DB into PostHog as `google_review`
 * events (stamped at each review's createTime). Safe to re-run — PostHog dedups
 * on $insert_id. The daily reviews-fetch job also does this automatically.
 *
 *   pnpm tsx scripts/sync-reviews-posthog.ts
 */
import 'dotenv/config'

import { syncGoogleReviewsToPostHog } from '#app/utils/reviews-posthog-sync.server.ts'

async function main() {
	const result = await syncGoogleReviewsToPostHog()
	console.log(JSON.stringify(result, null, 2))
	process.exitCode = result.ok ? 0 : 1
}

main()
