/**
 * Fresh, never-repeated sample reviews for the microsite review-QR pages.
 * GET /resources/review-sample?brand=weight-loss-knox&count=3
 *
 * Every returned text is AI-generated per request and checked against the
 * served-samples ledger (takeUniqueSamples), so no two visitors can ever copy
 * the same sample — duplicate review text gets listings flagged by Google.
 * May return fewer than `count` (or zero) if generation fails; the pages
 * degrade to write-your-own guidance rather than showing a reused sample.
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { BRANDS, isBrandId } from '#app/config/brands.ts'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import {
	generateBrandSampleReview,
	takeUniqueSamples,
} from '#app/utils/review-link.server.ts'

const BRAND_SAMPLE_PROFILES: Record<
	string,
	{ services: string[]; keywords: string[] }
> = {
	'weight-loss-knox': {
		services: [
			'a semaglutide weight loss program',
			'a tirzepatide weight loss program',
			'a medical weight loss program with weekly injections',
		],
		keywords: [
			'weight loss clinic in Knoxville',
			'medical weight loss in Knoxville',
			'semaglutide in Knoxville',
			'tirzepatide in Knoxville',
		],
	},
	'botox-knox': {
		services: [
			'Botox',
			'a tox treatment (Botox/Dysport)',
			'lip filler',
			'dermal filler',
		],
		keywords: [
			'Botox in Knoxville',
			'med spa in Knoxville',
			'lip filler in Knoxville',
			'filler in Knoxville',
		],
	},
}

const ALLOWED_ORIGINS = new Set([
	'https://weightlossknoxvilletn.com',
	'https://www.weightlossknoxvilletn.com',
	'https://botoxknoxvilletn.com',
	'https://www.botoxknoxvilletn.com',
])

function corsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get('origin') ?? ''
	if (ALLOWED_ORIGINS.has(origin) || origin.startsWith('http://localhost')) {
		return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
	}
	return {}
}

export async function loader({ request }: LoaderFunctionArgs) {
	// The served-samples ledger writes to SQLite — only the primary can.
	await ensurePrimary()
	const url = new URL(request.url)
	const brandId = url.searchParams.get('brand')
	const count = Math.min(3, Math.max(1, Number(url.searchParams.get('count') ?? 3)))
	if (!isBrandId(brandId) || !(brandId in BRAND_SAMPLE_PROFILES)) {
		return json({ error: 'unknown brand' }, { status: 400, headers: corsHeaders(request) })
	}
	const profile = BRAND_SAMPLE_PROFILES[brandId]!
	const brand = BRANDS[brandId]

	// Generate a couple extra so ledger collisions still fill the request.
	const attempts = count + 2
	const generated = await Promise.all(
		Array.from({ length: attempts }, (_, i) =>
			generateBrandSampleReview({
				businessName: brand.businessName,
				service: profile.services[i % profile.services.length]!,
				keywords: profile.keywords,
			}),
		),
	)
	const samples = (await takeUniqueSamples(generated)).slice(0, count)

	return json(
		{ samples },
		{
			headers: {
				...corsHeaders(request),
				'Cache-Control': 'no-store', // every visitor gets fresh text
			},
		},
	)
}
