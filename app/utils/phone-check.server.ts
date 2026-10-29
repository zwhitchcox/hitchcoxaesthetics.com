/**
 * Daily check of each brand's phone path: the AI agent, its number,
 * yesterday's calls, the CallRail numbers, the RingCentral queue and the
 * voicemail emails. From 2026-10-21 to 2026-10-29 the Retell account had no
 * credits, 143 calls got no answer, and nothing told us. This check finds a
 * broken link before a caller does. It uses only free API reads, runs at
 * 12:00 UTC (8 AM ET, 7 AM in winter), keeps 14 runs for /admin/phone-check,
 * and texts SCHEDULE_ALERT_SMS_TO once a day for each failing check.
 */
import { prisma } from '#app/utils/db.server.ts'
import { isFailedCall } from '#app/utils/retell-failure-alert.server.ts'
import { sendSMS } from '#app/utils/sms.server.ts'

type Tracker = {
	id: string
	name: string
	/** The number the tracker dials, or 'agent-then-voicemail' for a
	 * CallRail call flow that dials the agent and then takes a voicemail. */
	routesTo: string
}

export type PhonePath = {
	key: string
	name: string
	agentId: string
	llmId: string
	retellNumber: string
	s2sModel: string
	voiceId: string
	trackers: Tracker[]
	/** The RingCentral queue that rings Zane and Sarah first, and the number
	 * it forwards to when they do not answer. Null when the Google numbers
	 * go straight to the agent. */
	queue: { id: string; forwardTo: string } | null
	/** Where a voicemail lands: the queue mailbox, or these CallRail numbers. */
	voicemail: { kind: 'ringcentral-queue' } | { kind: 'callrail'; trackerIds: string[] }
}

const GROK_VOICE = { s2sModel: 'grok-voice-3.0', voiceId: 'xai-Eve' }

// The agent, model and voice mirror scripts/retell-booking-brands.ts (the
// app build does not import the scripts directory); a unit test fails when
// they differ. The trackers and queues are the routing as of 2026-10-29.
export const PHONE_PATHS: PhonePath[] = [
	{
		key: 'sarah',
		name: 'Sarah Hitchcox Aesthetics',
		agentId: 'agent_01931c39dd6b893c7653b3c4a1',
		llmId: 'llm_38fbe0cdbd676e87e1e3baf13c08',
		retellNumber: '+18653452258',
		...GROK_VOICE,
		trackers: [
			{ id: 'TRK019c77b9c3f67b999b56aa869b82e934', name: 'GMB Knoxville', routesTo: '+18654898008' },
			{ id: 'TRK019c77a4a8f7712a9fcdbcb7a829c1e6', name: 'GMB Farragut', routesTo: '+18654898001' },
			{ id: 'TRK019c75cb3195755e87a42cc6d1abbc95', name: 'Knoxville Pool', routesTo: '+18654898008' },
			{ id: 'TRK019c77b619ff7c3180ffed57707737f5', name: 'Farragut Pool', routesTo: '+18654898001' },
			{ id: 'TRK019c77a596f87248911d512b20677094', name: 'PPC GMB (Knoxville)', routesTo: '+18654898008' },
			{ id: 'TRK019d265575227bd1812d03bfdd9c955c', name: 'PPC GMB (Farragut)', routesTo: '+18654898001' },
			{ id: 'TRK019d26542eff78e4a157053a7ddb01dd', name: 'PPC Ad Extension', routesTo: '+18654898008' },
		],
		queue: { id: '262105053', forwardTo: '+18653452258' },
		voicemail: { kind: 'ringcentral-queue' },
	},
	{
		key: 'botox-knox',
		name: 'Botox Knox',
		agentId: 'agent_2d6a0de3088f3066a2081539c0',
		llmId: 'llm_c088989b29e101e6776ef29f6d57',
		retellNumber: '+18657612898',
		...GROK_VOICE,
		trackers: [
			{ id: 'TRK019c91fb1f957cfe89819322698bc36d', name: 'GMB Bearden', routesTo: '+18653702246' },
			{ id: 'TRK019c92211b077458a5ec821bffffdaca', name: 'GMB Farragut', routesTo: '+18653702639' },
			{ id: 'TRK019c9228fd01718ca75229b052d3a0bf', name: 'Bearden Pool', routesTo: '+18653702246' },
			{ id: 'TRK019c922d937e7617b962cfd2b8c8a864', name: 'Farragut Pool', routesTo: '+18653702639' },
		],
		queue: { id: '471722052', forwardTo: '+18657612898' },
		voicemail: { kind: 'ringcentral-queue' },
	},
	{
		key: 'weight-loss-knox',
		name: 'Weight Loss Knox',
		agentId: 'agent_ba54c0b712bf2771c8d4209c7b',
		llmId: 'llm_3ba3e20ace66b249855a2c11f9b7',
		retellNumber: '+18653904907',
		...GROK_VOICE,
		trackers: [
			{ id: 'TRK019c9294b24d7509897468b023e4a63d', name: 'GMB Bearden', routesTo: '+18655003135' },
			{ id: 'TRK019c92957f1d77e6b5c6d3d49be826a5', name: 'GMB Farragut', routesTo: '+18655003510' },
			{ id: 'TRK019c92a08fc97762b6b253fa4ec559f1', name: 'Bearden Pool', routesTo: '+18655003135' },
			{ id: 'TRK019c92acb03473f39859aa73ab2ba580', name: 'Farragut Pool', routesTo: '+18655003510' },
		],
		queue: { id: '472542052', forwardTo: '+18653904907' },
		voicemail: { kind: 'ringcentral-queue' },
	},
	{
		key: 'knoxville-laser-clinic',
		name: 'Knoxville Laser Clinic',
		agentId: 'agent_c1cca9cc6388b2b19c227a9757',
		llmId: 'llm_31135535003de9c23395ae446536',
		retellNumber: '+18656068139',
		...GROK_VOICE,
		trackers: [
			{ id: 'TRK01a112d83905793aa9fded0801d60fdf', name: 'GMB Bearden', routesTo: '+18656068139' },
			{ id: 'TRK01a112d84c4574fbb4a8da87de67f268', name: 'GMB Farragut', routesTo: '+18656068139' },
		],
		queue: null,
		voicemail: {
			kind: 'callrail',
			trackerIds: ['TRK01a112d83905793aa9fded0801d60fdf', 'TRK01a112d84c4574fbb4a8da87de67f268'],
		},
	},
]

