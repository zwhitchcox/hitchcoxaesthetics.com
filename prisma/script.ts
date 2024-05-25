import { prisma } from '#app/utils/db.server.js'

async function main() {
	console.log(await prisma.clientHistoryField.findMany())
}

main().catch(console.error)
