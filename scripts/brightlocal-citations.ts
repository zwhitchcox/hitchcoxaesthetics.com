/**
 * BrightLocal Citation Builder — DRY RUN. Prints the exact NAP payload we would
 * submit to build citations for each location, and (with --probe) validates the
 * API key. Orders NOTHING.
 *
 * BrightLocal's Citation Builder IS API-drivable (Management API): create a
 * location, then order a Citation Builder campaign for it. The current API lives
 * at developer.brightlocal.com; the legacy tools.brightlocal.com API (api-key
 * query param) is deprecated for citations. The create-campaign endpoint on the
 * new API still needs confirming from the (JS-rendered) Stoplight docs before we
 * wire up an --apply path.
 *
 *   pnpm tsx scripts/brightlocal-citations.ts          # dry run — prints payloads
 *   pnpm tsx scripts/brightlocal-citations.ts --probe  # best-effort key check
 */
import 'dotenv/config'

import { BRAND, citationWebsiteUrl, locations } from '#app/utils/locations.ts'

const apiKey = process.env.BRIGHT_LOCAL_API_KEY?.trim()
const API_BASE = 'https://api.brightlocal.com' // Citation Builder API (confirmed from the OpenAPI export)

// Auth is just the api key in the x-api-key header — no secret.
async function bl(path: string, init?: RequestInit) {
	return fetch(`${API_BASE}${path}`, {
		...init,
		headers: { 'x-api-key': apiKey ?? '', 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
	})
}

// NAP must stay identical to the GBP + the site JSON-LD: real line as phone,
// canonical /slug URL, exact suite. Citation directories key off NAP match.
function napFor(slug: string) {
	const loc = locations.find(l => l.id === slug)
	if (!loc) throw new Error(`unknown location ${slug}`)
	return {
		businessName: BRAND,
		locationLabel: loc.displayName,
		address1: loc.addressParts.line1,
		address2: loc.addressParts.line2,
		city: loc.city,
		region: loc.state,
		postcode: loc.zip,
		country: 'USA',
		telephone: loc.phones.real, // real line — the consistent NAP everywhere
		// A utm on the website URL is safe for NAP: Google matches entities on
		// Name/Address/Phone, not the website query string, so this won't create a
		// duplicate. utm_campaign=citation lets citation-driven web bookings be
		// attributed (per location via utm_content), same chain as the GMB links.
		website: citationWebsiteUrl(loc),
		latitude: loc.lat,
		longitude: loc.lng,
		primaryCategory: 'Medical Spa',
	}
}

async function probe() {
	if (!apiKey) throw new Error('BRIGHT_LOCAL_API_KEY required')
	for (const path of ['/manage/v1/citation-builder/credits', '/manage/v1/citation-builder']) {
		const res = await bl(path)
		console.log(`${res.status}  GET ${path}\n  ${(await res.text()).slice(0, 200)}`)
	}
	console.log(
		'\nBuild flow: (Location API) create/find location with NAP + utm website → POST /manage/v1/citation-builder {location_id, remove_duplicates:true} → GET .../lookup (per-field NAP match vs existing) → PUT .../confirm (spends credits). Needs credits > 0 + the Location Management API to create locations.',
	)
}

// All per-location data (place ids, phones, addresses, BrightLocal ids) comes
// from the canonical config via #app/utils/locations.ts.
function locFor(slug: string) {
	const loc = locations.find(l => l.id === slug)
	if (!loc) throw new Error(`unknown location ${slug}`)
	return loc
}

// Create a location (from Google Place ID) + campaign, run the FREE lookup, and
// print the proposed citation list. Confirms NOTHING — 0 credits spent.
async function runLookup(slug: string) {
	const place_id = locFor(slug).gbp.placeId
	let res = await bl('/manage/v1/locations/actions/create-from-place-id', {
		method: 'POST',
		body: JSON.stringify({ place_id, is_service_area_business: false }),
	})
	let j: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`create location ${res.status}: ${JSON.stringify(j).slice(0, 200)}`)
	const location_id = j.location_id
	console.log(`✓ location ${location_id} (${slug})`)
	res = await bl('/manage/v1/citation-builder', {
		method: 'POST',
		body: JSON.stringify({ location_id }),
	})
	j = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`create campaign ${res.status}: ${JSON.stringify(j).slice(0, 200)}`)
	const campaign_id = j.campaign_id
	console.log(`✓ campaign ${campaign_id} — running lookup (async)...`)
	const deadline = Date.now() + 120_000
	while (Date.now() < deadline) {
		res = await bl(`/manage/v1/citation-builder/${campaign_id}/lookup`)
		j = await res.json().catch(() => ({}))
		if (j.lookup_completed_at) break
		await new Promise(r => setTimeout(r, 5000))
	}
	const cites = j.citations ?? []
	console.log(`\nProposed citations: ${cites.length} (completed=${j.lookup_completed_at ?? 'still processing'})`)
	for (const c of cites) {
		const m = c.matching_results
		console.log(
			`  ${c.domain}${c.profile_url ? '  (existing)' : '  (new)'}${m ? `  match name=${m.name} addr=${m.address} phone=${m.phone}` : ''}`,
		)
	}
	console.log(
		`\n(location ${location_id} / campaign ${campaign_id} created, NOT confirmed — 0 credits spent. Delete if not proceeding.)`,
	)
}

// cb25 = 25 citations. The docs list cb30 but the live API rejects it — cb25 is
// the largest accepted package on this account (verified 2026-07-01; a campaign
// drew 73 credits: 25 citations + 3 aggregators × 16).
const CITATION_PACKAGE = 'cb25'
const AGGREGATORS = ['dataaxle', 'neustar', 'foursquare'] // seed the long-tail directories

