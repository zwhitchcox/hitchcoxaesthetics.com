// Temporal workflow definitions. This file is bundled for the Temporal
// workflow sandbox, so it must stay pure: no server imports, no side effects.
import { proxyActivities } from '@temporalio/workflow'

import type { createActivities } from './activities.server.ts'

type Activities = ReturnType<typeof createActivities>

const defaultRetry = {
	maximumAttempts: 3,
	initialInterval: '30 seconds',
	backoffCoefficient: 2,
}

const activities = proxyActivities<Activities>({
	startToCloseTimeout: '30 minutes',
	retry: defaultRetry,
})

// reviews-fetch shells out to a script that can take a long time, so it gets
// a more generous timeout than the rest.
const slowActivities = proxyActivities<Activities>({
	startToCloseTimeout: '60 minutes',
	retry: defaultRetry,
})

export async function reviewsFetchWorkflow(): Promise<void> {
	await slowActivities.reviewsFetchActivity()
}

export async function callRailPostHogConversionSyncWorkflow(): Promise<void> {
	await activities.callRailPostHogConversionSyncActivity()
}

export async function callRailGa4ConversionSyncWorkflow(): Promise<void> {
	await activities.callRailGa4ConversionSyncActivity()
}

export async function followUpContactSyncWorkflow(): Promise<void> {
	await activities.followUpContactSyncActivity()
}

export async function blvdRealRevenueSyncWorkflow(): Promise<void> {
	await activities.blvdRealRevenueSyncActivity()
}

export async function reviewAppointmentSyncWorkflow(): Promise<void> {
	await activities.reviewAppointmentSyncActivity()
}

export async function plaidSyncWorkflow(): Promise<void> {
	await activities.plaidSyncActivity()
}

// Budget aggregation + a 6-month Boulevard projection, can run long.
export async function financeReportsWorkflow(): Promise<void> {
	await slowActivities.financeReportsActivity()
}

export async function appointmentLedgerWorkflow(): Promise<void> {
	await activities.appointmentLedgerActivity()
}

export async function googleReviewsReportsWorkflow(): Promise<void> {
	await activities.googleReviewsReportsActivity()
}

// Full appointment-history scan, can run long.
export async function lapsedPatientsWorkflow(): Promise<void> {
	await slowActivities.lapsedPatientsActivity()
}
