export type PublicPricingKey =
	| 'botox'
	| 'filler'
	| 'kybella'
	| 'lipFlip'
	| 'lipoB12'
	| 'semaglutide'
	| 'tirzepatide'
	| 'weightLoss'

export type PublicPricingEntry = {
	display: string
	spoken: string
}

export type BlvdPricingEntry = {
	display: string
}

export type BlvdPriceRange = {
	max: number
	min: number
	variable: boolean
}

export const PUBLIC_SERVICE_PRICING: Record<
	PublicPricingKey,
	PublicPricingEntry
> = {
	botox: {
		display: '$13/unit',
		spoken:
			'Botox starts at $13 per unit. New clients start with a free consultation.',
	},
	filler: {
		display: 'Filler starts at $450+',
		spoken: 'Filler starts at $450 and varies by treatment area and product.',
	},
	kybella: {
		display: '$600/vial',
		spoken: 'Kybella is $600 per vial.',
	},
	lipFlip: {
		display: '$129',
		spoken: 'A lip flip is $129.',
	},
	lipoB12: {
		display: '$25/shot',
		spoken: 'Lipo B12 injections are $25 per shot.',
	},
	semaglutide: {
		display: 'Starting at $150/month',
		spoken: 'Semaglutide weight loss programs start at $150 per month.',
	},
	tirzepatide: {
		display: 'Starting at $250/month',
		spoken: 'Tirzepatide weight loss programs start at $250 per month.',
	},
	weightLoss: {
		display: 'Programs start at $150/month',
		spoken:
			'Medical weight loss programs start at $150 per month, with free consultations available.',
	},
}

export const PROJECTED_CUSTOMER_VALUE_USD: Record<PublicPricingKey, number> = {
	botox: 600,
	filler: 750,
	kybella: 800,
	lipFlip: 150,
	lipoB12: 0,
	semaglutide: 600,
	tirzepatide: 600,
	weightLoss: 600,
}

export const BLVD_SERVICE_PRICING: Record<string, BlvdPricingEntry> = {
	'Consultation: Skincare/Injectables': {
		display: 'Free Consultation',
	},
	'Dermaplane Facial': {
		display: 'Free Consultation · $100/treatment',
	},
	'Existing Client Filler': {
		display: PUBLIC_SERVICE_PRICING.filler.display,
	},
	'Existing Client Microneedling': {
		display: '$375/treatment or $950 for 3',
	},
	'Existing Client SkinVive': {
		display: 'Price starts at $650/treatment',
	},
	'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)': {
		display: `Tox pricing starts at ${PUBLIC_SERVICE_PRICING.botox.display}`,
	},
	'Existing Client Tox & Filler': {
		display: `Tox starts at ${PUBLIC_SERVICE_PRICING.botox.display} + ${PUBLIC_SERVICE_PRICING.filler.display.toLowerCase()}`,
	},
	'Hair Restoration I PDGF Injection': {
		display: 'Free Consultation · Starts at $399/session',
	},
	'Hylenex® - Filler Dissolve': {
		display: 'Free Consultation · $200/vial',
	},
	'KYBELLA®': {
		display: PUBLIC_SERVICE_PRICING.kybella.display,
	},
	'KYBELLA® - New Patient': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.kybella.display}`,
	},
	'Lab Draw': {
		display: 'Lab pricing varies',
	},
	'Laser Hair Reduction - Large Area': {
		display: 'Free Consultation · $899/6 sessions',
	},
	'Laser Hair Reduction - Medium Area': {
		display: 'Free Consultation · $799/6 sessions',
	},
	'Laser Hair Reduction - Small Area': {
		display: 'Free Consultation · $499/6 sessions',
	},
	'Lip Flip': {
		display: PUBLIC_SERVICE_PRICING.lipFlip.display,
	},
	'Lipotropic B12 Injection': {
		display: PUBLIC_SERVICE_PRICING.lipoB12.display,
	},
	'Microneedling w/ PDGF': {
		display: 'Free Consultation · Starts at $699/session',
	},
	'Microneedling w/ PRP': {
		display: 'Free Consultation · $599/treatment or $1,550 for 3',
	},
	'New Client Filler': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.filler.display}`,
	},
	'New Client Microneedling': {
		display: 'Free Consultation · $375/treatment or $950 for 3',
	},
	'New Client SkinVive': {
		display: 'Free Consultation · Price starts at $650/treatment',
	},
	'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)': {
		display: `Free Consultation · Tox pricing starts at ${PUBLIC_SERVICE_PRICING.botox.display}`,
	},
	'New Client Tox & Filler': {
		display: `Free Consultation · Tox starts at ${PUBLIC_SERVICE_PRICING.botox.display} + ${PUBLIC_SERVICE_PRICING.filler.display.toLowerCase()}`,
	},
	'Pigmented Lesion Reduction (Brown/Sun Spots)': {
		display: 'Free Consultation · $250/treatment or $650/3 sessions',
	},
	'PRP - Injectables': {
		display: '$800/treatment',
	},
	'Skin Revitalization': {
		display: 'Free Consultation · $400/treatment or $1,000/3 sessions',
	},
	'Touch Up Laser Treatment - Large Area': {
		display: '$69 touch-up',
	},
	'Touch Up Laser Treatment - Medium Area': {
		display: '$59 touch-up',
	},
	'Touch Up Laser Treatment - Small Area': {
		display: '$49 touch-up',
	},
	'Tox/Filler Follow-Up': {
		display: 'Follow-up visit',
	},
	'Vascular Lesion Reduction': {
		display: 'Free Consultation · $300/treatment or $800/3 sessions',
	},
	'VI Peel - Advanced': {
		display: 'Free Consultation · $319 / $95',
	},
	'VI Peel - Original': {
		display: 'Free Consultation · $279 / $65',
	},
	'VI Peel - Precision Plus with Peptides': {
		display: 'Free Consultation · $339 / $95',
	},
	'Weight Loss Consultation': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.weightLoss.display}`,
	},
	'Weight Loss Consultation (In-Person)': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.weightLoss.display}`,
	},
	'Weight Loss Injection': {
		display: PUBLIC_SERVICE_PRICING.weightLoss.display,
	},
	'Weight Loss Injection (In Person)': {
		display: PUBLIC_SERVICE_PRICING.weightLoss.display,
	},
}