export type CheckStatus = 'ok' | 'fail' | 'skip'
export type CheckRow = {
	brand: string
	check: string
	status: CheckStatus
	detail: string
}

const row = (path: PhonePath, check: string, status: CheckStatus, detail: string): CheckRow => ({
	brand: path.name,
	check,
	status,
	detail,
})

/** +18653452258 -> (865) 345-2258 */
export const formatNumber = (n: string | null | undefined) => {
	const d = (n ?? '').replace(/\D/g, '').slice(-10)
	return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (n ?? 'none')
}

export type RetellAgent = { agent_id?: string; voice_id?: string; response_engine?: { llm_id?: string } }
export type RetellLlm = { s2s_model?: string }
export type RetellPhone = { inbound_agents?: Array<{ agent_id?: string }>; inbound_agent_id?: string }

export function checkAgent(path: PhonePath, agent: RetellAgent | null, llm: RetellLlm | null): CheckRow {
	if (!agent?.agent_id) return row(path, 'AI agent', 'fail', `Retell has no agent ${path.agentId}.`)
	const problems: string[] = []
	if (agent.response_engine?.llm_id !== path.llmId)
		problems.push(`it uses ${agent.response_engine?.llm_id ?? 'no'} LLM, not ${path.llmId}`)
	if (llm?.s2s_model !== path.s2sModel)
		problems.push(`model is ${llm?.s2s_model ?? 'unknown'}, not ${path.s2sModel}`)
	if (agent.voice_id !== path.voiceId)
		problems.push(`voice is ${agent.voice_id ?? 'unknown'}, not ${path.voiceId}`)
	return problems.length
		? row(path, 'AI agent', 'fail', `The agent is wrong: ${problems.join('; ')}.`)
		: row(path, 'AI agent', 'ok', `${path.s2sModel}, voice ${path.voiceId}.`)
}