// Push the canonical citation NAP onto the BrightLocal location.
// create-from-place-id copies the GBP profile, which carries the CallRail
// tracking number and the gmb utm link — citations must instead carry the REAL
// line + the citation utm, and the exact suite. All values from the config.
async function fixProfile(location_id: number, slug: string) {
	const loc = locFor(slug)
	const res = await bl(`/manage/v1/locations/${location_id}`, {
		method: 'PATCH',
		body: JSON.stringify({
			telephone: loc.phones.real,
			address: { address1: loc.addressParts.line1, address2: loc.addressParts.line2 },
			urls: { website_url: citationWebsiteUrl(loc) },
		}),
	})
	const j: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`profile patch ${res.status}: ${JSON.stringify(j).slice(0, 200)}`)
	console.log(`✓ profile fixed ${location_id} (${slug}): real line + suite + citation utm`)
}

// Standalone: re-assert the canonical NAP on every BrightLocal location that
// has an id in the config.
async function fixProfiles() {
	for (const loc of locations) {
		if (!loc.brightlocal?.locationId) continue
		await fixProfile(loc.brightlocal.locationId, loc.id)
	}
}

// Full build for one location: create-from-place-id → set citation-utm website →
// create campaign → confirm (cb30 + aggregators + remove_duplicates). The confirm
// SPENDS CREDITS, so it's gated behind --yes-spend-credits.
async function runConfirm(slug: string) {
	const loc = locFor(slug)
	console.log(
		`Plan (${slug}): create location → website ${citationWebsiteUrl(loc)} → campaign → confirm ${CITATION_PACKAGE} + [${AGGREGATORS.join(', ')}] + remove_duplicates`,
	)
	if (!process.argv.includes('--yes-spend-credits')) {
		console.log('\nDRY — pass --yes-spend-credits to create + confirm (SPENDS CREDITS).')
		return
	}
	// Reuse the location/campaign ids from the canonical config when present
	// (fall back to name-matching for a location that hasn't been created yet),
	// so we never create duplicates.
	let location_id: number | undefined = loc.brightlocal?.locationId ?? undefined
	let campaign_id: number | undefined = loc.brightlocal?.campaignId ?? undefined
	if (location_id) {
		console.log(`✓ reusing location ${location_id} / campaign ${campaign_id} (from config)`)
	} else {
		const found = (await (await bl('/manage/v1/citation-builder')).json().catch(() => ({}))) as {
			items?: Array<{ campaign_id: number; location_id: number; name?: string }>
		}
		const existing = (found.items ?? []).find(c => c.name?.includes(loc.gbp.title))
		if (existing) {
			location_id = existing.location_id
			campaign_id = existing.campaign_id
			console.log(`✓ reusing location ${location_id} / campaign ${campaign_id} (matched by title)`)
		}
	}
	let res: Response
	let j: any
	if (!location_id) {
		res = await bl('/manage/v1/locations/actions/create-from-place-id', {
			method: 'POST',
			body: JSON.stringify({ place_id: loc.gbp.placeId, is_service_area_business: false }),
		})
		j = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(`create location ${res.status}: ${JSON.stringify(j).slice(0, 200)}`)
		location_id = j.location_id
		console.log(`✓ created location ${location_id} — add it (and the campaign id below) to app/config/locations.json`)
	}
	await fixProfile(location_id!, slug)
	if (!campaign_id) {
		res = await bl('/manage/v1/citation-builder', {
			method: 'POST',
			body: JSON.stringify({ location_id }),
		})
		j = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(`create campaign ${res.status}: ${JSON.stringify(j).slice(0, 200)}`)
		campaign_id = j.campaign_id
	}
	res = await bl(`/manage/v1/citation-builder/${campaign_id}/confirm`, {
		method: 'PUT',
		body: JSON.stringify({
			package_id: CITATION_PACKAGE,
			auto_select: true,
			publishers: AGGREGATORS,
			remove_duplicates: true,
			notes:
				'This is a medical spa (Botox, fillers, laser, weight loss). Please prioritize including the medical-aesthetics directories realself.com, healthgrades.com, and vitals.com in the site selection if available.',
		}),
	})
	j = await res.json().catch(() => ({}))
	console.log(
		res.ok
			? `✓ confirmed ${slug}: campaign ${campaign_id}, ${CITATION_PACKAGE} + ${AGGREGATORS.join('+')} + dedup`
			: `✗ confirm ${res.status}: ${JSON.stringify(j).slice(0, 250)}`,
	)
}

async function main() {
	if (process.argv.includes('--probe')) return probe()
	const lk = process.argv.find(a => a.startsWith('--lookup'))
	if (lk) return runLookup(lk.includes('=') ? lk.split('=')[1] : 'west-hills')
	if (process.argv.includes('--fix-profiles')) return fixProfiles()
	const cf = process.argv.find(a => a.startsWith('--confirm'))
	if (cf) return runConfirm(cf.includes('=') ? cf.split('=')[1] : 'west-hills')
	if (!apiKey) console.warn('!! BRIGHT_LOCAL_API_KEY not set — dry run only\n')
	for (const loc of locations) {
		console.log(`--- ${loc.id} citation NAP (dry run) ---`)
		console.log(JSON.stringify(napFor(loc.id), null, 2))
		console.log('')
	}
	console.log(
		'DRY RUN — nothing ordered. Next: confirm the Citation Builder create-location + create-campaign endpoints on the new API, then add the POST + an --apply guard.',
	)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
