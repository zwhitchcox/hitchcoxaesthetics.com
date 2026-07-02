/**
 * Read-only: review counts + date range per GoogleLocation in the DB.
 *   pnpm tsx scripts/gbp-reviews-by-location.ts
 */
import 'dotenv/config'

import { prisma } from '#app/utils/db.server.ts'

async function main() {
	const locs = await prisma.googleLocation.findMany()
	console.log(`GoogleLocation rows: ${locs.length}\n`)
	for (const l of locs) {
		const agg = await prisma.googleReview.aggregate({
			where: { locationId: l.id },
			_count: true,
			_min: { createTime: true },
			_max: { createTime: true },
		})
		const label = l.name ?? l.formattedAddress ?? l.id
		console.log(
			`${label} | id=${l.id} | reviews=${agg._count} | ${agg._min.createTime?.toISOString().slice(0, 10) ?? '-'} → ${agg._max.createTime?.toISOString().slice(0, 10) ?? '-'}`,
		)
	}
}

main().catch(e => {
	console.error(e)
	process.exitCode = 1
})
