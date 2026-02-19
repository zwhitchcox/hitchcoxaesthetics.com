/**
 * Centralized pricing data for all services.
 *
 * Keyed by service slug. Each entry has a category title,
 * optional footnotes, and line items.
 *
 * Sub-service pages (e.g. botox/forehead-lines) inherit pricing
 * from their parent (e.g. botox) via getPricingForSlug().
 */

export type PricingLineItem = {
	name: string
	price: string
}

export type PricingCategory = {
	title: string
	items: PricingLineItem[]
	footnotes?: string[]
}

/** All pricing data, keyed by service slug */
export const pricingData: Record<string, PricingCategory[]> = {
	// ─── Injectables (category page shows everything) ─────────────
	injectables: [
		{
			title: 'Neurotoxins (Botox / Dysport / Jeuveau)',
			items: [
				{
					name: 'Tox (Botox, Dysport, or Jeuveau)',
					price: '$13/unit ($12/unit for new patients only)',
				},
				{ name: 'Lip Flip', price: '$129' },
			],
		},
		{
			title: 'Dermal Filler',
			items: [
				{
					name: 'Cheek / Chin / Jawline / Nasolabial Folds',
					price: '$750–$875/syringe',
				},
				{ name: 'Lips — Half Syringe', price: '$450–$500/syringe' },
				{ name: 'Lips — Full Syringe', price: '$700–$750/syringe' },
				{ name: 'Filler Dissolving (Hylenex)', price: '$200/vial' },
			],
			footnotes: ['Pricing varies by type of filler used.'],
		},
		{
			title: 'Other Injectables',
			items: [
				{ name: 'Kybella', price: '$600/vial' },
				{ name: 'SkinVive', price: '$325/syringe' },
				{ name: 'PRP Facial Balancing', price: '$800/treatment' },
			],
		},
	],

	// ─── Botox / Dysport / Jeuveau ───────────────────────────────
	botox: [
		{
			title: 'Botox Pricing',
			items: [
				{ name: 'Botox', price: '$13/unit ($12/unit for new patients only)' },
				{ name: 'Lip Flip', price: '$129' },
			],
		},
	],
	dysport: [
		{
			title: 'Dysport Pricing',
			items: [
				{ name: 'Dysport', price: '$13/unit ($12/unit for new patients only)' },
			],
		},
	],
	jeuveau: [
		{
			title: 'Jeuveau Pricing',
			items: [
				{ name: 'Jeuveau', price: '$13/unit ($12/unit for new patients only)' },
			],
		},
	],

	// ─── Filler ──────────────────────────────────────────────────
	filler: [
		{
			title: 'Dermal Filler Pricing',
			items: [
				{
					name: 'Cheek / Chin / Jawline / Nasolabial Folds',
					price: '$750–$875/syringe',
				},
				{ name: 'Lips — Half Syringe', price: '$450–$500/syringe' },
				{ name: 'Lips — Full Syringe', price: '$700–$750/syringe' },
				{ name: 'Filler Dissolving (Hylenex)', price: '$200/vial' },
			],
			footnotes: ['Pricing varies by type of filler used.'],
		},
	],
	'filler/lip-filler': [
		{
			title: 'Lip Filler Pricing',
			items: [
				{ name: 'Lips — Half Syringe', price: '$450–$500/syringe' },
				{ name: 'Lips — Full Syringe', price: '$700–$750/syringe' },
			],
			footnotes: ['Pricing varies by type of filler used.'],
		},
	],
	'filler/cheek-filler': [
		{
			title: 'Cheek Filler Pricing',
			items: [{ name: 'Cheek Filler', price: '$750–$875/syringe' }],
			footnotes: ['Pricing varies by type of filler used.'],
		},
	],
	'filler/chin-filler': [
		{
			title: 'Chin Filler Pricing',
			items: [{ name: 'Chin Filler', price: '$750–$875/syringe' }],
			footnotes: ['Pricing varies by type of filler used.'],
		},
	],
	'filler/jawline-filler': [
		{
			title: 'Jawline Filler Pricing',
			items: [{ name: 'Jawline Filler', price: '$750–$875/syringe' }],
			footnotes: ['Pricing varies by type of filler used.'],
		},
	],
	'filler/under-eye-filler': [
		{
			title: 'Under-Eye Filler Pricing',
			items: [{ name: 'Under-Eye Filler', price: '$750–$875/syringe' }],
			footnotes: ['Pricing varies by type of filler used.'],
		},
	],
	'filler/nasolabial-folds': [
		{
			title: 'Nasolabial Fold Filler Pricing',
			items: [{ name: 'Nasolabial Fold Filler', price: '$750–$875/syringe' }],
			footnotes: ['Pricing varies by type of filler used.'],
		},
	],

	// ─── Kybella ─────────────────────────────────────────────────
	kybella: [
		{
			title: 'Kybella Pricing',
			items: [{ name: 'Kybella', price: '$600/vial' }],
		},
	],

	// ─── SkinVive ────────────────────────────────────────────────
	skinvive: [
		{
			title: 'SkinVive Pricing',
			items: [{ name: 'SkinVive', price: '$325/syringe' }],
		},
	],

	// ─── Microneedling ───────────────────────────────────────────
	microneedling: [
		{
			title: 'Microneedling Pricing',
			items: [
				{
					name: 'Traditional Microneedling',
					price: '$375/treatment or $950 for package of 3',
				},
				{
					name: 'Microneedling with PRP',
					price: '$599/treatment or $1,550 for package of 3',
				},
			],
		},
	],
	'microneedling/face': [
		{
			title: 'Facial Microneedling Pricing',
			items: [
				{
					name: 'Traditional Microneedling',
					price: '$375/treatment or $950 for package of 3',
				},
				{
					name: 'Microneedling with PRP',
					price: '$599/treatment or $1,550 for package of 3',
				},
			],
		},
	],
	'microneedling/hair-loss': [
		{
			title: 'Microneedling for Hair Loss Pricing',
			items: [
				{
					name: 'Microneedling with PRP (Hair Restoration)',
					price: '$599/treatment or $1,550 for package of 3',
				},
			],
		},
	],

	// ─── Laser Services (category) ───────────────────────────────
	'laser-services': [
		{
			title: 'Everesse (RF Skin Tightening)',
			items: [
				{ name: 'Face', price: '$2,200/treatment or $3,300 for package of 2' },
				{ name: 'Neck', price: '$950/treatment or $1,425 for package of 2' },
				{ name: 'Eyes', price: '$750/treatment or $1,125 for package of 2' },
			],
		},
		{
			title: 'Laser Hair Reduction (6-Session Packages)',
			items: [
				{
					name: 'Small Area (Chin, Upper Lip, Sideburns, Hands, Feet, Areola, etc.)',
					price: '$599/package · Touch-up: $49',
				},
				{
					name: 'Medium Area (Bikini Line, Underarms, Full Face, Forearms, etc.)',
					price: '$799/package · Touch-up: $59',
				},
				{
					name: 'Large Area (Brazilian, Back, Abdomen, Chest, Legs, Full Arms)',
					price: '$899/package · Touch-up: $69',
				},
				{ name: 'Full Legs', price: '$2,500/package · Touch-up: $150' },
			],
			footnotes: [
				'All areas include 6 sessions per package.',
				'Package purchase required before touch-up treatments.',
			],
		},
		{
			title: 'Vascular Lesion Reduction',
			items: [
				{ name: 'Face', price: '$300/treatment or $800 for package of 3' },
				{ name: 'Legs', price: '$600/treatment or $1,200 for package of 3' },
			],
		},
		{
			title: 'Pigmented Lesion Reduction',
			items: [
				{
					name: 'Face or Hands (smaller areas)',
					price: '$250/treatment or $600 for package of 3',
				},
				{
					name: 'Chest or Back (larger areas)',
					price: '$550/treatment or $1,100 for package of 3',
				},
			],
		},
		{
			title: 'Skin Revitalization',
			items: [{ name: 'Consultation required', price: 'Contact for pricing' }],
		},
	],

	// ─── Everesse ────────────────────────────────────────────────
	everesse: [
		{
			title: 'Everesse RF Skin Tightening Pricing',
			items: [
				{ name: 'Face', price: '$2,200/treatment or $3,300 for package of 2' },
				{ name: 'Neck', price: '$950/treatment or $1,425 for package of 2' },
				{ name: 'Eyes', price: '$750/treatment or $1,125 for package of 2' },
			],
		},
	],
	'everesse/face': [
		{
			title: 'Everesse Face Treatment Pricing',
			items: [
				{
					name: 'Everesse Face',
					price: '$2,200/treatment or $3,300 for package of 2',
				},
			],
		},
	],
	'everesse/jawline': [
		{
			title: 'Everesse Jawline Treatment Pricing',
			items: [
				{
					name: 'Everesse Face (includes jawline)',
					price: '$2,200/treatment or $3,300 for package of 2',
				},
			],
		},
	],
	'everesse/neck': [
		{
			title: 'Everesse Neck Treatment Pricing',
			items: [
				{
					name: 'Everesse Neck',
					price: '$950/treatment or $1,425 for package of 2',
				},
			],
		},
	],

	// ─── Laser Hair Removal ──────────────────────────────────────
	'laser-hair-removal': [
		{
			title: 'Laser Hair Reduction Pricing (6-Session Packages)',
			items: [
				{
					name: 'Small Area (Chin, Upper Lip, Sideburns, Hands, Feet, Areola, etc.)',
					price: '$599/package · Touch-up: $49',
				},
				{
					name: 'Medium Area (Bikini Line, Underarms, Full Face, Forearms, etc.)',
					price: '$799/package · Touch-up: $59',
				},
				{
					name: 'Large Area (Brazilian, Back, Abdomen, Chest, Legs, Full Arms)',
					price: '$899/package · Touch-up: $69',
				},
				{ name: 'Full Legs', price: '$2,500/package · Touch-up: $150' },
			],
			footnotes: [
				'All areas include 6 sessions per package.',
				'Package purchase required before touch-up treatments.',
			],
		},
	],

	// ─── Vascular / Pigmented Lesion Reduction ───────────────────
	'vascular-lesion-reduction': [
		{
			title: 'Vascular Lesion Reduction Pricing',
			items: [
				{ name: 'Face', price: '$300/treatment or $800 for package of 3' },
				{ name: 'Legs', price: '$600/treatment or $1,200 for package of 3' },
			],
		},
	],
	'pigmented-lesion-reduction': [
		{
			title: 'Pigmented Lesion Reduction Pricing',
			items: [
				{
					name: 'Face or Hands (smaller areas)',
					price: '$250/treatment or $600 for package of 3',
				},
				{
					name: 'Chest or Back (larger areas)',
					price: '$550/treatment or $1,100 for package of 3',
				},
			],
		},
	],
	'skin-revitalization': [
		{
			title: 'Skin Revitalization Pricing',
			items: [{ name: 'Consultation required', price: 'Contact for pricing' }],
		},
	],

	// ─── Weight Loss ─────────────────────────────────────────────
	'weight-loss': [
		{
			title: 'Weight Loss & Wellness Pricing',
			items: [
				{ name: 'Semaglutide', price: 'Starting at $150/month' },
				{ name: 'Tirzepatide', price: 'Starting at $250/month' },
				{ name: 'Lipo/B12 Injections', price: '$25/shot' },
			],
		},
	],
	semaglutide: [
		{
			title: 'Semaglutide Pricing',
			items: [
				{ name: 'Semaglutide', price: 'Starting at $150/month' },
				{ name: 'Lipo/B12 Injections', price: '$25/shot' },
			],
		},
	],
	tirzepatide: [
		{
			title: 'Tirzepatide Pricing',
			items: [
				{ name: 'Tirzepatide', price: 'Starting at $250/month' },
				{ name: 'Lipo/B12 Injections', price: '$25/shot' },
			],
		},
	],
}

/**
 * Get pricing categories for a service slug.
 * Falls back to parent slug if no direct match.
 * E.g. "botox/forehead-lines" → tries "botox/forehead-lines", then "botox".
 */
export function getPricingForSlug(slug: string): PricingCategory[] | undefined {
	// Direct match
	if (pricingData[slug]) return pricingData[slug]

	// Try parent (strip last segment)
	if (slug.includes('/')) {
		const parent = slug.split('/').slice(0, -1).join('/')
		if (pricingData[parent]) return pricingData[parent]
	}

	return undefined
}
