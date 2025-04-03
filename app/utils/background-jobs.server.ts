import { exec } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

// Background job types and interfaces
export interface JobStatus {
	id: string
	name: string
	status: 'idle' | 'running' | 'completed' | 'failed'
	lastRun: string | null
	nextRun: string | null
	lastRunDuration: number | null
	lastError: string | null
}

// Global job status tracking - in a real app, this should be in a database
let jobStatuses: Record<string, JobStatus> = {
	invoiceDownload: {
		id: 'invoiceDownload',
		name: 'Invoice Download',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	reviewsFetch: {
		id: 'reviewsFetch',
		name: 'Reviews Fetch',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
}

// Keep track of the interval IDs so we can clear them if needed
let jobIntervals: Record<string, NodeJS.Timeout> = {}

// Initialize background jobs when the server starts
let isInitialized = false

// Helper to run shell commands
const execAsync = promisify(exec)

// Run the download invoices job
export async function runInvoiceDownloadJob(): Promise<void> {
	const job = jobStatuses['invoiceDownload']
	if (!job) return

	// If already running, don't start again
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		// Path to the download-invoices script
		const scriptPath = path.join(
			process.cwd(),
			'scripts',
			'download-invoices.js',
		)

		// Execute the download script
		console.log('Downloading invoices...')
		const downloadResult = await execAsync(`node ${scriptPath}`)

		if (downloadResult.stderr) {
			console.error('Invoice download error:', downloadResult.stderr)
			job.status = 'failed'
			job.lastError = downloadResult.stderr
			return
		}

		console.log('Invoice download completed:', downloadResult.stdout)

		// Now run the import script to process the downloaded data
		console.log('Importing invoices...')
		const importScriptPath = path.join(
			process.cwd(),
			'scripts',
			'import-invoices.js',
		)

		const importResult = await execAsync(`node ${importScriptPath}`)

		if (importResult.stderr) {
			console.error('Invoice import error:', importResult.stderr)
			job.status = 'failed'
			job.lastError = `Download succeeded but import failed: ${importResult.stderr}`
		} else {
			console.log('Invoice import completed:', importResult.stdout)
			job.status = 'completed'
			job.lastError = null
		}
	} catch (error) {
		console.error('Invoice processing failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
	}
}

// Run the fetch reviews job
export async function runReviewsFetchJob(): Promise<void> {
	const job = jobStatuses['reviewsFetch']
	if (!job) return

	// If already running, don't start again
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		// Path to the fetch-reviews script
		const scriptPath = path.join(process.cwd(), 'scripts', 'fetch-reviews.js')
		console.log(
			'Running fetch-reviews script to update Google Reviews in database',
		)

		// Execute the script
		const { stdout, stderr } = await execAsync(
			`node --no-deprecation ${scriptPath}`,
		)

		if (stderr) {
			console.error('Reviews fetch error:', stderr)
			job.status = 'failed'
			job.lastError = stderr
		} else {
			console.log('Reviews fetch completed:', stdout)
			job.status = 'completed'
			job.lastError = null
		}
	} catch (error) {
		console.error('Reviews fetch failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Daily
	}
}

// Initialize the background jobs scheduler
export function initializeBackgroundJobs() {
	if (isInitialized) return

	console.log('Initializing background jobs...')

	// Schedule the invoice download job to run every hour
	jobIntervals.invoiceDownload = setInterval(
		() => {
			runInvoiceDownloadJob().catch(console.error)
		},
		15 * 60 * 1000,
	) // 15 minutes

	// Schedule the reviews fetch job to run daily
	jobIntervals.reviewsFetch = setInterval(
		() => {
			runReviewsFetchJob().catch(console.error)
		},
		24 * 60 * 60 * 1000,
	) // 24 hours

	// Set the next run time for invoice download
	const invoiceDownload = jobStatuses['invoiceDownload']
	if (invoiceDownload) {
		invoiceDownload.nextRun = new Date(
			Date.now() + 60 * 60 * 1000,
		).toISOString()
	}

	// Set the next run time for reviews fetch
	const reviewsFetch = jobStatuses['reviewsFetch']
	if (reviewsFetch) {
		reviewsFetch.nextRun = new Date(
			Date.now() + 24 * 60 * 60 * 1000,
		).toISOString()
	}

	isInitialized = true
	console.log('Background jobs initialized')
}

// Export the job statuses for the UI
export function getJobStatuses() {
	return Object.values(jobStatuses)
}

// Clear a job's error
export function clearJobError(jobId: string) {
	if (jobStatuses[jobId]) {
		jobStatuses[jobId].lastError = null
		return true
	}
	return false
}
