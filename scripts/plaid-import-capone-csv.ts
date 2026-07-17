/**
 * One-time import of Capital One "Transaction Download" CSVs into the
 * PlaidTransaction table, for history beyond Capital One's 90-day Plaid
 * window.
 *
 *   pnpm exec tsx scripts/plaid-import-capone-csv.ts ~/Downloads/Transaction*.csv
 *
 * Expected columns: Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
 * Rows dated on/after the earliest Capital One row Plaid delivered are
 * skipped — Plaid stays authoritative for its own window. Re-running is safe:
 * ids are content-hashed, imports upsert. Also removes any rows from the
 * earlier statement-PDF import (stmt-capone-*), which this supersedes.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

import dotenv from 'dotenv'

dotenv.config()

const OWNER = 'sarah'
const INSTITUTION = 'Capital One'

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

async function main() {
	const files = process.argv.slice(2)
	if (!files.length) {
		console.error('Usage: tsx scripts/plaid-import-capone-csv.ts <download.csv ...>')
		process.exit(1)
	}
	const { prisma } = await import('#app/utils/db.server.ts')

	const stale = await prisma.plaidTransaction.deleteMany({
		where: { id: { startsWith: 'stmt-capone-' } },
	})
	if (stale.count) console.log(`Removed ${stale.count} rows from the old statement-PDF import.`)

	// Plaid is authoritative for its own window; only import older rows.
	const earliestPlaid = await prisma.plaidTransaction.findFirst({
		where: { institution: INSTITUTION, id: { not: { startsWith: 'csv-' } } },
		orderBy: { date: 'asc' },
		select: { date: true },
	})
	const cutoff = earliestPlaid?.date ?? '9999-12-31'
	console.log(`Plaid coverage for ${INSTITUTION} starts ${cutoff}; importing CSV rows before that.`)

	let imported = 0
	let skippedOverlap = 0
	let skippedPayments = 0
	// Identical rows (same day, amount, description — e.g. two $500 Google Ads
	// charges) get an occurrence index so each is its own stable id.
	const occurrence = new Map<string, number>()
	for (const file of files) {
		const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
		const header = parseCsvLine(lines[0]!)
		const col = (name: string) => {
			const i = header.indexOf(name)
			if (i === -1) throw new Error(`${file}: missing column "${name}"`)
			return i
		}
		const iPosted = col('Posted Date')
		const iCard = col('Card No.')
		const iDesc = col('Description')
		const iDebit = col('Debit')
		const iCredit = col('Credit')
		let kept = 0
		for (const line of lines.slice(1)) {
			const f = parseCsvLine(line)
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
					owner: OWNER,
					institution: INSTITUTION,
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
			kept++
			imported++
		}
		console.log(`${file.split('/').pop()}: ${lines.length - 1} rows, ${kept} imported`)
	}
	console.log(
		`\nDone: ${imported} imported, ${skippedOverlap} skipped (inside Plaid's window), ${skippedPayments} card payments skipped`,
	)
	process.exit(0)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
