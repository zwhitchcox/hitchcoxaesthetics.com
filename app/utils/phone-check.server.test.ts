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
	checkAgent,
	checkCalls,
	checkNumber,
	checkQueue,
	checkTrackers,
	checkVoicemail,
	collectPhoneCheck,
	etMidnight,
	PHONE_PATHS,
	planPhoneCheckAlert,
	readPhoneCheckState,
	runPhoneCheck,
} from '#app/utils/phone-check.server.ts'
import { RETELL_BOOKING_AGENT_BRANDS } from '../../scripts/retell-booking-brands.ts'

const sha = PHONE_PATHS.find(p => p.key === 'sarah')!
const klc = PHONE_PATHS.find(p => p.key === 'knoxville-laser-clinic')!
// 2026-10-29 8:00 AM ET.
const NOW = Date.parse('2026-10-29T12:00:00.000Z')

afterEach(() => {
	sendSMS.mockClear()
	vi.unstubAllEnvs()
})

test('the agent, model and voice match scripts/retell-booking-brands.ts', () => {
	for (const path of PHONE_PATHS) {
		const brand = RETELL_BOOKING_AGENT_BRANDS[path.key as keyof typeof RETELL_BOOKING_AGENT_BRANDS]
		expect({ key: path.key, agentId: path.agentId, llmId: path.llmId, number: path.retellNumber, s2sModel: path.s2sModel, voiceId: path.voiceId }).toEqual({
			key: path.key,
			agentId: brand.agentId,
			llmId: brand.llmId,
			number: brand.phoneNumber,
			s2sModel: brand.s2sModel,
			voiceId: brand.voiceId,
		})
	}
})

