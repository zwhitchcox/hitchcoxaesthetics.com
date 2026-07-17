/**
 * Pull the full appointment history (incl. Jane-imported records) from the
 * Boulevard Admin API into a JSON file for cohort/retention analysis.
 *
 *   pnpm exec tsx scripts/blvd-pull-appointments.ts /path/to/out.json
 */
import fs from 'node:fs'

import 'dotenv/config'

import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'

type ApptNode = {
	id: string
	startAt: string
	state: string | null
	cancelled: boolean | null
	client?: { id?: string | null; name?: string | null } | null
	appointmentServices?: Array<{ service?: { name?: string | null } | null }> | null
}

async function main() {
	const out = process.argv[2]
	if (!out) throw new Error('usage: blvd-pull-appointments.ts <out.json>')
	const locs = await listBlvdAdminLocations()
	const rows: Array<{
		location: string
		startAt: string
		state: string | null
		cancelled: boolean
		clientId: string
		clientName: string
		services: string[]
	}> = []
	for (const loc of locs) {
		let after: string | null = null
		for (let page = 0; page < 500; page++) {
			const r = await boulevardAdminFetch<{
				appointments?: {
					pageInfo?: { endCursor?: string | null; hasNextPage?: boolean }
					edges?: Array<{ node?: ApptNode | null }>
				}
			}>(
				`query A($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId) {
						pageInfo { endCursor hasNextPage }
						edges { node {
							id
							startAt
							state
							cancelled
							client { id name }
							appointmentServices { service { name } }
						} }
					}
				}`,
				{ after, locationId: loc.id },
			)
			const nodes = (r.appointments?.edges ?? [])
				.map(e => e.node)
				.filter((n): n is ApptNode => Boolean(n?.id))
			for (const n of nodes) {
				rows.push({
					location: loc.name,
					startAt: n.startAt,
					state: n.state ?? null,
					cancelled: Boolean(n.cancelled),
					clientId: n.client?.id ?? '(none)',
					clientName: n.client?.name ?? '',
					services: (n.appointmentServices ?? [])
						.map(s => s.service?.name ?? '')
						.filter(Boolean),
				})
			}
			if (page % 10 === 0)
				console.log(`${loc.name}: page ${page}, total ${rows.length}`)
			const pi = r.appointments?.pageInfo
			if (!pi?.hasNextPage || !pi.endCursor) break
			after = pi.endCursor
		}
	}
	fs.writeFileSync(out, JSON.stringify(rows))
	console.log(`wrote ${rows.length} appointments to ${out}`)
}

void main()
