export const BLVD_ESTIMATED_VALUES: Record<string, number> = {
	'Consultation: Skincare/Injectables': 500,
	'Hylenex® - Filler Dissolve': 200,
	'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)': 600,
	'New Client Tox & Filler': 1500,
	'KYBELLA® - New Patient': 800,
	'New Client SkinVive': 450,
	'New Client Filler': 900,
	'Tox/Filler Follow-Up': 0,
	'PRP - Injectables': 800,
	'Lip Flip': 150,
	'Existing Client Filler': 0,
	'KYBELLA®': 0,
	'Existing Client Tox & Filler': 0,
	'Existing Client SkinVive': 0,
	'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)': 0,
	'Weight Loss Injection': 0,
	'Lipotropic B12 Injection': 0,
	'Weight Loss Consultation': 1400,
	'Lab Draw': 0,
	'Dermaplane Facial': 100,
	'VI Peel - Advanced': 250,
	'VI Peel - Original': 200,
	'Existing Client Microneedling': 0,
	'Microneedling w/ PDGF': 600,
	'New Client Microneedling': 600,
	'Hair Restoration I PDGF Injection': 600,
	'Microneedling w/ PRP': 600,
	'VI Peel - Precision Plus with Peptides': 300,
	'Laser Hair Reduction - Medium Area': 800,
	'Pigmented Lesion Reduction (Brown/Sun Spots)': 250,
	'Vascular Lesion Reduction': 300,
	'Laser Hair Reduction - Large Area': 900,
	'Touch Up Laser Treatment - Large Area': 0,
	'Touch Up Laser Treatment - Small Area': 0,
	'Laser Hair Reduction - Small Area': 600,
	'Skin Revitalization': 250,
	'Touch Up Laser Treatment - Medium Area': 0,
}

export function getEstimatedValueForBlvdService(serviceName: string): number {
	if (BLVD_ESTIMATED_VALUES[serviceName] !== undefined) {
		return BLVD_ESTIMATED_VALUES[serviceName]
	}

	const lower = serviceName.toLowerCase()

	// Existing client appointments, follow-ups, and touch-ups have already realized their LTV
	if (
		lower.includes('existing') ||
		lower.includes('follow-up') ||
		lower.includes('touch up') ||
		lower.includes('injection') ||
		lower.includes('lab draw')
	) {
		return 0
	}

	// Consultations have high LTV
	if (lower.includes('weight loss consultation')) return 1400
	if (lower.includes('consultation')) return 500

	// New clients
	if (lower.includes('new client')) {
		if (lower.includes('filler')) return 1500
		if (lower.includes('tox')) return 600
		return 600
	}

	if (lower.includes('botox') || lower.includes('tox')) return 300
	if (lower.includes('filler')) return 750
	if (lower.includes('laser')) return 300
	if (lower.includes('weight')) return 150
	if (lower.includes('facial')) return 150
	if (lower.includes('peel')) return 250

	return 150
}