export function checkNumber(path: PhonePath, phone: RetellPhone | null): CheckRow {
	if (!phone) return row(path, 'Agent number', 'fail', `Retell has no number ${formatNumber(path.retellNumber)}.`)
	const agents = [
		...(phone.inbound_agents ?? []).map(a => a.agent_id),
		...(phone.inbound_agent_id ? [phone.inbound_agent_id] : []),
	].filter(Boolean)
	return agents.includes(path.agentId)
		? row(path, 'Agent number', 'ok', `${formatNumber(path.retellNumber)} rings this agent.`)
		: row(
				path,
				'Agent number',
				'fail',
				`${formatNumber(path.retellNumber)} rings ${agents.join(', ') || 'no agent'}, not ${path.agentId}.`,
			)
}

type ListedCall = { agent_id?: string; disconnection_reason?: string }

export function checkCalls(path: PhonePath, calls: ListedCall[]): CheckRow {
	const mine = calls.filter(c => c.agent_id === path.agentId)
	const failed = mine.filter(c => isFailedCall(c.disconnection_reason))
	const reasons = new Map<string, number>()
	for (const c of failed) reasons.set(c.disconnection_reason!, (reasons.get(c.disconnection_reason!) ?? 0) + 1)
	const detail = `${mine.length - failed.length} worked, ${failed.length} failed`
	return failed.length
		? row(path, 'Calls yesterday', 'fail', `${detail} (${[...reasons].map(([r, n]) => `${r} ${n}`).join(', ')}).`)
		: row(path, 'Calls yesterday', 'ok', `${detail}.`)
}

export type CallRailTracker = {
	id: string
	status?: string
	destination_number?: string | null
	call_flow?: { type?: string; destination_number?: string | null } | null
}

export function checkTrackers(path: PhonePath, trackers: CallRailTracker[]): CheckRow {
	const byId = new Map(trackers.map(t => [t.id, t]))
	const problems: string[] = []
	for (const expected of path.trackers) {
		const t = byId.get(expected.id)
		if (!t) problems.push(`${expected.name} is missing`)
		else if (t.status !== 'active') problems.push(`${expected.name} is ${t.status ?? 'not active'}`)
		else if (expected.routesTo === 'agent-then-voicemail') {
			if (t.call_flow?.type !== 'advanced')
				problems.push(`${expected.name} has no agent-then-voicemail call flow`)
		} else {
			const dest = t.call_flow?.destination_number ?? t.destination_number
			if (dest !== expected.routesTo)
				problems.push(`${expected.name} dials ${formatNumber(dest)}, not ${formatNumber(expected.routesTo)}`)
		}
	}
	return problems.length
		? row(path, 'CallRail numbers', 'fail', `${problems.join('; ')}.`)
		: row(path, 'CallRail numbers', 'ok', `${path.trackers.length} numbers are active and route correctly.`)
}

export type QueueRule = {
	queue?: {
		holdTime?: number
		holdTimeExpirationAction?: string
		unconditionalForwarding?: Array<{ phoneNumber?: string; action?: string }>
	}
}

export function checkQueue(path: PhonePath, rule: QueueRule | null): CheckRow | null {
	if (!path.queue) return null
	if (!rule?.queue) return row(path, 'RingCentral queue', 'fail', `RingCentral has no rules for queue ${path.queue.id}.`)
	const forward = rule.queue.unconditionalForwarding?.find(f => f.action === 'HoldTimeExpiration')?.phoneNumber
	if (rule.queue.holdTimeExpirationAction !== 'UnconditionalForwarding' || forward !== path.queue.forwardTo)
		return row(
			path,
			'RingCentral queue',
			'fail',
			`After the hold time the queue does ${rule.queue.holdTimeExpirationAction ?? 'nothing'} to ${formatNumber(forward)}, not a forward to ${formatNumber(path.queue.forwardTo)}.`,
		)
	return row(
		path,
		'RingCentral queue',
		'ok',
		`Rings Zane and Sarah for ${rule.queue.holdTime ?? '?'} s, then forwards to ${formatNumber(forward)}.`,
	)
}

export type QueueNotifications = {
	voicemails?: { notifyByEmail?: boolean }
	emailRecipients?: Array<{ extensionNumber?: string; emailAddresses?: string[] }>
}
export type CallRailNotification = {
	tracker_id?: string | null
	call_enabled?: boolean | null
	alert_type?: string | null
	send_email?: boolean | null
	user_id?: string | null
	email?: string | null
}

