/**
 * Appointment ledger, an owned, append-only record of what happened to every
 * appointment, built by diffing Boulevard's current state against our last
 * snapshot. This exists because Boulevard sometimes represents a cancellation
 * as a REMOVAL (the appointment simply vanishes), which no live query can
 * see, the class of loss that made a client's cancellation invisible.
 *
 * Tables (reports Postgres):
 *  - appointment_snapshot: latest known state per appointment (rolling window)
 *  - appointment_change_log: append-only events, booked / cancelled /
 *    no_show / removed. Never updated, never deleted.
 */
import { boulevardAdminFetch, listBlvdAdminLocations } from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { hasReportsDb, reportsDb } from '#app/utils/reports-db.server.ts'

// Same exclusions as the appointment-performance page (Zane's test bookings).
const EXCLUDED_CLIENT_NAMES = new Set(['zane hitchcox'])
// Prepaid packages: paid once up front, a cancelled $0-booked follow-up
// visit loses $0, not the package's average ticket.
const PREPAID_PACKAGE = /laser hair reduction|everesse|skin tightening/i

const LOOKBACK_MS = 7 * 24 * 3600 * 1000
const LOOKAHEAD_MS = 60 * 24 * 3600 * 1000
// Removal detection stays a day inside the fetch window so appointments aging
// across the boundary never read as "removed".
const REMOVAL_MARGIN_MS = 24 * 3600 * 1000

interface ApptNode {
	id?: string | null
	startAt?: string | null
	state?: string | null
	cancelled?: boolean | null
	cancellation?: { reason?: string | null } | null
	client?: { name?: string | null } | null
	appointmentServices?: Array<{
		price?: number | null
		service?: { name?: string | null } | null
	}> | null
}

export function hasAppointmentLedgerConfig() {
	return hasReportsDb() && Boolean(process.env.BLVD_API_KEY?.trim())
}

async function avgPaidTicketByName(names: string[]) {
	if (names.length === 0) return new Map<string, number>()
	const items = await prisma.blvdRevenueItem.groupBy({
		by: ['itemName'],
		where: {
			itemName: { in: names },
			grossAmountUsd: { gt: 0 },
			occurredAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
		},
		_avg: { grossAmountUsd: true },
	})
	return new Map(items.map(i => [i.itemName, i._avg.grossAmountUsd ?? 0]))
}

