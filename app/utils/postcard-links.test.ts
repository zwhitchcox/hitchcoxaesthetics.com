import { expect, test } from 'vitest'
import { inferTrafficAttribution } from '#app/utils/booking-analytics.ts'
import { postcardRedirectUrl } from '#app/utils/postcard-links.ts'
import { getSourceLabel } from '#app/utils/revenue-by-source.server.ts'

test('a postcard code sends the visitor to its page with the postcard tags', () => {
	expect(postcardRedirectUrl('wl-jeans')).toBe(
		'/weight-loss?utm_source=postcard&utm_medium=mail&utm_campaign=eddm-weight-loss-2026-11&utm_content=jeans',
	)
	expect(postcardRedirectUrl('wl-noise')).toContain('utm_content=food-noise')
	expect(postcardRedirectUrl('wl-news')).toBe(
		'/weight-loss?utm_source=postcard&utm_medium=mail&utm_campaign=eddm-weight-loss-2026-11&utm_content=newspaper',
	)
	expect(postcardRedirectUrl('wl-weekly')).toContain(
		'utm_content=knoxville-weekly',
	)
	expect(postcardRedirectUrl('bx-relax')).toBe(
		'/botox?utm_source=postcard&utm_medium=mail&utm_campaign=eddm-botox-2026-11&utm_content=relax-1950s',
	)
	expect(postcardRedirectUrl('nope')).toBeNull()
})

test('a visit from a postcard link is the direct_mail channel, not direct', () => {
	// A camera-app QR scan has no referrer.
	expect(
		inferTrafficAttribution({
			fbclid: null,
			gbraid: null,
			gclid: null,
			initialReferrer: null,
			initialReferringDomain: null,
			msclkid: null,
			utm_campaign: 'eddm-weight-loss-2026-11',
			utm_medium: 'mail',
			utm_source: 'postcard',
			wbraid: null,
		}),
	).toEqual({
		channel: 'direct_mail',
		detail: 'postcard_mail',
		platform: 'mail',
	})
})

test('email stays email; only the mail medium is a postcard', () => {
	expect(
		inferTrafficAttribution({
			fbclid: null,
			gbraid: null,
			gclid: null,
			initialReferrer: null,
			initialReferringDomain: null,
			msclkid: null,
			utm_campaign: 'newsletter',
			utm_medium: 'email',
			utm_source: 'mailchimp',
			wbraid: null,
		}).channel,
	).toBe('email')
})

test('revenue by source names each postcard version', () => {
	expect(
		getSourceLabel({ trafficChannel: 'direct_mail', utmContent: 'jeans' }),
	).toBe('Postcard · jeans')
	expect(
		getSourceLabel({ trafficChannel: 'direct_mail', utmContent: null }),
	).toBe('Postcard')
})
