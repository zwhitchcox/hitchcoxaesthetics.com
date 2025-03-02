// Compiled from fetch-reviews.ts

// Suppress the punycode deprecation warning
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { google } from 'googleapis'

process.removeAllListeners('warning')
const originalEmit = process.emit
process.emit = function (name, ...args) {
	if (
		name === 'warning' &&
		args[0] &&
		args[0].name === 'DeprecationWarning' &&
		args[0].message.includes('The `punycode` module is deprecated')
	) {
		return false
	}
	return originalEmit.apply(process, arguments)
}

// Load environment variables
dotenv.config()

// Initialize Prisma client
const prisma = new PrismaClient()

// Make sure reviews directory exists (keeping this for backup purposes)
const reviewsDir = path.join(process.cwd(), 'reviews')
if (!fs.existsSync(reviewsDir)) {
	fs.mkdirSync(reviewsDir, { recursive: true })
}

/**
 * Main function to fetch and store Google reviews
 */
async function main() {
	try {
		console.log('Starting Google reviews fetch process')

		// Normal execution - fetch reviews from Google API
		// Get accounts
		const accounts = await getAccounts()

		for (const account of accounts) {
			// Get locations for this account
			const locations = await getLocations(account.name)

			for (const location of locations) {
				// Skip locations that don't match our criteria
				if (!location.title?.includes('Hitchcox Aesthetics')) {
					continue
				}

				// Get reviews for this location
				console.log(`Fetching reviews for ${location.title}...`)
				const reviews = await fetchReviews(account.name, location.name)

				// Create or update the GoogleLocation in the database
				const googleLocation = await saveLocationToDB(location)

				// Save as JSON backup for reference (do this early so we have it for fixing)
				const today = new Date().toISOString().split('T')[0]
				const filename = path.join(
					reviewsDir,
					`${location.name.replace(/\//g, '-')}-${today}.json`,
				)
				fs.writeFileSync(filename, JSON.stringify(reviews, null, 2))

				// Save reviews to the database
				await saveReviewsToDB(reviews, googleLocation.id)

				// Update review statistics
				await updateReviewStats(googleLocation.id)

				// Verify the star ratings to debug the average calculation
				await verifyStarRatings(googleLocation.id)
			}
		}

		console.log('Google reviews fetch process completed')
	} catch (error) {
		console.error('Error in Google reviews fetch process:', error)
		throw error
	} finally {
		await prisma.$disconnect()
	}
}

// Save location to database, create if it doesn't exist
async function saveLocationToDB(location) {
	// Extract address components from the location data
	let formattedAddress = ''
	let city = ''
	let state = ''
	let country = ''

	if (location.storefrontAddress) {
		formattedAddress = [
			location.storefrontAddress.addressLines?.join(', '),
			location.storefrontAddress.locality,
			location.storefrontAddress.administrativeArea,
			location.storefrontAddress.postalCode,
			location.storefrontAddress.country,
		]
			.filter(Boolean)
			.join(', ')

		city = location.storefrontAddress.locality || ''
		state = location.storefrontAddress.administrativeArea || ''
		country = location.storefrontAddress.country || ''
	}

	// Get lat/lng if available
	const lat = location.latlng?.latitude || null
	const lng = location.latlng?.longitude || null

	// Save or update location in the database
	return await prisma.googleLocation.upsert({
		where: { id: location.name },
		update: {
			name: location.title || '',
			formattedAddress,
			city,
			state,
			country,
			lat,
			lng,
			url: location.metadata?.mapsUri || '',
			json: JSON.stringify(location),
			updatedAt: new Date(),
		},
		create: {
			id: location.name,
			name: location.title || '',
			formattedAddress,
			city,
			state,
			country,
			lat,
			lng,
			url: location.metadata?.mapsUri || '',
			json: JSON.stringify(location),
		},
	})
}

