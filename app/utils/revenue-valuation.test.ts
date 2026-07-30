import { expect, test } from 'vitest'

import {
	buildKeptProbability,
	buildServiceValues,
	buildWeightLossClientValues,
	detectRevenueCoverageStart,
	normalizeServiceName,
	serviceKey,
} from './revenue-valuation.server.ts'

const visit = (o: Partial<Parameters<typeof buildServiceValues>[0]['visits'][number]> = {}) => ({
	clientId: null,
	day: '2026-05-01',
	kept: true,
	serviceId: null,
	serviceName: 'Botox',
	...o,
})
const payment = (o: Partial<Parameters<typeof buildServiceValues>[0]['payments'][number]> = {}) => ({
	clientId: null,
	day: '2026-05-01',
	serviceId: null,
	serviceName: 'Botox',
	usd: 100,
	...o,
})

test('normalizes the two ways Boulevard names the same service', () => {
	expect(normalizeServiceName('Weight Loss Injection | *In Person*')).toBe(
		normalizeServiceName('Weight Loss Injection (In Person)'),
	)
	expect(normalizeServiceName('Hylenex® - Filler Dissolve')).toBe('hylenex filler dissolve')
})

test('service key prefers the id and falls back to the name', () => {
	expect(serviceKey('urn:blvd:Service:1', 'Botox')).toBe('service:urn:blvd:Service:1')
	expect(serviceKey(null, 'New Client Tox')).toBe('name:new client tox')
})

test('coverage starts at the first day money actually landed, not the migration dump', () => {
	expect(
		detectRevenueCoverageStart([
			{ day: '2026-03-19', usd: 0 },
			{ day: '2026-03-19', usd: 0 },
			{ day: '2026-03-23', usd: 880 },
			{ day: '2026-03-24', usd: 400 },
		]),
	).toBe('2026-03-23')
	expect(detectRevenueCoverageStart([])).toBeNull()
	expect(detectRevenueCoverageStart([{ day: '2026-03-19', usd: 0 }])).toBeNull()
})

test('a service is worth its revenue per KEPT visit, so no-shows price in', () => {
	// 4 kept visits, only 2 of them collected $400 each.
	const { lookup } = buildServiceValues({
		shrinkK: 0,
		visits: Array.from({ length: 4 }, () => visit()),
		payments: [payment({ usd: 400 }), payment({ usd: 400 })],
	})
	expect(lookup(null, 'Botox')).toBe(200)
})

test('cancelled visits are not in the denominator', () => {
	const { lookup } = buildServiceValues({
		shrinkK: 0,
		visits: [visit(), visit(), visit({ kept: false }), visit({ kept: false })],
		payments: [payment({ usd: 300 }), payment({ usd: 300 })],
	})
	expect(lookup(null, 'Botox')).toBe(300)
})

test('the old <50%-collect deflation no longer fires on a service that does collect', () => {
	// 20 kept visits, 18 paid $500: the v2 rule saw a short revenue window and
	// mispriced this at revenue/kept-over-365d. v4 must land near $450.
	const { lookup } = buildServiceValues({
		shrinkK: 0,
		visits: Array.from({ length: 20 }, () => visit({ serviceName: 'Existing Client Tox' })),
		payments: Array.from({ length: 18 }, () => payment({ serviceName: 'Existing Client Tox', usd: 500 })),
	})
	expect(lookup(null, 'Existing Client Tox')).toBe(450)
})

test('payments never divide by fewer visits than there were payments', () => {
	const { lookup } = buildServiceValues({
		shrinkK: 0,
		visits: [visit({ serviceName: 'Laser' })],
		payments: [
			payment({ serviceName: 'Laser', usd: 100 }),
			payment({ serviceName: 'Laser', usd: 100 }),
		],
	})
	expect(lookup(null, 'Laser')).toBe(100)
})

test('shrinkage pulls a thin sample toward the global average', () => {
	const visits = [
		...Array.from({ length: 50 }, () => visit({ serviceName: 'Common' })),
		visit({ serviceName: 'Rare' }),
	]
	const payments = [
		...Array.from({ length: 50 }, () => payment({ serviceName: 'Common', usd: 100 })),
		payment({ serviceName: 'Rare', usd: 1000 }),
	]
	const { lookup, prior } = buildServiceValues({ shrinkK: 3, visits, payments })
	expect(Math.round(prior)).toBe(118) // 6000 / 51
	// one $1000 sighting must not be taken at face value
	expect(lookup(null, 'Rare')).toBeLessThan(1000)
	expect(lookup(null, 'Rare')).toBeGreaterThan(prior)
	// a well-sampled service barely moves
	expect(lookup(null, 'Common')).toBeGreaterThan(99)
	expect(lookup(null, 'Common')).toBeLessThan(102)
})

test('an unseen service falls back to the prior, not to zero', () => {
	const { lookup, prior } = buildServiceValues({
		shrinkK: 3,
		visits: Array.from({ length: 10 }, () => visit()),
		payments: Array.from({ length: 10 }, () => payment({ usd: 200 })),
	})
	expect(prior).toBe(200)
	expect(lookup(null, 'Brand New Service')).toBe(200)
})

test('a name-keyed payment still matches an id-keyed visit', () => {
	const { lookup } = buildServiceValues({
		shrinkK: 0,
		visits: [visit({ serviceId: 'urn:x', serviceName: 'Weight Loss Injection | *In Person*' })],
		payments: [payment({ serviceId: null, serviceName: 'Weight Loss Injection (In Person)', usd: 90 })],
	})
	expect(lookup('urn:x', 'Weight Loss Injection | *In Person*')).toBe(90)
})

