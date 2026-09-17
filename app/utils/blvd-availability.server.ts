/**
 * Is a staff member working on a given day? Boulevard knows: the shifts per
 * location and the personal time blocks. The Admin API answers one day at a
 * time (a shift row has no date), so this reads one day per location.
 *
 * At most one Boulevard read per hour: the day's answer is cached in
 * BlvdSyncState. On any Boulevard error the answer is null and the caller
 * decides from the appointments instead.
 */
import { fromZonedTime } from 'date-fns-tz'
import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'

export type StaffShift = {
	locationId: string
	clockIn: string
	clockOut: string
}
export type StaffBlock = {
	startAt: string
	endAt: string
	title: string | null
}
export type StaffAvailability = {
	/** Null when Boulevard could not be read. */
	working: boolean | null
	/** The available shifts of the day. */
	shifts: StaffShift[]
	/** The personal time blocks of the day, cancelled ones left out. */
	blocks: StaffBlock[]
	fetchedAt: string
}

export const AVAILABILITY_KEY_PREFIX = 'article-reminder:availability:'
const CACHE_MS = 60 * 60 * 1000

const SHIFTS_QUERY = `query StaffShifts($locationId: ID!, $staffIds: [ID!], $start: Date!, $end: Date!) {
	shifts(locationId: $locationId, staffIds: $staffIds, startIso8601: $start, endIso8601: $end) {
		shifts { available clockIn clockOut day locationId staffId unavailableReason }
	}
}`

const BLOCKS_QUERY = `query StaffTimeblocks($locationId: ID!, $query: QueryString) {
	timeblocks(locationId: $locationId, first: 50, query: $query) {
		edges { node { id title reason cancelled startAt endAt staffId } }
	}
}`

type ShiftNode = {
	available?: boolean | null
	clockIn?: string | null
	clockOut?: string | null
	staffId?: string | null
}
type BlockNode = {
	title?: string | null
	cancelled?: boolean | null
	startAt?: string | null
	endAt?: string | null
	staffId?: string | null
}

/** Shifts carry bare UUIDs, blocks carry URNs: compare the UUID part. */
const uuidOf = (id: string) => id.slice(-36).toLowerCase()

/** The zone date after this one, yyyy-MM-dd. */
function nextDay(dayYmd: string): string {
	const [y, m, d] = dayYmd.split('-').map(Number)
	return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10)
}

export async function readStaffAvailability(
	staffUrn: string,
	dayYmd: string,
	zone: string,
	now = new Date(),
): Promise<StaffAvailability> {
	const key = `${AVAILABILITY_KEY_PREFIX}${dayYmd}`
	const cached = await readCache(key, now)
	if (cached) return cached

	const fetchedAt = now.toISOString()
	try {
		const { shifts, blocks } = await fetchDay(staffUrn, dayYmd, zone)
		const working = shifts.some(
			shift => !covered(shiftSpan(shift, dayYmd, zone), blocks),
		)
		const result = { working, shifts, blocks, fetchedAt }
		await writeCache(key, result)
		return result
	} catch (error) {
		console.error(
			'Article reminder: availability read failed',
			error instanceof Error ? error.message : String(error),
		)
		return { working: null, shifts: [], blocks: [], fetchedAt }
	}
}

async function fetchDay(staffUrn: string, dayYmd: string, zone: string) {
	const dayStart = fromZonedTime(`${dayYmd}T00:00:00`, zone)
	const dayEnd = fromZonedTime(`${nextDay(dayYmd)}T00:00:00`, zone)
	const staffUuid = uuidOf(staffUrn)
	const shifts: StaffShift[] = []
	const blocks: StaffBlock[] = []

	for (const location of await listBlvdAdminLocations()) {
		const shiftData = await boulevardAdminFetch<{
			shifts?: { shifts?: ShiftNode[] | null } | null
		}>(SHIFTS_QUERY, {
			locationId: location.id,
			staffIds: [staffUrn],
			start: dayYmd,
			end: dayYmd,
		})
		for (const shift of shiftData.shifts?.shifts ?? []) {
			if (!shift.clockIn || !shift.clockOut || shift.available === false)
				continue
			if (shift.staffId && uuidOf(shift.staffId) !== staffUuid) continue
			shifts.push({
				locationId: location.id,
				clockIn: shift.clockIn,
				clockOut: shift.clockOut,
			})
		}

		const blockData = await boulevardAdminFetch<{
			timeblocks?: { edges?: Array<{ node?: BlockNode | null }> | null } | null
		}>(BLOCKS_QUERY, {
			locationId: location.id,
			query: `staffId = '${staffUrn}' AND startAt >= '${dayStart.toISOString()}' AND startAt < '${dayEnd.toISOString()}' AND cancelled = false`,
		})
		for (const edge of blockData.timeblocks?.edges ?? []) {
			const block = edge.node
			if (!block?.startAt || !block.endAt || block.cancelled) continue
			if (block.staffId && uuidOf(block.staffId) !== staffUuid) continue
			blocks.push({
				startAt: block.startAt,
				endAt: block.endAt,
				title: block.title ?? null,
			})
		}
	}
	return { shifts, blocks }
}

/** The shift's clock times on that day, as instants. */
function shiftSpan(
	shift: StaffShift,
	dayYmd: string,
	zone: string,
): [number, number] {
	return [
		fromZonedTime(`${dayYmd}T${shift.clockIn}`, zone).getTime(),
		fromZonedTime(`${dayYmd}T${shift.clockOut}`, zone).getTime(),
	]
}

/** True when the blocks, together, cover the whole span. */
function covered([start, end]: [number, number], blocks: StaffBlock[]) {
	const spans = blocks
		.map(b => ({ start: Date.parse(b.startAt), end: Date.parse(b.endAt) }))
		.sort((a, b) => a.start - b.start)
	let reach = start
	for (const block of spans) {
		if (block.start > reach) break
		reach = Math.max(reach, block.end)
		if (reach >= end) return true
	}
	return reach >= end
}

async function readCache(
	key: string,
	now: Date,
): Promise<StaffAvailability | null> {
	const row = await prisma.blvdSyncState.findUnique({ where: { key } })
	if (!row?.value) return null
	try {
		const parsed = JSON.parse(row.value) as StaffAvailability
		const fresh = now.getTime() - Date.parse(parsed.fetchedAt) < CACHE_MS
		return fresh ? parsed : null
	} catch {
		return null
	}
}

/** Keeps one day's answer: the older days' rows go with it. */
async function writeCache(key: string, value: StaffAvailability) {
	const json = JSON.stringify(value)
	await prisma.$transaction([
		prisma.blvdSyncState.deleteMany({
			where: { key: { startsWith: AVAILABILITY_KEY_PREFIX, not: key } },
		}),
		prisma.blvdSyncState.upsert({
			where: { key },
			create: { key, value: json },
			update: { value: json },
		}),
	])
}
