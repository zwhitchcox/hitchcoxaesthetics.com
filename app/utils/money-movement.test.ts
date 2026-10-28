import { describe, expect, test } from 'vitest'
import { classifyMoneyMoves, type MoneyRow } from './money-movement.ts'

let nextId = 0
const row = (patch: Partial<MoneyRow>): MoneyRow => ({
	id: `t${++nextId}`,
	itemId: 'boa',
	institution: 'Bank of America',
	accountId: 'biz',
	accountMask: '7109',
	accountType: 'depository',
	date: '2026-05-01',
	amount: 0,
	name: '',
	merchant: null,
	pfcPrimary: null,
	pfcDetailed: null,
	...patch,
})
const joint = { accountId: 'joint', accountMask: '8615' }
const amex = {
	itemId: 'amex',
	institution: 'American Express',
	accountId: 'amex',
	accountMask: '1000',
	accountType: 'credit',
}
const transferOut = { pfcPrimary: 'TRANSFER_OUT', pfcDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER' }
const transferIn = { pfcPrimary: 'TRANSFER_IN', pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }
const cardPayment = {
	pfcPrimary: 'LOAN_PAYMENTS',
	pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
}

describe('classifyMoneyMoves', () => {
	test('a transfer that lands in another linked account is internal', () => {
		const out = row({ amount: 4000, name: 'Online Banking transfer to CHK 8615', ...transferOut })
		const inn = row({ ...joint, amount: -4000, name: 'Online Banking transfer from CHK 7109', ...transferIn })
		const { internal } = classifyMoneyMoves([out, inn])
		expect([...internal].sort()).toEqual([out.id, inn.id].sort())
	})

	test('a check or a payroll debit that lands nowhere we can see counts', () => {
		const check = row({ amount: 1100, name: 'Check 204', ...transferOut })
		const payroll = row({ amount: 400, name: 'PAYROLL DES:PAYROLL', ...transferOut })
		const { internal } = classifyMoneyMoves([check, payroll])
		expect(internal.size).toBe(0)
	})

	test('a card payment is internal only when the card shows the payment', () => {
		const toAmex = row({ ...joint, amount: 900, name: 'AMERICAN EXPRESS DES:ACH PMT', ...cardPayment })
		const amexCredit = row({ ...amex, amount: -900, date: '2026-05-03', name: 'PAYMENT RECEIVED - THANK YOU', ...cardPayment })
		// A Citi card in Sarah's name that is not linked: no credit anywhere.
		const toCiti = row({ ...joint, amount: 650, name: 'CITI AUTOPAY DES:PAYMENT', ...cardPayment })
		const { internal } = classifyMoneyMoves([toAmex, amexCredit, toCiti])
		expect(internal.has(toAmex.id)).toBe(true)
		expect(internal.has(amexCredit.id)).toBe(true)
		expect(internal.has(toCiti.id)).toBe(false)
	})

	test('Apple Card payments are internal while its CSV export covers them', () => {
		const apple = { itemId: 'apple-card-csv', institution: 'Apple Card', accountId: 'apple', accountMask: null, accountType: 'credit' }
		const purchases = [
			row({ ...apple, date: '2026-06-02', amount: 120, name: 'TARGET' }),
			row({ ...apple, date: '2026-07-09', amount: 80, name: 'KROGER' }),
		]
		const covered = row({ ...joint, date: '2026-08-05', amount: 5012, name: 'APPLECARD GSBANK DES:PAYMENT', ...cardPayment })
		const after = row({ ...joint, date: '2026-10-07', amount: 4848, name: 'APPLECARD GSBANK DES:PAYMENT', ...cardPayment })
		const { internal } = classifyMoneyMoves([...purchases, covered, after])
		expect(internal.has(covered.id)).toBe(true)
		expect(internal.has(after.id)).toBe(false)
		expect(purchases.some(p => internal.has(p.id))).toBe(false)
	})

	test('a bounced payment drops with its return; the retry pairs with the card', () => {
		const amexPay = { accountId: 'zane', accountMask: '0080', name: 'AMERICAN EXPRESS DES:ACH PMT', ...cardPayment }
		const bounced = row({ ...amexPay, date: '2026-09-25', amount: 11993 })
		const ret = row({ accountId: 'zane', accountMask: '0080', date: '2026-09-29', amount: -11993, name: 'RETURN OF POSTED CHECK / ITEM', pfcPrimary: 'OTHER', pfcDetailed: 'OTHER_OTHER' })
		const retry = row({ ...amexPay, date: '2026-10-02', amount: 11993, name: 'AMERICAN EXPRESS DES:RETRY PYMT' })
		const credit = row({ ...amex, date: '2026-10-03', amount: -11993, name: 'PAYMENT RECEIVED - THANK YOU', ...cardPayment })
		const { internal, bounced: dropped } = classifyMoneyMoves([bounced, ret, retry, credit])
		expect([...dropped].sort()).toEqual([bounced.id, ret.id].sort())
		expect([...internal].sort()).toEqual([retry.id, credit.id].sort())
	})

	test('a payment the card reverses ("RETURNED AUTOPAY") drops with its credit', () => {
		const credit = row({ ...amex, date: '2026-02-24', amount: -3197.67, name: 'AUTOPAY PAYMENT - THANK YOU', ...cardPayment })
		const reversal = row({ ...amex, date: '2026-03-03', amount: 3197.67, name: 'RETURNED AUTOPAY (DEORY)', pfcPrimary: 'LOAN_PAYMENTS', pfcDetailed: 'LOAN_PAYMENTS_OTHER_PAYMENT' })
		const { bounced } = classifyMoneyMoves([credit, reversal])
		expect([...bounced].sort()).toEqual([credit.id, reversal.id].sort())
	})

	test('the leg that names the other account wins over a closer one', () => {
		const out = row({ date: '2026-05-10', amount: 2500, name: 'Online Banking transfer to CHK 8615', ...transferOut })
		const wrong = row({ accountId: 'zane', accountMask: '0080', date: '2026-05-10', amount: -2500, name: 'Online Banking transfer from CHK 4444', ...transferIn })
		const right = row({ ...joint, date: '2026-05-12', amount: -2500, name: 'Online Banking transfer from CHK 7109', ...transferIn })
		const { internal } = classifyMoneyMoves([out, wrong, right])
		expect(internal.has(right.id)).toBe(true)
		expect(internal.has(wrong.id)).toBe(false)
	})

	test('a card payment pairs with the card, not with a transfer of the same amount', () => {
		// May 2026: $4,000 transfers to the joint account and a $4,000
		// Capital One payment, days apart.
		const capone = { itemId: 'capone', institution: 'Capital One', accountId: 'capone', accountMask: '4009', accountType: 'credit' }
		const t1 = row({ date: '2026-05-01', amount: 4000, name: 'Online Banking transfer to CHK 8615', ...transferOut })
		const pay = row({ date: '2026-05-04', amount: 4000, name: 'CAPITAL ONE DES:MOBILE PMT', ...cardPayment })
		const t2 = row({ date: '2026-05-11', amount: 4000, name: 'Online Banking transfer to CHK 8615', ...transferOut })
		const in1 = row({ ...joint, date: '2026-05-01', amount: -4000, name: 'Online Banking transfer from CHK 7109', ...transferIn })
		const credit = row({ ...capone, date: '2026-05-05', amount: -4000, name: 'CAPITAL ONE MOBILE PYMT', ...cardPayment })
		const in2 = row({ ...joint, date: '2026-05-11', amount: -4000, name: 'Online Banking transfer from CHK 7109', ...transferIn })
		const { internal } = classifyMoneyMoves([t1, pay, t2, in1, credit, in2])
		expect(internal.size).toBe(6)
	})

	test('a transfer that lands nowhere stays out even when a card credit has the same amount', () => {
		const capone = { itemId: 'capone', institution: 'Capital One', accountId: 'capone', accountMask: '4009', accountType: 'credit' }
		const dup = row({ ...joint, date: '2026-07-28', amount: 4000, name: 'TRANSFER TO ACCT #0080 ON 07/28 VIA WEB', ...transferOut })
		const credit = row({ ...capone, date: '2026-07-31', amount: -4000, name: 'CAPITAL ONE MOBILE PYMT', ...cardPayment })
		const { internal } = classifyMoneyMoves([dup, credit])
		expect(internal.has(dup.id)).toBe(false)
	})

	test('a credit line draw is not income; a card charge named AUTOPAY is a purchase', () => {
		const draw = row({ accountId: 'fh', accountMask: '2220', amount: -900, name: 'ONLINE TRANSFER FROM LOAN', pfcPrimary: 'LOAN_DISBURSEMENTS', pfcDetailed: 'LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT' })
		const charge = row({ ...amex, amount: 89, name: 'KUB AUTOPAY', pfcPrimary: 'RENT_AND_UTILITIES' })
		const { internal } = classifyMoneyMoves([draw, charge])
		expect(internal.has(draw.id)).toBe(true)
		expect(internal.has(charge.id)).toBe(false)
	})
})