// Save reviews to the database
async function saveReviewsToDB(reviews, locationId) {
	console.log(
		`Saving ${reviews.length} reviews to database for location ${locationId}`,
	)

	// Process reviews one by one
	for (const review of reviews) {
		// Extract star rating from different possible Google API formats
		let starRating = null

		// Debug the star rating structure to help diagnose issues
		console.log(
			`Review ${review.name} star rating: ${JSON.stringify(review.starRating)}`,
		)

		if (review.starRating) {
			if (typeof review.starRating === 'number') {
				// Direct number
				starRating = convertStarRating(review.starRating)
			} else if (typeof review.starRating === 'object') {
				// Object with various possible structures
				if (review.starRating.count !== undefined) {
					starRating = convertStarRating(review.starRating.count)
				} else if (review.starRating.starRating !== undefined) {
					starRating = convertStarRating(review.starRating.starRating)
				} else if (review.starRating.rating !== undefined) {
					starRating = convertStarRating(review.starRating.rating)
				}
			} else if (typeof review.starRating === 'string') {
				// Direct string
				starRating = convertStarRating(review.starRating)
			}
		}

		// If we couldn't determine the star rating, default to FIVE
		if (!starRating) {
			console.warn(
				`Could not determine star rating for review ${review.name}, defaulting to FIVE`,
			)
			starRating = 'FIVE'
		}

		// Convert timestamps to Date objects
		const createTime = review.createTime
			? new Date(review.createTime)
			: new Date()
		const updateTime = review.updateTime
			? new Date(review.updateTime)
			: createTime

		// Check for reply data
		const hasReply = !!review.reviewReply
		const replyComment = review.reviewReply?.comment || null
		const replyTime = review.reviewReply?.updateTime
			? new Date(review.reviewReply.updateTime)
			: null

		try {
			// Save or update review in the database
			await prisma.googleReview.upsert({
				where: { reviewId: review.name },
				update: {
					starRating,
					comment: review.comment || null,
					updateTime,
					profilePhotoUrl: review.reviewer?.profilePhotoUrl || null,
					reviewerName: review.reviewer?.displayName || 'Anonymous',
					hasReply,
					replyComment,
					replyTime,
				},
				create: {
					id: review.name,
					reviewId: review.name,
					starRating,
					comment: review.comment || null,
					createTime,
					updateTime,
					profilePhotoUrl: review.reviewer?.profilePhotoUrl || null,
					reviewerName: review.reviewer?.displayName || 'Anonymous',
					hasReply,
					replyComment,
					replyTime,
					locationId,
				},
			})
		} catch (error) {
			console.error(`Error saving review ${review.name}:`, error)
		}
	}

	console.log(`Finished saving reviews to database for location ${locationId}`)
}

/**
 * Convert numeric star rating to string format required by the database
 */
