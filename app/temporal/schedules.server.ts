import {
	Client,
	Connection,
	ScheduleAlreadyRunning,
	ScheduleOverlapPolicy,
} from '@temporalio/client'

import {
	BLVD_APPOINTMENT_BACKFILL_INTERVAL_MS,
	getBlvdAppointmentSyncIntervalMs,
	getBlvdRevenueSyncIntervalMs,
	getGoogleAdsSpendSyncIntervalMs,
	getCallRailGa4SyncIntervalMs,
	getCallRailPostHogSyncIntervalMs,
	getFinanceReportsIntervalMs,
	getGoogleReviewsReportsIntervalMs,
	getAppointmentLedgerIntervalMs,
	getLapsedPatientsIntervalMs,
	getPlaidSyncIntervalMs,
	getPodcastTopicsIntervalMs,
	getReviewAppointmentSyncIntervalMs,
	getScheduleHealthAlertIntervalMs,
	hasPodcastTopicsConfig,
} from '#app/utils/background-jobs.server.ts'
import { hasFinanceReportsConfig } from '#app/utils/finance-reports.server.ts'
import { hasGoogleReviewsReportsConfig } from '#app/utils/google-reviews-reports.server.ts'
import { hasAppointmentLedgerConfig } from '#app/utils/appointment-ledger.server.ts'
import { hasLapsedPatientsConfig } from '#app/utils/lapsed-patients.server.ts'
import { hasPlaidConfig } from '#app/utils/plaid-sync.server.ts'
import { TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE } from './config.server.ts'

interface ScheduleDefinition {
	scheduleId: string
	/** Matching id in the legacy jobStatuses registry (the /admin/bg page). */
	jobId: string
	workflowType: string
	intervalMs: number
	enabled: boolean
}

function getScheduleDefinitions(): Array<ScheduleDefinition> {
	return [
		{
			scheduleId: 'reviews-fetch',
			jobId: 'reviewsFetch',
			workflowType: 'reviewsFetchWorkflow',
			intervalMs: 24 * 60 * 60 * 1000,
			enabled: true,
		},
		{
			scheduleId: 'callrail-posthog-sync',
			jobId: 'callRailPostHogConversionSync',
			workflowType: 'callRailPostHogConversionSyncWorkflow',
			intervalMs: getCallRailPostHogSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'callrail-ga4-sync',
			jobId: 'callRailGa4ConversionSync',
			workflowType: 'callRailGa4ConversionSyncWorkflow',
			intervalMs: getCallRailGa4SyncIntervalMs(),
			// Same gate as the legacy scheduler: no GA4 secret, no schedule.
			enabled: Boolean(process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET?.trim()),
		},
		{
			scheduleId: 'follow-up-contact-sync',
			jobId: 'followUpContactSync',
			workflowType: 'followUpContactSyncWorkflow',
			intervalMs: getCallRailPostHogSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'blvd-revenue-sync',
			jobId: 'blvdRealRevenueSync',
			workflowType: 'blvdRealRevenueSyncWorkflow',
			intervalMs: getBlvdRevenueSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'review-appointment-sync',
			jobId: 'reviewAppointmentSync',
			workflowType: 'reviewAppointmentSyncWorkflow',
			intervalMs: getReviewAppointmentSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'plaid-sync',
			jobId: 'plaidSync',
			workflowType: 'plaidSyncWorkflow',
			intervalMs: getPlaidSyncIntervalMs(),
			// Needs Plaid credentials + PLAID_TOKENS_JSON (or a local tokens file).
			enabled: hasPlaidConfig(),
		},
		{
			scheduleId: 'finance-reports',
			jobId: 'financeReports',
			workflowType: 'financeReportsWorkflow',
			intervalMs: getFinanceReportsIntervalMs(),
			// Needs REPORTS_DATABASE_URL (the reports Postgres).
			enabled: hasFinanceReportsConfig(),
		},
		{
			scheduleId: 'appointment-ledger',
			jobId: 'appointmentLedger',
			workflowType: 'appointmentLedgerWorkflow',
			intervalMs: getAppointmentLedgerIntervalMs(),
			// Needs REPORTS_DATABASE_URL + Boulevard admin creds.
			enabled: hasAppointmentLedgerConfig(),
		},
		{
			scheduleId: 'google-reviews-reports',
			jobId: 'googleReviewsReports',
			workflowType: 'googleReviewsReportsWorkflow',
			intervalMs: getGoogleReviewsReportsIntervalMs(),
			// Needs REPORTS_DATABASE_URL + Google OAuth creds.
			enabled: hasGoogleReviewsReportsConfig(),
		},
		{
			scheduleId: 'lapsed-patients',
			jobId: 'lapsedPatients',
			workflowType: 'lapsedPatientsWorkflow',
			intervalMs: getLapsedPatientsIntervalMs(),
			// Needs REPORTS_DATABASE_URL + Boulevard admin creds.
			enabled: hasLapsedPatientsConfig(),
		},
		{
			scheduleId: 'blvd-appointment-sync',
			jobId: 'blvdAppointmentSync',
			workflowType: 'blvdAppointmentSyncWorkflow',
			intervalMs: getBlvdAppointmentSyncIntervalMs(),
			enabled: Boolean(process.env.BLVD_API_KEY?.trim()),
		},
		{
			scheduleId: 'blvd-appointment-backfill',
			jobId: 'blvdAppointmentBackfill',
			workflowType: 'blvdAppointmentBackfillWorkflow',
			intervalMs: BLVD_APPOINTMENT_BACKFILL_INTERVAL_MS,
			enabled: Boolean(process.env.BLVD_API_KEY?.trim()),
		},
		{
			scheduleId: 'google-ads-spend-sync',
			jobId: 'googleAdsSpendSync',
			workflowType: 'googleAdsSpendSyncWorkflow',
			intervalMs: getGoogleAdsSpendSyncIntervalMs(),
			enabled: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()),
		},
		{
			scheduleId: 'schedule-health-alert',
			jobId: 'scheduleHealthAlert',
			workflowType: 'scheduleHealthAlertWorkflow',
			intervalMs: getScheduleHealthAlertIntervalMs(),
			// Needs a destination number for the failure texts.
			enabled: Boolean(process.env.SCHEDULE_ALERT_SMS_TO?.trim()),
		},
		{
			scheduleId: 'podcast-topics',
			jobId: 'podcastTopics',
			workflowType: 'podcastTopicsWorkflow',
			intervalMs: getPodcastTopicsIntervalMs(),
			// Needs the OpenRouter call-intelligence config for idea generation.
			enabled: hasPodcastTopicsConfig(),
		},
	]
}

