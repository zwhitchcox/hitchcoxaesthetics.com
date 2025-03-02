import { prisma } from '#app/utils/db.server.js'

async function main() {
	console.log(await prisma.googleReview.count())
}

main().catch(console.error)