const VOICEMAIL_ALERTS = new Set(['vm_only', 'missed_and_vm', 'all'])

export function checkVoicemail(
	path: PhonePath,
	data: { queue: QueueNotifications | null; callrail: CallRailNotification[] },
): CheckRow {
	if (path.voicemail.kind === 'ringcentral-queue') {
		const q = data.queue
		const emailed = (ext: string) =>
			q?.emailRecipients?.some(r => r.extensionNumber === ext && (r.emailAddresses?.length ?? 0) > 0)
		if (!q?.voicemails?.notifyByEmail || !emailed('101') || !emailed('102'))
			return row(path, 'Voicemail emails', 'fail', 'The queue mailbox does not email voicemails to both Zane (101) and Sarah (102).')
		return row(path, 'Voicemail emails', 'ok', 'The queue mailbox emails voicemails to Zane and Sarah.')
	}
	const missing = path.voicemail.trackerIds.filter(id => {
		const alerts = data.callrail.filter(
			n =>
				(n.tracker_id === id || n.tracker_id == null) &&
				n.call_enabled &&
				n.send_email &&
				VOICEMAIL_ALERTS.has(n.alert_type ?? ''),
		)
		// One to a CallRail user (Sarah) and one to an email-only address (Zane).
		return !(alerts.some(n => n.user_id) && alerts.some(n => n.email))
	})
	const names = (ids: string[]) =>
		ids.map(id => path.trackers.find(t => t.id === id)?.name ?? id).join(', ')
	return missing.length
		? row(path, 'Voicemail emails', 'fail', `No voicemail email to both Zane and Sarah on ${names(missing)}.`)
		: row(path, 'Voicemail emails', 'ok', `Voicemails on ${path.voicemail.trackerIds.length} numbers email Zane and Sarah.`)
}

/** The ET calendar day of a time, as YYYY-MM-DD. */
const etDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/** Midnight ET at the start of a YYYY-MM-DD day, in ms. */
export function etMidnight(day: string) {
	for (const offset of ['-04:00', '-05:00']) {
		const ms = Date.parse(`${day}T00:00:00${offset}`)
		if (etDay(ms) === day && etDay(ms - 1) !== day) return ms
	}
	return Date.parse(`${day}T05:00:00Z`)
}

export type PhoneCheckRun = { ranAt: string; rows: CheckRow[] }
type PhoneCheckState = { runs: PhoneCheckRun[]; alerted: Record<string, string> }
const STATE_KEY = 'phone-check'
const KEEP_RUNS = 14
const ADMIN_URL = 'https://hitchcoxaesthetics.com/admin/phone-check'

/** The text for checks that failed and were not texted yet today. */
export function planPhoneCheckAlert({
	rows,
	alerted,
	now,
}: {
	rows: CheckRow[]
	alerted: Record<string, string>
	now: number
}): { body: string | null; alerted: Record<string, string> } {
	const today = etDay(now)
	const next = { ...alerted }
	const fresh = rows.filter(r => r.status === 'fail' && alerted[`${r.brand}|${r.check}`] !== today)
	if (!fresh.length) return { body: null, alerted }
	for (const r of fresh) next[`${r.brand}|${r.check}`] = today
	const lines = fresh.slice(0, 4).map(r => `${r.brand}, ${r.check}: ${r.detail}`)
	if (fresh.length > 4) lines.push(`(+${fresh.length - 4} more)`)
	return {
		body: [`Phone check: ${fresh.length} problem${fresh.length === 1 ? '' : 's'}.`, ...lines, ADMIN_URL].join('\n'),
		alerted: next,
	}
}

export async function readPhoneCheckState(): Promise<PhoneCheckState> {
	const saved = await prisma.blvdSyncState.findUnique({ where: { key: STATE_KEY } })
	try {
		const state = saved?.value ? (JSON.parse(saved.value) as Partial<PhoneCheckState>) : {}
		return { runs: state.runs ?? [], alerted: state.alerted ?? {} }
	} catch {
		return { runs: [], alerted: {} }
	}
}

async function getJson(fetchImpl: typeof fetch, url: string, init: RequestInit) {
	const response = await fetchImpl(url, init)
	if (response.status === 404) return null
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return (await response.json()) as unknown
}