describe('checks', () => {
	test('the agent: present, with the right LLM, model and voice', () => {
		const agent = { agent_id: sha.agentId, voice_id: 'xai-Eve', response_engine: { llm_id: sha.llmId } }
		expect(checkAgent(sha, agent, { s2s_model: 'grok-voice-3.0' })).toMatchObject({ status: 'ok', detail: 'grok-voice-3.0, voice xai-Eve.' })
		expect(checkAgent(sha, { ...agent, voice_id: 'openai-Cimo' }, { s2s_model: 'gpt-realtime-2.1' })).toMatchObject({
			status: 'fail',
			detail: 'The agent is wrong: model is gpt-realtime-2.1, not grok-voice-3.0; voice is openai-Cimo, not xai-Eve.',
		})
		expect(checkAgent(sha, null, null).status).toBe('fail')
	})

	test('the number rings the agent', () => {
		expect(checkNumber(sha, { inbound_agents: [{ agent_id: sha.agentId }] }).status).toBe('ok')
		expect(checkNumber(sha, { inbound_agents: [{ agent_id: 'agent_other' }] })).toMatchObject({
			status: 'fail',
			detail: '(865) 345-2258 rings agent_other, not agent_01931c39dd6b893c7653b3c4a1.',
		})
		expect(checkNumber(sha, null).status).toBe('fail')
	})

	test("yesterday's calls fail when one did not reach the agent", () => {
		const calls = [
			{ agent_id: klc.agentId, disconnection_reason: 'user_hangup' },
			{ agent_id: klc.agentId, disconnection_reason: 'credit_exhausted' },
			{ agent_id: klc.agentId, disconnection_reason: 'credit_exhausted' },
			{ agent_id: sha.agentId, disconnection_reason: 'agent_hangup' },
		]
		expect(checkCalls(klc, calls)).toMatchObject({ status: 'fail', detail: '1 worked, 2 failed (credit_exhausted 2).' })
		expect(checkCalls(sha, calls)).toMatchObject({ status: 'ok', detail: '1 worked, 0 failed.' })
	})

	test('CallRail numbers: active, and each dials the right line', () => {
		const ok = klc.trackers.map(t => ({ id: t.id, status: 'active', call_flow: { type: 'basic', destination_number: t.routesTo } }))
		expect(checkTrackers(klc, ok).status).toBe('ok')
		expect(checkTrackers(klc, [{ ...ok[0]!, status: 'disabled' }, ok[1]!])).toMatchObject({ status: 'fail', detail: 'GMB Bearden is disabled.' })
		expect(checkTrackers(klc, [ok[0]!])).toMatchObject({ status: 'fail', detail: 'GMB Farragut is missing.' })
		const wrong = [ok[0]!, { ...ok[1]!, call_flow: { type: 'basic', destination_number: '+18650000000' } }]
		expect(checkTrackers(klc, wrong).detail).toBe('GMB Farragut dials (865) 000-0000, not (865) 606-8139.')
		// A number set to the agent-then-voicemail flow needs an advanced call flow.
		const flow = { ...klc, trackers: klc.trackers.map(t => ({ ...t, routesTo: 'agent-then-voicemail' })) }
		expect(checkTrackers(flow, ok).status).toBe('fail')
		expect(checkTrackers(flow, ok.map(t => ({ ...t, call_flow: { type: 'advanced' } }))).status).toBe('ok')
	})

	test('the RingCentral queue forwards to the agent after the hold time', () => {
		const rule = { queue: { holdTime: 15, holdTimeExpirationAction: 'UnconditionalForwarding', unconditionalForwarding: [{ phoneNumber: '+18653452258', action: 'HoldTimeExpiration' }] } }
		expect(checkQueue(sha, rule)).toMatchObject({ status: 'ok', detail: 'Rings Zane and Sarah for 15 s, then forwards to (865) 345-2258.' })
		expect(checkQueue(sha, { queue: { ...rule.queue, holdTimeExpirationAction: 'Voicemail' } })?.status).toBe('fail')
		expect(checkQueue(klc, rule)).toBeNull()
	})

	test('voicemails email Zane and Sarah', () => {
		const recipients = [
			{ extensionNumber: '101', emailAddresses: ['z@example.com'] },
			{ extensionNumber: '102', emailAddresses: ['s@example.com'] },
		]
		expect(checkVoicemail(sha, { queue: { voicemails: { notifyByEmail: true }, emailRecipients: recipients }, callrail: [] }).status).toBe('ok')
		expect(checkVoicemail(sha, { queue: { voicemails: { notifyByEmail: true }, emailRecipients: recipients.slice(0, 1) }, callrail: [] }).status).toBe('fail')
		const alert = (tracker_id: string, who: object) => ({ tracker_id, call_enabled: true, alert_type: 'vm_only', send_email: true, ...who })
		const both = klc.trackers.flatMap(t => [alert(t.id, { user_id: 'USR1' }), alert(t.id, { email: 'z@example.com' })])
		expect(checkVoicemail(klc, { queue: null, callrail: both }).status).toBe('ok')
		expect(checkVoicemail(klc, { queue: null, callrail: both.slice(1) })).toMatchObject({
			status: 'fail',
			detail: 'No voicemail email to both Zane and Sarah on GMB Bearden.',
		})
	})
})

test('midnight ET moves with daylight saving time', () => {
	expect(new Date(etMidnight('2026-10-31')).toISOString()).toBe('2026-10-31T04:00:00.000Z')
	expect(new Date(etMidnight('2026-11-01')).toISOString()).toBe('2026-11-01T04:00:00.000Z')
	expect(new Date(etMidnight('2026-11-02')).toISOString()).toBe('2026-11-02T05:00:00.000Z')
})

test('a failing check texts once a day', () => {
	const rows = [
		{ brand: 'Botox Knox', check: 'AI agent', status: 'fail' as const, detail: 'Retell has no agent x.' },
		{ brand: 'Botox Knox', check: 'Calls yesterday', status: 'ok' as const, detail: '3 worked, 0 failed.' },
		{ brand: 'Weight Loss Knox', check: 'RingCentral queue', status: 'skip' as const, detail: 'Not checked.' },
	]
	const first = planPhoneCheckAlert({ rows, alerted: {}, now: NOW })
	expect(first.body).toBe(
		['Phone check: 1 problem.', 'Botox Knox, AI agent: Retell has no agent x.', 'https://hitchcoxaesthetics.com/admin/phone-check'].join('\n'),
	)
	// The same day: no second text. The next day: a new text.
	expect(planPhoneCheckAlert({ rows, alerted: first.alerted, now: NOW + 3600e3 }).body).toBeNull()
	expect(planPhoneCheckAlert({ rows, alerted: first.alerted, now: NOW + 24 * 3600e3 }).body).not.toBeNull()
})

