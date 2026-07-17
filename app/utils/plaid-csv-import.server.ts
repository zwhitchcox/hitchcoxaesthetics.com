/**
 * Statement-CSV importers for cards whose history Plaid can't serve —
 * Capital One beyond its 90-day window, and Apple Card (no aggregator
 * support at all; the Wallet app's CSV export is the only feed).
 *
 * Used by scripts/plaid-import-*.ts locally and by the
 * /resources/plaid-import-csv endpoint so prod's database can be given the
 * same rows. Ids are content-hashed, so re-imports upsert idempotently.
 */
import crypto from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'

function parseCsvLine(line: string): string[] {
	const fields: string[] = []
	let cur = ''
	let inQuotes = false
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (inQuotes) {
			if (ch === '"' && line[i + 1] === '"') {
				cur += '"'
				i++
			} else if (ch === '"') inQuotes = false
			else cur += ch
		} else if (ch === '"') inQuotes = true
		else if (ch === ',') {
			fields.push(cur)
			cur = ''
		} else cur += ch
	}
	fields.push(cur)
	return fields
}

function parseCsv(csv: string) {
	const lines = csv.split(/\r?\n/).filter(Boolean)
	const header = parseCsvLine(lines[0]!)
	const col = (name: string) => {
		const i = header.indexOf(name)
		if (i === -1) throw new Error(`missing column "${name}"`)
		return i
	}
	return { rows: lines.slice(1).map(parseCsvLine), col }
}

/** Apple Card "Category" → Plaid personal_finance_category, so the
 * household budget buckets these like any Plaid transaction. */
const APPLE_PFC: Record<string, [string, string | null]> = {
	Grocery: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'],
	Restaurants: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT'],
	Shopping: ['GENERAL_MERCHANDISE', null],
	Gas: ['TRANSPORTATION', 'TRANSPORTATION_GAS'],
	Transportation: ['TRANSPORTATION', null],
	Travel: ['TRAVEL', null],
	Entertainment: ['ENTERTAINMENT', null],
	Health: ['MEDICAL', null],
	Insurance: ['GENERAL_SERVICES', 'GENERAL_SERVICES_INSURANCE'],
	Hotels: ['TRAVEL', null],
	Airlines: ['TRAVEL', null],
}

/** MM/DD/YYYY → YYYY-MM-DD */
function isoDate(us: string) {
	const m = us.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
	if (!m) return null
	return `${m[3]}-${m[1]}-${m[2]}`
}

/**
 * Capital One "Transaction Download" CSVs — history beyond the 90-day Plaid
 * window. Rows on/after the earliest Plaid-delivered Capital One row are
 * skipped, so Plaid stays authoritative for its own window (the cutoff is
 * computed per database, which is what makes this safe to run on prod too).
 */
export async function importCapOneCsv(csv: string) {
	const { rows, col } = parseCsv(csv)
	const iPosted = col('Posted Date')
	const iCard = col('Card No.')
	const iDesc = col('Description')
	const iDebit = col('Debit')
	const iCredit = col('Credit')

	const earliestPlaid = await prisma.plaidTransaction.findFirst({
		where: { institution: 'Capital One', id: { not: { startsWith: 'csv-' } } },
		orderBy: { date: 'asc' },
		select: { date: true },
	})
	const cutoff = earliestPlaid?.date ?? '9999-12-31'

	let imported = 0
	let skippedOverlap = 0
	let skippedPayments = 0
	const occurrence = new Map<string, number>()
	for (const f of rows) {
		const date = f[iPosted]?.trim()
		const desc = f[iDesc]?.trim() ?? ''
		const debit = f[iDebit]?.trim()
		const credit = f[iCredit]?.trim()
		if (!date || (!debit && !credit)) continue
		if (/capital one mobile pymt|online pymt|autopay|electronic payment/i.test(desc)) {
			skippedPayments++
			continue
		}
		if (date >= cutoff) {
			skippedOverlap++
			continue
		}
		const amount = debit ? Number(debit) : -Number(credit)
		const contentKey = `${date}|${amount}|${desc}`
		const n = occurrence.get(contentKey) ?? 0
		occurrence.set(contentKey, n + 1)
		const id = `csv-capone-${crypto
			.createHash('sha1')
			.update(`${contentKey}|#${n}`)
			.digest('hex')
			.slice(0, 20)}`
		await prisma.plaidTransaction.upsert({
			where: { id },
			create: {
				id,
				itemId: 'capone-csv',
				owner: 'sarah',
				institution: 'Capital One',
				accountId: 'capone-csv',
				accountMask: f[iCard]?.trim() || '4009',
				accountType: 'credit',
				date,
				amount,
				name: desc,
				pending: false,
			},
			update: { date, amount, name: desc },
		})
		imported++
	}
	const range = await prisma.plaidTransaction.aggregate({
		where: { itemId: 'capone-csv' },
		_min: { date: true },
		_max: { date: true },
		_count: true,
	})
	return {
		imported,
		skippedOverlap,
		skippedPayments,
		cutoff,
		totalStored: range._count,
		coverage: { from: range._min.date, to: range._max.date },
	}
}

export async function importAppleCardCsv(csv: string) {
	const { rows, col } = parseCsv(csv)
	const iDate = col('Transaction Date')
	const iClear = col('Clearing Date')
	const iDesc = col('Description')
	const iMerchant = col('Merchant')
	const iCategory = col('Category')
	const iType = col('Type')
	const iAmount = col('Amount (USD)')
	const iBuyer = col('Purchased By')

	let imported = 0
	let skippedPayments = 0
	const occurrence = new Map<string, number>()
	for (const f of rows) {
		const type = f[iType]?.trim()
		// Payments are the checking-side transfer, already visible in the
		// bank data — importing them here would double count.
		if (type === 'Payment') {
			skippedPayments++
			continue
		}
		const date = isoDate(f[iClear] ?? '') ?? isoDate(f[iDate] ?? '')
		const amount = Number(f[iAmount])
		if (!date || !Number.isFinite(amount) || !amount) continue
		const desc = f[iDesc]?.trim() ?? ''
		const contentKey = `${date}|${amount}|${desc}`
		const n = occurrence.get(contentKey) ?? 0
		occurrence.set(contentKey, n + 1)
		const id = `csv-apple-${crypto
			.createHash('sha1')
			.update(`${contentKey}|#${n}`)
			.digest('hex')
			.slice(0, 20)}`
		const pfc = APPLE_PFC[f[iCategory]?.trim() ?? '']
		await prisma.plaidTransaction.upsert({
			where: { id },
			create: {
				id,
				itemId: 'apple-card-csv',
				owner: 'zane',
				institution: 'Apple Card',
				accountId: 'apple-card-csv',
				accountMask: null,
				accountType: 'credit',
				accountOwner: f[iBuyer]?.trim() || null,
				date,
				amount,
				name: desc,
				merchant: f[iMerchant]?.trim() || null,
				pfcPrimary: pfc?.[0] ?? null,
				pfcDetailed: pfc?.[1] ?? null,
				pending: false,
			},
			update: { date, amount, name: desc },
		})
		imported++
	}
	const range = await prisma.plaidTransaction.aggregate({
		where: { itemId: 'apple-card-csv' },
		_min: { date: true },
		_max: { date: true },
		_count: true,
	})
	return {
		imported,
		skippedPayments,
		totalStored: range._count,
		coverage: { from: range._min.date, to: range._max.date },
	}
}
