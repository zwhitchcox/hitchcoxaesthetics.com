/**
 * Shared utilities for profit calculations across the application
 */

/**
 * Calculate profit based on the item type and collected amount
 *
 * @param {string} item The service/product item
 * @param {number} collected The amount collected (positive for payments, negative for refunds)
 * @returns {number} The calculated profit
 */
export function calculateProfit(item: string, collected: number) {
	// Use collected amount to determine if it's a refund
	const isRefund = collected < 0

	// Use the absolute value for percentage calculations, then apply sign at the end
	const absoluteAmount = Math.abs(collected)

	// Default profit percentage
	let profitPercent = 0.5 // Default: 50% of total

	// Get the category for the item
	const category = getServiceCategory(item)

	// Determine profit percentage based on service category
	switch (category) {
		case 'laser':
			profitPercent = 0.9 // 90% profit margin for laser treatments (high profit margin)
			break

		case 'botox':
			profitPercent = 0.4 // 40% profit margin for Botox (moderate profit)
			break

		case 'filler':
			profitPercent = 0.45 // 45% profit margin for fillers (moderate-high cost products)
			break

		case 'skin':
			profitPercent = 0.65 // 65% profit margin for skincare (varied cost)
			break

		case 'weight':
			profitPercent = 0.75 // 75% profit margin for weight loss treatments
			break

		case 'microneedling':
			// For Microneedling, use fixed cost model instead of percentage
			const costPerSession = 35
			return isRefund
				? -Math.max(absoluteAmount - costPerSession, 0)
				: Math.max(collected - costPerSession, 0)

		case 'retail':
			profitPercent = 0.4 // 40% profit margin for retail products
			break

		case 'consultation':
			profitPercent = 0.9 // 90% profit margin for consultations (mostly time cost)
			break

		case 'cancelled':
			profitPercent = 1.0 // 100% profit for cancellation fees
			break

		case 'other':
		default:
			profitPercent = 0.5 // 50% default for unclassified services
	}

	// Apply the sign based on whether it's a refund
	return isRefund ? -absoluteAmount * profitPercent : collected * profitPercent
}

/**
 * Categorize a service item
 *
 * @param {string} item The service/product item
 * @returns {string} The category of the service
 */
export function getServiceCategory(item: string): string {
	if (!item) return 'other'

	// Convert to lowercase for case-insensitive matching
	const itemLower = item.toLowerCase()

	// Laser and light-based treatments
	if (
		itemLower.includes('laser') ||
		itemLower.includes('pigmented lesion') ||
		itemLower.includes('vascular lesion') ||
		itemLower.includes('cold sculpting') ||
		itemLower.includes('hair reduction') ||
		itemLower.includes('touch up laser')
	) {
		return 'laser'
	}

	// Botox and neurotoxins
	if (
		itemLower.includes('botox') ||
		itemLower.includes('tox') ||
		itemLower.includes('dysport') ||
		itemLower.includes('xeomin') ||
		itemLower.includes('lip flip') // Lip flip is a small amount of toxin
	) {
		return 'botox'
	}

	// Fillers
	if (
		itemLower.includes('filler') ||
		itemLower.includes('juvederm') ||
		itemLower.includes('voluma') ||
		itemLower.includes('radiesse') ||
		itemLower.includes('restylane') ||
		itemLower.includes('kybella') ||
		itemLower.includes('skinvive') || // SkinVive is a microdroplet filler
		itemLower.includes('hylenex') // Filler dissolving
	) {
		return 'filler'
	}

	// Skincare treatments and products
	if (
		itemLower.includes('skin') ||
		itemLower.includes('facial') ||
		itemLower.includes('peel') ||
		itemLower.includes('chemical peel') ||
		itemLower.includes('tns advanced') ||
		itemLower.includes('retinol') ||
		itemLower.includes('ormedi') ||
		itemLower.includes('ha⁵') ||
		itemLower.includes('hydra') ||
		itemLower.includes('serum') ||
		itemLower.includes('treatment pads') ||
		itemLower.includes('brightening') ||
		itemLower.includes('skinmedica')
	) {
		return 'skin'
	}

	// Weight loss treatments
	if (
		itemLower.includes('tirzepatide') ||
		itemLower.includes('semaglutide') ||
		itemLower.includes('ozempic') ||
		itemLower.includes('wegovy') ||
		itemLower.includes('mounjaro') ||
		itemLower.includes('weight loss') ||
		itemLower.includes('lipotropic') ||
		itemLower.includes('b12 injection') ||
		itemLower.match(/weight.*blood panel/) ||
		itemLower.match(/weight.*consultation/)
	) {
		return 'weight'
	}

	// Microneedling treatments
	if (
		itemLower.includes('microneedling') ||
		itemLower.includes('prp') || // Including PRP treatments with microneedling
		itemLower.includes('pdgf') || // Growth factor treatments
		itemLower.includes('hair restoration') // Often uses microneedling
	) {
		return 'microneedling'
	}

	// Consultations
	if (
		itemLower.includes('consultation') ||
		itemLower.includes('follow-up') ||
		itemLower.includes('follow up') ||
		itemLower.includes('lab') ||
		itemLower.includes('blood panel')
	) {
		return 'consultation'
	}

	// Retail products
	if (
		itemLower.includes('gift certificate') ||
		itemLower.includes('zofran') || // Medication
		itemLower.includes('system') ||
		itemLower.includes('serum') ||
		itemLower.includes('complex')
	) {
		return 'retail'
	}

	// Cancelled appointments or no-shows
	if (
		itemLower.includes('no show') ||
		itemLower.includes('late cancel') ||
		itemLower.includes('cancellation')
	) {
		return 'cancelled'
	}

	// If nothing matches, return other
	return 'other'
}

/**
 * Calculate profit margin as a percentage
 *
 * @param {number} profit The calculated profit
 * @param {number} collected The amount collected
 * @returns {number} The profit margin as a percentage
 */
export function calculateProfitMargin(
	profit: number,
	collected: number,
): number {
	return collected !== 0 ? (profit / collected) * 100 : 0
}

/**
 * Parse a collected amount from a record
 *
 * @param {any} record The record containing Collected or Total field
 * @returns {number} The parsed collected amount
 */
export function parseCollectedAmount(record: any): number {
	return parseFloat(record.Collected || record.Total || '0')
}
