import { expect, test } from 'vitest'

import { buildRevenueItemsForOrder } from '#app/utils/blvd-revenue-sync.server.ts'

test('normalizes Boulevard closed order lines into revenue items', () => {
	const revenueItems = buildRevenueItemsForOrder({
		clientId: 'urn:blvd:Client:client_1',
		closedAt: '2026-06-01T21:31:49.131153Z',
		id: 'urn:blvd:Order:order_1',
		lineGroups: [
			{
				__typename: 'OrderAppointmentLineGroup',
				id: 'appointment_1',
				lines: [
					{
						__typename: 'OrderServiceLine',
						currentDiscountAmount: 500,
						currentPrice: 12500,
						currentSubtotal: 12000,
						id: 'line_1',
						name: 'Botox',
						quantity: 1,
						serviceId: 'urn:blvd:Service:service_1',
					},
				],
			},
		],
		number: '2477',
		paymentGroups: [
			{
				invoiceAllocations: [
					{
						invoiceId: 'invoice_1',
					},
				],
				payments: [
					{
						id: 'payment_1',
					},
				],
			},
		],
		summary: {
			currentGratuityAmount: 2000,
		},
	})

	expect(revenueItems).toHaveLength(2)
	expect(revenueItems[0]).toMatchObject({
		boulevardAppointmentId: 'urn:blvd:Appointment:appointment_1',
		boulevardClientId: 'urn:blvd:Client:client_1',
		boulevardInvoiceId: 'invoice_1',
		boulevardPaymentId: 'payment_1',
		boulevardSaleId: 'urn:blvd:Order:order_1',
		discountAmountUsd: 5,
		externalId: 'blvd-order-line:urn:blvd:Order:order_1:line_1',
		grossAmountUsd: 120,
		itemName: 'Botox',
		itemType: 'service',
		netAmountUsd: 120,
		serviceCategory: 'Injectables',
	})
	expect(revenueItems[1]).toMatchObject({
		boulevardAppointmentId: 'urn:blvd:Appointment:appointment_1',
		externalId: 'blvd-order-gratuity:urn:blvd:Order:order_1',
		grossAmountUsd: 20,
		gratuityAmountUsd: 20,
		itemName: 'Gratuity',
		itemType: 'gratuity',
		serviceCategory: 'Gratuity',
	})
})

test('infers broad revenue service categories from Boulevard line names', () => {
	const revenueItems = buildRevenueItemsForOrder({
		clientId: 'urn:blvd:Client:client_1',
		closedAt: '2026-06-01T21:31:49.131153Z',
		id: 'urn:blvd:Order:order_1',
		lineGroups: [
			{
				id: 'appointment_1',
				lines: [
					{
						currentSubtotal: 15000,
						id: 'line_1',
						name: 'Weight Loss Injection',
					},
					{
						currentSubtotal: 89900,
						id: 'line_2',
						name: 'Laser Hair Reduction - Large Area',
					},
					{
						currentSubtotal: 27900,
						id: 'line_3',
						name: 'VI Peel - Original',
					},
				],
			},
		],
	})

	expect(revenueItems.map(item => item.serviceCategory)).toEqual([
		'Weight Loss & Wellness',
		'Laser Services',
		'Aesthetic Treatments',
	])
})
