// Compiled from fetch-reviews.ts
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { google } from 'googleapis'

// Initialize Prisma client
const prisma = new PrismaClient()

// Load environment variables
dotenv.config()

// Keep the reviews directory for backwards compatibility
const reviewsDir = path.join(process.cwd(), 'reviews')
if (!fs.existsSync(reviewsDir)) {
	fs.mkdirSync(reviewsDir, { recursive: true })
}

async function main() {
	try {
		const accounts = await getAccounts()
		for (const account of accounts) {
			const locations = await getLocations(account.name)
			for (const location of locations) {
				if (!location.title?.includes('Hitchcox Aesthetics')) {
					continue
				}

				// Ensure the Google location exists in the database
				let dbLocation = await prisma.googleLocation.findUnique({
					where: { id: location.name },
				})

				if (!dbLocation) {
					dbLocation = await prisma.googleLocation.create({
						data: {
							id: location.name,
							name: location.title,
							formattedAddress: location.storefrontAddress?.formattedAddress,
							city: location.storefrontAddress?.locality,
							state: location.storefrontAddress?.administrativeArea,
							zip: location.storefrontAddress?.postalCode,
							url: location.metadata?.mapsUri || '',
							json: JSON.stringify(location),
						},
					})
				}

				// Fetch reviews from Google API
				const reviews = await fetchReviews(account.name, location.name)
				console.log(`Found ${reviews.length} reviews`)

				// Save to database with transaction
				await saveReviewsToDatabase(reviews, location.name)

				// Also save to JSON for backup (could be removed later)
				const today = new Date().toISOString().split('T')[0]
				const filename = path.join(
					reviewsDir,
					`${location.name.replace(/\//g, '-')}-${today}.json`,
				)
				fs.writeFileSync(filename, JSON.stringify(reviews, null, 2))
				console.log(`Saved reviews to database and JSON backup at ${filename}`)
			}
		}
	} finally {
		// Make sure to disconnect Prisma client
		await prisma.$disconnect()
	}
}

// Save reviews to database and update stats
async function saveReviewsToDatabase(reviews, locationId) {
	// Use a transaction to ensure data consistency
	await prisma.$transaction(async tx => {
		// Process and save each review
		for (const review of reviews) {
			const reviewData = {
				id: review.name,
				reviewId: review.reviewId,
				starRating: review.starRating || 'FIVE', // Default to five if missing
				comment: review.comment || '',
				createTime: new Date(review.createTime),
				updateTime: new Date(review.updateTime),
				profilePhotoUrl: review.reviewer?.profilePhotoUrl || null,
				reviewerName: review.reviewer?.displayName || 'Anonymous',
				locationId: locationId,
				hasReply: !!review.reviewReply,
				replyComment: review.reviewReply?.comment || null,
				replyTime: review.reviewReply?.updateTime
					? new Date(review.reviewReply.updateTime)
					: null,
			}

			// Upsert the review (create if new, update if exists)
			await tx.googleReview.upsert({
				where: { reviewId: review.reviewId },
				create: reviewData,
				update: reviewData,
			})
		}

		// Calculate and update stats
		await updateReviewStats(tx, locationId)
	})
}

