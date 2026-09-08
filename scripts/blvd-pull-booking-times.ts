/**
 * Pull id/createdAt/startAt/state/cancelled for every appointment, all
 * locations, into JSON. createdAt is when the BOOKING was made, the input to
 * booking-arrival modeling (scripts/booking-forecast-backtest.ts).
 *
 *   pnpm exec tsx scripts/blvd-pull-booking-times.ts /path/to/bookings.json
 */
import fs from 'node:fs'

import 'dotenv/config'

import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'

async function main() {
	const out = process.argv[2]
	if (!out) throw new Error('usage: tmp-pull-bookings.ts <out.json>')
	const locs = await listBlvdAdminLocations()
	const rows: Array<{
		loc: string
		id: string
		createdAt: string | null
		startAt: string
		state: string | null
		cancelled: boolean
	}> = []
	for (const loc of locs) {
		let after: string | null = null
		let pages = 0
		for (let page = 0; page < 500; page++) {
			const r = await boulevardAdminFetch<{
				appointments?: {
					pageInfo?: { endCursor?: string | null; hasNextPage?: boolean }
					edges?: Array<{
						node?: {
							id: string
							createdAt?: string | null
							startAt: string
							state: string | null
							cancelled: boolean | null
						} | null
					}>
				}
			}>(
				`query A($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId) {
						pageInfo { endCursor hasNextPage }
						edges { node { id createdAt startAt state cancelled } }
					}
				}`,
				{ after, locationId: loc.id },
			)
			for (const e of r.appointments?.edges ?? []) {
				const n = e?.node
				if (!n?.id) continue
				rows.push({
					loc: loc.name ?? loc.id,
					id: n.id,
					createdAt: n.createdAt ?? null,
					startAt: n.startAt,
					state: n.state ?? null,
					cancelled: Boolean(n.cancelled),
				})
			}
			pages = page + 1
			if (!r.appointments?.pageInfo?.hasNextPage) break
			after = r.appointments.pageInfo.endCursor ?? null
		}
		console.log(`${loc.name}: ${pages} pages, running total ${rows.length}`)
	}
	fs.writeFileSync(out, JSON.stringify(rows))
	console.log(`wrote ${rows.length} appointments to ${out}`)
	process.exit(0)
}
void main()
