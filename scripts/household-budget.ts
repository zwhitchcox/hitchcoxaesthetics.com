/**
 * Household budget report over the PlaidTransaction archive: the personal side
 * of the ledger, complementing scripts/plaid-expenses.ts (the business P&L).
 *
 *   pnpm exec tsx scripts/household-budget.ts                 last 12 full months
 *   pnpm exec tsx scripts/household-budget.ts --from 2024-07-01
 *   pnpm exec tsx scripts/household-budget.ts --json
 *
 * Included: Amex cards ...1000 (Zane) and ...1018 (Sarah personal), all of
 * Zane's connected accounts, plus spending on the business cards whose vendor
 * is classified Personal in .plaid-vendor-categories.json. Categories come
 * from Plaid's personal_finance_category taxonomy. A transfer or card payment
 * is left out only when its other side shows up in a linked account
 * (app/utils/money-movement.ts); Venmo, cash and payments to cards we cannot
 * see count as spending.
 */
import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

import {
	classifyMoneyMoves,
	isCardPayment,
	isSavingsTransfer,
	matchFrom,
} from '#app/utils/money-movement.ts'

dotenv.config()

const CACHE_FILE = path.join(process.cwd(), '.plaid-vendor-categories.json')
const BUSINESS_AMEX_CARD = '1026'

function bucketFor(pfcPrimary: string | null, pfcDetailed: string | null): string {
	const d = pfcDetailed ?? ''
	switch (pfcPrimary) {
		case 'FOOD_AND_DRINK':
			return d === 'FOOD_AND_DRINK_GROCERIES' ? 'Groceries' : 'Dining out'
		case 'GENERAL_MERCHANDISE':
			return 'Shopping'
		case 'TRANSPORTATION':
			return 'Transport & gas'
		case 'TRAVEL':
			return 'Travel'
		case 'ENTERTAINMENT':
			return 'Entertainment'
		case 'PERSONAL_CARE':
			return 'Personal care'
		case 'MEDICAL':
			return 'Medical'
		case 'HOME_IMPROVEMENT':
			return 'Home'
		case 'RENT_AND_UTILITIES':
			return 'Housing & utilities'
		case 'GENERAL_SERVICES':
			if (d === 'GENERAL_SERVICES_INSURANCE') return 'Insurance'
			if (
				d === 'GENERAL_SERVICES_EDUCATION' ||
				d === 'GENERAL_SERVICES_CHILDCARE'
			)
				return 'Kids & education'
			return 'Services'
		case 'BANK_FEES':
			return 'Fees & interest'
		case 'GOVERNMENT_AND_NON_PROFIT':
			return 'Gov, taxes & giving'
		case 'LOAN_PAYMENTS':
			if (d === 'LOAN_PAYMENTS_MORTGAGE_PAYMENT') return 'Housing & utilities'
			if (d === 'LOAN_PAYMENTS_CAR_PAYMENT') return 'Transport & gas'
			return 'Debt payments'
		default:
			return 'Other'
	}
}

/** Same normalization as plaid-expenses.ts so the vendor cache keys line up. */
function vendorKey(merchant: string, name: string) {
	const base = (merchant || name || '(no name)').toLowerCase()
	return (
		base.replace(/[#*]?\s*\d{4,}.*$/, '').replace(/\s+/g, ' ').trim() || base
	)
}

function parseArgs(argv: string[]) {
	let from: string | undefined
	let to: string | undefined
	let json = false
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--from') from = argv[++i]
		else if (a === '--to') to = argv[++i]
		else if (a === '--json') json = true
	}
	const end = to ?? new Date().toISOString().slice(0, 10)
	// Default: 12 full months back from the start of the current month.
	const now = new Date()
	const start =
		from ??
		new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1))
			.toISOString()
			.slice(0, 10)
	return { start, end, json }
}

const usd = (n: number) =>
	new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	}).format(n)