function convertStarRating(rating) {
	// Handle string input by converting to number
	if (typeof rating === 'string') {
		// If already in the correct format, return it
		if (['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].includes(rating)) {
			return rating
		}

		// Try to convert string to number
		const numRating = parseInt(rating, 10)
		if (!isNaN(numRating)) {
			rating = numRating
		}
	}

	// Now handle numeric ratings
	if (typeof rating === 'number' || !isNaN(rating)) {
		const roundedRating = Math.round(Number(rating))
		switch (roundedRating) {
			case 1:
				return 'ONE'
			case 2:
				return 'TWO'
			case 3:
				return 'THREE'
			case 4:
				return 'FOUR'
			case 5:
				return 'FIVE'
			default:
				console.warn(`Invalid star rating value: ${rating}, defaulting to FIVE`)
				return 'FIVE' // Default to FIVE instead of THREE for invalid values
		}
	}

	// If we can't determine the rating, log a warning and default to FIVE
	// This is better than defaulting to THREE which skews the average
	console.warn(`Could not convert star rating: ${rating}, defaulting to FIVE`)
	return 'FIVE'
}

// Update review statistics for a location
async function updateReviewStats(locationId) {
	console.log(`Updating review statistics for location ${locationId}`)

	// Query for review data
	const reviews = await prisma.googleReview.findMany({
		where: { locationId },
	})

	// Calculate statistics
	const totalReviews = reviews.length

	// Count ratings by star count
	const oneStarCount = reviews.filter(r => r.starRating === 'ONE').length
	const twoStarCount = reviews.filter(r => r.starRating === 'TWO').length
	const threeStarCount = reviews.filter(r => r.starRating === 'THREE').length
	const fourStarCount = reviews.filter(r => r.starRating === 'FOUR').length
	const fiveStarCount = reviews.filter(r => r.starRating === 'FIVE').length

	// Calculate average rating
	const totalStars =
		oneStarCount * 1 +
		twoStarCount * 2 +
		threeStarCount * 3 +
		fourStarCount * 4 +
		fiveStarCount * 5
	const averageRating = totalReviews > 0 ? totalStars / totalReviews : 0

	// Count replied and unreplied
	const repliedCount = reviews.filter(r => r.hasReply).length
	const unrepliedCount = totalReviews - repliedCount

	// Calculate monthly statistics
	const monthlyData = calculateMonthlyStats(reviews)

	// Save or update review stats in the database
	await prisma.reviewStats.upsert({
		where: { locationId },
		update: {
			totalReviews,
			averageRating,
			oneStarCount,
			twoStarCount,
			threeStarCount,
			fourStarCount,
			fiveStarCount,
			repliedCount,
			unrepliedCount,
			monthlyReviews: JSON.stringify(monthlyData),
			lastUpdated: new Date(),
		},
		create: {
			locationId,
			totalReviews,
			averageRating,
			oneStarCount,
			twoStarCount,
			threeStarCount,
			fourStarCount,
			fiveStarCount,
			repliedCount,
			unrepliedCount,
			monthlyReviews: JSON.stringify(monthlyData),
			lastUpdated: new Date(),
		},
	})

	console.log(
		`Updated review stats: ${totalReviews} total reviews, ${averageRating.toFixed(1)} average rating`,
	)
}

// Calculate monthly review statistics
function calculateMonthlyStats(reviews) {
	const monthlyData = {}

	reviews.forEach(review => {
		const date = review.createTime
		const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

		if (!monthlyData[monthYear]) {
			monthlyData[monthYear] = {
				count: 0,
				average: 0,
				totalStars: 0,
				replied: 0,
			}
		}

		// Convert string rating to number
		let starValue = 3 // default
		switch (review.starRating) {
			case 'ONE':
				starValue = 1
				break
			case 'TWO':
				starValue = 2
				break
			case 'THREE':
				starValue = 3
				break
			case 'FOUR':
				starValue = 4
				break
			case 'FIVE':
				starValue = 5
				break
		}

		monthlyData[monthYear].count++
		monthlyData[monthYear].totalStars += starValue
		if (review.hasReply) {
			monthlyData[monthYear].replied++
		}

		// Recalculate average
		monthlyData[monthYear].average =
			monthlyData[monthYear].totalStars / monthlyData[monthYear].count
	})

	// Convert to array sorted by date
	return Object.keys(monthlyData)
		.sort()
		.map(month => ({
			month,
			...monthlyData[month],
		}))
}

// Verify the star ratings in the database
async function verifyStarRatings(locationId) {
	console.log(`\n--- STAR RATING VERIFICATION FOR ${locationId} ---`)

	// Get all reviews for this location
	const reviews = await prisma.googleReview.findMany({
		where: { locationId },
		select: {
			reviewId: true,
			starRating: true,
			comment: true,
		},
	})

	// Count by rating
	const counts = {
		ONE: 0,
		TWO: 0,
		THREE: 0,
		FOUR: 0,
		FIVE: 0,
		unknown: 0,
	}

	// Count reviews by rating
	reviews.forEach(review => {
		if (counts[review.starRating] !== undefined) {
			counts[review.starRating]++
		} else {
			counts.unknown++
			console.log(
				`Unknown rating: ${review.starRating} for review: ${review.reviewId}`,
			)
		}
	})

	// Calculate the correct average
	const totalStars =
		counts.ONE * 1 +
		counts.TWO * 2 +
		counts.THREE * 3 +
		counts.FOUR * 4 +
		counts.FIVE * 5

	const totalReviews = reviews.length
	const correctAverage = totalReviews > 0 ? totalStars / totalReviews : 0

	// Log the stats
	console.log('Rating counts:', counts)
	console.log(`Total reviews: ${totalReviews}`)
	console.log(`Calculated average rating: ${correctAverage.toFixed(2)}`)

	// Check that the stored stats match our calculation
	const stats = await prisma.reviewStats.findUnique({
		where: { locationId },
	})

	if (stats) {
		console.log(
			`\nStored average in database: ${stats.averageRating.toFixed(2)}`,
		)
		console.log(`Stored counts in database:
			ONE: ${stats.oneStarCount},
			TWO: ${stats.twoStarCount},
			THREE: ${stats.threeStarCount},
			FOUR: ${stats.fourStarCount},
			FIVE: ${stats.fiveStarCount}`)

		if (Math.abs(stats.averageRating - correctAverage) > 0.01) {
			console.log('WARNING: Calculated average differs from stored average!')
		}
	} else {
		console.log('No stats record found in database.')
	}

	console.log('--- END VERIFICATION ---\n')
}

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

// Add a new function to fix existing incorrect star ratings by examining the original JSON data

async function fixExistingReviews(locationId) {
	console.log(`\nFixing existing reviews for location ${locationId}...`)

	// Get the most recent backup file for this location
	const files = fs
		.readdirSync(reviewsDir)
		.filter(
			file =>
				file.startsWith(locationId.replace(/\//g, '-')) &&
				file.endsWith('.json'),
		)
		.sort()
		.reverse() // Sort newest first

	if (files.length === 0) {
		console.log('No backup files found, cannot fix existing reviews.')
		return
	}

	const latestFile = path.join(reviewsDir, files[0])
	console.log(`Using latest backup file: ${latestFile}`)

	// Read the JSON data
	const reviewsData = JSON.parse(fs.readFileSync(latestFile, 'utf8'))

	// Create a map of review ID to star rating
	const reviewRatings = {}
	let fixedCount = 0

	// Process each review in the JSON
	for (const review of reviewsData) {
		let starRating = 'FIVE' // Default to FIVE (5 stars) now

		// Handle different possible formats
		if (review.starRating) {
			if (typeof review.starRating === 'number') {
				starRating = convertStarRating(review.starRating)
			} else if (review.starRating.count) {
				starRating = convertStarRating(review.starRating.count)
			} else if (review.starRating.starRating) {
				starRating = convertStarRating(review.starRating.starRating)
			} else if (typeof review.starRating === 'string') {
				if (
					['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].includes(review.starRating)
				) {
					starRating = review.starRating
				} else {
					const numRating = parseInt(review.starRating, 10)
					if (!isNaN(numRating) && numRating >= 1 && numRating <= 5) {
						starRating = convertStarRating(numRating)
					}
				}
			}
		}

		// Store in our map
		reviewRatings[review.name] = starRating
	}

	// Find all reviews in the database for this location
	const dbReviews = await prisma.googleReview.findMany({
		where: { locationId },
		select: { reviewId: true, starRating: true },
	})

	// Update any reviews that have incorrect ratings
	for (const dbReview of dbReviews) {
		const correctRating = reviewRatings[dbReview.reviewId]

		if (correctRating && dbReview.starRating !== correctRating) {
			console.log(
				`Fixing review ${dbReview.reviewId}: ${dbReview.starRating} -> ${correctRating}`,
			)

			await prisma.googleReview.update({
				where: { reviewId: dbReview.reviewId },
				data: { starRating: correctRating },
			})

			fixedCount++
		}
	}

	console.log(
		`Fixed ${fixedCount} out of ${dbReviews.length} reviews in the database.`,
	)

	// If we fixed any reviews, update the statistics
	if (fixedCount > 0) {
		console.log('Updating review statistics after fixes...')
		await updateReviewStats(locationId)
	}
}

// Run the function directly when this script is executed
main()
	.then(() => {
		console.log('Reviews fetch and database update completed successfully')
		process.exit(0)
	})
	.catch(error => {
		console.error('Error in reviews fetch:', error)
		process.exit(1)
	})
