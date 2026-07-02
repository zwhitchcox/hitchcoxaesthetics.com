/**
 * Read-only: fetch GBP reviews (v4 API) for the Farragut-area listings and find
 * a reviewer by name. Prints createTime + updateTime so we can see what date
 * Google stamps on a review.
 *
 *   pnpm tsx scripts/gbp-reviews.ts Shaylee
 */
import 'dotenv/config'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ACCT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const V4 = 'https://mybusiness.googleapis.com/v4'

async function getAccessToken() {
	const clientId = process.env.GOOGLE_CLIENT_ID
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET
	const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
	if (!clientId || !clientSecret || !refreshToken)
		throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN are required')
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		}),
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(json)}`)
	return json.access_token as string
}

async function main() {
	const needle = (process.argv[2] || 'Shaylee').toLowerCase()
	const token = await getAccessToken()

	const acctRes = await fetch(`${ACCT_API}/accounts`, {
		headers: { Authorization: `Bearer ${token}` },
	})
	const accts: any = await acctRes.json().catch(() => ({}))
	const accountNames = (accts.accounts ?? []).map((a: any) => a.name as string)

	// The two Kingston Pike / Campbell Station listings (swapped names).
	const targets: Record<string, string> = {
		'labeled Farragut @ 5113 Kingston Pike': '13581758717989522836',
		'labeled Bearden @ 102 Campbell Station (real Farragut store)': '7968858603211080242',
	}

	for (const acct of accountNames) {
		for (const [label, locId] of Object.entries(targets)) {
			const res = await fetch(`${V4}/${acct}/locations/${locId}/reviews?pageSize=200`, {
				headers: { Authorization: `Bearer ${token}` },
			})
			const json: any = await res.json().catch(() => ({}))
			if (!res.ok) {
				console.log(`[${label}] ${acct}: ${res.status} ${JSON.stringify(json).slice(0, 160)}`)
				continue
			}
			const reviews = json.reviews ?? []
			const hits = reviews.filter((r: any) =>
				(r.reviewer?.displayName ?? '').toLowerCase().includes(needle),
			)
			console.log(`\n[${label}] ${reviews.length} total reviews, ${hits.length} matching "${needle}"`)
			for (const r of hits) {
				console.log(`  reviewer:   ${r.reviewer?.displayName}`)
				console.log(`  stars:      ${r.starRating}`)
				console.log(`  createTime: ${r.createTime}`)
				console.log(`  updateTime: ${r.updateTime}`)
				console.log(`  comment:    ${(r.comment ?? '').replace(/\s+/g, ' ').slice(0, 200)}`)
			}
		}
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