test('a run against the services saves the rows and texts the failures', async () => {
	await prisma.blvdSyncState.deleteMany({ where: { key: 'phone-check' } })
	vi.stubEnv('RETELL_API_KEY', 'test-key')
	vi.stubEnv('CALLRAIL_API_KEY', 'test-key')
	vi.stubEnv('SCHEDULE_ALERT_SMS_TO', '+18655550100')
	vi.stubEnv('RING_CENTRAL_APP_SERVER_URL', '')
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
	const fetchImpl = vi.fn(async (input: string | URL | Request) => {
		const url = String(input)
		const path = PHONE_PATHS.find(p => url.includes(p.agentId) || url.includes(p.llmId) || url.includes(encodeURIComponent(p.retellNumber)))
		if (url.includes('/v2/list-calls')) return json([{ agent_id: klc.agentId, disconnection_reason: 'credit_exhausted' }])
		if (url.includes('/get-agent/')) return json({ agent_id: path!.agentId, voice_id: 'xai-Eve', response_engine: { llm_id: path!.llmId } })
		if (url.includes('/get-retell-llm/')) return json({ s2s_model: 'grok-voice-3.0' })
		if (url.includes('/get-phone-number/')) return json({ inbound_agents: [{ agent_id: path!.agentId }] })
		if (url.endsWith('/a.json')) return json({ accounts: [{ id: 'ACC1' }] })
		if (url.includes('status=active'))
			return json({ trackers: PHONE_PATHS.flatMap(p => p.trackers.map(t => ({ id: t.id, status: 'active', call_flow: { type: 'basic', destination_number: t.routesTo } }))) })
		if (url.includes('status=disabled')) return json({ trackers: [] })
		if (url.includes('/notifications.json'))
			return json({ notifications: klc.trackers.flatMap(t => [{ tracker_id: t.id, call_enabled: true, alert_type: 'vm_only', send_email: true, user_id: 'USR1' }, { tracker_id: t.id, call_enabled: true, alert_type: 'vm_only', send_email: true, email: 'z@example.com' }]) })
		return json({ message: 'not found' }, 404)
	}) as unknown as typeof fetch

	const rows = await collectPhoneCheck({ now: NOW, fetchImpl })
	const failing = rows.filter(r => r.status === 'fail').map(r => `${r.brand}|${r.check}`)
	expect(failing).toEqual(['Knoxville Laser Clinic|Calls yesterday'])
	// Without RingCentral keys the queue rows are skipped, not failed.
	expect(rows.filter(r => r.status === 'skip').map(r => r.check)).toEqual(Array(6).fill('RingCentral queue').map((c, i) => (i % 2 ? 'Voicemail emails' : c)))
	// The calls are yesterday's, Oct 28 ET.
	const callsBody = JSON.parse(String((fetchImpl as any).mock.calls.find((c: any[]) => String(c[0]).includes('list-calls'))[1].body)) as {
		filter_criteria: { start_timestamp: { lower_threshold: number; upper_threshold: number } }
	}
	expect(new Date(callsBody.filter_criteria.start_timestamp.lower_threshold).toISOString()).toBe('2026-10-28T04:00:00.000Z')
	expect(new Date(callsBody.filter_criteria.start_timestamp.upper_threshold).toISOString()).toBe('2026-10-29T04:00:00.000Z')

	expect(await runPhoneCheck({ now: NOW, fetchImpl })).toMatchObject({ failed: 1, smsSent: true })
	expect(sendSMS.mock.calls[0]![0].body).toContain('Knoxville Laser Clinic, Calls yesterday: 0 worked, 1 failed (credit_exhausted 1).')
	expect(await runPhoneCheck({ now: NOW + 600e3, fetchImpl })).toMatchObject({ failed: 1, smsSent: false })
	expect((await readPhoneCheckState()).runs).toHaveLength(2)
})