export const BLVD_PROJECTED_REVENUE_USD: Record<string, number> = {
	'Consultation: Skincare/Injectables': 500,
	'Dermaplane Facial': 100,
	'Existing Client Filler': 0,
	'Existing Client Microneedling': 0,
	'Existing Client SkinVive': 0,
	'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)': 0,
	'Existing Client Tox & Filler': 0,
	'Hair Restoration I PDGF Injection': 600,
	'Hylenex® - Filler Dissolve': 200,
	'KYBELLA®': 0,
	'KYBELLA® - New Patient': 800,
	'Lab Draw': 0,
	'Laser Hair Reduction - Large Area': 900,
	'Laser Hair Reduction - Medium Area': 800,
	'Laser Hair Reduction - Small Area': 600,
	'Lip Flip': 150,
	'Lipotropic B12 Injection': 0,
	'Microneedling w/ PDGF': 600,
	'Microneedling w/ PRP': 600,
	'New Client Filler': 900,
	'New Client Microneedling': 600,
	'New Client SkinVive': 450,
	'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)': 600,
	'New Client Tox & Filler': 1500,
	'Pigmented Lesion Reduction (Brown/Sun Spots)': 250,
	'PRP - Injectables': 800,
	'Skin Revitalization': 250,
	'Touch Up Laser Treatment - Large Area': 0,
	'Touch Up Laser Treatment - Medium Area': 0,
	'Touch Up Laser Treatment - Small Area': 0,
	'Tox/Filler Follow-Up': 0,
	'Vascular Lesion Reduction': 300,
	'VI Peel - Advanced': 319,
	'VI Peel - Original': 279,
	'VI Peel - Precision Plus with Peptides': 339,
	'Weight Loss Consultation': PROJECTED_CUSTOMER_VALUE_USD.weightLoss,
	'Weight Loss Consultation (In-Person)':
		PROJECTED_CUSTOMER_VALUE_USD.weightLoss,
	'Weight Loss Injection': 0,
	'Weight Loss Injection (In Person)': 0,
}

export function getBlvdBookingPriceDisplay({
	serviceName,
}: {
	serviceName: string
}) {
	const configured = BLVD_SERVICE_PRICING[serviceName]
	if (configured) {
		return {
			display: configured.display,
			missing: false,
		}
	}

	return {
		display: 'Free Consultation',
		missing: true,
	}
}

export function getProjectedRevenueForBlvdService(serviceName: string): number {
	const configured = BLVD_PROJECTED_REVENUE_USD[serviceName]
	if (configured != null) return configured

	const lower = serviceName.toLowerCase()

	if (
		lower.includes('existing') ||
		lower.includes('follow-up') ||
		lower.includes('touch up') ||
		lower.includes('injection') ||
		lower.includes('lab draw')
	) {
		return 0
	}

	if (lower.includes('weight loss consultation')) {
		return PROJECTED_CUSTOMER_VALUE_USD.weightLoss
	}
	if (lower.includes('consultation')) return 500

	if (lower.includes('new client')) {
		if (lower.includes('filler')) return 1500
		if (lower.includes('tox')) return PROJECTED_CUSTOMER_VALUE_USD.botox
		return 600
	}

	if (lower.includes('botox') || lower.includes('tox')) {
		return PROJECTED_CUSTOMER_VALUE_USD.botox / 2
	}
	if (lower.includes('filler')) return PROJECTED_CUSTOMER_VALUE_USD.filler
	if (lower.includes('laser')) return 300
	if (lower.includes('weight')) return PROJECTED_CUSTOMER_VALUE_USD.weightLoss
	if (lower.includes('facial')) return 150
	if (lower.includes('peel')) return 250

	return 150
}

export function getMissingBlvdBookingPriceServiceNames(serviceNames: string[]) {
	return [
		...new Set(serviceNames.filter(name => !(name in BLVD_SERVICE_PRICING))),
	].sort((a, b) => a.localeCompare(b))
}

export function getRetellPricingSummary({
	serviceFocus = 'all',
}: {
	serviceFocus?: 'all' | 'botox' | 'weight-loss'
} = {}) {
	const core =
		serviceFocus === 'botox'
			? [PUBLIC_SERVICE_PRICING.botox, PUBLIC_SERVICE_PRICING.lipFlip]
			: serviceFocus === 'weight-loss'
				? [
						PUBLIC_SERVICE_PRICING.semaglutide,
						PUBLIC_SERVICE_PRICING.tirzepatide,
						PUBLIC_SERVICE_PRICING.lipoB12,
					]
				: [
						PUBLIC_SERVICE_PRICING.botox,
						PUBLIC_SERVICE_PRICING.filler,
						PUBLIC_SERVICE_PRICING.lipFlip,
						PUBLIC_SERVICE_PRICING.semaglutide,
						PUBLIC_SERVICE_PRICING.tirzepatide,
						PUBLIC_SERVICE_PRICING.lipoB12,
					]

	return core.map(entry => entry.spoken).join(' ')
}