/** All the checks, one row per brand and check. Each service that fails to
 * answer turns its own checks into failures with the reason. */
export async function collectPhoneCheck({
	now = Date.now(),
	fetchImpl = fetch,
}: { now?: number; fetchImpl?: typeof fetch } = {}): Promise<CheckRow[]> {
	const rows: CheckRow[] = []
	const today = etDay(now)
	const yesterdayStart = etMidnight(etDay(etMidnight(today) - 1))
	const yesterdayEnd = etMidnight(today)

	// Retell: the agents, their numbers and yesterday's calls.
	const retellKey = process.env.RETELL_API_KEY?.trim()
	const retell = (path: string, body?: unknown) =>
		getJson(fetchImpl, `https://api.retellai.com${path}`, {
			method: body ? 'POST' : 'GET',
			headers: { Authorization: `Bearer ${retellKey}`, 'Content-Type': 'application/json' },
			...(body ? { body: JSON.stringify(body) } : {}),
		})
	let calls: ListedCall[] | null = null
	let callsError = ''
	if (retellKey) {
		try {
			calls = ((await retell('/v2/list-calls', {
				filter_criteria: {
					agent_id: PHONE_PATHS.map(p => p.agentId),
					start_timestamp: { lower_threshold: yesterdayStart, upper_threshold: yesterdayEnd },
				},
				limit: 1000,
			})) ?? []) as ListedCall[]
		} catch (error) {
			callsError = error instanceof Error ? error.message : String(error)
		}
	}
	for (const path of PHONE_PATHS) {
		if (!retellKey) {
			rows.push(row(path, 'AI agent', 'skip', 'Not checked: RETELL_API_KEY is not set.'))
			continue
		}
		try {
			const agent = (await retell(`/get-agent/${path.agentId}`)) as RetellAgent | null
			const llm = agent?.response_engine?.llm_id
				? ((await retell(`/get-retell-llm/${agent.response_engine.llm_id}`)) as RetellLlm | null)
				: null
			rows.push(checkAgent(path, agent, llm))
			const phone = (await retell(`/get-phone-number/${encodeURIComponent(path.retellNumber)}`)) as RetellPhone | null
			rows.push(checkNumber(path, phone))
		} catch (error) {
			rows.push(row(path, 'AI agent', 'fail', `Retell did not answer: ${error instanceof Error ? error.message : error}.`))
		}
		rows.push(
			calls
				? checkCalls(path, calls)
				: row(path, 'Calls yesterday', 'fail', `Retell did not list the calls: ${callsError}.`),
		)
	}

	// CallRail: the tracking numbers and the voicemail emails.
	const callrailKey = process.env.CALLRAIL_API_KEY?.trim()
	let trackers: CallRailTracker[] | null = null
	let notifications: CallRailNotification[] = []
	let callrailError = callrailKey ? '' : 'CALLRAIL_API_KEY is not set'
	if (callrailKey) {
		try {
			const callrail = (path: string) =>
				getJson(fetchImpl, `https://api.callrail.com/v3${path}`, {
					headers: { Authorization: `Token token="${callrailKey}"` },
				})
			const accounts = (await callrail('/a.json')) as { accounts?: Array<{ id: string }> } | null
			const account = accounts?.accounts?.[0]?.id
			if (!account) throw new Error('no CallRail account')
			trackers = []
			for (const status of ['active', 'disabled']) {
				const page = (await callrail(
					`/a/${account}/trackers.json?per_page=250&status=${status}&fields=call_flow`,
				)) as { trackers?: CallRailTracker[] } | null
				trackers.push(...(page?.trackers ?? []))
			}
			const n = (await callrail(`/a/${account}/notifications.json?per_page=250`)) as {
				notifications?: CallRailNotification[]
			} | null
			notifications = n?.notifications ?? []
		} catch (error) {
			trackers = null
			callrailError = error instanceof Error ? error.message : String(error)
		}
	}

	// RingCentral: each queue's forward and its voicemail emails.
	const rcRules = new Map<string, QueueRule | null>()
	const rcNotifications = new Map<string, QueueNotifications | null>()
	const rcServer = process.env.RING_CENTRAL_APP_SERVER_URL?.trim().replace(/\/$/, '')
	const rcReady = Boolean(
		rcServer &&
			process.env.RING_CENTRAL_CLIENT_ID?.trim() &&
			process.env.RING_CENTRAL_CLIENT_SECRET?.trim() &&
			process.env.RING_CENTRAL_JWT?.trim(),
	)
	let rcError = rcReady ? '' : 'the RING_CENTRAL_* keys are not set on this server'
	if (rcReady) {
		try {
			const basic = Buffer.from(
				`${process.env.RING_CENTRAL_CLIENT_ID!.trim()}:${process.env.RING_CENTRAL_CLIENT_SECRET!.trim()}`,
			).toString('base64')
			const token = (await getJson(fetchImpl, `${rcServer}/restapi/oauth/token`, {
				method: 'POST',
				headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					assertion: process.env.RING_CENTRAL_JWT!.trim(),
				}).toString(),
			})) as { access_token?: string } | null
			const auth = { headers: { Authorization: `Bearer ${token?.access_token}` } }
			for (const path of PHONE_PATHS) {
				if (!path.queue) continue
				const ext = `${rcServer}/restapi/v1.0/account/~/extension/${path.queue.id}`
				rcRules.set(path.key, (await getJson(fetchImpl, `${ext}/answering-rule/business-hours-rule`, auth)) as QueueRule | null)
				rcNotifications.set(path.key, (await getJson(fetchImpl, `${ext}/notification-settings`, auth)) as QueueNotifications | null)
			}
		} catch (error) {
			rcError = `RingCentral did not answer: ${error instanceof Error ? error.message : error}`
		}
	}

	for (const path of PHONE_PATHS) {
		rows.push(
			trackers
				? checkTrackers(path, trackers)
				: row(path, 'CallRail numbers', callrailKey ? 'fail' : 'skip', `Not checked: ${callrailError}.`),
		)
		if (path.queue) {
			rows.push(
				rcRules.has(path.key)
					? checkQueue(path, rcRules.get(path.key) ?? null)!
					: row(path, 'RingCentral queue', rcReady ? 'fail' : 'skip', `Not checked: ${rcError}.`),
			)
		}
		if (path.voicemail.kind === 'ringcentral-queue') {
			rows.push(
				rcNotifications.has(path.key)
					? checkVoicemail(path, { queue: rcNotifications.get(path.key) ?? null, callrail: [] })
					: row(path, 'Voicemail emails', rcReady ? 'fail' : 'skip', `Not checked: ${rcError}.`),
			)
		} else {
			rows.push(
				trackers
					? checkVoicemail(path, { queue: null, callrail: notifications })
					: row(path, 'Voicemail emails', callrailKey ? 'fail' : 'skip', `Not checked: ${callrailError}.`),
			)
		}
	}
	// One block of rows for each brand, in the order of PHONE_PATHS.
	const order = new Map(PHONE_PATHS.map((p, i) => [p.name, i]))
	return rows.sort((a, b) => order.get(a.brand)! - order.get(b.brand)!)
}

