/**
 * Texts Zane when Retell calls fail. From 2026-10-21 3:44 PM to 2026-10-29
 * 12:15 PM ET the Retell account had no credits: Retell rejected every call
 * with credit_exhausted, 143 calls from 111 callers got no answer, and nobody
 * knew for 8 days.
 *
 * A rejected call fires no Retell webhook, so this polls the call list every
 * few minutes and texts SCHEDULE_ALERT_SMS_TO (the same number as the
 * schedule health alert). It texts at most once an hour for each reason and
 * never twice about the same call.
 */
import { prisma } from '#app/utils/db.server.ts'
import { getProductionRetellAgents } from '#app/utils/retell-direct-calls.server.ts'
import { sendSMS } from '#app/utils/sms.server.ts'

const RETELL_API_URL = 'https://api.retellai.com'
const STATE_KEY = 'retell-failure-alert'
/** Each poll reads this far back; the saved state skips calls already texted. */
const LOOKBACK_MS = 30 * 60 * 1000
const QUIET_MS = 60 * 60 * 1000

/** What each reason means for the caller, in the text. Any error_* reason
 * is a Retell error. */
const REASONS: Record<string, string> = {
	credit_exhausted: 'out of credits',
	budget_reached: 'monthly budget reached',
	no_valid_payment: 'no valid payment method',
	concurrency_limit_reached: 'too many calls at once',
}

/** True when the caller never got the agent: a billing or limit stop, or a
 * Retell error. A hang-up, a transfer or a voicemail is a normal end. */
export function isFailedCall(reason: string | null | undefined) {
	return !!reason && (reason in REASONS || reason.startsWith('error_'))
}

export type FailedCall = {
	callId: string
	reason: string
	brand: string
	startMs: number
}

/** Per reason: when the last text went out, and the newest call it covered. */
export type AlertState = Record<string, { sentAt: number; lastCallMs: number }>

const etTime = (ms: number) =>
	new Date(ms).toLocaleString('en-US', {
		timeZone: 'America/New_York',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	})

/** The text to send now, if any, and the state to save after it is sent. */
export function planRetellFailureAlert({
	calls,
	state,
	now,
}: {
	calls: FailedCall[]
	state: AlertState
	now: number
}): { body: string | null; state: AlertState } {
	const next: AlertState = { ...state }
	const lines: string[] = []
	const reasons = [...new Set(calls.map(c => c.reason))].sort()
	for (const reason of reasons) {
		const prev = state[reason]
		const fresh = calls.filter(
			c => c.reason === reason && c.startMs > (prev?.lastCallMs ?? 0),
		)
		if (!fresh.length) continue
		if (prev && now - prev.sentAt < QUIET_MS) continue
		const brands = new Map<string, number>()
		for (const c of fresh) brands.set(c.brand, (brands.get(c.brand) ?? 0) + 1)
		const first = Math.min(...fresh.map(c => c.startMs))
		const meaning = REASONS[reason] ?? 'Retell error'
		lines.push(
			`${fresh.length} call${fresh.length === 1 ? '' : 's'} failed since ${etTime(first)}: ${reason} (${meaning}). ` +
				[...brands].map(([brand, n]) => `${brand}: ${n}`).join(', ') +
				'.',
		)
		next[reason] = {
			sentAt: now,
			lastCallMs: Math.max(...fresh.map(c => c.startMs)),
		}
	}
	if (!lines.length) return { body: null, state }
	return {
		body: [
			'Retell alert: callers are getting no answer.',
			...lines,
			'Check Retell billing: dashboard.retellai.com, Billing tab.',
		].join('\n'),
		state: next,
	}
}

export async function runRetellFailureAlert({
	now = Date.now(),
	fetchImpl = fetch,
}: { now?: number; fetchImpl?: typeof fetch } = {}) {
	const apiKey = process.env.RETELL_API_KEY?.trim()
	const to = process.env.SCHEDULE_ALERT_SMS_TO?.trim()
	if (!apiKey || !to) return { calls: 0, failed: 0, smsSent: false }

	const agents = getProductionRetellAgents()
	const brandOf = new Map(agents.map(a => [a.id, a.name]))
	const response = await fetchImpl(`${RETELL_API_URL}/v2/list-calls`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			filter_criteria: {
				agent_id: agents.map(a => a.id),
				start_timestamp: { lower_threshold: now - LOOKBACK_MS },
			},
			sort_order: 'descending',
			limit: 1000,
		}),
	})
	if (!response.ok) throw new Error(`retell_list_calls_http_${response.status}`)
	const calls = (await response.json()) as Array<{
		call_id: string
		agent_id: string
		start_timestamp?: number
		disconnection_reason?: string
	}>
	const failed: FailedCall[] = calls
		.filter(c => isFailedCall(c.disconnection_reason))
		.map(c => ({
			callId: c.call_id,
			reason: c.disconnection_reason!,
			brand: brandOf.get(c.agent_id) ?? c.agent_id,
			startMs: c.start_timestamp ?? now,
		}))

	const row = await prisma.blvdSyncState.findUnique({ where: { key: STATE_KEY } })
	let state: AlertState = {}
	try {
		state = row?.value ? (JSON.parse(row.value) as AlertState) : {}
	} catch {
		state = {}
	}
	const plan = planRetellFailureAlert({ calls: failed, state, now })
	if (!plan.body) return { calls: calls.length, failed: failed.length, smsSent: false }

	const result = await sendSMS({ to, body: plan.body })
	if (result.status !== 'success') {
		throw new Error(`Retell failure alert SMS failed: ${result.error}`)
	}
	await prisma.blvdSyncState.upsert({
		where: { key: STATE_KEY },
		create: { key: STATE_KEY, value: JSON.stringify(plan.state) },
		update: { value: JSON.stringify(plan.state) },
	})
	return { calls: calls.length, failed: failed.length, smsSent: true }
}
