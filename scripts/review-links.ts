/**
 * Generates the review link + printable QR code for each Boulevard provider.
 *
 *   pnpm exec tsx scripts/review-links.ts
 *
 * Writes PNG QR codes to ./review-qr-codes/ and prints a table of links.
 * Set REVIEW_SITE_URL to override the base domain.
 */
import 'dotenv/config'

import * as fs from 'node:fs'
import * as path from 'node:path'
import QRCode from 'qrcode'

import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import { readAppointmentSnapshot } from '#app/utils/review-link.server.ts'

const SITE = (process.env.REVIEW_SITE_URL || 'https://hitchcoxaesthetics.com').replace(/\/$/, '')

type StaffNode = { id?: string | null; firstName?: string | null; lastName?: string | null }

async function listStaff(): Promise<StaffNode[]> {
	const out: StaffNode[] = []
	let after: string | null = null
	for (let page = 0; page < 20; page++) {
		const resp: any = await boulevardAdminFetch(
			`query Staff($after: String) {
				staff(first: 100, after: $after) {
					pageInfo { endCursor hasNextPage }
					edges { node { id firstName lastName } }
				}
			}`,
			{ after },
		)
		const edges = resp.staff?.edges ?? []
		for (const e of edges) if (e.node?.id) out.push(e.node)
		const pi = resp.staff?.pageInfo
		if (!pi?.hasNextPage) break
		after = pi.endCursor
	}
	return out
}

async function main() {
	const [staff, snapshot] = await Promise.all([listStaff(), readAppointmentSnapshot()])
	const activeStaffIds = new Set(snapshot?.appointments.map(a => a.staffId) ?? [])

	const outDir = path.join(process.cwd(), 'review-qr-codes')
	fs.mkdirSync(outDir, { recursive: true })

	console.log(`Base URL: ${SITE}\n`)
	console.log('Provider'.padEnd(28), 'Recent appts?'.padEnd(14), 'Review link')
	console.log('-'.repeat(90))

	for (const s of staff) {
		const uuid = (s.id ?? '').split(':').pop() ?? ''
		if (!uuid) continue
		const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || uuid
		const url = `${SITE}/r/${uuid}`
		const file = path.join(outDir, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
		await QRCode.toFile(file, url, { width: 600, margin: 2 })
		const active = activeStaffIds.has(s.id ?? '') ? 'yes' : '—'
		console.log(name.padEnd(28), active.padEnd(14), url)
	}

	console.log(`\nQR codes written to ${outDir}`)
	console.log(
		'("Recent appts?" = yes means this provider has appointments in the current review snapshot, i.e. an active provider.)',
	)
}

main().catch(e => {
	console.error(e?.message || e)
	process.exit(1)
})
