import dotenv from 'dotenv'

import { reconcileBlvdRevenueItemAttribution } from '#app/utils/blvd-attribution.server.ts'
import { prisma } from '#app/utils/db.server.ts'

dotenv.config()

async function main() {
	const revenueItems = await prisma.blvdRevenueItem.findMany({
		where: {
			boulevardClientId: {
				not: null,
			},
		},
		select: {
			id: true,
			boulevardClientId: true,
			occurredAt: true,
		},
	})

	let updated = 0
	for (const item of revenueItems) {
		if (!item.boulevardClientId) continue
		await reconcileBlvdRevenueItemAttribution(
			{ revenueItemId: item.id },
			prisma,
		)
		updated++
	}

	console.log(`Reconciled ${updated} Boulevard revenue items`)
	await prisma.$disconnect()
}

main().catch(async error => {
	console.error(error instanceof Error ? error.message : error)
	await prisma.$disconnect()
	process.exit(1)
})
