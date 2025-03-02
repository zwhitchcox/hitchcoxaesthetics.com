import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { parse } from 'csv-parse/sync'
import { parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize Prisma client
const prisma = new PrismaClient()

// Time zone constant
const TIME_ZONE = 'America/New_York'

// Function to parse Eastern Time date from CSV
function parseETDate(dateString) {
	// Parse date string to Date object and convert to Eastern Time
	return toZonedTime(parseISO(dateString), TIME_ZONE)
}

// Parse collected amount from record
function parseCollectedAmount(record) {
	const collected = parseFloat((record.Collected || '0').replace(/[$,]/g, ''))
	return isNaN(collected) ? 0 : collected
}

// Categorize service based on item name
function getServiceCategory(item) {
	item = item?.toLowerCase() || ''

	if (item.includes('laser') || item.includes('cold sculpting')) {
		return 'laser'
	} else if (
		item.includes('botox') ||
		item.includes('dysport') ||
		item.includes('xeomin')
	) {
		return 'botox'
	} else if (
		item.includes('dermal filler') ||
		item.includes('juvederm') ||
		item.includes('radiesse') ||
		item.includes('restylane')
	) {
		return 'filler'
	} else if (item.includes('skin') || item.includes('facial')) {
		return 'skin'
	} else if (
		item.includes('tirzepatide') ||
		item.includes('semaglutide') ||
		item.includes('ozempic') ||
		item.includes('wegovy') ||
		item.includes('mounjaro')
	) {
		return 'weight'
	} else if (item.includes('microneedling')) {
		return 'microneedling'
	}

	return 'other'
}

// Import invoice data from CSV to database
async function importInvoiceData() {
	try {
		console.log('Starting invoice import process...')

		// Path to the CSV file
		const csvFilePath = path.join(
			process.cwd(),
			'downloads',
			'table-extract.csv',
		)

		if (!fs.existsSync(csvFilePath)) {
			console.error(
				'Invoice data file not found. Please make sure table-extract.csv exists in the downloads directory.',
			)
			return
		}

		// Read and parse the CSV file
		console.log('Reading CSV file...')
		const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' })
		const records = parse(fileContent, {
			columns: true,
			skip_empty_lines: true,
			trim: true,
			relaxColumnCount: true,
		})

		console.log(`Parsed ${records.length} records from CSV`)

		// First clear existing data (optional - comment out if you want to keep historical data)
		console.log('Clearing existing invoice data...')
		await prisma.invoiceItem.deleteMany({})

		// Process and import records
		const batchSize = 100
		let processed = 0
		let skippedZeroAmount = 0
		let skippedError = 0

		for (let i = 0; i < records.length; i += batchSize) {
			const batch = records.slice(i, i + batchSize)
			const createPromises = batch
				.map(record => {
					// Skip records with no transaction
					if (!record.Collected || parseCollectedAmount(record) <= 0) {
						skippedZeroAmount++
						return null
					}

					try {
						// Get invoice date - use 'Invoice Date' field instead of 'Date'
						const date = parseETDate(record['Invoice Date'])
						const item = record.Item || 'Unknown Service'
						const collected = parseCollectedAmount(record)
						const category = getServiceCategory(item)

						return prisma.invoiceItem.create({
							data: {
								invoiceId:
									record['Invoice #'] ||
									`unknown-${Date.now()}-${Math.random()}`,
								date,
								item,
								collected,
								category,
							},
						})
					} catch (error) {
						console.error(`Error processing record:`, record, error)
						skippedError++
						return null
					}
				})
				.filter(Boolean) // Remove null promises

			// Execute batch
			await Promise.all(createPromises)
			processed += createPromises.length
			console.log(`Processed ${processed}/${records.length} records...`)
		}

		console.log(`
Import Summary:
- Total records in CSV: ${records.length}
- Successfully imported: ${processed}
- Skipped (zero amount): ${skippedZeroAmount}
- Skipped (processing errors): ${skippedError}
		`)

		console.log(
			`Successfully imported ${processed} invoice records to database`,
		)
	} catch (error) {
		console.error('Error in invoice import process:', error)
		throw error
	} finally {
		await prisma.$disconnect()
	}
}

// Run the import function
importInvoiceData()
	.then(() => {
		console.log('Invoice import completed successfully')
		process.exit(0)
	})
	.catch(error => {
		console.error('Invoice import failed:', error)
		process.exit(1)
	})
