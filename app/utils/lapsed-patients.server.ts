/**
 * Lapsed-patient detection: who has quietly stopped coming?
 *
 * Each client gets an expected-return date and is overdue once today is past
 * it. The date comes from (whichever is LATER, benefit of the doubt):
 *   - personal cadence: mean of their own visit intervals + 1 SD (3+ visits)
 *   - service cadence: the median rebook interval + 1 SD for their last
 *     visit's service, measured across all clients (for 1-2 visit clients)
 * with a global-cadence fallback when neither exists. Clients with a future
 * appointment are never lapsed; clients who only ever had a consultation are
 * a separate "never converted" bucket (a lost lead, not a lapsed patient).
 *
 * Runs daily on the Temporal worker; writes the `lapsed_patients` table in
 * the reports Postgres (snapshot semantics) for /admin/reports/retention.
 */
import pg from 'pg'

import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
} from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'

const EXCLUDED_CLIENT_NAMES = new Set(['zane hitchcox'])
const HISTORY_START = '2024-06-01T00:00:00'
const DAY_MS = 24 * 60 * 60 * 1000
/** Gaps longer than this are treated as separate episodes, not a cadence. */
const MAX_INTERVAL_DAYS = 400
/** Minimum cross-client interval samples before a service cadence is trusted. */
const MIN_SERVICE_SAMPLES = 6
const CONSULT_RE = /consult/i
/** A consult with no purchase and no rebook is "never converted" after this. */
const NEVER_CONVERTED_AFTER_DAYS = 30

export function hasLapsedPatientsConfig() {
	return Boolean(
		process.env.REPORTS_DATABASE_URL?.trim() &&
			process.env.BLVD_API_KEY?.trim() &&
			process.env.BLVD_BUSINESS_ID?.trim(),
	)
}

export type VisitRecord = {
	clientId: string
	clientName: string
	phone: string | null
	serviceNames: string[]
	startAtMs: number
}

export type LapsedRow = {
	clientId: string
	clientName: string
	phone: string | null
	visitCount: number
	lastVisitAtMs: number
	lastServices: string[]
	usualIntervalDays: number | null
	intervalSource: 'personal' | 'service' | 'global'
	dueAtMs: number
	overdueDays: number
	status: 'booked' | 'active' | 'lapsed' | 'never_converted'
}

function mean(values: number[]) {
	return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stdev(values: number[]) {
	if (values.length < 2) return 0
	const m = mean(values)
	return Math.sqrt(mean(values.map(v => (v - m) ** 2)))
}

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.floor(sorted.length / 2)] ?? 0
}

const normalizeService = (name: string) => name.trim().toLowerCase()

