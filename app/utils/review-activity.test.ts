import { expect, test } from 'vitest'

import { bucketReviewActivity } from './review-activity.ts'

const ZONE = 'America/New_York'
// A Saturday, 3 PM in New York (EDT).
const NOW = new Date('2026-09-19T19:00:00Z')

test('counts decisions per day and distinct articles worked on', () => {
	const days = bucketReviewActivity(
		[
			{ articleId: 'a', kind: 'saved', at: new Date('2026-09-18T13:00:00Z') },
			{ articleId: 'a', kind: 'saved', at: new Date('2026-09-18T13:05:00Z') },
			{ articleId: 'a', kind: 'approved', at: new Date('2026-09-18T13:10:00Z') },
			{ articleId: 'b', kind: 'ai_edit', at: new Date('2026-09-18T14:00:00Z') },
			{ articleId: 'c', kind: 'denied', at: new Date('2026-09-19T15:00:00Z') },
		],
		ZONE,
		3,
		NOW,
	)

	expect(days.map(d => d.day)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19'])
	expect(days[1]).toEqual({ day: '2026-09-18', decided: 1, worked: 2 })
	expect(days[2]).toEqual({ day: '2026-09-19', decided: 1, worked: 1 })
	expect(days[0]).toEqual({ day: '2026-09-17', decided: 0, worked: 0 })
})

test('a late evening in New York stays on that New York day', () => {
	// 11:30 PM on the 18th in New York is 03:30 UTC on the 19th.
	const days = bucketReviewActivity(
		[{ articleId: 'a', kind: 'approved', at: new Date('2026-09-19T03:30:00Z') }],
		ZONE,
		2,
		NOW,
	)

	expect(days.find(d => d.day === '2026-09-18')?.decided).toBe(1)
	expect(days.find(d => d.day === '2026-09-19')?.decided).toBe(0)
})

test('events outside the window are ignored, the window ends today', () => {
	const days = bucketReviewActivity(
		[{ articleId: 'old', kind: 'approved', at: new Date('2026-08-01T12:00:00Z') }],
		ZONE,
		7,
		NOW,
	)

	expect(days).toHaveLength(7)
	expect(days.at(-1)?.day).toBe('2026-09-19')
	expect(days.every(d => d.decided === 0 && d.worked === 0)).toBe(true)
})
