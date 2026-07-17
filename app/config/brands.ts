/**
 * Brand configs for the shared booking engine. hitchcoxaesthetics.com serves
 * /book for every brand; the microsites reverse-proxy their /book here with an
 * `X-Brand` header, and the flow re-skins itself (name, meta, service scope)
 * from this config. Client-safe: no server imports, scope patterns are plain
 * strings so they survive the loader JSON boundary.
 */
export type BrandId = 'sha' | 'weight-loss-knox' | 'botox-knox'

export type BrandConfig = {
	id: BrandId
	/** Customer-facing business name (GBP title / site branding). */
	businessName: string
	/** Short name for tight UI spots. */
	shortName: string
	/** Apex domain the brand lives on (used for host detection + links). */
	domain: string
	homeUrl: string
	bookTitle: string
	bookDescription: string
	/**
	 * Case-insensitive regex source matched against each service's normalized
	 * searchText (category + names + description). null = show everything.
	 * If the scope matches nothing (catalog drift), the flow falls back to the
	 * full catalog rather than rendering an empty booking page.
	 */
	serviceScopePattern: string | null
}

export const DEFAULT_BRAND_ID: BrandId = 'sha'

export const BRANDS: Record<BrandId, BrandConfig> = {
	sha: {
		id: 'sha',
		businessName: 'Sarah Hitchcox Aesthetics',
		shortName: 'Sarah Hitchcox',
		domain: 'hitchcoxaesthetics.com',
		homeUrl: 'https://hitchcoxaesthetics.com',
		bookTitle: 'Book Online | Sarah Hitchcox Aesthetics',
		bookDescription:
			'Book your appointment online at Sarah Hitchcox Aesthetics in Knoxville or Farragut, TN. Botox, dermal fillers, laser treatments, and GLP-1 weight loss.',
		serviceScopePattern: null,
	},
	'weight-loss-knox': {
		id: 'weight-loss-knox',
		businessName: 'Knoxville Weight Loss Clinic',
		shortName: 'Knoxville Weight Loss',
		domain: 'weightlossknoxvilletn.com',
		homeUrl: 'https://weightlossknoxvilletn.com',
		bookTitle: 'Book Online | Knoxville Weight Loss Clinic',
		bookDescription:
			'Book your medical weight loss consultation online. Real-time availability for semaglutide and tirzepatide programs at our Bearden and Farragut locations.',
		serviceScopePattern: '\\b(weight ?loss|semaglutide|tirzepatide|glp|b12|lab draw)\\b',
	},
	'botox-knox': {
		id: 'botox-knox',
		// Matches the GBP title (renamed 2026-07-13 to pick up the med-spa
		// keyword); keep site/schema.org branding in sync with this.
		businessName: 'Botox Knox Med Spa',
		shortName: 'Botox Knox',
		domain: 'botoxknoxvilletn.com',
		homeUrl: 'https://botoxknoxvilletn.com',
		bookTitle: 'Book Online | Botox Knox',
		bookDescription:
			'Book your tox or filler appointment online. Real-time availability at our Bearden and Farragut Knoxville locations.',
		serviceScopePattern:
			'\\b(tox|botox|dysport|jeuveau|xeomin|lip flip|filler|skinvive|hylenex)\\b',
	},
}

export function isBrandId(value: unknown): value is BrandId {
	return typeof value === 'string' && value in BRANDS
}
