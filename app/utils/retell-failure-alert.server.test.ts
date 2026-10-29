import { afterEach, describe, expect, test, vi } from 'vitest'

const sendSMS = vi.fn(async (_args: { to: string; body: string }) => ({
	status: 'success' as string,
	error: undefined as string | undefined,
}))
vi.mock('#app/utils/sms.server.ts', async importOriginal => ({
	...(await importOriginal<typeof import('#app/utils/sms.server.ts')>()),
	sendSMS: (args: { to: string; body: string }) => sendSMS(args),
}))

import { prisma } from '#app/utils/db.server.ts'
import {
	type FailedCall,
	isFailedCall,
	planRetellFailureAlert,
	runRetellFailureAlert,
} from '#app/utils/retell-failure-alert.server.ts'

// 2026-10-28 12:00 PM ET.
const NOW = Date.parse('2026-10-28T16:00:00.000Z')
const MIN = 60 * 1000

const failed = (reason: string, brand: string, minutesAgo: number): FailedCall => ({
	callId: `${reason}-${brand}-${minutesAgo}`,
	reason,
	brand,
	startMs: NOW - minutesAgo * MIN,
})

afterEach(() => {
	sendSMS.mockClear()
	vi.unstubAllEnvs()
})

describe('isFailedCall', () => {
	test('billing stops and Retell errors are failures; normal ends are not', () => {
		for (const reason of ['credit_exhausted', 'budget_reached', 'no_valid_payment', 'error_unknown', 'error_llm_websocket_open'])
			expect(isFailedCall(reason)).toBe(true)
		for (const reason of ['user_hangup', 'agent_hangup', 'call_transfer', 'voicemail_reached', 'inactivity', undefined, null])
			expect(isFailedCall(reason)).toBe(false)
	})
})

describe('planRetellFailureAlert', () => {
	test('one text names the brands, the reason, and Retell billing', () => {
		const plan = planRetellFailureAlert({
			calls: [
				failed('credit_exhausted', 'Knoxville Laser Clinic', 10),
				failed('credit_exhausted', 'Knoxville Laser Clinic', 4),
				failed('credit_exhausted', 'Sarah Hitchcox Aesthetics', 2),
			],
			state: {},
			now: NOW,
		})
		expect(plan.body).toBe(
			[
				'Retell alert: callers are getting no answer.',
				'3 calls failed since Oct 28, 11:50 AM: credit_exhausted (out of credits). Knoxville Laser Clinic: 2, Sarah Hitchcox Aesthetics: 1.',
				'Check Retell billing: dashboard.retellai.com, Billing tab.',
			].join('\n'),
		)
		expect(plan.state.credit_exhausted).toEqual({ sentAt: NOW, lastCallMs: NOW - 2 * MIN })
	})

	test('at most one text an hour for a reason, and never twice for the same call', () => {
		const first = planRetellFailureAlert({
			calls: [failed('credit_exhausted', 'Botox Knox', 5)],
			state: {},
			now: NOW,
		})
		// 20 minutes later a new call fails: still inside the quiet hour.
		const quiet = planRetellFailureAlert({
			calls: [failed('credit_exhausted', 'Botox Knox', 5), failed('credit_exhausted', 'Botox Knox', -20)],
			state: first.state,
			now: NOW + 20 * MIN,
		})
		expect(quiet.body).toBeNull()
		expect(quiet.state).toEqual(first.state)
		// An hour on, the call it already covered does not text again ...
		const covered = planRetellFailureAlert({
			calls: [failed('credit_exhausted', 'Botox Knox', 5)],
			state: first.state,
			now: NOW + 61 * MIN,
		})
		expect(covered.body).toBeNull()
		// ... but a call that failed after it does.
		const again = planRetellFailureAlert({
			calls: [failed('credit_exhausted', 'Botox Knox', -50)],
			state: first.state,
			now: NOW + 61 * MIN,
		})
		expect(again.body).toContain('1 call failed since Oct 28, 12:50 PM')
	})

	test('each reason has its own hour', () => {
		const first = planRetellFailureAlert({
			calls: [failed('credit_exhausted', 'Weight Loss Knox', 3)],
			state: {},
			now: NOW,
		})
		const plan = planRetellFailureAlert({
			calls: [failed('credit_exhausted', 'Weight Loss Knox', -5), failed('error_unknown', 'Botox Knox', -5)],
			state: first.state,
			now: NOW + 10 * MIN,
		})
		expect(plan.body).toContain('error_unknown (Retell error). Botox Knox: 1.')
		expect(plan.body).not.toContain('credit_exhausted')
	})
})

describe('runRetellFailureAlert', () => {
	test('polls Retell, texts the alert number once, and keeps quiet on the next poll', async () => {
		await prisma.blvdSyncState.deleteMany({ where: { key: 'retell-failure-alert' } })
		vi.stubEnv('RETELL_API_KEY', 'test-key')
		vi.stubEnv('SCHEDULE_ALERT_SMS_TO', '+18655550100')
		const calls = [
			{ call_id: 'c1', agent_id: 'agent_c1cca9cc6388b2b19c227a9757', start_timestamp: NOW - 6 * MIN, disconnection_reason: 'credit_exhausted' },
			{ call_id: 'c2', agent_id: 'agent_01931c39dd6b893c7653b3c4a1', start_timestamp: NOW - 3 * MIN, disconnection_reason: 'user_hangup' },
		]
		const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as {
				filter_criteria: { agent_id: string[] }
			}
			expect(body.filter_criteria.agent_id).toContain('agent_c1cca9cc6388b2b19c227a9757')
			return new Response(JSON.stringify(calls), { status: 200 })
		}) as unknown as typeof fetch

		expect(await runRetellFailureAlert({ now: NOW, fetchImpl })).toEqual({ calls: 2, failed: 1, smsSent: true })
		expect(sendSMS).toHaveBeenCalledTimes(1)
		expect(sendSMS.mock.calls[0]![0].to).toBe('+18655550100')
		expect(sendSMS.mock.calls[0]![0].body).toContain('Knoxville Laser Clinic: 1')

		expect(await runRetellFailureAlert({ now: NOW + 5 * MIN, fetchImpl })).toEqual({ calls: 2, failed: 1, smsSent: false })
		expect(sendSMS).toHaveBeenCalledTimes(1)
	})
})
