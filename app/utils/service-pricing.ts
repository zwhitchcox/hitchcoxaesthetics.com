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
	estimatedValueUsd: number
	spoken: string
}

export type BlvdPricingEntry = {
	display: string
	estimatedValueUsd: number
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
		estimatedValueUsd: 600,
		spoken:
			'Botox starts at $13 per unit. New clients start with a free consultation.',
	},
	filler: {
		display: 'Filler starts at $450+',
		estimatedValueUsd: 750,
		spoken: 'Filler starts at $450 and varies by treatment area and product.',
	},
	kybella: {
		display: '$600/vial',
		estimatedValueUsd: 800,
		spoken: 'Kybella is $600 per vial.',
	},
	lipFlip: {
		display: '$129',
		estimatedValueUsd: 150,
		spoken: 'A lip flip is $129.',
	},
	lipoB12: {
		display: '$25/shot',
		estimatedValueUsd: 0,
		spoken: 'Lipo B12 injections are $25 per shot.',
	},
	semaglutide: {
		display: 'Starting at $150/month',
		estimatedValueUsd: 600,
		spoken: 'Semaglutide weight loss programs start at $150 per month.',
	},
	tirzepatide: {
		display: 'Starting at $250/month',
		estimatedValueUsd: 600,
		spoken: 'Tirzepatide weight loss programs start at $250 per month.',
	},
	weightLoss: {
		display: 'Programs start at $150/month',
		estimatedValueUsd: 600,
		spoken:
			'Medical weight loss programs start at $150 per month, with free consultations available.',
	},
}