// Calculate and update review statistics
async function updateReviewStats(tx, locationId) {
	// Get all reviews for this location
	const reviews = await tx.googleReview.findMany({
		where: { locationId },
	})

	// Calculate stats
	const totalReviews = reviews.length
	let ratingSum = 0
	const ratingDistribution = {
		ONE: 0,
		TWO: 0,
		THREE: 0,
		FOUR: 0,
		FIVE: 0,
	}

	let repliedCount = 0
	let unrepliedCount = 0

	// Monthly data
	const monthlyReviews = {}

	for (const review of reviews) {
		// Count by rating
		ratingDistribution[review.starRating] =
			(ratingDistribution[review.starRating] || 0) + 1

		// Count replies
		if (review.hasReply) {
			repliedCount++
		} else {
			unrepliedCount++
		}

		// Add to rating sum (convert string ratings to numbers)
		const numericRating = convertRatingToNumber(review.starRating)
		ratingSum += numericRating

		// Group by month
		const reviewDate = review.createTime
		const monthKey = `${reviewDate.getFullYear()}-${String(reviewDate.getMonth() + 1).padStart(2, '0')}`

		if (!monthlyReviews[monthKey]) {
			monthlyReviews[monthKey] = {
				count: 0,
				avgRating: 0,
				ratingSum: 0,
			}
		}

		monthlyReviews[monthKey].count++
		monthlyReviews[monthKey].ratingSum += numericRating
		monthlyReviews[monthKey].avgRating =
			monthlyReviews[monthKey].ratingSum / monthlyReviews[monthKey].count
	}

	// Calculate average rating
	const averageRating = totalReviews > 0 ? ratingSum / totalReviews : 0

	// Clean up the monthly data for storage (remove the ratingSum property)
	for (const month in monthlyReviews) {
		delete monthlyReviews[month].ratingSum
	}

	// Upsert the stats
	await tx.reviewStats.upsert({
		where: { locationId },
		create: {
			locationId,
			totalReviews,
			averageRating,
			oneStarCount: ratingDistribution.ONE,
			twoStarCount: ratingDistribution.TWO,
			threeStarCount: ratingDistribution.THREE,
			fourStarCount: ratingDistribution.FOUR,
			fiveStarCount: ratingDistribution.FIVE,
			repliedCount,
			unrepliedCount,
			monthlyReviews: JSON.stringify(monthlyReviews),
			lastUpdated: new Date(),
		},
		update: {
			totalReviews,
			averageRating,
			oneStarCount: ratingDistribution.ONE,
			twoStarCount: ratingDistribution.TWO,
			threeStarCount: ratingDistribution.THREE,
			fourStarCount: ratingDistribution.FOUR,
			fiveStarCount: ratingDistribution.FIVE,
			repliedCount,
			unrepliedCount,
			monthlyReviews: JSON.stringify(monthlyReviews),
			lastUpdated: new Date(),
		},
	})
}

// Convert rating string to number
function convertRatingToNumber(rating) {
	switch (rating) {
		case 'ONE':
			return 1
		case 'TWO':
			return 2
		case 'THREE':
			return 3
		case 'FOUR':
			return 4
		case 'FIVE':
			return 5
		default:
			return 0
	}
}

// Keep the existing functions
async function getAccounts() {
	const client = await getGoogleAuthClient()
	const response = await google
		.mybusinessaccountmanagement({
			version: 'v1',
			auth: client,
		})
		.accounts.list()
	return response.data.accounts
}

async function getLocations(accountId) {
	const client = await getGoogleAuthClient()

	const business = google.mybusinessbusinessinformation({
		version: 'v1',
		auth: client,
	})
	var { data } = await business.accounts.locations.list({
		parent: accountId,
		readMask: [
			'latlng',
			'categories',
			'storefrontAddress',
			'languageCode',
			'name',
			'title',
			'storeCode',
			'phoneNumbers.primaryPhone',
			'metadata.newReviewUri',
			'metadata.placeId',
			'metadata.mapsUri',
			'websiteUri',
		].join(','),
	})
	return data.locations
}

async function fetchReviews(accountId, locationId) {
	const headers = await getGoogleAuthHeaders()
	let nextPageToken = ''
	const reviews = []
	do {
		// googleapis doesn't include this
		// https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
		const reviewsUrl = `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews?pageToken=${nextPageToken}`
		const response = await fetch(reviewsUrl, {
			headers,
		})
		if (!response.ok) {
			throw new Error(await response.text())
		}
		const data = await response.json()
		if (!data.reviews) {
			return []
		}
		reviews.push(...data.reviews)

		nextPageToken = data.nextPageToken
	} while (nextPageToken)
	reviews.reverse()
	return reviews
}

async function getGoogleAuthHeaders() {
	const client = await getGoogleAuthClient()
	const accessToken = await client.getAccessToken()
	return {
		Authorization: `Bearer ${accessToken.token}`,
	}
}

async function getGoogleAuthClient() {
	const client = new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID,
		process.env.GOOGLE_CLIENT_SECRET,
		process.env.GOOGLE_REDIRECT_URI,
	)
	await client.setCredentials({
		refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
	})
	return client
}

// Run the function directly when this script is executed
main()
	.then(() => {
		console.log('Reviews fetch completed successfully')
		process.exit(0)
	})
	.catch(error => {
		console.error('Error in reviews fetch:', error)
		process.exit(1)
	})
