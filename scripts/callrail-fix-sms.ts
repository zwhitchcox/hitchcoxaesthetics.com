/**
 * Sets `message_flow` on Sarah Hitchcox CallRail trackers that are SMS-enabled
 * but not forwarding texts anywhere (message_flow: null) — the bug that ate the
 * RF-microneedling lead. Dry-run by default.
 *
 *   pnpm tsx scripts/callrail-fix-sms.ts            # dry run — lists what it would fix
 *   pnpm tsx scripts/callrail-fix-sms.ts --apply    # set message_flow
 *   pnpm tsx scripts/callrail-fix-sms.ts --dest=+18654898008 --apply
 */
import 'dotenv/config'

import { callRailFetch, getCallRailAccountIds } from '#app/utils/callrail-booking.server.ts'

const DEST =
	process.argv.find(a => a.startsWith('--dest='))?.slice('--dest='.length) ??
	'+18654898008'
const APPLY = process.argv.includes('--apply')
// SHA-only: the brand trackers, not Botox Knox / Weight Loss Knox.
const SHA_NAME = /Sarah Hitchcox Aesthetics|^GMB (Farragut|Knoxville)$/

async function main() {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) throw new Error('CALLRAIL_API_KEY required')
	const [accountId] = await getCallRailAccountIds(apiKey)
	const list = (await callRailFetch(apiKey, `/a/${accountId}/trackers.json?per_page=250`, {
		method: 'GET',
	})) as { trackers?: any[] }

	const targets = (list.trackers ?? []).filter(
		t => SHA_NAME.test(t.name) && t.sms_enabled && !t.message_flow,
	)
	if (targets.length === 0) {
		console.log('Nothing to fix — all SHA SMS-enabled trackers already forward texts.')
		return
	}
	for (const t of targets) {
		console.log(`${t.name} (${t.id}) → message_flow → ${DEST}`)
		if (APPLY) {
			await callRailFetch(apiKey, `/a/${accountId}/trackers/${t.id}.json`, {
				method: 'PUT',
				body: { message_flow: { type: 'auto-reply', destination_number: DEST } },
			})
			console.log('  ✓ updated')
		}
	}
	if (!APPLY) console.log(`\nDRY RUN — ${targets.length} tracker(s). Pass --apply to set message_flow.`)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
