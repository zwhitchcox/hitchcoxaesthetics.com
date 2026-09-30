import { describe, expect, test } from 'vitest'
import { type BalanceRow, groupBalances } from './plaid-balances.ts'

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
