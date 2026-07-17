/**
 * Canonical ad-ready slugs for bookable services. `/book?service=<slug>`
 * pre-selects the service so paid traffic skips the service list (the
 * history question still runs first — it decides which New/Existing variant
 * the slug resolves to).
 *
 * Slugs are DERIVED from Boulevard service names, so they track the catalog
 * with no hardcoded id list: strip the "New Client"/"Existing Client" variant
 * prefix and any trailing parenthetical, then kebab-case what's left. The
 * New/Existing variants of a service therefore share one slug ("tox",
 * "filler", "tox-filler", ...) and the client-history answer picks the
 * variant. scripts/print-booking-slugs.ts prints the live list for ads.
 */

export type BookingServiceVariant = 'new' | 'existing' | 'shared'

export function bookingServiceVariant(name: string): BookingServiceVariant {
	if (/^\s*new client\b/i.test(name)) return 'new'
	if (/^\s*existing client\b/i.test(name)) return 'existing'
	return 'shared'
}

/** "New Client Tox (Botox/Dysport/Jeuveau/Xeomin)" -> "Tox" */
export function bookingServiceConcept(name: string): string {
	return name
		.replace(/^\s*(new|existing) client\b[:\s-]*/i, '')
		.replace(/\([^)]*\)/g, ' ')
		.trim()
}

export function bookingServiceSlug(name: string): string {
	return bookingServiceConcept(name)
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

/**
 * Pick the concrete service a slug means for this client. Preference order
 * follows the history answer; falls back across variants so a slug with only
 * one variant still resolves.
 */
export function resolveServiceBySlug<T extends { item: { name: string } }>(
	services: T[],
	slug: string,
	clientHistory: 'new' | 'returning' | null,
): T | null {
	const wanted = slug.trim().toLowerCase()
	if (!wanted) return null
	const candidates = services.filter(
		s => bookingServiceSlug(s.item.name) === wanted,
	)
	if (candidates.length === 0) return null
	const byVariant = (v: BookingServiceVariant) =>
		candidates.find(s => bookingServiceVariant(s.item.name) === v) ?? null
	if (clientHistory === 'returning')
		return byVariant('existing') ?? byVariant('shared') ?? byVariant('new')
	return byVariant('new') ?? byVariant('shared') ?? byVariant('existing')
}
