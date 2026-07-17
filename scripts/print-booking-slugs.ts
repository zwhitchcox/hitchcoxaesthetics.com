/**
 * Prints the canonical /book?service=<slug> list for ad deep-links, derived
 * from the live Boulevard service catalog (same derivation the booking
 * wizard uses, so this list can never drift from what the site accepts).
 *
 *   pnpm tsx --env-file=.env scripts/print-booking-slugs.ts
 */
import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import {
	bookingServiceSlug,
	bookingServiceVariant,
} from '#app/utils/booking-service-slugs.ts'

async function main() {
	const names: string[] = []
	let after: string | null = null
	for (let page = 0; page < 20; page++) {
		const data: any = await boulevardAdminFetch(
			`query Services($after: String) {
				services(first: 100, after: $after) {
					pageInfo { endCursor hasNextPage }
					edges { node { name active } }
				}
			}`,
			{ after },
		)
		for (const e of data.services?.edges ?? []) {
			if (e.node?.active !== false && e.node?.name) names.push(e.node.name)
		}
		if (!data.services?.pageInfo?.hasNextPage) break
		after = data.services.pageInfo.endCursor
	}

	const bySlug = new Map<string, string[]>()
	for (const name of names) {
		if (/telehealth/i.test(name)) continue
		const slug = bookingServiceSlug(name)
		if (!slug) continue
		bySlug.set(slug, [...(bySlug.get(slug) ?? []), name])
	}

	const rows = [...bySlug.entries()].sort(([a], [b]) => a.localeCompare(b))
	for (const [slug, serviceNames] of rows) {
		const variants = serviceNames.map(bookingServiceVariant)
		const kind =
			variants.includes('new') && variants.includes('existing')
				? 'new+existing variants'
				: 'single service'
		console.log(
			`https://hitchcoxaesthetics.com/book?service=${slug}  (${kind}: ${serviceNames.join(' | ')})`,
		)
	}
	console.log(`\n${rows.length} slugs from ${names.length} active services`)
}

main().catch(e => {
	console.error(e instanceof Error ? e.message : e)
	process.exit(1)
})
