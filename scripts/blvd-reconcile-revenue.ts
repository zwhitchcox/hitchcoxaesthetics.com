import dotenv from 'dotenv'

import { resolveBlvdAttributionTouchForRevenueItem } from '#app/utils/blvd-attribution.server.ts'
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

		const touch = await resolveBlvdAttributionTouchForRevenueItem(prisma, {
			boulevardClientId: item.boulevardClientId,
			occurredAt: item.occurredAt,
		})

		await prisma.blvdRevenueItem.update({
			where: { id: item.id },
			data: {
				attributionTouchId: touch?.id ?? null,
				attributionMethod: touch ? 'last_touch_before_revenue' : 'unattributed',
				attributedAt: new Date(),
			},
		})
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
