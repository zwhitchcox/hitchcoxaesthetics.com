/**
 * Groups the latest Plaid balances for the household profit page: one group
 * per owner (sarah = the business, zane = personal) with cash held, money
 * owed and the net of the two.
 */
export type BalanceRow = {
	accountId: string
	owner: string | null
	institution: string
	name: string
	mask: string | null
	type: string
	subtype: string | null
	current: number | null
	available: number | null
	creditLimit: number | null
}

export type BalanceGroup = {
	owner: string
	label: string
	rows: BalanceRow[]
	cash: number
	owed: number
	net: number
}

const OWNER_LABELS: Record<string, string> = {
	sarah: 'Business',
	zane: 'Personal',
}

/** A card or loan balance is money owed; every other balance is money held. */
export function isOwed(type: string) {
	return type === 'credit' || type === 'loan'
}

export function groupBalances(rows: BalanceRow[]): {
	groups: BalanceGroup[]
	cash: number
	owed: number
	net: number
} {
	const byOwner = new Map<string, BalanceGroup>()
	for (const row of rows) {
		const owner = row.owner ?? 'other'
		let group = byOwner.get(owner)
		if (!group) {
			group = {
				owner,
				label: OWNER_LABELS[owner] ?? owner,
				rows: [],
				cash: 0,
				owed: 0,
				net: 0,
			}
			byOwner.set(owner, group)
		}
		group.rows.push(row)
		const amount = row.current ?? 0
		if (isOwed(row.type)) group.owed += amount
		else group.cash += amount
		group.net = group.cash - group.owed
	}
	const groups = [...byOwner.values()].sort((a, b) =>
		a.label.localeCompare(b.label),
	)
	const cash = groups.reduce((t, g) => t + g.cash, 0)
	const owed = groups.reduce((t, g) => t + g.owed, 0)
	return { groups, cash, owed, net: cash - owed }
}
