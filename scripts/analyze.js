import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Define the structure of our CSV records
/**
 * @typedef {Object} CsvRecord
 * @property {string} Location
 * @property {string} ["Purchase Date"]
 * @property {string} ["Invoice Date"]
 * @property {string} ["Patient Guid"]
 * @property {string} Patient
 * @property {string} Item
 * @property {string} ["Staff Member"]
 * @property {string} Payer
 * @property {string} ["Invoice #"]
 * @property {string} ["Income Category"]
 * @property {string} Details
 * @property {string} Status
 * @property {string} Subtotal
 * @property {string} Total
 * @property {string} Collected
 * @property {string} Balance
 * @property {string} ["Sales Tax"]
 * @property {string} profit
 */

/**
 * @typedef {Object} ProfitDetail
 * @property {string} item
 * @property {number} total
 * @property {number} calculatedProfit
 * @property {string} status
 * @property {Date} date
 */

/**
 * @typedef {Object} CategorySummary
 * @property {number} count
 * @property {number} revenue
 * @property {number} profit
 */

/**
 * @typedef {Object} DateRange
 * @property {Date} startDate
 * @property {Date} endDate
 */

/**
 * Calculate profit based on the item type and total amount
 *
 * @param {string} item The service/product item
 * @param {number} total The total amount charged
 * @returns {number} The calculated profit
 */
function calculateProfit(item, total) {
	// Implement the profit calculation logic from the Google Sheets formula
	if (item.match(/Laser|Touch Up Laser|Pigmented Lesion/i)) {
		return total // 100% of total
	} else if (item.match(/Botox|Lip Flip|Tox/i)) {
		return total * 0.5 // 50% of total
	} else if (item.match(/Microneedling/i)) {
		// Ensure profit is not negative, minimum profit is $0
		return Math.max(total - 35, 0)
	} else if (item.match(/Skin|Juvederm|Filler/i)) {
		return total * 0.5 // 50% of total
	} else if (item.match(/Tirzepatide|Semaglutide/i)) {
		return total * 0.9 // 90% of total
	} else {
		return total * 0.5 // Default: 50% of total
	}
}

/**
 * Process a CSV file and calculate detailed profitability metrics
 * @returns {Promise<Object>} Analysis results
 */
