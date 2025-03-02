import { prisma } from '#app/utils/db.server.js'

async function main() {
	const invoices = await prisma.invoiceItem.findMany({
		where: {
			date: {
				gte: new Date('2024-09-01'),
			},
		},
		select: {
			details: true,
		},
	})

	console.log(invoices)
}

main().catch(console.error)
