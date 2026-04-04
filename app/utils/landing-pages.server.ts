import fs from 'node:fs/promises'
import path from 'node:path'

import { getBookingPath } from '#app/utils/booking.ts'

const OLD_BOOKING_URL =
	'https://www.joinblvd.com/b/sarahhitchcox/widget#/locations'

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function loadStaticLandingPage(options: {
	relativeHtmlPath: string
	serviceSlug: string
}) {
	const htmlPath = path.join(process.cwd(), options.relativeHtmlPath)
	const bookingPath = getBookingPath({ serviceSlug: options.serviceSlug })
	const html = await fs.readFile(htmlPath, 'utf8')

	return html
		.replaceAll(OLD_BOOKING_URL, bookingPath)
		.replace(
			new RegExp(
				`href="${escapeRegExp(bookingPath)}"([^>]*?) target="_blank" rel="noopener"`,
				'g',
			),
			`href="${bookingPath}"$1`,
		)
}
