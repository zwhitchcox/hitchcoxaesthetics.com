import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { parse } from 'csv-parse/sync'
import { parseISO } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize Prisma client
const prisma = new PrismaClient()

// Time zone constant
const TIME_ZONE = 'America/New_York'

// Function to parse Eastern Time date from CSV
function parseETDate(dateString) {
	// Parse date string to Date object
	const date = parseISO(dateString)
	// Convert to Eastern Time
	return toZonedTime(date, TIME_ZONE)
}

// Function to get all dates between start and end, inclusive
function getAllDatesBetween(startDate, endDate) {
	const dates = []

	// Important: Ensure both dates are in ET timezone
	const startInET = toZonedTime(startDate, TIME_ZONE)
	const endInET = toZonedTime(endDate, TIME_ZONE)

	// Clone the start date to avoid modifying the original
	const current = toZonedTime(new Date(startInET), TIME_ZONE)

	// Loop until we reach the end date
	while (current <= endInET) {
		// Format date in ET timezone and add to the array
		dates.push(formatInTimeZone(current, TIME_ZONE, 'yyyy-MM-dd'))

		// Move to the next day
		current.setDate(current.getDate() + 1)
	}

	return dates
}

// Parse collected amount from record
function parseCollectedAmount(record) {
	const collected = parseFloat((record.Collected || '0').replace(/[$,]/g, ''))
	return isNaN(collected) ? 0 : collected
}

// Calculate profit for a given item and revenue
function calculateProfit(item, revenue) {
	let profitMargin = 0.45 // Default 45% profit margin

	// Apply different profit margins based on service type
	item = item?.toLowerCase() || ''

	if (item.includes('laser') || item.includes('cold sculpting')) {
		profitMargin = 0.95 // 95% profit margin
	} else if (
		item.includes('botox') ||
		item.includes('dysport') ||
		item.includes('xeomin')
	) {
		profitMargin = 0.35 // 35% profit margin
	} else if (
		item.includes('dermal filler') ||
		item.includes('juvederm') ||
		item.includes('radiesse') ||
		item.includes('restylane')
	) {
		profitMargin = 0.35 // 35% profit margin
	} else if (item.includes('skin') || item.includes('facial')) {
		profitMargin = 0.65 // 65% profit margin
	} else if (
		item.includes('tirzepatide') ||
		item.includes('semaglutide') ||
		item.includes('ozempic') ||
		item.includes('wegovy') ||
		item.includes('mounjaro')
	) {
		profitMargin = 0.4 // 40% profit margin
	} else if (item.includes('microneedling')) {
		profitMargin = 0.75 // 75% profit margin
	}

	return revenue * profitMargin
}

