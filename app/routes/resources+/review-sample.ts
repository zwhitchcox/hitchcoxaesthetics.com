/**
 * Fresh, never-repeated sample reviews for the microsite review-QR pages.
 * GET /resources/review-sample?brand=weight-loss-knox&count=3
 *
 * Every returned text is AI-generated per request and checked against the
 * served-samples ledger (takeUniqueSamples), so no two visitors can ever copy
 * the same sample, duplicate review text gets listings flagged by Google.
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
	// The served-samples ledger writes to SQLite, only the primary can.
	await ensurePrimary()
	const url = new URL(request.url)
	const brandId = url.searchParams.get('brand')
	const count = Math.min(3, Math.max(1, Number(url.searchParams.get('count') ?? 3)))
	if (!isBrandId(brandId) || !(brandId in BRAND_SAMPLE_PROFILES)) {
		return json({ error: 'unknown brand' }, { status: 400, headers: corsHeaders(request) })
	}
	const profile = BRAND_SAMPLE_PROFILES[brandId]!
	// Neutral-service override: when the review flow routes a customer to a
	// sibling brand's listing (weight-loss clients seeding Botox Knox,
	// 2026-08-05), the sample stays completely treatment-agnostic — no
	// weight-loss mention (Zane: keeps BK's review content on-brand) and no
	// invented treatment either. True generic experience only: staff, care,
	// atmosphere, results in general terms.
	const SERVICE_HINTS: Record<string, { service: string; keywords: string[] }> = {
		'weight-loss': {
			service:
				'a visit to this med spa (IMPORTANT: do not name or imply any specific treatment, procedure, or program — write only about the staff, the care, the atmosphere, and being happy with results in general terms; DO mention the business by its full name)',
			keywords: ['Botox Knox Med Spa', 'med spa in Knoxville'],
		},
		laser: {
			service: 'a laser treatment at this med spa',
			keywords: ['med spa in Knoxville', 'laser treatment in Knoxville'],
		},
	}
	const serviceHint = SERVICE_HINTS[url.searchParams.get('svc') ?? '']

	const brand = BRANDS[brandId]

	// Generate a couple extra so ledger collisions still fill the request.
	const attempts = count + 2
	const generated = await Promise.all(
		Array.from({ length: attempts }, (_, i) =>
			generateBrandSampleReview({
				businessName: brand.businessName,
				service: serviceHint?.service ?? profile.services[i % profile.services.length]!,
				keywords: serviceHint?.keywords ?? profile.keywords,
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
