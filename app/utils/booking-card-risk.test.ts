import { describe, expect, test } from 'vitest'

import {
	decideCardRequirement,
	isLateFlake,
} from './booking-card-risk.server.ts'

const start = new Date('2026-09-15T15:00:00Z')
const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000)

describe('isLateFlake', () => {
	test('a client cancel inside 24 hours is late; outside it is not', () => {
		expect(
			isLateFlake({ cancellationReason: 'CLIENT_CANCEL', cancelledAt: hoursBefore(23), startAt: start }),
		).toBe(true)
		expect(
			isLateFlake({ cancellationReason: 'CLIENT_CANCEL', cancelledAt: hoursBefore(24), startAt: start }),
		).toBe(true)
		expect(
			isLateFlake({ cancellationReason: 'CLIENT_CANCEL', cancelledAt: hoursBefore(25), startAt: start }),
		).toBe(false)
	})

	test('a no-show and a Boulevard late cancel are late whatever the clock says', () => {
		expect(
			isLateFlake({ cancellationReason: 'NO_SHOW', cancelledAt: hoursBefore(-2), startAt: start }),
		).toBe(true)
		expect(
			isLateFlake({ cancellationReason: 'CLIENT_LATE_CANCEL', cancelledAt: null, startAt: start }),
		).toBe(true)
	})

	test('staff cancels, mistakes, merges and voids never count', () => {
		for (const reason of ['STAFF_CANCEL', 'MISTAKE', 'MERGED', 'VOIDED', null]) {
			expect(
				isLateFlake({ cancellationReason: reason, cancelledAt: hoursBefore(1), startAt: start }),
			).toBe(false)
		}
	})

	test('a client cancel with no cancel time is not counted', () => {
		expect(
			isLateFlake({ cancellationReason: 'CLIENT_CANCEL', cancelledAt: null, startAt: start }),
		).toBe(false)
	})
})

describe('decideCardRequirement', () => {
	test('a new client is never asked for a card', () => {
		expect(
			decideCardRequirement({
				clientFound: false,
				hasCardOnFile: false,
				hasPriorRevenue: false,
				lateFlakes: 0,
				mirrorHasData: false,
			}),
		).toEqual({ hasCardOnFile: false, reason: null, requireCard: false })
	})

	test('a late flake with no revenue requires a card', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				hasCardOnFile: false,
				hasPriorRevenue: false,
				lateFlakes: 1,
				mirrorHasData: true,
			}),
		).toEqual({
			hasCardOnFile: false,
			reason: 'late-cancel-unpaid',
			requireCard: true,
		})
	})

	test('a late flake by a client who has paid before is not asked', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				hasCardOnFile: false,
				hasPriorRevenue: true,
				lateFlakes: 3,
				mirrorHasData: true,
			}),
		).toEqual({ hasCardOnFile: false, reason: null, requireCard: false })
	})

	test('a card already on file still counts as required (the UI skips collection)', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				hasCardOnFile: true,
				hasPriorRevenue: false,
				lateFlakes: 2,
				mirrorHasData: true,
			}),
		).toEqual({
			hasCardOnFile: true,
			reason: 'late-cancel-unpaid',
			requireCard: true,
		})
	})

	test('a profile with no visits and no flakes is not asked', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				hasCardOnFile: false,
				hasPriorRevenue: false,
				lateFlakes: 0,
				mirrorHasData: true,
			}),
		).toEqual({ hasCardOnFile: false, reason: null, requireCard: false })
	})

	test('an empty mirror fails open', () => {
		expect(
			decideCardRequirement({
				clientFound: true,
				hasCardOnFile: false,
				hasPriorRevenue: false,
				lateFlakes: 2,
				mirrorHasData: false,
			}),
		).toEqual({ hasCardOnFile: false, reason: null, requireCard: false })
	})
})