/** Runs the checks, saves the run, and texts new failures. */
export async function runPhoneCheck({
	now = Date.now(),
	fetchImpl = fetch,
}: { now?: number; fetchImpl?: typeof fetch } = {}) {
	const rows = await collectPhoneCheck({ now, fetchImpl })
	const state = await readPhoneCheckState()
	const runs = [{ ranAt: new Date(now).toISOString(), rows }, ...state.runs].slice(0, KEEP_RUNS)

	let smsSent = false
	let alerted = state.alerted
	const to = process.env.SCHEDULE_ALERT_SMS_TO?.trim()
	const plan = planPhoneCheckAlert({ rows, alerted, now })
	if (plan.body && to) {
		const result = await sendSMS({ to, body: plan.body })
		if (result.status !== 'success') console.error('Phone check text failed:', result.error)
		else {
			smsSent = true
			alerted = plan.alerted
		}
	}
	await prisma.blvdSyncState.upsert({
		where: { key: STATE_KEY },
		create: { key: STATE_KEY, value: JSON.stringify({ runs, alerted }) },
		update: { value: JSON.stringify({ runs, alerted }) },
	})
	return {
		checks: rows.length,
		failed: rows.filter(r => r.status === 'fail').length,
		skipped: rows.filter(r => r.status === 'skip').length,
		smsSent,
	}
}
