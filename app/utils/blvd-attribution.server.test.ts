import { expect, test, vi } from 'vitest'

import { upsertBlvdRevenueItem } from '#app/utils/blvd-attribution.server.ts'

test('does not update unchanged Boulevard revenue items during overlap syncs', async () => {
	const occurredAt = new Date('2026-06-02T14:00:00.000Z')
	const existingRevenueItem = {
		attributionMethod: 'unattributed',
		attributionTouchId: null,
		boulevardAppointmentId: 'appointment_1',
		boulevardClientId: null,
		boulevardInvoiceId: 'invoice_1',
		boulevardPaymentId: 'payment_1',
		boulevardSaleId: 'sale_1',
		currency: 'USD',
		discountAmountUsd: 0,
		gratuityAmountUsd: null,
		grossAmountUsd: 120,
		itemName: 'Botox',
		itemType: 'service',
		netAmountUsd: 120,
		occurredAt,
		rawPayload: '{"source":"test"}',
		serviceCategory: 'Injectables',
	}
	const returnedRevenueItem = { id: 'revenue_1', ...existingRevenueItem }
	const db = {
		blvdRevenueItem: {
			findUnique: vi.fn().mockResolvedValue(existingRevenueItem),
			findUniqueOrThrow: vi.fn().mockResolvedValue(returnedRevenueItem),
			upsert: vi.fn(),
		},
	}

	await expect(
		upsertBlvdRevenueItem(
			{
				boulevardAppointmentId: 'appointment_1',
				boulevardInvoiceId: 'invoice_1',
				boulevardPaymentId: 'payment_1',
				boulevardSaleId: 'sale_1',
				currency: 'USD',
				discountAmountUsd: 0,
				externalId: 'blvd-order-line:sale_1:line_1',
				grossAmountUsd: 120,
				itemName: 'Botox',
				itemType: 'service',
				netAmountUsd: 120,
				occurredAt,
				rawPayload: { source: 'test' },
				serviceCategory: 'Injectables',
			},
			db as unknown as Parameters<typeof upsertBlvdRevenueItem>[1],
		),
	).resolves.toEqual(returnedRevenueItem)

	expect(db.blvdRevenueItem.upsert).not.toHaveBeenCalled()
})
