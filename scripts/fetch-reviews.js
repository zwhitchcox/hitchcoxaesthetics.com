// Compiled from fetch-reviews.ts
import * as fs from 'fs'
import { writeFile } from 'fs/promises'
import * as path from 'path'
import dotenv from 'dotenv'
import { google } from 'googleapis'

// Load environment variables
dotenv.config()

// Make sure reviews directory exists
const reviewsDir = path.join(process.cwd(), 'reviews')
if (!fs.existsSync(reviewsDir)) {
	fs.mkdirSync(reviewsDir, { recursive: true })
}

async function main() {
	const accounts = await getAccounts()
	for (const account of accounts) {
		const locations = await getLocations(account.name)
		for (const location of locations) {
			if (!location.title?.includes('Hitchcox Aesthetics')) {
				continue
			}
			const reviews = await fetchReviews(account.name, location.name)
			console.log(`Found ${reviews.length} reviews`)

			const today = new Date().toISOString().split('T')[0]
			const filename = path.join(
				reviewsDir,
				`${location.name.replace(/\//g, '-')}-${today}.json`,
			)

			await writeFile(filename, JSON.stringify(reviews, null, 2))
			console.log(`Saved reviews to ${filename}`)
		}
	}
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
