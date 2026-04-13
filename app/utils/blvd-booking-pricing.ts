export type BlvdPriceRange = {
	max: number
	min: number
	variable: boolean
}

type BookingPriceEntry = {
	display: string
}

const BOOKING_PRICE_CATALOG: Record<string, BookingPriceEntry> = {
	'Consultation: Skincare/Injectables': {
		display: 'Free Consultation',
	},
	'Dermaplane Facial': {
		display: 'Free Consultation · $100/treatment',
	},
	'Existing Client Filler': {
		display: 'Filler starts at $450+',
	},
	'Existing Client Microneedling': {
		display: '$375/treatment or $950 for 3',
	},
	'Existing Client SkinVive': {
		display: 'Price starts at $650/treatment',
	},
	'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)': {
		display: 'Tox pricing starts at $13/unit',
	},
	'Existing Client Tox & Filler': {
		display: 'Tox starts at $13/unit + filler starts at $450+',
	},
	'Hair Restoration I PDGF Injection': {
		display: 'Free Consultation · Starts at $399/session',
	},
	'Hylenex® - Filler Dissolve': {
		display: 'Free Consultation · $200/vial',
	},
	'KYBELLA®': {
		display: '$600/vial',
	},
	'KYBELLA® - New Patient': {
		display: 'Free Consultation · $600/vial',
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
		display: '$129',
	},
	'Lipotropic B12 Injection': {
		display: '$25/shot',
	},
	'Microneedling w/ PDGF': {
		display: 'Free Consultation · Starts at $699/session',
	},
	'Microneedling w/ PRP': {
		display: 'Free Consultation · $599/treatment or $1,550 for 3',
	},
	'New Client Filler': {
		display: 'Free Consultation · Filler starts at $450+',
	},
	'New Client Microneedling': {
		display: 'Free Consultation · $375/treatment or $950 for 3',
	},
	'New Client SkinVive': {
		display: 'Free Consultation · Price starts at $650/treatment',
	},
	'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)': {
		display: 'Free Consultation · Tox pricing starts at $13/unit',
	},
	'New Client Tox & Filler': {
		display:
			'Free Consultation · Tox starts at $13/unit + filler starts at $450+',
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
	'Weight Loss Consultation (In-Person)': {
		display: 'Free Consultation · Programs start at $150/month',
	},
	'Weight Loss Consultation (Telehealth)': {
		display: 'Free Consultation · Programs start at $150/month',
	},
	'Weight Loss Follow-Up (Telehealth)': {
		display: 'Follow-up visit',
	},
	'Weight Loss Injection (In Person)': {
		display: 'Starting at $150/month',
	},
}

export function getBlvdBookingPriceDisplay({
	serviceName,
}: {
	serviceName: string
}) {
	const configured = BOOKING_PRICE_CATALOG[serviceName]
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

export function getMissingBlvdBookingPriceServiceNames(serviceNames: string[]) {
	return [
		...new Set(serviceNames.filter(name => !(name in BOOKING_PRICE_CATALOG))),
	].sort((a, b) => a.localeCompare(b))
}