export interface TemporalScheduleStatus {
	scheduleId: string
	jobId: string
	lastRun: string | null
	nextRun: string | null
	running: boolean
	paused: boolean
}

/**
 * Live status of every enabled Temporal schedule, for the /admin/bg page.
 * Since the Temporal migration the in-process job registry never runs on a
 * schedule, so its lastRun/nextRun stay null; this is the real state.
 */
export async function describeSchedules(
	address: string,
): Promise<TemporalScheduleStatus[]> {
	const connection = await Connection.connect({ address })
	const client = new Client({ connection, namespace: TEMPORAL_NAMESPACE })
	try {
		const enabled = getScheduleDefinitions().filter(d => d.enabled)
		const statuses = await Promise.all(
			enabled.map(async (definition): Promise<TemporalScheduleStatus | null> => {
				try {
					const description = await client.schedule
						.getHandle(definition.scheduleId)
						.describe()
					const recent = description.info.recentActions
					return {
						scheduleId: definition.scheduleId,
						jobId: definition.jobId,
						lastRun: recent.length
							? recent[recent.length - 1]!.takenAt.toISOString()
							: null,
						nextRun: description.info.nextActionTimes[0]?.toISOString() ?? null,
						running: description.info.runningActions.length > 0,
						paused: description.state.paused,
					}
				} catch {
					return null
				}
			}),
		)
		return statuses.filter((s): s is TemporalScheduleStatus => s != null)
	} finally {
		await connection.close().catch(() => {})
	}
}

/**
 * Idempotently creates one Temporal Schedule per background job with the same
 * cadences (and env-var overrides) as the legacy setInterval scheduler. If a
 * schedule already exists but its interval no longer matches the env-derived
 * cadence, the interval is updated so cadence changes take effect on deploy.
 */
export async function ensureSchedules(address: string): Promise<void> {
	const connection = await Connection.connect({ address })
	const client = new Client({ connection, namespace: TEMPORAL_NAMESPACE })

	try {
		for (const definition of getScheduleDefinitions()) {
			if (!definition.enabled) continue

			try {
				await client.schedule.create({
					scheduleId: definition.scheduleId,
					spec: {
						intervals: [{ every: definition.intervalMs }],
					},
					action: {
						type: 'startWorkflow',
						workflowType: definition.workflowType,
						taskQueue: TEMPORAL_TASK_QUEUE,
					},
					policies: {
						overlap: ScheduleOverlapPolicy.SKIP,
						catchupWindow: '1 minute',
					},
				})
				console.log(`Created Temporal schedule "${definition.scheduleId}"`)
			} catch (error) {
				if (error instanceof ScheduleAlreadyRunning) {
					try {
						const handle = client.schedule.getHandle(definition.scheduleId)
						const description = await handle.describe()
						const currentMs = description.spec.intervals?.[0]?.every
						if (currentMs !== definition.intervalMs) {
							await handle.update(previous => ({
								...previous,
								spec: { intervals: [{ every: definition.intervalMs }] },
							}))
							console.log(
								`Updated Temporal schedule "${definition.scheduleId}" interval ${String(currentMs)} -> ${definition.intervalMs}ms`,
							)
						}
					} catch (updateError) {
						console.error(
							`Failed to reconcile schedule "${definition.scheduleId}"`,
							updateError,
						)
					}
					continue
				}
				throw error
			}
		}
	} finally {
		await connection.close().catch(() => {})
	}
}
