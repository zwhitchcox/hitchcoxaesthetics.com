import { writeFile } from 'fs/promises'
import { google } from 'googleapis'

async function main() {
	const accounts = await getAccounts()
	for (const account of accounts!) {
		const locations = await getLocations(account.name!)
		for (const location of locations!) {
			if (!location.title?.includes('Hitchcox Aesthetics')) {
				continue
			}
			const reviews = await fetchReviews(account.name!, location.name!)
			console.log(`Found ${reviews.length} reviews`)

			const today = new Date().toISOString().split('T')[0]
			const filename = `reviews/${location.name!.replace(/\//g, '-')}-${today}.json`

			await writeFile(filename, JSON.stringify(reviews, null, 2))
			console.log(`Saved reviews to ${filename}`)
		}
	}
}

main()

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

async function getLocations(accountId: string) {
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
export async function fetchReviews(accountId: string, locationId: string) {
	const headers = await getGoogleAuthHeaders()
	let nextPageToken = ''
	const reviews: any[] = []
	do {
		// googleapis doesn't include this
		// https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
		const reviewsUrl = `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews?pageToken=${nextPageToken}`
		const response: any = await fetch(reviewsUrl, {
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

export async function getGoogleAuthHeaders(): Promise<{
	Authorization: string
}> {
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
