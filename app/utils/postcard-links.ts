/**
 * Short links printed as QR codes on mailed postcards (/m/<code>). Each code
 * is one postcard version. The link adds UTM tags, so a booking from that
 * version is saved with utm_campaign and utm_content in its attribution touch
 * and shows in Revenue by source as "Postcard · <content>".
 */
export const POSTCARD_LINKS: Record<
	string,
	{ path: string; campaign: string; content: string }
> = {
	'wl-jeans': {
		path: '/weight-loss',
		campaign: 'eddm-weight-loss-2026-11',
		content: 'jeans',
	},
	'wl-noise': {
		path: '/weight-loss',
		campaign: 'eddm-weight-loss-2026-11',
		content: 'food-noise',
	},
	'wl-note': {
		path: '/weight-loss',
		campaign: 'eddm-weight-loss-2026-11',
		content: 'sticky-note',
	},
}

/** Where a postcard code sends the visitor, or null for an unknown code. */
export function postcardRedirectUrl(code: string) {
	const link = POSTCARD_LINKS[code]
	if (!link) return null
	const params = new URLSearchParams({
		utm_source: 'postcard',
		utm_medium: 'mail',
		utm_campaign: link.campaign,
		utm_content: link.content,
	})
	return `${link.path}?${params}`
}