test('weight loss spreads a client payments over their own visits', () => {
	const wl = 'Weight Loss Injection | *In Person*'
	const { lookup } = buildWeightLossClientValues({
		shrinkK: 0,
		visits: [
			...Array.from({ length: 4 }, () => visit({ clientId: 'monthly', serviceName: wl })),
			...Array.from({ length: 4 }, () => visit({ clientId: 'weekly', serviceName: wl })),
		],
		payments: [
			payment({ clientId: 'monthly', serviceName: wl, usd: 400 }),
			...Array.from({ length: 4 }, () => payment({ clientId: 'weekly', serviceName: wl, usd: 85 })),
		],
	})
	// monthly renewer: $400 once across 4 visits = $100/visit, every week
	expect(lookup('monthly')).toBe(100)
	// weekly payer: $85 every visit
	expect(lookup('weekly')).toBe(85)
})

test('a weight loss client with no history gets the injection prior', () => {
	const wl = 'Weight Loss Injection | *In Person*'
	const { lookup, prior } = buildWeightLossClientValues({
		shrinkK: 0,
		visits: Array.from({ length: 10 }, () => visit({ clientId: 'known', serviceName: wl })),
		payments: Array.from({ length: 10 }, () => payment({ clientId: 'known', serviceName: wl, usd: 150 })),
	})
	expect(prior).toBe(150)
	expect(lookup('brand-new')).toBe(150)
	expect(lookup(null)).toBe(150)
})

test('a package client who never pays is valued near zero, not at the average', () => {
	const wl = 'Weight Loss Injection | *In Person*'
	const { lookup } = buildWeightLossClientValues({
		shrinkK: 0,
		visits: [
			...Array.from({ length: 8 }, () => visit({ clientId: 'comped', serviceName: wl })),
			...Array.from({ length: 8 }, () => visit({ clientId: 'payer', serviceName: wl })),
		],
		payments: Array.from({ length: 8 }, () => payment({ clientId: 'payer', serviceName: wl, usd: 100 })),
	})
	expect(lookup('comped')).toBe(0)
	expect(lookup('payer')).toBe(100)
})

test('kept probability rises as the appointment gets closer', () => {
	const appointments = [
		// 40 booked 30+ days out, half of them cancel
		...Array.from({ length: 20 }, () => ({ cancelled: true, leadDays: 30 })),
		...Array.from({ length: 20 }, () => ({ cancelled: false, leadDays: 30 })),
		// 40 booked same-day, none cancel
		...Array.from({ length: 40 }, () => ({ cancelled: false, leadDays: 0 })),
	]
	const keptProbability = buildKeptProbability(appointments)
	// at 30 days out only the far-booked ones are on the books
	expect(keptProbability(30)).toBe(0.5)
	// at 0 days out everything is on the books: 60 kept of 80
	expect(keptProbability(0)).toBe(0.75)
	expect(keptProbability(0)).toBeGreaterThan(keptProbability(30))
})

test('kept probability falls back rather than trusting a thin bucket', () => {
	const keptProbability = buildKeptProbability([{ cancelled: true, leadDays: 60 }])
	expect(keptProbability(60)).toBe(0.8)
})

test('weight-loss client kinds describe how the value was reached', () => {
	const wl = 'Weight Loss Injection | *In Person*'
	const { describe: describeClient } = buildWeightLossClientValues({
		shrinkK: 0,
		visits: [
			...Array.from({ length: 4 }, () => visit({ clientId: 'weekly', serviceName: wl })),
			...Array.from({ length: 4 }, () => visit({ clientId: 'monthly', serviceName: wl })),
			...Array.from({ length: 4 }, () => visit({ clientId: 'comped', serviceName: wl })),
		],
		payments: [
			// pays at every visit, on four separate days
			...['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22'].map(day =>
				payment({ clientId: 'weekly', serviceName: wl, usd: 85, day }),
			),
			// one payment covering four visits
			payment({ clientId: 'monthly', serviceName: wl, usd: 400, day: '2026-05-01' }),
		],
	})
	expect(describeClient('weekly').kind).toBe('per_visit')
	expect(describeClient('monthly').kind).toBe('spread')
	expect(describeClient('comped').kind).toBe('never_pays')
	expect(describeClient('unseen').kind).toBe('new_client')
	expect(describeClient(null).kind).toBe('new_client')
})

test('several lines on one day count as a single payment event', () => {
	const wl = 'Weight Loss Injection | *In Person*'
	const { describe: describeClient } = buildWeightLossClientValues({
		shrinkK: 0,
		visits: Array.from({ length: 4 }, () => visit({ clientId: 'c', serviceName: wl })),
		// one $400 renewal that Boulevard split into three lines, same day
		payments: Array.from({ length: 3 }, () =>
			payment({ clientId: 'c', serviceName: wl, usd: 133.34, day: '2026-05-01' }),
		),
	})
	const d = describeClient('c')
	expect(d.payCount).toBe(1)
	expect(d.visitCount).toBe(4)
	// 1 pay event over 4 visits is a renewer, not a per-visit payer
	expect(d.kind).toBe('spread')
	expect(Math.round(d.usdPerVisit)).toBe(100)
})
