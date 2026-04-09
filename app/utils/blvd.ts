export const BLVD_WIDGET_BASE_URL = '/book'
export const BLVD_DEFAULT_HASH = ''
export const DEFAULT_BLVD_BOOKING_URL = '/book'

const BLVD_BOOKING_URL_PATTERN =
	/https:\/\/www\.joinblvd\.com\/b\/sarahhitchcox\/widget(?:\?[^"'`\s>]*)?(?:#\/locations)?/g

export function isBlvdBookingUrl(url: string) {
	return url.startsWith(BLVD_WIDGET_BASE_URL) || url.includes('joinblvd.com')
}

export function buildBlvdUrl() {
	return '/book'
}

export function replaceBlvdBookingUrls(
	html: string,
	blvdUrl: string = '/book',
) {
	return html.replace(BLVD_BOOKING_URL_PATTERN, blvdUrl)
}