async function processCsvFile() {
	const filePath = path.join(process.cwd(), 'downloads', 'table-extract.csv')

	if (!fs.existsSync(filePath)) {
		console.error(`File not found: ${filePath}`)
		throw new Error('Invoice data file not found. Download may have failed.')
	}

	// Set default date range to last 30 days
	const endDate = new Date()
	const startDate = new Date()
	startDate.setDate(startDate.getDate() - 30)

	const dailyOverhead = 200 // Default $200 per day overhead

	return new Promise((resolve, reject) => {
		const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' })

		// Parse the CSV file
		parse(
			fileContent,
			{
				columns: true,
				skip_empty_lines: true,
				trim: true,
				relaxColumnCount: true,
			},
			(err, records) => {
				if (err) {
					console.error('Error parsing CSV:', err)
					reject(err)
					return
				}

				let totalProfit = 0
				let totalRevenue = 0
				const profitDetails = []
				const skippedRecords = []
				const dailyStats = {}

				// Category counts and revenue tracking
				const categoryStats = {
					laser: { count: 0, revenue: 0, profit: 0 },
					botox: { count: 0, revenue: 0, profit: 0 },
					filler: { count: 0, revenue: 0, profit: 0 },
					skin: { count: 0, revenue: 0, profit: 0 },
					weight: { count: 0, revenue: 0, profit: 0 }, // Tirzepatide/Semaglutide
					microneedling: { count: 0, revenue: 0, profit: 0 },
					other: { count: 0, revenue: 0, profit: 0 },
				}

				// Process each record
				records.forEach(record => {
					const purchaseDate = new Date(record['Purchase Date'])

					// Skip records outside the date range
					if (purchaseDate < startDate || purchaseDate > endDate) {
						return
					}

					const total = parseFloat(record.Total)
					const item = record.Item
					const status = record.Status

					if (isNaN(total) || total === 0) {
						skippedRecords.push(record)
						return
					}

					// Skip records with status "no_charge" as they don't contribute to profit
					if (status && status.toLowerCase() === 'no_charge') {
						skippedRecords.push(record)
						return
					}

					const calculatedProfit = calculateProfit(item, total)
					profitDetails.push({
						item,
						total,
						calculatedProfit,
						status,
						date: purchaseDate,
					})

					totalProfit += calculatedProfit
					totalRevenue += total

					// Track daily stats
					const dateStr = purchaseDate.toISOString().split('T')[0]
					if (!dailyStats[dateStr]) {
						dailyStats[dateStr] = {
							revenue: 0,
							profit: 0,
							count: 0,
							overhead: dailyOverhead,
						}
					}
					dailyStats[dateStr].revenue += total
					dailyStats[dateStr].profit += calculatedProfit
					dailyStats[dateStr].count += 1

					// Track category statistics
					if (item.match(/Laser|Touch Up Laser|Pigmented Lesion/i)) {
						categoryStats.laser.count++
						categoryStats.laser.revenue += total
						categoryStats.laser.profit += calculatedProfit
					} else if (item.match(/Botox|Lip Flip|Tox/i)) {
						categoryStats.botox.count++
						categoryStats.botox.revenue += total
						categoryStats.botox.profit += calculatedProfit
					} else if (item.match(/Juvederm|Filler/i)) {
						categoryStats.filler.count++
						categoryStats.filler.revenue += total
						categoryStats.filler.profit += calculatedProfit
					} else if (item.match(/Skin/i)) {
						categoryStats.skin.count++
						categoryStats.skin.revenue += total
						categoryStats.skin.profit += calculatedProfit
					} else if (item.match(/Tirzepatide|Semaglutide/i)) {
						categoryStats.weight.count++
						categoryStats.weight.revenue += total
						categoryStats.weight.profit += calculatedProfit
					} else if (item.match(/Microneedling/i)) {
						categoryStats.microneedling.count++
						categoryStats.microneedling.revenue += total
						categoryStats.microneedling.profit += calculatedProfit
					} else {
						categoryStats.other.count++
						categoryStats.other.revenue += total
						categoryStats.other.profit += calculatedProfit
					}
				})

				// Calculate additional analytics
				const totalAppointments = profitDetails.length
				const averageTransactionValue = totalRevenue / totalAppointments || 0
				const averageProfitPerTransaction = totalProfit / totalAppointments || 0
				const totalProfitMargin = (totalProfit / totalRevenue) * 100 || 0

				// Calculate overhead costs
				const uniqueDays = Object.keys(dailyStats).length
				const totalOverhead = uniqueDays * dailyOverhead
				const profitAfterOverhead = totalProfit - totalOverhead
				const profitMarginAfterOverhead =
					(profitAfterOverhead / totalRevenue) * 100 || 0

				// Save the analysis results to a JSON file
				const analysisResults = {
					dateRange: {
						startDate: startDate.toISOString(),
						endDate: endDate.toISOString(),
					},
					summary: {
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
					},
					categoryStats,
					dailyStats,
					lastUpdated: new Date().toISOString(),
				}

				// Create the analysis directory if it doesn't exist
				const dataDir = path.join(process.cwd(), 'data')
				if (!fs.existsSync(dataDir)) {
					fs.mkdirSync(dataDir, { recursive: true })
				}

				// Save the analysis results to a JSON file
				fs.writeFileSync(
					path.join(dataDir, 'analysis-results.json'),
					JSON.stringify(analysisResults, null, 2),
				)

				console.log(
					'Analysis completed and results saved to data/analysis-results.json',
				)
				resolve(analysisResults)
			},
		)
	})
}

// Run the analysis directly when this script is executed
processCsvFile()
	.then(() => {
		console.log('Analysis completed successfully')
		process.exit(0)
	})
	.catch(error => {
		console.error('Error in analysis:', error)
		process.exit(1)
	})
