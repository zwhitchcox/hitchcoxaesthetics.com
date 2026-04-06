export const BLVD_WIDGET_BASE_URL =
	'https://www.joinblvd.com/b/sarahhitchcox/widget'
export const BLVD_DEFAULT_HASH = '#/locations'
export const DEFAULT_BLVD_BOOKING_URL = `${BLVD_WIDGET_BASE_URL}${BLVD_DEFAULT_HASH}`

const BLVD_BOOKING_URL_PATTERN =
	/https:\/\/www\.joinblvd\.com\/b\/sarahhitchcox\/widget(?:\?[^"'`\s>]*)?(?:#\/locations)?/g

export function isBlvdBookingUrl(url: string) {
	return url.startsWith(BLVD_WIDGET_BASE_URL)
}

export function buildBlvdUrl(options?: {
	clientId?: null | string
	defaultHash?: string
	locationHash?: null | string
	sessionId?: null | string
}) {
	const url = new URL(BLVD_WIDGET_BASE_URL)

	if (options?.clientId) {
		url.searchParams.set('google_client_id', options.clientId)
	}

	if (options?.sessionId) {
		url.searchParams.set('google_session_id', options.sessionId)
	}

	url.hash = options?.locationHash ?? options?.defaultHash ?? BLVD_DEFAULT_HASH
	return url.toString()
}

export function replaceBlvdBookingUrls(html: string, blvdUrl: string) {
	return html.replace(BLVD_BOOKING_URL_PATTERN, blvdUrl)
}
