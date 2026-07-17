/**
 * One-off: dining out vs groceries from the PlaidTransaction archive, using
 * the same household selection rules as scripts/household-budget.ts.
 *
 *   pnpm exec tsx scripts/food-analysis.ts
 */
import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

dotenv.config()

const CACHE_FILE = path.join(process.cwd(), '.plaid-vendor-categories.json')
const BUSINESS_AMEX_CARD = '1026'

function vendorKey(merchant: string, name: string) {
	const base = (merchant || name || '(no name)').toLowerCase()
	return (
		base.replace(/[#*]?\s*\d{4,}.*$/, '').replace(/\s+/g, ' ').trim() || base
	)
}

async function main() {
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
	} catch {}

	// Last 12 full months.
	const now = new Date()
	const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1))
		.toISOString()
		.slice(0, 10)
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
		.toISOString()
		.slice(0, 10)

	const rows = await prisma.plaidTransaction.findMany({
		where: {
			date: { gte: start, lt: end },
			pfcPrimary: 'FOOD_AND_DRINK',
			pending: false,
		},
		orderBy: { date: 'asc' },
	})

	type Txn = {
		date: string
		month: string
		amount: number
		merchant: string
		detailed: string
	}
	const txns: Txn[] = []
	for (const r of rows) {
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
		if (r.amount <= 0) continue // refunds/credits excluded from per-meal stats

		txns.push({
			date: r.date,
			month: r.date.slice(0, 7),
			amount: r.amount,
			merchant: (r.merchant || r.name).slice(0, 40),
			detailed: r.pfcDetailed ?? 'FOOD_AND_DRINK_OTHER',
		})
	}

	const groupLabel = (d: string) =>
		d === 'FOOD_AND_DRINK_GROCERIES'
			? 'Groceries'
			: d === 'FOOD_AND_DRINK_RESTAURANT'
				? 'Restaurants'
				: d === 'FOOD_AND_DRINK_FAST_FOOD'
					? 'Fast food'
					: d === 'FOOD_AND_DRINK_COFFEE'
						? 'Coffee'
						: d === 'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR'
							? 'Beer/wine/liquor'
							: 'Other food & drink'

	const stats: Record<
		string,
		{ total: number; n: number; months: Record<string, number>; vendors: Record<string, { total: number; n: number }> }
	> = {}
	for (const t of txns) {
		const g = groupLabel(t.detailed)
		stats[g] ??= { total: 0, n: 0, months: {}, vendors: {} }
		stats[g].total += t.amount
		stats[g].n++
		stats[g].months[t.month] = (stats[g].months[t.month] ?? 0) + t.amount
		const v = (stats[g].vendors[t.merchant] ??= { total: 0, n: 0 })
		v.total += t.amount
		v.n++
	}

	const monthCount = 12
	console.log(`window: ${start} .. ${end} (${monthCount} full months)`)
	for (const [g, s] of Object.entries(stats).sort((a, b) => b[1].total - a[1].total)) {
		console.log(
			`\n${g}: total $${s.total.toFixed(0)}  |  $${(s.total / monthCount).toFixed(0)}/mo  |  ${s.n} txns (${(s.n / monthCount).toFixed(1)}/mo)  |  avg $${(s.total / s.n).toFixed(2)}/txn`,
		)
		const top = Object.entries(s.vendors)
			.sort((a, b) => b[1].total - a[1].total)
			.slice(0, 8)
		for (const [v, vs] of top)
			console.log(
				`   ${v.padEnd(40)} $${vs.total.toFixed(0).padStart(7)}  ${String(vs.n).padStart(3)}x  avg $${(vs.total / vs.n).toFixed(2)}`,
			)
	}

	// Monthly series for dining-vs-groceries trend.
	const months = [...new Set(txns.map((t) => t.month))].sort()
	console.log('\nmonth      dining-all  groceries')
	for (const m of months) {
		const dining = Object.entries(stats)
			.filter(([g]) => g !== 'Groceries')
			.reduce((sum, [, s]) => sum + (s.months[m] ?? 0), 0)
		console.log(
			`${m}   $${dining.toFixed(0).padStart(8)}  $${(stats['Groceries']?.months[m] ?? 0).toFixed(0).padStart(8)}`,
		)
	}
	await prisma.$disconnect()
}

void main()
