import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'
import puppeteer from 'puppeteer'

// Load environment variables from .env file
dotenv.config()

// Helper function to add delays for debugging
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// Cookie file path
const COOKIE_PATH = path.join(process.cwd(), 'cookies.json')

/**
 * Save cookies to file
 */
async function saveCookies(page) {
	const cookies = await page.cookies()
	fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2))
}

/**
 * Load cookies from file
 */
async function loadCookies(page) {
	try {
		if (fs.existsSync(COOKIE_PATH)) {
			const cookiesString = fs.readFileSync(COOKIE_PATH, 'utf8')
			const cookies = JSON.parse(cookiesString)
			await page.setCookie(...cookies)
			return true
		}
	} catch (error) {
		console.log('Error loading cookies:', error)
	}
	return false
}

/**
 * Check if we're logged in
 */
async function checkLoginStatus(page, baseUrl) {
	try {
		// Try to access the admin page directly
		await page.goto(`${baseUrl}/admin/reports`, { waitUntil: 'networkidle2' })

		// Check for login form elements
		const loginForm = await page.$('#new_user')
		const passwordInput = await page.$('input[type="password"]')

		// If we find login elements, we're not logged in
		const isNotLoggedIn = !!(loginForm || passwordInput)
		return !isNotLoggedIn
	} catch (error) {
		console.log('Error checking login status:', error)
		return false
	}
}

/**
 * Perform login
 */
async function performLogin(page, baseUrl, username, password) {
	console.log('Logging in...')
	await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })
	await page.type('#auth_key', username)
	await page.click('#log_in')
	await delay(2000)
	await page.type('input[type="password"]', password)
	await page.click('button[type="submit"]')
	await page.waitForNavigation({ waitUntil: 'networkidle2' })
	await saveCookies(page)
}

/**
 * Main function to login and download the invoice CSV file
 */
async function loginAndDownloadInvoiceCSV() {
	const debugDir = path.join(process.cwd(), 'debug')
	if (!fs.existsSync(debugDir)) {
		fs.mkdirSync(debugDir)
	}

	// Create downloads directory if it doesn't exist
	const downloadsDir = path.join(process.cwd(), 'downloads')
	if (!fs.existsSync(downloadsDir)) {
		fs.mkdirSync(downloadsDir)
	}

	// Load credentials from environment variables
	const username = process.env.JANE_USERNAME
	const password = process.env.JANE_PASSWORD
	const baseUrl = 'https://hitchcoxaesthetics.janeapp.com'

	// Check if credentials are provided
	if (!username || !password) {
		throw new Error(
			'JANE_USERNAME and JANE_PASSWORD must be provided in .env file',
		)
	}

	// Launch browser
	const browser = await puppeteer.launch({
		headless: 'new', // Use headless mode for server environments
		defaultViewport: null,
		args: ['--no-sandbox', '--disable-setuid-sandbox'], // For running in containers
	})

	try {
		const page = (await browser.pages())[0]

		// Load cookies if they exist
		await loadCookies(page)

		// Check if we're already logged in
		const isLoggedIn = await checkLoginStatus(page, baseUrl)

		// Login if needed
		if (!isLoggedIn) {
			await performLogin(page, baseUrl, username, password)
		} else {
			console.log('Already logged in, proceeding with download...')
		}

		// Navigate directly to the invoice CSV download URL
		// Get data from last 6 months to the future
		const endDate = new Date()
		endDate.setFullYear(endDate.getFullYear() + 1)
		const endDateStr = endDate.toISOString().split('T')[0]

		const startDate = new Date()
		startDate.setMonth(startDate.getMonth() - 6)
		const startDateStr = startDate.toISOString().split('T')[0]
		console.log('startDateStr', startDateStr)
		console.log('endDateStr', endDateStr)

		const timestamp = Math.floor(Date.now() / 1000)

		console.log('Navigating to invoice report page...')
		await page.goto(
			`${baseUrl}/admin/reports/invoices.csv?end_date=${endDateStr}&requested_at=${timestamp}&start_date=${startDateStr}`,
			{
				waitUntil: 'networkidle2',
			},
		)

		// Wait for the download button to appear
		console.log('Waiting for download button...')
		await page.waitForSelector(
			'a.btn.btn-default[href*="/downloads/"][href$=".csv"]',
			{ timeout: 60000 },
		)

		// Set download location
		const client = await page.target().createCDPSession()
		await client.send('Page.setDownloadBehavior', {
			behavior: 'allow',
			downloadPath: downloadsDir,
		})

		// Click the download button
		console.log('Clicking download button...')
		await page.click('a.btn.btn-default[href*="/downloads/"][href$=".csv"]')

		// Wait for download to complete (simple delay)
		console.log('Waiting for download to complete...')
		await delay(5000)

		// Rename the downloaded file to table-extract.csv
		console.log('Renaming downloaded file...')
		const files = fs.readdirSync(downloadsDir)
		const csvFiles = files.filter(file => file.endsWith('.csv'))

		if (csvFiles.length > 0) {
			// Get the most recent CSV file
			const mostRecentFile = csvFiles.sort((a, b) => {
				return (
					fs.statSync(path.join(downloadsDir, b)).mtime.getTime() -
					fs.statSync(path.join(downloadsDir, a)).mtime.getTime()
				)
			})[0]

			const sourcePath = path.join(downloadsDir, mostRecentFile)
			const destPath = path.join(downloadsDir, 'table-extract.csv')

			// Copy the file to the new name (overwriting if exists)
			fs.copyFileSync(sourcePath, destPath)
			console.log(`Successfully downloaded and saved to ${destPath}`)
		} else {
			throw new Error('No CSV file was downloaded')
		}
	} catch (error) {
		console.error('Error during browser automation:', error.message)

		// Save final page state for debugging
		try {
			const page = (await browser.pages())[0]
			if (page) {
				await page.screenshot({
					path: path.join(debugDir, 'error-state.png'),
					fullPage: true,
				})
				const content = await page.content()
				fs.writeFileSync(path.join(debugDir, 'error-state.html'), content)
			}
		} catch (e) {
			console.error('Error saving debug information:', e)
		}

		throw error // Re-throw the error to be caught by the caller
	} finally {
		// Close the browser
		console.log('Closing browser...')
		await browser.close()
	}
}

// Run the function directly when this script is executed
loginAndDownloadInvoiceCSV()
	.then(() => {
		console.log('Invoice download completed successfully')
		process.exit(0)
	})
	.catch(error => {
		console.error('Error in invoice download:', error)
		process.exit(1)
	})