export const BLVD_SERVICE_PRICING: Record<string, BlvdPricingEntry> = {
	'Consultation: Skincare/Injectables': {
		display: 'Free Consultation',
		estimatedValueUsd: 500,
	},
	'Dermaplane Facial': {
		display: 'Free Consultation · $100/treatment',
		estimatedValueUsd: 100,
	},
	'Existing Client Filler': {
		display: PUBLIC_SERVICE_PRICING.filler.display,
		estimatedValueUsd: 0,
	},
	'Existing Client Microneedling': {
		display: '$375/treatment or $950 for 3',
		estimatedValueUsd: 0,
	},
	'Existing Client SkinVive': {
		display: 'Price starts at $650/treatment',
		estimatedValueUsd: 0,
	},
	'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)': {
		display: `Tox pricing starts at ${PUBLIC_SERVICE_PRICING.botox.display}`,
		estimatedValueUsd: 0,
	},
	'Existing Client Tox & Filler': {
		display: `Tox starts at ${PUBLIC_SERVICE_PRICING.botox.display} + ${PUBLIC_SERVICE_PRICING.filler.display.toLowerCase()}`,
		estimatedValueUsd: 0,
	},
	'Hair Restoration I PDGF Injection': {
		display: 'Free Consultation · Starts at $399/session',
		estimatedValueUsd: 600,
	},
	'Hylenex® - Filler Dissolve': {
		display: 'Free Consultation · $200/vial',
		estimatedValueUsd: 200,
	},
	'KYBELLA®': {
		display: PUBLIC_SERVICE_PRICING.kybella.display,
		estimatedValueUsd: 0,
	},
	'KYBELLA® - New Patient': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.kybella.display}`,
		estimatedValueUsd: 800,
	},
	'Lab Draw': {
		display: 'Lab pricing varies',
		estimatedValueUsd: 0,
	},
	'Laser Hair Reduction - Large Area': {
		display: 'Free Consultation · $899/6 sessions',
		estimatedValueUsd: 900,
	},
	'Laser Hair Reduction - Medium Area': {
		display: 'Free Consultation · $799/6 sessions',
		estimatedValueUsd: 800,
	},
	'Laser Hair Reduction - Small Area': {
		display: 'Free Consultation · $499/6 sessions',
		estimatedValueUsd: 600,
	},
	'Lip Flip': {
		display: PUBLIC_SERVICE_PRICING.lipFlip.display,
		estimatedValueUsd: 150,
	},
	'Lipotropic B12 Injection': {
		display: PUBLIC_SERVICE_PRICING.lipoB12.display,
		estimatedValueUsd: 0,
	},
	'Microneedling w/ PDGF': {
		display: 'Free Consultation · Starts at $699/session',
		estimatedValueUsd: 600,
	},
	'Microneedling w/ PRP': {
		display: 'Free Consultation · $599/treatment or $1,550 for 3',
		estimatedValueUsd: 600,
	},
	'New Client Filler': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.filler.display}`,
		estimatedValueUsd: 900,
	},
	'New Client Microneedling': {
		display: 'Free Consultation · $375/treatment or $950 for 3',
		estimatedValueUsd: 600,
	},
	'New Client SkinVive': {
		display: 'Free Consultation · Price starts at $650/treatment',
		estimatedValueUsd: 450,
	},
	'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)': {
		display: `Free Consultation · Tox pricing starts at ${PUBLIC_SERVICE_PRICING.botox.display}`,
		estimatedValueUsd: 600,
	},
	'New Client Tox & Filler': {
		display: `Free Consultation · Tox starts at ${PUBLIC_SERVICE_PRICING.botox.display} + ${PUBLIC_SERVICE_PRICING.filler.display.toLowerCase()}`,
		estimatedValueUsd: 1500,
	},
	'Pigmented Lesion Reduction (Brown/Sun Spots)': {
		display: 'Free Consultation · $250/treatment or $650/3 sessions',
		estimatedValueUsd: 250,
	},
	'PRP - Injectables': {
		display: '$800/treatment',
		estimatedValueUsd: 800,
	},
	'Skin Revitalization': {
		display: 'Free Consultation · $400/treatment or $1,000/3 sessions',
		estimatedValueUsd: 250,
	},
	'Touch Up Laser Treatment - Large Area': {
		display: '$69 touch-up',
		estimatedValueUsd: 0,
	},
	'Touch Up Laser Treatment - Medium Area': {
		display: '$59 touch-up',
		estimatedValueUsd: 0,
	},
	'Touch Up Laser Treatment - Small Area': {
		display: '$49 touch-up',
		estimatedValueUsd: 0,
	},
	'Tox/Filler Follow-Up': {
		display: 'Follow-up visit',
		estimatedValueUsd: 0,
	},
	'Vascular Lesion Reduction': {
		display: 'Free Consultation · $300/treatment or $800/3 sessions',
		estimatedValueUsd: 300,
	},
	'VI Peel - Advanced': {
		display: 'Free Consultation · $319 / $95',
		estimatedValueUsd: 319,
	},
	'VI Peel - Original': {
		display: 'Free Consultation · $279 / $65',
		estimatedValueUsd: 279,
	},
	'VI Peel - Precision Plus with Peptides': {
		display: 'Free Consultation · $339 / $95',
		estimatedValueUsd: 339,
	},
	'Weight Loss Consultation': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.weightLoss.display}`,
		estimatedValueUsd: PUBLIC_SERVICE_PRICING.weightLoss.estimatedValueUsd,
	},
	'Weight Loss Consultation (In-Person)': {
		display: `Free Consultation · ${PUBLIC_SERVICE_PRICING.weightLoss.display}`,
		estimatedValueUsd: PUBLIC_SERVICE_PRICING.weightLoss.estimatedValueUsd,
	},
	'Weight Loss Injection': {
		display: PUBLIC_SERVICE_PRICING.weightLoss.display,
		estimatedValueUsd: 0,
	},
	'Weight Loss Injection (In Person)': {
		display: PUBLIC_SERVICE_PRICING.weightLoss.display,
		estimatedValueUsd: 0,
	},
}

export const BLVD_ESTIMATED_VALUES: Record<string, number> = Object.fromEntries(
	Object.entries(BLVD_SERVICE_PRICING).map(([serviceName, pricing]) => [
		serviceName,
		pricing.estimatedValueUsd,
	]),
)

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

export function getEstimatedValueForBlvdService(serviceName: string): number {
	const configured = BLVD_ESTIMATED_VALUES[serviceName]
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
		return PUBLIC_SERVICE_PRICING.weightLoss.estimatedValueUsd
	}
	if (lower.includes('consultation')) return 500

	if (lower.includes('new client')) {
		if (lower.includes('filler')) return 1500
		if (lower.includes('tox'))
			return PUBLIC_SERVICE_PRICING.botox.estimatedValueUsd
		return 600
	}

	if (lower.includes('botox') || lower.includes('tox')) {
		return PUBLIC_SERVICE_PRICING.botox.estimatedValueUsd / 2
	}
	if (lower.includes('filler'))
		return PUBLIC_SERVICE_PRICING.filler.estimatedValueUsd
	if (lower.includes('laser')) return 300
	if (lower.includes('weight'))
		return PUBLIC_SERVICE_PRICING.weightLoss.estimatedValueUsd
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
