import {
	Client,
	Connection,
	ScheduleAlreadyRunning,
	ScheduleOverlapPolicy,
} from '@temporalio/client'

import {
	getBlvdRevenueSyncIntervalMs,
	getCallRailGa4SyncIntervalMs,
	getCallRailPostHogSyncIntervalMs,
	getFinanceReportsIntervalMs,
	getGoogleReviewsReportsIntervalMs,
	getPlaidSyncIntervalMs,
	getReviewAppointmentSyncIntervalMs,
} from '#app/utils/background-jobs.server.ts'
import { hasFinanceReportsConfig } from '#app/utils/finance-reports.server.ts'
import { hasGoogleReviewsReportsConfig } from '#app/utils/google-reviews-reports.server.ts'
import { hasPlaidConfig } from '#app/utils/plaid-sync.server.ts'
import { TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE } from './config.server.ts'

interface ScheduleDefinition {
	scheduleId: string
	workflowType: string
	intervalMs: number
	enabled: boolean
}

function getScheduleDefinitions(): Array<ScheduleDefinition> {
	return [
		{
			scheduleId: 'reviews-fetch',
			workflowType: 'reviewsFetchWorkflow',
			intervalMs: 24 * 60 * 60 * 1000,
			enabled: true,
		},
		{
			scheduleId: 'callrail-posthog-sync',
			workflowType: 'callRailPostHogConversionSyncWorkflow',
			intervalMs: getCallRailPostHogSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'callrail-ga4-sync',
			workflowType: 'callRailGa4ConversionSyncWorkflow',
			intervalMs: getCallRailGa4SyncIntervalMs(),
			// Same gate as the legacy scheduler: no GA4 secret, no schedule.
			enabled: Boolean(process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET?.trim()),
		},
		{
			scheduleId: 'follow-up-contact-sync',
			workflowType: 'followUpContactSyncWorkflow',
			intervalMs: getCallRailPostHogSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'blvd-revenue-sync',
			workflowType: 'blvdRealRevenueSyncWorkflow',
			intervalMs: getBlvdRevenueSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'review-appointment-sync',
			workflowType: 'reviewAppointmentSyncWorkflow',
			intervalMs: getReviewAppointmentSyncIntervalMs(),
			enabled: true,
		},
		{
			scheduleId: 'plaid-sync',
			workflowType: 'plaidSyncWorkflow',
			intervalMs: getPlaidSyncIntervalMs(),
			// Needs Plaid credentials + PLAID_TOKENS_JSON (or a local tokens file).
			enabled: hasPlaidConfig(),
		},
		{
			scheduleId: 'finance-reports',
			workflowType: 'financeReportsWorkflow',
			intervalMs: getFinanceReportsIntervalMs(),
			// Needs REPORTS_DATABASE_URL (the Metabase reports Postgres).
			enabled: hasFinanceReportsConfig(),
		},
		{
			scheduleId: 'google-reviews-reports',
			workflowType: 'googleReviewsReportsWorkflow',
			intervalMs: getGoogleReviewsReportsIntervalMs(),
			// Needs REPORTS_DATABASE_URL + Google OAuth creds.
			enabled: hasGoogleReviewsReportsConfig(),
		},
	]
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
