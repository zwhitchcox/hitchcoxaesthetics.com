/**
 * Daily health check over every Temporal schedule. The google-ads-spend-sync
 * schedule failed silently from 2026-08-12 to 2026-08-24 (Google sunset Ads
 * API v21) because nothing watched the schedules. This walks each schedule's
 * recent workflow runs and texts SCHEDULE_ALERT_SMS_TO when a schedule's last
 * 3 finished runs all failed.
 *
 * Three consecutive failures, not one: a rolling deploy moves the LiteFS
 * primary lease, which can fail a single run that self-heals on the next tick.
 */
import { Client, Connection } from '@temporalio/client'

import { TEMPORAL_NAMESPACE } from '#app/temporal/config.server.ts'
import { sendSMS } from '#app/utils/sms.server.ts'

const CONSECUTIVE_FAILURES_TO_ALERT = 3
const TERMINAL_STATUSES = new Set([
	'COMPLETED',
	'FAILED',
	'TIMED_OUT',
	'TERMINATED',
	'CANCELLED',
])
const MAX_SMS_SCHEDULES = 4
const MAX_ERROR_CHARS = 160

export interface FailingSchedule {
	scheduleId: string
	newestError: string
}

export interface ScheduleHealthResult {
	schedulesChecked: number
	failing: FailingSchedule[]
	smsSent: boolean
}

export async function runScheduleHealthCheck(): Promise<ScheduleHealthResult> {
	const address = process.env.TEMPORAL_ADDRESS?.trim()
	if (!address) throw new Error('TEMPORAL_ADDRESS is not set')

	const connection = await Connection.connect({ address })
	const client = new Client({ connection, namespace: TEMPORAL_NAMESPACE })
	try {
		const failing: FailingSchedule[] = []
		let schedulesChecked = 0
		for await (const summary of client.schedule.list()) {
			schedulesChecked++
			const description = await client.schedule
				.getHandle(summary.scheduleId)
				.describe()
			// A paused schedule starts no new runs; a human already stepped in.
			if (description.state.paused) continue

			// recentActions is sorted oldest to newest; walk newest first and
			// collect the most recent finished runs.
			const actions = [...description.info.recentActions].reverse()
			const finishedRuns: Array<{
				status: string
				workflowId: string
				runId: string
			}> = []
			for (const action of actions) {
				if (finishedRuns.length >= CONSECUTIVE_FAILURES_TO_ALERT) break
				const { workflowId, firstExecutionRunId } = action.action.workflow
				try {
					const info = await client.workflow
						.getHandle(workflowId, firstExecutionRunId)
						.describe()
					if (!TERMINAL_STATUSES.has(info.status.name)) continue
					finishedRuns.push({
						status: info.status.name,
						workflowId,
						runId: firstExecutionRunId,
					})
				} catch {
					// Run history already past the retention window; skip it.
				}
			}

			if (finishedRuns.length < CONSECUTIVE_FAILURES_TO_ALERT) continue
			if (finishedRuns.some(run => run.status === 'COMPLETED')) continue

			const newest = finishedRuns[0]!
			failing.push({
				scheduleId: summary.scheduleId,
				newestError: await fetchFailureMessage(
					client,
					newest.workflowId,
					newest.runId,
				),
			})
		}

		if (failing.length === 0) {
			return { schedulesChecked, failing, smsSent: false }
		}

		const to = process.env.SCHEDULE_ALERT_SMS_TO?.trim()
		if (!to) {
			console.error(
				'Schedule health: failing schedules but SCHEDULE_ALERT_SMS_TO is not set:',
				failing,
			)
			return { schedulesChecked, failing, smsSent: false }
		}

		const result = await sendSMS({ to, body: alertBody(failing) })
		if (result.status !== 'success') {
			throw new Error(`Schedule health alert SMS failed: ${result.error}`)
		}
		return { schedulesChecked, failing, smsSent: true }
	} finally {
		await connection.close().catch(() => {})
	}
}

function alertBody(failing: FailingSchedule[]): string {
	const lines = failing
		.slice(0, MAX_SMS_SCHEDULES)
		.map(f => `${f.scheduleId}: ${f.newestError}`)
	const overflow = failing.length - MAX_SMS_SCHEDULES
	if (overflow > 0) lines.push(`(+${overflow} more failing)`)
	return [
		`Temporal alert: last ${CONSECUTIVE_FAILURES_TO_ALERT}+ runs failed for ${failing.length} schedule(s).`,
		...lines,
	].join('\n')
}

async function fetchFailureMessage(
	client: Client,
	workflowId: string,
	runId: string,
): Promise<string> {
	try {
		await client.workflow.getHandle(workflowId, runId).result()
		return 'no error recorded'
	} catch (error) {
		return trimForSms(deepestErrorMessage(error))
	}
}

/** Temporal wraps the real error (WorkflowFailedError -> ActivityFailure ->
 * ApplicationFailure); the deepest cause carries the message worth texting. */
function deepestErrorMessage(error: unknown): string {
	let message = error instanceof Error ? error.message : String(error)
	let current: unknown = error
	while (current instanceof Error && current.cause) {
		current = current.cause
		if (current instanceof Error && current.message) message = current.message
	}
	return message
}

function trimForSms(message: string): string {
	const collapsed = message.replace(/\s+/g, ' ').trim()
	return collapsed.length > MAX_ERROR_CHARS
		? `${collapsed.slice(0, MAX_ERROR_CHARS)}...`
		: collapsed
}
