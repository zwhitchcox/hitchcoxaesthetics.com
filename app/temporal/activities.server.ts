// Temporal activities. These run in the web server process, so they reuse the
// existing job runners and keep the in-memory jobStatuses object up to date,
// which keeps the /admin/bg status UI working unchanged.
import {
	getJobStatuses,
	runBlvdRealRevenueSyncJob,
	runCallRailGa4ConversionSyncJob,
	runCallRailPostHogConversionSyncJob,
	runFollowUpContactSyncJob,
	runPlaidSyncJob,
	runFinanceReportsJob,
	runGoogleReviewsReportsJob,
	runAppointmentLedgerJob,
	runLapsedPatientsJob,
	runReviewAppointmentSyncJob,
	runReviewsFetchJob,
} from '#app/utils/background-jobs.server.ts'

async function runJobAndReport(
	jobId: string,
	run: () => Promise<void>,
): Promise<void> {
	await run()

	// The legacy runners record failures on jobStatuses instead of throwing.
	// Surface them as thrown errors so Temporal can retry and mark the run.
	const job = getJobStatuses().find(status => status.id === jobId)
	if (job?.status === 'failed') {
		throw new Error(job.lastError ?? `${jobId} failed`)
	}
}

export function createActivities() {
	return {
		async reviewsFetchActivity() {
			await runJobAndReport('reviewsFetch', runReviewsFetchJob)
		},
		async callRailPostHogConversionSyncActivity() {
			await runJobAndReport(
				'callRailPostHogConversionSync',
				runCallRailPostHogConversionSyncJob,
			)
		},
		async callRailGa4ConversionSyncActivity() {
			await runJobAndReport(
				'callRailGa4ConversionSync',
				runCallRailGa4ConversionSyncJob,
			)
		},
		async followUpContactSyncActivity() {
			await runJobAndReport('followUpContactSync', runFollowUpContactSyncJob)
		},
		async blvdRealRevenueSyncActivity() {
			await runJobAndReport('blvdRealRevenueSync', runBlvdRealRevenueSyncJob)
		},
		async reviewAppointmentSyncActivity() {
			await runJobAndReport(
				'reviewAppointmentSync',
				runReviewAppointmentSyncJob,
			)
		},
		async plaidSyncActivity() {
			await runJobAndReport('plaidSync', runPlaidSyncJob)
		},
		async financeReportsActivity() {
			await runJobAndReport('financeReports', runFinanceReportsJob)
		},
		async appointmentLedgerActivity() {
			await runJobAndReport('appointmentLedger', runAppointmentLedgerJob)
		},
		async googleReviewsReportsActivity() {
			await runJobAndReport(
				'googleReviewsReports',
				runGoogleReviewsReportsJob,
			)
		},
		async lapsedPatientsActivity() {
			await runJobAndReport('lapsedPatients', runLapsedPatientsJob)
		},
	}
}
