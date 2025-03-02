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
	let profitPercent = 0.5 // Default: 50% of total

	// Determine profit percentage based on item type
	if (item.match(/Laser|Touch Up Laser|Pigmented Lesion/i)) {
		profitPercent = 1.0 // 100% of total
	} else if (item.match(/Botox|Lip Flip|Tox/i)) {
		profitPercent = 0.5 // 50% of total
	} else if (item.match(/Microneedling/i)) {
		// For Microneedling, use fixed cost model instead of percentage
		const costPerSession = 35
		return isRefund
			? -Math.max(absoluteAmount - costPerSession, 0)
			: Math.max(collected - costPerSession, 0)
	} else if (item.match(/Skin|Juvederm|Filler/i)) {
		profitPercent = 0.5 // 50% of total
	} else if (item.match(/Tirzepatide|Semaglutide/i)) {
		profitPercent = 0.9 // 90% of total
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
	if (item.match(/Laser|Touch Up Laser|Pigmented Lesion/i)) {
		return 'laser'
	} else if (item.match(/Botox|Lip Flip|Tox/i)) {
		return 'botox'
	} else if (item.match(/Juvederm|Filler/i)) {
		return 'filler'
	} else if (item.match(/Skin/i)) {
		return 'skin'
	} else if (item.match(/Tirzepatide|Semaglutide/i)) {
		return 'weight'
	} else if (item.match(/Microneedling/i)) {
		return 'microneedling'
	} else {
		return 'other'
	}
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
