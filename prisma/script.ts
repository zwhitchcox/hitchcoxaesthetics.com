import { prisma } from '#app/utils/db.server.js'

async function main() {
	const invoices = await prisma.invoiceItem.findMany({
		where: {
			date: {
				gte: new Date('2024-09-01'),
			},
		},
		select: {
			item: true,
		},
	})

	for (const invoice of invoices) {
		console.log(invoice.item)
	}
}

main().catch(console.error)
