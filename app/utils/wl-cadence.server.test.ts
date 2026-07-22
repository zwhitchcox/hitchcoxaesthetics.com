import { describe, expect, test } from 'vitest'
import {
	buildWlProfiles,
	valueWlVisit,
	type WlSimState,
} from './wl-cadence.server.ts'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.parse('2026-06-01T12:00:00Z')

describe('buildWlProfiles', () => {
	test('weekly per-shot payer: pays every visit at their own price', () => {
		const payments = [0, 7, 14, 21].map(d => ({
			clientId: 'weekly',
			atMs: T0 + d * DAY,
			usd: 85,
		}))
		const visits = [0, 7, 14, 21].map(d => ({
			clientId: 'weekly',
			atMs: T0 + d * DAY,
		}))
		const profile = buildWlProfiles(payments, visits).get('weekly')!
		expect(profile.paysEveryVisit).toBe(true)
		expect(profile.avgPaidUsd).toBe(85)
	})

	test('monthly renewer visiting weekly: pays less often than they visit', () => {
		const payments = [0, 28].map(d => ({
			clientId: 'monthly',
			atMs: T0 + d * DAY,
			usd: 500,
		}))
		const visits = [0, 7, 14, 21, 28, 35].map(d => ({
			clientId: 'monthly',
			atMs: T0 + d * DAY,
		}))
		const profile = buildWlProfiles(payments, visits).get('monthly')!
		expect(profile.paysEveryVisit).toBe(false)
		expect(profile.medPayIntervalDays).toBe(28)
	})

	test('payments-only mode infers cadence from payment spacing', () => {
		const weekly = buildWlProfiles(
			[0, 7, 14].map(d => ({ clientId: 'a', atMs: T0 + d * DAY, usd: 85 })),
			[],
		).get('a')!
		const monthly = buildWlProfiles(
			[0, 28, 56].map(d => ({ clientId: 'b', atMs: T0 + d * DAY, usd: 500 })),
			[],
		).get('b')!
		expect(weekly.paysEveryVisit).toBe(true)
		expect(monthly.paysEveryVisit).toBe(false)
	})
})

describe('valueWlVisit', () => {
	const profiles = buildWlProfiles(
		[
			...[0, 28].map(d => ({ clientId: 'renewer', atMs: T0 + d * DAY, usd: 500 })),
			...[0, 7, 14, 21].map(d => ({ clientId: 'shots', atMs: T0 + d * DAY, usd: 85 })),
		],
		[
			...[0, 7, 14, 21, 28].map(d => ({ clientId: 'renewer', atMs: T0 + d * DAY })),
			...[0, 7, 14, 21].map(d => ({ clientId: 'shots', atMs: T0 + d * DAY })),
			...[0, 7].map(d => ({ clientId: 'comp', atMs: T0 + d * DAY })),
		],
	)

	test('unknown client gets the per-kept-visit fallback', () => {
		const { usd, kind } = valueWlVisit({
			clientId: 'stranger',
			visitAtMs: T0 + 40 * DAY,
			profile: undefined,
			fallbackUsd: 120,
		})
		expect(kind).toBe('new_client')
		expect(usd).toBe(120)
	})

	test('repeat visitor who never pays expects $0', () => {
		const { usd, kind } = valueWlVisit({
			clientId: 'comp',
			visitAtMs: T0 + 40 * DAY,
			profile: profiles.get('comp'),
			fallbackUsd: 120,
		})
		expect(kind).toBe('non_paying')
		expect(usd).toBe(0)
	})

	test('per-shot payer expects their own price every visit', () => {
		const { usd, kind } = valueWlVisit({
			clientId: 'shots',
			visitAtMs: T0 + 40 * DAY,
			profile: profiles.get('shots'),
			fallbackUsd: 120,
		})
		expect(kind).toBe('per_visit')
		expect(usd).toBe(85)
	})

	test('monthly renewer: renewal on the due visit, $0 mid-cycle, cycle advances', () => {
		const sim: WlSimState = new Map()
		const renewer = profiles.get('renewer')
		// last paid day 28; due again ~day 53 (28d cycle − 3d tolerance)
		const midCycle = valueWlVisit({
			clientId: 'renewer',
			visitAtMs: T0 + 35 * DAY,
			profile: renewer,
			fallbackUsd: 120,
			sim,
		})
		expect(midCycle).toEqual({ usd: 0, kind: 'mid_cycle' })
		const renewal = valueWlVisit({
			clientId: 'renewer',
			visitAtMs: T0 + 56 * DAY,
			profile: renewer,
			fallbackUsd: 120,
			sim,
		})
		expect(renewal.kind).toBe('renewal')
		expect(renewal.usd).toBe(500)
		// The very next visit after an assigned renewal is mid-cycle again.
		const afterRenewal = valueWlVisit({
			clientId: 'renewer',
			visitAtMs: T0 + 63 * DAY,
			profile: renewer,
			fallbackUsd: 120,
			sim,
		})
		expect(afterRenewal).toEqual({ usd: 0, kind: 'mid_cycle' })
	})
})

describe('computeLapsedPatients', async () => {
	const { computeLapsedPatients } = await import('./lapsed-patients.server.ts')
	const T0 = Date.parse('2026-01-05T15:00:00Z')
	const DAY = 24 * 60 * 60 * 1000
	const NOW = new Date('2026-07-22T15:00:00Z')
	const visit = (clientId: string, day: number, services = ['Existing Client Tox']) => ({
		clientId,
		clientName: clientId,
		phone: null,
		serviceNames: services,
		startAtMs: T0 + day * DAY,
	})

	test('regular client inside their rhythm is active; far past it is lapsed', () => {
		// tox-90d population so the service cadence exists
		const crowd = ['a', 'b', 'c'].flatMap(id => [0, 90, 180].map(d => visit(id, d)))
		// on-rhythm client: last visit 60 days ago, cadence 90d
		const onTime = [0, 90].map(d => visit('ontime', d))
		// lapsed client: 3 visits every 30 days, last one 138 days before NOW
		const gone = [0, 30, 60].map(d => visit('gone', d))
		const rows = computeLapsedPatients([...crowd, ...onTime, ...gone], new Set(), NOW)
		const byId = new Map(rows.map(r => [r.clientId, r]))
		expect(byId.get('ontime')!.status).toBe('active')
		expect(byId.get('gone')!.status).toBe('lapsed')
	})

	test('whichever is later wins: sparse personal cadence beats a tight service one', () => {
		const crowd = ['a', 'b', 'c'].flatMap(id => [0, 30, 60].map(d => visit(id, d)))
		// personal rhythm ~150d, service says 30d, but their own history says wait
		const sparse = [0, 150].concat([]).map(d => visit('sparse', d))
		const rows = computeLapsedPatients([...crowd, ...sparse], new Set(), new Date(T0 + 190 * DAY))
		const row = rows.find(r => r.clientId === 'sparse')!
		expect(row.status).toBe('active') // 40d since last, service says 30+sd, but... personal needs 3 visits; 2 visits → service cadence applies
	})

	test('future booking always overrides lapsed', () => {
		const gone = [0, 30, 60].map(d => visit('gone', d))
		const rows = computeLapsedPatients(gone, new Set(['gone']), NOW)
		expect(rows.find(r => r.clientId === 'gone')!.status).toBe('booked')
	})

	test('consult-only client with nothing booked becomes never_converted', () => {
		const rows = computeLapsedPatients(
			[visit('lead', 0, ['Weight Loss Consultation (In-Person)'])],
			new Set(),
			NOW,
		)
		expect(rows.find(r => r.clientId === 'lead')!.status).toBe('never_converted')
	})
})
