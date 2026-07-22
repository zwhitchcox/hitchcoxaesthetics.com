/**
 * Typed access to the CANONICAL location config (app/config/locations.json).
 * Every per-location fact, NAP, GBP ids, tracking numbers, BrightLocal ids -
 * lives in that one file; edit it there, never here. This module derives the
 * shapes the app consumes and the URL schemes shared with the scripts.
 */
import config from '#app/config/locations.json'

export const BRAND = config.brand
export const SITE_ORIGIN = config.siteOrigin
export const GBP_CATEGORIES = config.gbpCategories

export const locations = config.locations.map(loc => ({
	...loc,
	/** Full street address (line1 + suite), matching the GBP exactly. */
	address: [loc.address.line1, loc.address.line2].filter(Boolean).join(' '),
	addressParts: loc.address,
	city: loc.address.city,
	state: loc.address.state,
	zip: loc.address.zip,
	/** Real NAP line, shown on the site; CallRail swaps it dynamically. */
	phone: loc.phones.real,
	phoneRaw: loc.phones.realRaw,
	lat: loc.geo.lat,
	lng: loc.geo.lng,
}))

export type Location = (typeof locations)[number]

/** Public locations, shown in nav, footer, and the contact page (ghosts excluded). */
export const publicLocations = locations.filter(location => !location.ghost)

/** Phone number, CallRail will swap this dynamically for tracking */
export const PHONE = '(865) 489-8008'
export const PHONE_RAW = '8654898008'

export function getLocationById(id: string): Location | undefined {
	return locations.find(location => location.id === id)
}

export function formatAddress(location: Location): string {
	return `${location.address}, ${location.city}, ${location.state} ${location.zip}`
}

/** Canonical Google Maps URL for the listing, used as JSON-LD sameAs/hasMap. */
export function mapsUrl(location: Location): string {
	return `https://maps.google.com/maps?cid=${location.gbp.mapsCid}`
}

/** The GBP website link: location page + utm_campaign=gmb + utm_content=<id>. */
export function gbpWebsiteUrl(location: Location): string {
	const url = new URL(`${SITE_ORIGIN}/${location.id}`)
	url.searchParams.set('utm_campaign', 'gmb')
	url.searchParams.set('utm_content', location.id)
	return url.toString()
}

/** The citation website link: location page + utm_campaign=citation + utm_content=<id>. */
export function citationWebsiteUrl(location: Location): string {
	const url = new URL(`${SITE_ORIGIN}/${location.id}`)
	url.searchParams.set('utm_campaign', 'citation')
	url.searchParams.set('utm_content', location.id)
	return url.toString()
}