async function main({ start, end, json }: { start: string; end: string; json: boolean }) {
	const { prisma } = await import('#app/utils/db.server.ts')

	let personalVendors = new Set<string>()
	try {
		const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<
			string,
			{ category: string }
		>
		personalVendors = new Set(
			Object.entries(cache)
				.filter(([, v]) => v.category === 'Personal')
				.map(([k]) => k),
		)
	} catch {
		// no cache: business-card personal spending just won't be included
	}

	// Rows from a few weeks before the window too, so both sides of a move
	// and the Apple Card CSV coverage are in view.
	const allRows = await prisma.plaidTransaction.findMany({
		where: { date: { gte: matchFrom(start), lte: end } },
		orderBy: { date: 'asc' },
	})
	const { internal, bounced } = classifyMoneyMoves(allRows)
	const rows = allRows.filter(r => r.date >= start)

	type Item = {
		date: string
		amount: number
		merchant: string
		bucket: string
		card: string
	}
	const items: Item[] = []
	// Money moved to savings or investments is kept, not spent: it stays out
	// of the totals and is reported on its own.
	const saved: Array<{ date: string; amount: number }> = []
	let income = 0
	for (const r of rows) {
		// Moves between our own accounts (a card payment that shows up on the
		// card, a transfer that lands in another linked account), and bounced
		// payments with the returns that undo them. Every other dollar counts.
		if (internal.has(r.id) || bounced.has(r.id)) continue

		const amexDigits = r.accountOwner?.match(/\d{4}\s*$/)?.[0]?.trim()
		const isPersonalAmex =
			r.institution === 'American Express' &&
			amexDigits !== undefined &&
			amexDigits !== BUSINESS_AMEX_CARD
		const isZane = r.owner === 'zane'
		const isBusinessCardPersonal =
			!isPersonalAmex &&
			!isZane &&
			r.accountType === 'credit' &&
			personalVendors.has(vendorKey(r.merchant ?? '', r.name))
		if (!isPersonalAmex && !isZane && !isBusinessCardPersonal) continue

		if (r.pfcPrimary === 'INCOME') {
			income += -r.amount
			continue
		}
		// Money in from outside our accounts is not spending. Take-home is
		// counted from the paychecks (finance-reports.server.ts).
		if (r.pfcPrimary === 'TRANSFER_IN') continue
		if (r.pfcPrimary === 'TRANSFER_OUT' && isSavingsTransfer(r)) {
			saved.push({ date: r.date, amount: r.amount })
			continue
		}
		const card = isPersonalAmex
			? `Amex ...${amexDigits}`
			: isZane
				? `${r.institution} (zane)`
				: `${r.institution} (business card)`
		items.push({
			date: r.date,
			amount: r.amount,
			merchant: (r.merchant || r.name).slice(0, 40),
			// A payment from checking that did not show up on a linked card paid
			// a card we cannot see (or the Apple Card after its last CSV
			// export): it is the only trace of that spending. On a card, a row
			// like this is a charge (Citi Flex Pay installments).
			bucket:
				isCardPayment(r) && r.accountType === 'depository'
					? 'Card payments (unlinked cards)'
					: r.pfcPrimary === 'TRANSFER_OUT'
						? 'Transfers out (Venmo, cash, other accounts)'
						: bucketFor(r.pfcPrimary, r.pfcDetailed),
			card,
		})
	}

	const months = [...new Set(items.map(i => i.date.slice(0, 7)))].sort()
	const buckets = [...new Set(items.map(i => i.bucket))]
	const cell = new Map<string, number>()
	for (const i of items)
		cell.set(
			`${i.date.slice(0, 7)}|${i.bucket}`,
			(cell.get(`${i.date.slice(0, 7)}|${i.bucket}`) ?? 0) + i.amount,
		)

	// Averages over full months only (exclude the current partial month).
	const currentMonth = new Date().toISOString().slice(0, 7)
	const fullMonths = months.filter(m => m !== currentMonth)
	const summary = buckets
		.map(b => {
			const vals = fullMonths.map(m => cell.get(`${m}|${b}`) ?? 0)
			const total = vals.reduce((s, v) => s + v, 0)
			const avg = fullMonths.length ? total / fullMonths.length : 0
			const sorted = [...vals].sort((x, y) => x - y)
			const median = sorted.length
				? sorted[Math.floor(sorted.length / 2)]!
				: 0
			return { bucket: b, total, avg, median }
		})
		.sort((a, b) => b.total - a.total)

	const byMerchant = new Map<string, { total: number; months: Set<string> }>()
	for (const i of items) {
		const key = i.merchant.toLowerCase()
		const v = byMerchant.get(key) ?? { total: 0, months: new Set<string>() }
		v.total += i.amount
		v.months.add(i.date.slice(0, 7))
		byMerchant.set(key, v)
	}
	const topMerchants = [...byMerchant.entries()]
		.sort((a, b) => b[1].total - a[1].total)
		.slice(0, 25)
		.map(([m, v]) => ({ merchant: m, total: v.total, months: v.months.size }))
	const recurring = [...byMerchant.entries()]
		.filter(([, v]) => v.months.size >= Math.min(6, fullMonths.length) - 1 && v.months.size >= 3)
		.map(([m, v]) => ({
			merchant: m,
			perMonth: v.total / v.months.size,
			months: v.months.size,
		}))
		.sort((a, b) => b.perMonth - a.perMonth)

	const monthlyTotals = months.map(m => ({
		month: m,
		total: buckets.reduce((s, b) => s + (cell.get(`${m}|${b}`) ?? 0), 0),
	}))
	const savedMonthly = [...new Set(saved.map(s => s.date.slice(0, 7)))]
		.sort()
		.map(m => ({
			month: m,
			total: saved
				.filter(s => s.date.startsWith(m))
				.reduce((sum, s) => sum + s.amount, 0),
		}))
	// Day by day, for the bank check on the household profit page.
	const daily = new Map<string, { spend: number; saved: number }>()
	for (const i of items) {
		const d = daily.get(i.date) ?? { spend: 0, saved: 0 }
		d.spend += i.amount
		daily.set(i.date, d)
	}
	for (const s of saved) {
		const d = daily.get(s.date) ?? { spend: 0, saved: 0 }
		d.saved += s.amount
		daily.set(s.date, d)
	}
	const grandTotal = summary.reduce((s, r) => s + r.total, 0)
	const avgMonth = fullMonths.length ? grandTotal / fullMonths.length : 0

	const payload = {
		start,
		end,
		fullMonths,
		income,
		grandTotal,
		avgMonth,
		monthlyTotals,
		savedMonthly,
		daily: [...daily.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([day, d]) => ({ day, ...d })),
		summary,
		topMerchants,
		recurring,
		matrix: months.map(m => ({
			month: m,
			...Object.fromEntries(buckets.map(b => [b, cell.get(`${m}|${b}`) ?? 0])),
		})),
	}

	if (json) {
		console.log(JSON.stringify(payload, null, 2))
		return payload
	}

	console.log(
		`Household spending ${start} .. ${end} — ${items.length} transactions (Amex personal cards, Zane's accounts, personal spend on business cards)`,
	)
	console.log(
		`\nAverage month (over ${fullMonths.length} full months): ${usd(avgMonth)}\n`,
	)
	console.log('By category (total | avg/mo | median/mo):')
	for (const r of summary)
		console.log(
			`  ${r.bucket.padEnd(22)} ${usd(r.total).padStart(10)} ${usd(r.avg).padStart(9)} ${usd(r.median).padStart(9)}`,
		)
	console.log('\nBy month:')
	for (const m of monthlyTotals)
		console.log(`  ${m.month}  ${usd(m.total).padStart(10)}`)
	console.log('\nRecurring (appears most months):')
	for (const r of recurring.slice(0, 20))
		console.log(
			`  ${usd(r.perMonth).padStart(8)}/mo  ${r.merchant}  (${r.months} months)`,
		)
	console.log('\nTop merchants:')
	for (const m of topMerchants.slice(0, 20))
		console.log(`  ${usd(m.total).padStart(10)}  ${m.merchant}`)
	return payload
}

export type HouseholdBudgetJson = Awaited<ReturnType<typeof main>>

/** Programmatic entry (Temporal worker): default last-12-full-months window. */
export async function computeHouseholdBudget(): Promise<HouseholdBudgetJson> {
	return await main({ ...parseArgs([]), json: false })
}

if (process.argv[1]?.includes('household-budget')) {
	void main(parseArgs(process.argv.slice(2)))
		.then(() => process.exit(0))
		.catch(error => {
			console.error(error instanceof Error ? error.message : error)
			process.exit(1)
		})
}
