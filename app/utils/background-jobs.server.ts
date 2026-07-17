import { exec } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { getInstanceInfoSync } from 'litefs-js'

import { syncBoulevardRealRevenue } from '#app/utils/blvd-revenue-sync.server.ts'
import { syncReviewAppointments } from '#app/utils/review-link-sync.server.ts'
import { sendReviewReminderTexts } from '#app/utils/review-reminder-sms.server.ts'
import { syncCallRailPhoneConversionsToPostHog } from '#app/utils/callrail-posthog-conversions.server.ts'
import { syncFollowUpContacts } from '#app/utils/follow-ups.server.ts'
import { syncRetellDirectCallsToPostHog } from '#app/utils/retell-direct-calls.server.ts'
import { syncCallRailPhoneConversionsToGa4 } from '#app/utils/ga4-phone-conversions.server.ts'
import { syncGoogleReviewsToPostHog } from '#app/utils/reviews-posthog-sync.server.ts'
import {
	hasPlaidConfig,
	syncPlaidTransactions,
} from '#app/utils/plaid-sync.server.ts'
import {
	hasFinanceReportsConfig,
	syncFinanceReports,
} from '#app/utils/finance-reports.server.ts'
import {
	hasGoogleReviewsReportsConfig,
	syncGoogleReviewsToReports,
} from '#app/utils/google-reviews-reports.server.ts'

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
	reviewAppointmentSync: {
		id: 'reviewAppointmentSync',
		name: 'Review Appointment Sync',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	plaidSync: {
		id: 'plaidSync',
		name: 'Plaid Transaction Sync',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	financeReports: {
		id: 'financeReports',
		name: 'Finance Reports (Metabase)',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	googleReviewsReports: {
		id: 'googleReviewsReports',
		name: 'Google Reviews → Reports DB',
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
			// DB is now current — push reviews into PostHog (idempotent via $insert_id).
			const posthog = await syncGoogleReviewsToPostHog()
			console.log('Google reviews → PostHog sync:', posthog)
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

export async function runReviewAppointmentSyncJob(): Promise<void> {
	const job = jobStatuses['reviewAppointmentSync']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		const result = await syncReviewAppointments()
		console.log('Review appointment sync completed:', result)
		// Reminder texts ride the same cadence; a Twilio hiccup must not fail
		// the sync itself.
		try {
			const reminders = await sendReviewReminderTexts()
			if (reminders.sent > 0)
				console.log('Review reminder texts sent:', reminders.sent)
		} catch (smsError) {
			console.error('Review reminder texts failed:', smsError)
		}
		job.status = 'completed'
		job.lastError = null
	} catch (error) {
		console.error('Review appointment sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(
			Date.now() + getReviewAppointmentSyncIntervalMs(),
		).toISOString()
	}
}

// Initialize the background jobs scheduler
export async function runPlaidSyncJob(): Promise<void> {
	const job = jobStatuses['plaidSync']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()
	try {
		const result = await syncPlaidTransactions()
		console.log(
			`Plaid sync: ${result.upserted} txns upserted from ${result.items} connection(s), ${result.replacedPending} pending replaced`,
		)
		job.status = 'completed'
		job.lastError = null
	} catch (error) {
		console.error('Plaid sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(Date.now() + getPlaidSyncIntervalMs()).toISOString()
	}
}

export async function runGoogleReviewsReportsJob(): Promise<void> {
	const job = jobStatuses['googleReviewsReports']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()
	try {
		const result = await syncGoogleReviewsToReports()
		console.log(
			`Google reviews: ${result.reviews} reviews upserted into the reports warehouse`,
		)
		job.status = 'completed'
		job.lastError = null
	} catch (error) {
		console.error('Google reviews reports sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(
			Date.now() + getGoogleReviewsReportsIntervalMs(),
		).toISOString()
	}
}

export function getGoogleReviewsReportsIntervalMs() {
	const raw = process.env.GOOGLE_REVIEWS_REPORTS_INTERVAL_MS?.trim()
	const parsed = raw ? Number(raw) : NaN
	// Every 6 hours by default — reviews arrive daily, staleness was the bug.
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 6 * 60 * 60 * 1000
}

export async function runFinanceReportsJob(): Promise<void> {
	const job = jobStatuses['financeReports']
	if (!job) return
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()
	try {
		const result = await syncFinanceReports()
		console.log(
			`Finance reports: ${result.budgetRows} budget rows + ${result.projectionDays} projection days loaded into the reports warehouse`,
		)
		job.status = 'completed'
		job.lastError = null
	} catch (error) {
		console.error('Finance reports sync failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(
			Date.now() + getFinanceReportsIntervalMs(),
		).toISOString()
	}
}

export function initializeBackgroundJobs() {
	if (isInitialized) return
	isInitialized = true

	const temporalAddress = process.env.TEMPORAL_ADDRESS?.trim()
	if (process.env.NODE_ENV === 'production' && temporalAddress) {
		// The LiteFS primary lease MOVES between machines on every rolling
		// deploy, so primary-ness cannot be a boot-time check — on 2026-07-15
		// the worker spent a morning failing every write on a machine that had
		// become a replica after boot. Reconcile continuously instead: the
		// worker runs while this machine holds the primary lease and pauses
		// the moment it doesn't.
		console.log(
			`Initializing background jobs via Temporal (${temporalAddress})...`,
		)
		void reconcileTemporalWorker(temporalAddress)
		setInterval(
			() => void reconcileTemporalWorker(temporalAddress),
			30_000,
		).unref()
		return
	}

	// Legacy setInterval path (no Temporal): jobs write SQLite, so only the
	// LiteFS primary may run them. This path predates multi-machine and keeps
	// the boot-time gate.
	if (process.env.NODE_ENV === 'production' && process.env.FLY_APP_NAME) {
		const { currentIsPrimary } = getInstanceInfoSync()
		if (!currentIsPrimary) {
			console.log(
				'Not the LiteFS primary — background jobs run on the primary machine only.',
			)
			return
		}
	}

	initializeIntervalScheduling()
}

function isLiteFsPrimary() {
	if (!process.env.FLY_APP_NAME) return true
	return getInstanceInfoSync().currentIsPrimary
}

let temporalSchedulesEnsured = false
// Transient FUSE reads on a replica can misreport "primary" for one tick
// (seen 2026-07-15: replica started a worker for 30s). Require two
// consecutive primary readings before starting; pause immediately on one
// replica reading.
let consecutivePrimaryReads = 0

async function reconcileTemporalWorker(temporalAddress: string) {
	try {
		const { startTemporalWorker, pauseTemporalWorker, isTemporalWorkerRunning } =
			await import('#app/temporal/worker.server.ts')
		const isPrimary = isLiteFsPrimary()
		consecutivePrimaryReads = isPrimary ? consecutivePrimaryReads + 1 : 0
		if (consecutivePrimaryReads >= 2 && !isTemporalWorkerRunning()) {
			console.log('LiteFS primary — starting Temporal worker')
			await startTemporalWorker(temporalAddress)
			if (!temporalSchedulesEnsured) {
				const { ensureSchedules } = await import(
					'#app/temporal/schedules.server.ts'
				)
				await ensureSchedules(temporalAddress)
				temporalSchedulesEnsured = true
			}
		} else if (!isPrimary && isTemporalWorkerRunning()) {
			pauseTemporalWorker()
		}
	} catch (error) {
		console.error(
			'Temporal worker reconcile failed (will retry in 30s)',
			error,
		)
	}
}

// Legacy setInterval scheduling, used when TEMPORAL_ADDRESS is unset (e.g.
// local dev).
function initializeIntervalScheduling() {
	console.log('Initializing background jobs...')

	// Schedule the reviews fetch job to run daily
	jobIntervals.reviewsFetch = setInterval(
		() => {
			runReviewsFetchJob().catch(console.error)
		},
		24 * 60 * 60 * 1000,
	) // 24 hours

	// Also run shortly after boot: a bare 24h interval never fires in practice
	// because every deploy/restart resets it before the first tick.
	setTimeout(() => {
		runReviewsFetchJob().catch(console.error)
	}, 2 * 60_000)

	// Set the next run time for reviews fetch
	const reviewsFetch = jobStatuses['reviewsFetch']
	if (reviewsFetch) {
		reviewsFetch.nextRun = new Date(Date.now() + 2 * 60_000).toISOString()
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

	if (shouldAutoRunReviewAppointmentSync()) {
		const intervalMs = getReviewAppointmentSyncIntervalMs()
		jobIntervals.reviewAppointmentSync = setInterval(() => {
			runReviewAppointmentSyncJob().catch(console.error)
		}, intervalMs)

		const reviewSync = jobStatuses['reviewAppointmentSync']
		if (reviewSync) {
			reviewSync.nextRun = new Date(Date.now() + intervalMs).toISOString()
		}

		setTimeout(() => {
			runReviewAppointmentSyncJob().catch(console.error)
		}, 60_000)
	}

	if (shouldAutoRunPlaidSync()) {
		const intervalMs = getPlaidSyncIntervalMs()
		jobIntervals.plaidSync = setInterval(() => {
			runPlaidSyncJob().catch(console.error)
		}, intervalMs)

		const plaidSync = jobStatuses['plaidSync']
		if (plaidSync) {
			plaidSync.nextRun = new Date(Date.now() + intervalMs).toISOString()
		}

		setTimeout(() => {
			runPlaidSyncJob().catch(console.error)
		}, 150_000)
	}

	if (shouldAutoRunFinanceReports()) {
		const intervalMs = getFinanceReportsIntervalMs()
		jobIntervals.financeReports = setInterval(() => {
			runFinanceReportsJob().catch(console.error)
		}, intervalMs)

		const financeReports = jobStatuses['financeReports']
		if (financeReports) {
			financeReports.nextRun = new Date(Date.now() + intervalMs).toISOString()
		}

		// after plaid-sync's 150s kick so the budget reflects fresh transactions
		setTimeout(() => {
			runFinanceReportsJob().catch(console.error)
		}, 240_000)
	}

	if (shouldAutoRunGoogleReviewsReports()) {
		const intervalMs = getGoogleReviewsReportsIntervalMs()
		jobIntervals.googleReviewsReports = setInterval(() => {
			runGoogleReviewsReportsJob().catch(console.error)
		}, intervalMs)
		const job = jobStatuses['googleReviewsReports']
		if (job) job.nextRun = new Date(Date.now() + intervalMs).toISOString()
		setTimeout(() => {
			runGoogleReviewsReportsJob().catch(console.error)
		}, 90_000)
	}

	console.log('Background jobs initialized')
}

function shouldAutoRunGoogleReviewsReports() {
	return (
		hasGoogleReviewsReportsConfig() &&
		(process.env.NODE_ENV === 'production' ||
			process.env.ENABLE_DEV_BACKGROUND_JOBS === '1')
	)
}

function shouldAutoRunPlaidSync() {
	return (
		hasPlaidConfig() &&
		(process.env.NODE_ENV === 'production' ||
			process.env.ENABLE_DEV_BACKGROUND_JOBS === '1')
	)
}

export function getPlaidSyncIntervalMs() {
	const raw = process.env.PLAID_SYNC_INTERVAL_MS?.trim()
	const parsed = raw ? Number(raw) : NaN
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 24 * 60 * 60 * 1000
}

function shouldAutoRunFinanceReports() {
	return (
		hasFinanceReportsConfig() &&
		(process.env.NODE_ENV === 'production' ||
			process.env.ENABLE_DEV_BACKGROUND_JOBS === '1')
	)
}

export function getFinanceReportsIntervalMs() {
	const raw = process.env.FINANCE_REPORTS_INTERVAL_MS?.trim()
	const parsed = raw ? Number(raw) : NaN
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 24 * 60 * 60 * 1000
}

function shouldAutoRunReviewAppointmentSync() {
	return (
		process.env.NODE_ENV === 'production' ||
		process.env.ENABLE_DEV_BACKGROUND_JOBS === '1'
	)
}

export function getReviewAppointmentSyncIntervalMs() {
	const minutes = Number.parseInt(
		process.env.REVIEW_APPOINTMENT_SYNC_INTERVAL_MINUTES ?? '10',
		10,
	)
	const safeMinutes = Number.isFinite(minutes) && minutes >= 3 ? minutes : 10
	return safeMinutes * 60 * 1000
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

export function getCallRailGa4SyncIntervalMs() {
	const minutes = Number.parseInt(
		process.env.CALLRAIL_GA4_SYNC_INTERVAL_MINUTES ?? '30',
		10,
	)
	const safeMinutes = Number.isFinite(minutes) && minutes >= 5 ? minutes : 30
	return safeMinutes * 60 * 1000
}

export function getCallRailPostHogSyncIntervalMs() {
	const minutes = Number.parseInt(
		process.env.CALLRAIL_POSTHOG_SYNC_INTERVAL_MINUTES ?? '30',
		10,
	)
	const safeMinutes = Number.isFinite(minutes) && minutes >= 5 ? minutes : 30
	return safeMinutes * 60 * 1000
}

export function getBlvdRevenueSyncIntervalMs() {
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
