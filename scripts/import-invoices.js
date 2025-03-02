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
		console.log('Importing invoice data to Prisma database...')

		// First, get all existing invoiceIds to check for duplicates
		const existingInvoices = await prisma.invoiceItem.findMany({
			select: {
				id: true,
				invoiceId: true,
			},
		})

		// Create a map for quick lookup
		const invoiceMap = new Map(
			existingInvoices.map(invoice => [invoice.invoiceId, invoice.id]),
		)

		console.log(
			`Found ${existingInvoices.length} existing invoice records in database`,
		)

		// Get all existing patients for quick lookup
		console.log('Loading existing patients...')
		const existingPatients = await prisma.patient.findMany()
		const patientMap = new Map(
			existingPatients.map(patient => [patient.name.toLowerCase(), patient.id]),
		)
		console.log(`Found ${existingPatients.length} existing patient records`)

		// Process and import records
		const batchSize = 100
		let processed = 0
		let updated = 0
		let created = 0
		let skippedZeroAmount = 0
		let skippedError = 0
		let patientsCreated = 0
		let patientsLinked = 0

		for (let i = 0; i < records.length; i += batchSize) {
			const batch = records.slice(i, i + batchSize)
			const promises = batch
				.map(async record => {
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
						const invoiceId =
							record['Invoice #'] || `unknown-${Date.now()}-${Math.random()}`
						const details = record.Details || null

						// Extract patient name - could be in one of several possible fields
						const patientName =
							record.Patient ||
							record['Patient Name'] ||
							record.Customer ||
							record['Client Name'] ||
							'Unknown Patient'

						// Find or create patient
						let patientId
						const patientNameKey = patientName.toLowerCase()

						if (patientMap.has(patientNameKey)) {
							// Use existing patient
							patientId = patientMap.get(patientNameKey)
							patientsLinked++
						} else {
							// Create new patient
							const newPatient = await prisma.patient.create({
								data: {
									name: patientName,
								},
							})
							patientId = newPatient.id
							patientMap.set(patientNameKey, patientId)
							patientsCreated++
						}

						// Check if this invoice already exists
						const existingId = invoiceMap.get(invoiceId)

						if (existingId) {
							// Update existing record
							await prisma.invoiceItem.update({
								where: { id: existingId },
								data: {
									date,
									item,
									collected,
									category,
									patientId, // Now using patient relation
									details,
									updatedAt: new Date(),
								},
							})
							updated++
							return true
						} else {
							// Create new record
							await prisma.invoiceItem.create({
								data: {
									invoiceId,
									date,
									item,
									collected,
									category,
									patientId, // Now using patient relation
									details,
								},
							})
							created++
							return true
						}
					} catch (error) {
						console.error(`Error processing record:`, record, error)
						skippedError++
						return null
					}
				})
				.filter(Boolean) // Remove null promises

			// Execute batch
			await Promise.all(promises)
			processed = created + updated
			console.log(
				`Processed ${processed}/${records.length} records (${created} created, ${updated} updated)...`,
			)
		}

		console.log(`
Import Summary:
- Total records in CSV: ${records.length}
- Successfully processed: ${processed}
  - New records created: ${created}
  - Existing records updated: ${updated}
- Patients:
  - New patients created: ${patientsCreated}
  - Existing patients linked: ${patientsLinked}
- Skipped (zero amount): ${skippedZeroAmount}
- Skipped (processing errors): ${skippedError}
		`)

		console.log(
			`Successfully imported ${processed} invoice records to Prisma database`,
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
