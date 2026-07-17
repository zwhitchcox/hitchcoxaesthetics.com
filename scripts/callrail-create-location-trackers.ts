/**
 * Creates the CallRail trackers for a new location spoke:
 *   1. A GMB *source* tracking number (forwards to the location's line)
 *   2. A website *session* pool ("<Brand> - <Location> - Pool")
 *
 * Dry-run by default (prints the exact payloads, creates nothing). Pass --apply
 * to actually provision the numbers — each tracking number is a recurring
 * CallRail charge.
 *
 *   pnpm tsx scripts/callrail-create-location-trackers.ts            # dry run
 *   CALLRAIL_WEST_HILLS_DESTINATION=+1865XXXXXXX \
 *     pnpm tsx scripts/callrail-create-location-trackers.ts --apply  # create
 *
 * After running, copy the GMB tracking number and push it to Google Business
 * Profile with scripts/gbp-update-location.ts (--phone = GMB number, --secondary-phone
 * = real line, --website = ...?utm_campaign=gmb). The CallRail swap script is
 * already site-wide. Photos + service info are still manual in the GBP dashboard.
 */
import 'dotenv/config'

import {
	callRailFetch,
	getCallRailAccountIds,
} from '#app/utils/callrail-booking.server.ts'

// --- Config via CLI flags / env (see scripts/new-location-spoke.md) ---
//   --location="West Hills"  --area=865  --pool=4
//   --destination=+1865XXXXXXX   (or CALLRAIL_DESTINATION env)
//   --swap=+1865XXXXXXX,...      (or CALLRAIL_SWAP_TARGETS; defaults to destination)
function flag(name: string) {
	const prefix = `--${name}=`
	return process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length)
}

const COMPANY_ID = 'COM019c5d1e95027f46b36899d32ec44eec' // Sarah Hitchcox Aesthetics
const BRAND = 'Sarah Hitchcox Aesthetics'
const LOCATION = flag('location') ?? '' // required, e.g. --location="West Hills"
const AREA_CODE = flag('area') ?? '865'
const POOL_SIZE = Number(flag('pool') ?? '4')

// Where the tracking numbers forward — the location's RingCentral number/queue.
const DESTINATION = (
	flag('destination') ??
	process.env.CALLRAIL_DESTINATION ??
	''
).trim()
// Number(s) on the location's web page for the pool to swap (defaults to destination).
const SWAP_TARGETS = (
	flag('swap') ??
	process.env.CALLRAIL_SWAP_TARGETS ??
	DESTINATION
)
	.split(',')
	.map(s => s.trim())
	.filter(Boolean)

const APPLY = process.argv.includes('--apply')
const POOL_ONLY = process.argv.includes('--pool-only') // pool only (GMB tracker already exists)
// Where inbound texts to the tracking numbers forward. Defaults to the call
// destination, matching the other Sarah Hitchcox trackers.
const SMS_FORWARD = (flag('sms-forward') ?? DESTINATION).trim()
const messageFlow = SMS_FORWARD
	? { type: 'auto-reply', destination_number: SMS_FORWARD }
	: undefined

const gmbTracker = {
	type: 'source',
	name: `GMB - ${BRAND} - ${LOCATION}`,
	company_id: COMPANY_ID,
	source: { type: 'google_my_business' },
	call_flow: {
		type: 'basic',
		recording_enabled: true,
		destination_number: DESTINATION,
	},
	tracking_number: { area_code: AREA_CODE },
	sms_enabled: true,
	message_flow: messageFlow,
}

const websitePool = {
	type: 'session',
	name: `${BRAND} - ${LOCATION} - Pool`,
	company_id: COMPANY_ID,
	source: { type: 'all' }, // session pools require a source; "all" = all web traffic
	swap_targets: SWAP_TARGETS,
	pool_size: POOL_SIZE,
	call_flow: {
		type: 'basic',
		recording_enabled: true,
		destination_number: DESTINATION,
	},
	pool_numbers: { area_code: AREA_CODE },
	sms_enabled: true,
	message_flow: messageFlow,
}

async function createTracker(
	apiKey: string,
	accountId: string,
	payload: Record<string, unknown>,
) {
	const res = (await callRailFetch(apiKey, `/a/${accountId}/trackers.json`, {
		method: 'POST',
		body: payload,
	})) as { id?: string; name?: string; tracking_numbers?: string[] }
	return res
}

async function main() {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) throw new Error('CALLRAIL_API_KEY is required')
	const [accountId] = await getCallRailAccountIds(apiKey)
	if (!accountId) throw new Error('No CallRail account found')

	console.log(`account: ${accountId}`)
	console.log('\n--- GMB source tracker ---')
	console.log(JSON.stringify(gmbTracker, null, 2))
	console.log('\n--- Website pool ---')
	console.log(JSON.stringify(websitePool, null, 2))

	if (!APPLY) {
		console.log(
			'\nDRY RUN — nothing created. To provision (billable), pass --destination=+1865XXXXXXX (or set CALLRAIL_DESTINATION) and re-run with --apply.',
		)
		if (!DESTINATION) console.log('!! destination_number is empty — set it first.')
		return
	}
	if (!DESTINATION) {
		throw new Error(
			'Destination required before --apply: pass --destination=+1865XXXXXXX or set CALLRAIL_DESTINATION (tracking numbers need somewhere to ring).',
		)
	}

	if (!POOL_ONLY) {
		const gmb = await createTracker(apiKey, accountId, gmbTracker)
		console.log(`\n✓ GMB tracker created: ${gmb.id} → ${gmb.tracking_numbers?.join(', ')}`)
	} else {
		console.log('\n(--pool-only: skipping GMB tracker; it already exists)')
	}
	const pool = await createTracker(apiKey, accountId, websitePool)
	console.log(`✓ Pool created: ${pool.id} → ${pool.tracking_numbers?.join(', ')}`)
	console.log(
		`\nNext: push the GMB tracking number to Google Business Profile with\n  pnpm tsx scripts/gbp-update-location.ts --location=<name> --phone="<GMB number>" --secondary-phone="<real line>" --website="https://hitchcoxaesthetics.com/<slug>" --utm-location="<slug>" --apply`,
	)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
