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

export type BalanceSnapshot = {
	day: string
	accountId: string
	type: string
	current: number
}

export type KeptDay = {
	day: string
	/** What the report says we kept that day, before taxes. */
	kept: number
	/** The part of it that moved to savings, out of the linked accounts. */
	saved: number
}

/** The check window: about 3 months, inside the report's 12. */
const CHECK_DAYS = 92

/**
 * Checks the household report against the bank. Between the first and the
 * latest balance snapshot, the change in cash minus debt on the linked
 * accounts should equal what the report says we kept, less what moved to
 * savings. A difference that keeps growing means the report misses money;
 * a small one comes from pending charges and the bank's one-day lag.
 */
export function bankCheck(snapshots: BalanceSnapshot[], days: KeptDay[]) {
	const all = [...new Set(snapshots.map(s => s.day))].sort()
	const to = all.at(-1)
	if (!to) return null
	const earliest = new Date(Date.parse(to) - CHECK_DAYS * 24 * 3600e3)
		.toISOString()
		.slice(0, 10)
	const from = all.find(d => d >= earliest)!
	if (from === to) return { from, to, ready: false as const }
	const on = (day: string) =>
		new Map(snapshots.filter(s => s.day === day).map(s => [s.accountId, s]))
	const start = on(from)
	const end = on(to)
	// Accounts in both snapshots only: a newly linked account is not a gain.
	let bank = 0
	for (const [accountId, e] of end) {
		const s = start.get(accountId)
		if (!s) continue
		const sign = isOwed(e.type) ? -1 : 1
		bank += sign * (e.current - s.current)
	}
	const window = days.filter(d => d.day > from && d.day <= to)
	const kept = window.reduce((t, d) => t + d.kept, 0)
	const saved = window.reduce((t, d) => t + d.saved, 0)
	return {
		from,
		to,
		ready: true as const,
		bank,
		kept,
		saved,
		diff: bank - (kept - saved),
	}
}
