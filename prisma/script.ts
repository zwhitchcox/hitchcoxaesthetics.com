import { prisma } from '#app/utils/db.server.js'

async function main() {
	console.log(await prisma.googleReview.findMany())
}

main().catch(console.error)
