/**
 * Prints the canonical /book?service=<slug> list for ad deep-links. Same data
 * as the hidden /booking-links page (app/utils/booking-service-slugs.server.ts).
 *
 *   pnpm tsx --env-file=.env scripts/print-booking-slugs.ts
 */
import { listBookingSlugGroups } from '#app/utils/booking-service-slugs.server.ts'

async function main() {
	const groups = await listBookingSlugGroups()
	for (const g of groups) {
		const kind = g.hasVariants ? 'new+existing variants' : 'single service'
		console.log(`${g.url}  (${kind}: ${g.serviceNames.join(' | ')})`)
	}
	console.log(`\n${groups.length} slugs`)
}

main().catch(e => {
	console.error(e instanceof Error ? e.message : e)
	process.exit(1)
})
