/**
 * Fills the official RevenueItem table:
 *   1. Jane-era revenue from a Jane Sales export CSV (prisma/data/jane-sales.csv
 *      by default, or pass a path) - the pre-Boulevard record.
 *   2. Backfills every existing BlvdRevenueItem row (the sync mirrors new ones
 *      on its own from now on).
 * Idempotent: rows key on a stable sourceId, so re-running with a fresh Jane
 * export (e.g. one that finally covers Mar 2025 - Mar 2026) only adds rows.
 *
 * Amount semantics match Boulevard's mirror (pre-tax): gross = Collected − Sales Tax.
 * Rows that collected nothing (written off, no-charge) are skipped.
 *
 * Run: npx tsx scripts/import-jane-revenue.ts [path/to/sales.csv]
 */
import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { inferRevenueServiceCategory } from '#app/utils/blvd-revenue-sync.server.ts'

const prisma = new PrismaClient()

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ''
	let inQuotes = false
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"'
					i++
				} else inQuotes = false
			} else field += ch
		} else if (ch === '"') inQuotes = true
		else if (ch === ',') {
			row.push(field)
			field = ''
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++
			row.push(field)
			field = ''
			if (row.length > 1 || row[0] !== '') rows.push(row)
			row = []
		} else field += ch
	}
	if (field !== '' || row.length) {
		row.push(field)
		rows.push(row)
	}
	return rows
}

async function main() {
	const csvPath = process.argv[2] ?? 'prisma/data/jane-sales.csv'
	const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
	const header = rows[0]!.map(h => h.trim())
	const col = (name: string) => {
		const i = header.indexOf(name)
		if (i === -1) throw new Error(`missing column "${name}" in ${csvPath}`)
		return i
	}
	const cDate = col('Purchase Date')
	const cGuid = col('Patient Guid')
	const cPatient = col('Patient')
	const cItem = col('Item')
	const cInvoice = col('Invoice #')
	const cCollected = col('Collected')
	const cTax = col('Sales Tax')

	let imported = 0
	let skipped = 0
	for (const r of rows.slice(1)) {
		const collected = Number(r[cCollected] ?? 0)
		const tax = Number(r[cTax] ?? 0)
		const gross = Math.round((collected - tax) * 100) / 100
		const day = (r[cDate] ?? '').trim()
		const item = (r[cItem] ?? '').trim()
		if (!day || gross <= 0) {
			skipped++
			continue
		}
		// Stable across re-exports: invoice + patient + item + date + amount.
		const sourceId = `jane:${(r[cInvoice] ?? '').trim()}:${(r[cGuid] ?? '').trim()}:${item}:${day}:${gross}`
		await prisma.revenueItem.upsert({
			where: { sourceId },
			create: {
				source: 'jane',
				sourceId,
				// Noon ET: the export has no time of day.
				occurredAt: new Date(`${day}T12:00:00-05:00`),
				itemName: item || 'Jane line item',
				serviceCategory: inferRevenueServiceCategory(item) ?? null,
				clientName: (r[cPatient] ?? '').trim() || null,
				grossAmountUsd: gross,
			},
			update: { grossAmountUsd: gross },
		})
		imported++
	}
	console.log(`jane: ${imported} rows upserted, ${skipped} skipped ($0 / written off)`)

	// Line items supersede the bank-deposit placeholders (source 'jane-bank',
	// from Jane payout deposits) for the period the CSV covers. Deposits lag
	// collections by a few days, so the window extends a week past the CSV.
	const days = rows
		.slice(1)
		.map(r => (r[cDate] ?? '').trim())
		.filter(Boolean)
		.sort()
	if (days.length) {
		const removed = await prisma.revenueItem.deleteMany({
			where: {
				source: 'jane-bank',
				occurredAt: {
					gte: new Date(`${days[0]}T00:00:00-05:00`),
					lte: new Date(new Date(`${days[days.length - 1]}T23:59:59-05:00`).getTime() + 7 * 864e5),
				},
			},
		})
		if (removed.count)
			console.log(`jane-bank: ${removed.count} placeholder rows superseded by line items`)
	}

	// Backfill the Boulevard side.
	const blvd = await prisma.blvdRevenueItem.findMany({
		select: {
			externalId: true,
			occurredAt: true,
			itemName: true,
			serviceCategory: true,
			grossAmountUsd: true,
			boulevardAppointmentId: true,
		},
	})
	for (const b of blvd) {
		await prisma.revenueItem.upsert({
			where: { sourceId: b.externalId },
			create: {
				source: 'boulevard',
				sourceId: b.externalId,
				occurredAt: b.occurredAt,
				itemName: b.itemName,
				serviceCategory: b.serviceCategory,
				clientName: null,
				grossAmountUsd: b.grossAmountUsd,
				boulevardAppointmentId: b.boulevardAppointmentId,
			},
			update: {
				occurredAt: b.occurredAt,
				grossAmountUsd: b.grossAmountUsd,
				serviceCategory: b.serviceCategory,
			},
		})
	}
	console.log(`boulevard: ${blvd.length} rows backfilled`)

	const bySource = await prisma.revenueItem.groupBy({
		by: ['source'],
		_count: true,
		_sum: { grossAmountUsd: true },
	})
	for (const s of bySource)
		console.log(
			`${s.source}: ${s._count} rows, $${Math.round(s._sum.grossAmountUsd ?? 0)}`,
		)
	await prisma.$disconnect()
}

main().catch(error => {
	console.error(error)
	process.exit(1)
})
