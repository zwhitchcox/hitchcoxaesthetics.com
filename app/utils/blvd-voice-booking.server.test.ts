import { expect, test } from 'vitest'

import { rankVoiceServiceSearchEntries } from '#app/utils/blvd-voice-booking.server.ts'

const services = [
	{
		categoryName: 'Aesthetic Treatments',
		description:
			'Microneedling treats fine lines, acne scars, enlarged pores, hair loss, and skin texture.',
		name: 'New Client Microneedling',
	},
	{
		categoryName: 'New Patient - Injectables',
		description:
			'Botox is a safe treatment that helps reduce facial wrinkles and lines.',
		name: 'New Client Tox & Filler',
	},
	{
		categoryName: 'Weight Loss & Wellness',
		description: 'Free consultation for medical weight loss options.',
		name: 'Weight Loss Consultation (In-Person)',
	},
]

test.each([
	'weight loss',
	'GLP-1 weight loss',
	'semaglutide weight loss',
	'tirzepatide weight loss',
	'Weight Loss Consultation',
])('ranks weight loss service first for %s', query => {
	const ranked = rankVoiceServiceSearchEntries(services, query, 'new')

	expect(ranked[0]).toMatchObject({
		name: 'Weight Loss Consultation (In-Person)',
	})
})

test('keeps generic services when applying client type preference', () => {
	const ranked = rankVoiceServiceSearchEntries(
		[
			{
				categoryName: 'Existing Patient - Injectables',
				name: 'Existing Client Tox',
			},
			{
				categoryName: 'New Patient - Injectables',
				name: 'New Client Tox',
			},
			{
				categoryName: 'Weight Loss & Wellness',
				name: 'Weight Loss Consultation (In-Person)',
			},
		],
		'weight loss',
		'new',
	)

	expect(ranked.map(service => service.name)).toContain(
		'Weight Loss Consultation (In-Person)',
	)
})

test('still removes the wrong client-specific tox option', () => {
	const ranked = rankVoiceServiceSearchEntries(
		[
			{
				categoryName: 'Existing Patient - Injectables',
				name: 'Existing Client Tox',
			},
			{
				categoryName: 'New Patient - Injectables',
				name: 'New Client Tox',
			},
		],
		'botox',
		'new',
	)

	expect(ranked.map(service => service.name)).toEqual(['New Client Tox'])
})