export async function syncAppointmentLedger(): Promise<{
	seen: number
	changes: number
}> {
	const pool = reportsDb()
	await pool.query(`
		CREATE TABLE IF NOT EXISTS appointment_snapshot (
			appointment_id TEXT PRIMARY KEY,
			location TEXT, client_name TEXT, services TEXT,
			start_at TIMESTAMPTZ, state TEXT, cancelled BOOLEAN,
			cancellation_reason TEXT, expected_usd NUMERIC,
			first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
			last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	await pool.query(`
		CREATE TABLE IF NOT EXISTS appointment_change_log (
			id BIGSERIAL PRIMARY KEY,
			detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			appointment_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			client_name TEXT, services TEXT, start_at TIMESTAMPTZ,
			expected_usd NUMERIC, detail TEXT
		)`)
	await pool.query(
		`CREATE INDEX IF NOT EXISTS appointment_change_log_detected_at
		 ON appointment_change_log (detected_at)`,
	)

	const now = Date.now()
	const since = new Date(now - LOOKBACK_MS)
	const until = new Date(now + LOOKAHEAD_MS)

	const fetched: Array<ApptNode & { locationName: string }> = []
	for (const location of await listBlvdAdminLocations()) {
		let after: string | null = null
		for (let page = 0; page < 40; page++) {
			const res: any = await boulevardAdminFetch(
				`query LedgerAppointments($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId,
						query: "startAt >= '${since.toISOString()}' AND startAt <= '${until.toISOString()}'") {
						pageInfo { endCursor hasNextPage }
						edges { node {
							id startAt state cancelled
							cancellation { reason }
							client { name }
							appointmentServices { price service { name } }
						} }
					}
				}`,
				{ after, locationId: location.id },
			)
			for (const edge of res.appointments?.edges ?? []) {
				if (edge?.node?.id)
					fetched.push({ ...edge.node, locationName: location.name ?? location.id })
			}
			if (!res.appointments?.pageInfo?.hasNextPage) break
			after = res.appointments.pageInfo.endCursor
		}
	}

	const kept = fetched.filter(
		a => !EXCLUDED_CLIENT_NAMES.has((a.client?.name ?? '').trim().toLowerCase()),
	)
	const serviceNames = [
		...new Set(
			kept.flatMap(a =>
				(a.appointmentServices ?? [])
					.map(s => s.service?.name)
					.filter((n): n is string => Boolean(n)),
			),
		),
	]
	const avgByName = await avgPaidTicketByName(serviceNames)
	const expectedOf = (a: ApptNode) =>
		Math.round(
			(a.appointmentServices ?? []).reduce((sum, s) => {
				const booked = (s.price ?? 0) / 100
				const name = s.service?.name ?? ''
				if (booked > 0) return sum + booked
				if (PREPAID_PACKAGE.test(name)) return sum
				return sum + (avgByName.get(name) ?? 0)
			}, 0),
		)

	const prev = new Map<
		string,
		{ state: string | null; cancelled: boolean | null; start_at: Date | null }
	>()
	for (const row of (
		await pool.query(
			`SELECT appointment_id, state, cancelled, start_at FROM appointment_snapshot`,
		)
	).rows) {
		prev.set(row.appointment_id, row)
	}

	// First run has no baseline, record state without flooding the log with
	// a 'booked' event for every historical appointment.
	const bootstrap = prev.size === 0
	let changes = 0
	const log = async (
		kind: string,
		a: ApptNode & { locationName?: string },
		detail?: string,
	) => {
		await pool.query(
			`INSERT INTO appointment_change_log
			   (appointment_id, kind, client_name, services, start_at, expected_usd, detail)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			[
				a.id,
				kind,
				a.client?.name ?? null,
				(a.appointmentServices ?? [])
					.map(s => s.service?.name)
					.filter(Boolean)
					.join(', '),
				a.startAt ?? null,
				expectedOf(a),
				detail ?? null,
			],
		)
		changes++
	}

	for (const a of kept) {
		const before = prev.get(a.id!)
		const isNoShow =
			a.state === 'NO_SHOW' || a.cancellation?.reason === 'NO_SHOW'
		if (!before) {
			if (!bootstrap) await log('booked', a)
		} else {
			if (!before.cancelled && a.cancelled && !isNoShow)
				await log('cancelled', a, a.cancellation?.reason ?? undefined)
			if (before.state !== 'NO_SHOW' && isNoShow) await log('no_show', a)
		}
		await pool.query(
			`INSERT INTO appointment_snapshot
			   (appointment_id, location, client_name, services, start_at, state,
			    cancelled, cancellation_reason, expected_usd)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			 ON CONFLICT (appointment_id) DO UPDATE SET
			   state = excluded.state, cancelled = excluded.cancelled,
			   cancellation_reason = excluded.cancellation_reason,
			   start_at = excluded.start_at, expected_usd = excluded.expected_usd,
			   last_seen = now()`,
			[
				a.id,
				a.locationName,
				a.client?.name ?? null,
				(a.appointmentServices ?? [])
					.map(s => s.service?.name)
					.filter(Boolean)
					.join(', '),
				a.startAt ?? null,
				a.state ?? null,
				a.cancelled ?? false,
				a.cancellation?.reason ?? null,
				expectedOf(a),
			],
		)
	}

	// Anything we knew about, inside the safe window, that Boulevard no longer
	// returns at all, the invisible-cancellation class. Logged once, snapshot
	// marked REMOVED so it doesn't re-log every run.
	const removed = (
		await pool.query(
			`SELECT appointment_id, client_name, services, start_at, expected_usd
			 FROM appointment_snapshot
			 WHERE state IS DISTINCT FROM 'REMOVED'
			   AND cancelled IS NOT TRUE
			   AND start_at >= $1 AND start_at <= $2
			   AND last_seen < now() - interval '1 minute'`,
			[
				new Date(now - LOOKBACK_MS + REMOVAL_MARGIN_MS),
				new Date(now + LOOKAHEAD_MS - REMOVAL_MARGIN_MS),
			],
		)
	).rows.filter(r => !kept.some(a => a.id === r.appointment_id))
	for (const r of removed) {
		await pool.query(
			`INSERT INTO appointment_change_log
			   (appointment_id, kind, client_name, services, start_at, expected_usd, detail)
			 VALUES ($1,'removed',$2,$3,$4,$5,'disappeared from Boulevard without a cancellation')`,
			[r.appointment_id, r.client_name, r.services, r.start_at, r.expected_usd],
		)
		await pool.query(
			`UPDATE appointment_snapshot SET state = 'REMOVED', last_seen = now()
			 WHERE appointment_id = $1`,
			[r.appointment_id],
		)
		changes++
	}

	console.log(
		`[appointment-ledger] ${kept.length} appointments seen, ${changes} changes logged`,
	)
	return { seen: kept.length, changes }
}