/** Pure so the cadence logic is unit-testable. */
export function computeLapsedPatients(
	pastVisits: VisitRecord[],
	futureClientIds: Set<string>,
	now = new Date(),
): LapsedRow[] {
	const nowMs = now.getTime()
	const byClient = new Map<string, VisitRecord[]>()
	for (const visit of pastVisits) {
		if (!byClient.has(visit.clientId)) byClient.set(visit.clientId, [])
		byClient.get(visit.clientId)!.push(visit)
	}

	// Cross-client service cadences: per client, intervals between successive
	// visits that include the service; pooled per service.
	const serviceIntervals = new Map<string, number[]>()
	const allIntervals: number[] = []
	for (const visits of byClient.values()) {
		const sorted = [...visits].sort((a, b) => a.startAtMs - b.startAtMs)
		const lastSeenByService = new Map<string, number>()
		for (const visit of sorted) {
			for (const rawName of visit.serviceNames) {
				const name = normalizeService(rawName)
				const prev = lastSeenByService.get(name)
				if (prev != null) {
					const days = (visit.startAtMs - prev) / DAY_MS
					if (days >= 1 && days <= MAX_INTERVAL_DAYS) {
						if (!serviceIntervals.has(name)) serviceIntervals.set(name, [])
						serviceIntervals.get(name)!.push(days)
					}
				}
				lastSeenByService.set(name, visit.startAtMs)
			}
		}
		for (let i = 1; i < sorted.length; i++) {
			const days = (sorted[i]!.startAtMs - sorted[i - 1]!.startAtMs) / DAY_MS
			if (days >= 1 && days <= MAX_INTERVAL_DAYS) allIntervals.push(days)
		}
	}
	const serviceStats = new Map<string, { typicalDays: number }>()
	for (const [name, intervals] of serviceIntervals) {
		if (intervals.length < MIN_SERVICE_SAMPLES) continue
		serviceStats.set(name, {
			typicalDays: median(intervals) + Math.max(stdev(intervals), 7),
		})
	}
	const globalTypicalDays = allIntervals.length
		? median(allIntervals) + Math.max(stdev(allIntervals), 7)
		: 60

	const rows: LapsedRow[] = []
	for (const [clientId, visits] of byClient) {
		const sorted = [...visits].sort((a, b) => a.startAtMs - b.startAtMs)
		const last = sorted.at(-1)!
		const consultOnly = sorted.every(v =>
			v.serviceNames.every(n => CONSULT_RE.test(n)),
		)

		// Personal cadence: their own rhythm, with 1 SD of slack (floored so a
		// perfectly regular client isn't flagged the day after their usual gap).
		let personalDueMs: number | null = null
		let personalIntervalDays: number | null = null
		if (sorted.length >= 3) {
			const intervals: number[] = []
			for (let i = 1; i < sorted.length; i++) {
				const days = (sorted[i]!.startAtMs - sorted[i - 1]!.startAtMs) / DAY_MS
				if (days >= 1 && days <= MAX_INTERVAL_DAYS) intervals.push(days)
			}
			if (intervals.length >= 2) {
				const m = mean(intervals)
				personalIntervalDays = m
				personalDueMs =
					last.startAtMs +
					(m + Math.max(stdev(intervals), 7, m * 0.25)) * DAY_MS
			}
		}

		// Service cadence of the last visit's services (the longest one, so a
		// tox client who also grabbed a facial lapses on the tox clock).
		let serviceDueMs: number | null = null
		let serviceIntervalDays: number | null = null
		for (const rawName of last.serviceNames) {
			const stats = serviceStats.get(normalizeService(rawName))
			if (!stats) continue
			const due = last.startAtMs + stats.typicalDays * DAY_MS
			if (serviceDueMs == null || due > serviceDueMs) {
				serviceDueMs = due
				serviceIntervalDays = stats.typicalDays
			}
		}

		let dueAtMs: number
		let intervalSource: LapsedRow['intervalSource']
		let usualIntervalDays: number | null
		if (personalDueMs != null && serviceDueMs != null) {
			// Whichever is later, benefit of the doubt.
			if (personalDueMs >= serviceDueMs) {
				dueAtMs = personalDueMs
				intervalSource = 'personal'
				usualIntervalDays = personalIntervalDays
			} else {
				dueAtMs = serviceDueMs
				intervalSource = 'service'
				usualIntervalDays = serviceIntervalDays
			}
		} else if (personalDueMs != null) {
			dueAtMs = personalDueMs
			intervalSource = 'personal'
			usualIntervalDays = personalIntervalDays
		} else if (serviceDueMs != null) {
			dueAtMs = serviceDueMs
			intervalSource = 'service'
			usualIntervalDays = serviceIntervalDays
		} else {
			dueAtMs = last.startAtMs + globalTypicalDays * DAY_MS
			intervalSource = 'global'
			usualIntervalDays = globalTypicalDays
		}
		if (consultOnly) {
			dueAtMs = last.startAtMs + NEVER_CONVERTED_AFTER_DAYS * DAY_MS
		}

		const status: LapsedRow['status'] = futureClientIds.has(clientId)
			? 'booked'
			: consultOnly
				? nowMs > dueAtMs
					? 'never_converted'
					: 'active'
				: nowMs > dueAtMs
					? 'lapsed'
					: 'active'

		rows.push({
			clientId,
			clientName: last.clientName,
			phone: last.phone,
			visitCount: sorted.length,
			lastVisitAtMs: last.startAtMs,
			lastServices: last.serviceNames,
			usualIntervalDays:
				usualIntervalDays != null ? Math.round(usualIntervalDays) : null,
			intervalSource,
			dueAtMs,
			overdueDays: Math.round((nowMs - dueAtMs) / DAY_MS),
			status,
		})
	}

	return rows.sort((a, b) => b.overdueDays - a.overdueDays)
}

