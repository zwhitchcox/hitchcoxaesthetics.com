import { expect, test } from 'vitest'

import {
	clipSpans,
	dayRange,
	mergeSpans,
	nextDay,
	reviewerDayMetrics,
	sessionsFromTimes,
	spanMinutes,
} from './reviewer-day.ts'

const m = (min: number) => min * 60_000
const span = (from: number, to: number) => ({ start: m(from), end: m(to) })

test('overlapping spans merge', () => {
	expect(mergeSpans([span(10, 20), span(15, 30), span(40, 40), span(35, 45)])).toEqual([
		span(10, 30),
		span(35, 45),
	])
})

test('spans clip to the windows', () => {
	expect(clipSpans([span(0, 100)], [span(10, 20), span(30, 40)])).toEqual([
		span(10, 20),
		span(30, 40),
	])
	expect(spanMinutes(clipSpans([span(0, 100)], [span(10, 20), span(30, 40)]))).toBe(20)
})

test('a shift of 8 hours with 5 hours booked and a 30 minute block leaves 2.5 free', () => {
	const day = reviewerDayMetrics({
		shifts: [span(540, 1020)], // 9:00 to 17:00
		blocks: [span(720, 750)], // lunch
		appointments: [span(540, 600), span(600, 660), span(780, 960)], // 1h, 1h, 3h
		reviewSessions: [span(700, 715), span(1000, 1010)],
	})
	expect(day.shiftMinutes).toBe(480)
	expect(day.blockMinutes).toBe(30)
	expect(day.appointmentMinutes).toBe(300)
	expect(day.freeMinutes).toBe(150)
	// 15 + 10 minutes of sessions, plus a minute of tail each
	expect(day.reviewMinutes).toBe(27)
	expect(day.reviewSessions).toBe(2)
})

test('an appointment that runs past the shift only counts inside it', () => {
	const day = reviewerDayMetrics({
		shifts: [span(540, 1020)],
		blocks: [],
		appointments: [span(990, 1080)],
		reviewSessions: [],
	})
	expect(day.appointmentMinutes).toBe(30)
	expect(day.freeMinutes).toBe(450)
})

test('no shift: free time is unknown, reviewing still counts', () => {
	const day = reviewerDayMetrics({
		shifts: [],
		blocks: [],
		appointments: [span(540, 600)],
		reviewSessions: [span(1200, 1230)],
	})
	expect(day.shiftMinutes).toBeNull()
	expect(day.freeMinutes).toBeNull()
	expect(day.reviewMinutes).toBe(31)
})

test('a sitting with one event still counts a minute', () => {
	const day = reviewerDayMetrics({
		shifts: [],
		blocks: [],
		appointments: [],
		reviewSessions: [span(600, 600)],
	})
	expect(day.reviewMinutes).toBe(1)
	expect(day.reviewSessions).toBe(1)
	expect(clipSpans([span(600, 600)], [span(0, 1440)])).toEqual([span(600, 600)])
	expect(clipSpans([span(1440, 1440)], [span(0, 1440)])).toEqual([])
})

test('event times split into sittings at the gap', () => {
	expect(sessionsFromTimes([m(30), m(0), m(5), m(9), m(50)], m(10))).toEqual([
		span(0, 9),
		span(30, 30),
		span(50, 50),
	])
})

test('calendar days roll over month and year ends', () => {
	expect(nextDay('2026-09-30')).toBe('2026-10-01')
	expect(nextDay('2026-12-31')).toBe('2027-01-01')
	expect(dayRange('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
})
