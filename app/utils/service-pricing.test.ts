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
