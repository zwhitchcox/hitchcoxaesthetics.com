import { describe, expect, test } from 'vitest'
import {
	type BalanceRow,
	type BalanceSnapshot,
	bankCheck,
	groupBalances,
} from './plaid-balances.ts'

const row = (patch: Partial<BalanceRow>): BalanceRow => ({
	accountId: 'a',
	owner: 'zane',
	institution: 'Bank',
	name: 'Checking',
	mask: null,
	type: 'depository',
	subtype: 'checking',
	current: 0,
	available: null,
	creditLimit: null,
	...patch,
})

describe('groupBalances', () => {
	test('bank balances are cash, cards and loans are owed, net is the difference', () => {
		const { groups, cash, owed, net } = groupBalances([
			row({ accountId: '1', owner: 'zane', current: 1000 }),
			row({ accountId: '2', owner: 'zane', type: 'credit', subtype: 'credit card', current: 250 }),
			row({ accountId: '3', owner: 'zane', type: 'loan', subtype: 'line of credit', current: 400 }),
			row({ accountId: '4', owner: 'sarah', current: 5000 }),
			row({ accountId: '5', owner: 'sarah', type: 'credit', current: 2000 }),
		])
		expect(groups.map(g => g.label)).toEqual(['Business', 'Personal'])
		expect(groups[0]).toMatchObject({ owner: 'sarah', cash: 5000, owed: 2000, net: 3000 })
		expect(groups[1]).toMatchObject({ owner: 'zane', cash: 1000, owed: 650, net: 350 })
		expect(groups[1]!.rows.map(r => r.accountId)).toEqual(['1', '2', '3'])
		expect({ cash, owed, net }).toEqual({ cash: 6000, owed: 2650, net: 3350 })
	})

	test('a missing balance counts as zero and an unknown owner keeps its own group', () => {
		const { groups } = groupBalances([row({ accountId: '1', owner: null, current: null })])
		expect(groups).toHaveLength(1)
		expect(groups[0]).toMatchObject({ owner: 'other', label: 'other', cash: 0, owed: 0, net: 0 })
	})

	test('no accounts means no groups and zero totals', () => {
		expect(groupBalances([])).toEqual({ groups: [], cash: 0, owed: 0, net: 0 })
	})
})

describe('bankCheck', () => {
	const snap = (day: string, accountId: string, type: string, current: number): BalanceSnapshot => ({
		day,
		accountId,
		type,
		current,
	})

	test('no snapshot, no check; one snapshot day, not ready yet', () => {
		expect(bankCheck([], [])).toBeNull()
		expect(bankCheck([snap('2026-10-27', 'chk', 'depository', 100)], [])).toEqual({
			from: '2026-10-27',
			to: '2026-10-27',
			ready: false,
		})
	})

	test('cash up and card debt up: the bank change is the net of the two', () => {
		const check = bankCheck(
			[
				snap('2026-10-27', 'chk', 'depository', 1000),
				snap('2026-10-27', 'card', 'credit', 500),
				snap('2026-11-03', 'chk', 'depository', 1800),
				snap('2026-11-03', 'card', 'credit', 900),
			],
			[
				// The snapshot day itself is already in the first balance.
				{ day: '2026-10-27', kept: 5000, saved: 0 },
				{ day: '2026-10-30', kept: 300, saved: 0 },
				{ day: '2026-11-02', kept: 200, saved: 100 },
			],
		)
		expect(check).toEqual({
			from: '2026-10-27',
			to: '2026-11-03',
			ready: true,
			bank: 400,
			kept: 500,
			saved: 100,
			diff: 0,
		})
	})

	test('a newly linked account is not counted as a gain', () => {
		const check = bankCheck(
			[
				snap('2026-10-27', 'chk', 'depository', 1000),
				snap('2026-10-28', 'chk', 'depository', 1000),
				snap('2026-10-28', 'new', 'depository', 9000),
			],
			[],
		)
		expect(check).toMatchObject({ bank: 0, diff: 0 })
	})

	test('the check window is the last 3 months of snapshots', () => {
		const check = bankCheck(
			[
				snap('2026-01-01', 'chk', 'depository', 0),
				snap('2026-08-15', 'chk', 'depository', 100),
				snap('2026-11-01', 'chk', 'depository', 300),
			],
			[],
		)
		expect(check).toMatchObject({ from: '2026-08-15', to: '2026-11-01', bank: 200 })
	})
})