async function fetchVisits(now: Date) {
	const locations = await listBlvdAdminLocations()
	const pastVisits: VisitRecord[] = []
	const futureClientIds = new Set<string>()
	const nowMs = now.getTime()

	for (const location of locations) {
		let after: string | null = null
		for (let page = 0; page < 200; page++) {
			const res: any = await boulevardAdminFetch(
				`query LapsedAppointments($after: String, $locationId: ID!) {
					appointments(first: 100, after: $after, locationId: $locationId,
						query: "startAt >= '${HISTORY_START}'") {
						pageInfo { endCursor hasNextPage }
						edges { node {
							id startAt cancelled state
							client { id name mobilePhone }
							appointmentServices { service { name } }
						} }
					}
				}`,
				{ after, locationId: location.id },
			)
			for (const edge of res.appointments?.edges ?? []) {
				const node = edge?.node
				if (!node?.id || !node.client?.id || !node.startAt) continue
				if (node.cancelled || node.state === 'CANCELLED' || node.state === 'NO_SHOW')
					continue
				const clientName = (node.client.name ?? '').trim()
				if (EXCLUDED_CLIENT_NAMES.has(clientName.toLowerCase())) continue
				const startAtMs = Date.parse(node.startAt)
				if (!Number.isFinite(startAtMs)) continue
				if (startAtMs > nowMs) {
					futureClientIds.add(node.client.id)
					continue
				}
				pastVisits.push({
					clientId: node.client.id,
					clientName,
					phone: node.client.mobilePhone ?? null,
					serviceNames: (node.appointmentServices ?? [])
						.map((s: any) => s.service?.name)
						.filter(Boolean),
					startAtMs,
				})
			}
			if (!res.appointments?.pageInfo?.hasNextPage) break
			after = res.appointments.pageInfo.endCursor
		}
	}

	return { pastVisits, futureClientIds }
}

export async function syncLapsedPatients(): Promise<{
	clients: number
	lapsed: number
	neverConverted: number
}> {
	const url = process.env.REPORTS_DATABASE_URL?.trim()
	if (!url) throw new Error('REPORTS_DATABASE_URL is not set')

	const now = new Date()
	const { pastVisits, futureClientIds } = await fetchVisits(now)
	const rows = computeLapsedPatients(pastVisits, futureClientIds, now)

	// Lifetime value from the local revenue archive.
	const value = await prisma.blvdRevenueItem.groupBy({
		by: ['boulevardClientId'],
		where: { boulevardClientId: { not: null } },
		_sum: { grossAmountUsd: true },
	})
	const valueByClient = new Map(
		value.map(v => [v.boulevardClientId!, v._sum.grossAmountUsd ?? 0]),
	)

	const client = new pg.Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(`drop table if exists lapsed_patients`)
		await client.query(`create table lapsed_patients (
			client_id text primary key,
			client_name text not null,
			phone text,
			visit_count int not null,
			last_visit_at timestamptz not null,
			last_services text,
			usual_interval_days int,
			interval_source text not null,
			due_at timestamptz not null,
			overdue_days int not null,
			status text not null,
			lifetime_usd numeric not null,
			computed_at timestamptz not null default now()
		)`)
		for (const row of rows) {
			await client.query(
				`insert into lapsed_patients
				 (client_id, client_name, phone, visit_count, last_visit_at,
				  last_services, usual_interval_days, interval_source, due_at,
				  overdue_days, status, lifetime_usd)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
				[
					row.clientId,
					row.clientName,
					row.phone,
					row.visitCount,
					new Date(row.lastVisitAtMs),
					row.lastServices.join(' + '),
					row.usualIntervalDays,
					row.intervalSource,
					new Date(row.dueAtMs),
					row.overdueDays,
					row.status,
					Math.round(valueByClient.get(row.clientId) ?? 0),
				],
			)
		}
		await client.query(
			`grant select on lapsed_patients to metabase_ro`,
		)
	} finally {
		await client.end().catch(() => {})
	}

	return {
		clients: rows.length,
		lapsed: rows.filter(r => r.status === 'lapsed').length,
		neverConverted: rows.filter(r => r.status === 'never_converted').length,
	}
}
