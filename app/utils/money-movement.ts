/**
 * Finds the Plaid transactions that only move money between our own linked
 * accounts. The household profit report counts every other dollar that
 * enters or leaves the bank.
 *
 * A transfer or card payment is internal only when its other side shows up
 * in another linked account: the same amount, the other way, within
 * MATCH_DAYS. Until 2026-10-27 the reports dropped everything Plaid tagged
 * as a transfer and every payment to an issuer we had linked. That hid the
 * $1,100 business checks, payroll debits, Venmo, and payments to cards we
 * have no purchases for (the Apple Card after its last CSV export, a second
 * Citi card that is not linked), so "cash kept" read +$25k while the bank was
 * flat.
 */

export type MoneyRow = {
	id: string
	itemId: string
	institution: string
	accountId: string
	accountMask: string | null
	accountType: string | null
	date: string
	/** Positive = money out of this account. */
	amount: number
	name: string
	merchant: string | null
	pfcPrimary: string | null
	pfcDetailed: string | null
}

const MATCH_DAYS = 10
const BOUNCE_DAYS = 14
/** A payment pays the statement before it, so a CSV export also covers the
 * payments made up to a month after its last row. */
const CSV_PAYMENT_LAG_DAYS = 31
const DAY_MS = 24 * 60 * 60 * 1000

/** The first day to load for a report window that starts on `start`, so
 * both sides of a move and the CSV coverage are in view. */
export function matchFrom(start: string) {
	return new Date(Date.parse(start) - 45 * DAY_MS).toISOString().slice(0, 10)
}

export function isCardPayment(row: Pick<MoneyRow, 'name' | 'merchant' | 'pfcDetailed'>) {
	return (
		row.pfcDetailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' ||
		/payment thank you|autopay|crd autopay|online payment to|capital one mobile pymt|ach pmt|retry pymt/i.test(
			`${row.merchant ?? ''} ${row.name}`,
		)
	)
}

/** Money sent to a savings or investment account: kept, not spent. */
export function isSavingsTransfer(row: Pick<MoneyRow, 'name' | 'merchant' | 'pfcDetailed'>) {
	return (
		row.pfcDetailed === 'TRANSFER_OUT_SAVINGS' ||
		row.pfcDetailed === 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' ||
		row.pfcDetailed === 'TRANSFER_OUT_CRYPTO' ||
		/goldman sachs|marcus|coinbase|moonpay|robinhood|fidelity|vanguard|schwab|betterment|wealthfront/i.test(
			`${row.merchant ?? ''} ${row.name}`,
		)
	)
}

const isOwedAccount = (row: MoneyRow) =>
	row.accountType === 'credit' || row.accountType === 'loan'

/** A row that moves money. On a card or loan only a credit can be one: a
 * charge named "... AUTOPAY" is still a purchase. */
function isMove(row: MoneyRow) {
	if (isOwedAccount(row) && row.amount >= 0) return false
	return (
		row.pfcPrimary === 'TRANSFER_IN' ||
		row.pfcPrimary === 'TRANSFER_OUT' ||
		row.pfcPrimary === 'LOAN_PAYMENTS' ||
		row.pfcPrimary === 'LOAN_DISBURSEMENTS' ||
		isCardPayment(row)
	)
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function classifyMoneyMoves(rows: MoneyRow[]): {
	/** Moves between our own accounts: neither income nor spending. */
	internal: Set<string>
	/** Bounced payments and the returns that undo them. */
	bounced: Set<string>
} {
	const byDate = [...rows].sort((a, b) => a.date.localeCompare(b.date))

	// A bounced payment shows up three times: the payment (+X), the bank's
	// "RETURN OF POSTED CHECK" (-X), and usually a retry (+X). The card can
	// show it too: its credit (-X), then "RETURNED AUTOPAY" (+X). Drop each
	// return with the nearest opposite row before it; the retry stays.
	const isReturn = (r: MoneyRow) =>
		r.amount < 0
			? /return of posted check/i.test(r.name)
			: isOwedAccount(r) && /returned|reversal/i.test(r.name)
	const bounced = new Set<string>()
	for (const ret of byDate) {
		if (!isReturn(ret)) continue
		let paid: MoneyRow | undefined
		for (const p of byDate) {
			if (bounced.has(p.id) || p.accountId !== ret.accountId) continue
			if (Math.abs(p.amount + ret.amount) > 0.005) continue
			const days = (Date.parse(ret.date) - Date.parse(p.date)) / DAY_MS
			if (days < 0 || days > BOUNCE_DAYS) continue
			paid = p
		}
		if (paid) {
			bounced.add(paid.id)
			bounced.add(ret.id)
		}
	}

	// Pair each move out of one account with the same amount into another.
	// A card payment lands on a card or loan, a transfer in a bank account,
	// unless the leg names the account ("payment to CRD 3024"). Otherwise
	// the many $4,000 business card payments and $4,000 transfers to the
	// joint account pair up wrong and leave real ones unmatched. A leg that
	// names the other account ("transfer to CHK 8615") wins.
	const names = (a: MoneyRow, b: MoneyRow) =>
		!!b.accountMask && a.name.includes(b.accountMask)
	const internal = new Set<string>()
	const moves = byDate.filter(r => !bounced.has(r.id) && isMove(r))
	const ins = moves.filter(r => r.amount < 0)
	for (const out of moves.filter(r => r.amount > 0)) {
		let best: MoneyRow | undefined
		let bestScore = Infinity
		for (const inn of ins) {
			if (internal.has(inn.id) || inn.accountId === out.accountId) continue
			if (Math.abs(out.amount + inn.amount) > 0.005) continue
			const days = Math.abs(Date.parse(out.date) - Date.parse(inn.date)) / DAY_MS
			if (days > MATCH_DAYS) continue
			const fits = isCardPayment(out)
				? isOwedAccount(inn)
				: inn.accountType !== 'credit'
			if (!fits && !names(out, inn)) continue
			const named = names(out, inn) || names(inn, out)
			const score = days - (named ? 100 : 0)
			if (score < bestScore) {
				best = inn
				bestScore = score
			}
		}
		if (best) {
			internal.add(out.id)
			internal.add(best.id)
		}
	}

	// A CSV import (Apple Card, the old Capital One statements) has the
	// purchases but no payment rows. Its payments are internal while the
	// export covers them; after the last export they are the only trace of
	// that card's spending, so they count.
	const csvCover = new Map<string, { from: string; to: string }>()
	for (const r of byDate) {
		if (!r.itemId.endsWith('-csv')) continue
		const c = csvCover.get(r.institution)
		csvCover.set(r.institution, { from: c?.from ?? r.date, to: r.date })
	}
	for (const r of moves) {
		if (internal.has(r.id)) continue
		// Borrowing on a credit line is not income, and a card or loan
		// account's own payment rows are the far side of a move.
		if (r.pfcPrimary === 'LOAN_DISBURSEMENTS' || isOwedAccount(r)) {
			internal.add(r.id)
			continue
		}
		if (r.amount <= 0 || !isCardPayment(r)) continue
		const payee = `${r.merchant ?? ''} ${r.name}`
		for (const [institution, cover] of csvCover) {
			const name = new RegExp(escapeRegExp(institution).replace(/\s+/g, '\\s?'), 'i')
			if (!name.test(payee)) continue
			const late = (Date.parse(r.date) - Date.parse(cover.to)) / DAY_MS
			if (r.date >= cover.from && late <= CSV_PAYMENT_LAG_DAYS) internal.add(r.id)
		}
	}

	return { internal, bounced }
}
