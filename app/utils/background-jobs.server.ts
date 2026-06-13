import { exec } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { syncBoulevardRealRevenue } from '#app/utils/blvd-revenue-sync.server.ts'
import { syncCallRailPhoneConversionsToPostHog } from '#app/utils/callrail-posthog-conversions.server.ts'
import { syncFollowUpContacts } from '#app/utils/follow-ups.server.ts'
import { syncRetellDirectCallsToPostHog } from '#app/utils/retell-direct-calls.server.ts'
import { syncCallRailPhoneConversionsToGa4 } from '#app/utils/ga4-phone-conversions.server.ts'

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
	reviewsFetch: {
		id: 'reviewsFetch',
		name: 'Reviews Fetch',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	callRailPostHogConversionSync: {
		id: 'callRailPostHogConversionSync',
		name: 'CallRail PostHog Conversion Sync',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	blvdRealRevenueSync: {
		id: 'blvdRealRevenueSync',
		name: 'Boulevard Real Revenue Sync',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	callRailGa4ConversionSync: {
		id: 'callRailGa4ConversionSync',
		name: 'CallRail GA4 Conversion Sync',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	followUpContactSync: {
		id: 'followUpContactSync',
		name: 'Follow-up Contact Sync',
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

export async function runCallRailPostHogConversionSyncJob(): Promise<void> {
	const job = jobStatuses['callRailPostHogConversionSync']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		const result = await syncCallRailPhoneConversionsToPostHog()
		if (!result.ok) {
			job.status = 'failed'
			job.lastError = result.error ?? 'Unknown CallRail/PostHog sync error'
			return
		}
		console.log('CallRail PostHog conversion sync completed:', result)

		// Also pick up calls dialed straight to the Retell agent numbers,
		// which never pass through CallRail.
		const retellResult = await syncRetellDirectCallsToPostHog()
		console.log('Retell direct call sync completed:', retellResult)

		job.status = 'completed'
		job.lastError = retellResult.ok
			? null
			: `retell_direct: ${retellResult.error}`
	} catch (error) {
		console.error('CallRail PostHog conversion sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(
			Date.now() + getCallRailPostHogSyncIntervalMs(),
		).toISOString()
	}
}

export async function runCallRailGa4ConversionSyncJob(): Promise<void> {
	const job = jobStatuses['callRailGa4ConversionSync']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		const result = await syncCallRailPhoneConversionsToGa4()
		if (!result.ok) {
			job.status = 'failed'
			job.lastError = result.error ?? 'Unknown CallRail/GA4 sync error'
			return
		}

		console.log('CallRail GA4 conversion sync completed:', result)
		job.status = 'completed'
		job.lastError = null
	} catch (error) {
		console.error('CallRail GA4 conversion sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(
			Date.now() + getCallRailGa4SyncIntervalMs(),
		).toISOString()
	}
}

export async function runBlvdRealRevenueSyncJob(): Promise<void> {
	const job = jobStatuses['blvdRealRevenueSync']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		const result = await syncBoulevardRealRevenue()
		if (!result.ok) {
			job.status = 'failed'
			job.lastError = result.error ?? 'Unknown Boulevard revenue sync error'
			return
		}

		console.log('Boulevard real revenue sync completed:', result)
		job.status = 'completed'
		job.lastError = null
	} catch (error) {
		console.error('Boulevard real revenue sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(
			Date.now() + getBlvdRevenueSyncIntervalMs(),
		).toISOString()
	}
}

export async function runFollowUpContactSyncJob(): Promise<void> {
	const job = jobStatuses['followUpContactSync']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		const result = await syncFollowUpContacts()
		console.log('Follow-up contact sync completed:', result)
		job.status = 'completed'
		job.lastError = result.google_voice_error
			? `google_voice: ${result.google_voice_error}`
			: null
	} catch (error) {
		console.error('Follow-up contact sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(
			Date.now() + getCallRailPostHogSyncIntervalMs(),
		).toISOString()
	}
}

// Initialize the background jobs scheduler
export function initializeBackgroundJobs() {
	if (isInitialized) return

	console.log('Initializing background jobs...')

	// Schedule the reviews fetch job to run daily
	jobIntervals.reviewsFetch = setInterval(
		() => {
			runReviewsFetchJob().catch(console.error)
		},
		24 * 60 * 60 * 1000,
	) // 24 hours

	// Set the next run time for reviews fetch
	const reviewsFetch = jobStatuses['reviewsFetch']
	if (reviewsFetch) {
		reviewsFetch.nextRun = new Date(
			Date.now() + 24 * 60 * 60 * 1000,
		).toISOString()
	}

	if (shouldAutoRunCallRailPostHogSync()) {
		const intervalMs = getCallRailPostHogSyncIntervalMs()
		jobIntervals.callRailPostHogConversionSync = setInterval(() => {
			runCallRailPostHogConversionSyncJob().catch(console.error)
		}, intervalMs)

		const conversionSync = jobStatuses['callRailPostHogConversionSync']
		if (conversionSync) {
			conversionSync.nextRun = new Date(Date.now() + intervalMs).toISOString()
		}

		setTimeout(() => {
			runCallRailPostHogConversionSyncJob().catch(console.error)
		}, 90_000)
	}

	if (shouldAutoRunCallRailGa4Sync()) {
		const intervalMs = getCallRailGa4SyncIntervalMs()
		jobIntervals.callRailGa4ConversionSync = setInterval(() => {
			runCallRailGa4ConversionSyncJob().catch(console.error)
		}, intervalMs)

		const ga4Sync = jobStatuses['callRailGa4ConversionSync']
		if (ga4Sync) {
			ga4Sync.nextRun = new Date(Date.now() + intervalMs).toISOString()
		}

		setTimeout(() => {
			runCallRailGa4ConversionSyncJob().catch(console.error)
		}, 105_000)
	}

	if (shouldAutoRunCallRailPostHogSync()) {
		const intervalMs = getCallRailPostHogSyncIntervalMs()
		jobIntervals.followUpContactSync = setInterval(() => {
			runFollowUpContactSyncJob().catch(console.error)
		}, intervalMs)

		const followUpSync = jobStatuses['followUpContactSync']
		if (followUpSync) {
			followUpSync.nextRun = new Date(Date.now() + intervalMs).toISOString()
		}

		setTimeout(() => {
			runFollowUpContactSyncJob().catch(console.error)
		}, 135_000)
	}

	if (shouldAutoRunBlvdRevenueSync()) {
		const intervalMs = getBlvdRevenueSyncIntervalMs()
		jobIntervals.blvdRealRevenueSync = setInterval(() => {
			runBlvdRealRevenueSyncJob().catch(console.error)
		}, intervalMs)

		const revenueSync = jobStatuses['blvdRealRevenueSync']
		if (revenueSync) {
			revenueSync.nextRun = new Date(Date.now() + intervalMs).toISOString()
		}

		setTimeout(() => {
			runBlvdRealRevenueSyncJob().catch(console.error)
		}, 120_000)
	}

	isInitialized = true
	console.log('Background jobs initialized')
}

function shouldAutoRunCallRailPostHogSync() {
	return (
		process.env.NODE_ENV === 'production' ||
		process.env.ENABLE_DEV_BACKGROUND_JOBS === '1'
	)
}

function shouldAutoRunBlvdRevenueSync() {
	return (
		process.env.NODE_ENV === 'production' ||
		process.env.ENABLE_DEV_BACKGROUND_JOBS === '1'
	)
}

function shouldAutoRunCallRailGa4Sync() {
	return (
		(process.env.NODE_ENV === 'production' ||
			process.env.ENABLE_DEV_BACKGROUND_JOBS === '1') &&
		Boolean(process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET?.trim())
	)
}

function getCallRailGa4SyncIntervalMs() {
	const minutes = Number.parseInt(
		process.env.CALLRAIL_GA4_SYNC_INTERVAL_MINUTES ?? '30',
		10,
	)
	const safeMinutes = Number.isFinite(minutes) && minutes >= 5 ? minutes : 30
	return safeMinutes * 60 * 1000
}

function getCallRailPostHogSyncIntervalMs() {
	const minutes = Number.parseInt(
		process.env.CALLRAIL_POSTHOG_SYNC_INTERVAL_MINUTES ?? '30',
		10,
	)
	const safeMinutes = Number.isFinite(minutes) && minutes >= 5 ? minutes : 30
	return safeMinutes * 60 * 1000
}

function getBlvdRevenueSyncIntervalMs() {
	const minutes = Number.parseInt(
		process.env.BLVD_REVENUE_SYNC_INTERVAL_MINUTES ?? '120',
		10,
	)
	const safeMinutes = Number.isFinite(minutes) && minutes >= 15 ? minutes : 120
	return safeMinutes * 60 * 1000
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
