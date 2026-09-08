import { describe, expect, test } from 'vitest'

import { decideCardRequirement } from './booking-card-risk.server.ts'

describe('decideCardRequirement', () => {
	test('unknown phone means new client, card required', () => {
		expect(
			decideCardRequirement({
				clientFound: false,
				completedAppointments: 0,
				hasCardOnFile: false,
				mirrorHasData: false,
				priorFlakes: 0,
			}),
		).toEqual({ hasCardOnFile: false, reason: 'new-client', requireCard: true })
	})

	test('any prior cancel or no-show requires a card', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				completedAppointments: 12,
				hasCardOnFile: false,
				mirrorHasData: true,
				priorFlakes: 1,
			}),
		).toEqual({
			hasCardOnFile: false,
			reason: 'prior-cancel',
			requireCard: true,
		})
	})

	test('prior canceller with a card on file still counts as required (UI skips collection)', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				completedAppointments: 5,
				hasCardOnFile: true,
				mirrorHasData: true,
				priorFlakes: 2,
			}),
		).toEqual({ hasCardOnFile: true, reason: 'prior-cancel', requireCard: true })
	})

	test('profile with no completed visits counts as new', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				completedAppointments: 0,
				hasCardOnFile: false,
				mirrorHasData: true,
				priorFlakes: 0,
			}),
		).toEqual({ hasCardOnFile: false, reason: 'new-client', requireCard: true })
	})

	test('returning client in good standing is never asked', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				completedAppointments: 8,
				hasCardOnFile: false,
				mirrorHasData: true,
				priorFlakes: 0,
			}),
		).toEqual({ hasCardOnFile: false, reason: null, requireCard: false })
	})

	test('empty mirror fails open for existing clients', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				completedAppointments: 0,
				hasCardOnFile: false,
				mirrorHasData: false,
				priorFlakes: 0,
			}),
		).toEqual({ hasCardOnFile: false, reason: null, requireCard: false })
	})
})
