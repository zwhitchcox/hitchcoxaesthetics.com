/**
 * Read-only: list CallRail trackers with type/name/source/swap_targets, so we
 * can see how an existing website pool is configured.
 *   pnpm tsx scripts/callrail-list-trackers.ts
 */
import 'dotenv/config'

import { callRailFetch, getCallRailAccountIds } from '#app/utils/callrail-booking.server.ts'

async function main() {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) throw new Error('CALLRAIL_API_KEY required')
	const [accountId] = await getCallRailAccountIds(apiKey)
	const res = (await callRailFetch(apiKey, `/a/${accountId}/trackers.json?per_page=250`, {
		method: 'GET',
	})) as { trackers?: any[] }
	for (const t of res.trackers ?? []) {
		console.log(
			`${t.type?.padEnd(8)} | ${String(t.name).padEnd(40)} | source=${JSON.stringify(t.source)} | swap=${JSON.stringify(t.swap_targets)} | pool_size=${t.pool_size ?? '-'}`,
		)
		if (t.message_flow) console.log(`         message_flow=${JSON.stringify(t.message_flow)}`)
	}
}

main().catch(e => {
	console.error(e instanceof Error ? e.message : e)
	process.exitCode = 1
})
