import { expect, test } from 'vitest'

import {
	BLVD_SERVICE_DISPLAY_GROUPS,
	getBookingClientTypeFromHistory,
	getBlvdServiceDisplayGroupForServiceId,
	getBlvdServiceDisplayGroupServiceIdForClientHistory,
	getBlvdServicePopularityCount,
	getCustomerFacingBlvdCategoryName,
	getBlvdServiceClientFit,
	getCustomerFacingBlvdServiceName,
	isBlvdServiceCustomerBookable,
	isBlvdServiceVisibleForClientHistory,
} from '#app/utils/blvd-service-display.ts'

test('shows tox services with a customer-facing name', () => {
	expect(
		getCustomerFacingBlvdServiceName(
			'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		),
	).toBe('Tox (Botox, Dysport, Jeuveau, Xeomin)')
	expect(
		getCustomerFacingBlvdServiceName(
			'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		),
	).toBe('Tox (Botox, Dysport, Jeuveau, Xeomin)')
})

test('removes new and existing client prefixes from customer-facing services', () => {
	expect(getCustomerFacingBlvdServiceName('New Client Filler')).toBe('Filler')
	expect(getCustomerFacingBlvdServiceName('Existing Client SkinVive')).toBe(
		'SkinVive',
	)
	expect(
		getCustomerFacingBlvdServiceName('Weight Loss Injection (In Person)'),
	).toBe('Weight Loss Injection')
})

test('removes patient status prefixes from customer-facing categories', () => {
	expect(getCustomerFacingBlvdCategoryName('New Patient - Injectables')).toBe(
		'Injectables',
	)
	expect(
		getCustomerFacingBlvdCategoryName('Existing Patient - Injectables'),
	).toBe('Injectables')
})

test('classifies Boulevard services by client fit', () => {
	expect(
		getBlvdServiceClientFit({
			categoryName: 'Existing Patient - Injectables',
			name: 'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		}),
	).toBe('returning_client')
	expect(
		getBlvdServiceClientFit({
			categoryName: 'New Patient - Injectables',
			name: 'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		}),
	).toBe('new_client')
	expect(
		getBlvdServiceClientFit({
			categoryName: 'General Services',
			name: 'Consultation: Skincare/Injectables',
		}),
	).toBe('neutral')
	expect(
		getBlvdServiceClientFit({
			categoryName: 'Weight Loss',
			name: 'Weight Loss Injection (In Person)',
		}),
	).toBe('returning_client')
})

test('filters services by the client history selected in booking', () => {
	const newTox = {
		categoryName: 'New Patient - Injectables',
		name: 'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
	}
	const returningTox = {
		categoryName: 'Existing Patient - Injectables',
		name: 'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
	}
	const consultation = {
		categoryName: 'General Services',
		name: 'Consultation: Skincare/Injectables',
	}
	const weightLossInjection = {
		categoryName: 'Weight Loss',
		name: 'Weight Loss Injection (In Person)',
	}

	expect(isBlvdServiceVisibleForClientHistory(newTox, 'returning')).toBe(false)
	expect(isBlvdServiceVisibleForClientHistory(returningTox, 'returning')).toBe(
		true,
	)
	expect(isBlvdServiceVisibleForClientHistory(newTox, 'new')).toBe(true)
	expect(isBlvdServiceVisibleForClientHistory(returningTox, 'new')).toBe(false)
	expect(isBlvdServiceVisibleForClientHistory(consultation, 'new')).toBe(true)
	expect(isBlvdServiceVisibleForClientHistory(weightLossInjection, 'new')).toBe(
		false,
	)
	expect(
		isBlvdServiceVisibleForClientHistory(weightLossInjection, 'returning'),
	).toBe(true)
	expect(isBlvdServiceVisibleForClientHistory(consultation, 'unsure')).toBe(
		true,
	)
})

test('blocks internal follow-up services from customer booking', () => {
	const toxFillerFollowUp = {
		categoryName: 'Existing Patient - Injectables',
		id: 'urn:blvd:Service:16a2cb2f-f7da-4b60-9a5a-6b60bd06b38f',
		name: 'Tox/Filler Follow-Up',
	}
	const toxFollowUpWithUnknownId = {
		categoryName: 'Existing Patient - Injectables',
		id: 'urn:blvd:Service:future-tox-follow-up',
		name: 'Tox Follow-Up',
	}

	expect(isBlvdServiceCustomerBookable(toxFillerFollowUp)).toBe(false)
	expect(isBlvdServiceCustomerBookable(toxFollowUpWithUnknownId)).toBe(false)
	expect(
		isBlvdServiceVisibleForClientHistory(toxFillerFollowUp, 'returning'),
	).toBe(false)
	expect(
		isBlvdServiceVisibleForClientHistory(toxFollowUpWithUnknownId, 'returning'),
	).toBe(false)
	expect(getBlvdServicePopularityCount('Tox/Filler Follow-Up')).toBe(0)
})

test('uses explicit client history before falling back to verification state', () => {
	expect(
		getBookingClientTypeFromHistory({
			clientHistory: 'new',
			hasVerifiedClient: false,
		}),
	).toBe('new_client')
	expect(
		getBookingClientTypeFromHistory({
			clientHistory: 'returning',
			hasVerifiedClient: false,
		}),
	).toBe('returning_client')
	expect(
		getBookingClientTypeFromHistory({
			clientHistory: 'unsure',
			hasVerifiedClient: false,
		}),
	).toBe('unsure_client')
	expect(
		getBookingClientTypeFromHistory({
			clientHistory: 'new',
			hasVerifiedClient: true,
		}),
	).toBe('returning_client')
})

test('maps the single customer-facing tox group to the right Boulevard service id', () => {
	const toxGroup = BLVD_SERVICE_DISPLAY_GROUPS.find(group => group.id === 'tox')

	expect(toxGroup).toBeTruthy()
	expect(
		getBlvdServiceDisplayGroupServiceIdForClientHistory(toxGroup!, 'new'),
	).toBe('urn:blvd:Service:b293ac32-1e70-47e7-9a6c-fcd0478aec85')
	expect(
		getBlvdServiceDisplayGroupServiceIdForClientHistory(toxGroup!, 'returning'),
	).toBe('urn:blvd:Service:ce6af60c-c8b7-464c-9c33-75ce8cc6972c')
	expect(
		getBlvdServiceDisplayGroupServiceIdForClientHistory(toxGroup!, 'unsure'),
	).toBe('urn:blvd:Service:b293ac32-1e70-47e7-9a6c-fcd0478aec85')
	expect(
		getBlvdServiceDisplayGroupForServiceId(
			'urn:blvd:Service:ce6af60c-c8b7-464c-9c33-75ce8cc6972c',
		)?.id,
	).toBe('tox')
})

test('hides existing-client-only services (touch-ups, follow-ups) from new clients', () => {
	const laserTouchUp = {
		categoryName: 'Laser Treatments',
		name: 'Touch Up Laser Treatment - Medium Area',
	}
	const followUp = {
		categoryName: 'Existing Patient - Injectables',
		name: 'Tox/Filler Follow-Up',
	}
	expect(getBlvdServiceClientFit(laserTouchUp)).toBe('returning_client')
	expect(getBlvdServiceClientFit(followUp)).toBe('returning_client')
	// New clients must not see them...
	expect(isBlvdServiceVisibleForClientHistory(laserTouchUp, 'new')).toBe(false)
	// ...but returning clients still can (touch-up is bookable for them).
	expect(isBlvdServiceVisibleForClientHistory(laserTouchUp, 'returning')).toBe(
		true,
	)
	// A laser treatment a new client CAN book stays visible.
	expect(
		isBlvdServiceVisibleForClientHistory(
			{
				categoryName: 'Laser Treatments',
				name: 'Laser Hair Reduction - Medium Area',
			},
			'new',
		),
	).toBe(true)
})
