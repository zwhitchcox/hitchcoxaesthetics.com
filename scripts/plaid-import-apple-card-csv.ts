/**
 * Import Apple Card Wallet-export CSVs into the PlaidTransaction table.
 * Apple Card supports no aggregators, so this is its only data feed.
 *
 *   pnpm exec tsx scripts/plaid-import-apple-card-csv.ts ~/Downloads/"Apple Card Transactions"*.csv
 *
 * Payments are skipped (the checking side already shows them); re-running is
 * safe (content-hashed ids upsert). To load the same rows into production:
 *
 *   curl -X POST https://hitchcoxaesthetics.com/resources/plaid-import-csv \
 *     -H "Authorization: Bearer $INTERNAL_COMMAND_TOKEN" \
 *     -H "Content-Type: text/csv" -H "X-Import-Kind: apple-card" \
 *     --data-binary @file.csv
 */
import fs from 'node:fs'

import dotenv from 'dotenv'

dotenv.config()

async function main() {
	const files = process.argv.slice(2)
	if (!files.length) {
		console.error('Usage: tsx scripts/plaid-import-apple-card-csv.ts <export.csv ...>')
		process.exit(1)
	}
	const { importAppleCardCsv } = await import('#app/utils/plaid-csv-import.server.ts')
	for (const file of files) {
		const result = await importAppleCardCsv(fs.readFileSync(file, 'utf8'))
		console.log(`${file.split('/').pop()}:`, JSON.stringify(result))
	}
	process.exit(0)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
