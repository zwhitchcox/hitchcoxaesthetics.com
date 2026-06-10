const SITE_NAME = 'Sarah Hitchcox Aesthetics'
const SITE_URL = 'https://hitchcoxaesthetics.com'
const DEFAULT_OG_IMAGE = `${SITE_URL}/img/og-image.jpg`

/**
 * Builds a complete set of meta descriptors (title, description, Open Graph,
 * Twitter Card) for a page. In Remix v2 only the leaf-most route's `meta`
 * is used, so every route that exports `meta` must return the full set —
 * use this helper so social tags aren't silently dropped.
 */
export function getSocialMetas({
	title,
	description,
	pathname = '/',
	image = DEFAULT_OG_IMAGE,
	noIndex = false,
}: {
	title: string
	description: string
	/** pathname from the MetaFunction `location` arg */
	pathname?: string
	image?: string
	noIndex?: boolean
}) {
	const url = `${SITE_URL}${pathname}`
	return [
		{ title },
		{ name: 'description', content: description },
		...(noIndex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
		{ property: 'og:type', content: 'website' },
		{ property: 'og:site_name', content: SITE_NAME },
		{ property: 'og:title', content: title },
		{ property: 'og:description', content: description },
		{ property: 'og:url', content: url },
		{ property: 'og:image', content: image },
		{ property: 'og:image:width', content: '1200' },
		{ property: 'og:image:height', content: '630' },
		{ property: 'og:locale', content: 'en_US' },
		{ name: 'twitter:card', content: 'summary_large_image' },
		{ name: 'twitter:title', content: title },
		{ name: 'twitter:description', content: description },
		{ name: 'twitter:image', content: image },
	]
}
