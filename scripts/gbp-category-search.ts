/**
 * Look up Google Business Profile category IDs (gcid:...) by verifying candidates
 * or searching display names. Use this to get the exact `name` for a category
 * before adding it to gbp-reconcile.ts.
 *
 *   pnpm tsx scripts/gbp-category-search.ts                 # verify the SHA candidate gcids
 *   pnpm tsx scripts/gbp-category-search.ts "laser hair"    # search display names
 */
import 'dotenv/config'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'

const CANDIDATES = [
	'gcid:medical_spa',
	'gcid:skin_care_clinic',
	'gcid:weight_loss_service',
	'gcid:laser_hair_removal_service',
	'gcid:facial_spa',
	'gcid:wellness_center',
]

async function getAccessToken() {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		body: new URLSearchParams({
			client_id: process.env.GOOGLE_CLIENT_ID ?? '',
			client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
			refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
			grant_type: 'refresh_token',
		}),
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(json)}`)
	return json.access_token as string
}

async function main() {
	const token = await getAccessToken()
	const term = process.argv[2]
	if (term) {
		const url = `${INFO_API}/categories?regionCode=US&languageCode=en&view=BASIC&filter=displayName=${encodeURIComponent(term)}&pageSize=20`
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
		const json: any = await res.json().catch(() => ({}))
		console.log(res.status, JSON.stringify(json, null, 1).slice(0, 1200))
		return
	}
	const names = CANDIDATES.map(c => `names=${encodeURIComponent(c)}`).join('&')
	const url = `${INFO_API}/categories:batchGet?regionCode=US&languageCode=en&view=BASIC&${names}`
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) {
		console.log('batchGet failed', res.status, JSON.stringify(json).slice(0, 300))
		return
	}
	for (const c of json.categories ?? []) console.log(`  ${c.name}  →  "${c.displayName}"`)
}

main().catch(e => {
	console.error(e instanceof Error ? e.message : e)
	process.exitCode = 1
})
