import {
	BRANDS,
	DEFAULT_BRAND_ID,
	isBrandId,
	type BrandId,
} from '#app/config/brands.ts'

/**
 * Which brand is this request for? Detection order:
 *  1. `X-Brand` header, set by the microsites' Caddy when they reverse-proxy
 *     /book to this app (survives Fly's edge untouched, unlike X-Forwarded-Host).
 *  2. Host / X-Forwarded-Host matching a brand domain.
 *  3. `?brand=` query param, preview/testing convenience.
 */
export function getBrandIdFromRequest(request: Request): BrandId {
	const headerBrand = request.headers.get('x-brand')
	if (isBrandId(headerBrand)) return headerBrand

	const host = (
		request.headers.get('x-forwarded-host') ??
		request.headers.get('host') ??
		''
	).toLowerCase()
	for (const brand of Object.values(BRANDS)) {
		if (brand.id === DEFAULT_BRAND_ID) continue
		if (host === brand.domain || host.endsWith(`.${brand.domain}`)) {
			return brand.id
		}
	}

	const queryBrand = new URL(request.url).searchParams.get('brand')
	if (isBrandId(queryBrand)) return queryBrand

	return DEFAULT_BRAND_ID
}
