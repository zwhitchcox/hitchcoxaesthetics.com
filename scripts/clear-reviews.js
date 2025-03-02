import { PrismaClient } from '@prisma/client'

// Initialize Prisma client
const prisma = new PrismaClient()

async function clearReviews() {
	try {
		console.log('Clearing all reviews from the database...')

		// Delete all review stats
		const deletedStats = await prisma.reviewStats.deleteMany({})
		console.log(`Deleted ${deletedStats.count} review stats records`)

		// Delete all reviews
		const deletedReviews = await prisma.googleReview.deleteMany({})
		console.log(`Deleted ${deletedReviews.count} reviews`)

		console.log('Database clean up complete')
	} catch (error) {
		console.error('Error clearing reviews:', error)
	} finally {
		await prisma.$disconnect()
	}
}

// Run the function
clearReviews()
	.then(() => {
		console.log('Clean up complete!')
		process.exit(0)
	})
	.catch(error => {
		console.error('Error in clean up script:', error)
		process.exit(1)
	})
