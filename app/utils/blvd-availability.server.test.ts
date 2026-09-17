import { beforeEach, expect, test, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'

// What Boulevard answers, per location id. Never a real call.
const boulevard = vi.hoisted(() => ({
	shifts: {} as Record<string, unknown[]>,
	blocks: {} as Record<string, unknown[]>,
	fail: false,
}))

vi.mock('#app/utils/blvd-admin.server.ts', () => ({
	listBlvdAdminLocations: vi.fn(async () => [
		{ id: 'urn:blvd:Location:knox', name: 'Knoxville', tz: 'America/New_York' },
		{ id: 'urn:blvd:Location:farr', name: 'Farragut', tz: 'America/New_York' },
	]),
	boulevardAdminFetch: vi.fn(
		async (query: string, variables: { locationId: string }) => {
			if (boulevard.fail) {
				throw new Error('Boulevard Admin API failed: {"status":502}')
			}
			if (query.includes('shifts(')) {
				return {
					shifts: { shifts: boulevard.shifts[variables.locationId] ?? [] },
				}
			}
			return {
				timeblocks: {
					edges: (boulevard.blocks[variables.locationId] ?? []).map(node => ({
						node,
					})),
				},
			}
		},
	),
}))

import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import {
	AVAILABILITY_KEY_PREFIX,
	readStaffAvailability,
} from '#app/utils/blvd-availability.server.ts'
import { prisma } from '#app/utils/db.server.ts'

const SARAH = 'urn:blvd:Staff:c0069cf2-aee2-4a2c-a6eb-5abe62192e89'
const SARAH_UUID = 'c0069cf2-aee2-4a2c-a6eb-5abe62192e89'
const ZONE = 'America/New_York'
const DAY = '2026-09-17'
const NOW = new Date('2026-09-17T13:00:00.000Z') // 09:00 in New York
const KNOX = 'urn:blvd:Location:knox'
const FARR = 'urn:blvd:Location:farr'
const CACHE_KEY = `${AVAILABILITY_KEY_PREFIX}${DAY}`

/** A shift row as Boulevard returns it: bare UUIDs, no date. */
function shift(
	clockIn: string,
	clockOut: string,
	over: Record<string, unknown> = {},
) {
	return {
		available: true,
		clockIn,
		clockOut,
		day: 4,
		locationId: 'e9d64844-962a-46e6-b373-7f25ff4087c2',
		staffId: SARAH_UUID,
		unavailableReason: null,
		...over,
	}
}

/** A time block as Boulevard returns it: URNs, offset timestamps. */
function block(
	startAt: string,
	endAt: string,
	title: string | null = null,
	over: Record<string, unknown> = {},
) {
	return {
		id: 'urn:blvd:Timeblock:1',
		title,
		reason: 'PERSONAL',
		cancelled: false,
		startAt,
		endAt,
		staffId: SARAH,
		...over,
	}
}

const fetchCalls = () => vi.mocked(boulevardAdminFetch).mock.calls
const read = (now = NOW) => readStaffAvailability(SARAH, DAY, ZONE, now)

beforeEach(() => {
	boulevard.shifts = {}
	boulevard.blocks = {}
	boulevard.fail = false
})

test('a shift: she is working, one day per location and query', async () => {
	boulevard.shifts[KNOX] = [shift('10:00:00', '18:00:00')]
	const result = await read()
	expect(result).toEqual({
		working: true,
		shifts: [{ locationId: KNOX, clockIn: '10:00:00', clockOut: '18:00:00' }],
		blocks: [],
		fetchedAt: NOW.toISOString(),
	})
	expect(fetchCalls()).toHaveLength(4)
	expect(fetchCalls()[0]![1]).toEqual({
		locationId: KNOX,
		staffIds: [SARAH],
		start: DAY,
		end: DAY,
	})
	// The day's bounds in UTC, from her zone.
	expect(fetchCalls()[1]![1]).toEqual({
		locationId: KNOX,
		query: `staffId = '${SARAH}' AND startAt >= '2026-09-17T04:00:00.000Z' AND startAt < '2026-09-18T04:00:00.000Z' AND cancelled = false`,
	})
	expect(fetchCalls()[2]![1]).toMatchObject({ locationId: FARR })
})

test('no shift at either location: a day off', async () => {
	const result = await read()
	expect(result.working).toBe(false)
	expect(result.shifts).toEqual([])
})

test('an unavailable shift is a day off', async () => {
	boulevard.shifts[KNOX] = [
		shift('10:00:00', '18:00:00', {
			available: false,
			unavailableReason: 'Time off',
		}),
	]
	const result = await read()
	expect(result.working).toBe(false)
	expect(result.shifts).toEqual([])
})

test("another staff member's shift does not count", async () => {
	boulevard.shifts[KNOX] = [
		shift('10:00:00', '18:00:00', {
			staffId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
		}),
	]
	expect((await read()).working).toBe(false)
})

test('an all-day block is a day off', async () => {
	boulevard.shifts[KNOX] = [shift('10:00:00', '18:00:00')]
	boulevard.blocks[KNOX] = [
		block(
			'2026-09-17T09:00:00-04:00',
			'2026-09-17T18:00:00-04:00',
			'Labor Day',
		),
	]
	const result = await read()
	expect(result.working).toBe(false)
	expect(result.blocks).toEqual([
		{
			startAt: '2026-09-17T09:00:00-04:00',
			endAt: '2026-09-17T18:00:00-04:00',
			title: 'Labor Day',
		},
	])
})

test('a short block leaves her working; blocks together can cover the shift', async () => {
	boulevard.shifts[KNOX] = [shift('10:00:00', '18:00:00')]
	boulevard.blocks[KNOX] = [
		block('2026-09-17T11:30:00-04:00', '2026-09-17T12:30:00-04:00', 'Lunch'),
	]
	expect((await read()).working).toBe(true)

	await prisma.blvdSyncState.deleteMany({ where: { key: CACHE_KEY } })
	// A block at either location counts.
	boulevard.blocks[FARR] = [
		block('2026-09-17T09:00:00-04:00', '2026-09-17T13:00:00-04:00'),
	]
	boulevard.blocks[KNOX] = [
		block('2026-09-17T13:00:00-04:00', '2026-09-17T18:00:00-04:00'),
	]
	expect((await read()).working).toBe(false)
})

test('a cancelled block is ignored', async () => {
	boulevard.shifts[KNOX] = [shift('10:00:00', '18:00:00')]
	boulevard.blocks[KNOX] = [
		block('2026-09-17T09:00:00-04:00', '2026-09-17T18:00:00-04:00', null, {
			cancelled: true,
		}),
	]
	const result = await read()
	expect(result.working).toBe(true)
	expect(result.blocks).toEqual([])
})

test('a Boulevard error: unknown, and not cached', async () => {
	consoleError.mockImplementation(() => {})
	boulevard.fail = true
	expect(await read()).toEqual({
		working: null,
		shifts: [],
		blocks: [],
		fetchedAt: NOW.toISOString(),
	})
	expect(
		await prisma.blvdSyncState.findUnique({ where: { key: CACHE_KEY } }),
	).toBeNull()

	// The next tick reads again.
	boulevard.fail = false
	boulevard.shifts[KNOX] = [shift('10:00:00', '18:00:00')]
	expect((await read()).working).toBe(true)
})

test('the cache: one Boulevard read per hour, older days dropped', async () => {
	await prisma.blvdSyncState.create({
		data: { key: `${AVAILABILITY_KEY_PREFIX}2026-09-16`, value: '{}' },
	})
	boulevard.shifts[KNOX] = [shift('10:00:00', '18:00:00')]

	const first = await read(NOW)
	expect(fetchCalls()).toHaveLength(4)

	const later = new Date(NOW.getTime() + 30 * 60 * 1000)
	expect(await read(later)).toEqual(first)
	expect(fetchCalls()).toHaveLength(4)
	expect(
		await prisma.blvdSyncState.findUnique({
			where: { key: `${AVAILABILITY_KEY_PREFIX}2026-09-16` },
		}),
	).toBeNull()

	const anHourLater = new Date(NOW.getTime() + 61 * 60 * 1000)
	const refreshed = await read(anHourLater)
	expect(fetchCalls()).toHaveLength(8)
	expect(refreshed.fetchedAt).toBe(anHourLater.toISOString())
})
