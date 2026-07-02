/**
 * Google Business Profile — list locations and (with --apply) update a location's
 * NAP (phone, website) via the Business Profile API. Use this to push a new
 * location's number/website link, or to update on change.
 *
 * Prereqs (the script reports clearly if missing):
 *   - Business Profile API access approved for the Google Cloud project
 *   - GOOGLE_REFRESH_TOKEN scoped for https://www.googleapis.com/auth/business.manage
 *     (the current token is almost certainly Ads-scoped — re-auth needed)
 *
 * Usage:
 *   pnpm tsx scripts/gbp-update-location.ts                       # list accounts + locations (discovery)
 *   pnpm tsx scripts/gbp-update-location.ts \
 *     --location=accounts/123/locations/456 \
 *     --phone="+18655551234" \                                    # primary = CallRail GMB number
 *     --secondary-phone="+18654898008" \                          # secondary NAP = real line
 *     --website="https://hitchcoxaesthetics.com/west-hills" \
 *     --utm-location="west-hills" --apply                         # → ...?utm_campaign=gmb&utm_content=west-hills
 *
 * Pass --phone and --secondary-phone together: the update replaces the whole
 * phoneNumbers object, so omitting one clears it. The website is normalized to
 * carry utm_campaign=gmb and (with --utm-location) utm_content=<id>, so analytics
 * can attribute GBP clicks to the specific listing.
 */
import 'dotenv/config'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ACCT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'

function flag(name: string) {
	const prefix = `--${name}=`
	return process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length)
}
const APPLY = process.argv.includes('--apply')

// Canonical GBP website link: always forces utm_campaign=gmb and, when a
// location id is given, utm_content=<id>, so analytics (PostHog/GA) can
// attribute clicks to the specific listing. Idempotent — safe to pass a URL
// that already has the params.
function buildGbpWebsite(base: string, utmLocation?: string) {
	const url = new URL(base)
	url.searchParams.set('utm_campaign', 'gmb')
	if (utmLocation) url.searchParams.set('utm_content', utmLocation)
	return url.toString()
}

async function getAccessToken() {
	const clientId = process.env.GOOGLE_CLIENT_ID
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET
	const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
	if (!clientId || !clientSecret || !refreshToken) {
		throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN are required')
	}
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
	if (!res.ok) throw new Error(`token exchange ${res.status}: ${JSON.stringify(json)}`)
	if (json.scope && !String(json.scope).includes('business.manage')) {
		console.warn(
			'!! WARNING: token scope is missing `business.manage` — Business Profile calls will 403.\n   Re-auth this refresh token with the https://www.googleapis.com/auth/business.manage scope.\n   current scope:',
			json.scope,
		)
	}
	return json.access_token as string
}

async function gbpGet(token: string, url: string) {
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) {
		throw new Error(`GET ${res.status} ${url}\n${JSON.stringify(json).slice(0, 500)}`)
	}
	return json
}

async function main() {
	const token = await getAccessToken()
	const location = flag('location')

	if (APPLY && location) {
		const updates: Record<string, unknown> = {}
		const mask: string[] = []
		const phone = flag('phone')
		const secondaryPhone = flag('secondary-phone')
		const website = flag('website')
		const utmLocation = flag('utm-location')
		if (phone || secondaryPhone) {
			const phoneNumbers: Record<string, unknown> = {}
			if (phone) phoneNumbers.primaryPhone = phone
			if (secondaryPhone) phoneNumbers.additionalPhones = [secondaryPhone]
			updates.phoneNumbers = phoneNumbers
			mask.push('phoneNumbers')
		}
		if (website) {
			if (!utmLocation) {
				console.warn(
					'!! no --utm-location given; the GBP link will not carry a location id (utm_content) for analytics.',
				)
			}
			updates.websiteUri = buildGbpWebsite(website, utmLocation)
			mask.push('websiteUri')
		}
		const description = flag('description')
		if (description) {
			updates.profile = { description }
			mask.push('profile.description')
		}
		const title = flag('title')
		if (title) {
			// NOTE: a title change can put the listing back into Google verification.
			updates.title = title
			mask.push('title')
		}
		if (mask.length === 0) {
			throw new Error(
				'Nothing to update — pass --phone, --secondary-phone, --website, --description and/or --title with --apply',
			)
		}
		const url = `${INFO_API}/${location}?updateMask=${mask.join(',')}`
		const res = await fetch(url, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(updates),
		})
		const json: any = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(`PATCH ${res.status}: ${JSON.stringify(json).slice(0, 500)}`)
		console.log('✓ updated:', JSON.stringify(json, null, 1).slice(0, 800))
		return
	}

	// Discovery: list accounts + their locations with current NAP.
	const accounts = await gbpGet(token, `${ACCT_API}/accounts`)
	const list = accounts.accounts ?? []
	if (list.length === 0) console.log('(no Business Profile accounts returned for this token)')
	for (const account of list) {
		console.log(`\nACCOUNT ${account.name} — ${account.accountName} (${account.type})`)
		const readMask = 'name,title,storefrontAddress,phoneNumbers,websiteUri,metadata'
		const locations = await gbpGet(
			token,
			`${INFO_API}/${account.name}/locations?readMask=${readMask}&pageSize=100`,
		).catch(e => ({ error: String(e).slice(0, 300) }))
		if ((locations as any).error) {
			console.log('  ! could not list locations:', (locations as any).error)
			continue
		}
		for (const loc of (locations as any).locations ?? []) {
			const addr = (loc.storefrontAddress?.addressLines || []).join(' ')
			console.log(
				`  ${loc.name} | ${loc.title} | ${loc.phoneNumbers?.primaryPhone || '-'} | ${loc.websiteUri || '-'} | ${addr} | ${loc.metadata?.mapsUri || '-'} | placeId=${loc.metadata?.placeId || '-'}`,
			)
		}
	}
	console.log(
		'\nTo update one: --location=<name from above> --phone="+1865..." --website="https://...?utm_campaign=gmb" --apply',
	)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
