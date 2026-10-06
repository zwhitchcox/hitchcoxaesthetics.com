import { expect, test } from 'vitest'

import {
	BLVD_SERVICE_PRICING,
	getRetellPricingSummary,
} from '#app/utils/service-pricing.ts'

test('includes Brazilian laser hair removal pricing for Retell agents', () => {
	const pricingSummary = getRetellPricingSummary()

	expect(pricingSummary).toContain('large areas including Brazilian')
	expect(pricingSummary).toContain('$899')
	expect(pricingSummary).toContain('touch-ups start at $49')
})

test('uses public small-area laser pricing for Boulevard booking display', () => {
	expect(BLVD_SERVICE_PRICING['Laser Hair Reduction - Small Area']).toEqual({
		display: 'Free Consultation · $599/6 sessions',
	})
})

test('laser agents quote only laser prices, with the $650 sun spot package', () => {
	const pricingSummary = getRetellPricingSummary({ serviceFocus: 'laser' })

	expect(pricingSummary).toContain('$599')
	expect(pricingSummary).toContain('$650 for a package of 3')
	expect(pricingSummary).not.toContain('semaglutide')
	expect(pricingSummary).not.toContain('Botox')
})
