import { prisma } from '#app/utils/db.server.js'

async function main() {
	console.log(await prisma.user.findMany())
}

main().catch(console.error)