// Calculate profit margin
function calculateProfitMargin(profit, revenue) {
	return revenue > 0 ? profit / revenue : 0
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

// Process the CSV and store analysis data in the database
async function processAndStoreAnalysis() {
	try {
		console.log('Starting analysis process...')

		// Define the date range for initial analysis
		const endDate = toZonedTime(new Date(), TIME_ZONE)
		const startDate = toZonedTime(new Date(endDate), TIME_ZONE)
		startDate.setFullYear(startDate.getFullYear() - 1) // Default to 1 year of data

		const dailyOverhead = 200 // Default $200 per day overhead

		// Path to the CSV file
		const csvFilePath = path.join(
			process.cwd(),
			'downloads',
			'table-extract.csv',
		)

		if (!fs.existsSync(csvFilePath)) {
			console.error(
				'Analysis data file not found. Please make sure table-extract.csv exists in the downloads directory.',
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

		// Process records for the entire time range first
		const startDateStr = formatInTimeZone(startDate, TIME_ZONE, 'yyyy-MM-dd')
		const endDateStr = formatInTimeZone(endDate, TIME_ZONE, 'yyyy-MM-dd')

		console.log(`Analyzing data from ${startDateStr} to ${endDateStr}`)

		let totalProfit = 0
		let totalRevenue = 0
		let totalAppointments = 0

		// Daily stats tracking
		const dailyStats = {}

		// Get all days in the date range
		const allDatesInRange = getAllDatesBetween(startDate, endDate)

		// Initialize all days with overhead
		allDatesInRange.forEach(dateStr => {
			dailyStats[dateStr] = {
				revenue: 0,
				profit: 0,
				count: 0,
				overhead: dailyOverhead,
			}
		})

		// Category stats tracking
		const categoryStats = {
			laser: { count: 0, revenue: 0, profit: 0 },
			botox: { count: 0, revenue: 0, profit: 0 },
			filler: { count: 0, revenue: 0, profit: 0 },
			skin: { count: 0, revenue: 0, profit: 0 },
			weight: { count: 0, revenue: 0, profit: 0 },
			microneedling: { count: 0, revenue: 0, profit: 0 },
			other: { count: 0, revenue: 0, profit: 0 },
		}

		// Process each record
		console.log('Processing records...')
		records.forEach(record => {
			// Parse date and convert to ET timezone
			const purchaseDate = parseETDate(record['Purchase Date'])

			// Skip records outside the date range
			if (purchaseDate < startDate || purchaseDate > endDate) {
				return
			}

			// Use Collected field for revenue calculations
			const collected = parseCollectedAmount(record)
			const item = record.Item
			const status = record.Status

			if (isNaN(collected) || collected === 0) {
				return
			}

			// Skip records with status "no_charge" as they don't contribute to profit
			if (status && status.toLowerCase() === 'no_charge') {
				return
			}

			const calculatedProfit = calculateProfit(item, collected)

			totalProfit += calculatedProfit
			totalRevenue += collected
			totalAppointments++

			// Track daily stats
			const dateStr = formatInTimeZone(purchaseDate, TIME_ZONE, 'yyyy-MM-dd')
			if (!dailyStats[dateStr]) {
				dailyStats[dateStr] = {
					revenue: 0,
					profit: 0,
					count: 0,
					overhead: dailyOverhead,
				}
			}

			dailyStats[dateStr].revenue += collected
			dailyStats[dateStr].profit += calculatedProfit
			dailyStats[dateStr].count += 1

			// Update category stats
			const category = getServiceCategory(item)

			// Update the appropriate category stats
			switch (category) {
				case 'laser':
					categoryStats.laser.count++
					categoryStats.laser.revenue += collected
					categoryStats.laser.profit += calculatedProfit
					break
				case 'botox':
					categoryStats.botox.count++
					categoryStats.botox.revenue += collected
					categoryStats.botox.profit += calculatedProfit
					break
				case 'filler':
					categoryStats.filler.count++
					categoryStats.filler.revenue += collected
					categoryStats.filler.profit += calculatedProfit
					break
				case 'skin':
					categoryStats.skin.count++
					categoryStats.skin.revenue += collected
					categoryStats.skin.profit += calculatedProfit
					break
				case 'weight':
					categoryStats.weight.count++
					categoryStats.weight.revenue += collected
					categoryStats.weight.profit += calculatedProfit
					break
				case 'microneedling':
					categoryStats.microneedling.count++
					categoryStats.microneedling.revenue += collected
					categoryStats.microneedling.profit += calculatedProfit
					break
				default:
					categoryStats.other.count++
					categoryStats.other.revenue += collected
					categoryStats.other.profit += calculatedProfit
					break
			}
		})

		// Calculate additional analytics
		const averageTransactionValue = totalRevenue / totalAppointments || 0
		const averageProfitPerTransaction = totalProfit / totalAppointments || 0
		const totalProfitMargin = calculateProfitMargin(totalProfit, totalRevenue)

		// Calculate overhead costs
		const uniqueDays = allDatesInRange.length
		const totalOverhead = uniqueDays * dailyOverhead
		const profitAfterOverhead = totalProfit - totalOverhead
		const profitMarginAfterOverhead = calculateProfitMargin(
			profitAfterOverhead,
			totalRevenue,
		)

		console.log('Saving analysis data to database...')

		// Store in database using a transaction
		await prisma.$transaction(async tx => {
			// Create the main analysis record
			const analysis = await tx.analysisData.create({
				data: {
					startDate: startDateStr,
					endDate: endDateStr,
					totalRevenue,
					totalProfit,
					totalProfitMargin,
					totalOverhead,
					profitAfterOverhead,
					profitMarginAfterOverhead,
					totalAppointments,
					averageTransactionValue,
					averageProfitPerTransaction,
					dailyOverhead,
					uniqueDays,
					lastUpdated: new Date(),
				},
			})

			console.log(`Created analysis record with ID: ${analysis.id}`)

			// Store daily stats
			const dailyStatsPromises = Object.entries(dailyStats).map(
				([date, stats]) => {
					return tx.dailyStats.create({
						data: {
							date,
							revenue: stats.revenue,
							profit: stats.profit,
							count: stats.count,
							overhead: stats.overhead,
							analysisId: analysis.id,
						},
					})
				},
			)

			await Promise.all(dailyStatsPromises)
			console.log(`Stored ${dailyStatsPromises.length} daily stats records`)

			// Store category stats
			const categoryPromises = Object.entries(categoryStats).map(
				([category, stats]) => {
					return tx.categorySummary.create({
						data: {
							category,
							count: stats.count,
							revenue: stats.revenue,
							profit: stats.profit,
							analysisId: analysis.id,
						},
					})
				},
			)

			await Promise.all(categoryPromises)
			console.log(`Stored ${categoryPromises.length} category stats records`)
		})

		console.log('Analysis completed and stored in database successfully!')
	} catch (error) {
		console.error('Error in analysis process:', error)
		throw error
	} finally {
		await prisma.$disconnect()
	}
}

// Run the main function
processAndStoreAnalysis()
	.then(() => {
		console.log('Analysis script completed successfully')
		process.exit(0)
	})
	.catch(error => {
		console.error('Analysis script failed:', error)
		process.exit(1)
	})
