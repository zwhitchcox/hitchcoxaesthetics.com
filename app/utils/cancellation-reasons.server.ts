/**
 * Mines the WHY behind cancellations that did not come through the AI
 * receptionist. Boulevard's enum (CLIENT_CANCEL etc.) says nothing. The AI
 * cancel flow now records the caller's stated reason in the cancellation
 * notes; for everything else (client talked to Sarah, dashboard cancel) this
 * finds the client's CallRail call near the cancellation and asks the
 * call-intelligence model what reason was stated. Verdicts are append-only
 * in the reports DB (cancellation_reasons): one per appointment, never
 * recomputed, including "no call found" so an appointment is not retried
 * forever.
 */
import {
	fetchCallRecordingAudio,
	fetchRetellTranscript,
	getCallIntelligenceConfig,
} from '#app/utils/call-intelligence.server.ts'
import {
	callRailFetch,
	getCallRailAccountIds,
	normalizePhoneNumber,
} from '#app/utils/callrail-booking.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
/** Boulevard notes that carry no information about why. */
const EMPTY_NOTES =
	/^\s*$|caller requested cancellation|no reason given|cancelled by sarah hitchcox aesthetics voice assistant/i
const CALL_WINDOW_MS = 3 * 24 * 3600 * 1000

async function ensureTable() {
	await reportsQuery(
		`CREATE TABLE IF NOT EXISTS cancellation_reasons (
			appointment_id TEXT PRIMARY KEY,
			source TEXT NOT NULL,
			reason TEXT,
			call_id TEXT,
			captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
	)
}

/** Mined reasons for a set of appointment ids (for the performance table). */
export async function getMinedCancellationReasons(
	appointmentIds: string[],
): Promise<Map<string, string>> {
	if (!hasReportsDb() || appointmentIds.length === 0) return new Map()
	try {
		await ensureTable()
		const rows = await reportsQuery<{ appointment_id: string; reason: string }>(
			`SELECT appointment_id, reason FROM cancellation_reasons
			 WHERE reason IS NOT NULL AND appointment_id = ANY($1)`,
			[appointmentIds],
		)
		return new Map(rows.map(r => [r.appointment_id, r.reason]))
	} catch {
		return new Map()
	}
}

async function askReason(input: {
	kind: 'transcript' | 'audio'
	text?: string
	audio?: { base64: string; format: string }
	serviceNames: string
	startAt: Date
}): Promise<string | null> {
	const config = getCallIntelligenceConfig()
	if (!config) return null
	const prompt = `This is a phone call between a med spa (Sarah Hitchcox Aesthetics) and a client. The client's appointment (${input.serviceNames}) on ${input.startAt.toDateString()} was cancelled around the time of this call.
If the call states or implies WHY the client cancelled, answer with one short phrase (12 words max) in the client's terms, e.g. "came down sick", "work conflict", "found it too expensive". If the call does not discuss cancelling this appointment, or no reason is given, answer exactly: NONE`
	const content: unknown[] = [
		{
			type: 'text',
			text:
				input.kind === 'transcript'
					? `${prompt}\n\nTranscript:\n${input.text}`
					: prompt,
		},
	]
	if (input.kind === 'audio' && input.audio) {
		content.push({
			type: 'input_audio',
			input_audio: { data: input.audio.base64, format: input.audio.format },
		})
	}
	const response = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: config.model,
			messages: [{ role: 'user', content }],
		}),
	})
	if (!response.ok) return null
	const payload = (await response.json().catch(() => null)) as {
		choices?: Array<{ message?: { content?: string } }>
	} | null
	const answer = payload?.choices?.[0]?.message?.content?.trim()
	if (!answer || /^none\b/i.test(answer)) return null
	return answer.slice(0, 120)
}

type CallHit = {
	id: string
	startMs: number
	recording: string | null
}

async function findCallsNear(
	phone: string,
	aroundMs: number,
): Promise<CallHit[]> {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	const normalized = normalizePhoneNumber(phone)
	if (!apiKey || !normalized) return []
	const hits: CallHit[] = []
	for (const accountId of await getCallRailAccountIds(apiKey).catch(() => [])) {
		const res = await callRailFetch(apiKey, `/a/${accountId}/calls.json`, {
			method: 'GET',
			params: new URLSearchParams({
				date_range: 'all_time',
				fields: 'id,customer_phone_number,start_time,recording',
				order: 'desc',
				per_page: '25',
				search: normalized,
				sort: 'start_time',
			}),
		}).catch(() => null)
		for (const call of (Array.isArray(res?.calls) ? res.calls : []) as Array<
			Record<string, any>
		>) {
			if (normalizePhoneNumber(call.customer_phone_number) !== normalized)
				continue
			const startMs = Date.parse(String(call.start_time ?? ''))
			if (!Number.isFinite(startMs)) continue
			if (Math.abs(startMs - aroundMs) > CALL_WINDOW_MS) continue
			hits.push({
				id: String(call.id ?? ''),
				startMs,
				recording: typeof call.recording === 'string' ? call.recording : null,
			})
		}
	}
	// Closest to the cancellation first.
	return hits.sort(
		(a, b) => Math.abs(a.startMs - aroundMs) - Math.abs(b.startMs - aroundMs),
	)
}

/** SMS thread near the cancellation, rendered as a transcript. Most cancels
 * without a call happen by text (Boulevard reminder replies). */
async function findTextsNear(
	phone: string,
	aroundMs: number,
): Promise<string | null> {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	const normalized = normalizePhoneNumber(phone)
	if (!apiKey || !normalized) return null
	const lines: Array<{ atMs: number; line: string }> = []
	for (const accountId of await getCallRailAccountIds(apiKey).catch(() => [])) {
		const res = await callRailFetch(apiKey, `/a/${accountId}/text-messages.json`, {
			method: 'GET',
			params: new URLSearchParams({ search: normalized, per_page: '10' }),
		}).catch(() => null)
		for (const convo of (Array.isArray(res?.conversations)
			? res.conversations
			: []) as Array<Record<string, any>>) {
			if (normalizePhoneNumber(convo.customer_phone_number) !== normalized)
				continue
			for (const msg of (Array.isArray(convo.recent_messages)
				? convo.recent_messages
				: []) as Array<Record<string, any>>) {
				const atMs = Date.parse(String(msg.created_at ?? ''))
				if (!Number.isFinite(atMs) || Math.abs(atMs - aroundMs) > CALL_WINDOW_MS)
					continue
				const who = String(msg.direction ?? '').includes('out')
					? 'Spa'
					: 'Client'
				const content = String(msg.content ?? '').trim()
				if (content) lines.push({ atMs, line: `${who}: ${content}` })
			}
		}
	}
	if (!lines.length) return null
	return lines
		.sort((a, b) => a.atMs - b.atMs)
		.map(l => l.line)
		.join('\n')
}

/**
 * One bounded mining pass; called from the hourly appointment-ledger job.
 * Cost control: at most `limit` appointments analyzed per run, one model
 * call each.
 */
export async function mineCancellationReasons(limit = 6): Promise<number> {
	if (!hasReportsDb()) return 0
	await ensureTable()
	const candidates = await prisma.blvdAppointment.findMany({
		where: {
			cancelled: true,
			cancelledAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) },
			clientMobilePhone: { not: null },
			cancellationReason: { in: ['CLIENT_CANCEL', 'CLIENT_LATE_CANCEL', 'STAFF_CANCEL'] },
		},
		select: {
			id: true,
			startAt: true,
			cancelledAt: true,
			clientMobilePhone: true,
			cancellationNotes: true,
			services: true,
		},
		orderBy: { cancelledAt: 'desc' },
	})
	const informative = candidates.filter(
		a => !a.cancellationNotes || EMPTY_NOTES.test(a.cancellationNotes),
	)
	if (!informative.length) return 0
	const existing = new Set(
		(
			await reportsQuery<{ appointment_id: string }>(
				`SELECT appointment_id FROM cancellation_reasons WHERE appointment_id = ANY($1)`,
				[informative.map(a => a.id)],
			)
		).map(r => r.appointment_id),
	)
	let mined = 0
	for (const a of informative) {
		if (mined >= limit) break
		if (existing.has(a.id)) continue
		mined++
		let serviceNames = 'an appointment'
		try {
			serviceNames = (JSON.parse(a.services) as Array<{ name: string }>)
				.map(s => s.name)
				.join('; ')
		} catch {}
		const aroundMs = (a.cancelledAt ?? a.startAt).getTime()
		const calls = await findCallsNear(a.clientMobilePhone!, aroundMs)
		let source = 'no_call_found'
		let reason: string | null = null
		let callId: string | null = null
		// Texts first: most no-call cancels are reminder-text replies, and a
		// text thread is cheaper to analyze than call audio.
		const texts = await findTextsNear(a.clientMobilePhone!, aroundMs)
		if (texts) {
			source = 'sms_thread'
			reason = await askReason({
				kind: 'transcript',
				text: texts,
				serviceNames,
				startAt: a.startAt,
			})
		}
		for (const call of reason ? [] : calls.slice(0, 2)) {
			callId = call.id
			const outcome = await prisma.retellCallOutcome.findFirst({
				where: { callrailCallId: call.id, retellCallId: { not: null } },
				select: { retellCallId: true },
			})
			if (outcome?.retellCallId) {
				const transcript = await fetchRetellTranscript({
					retellCallId: outcome.retellCallId,
				}).catch(() => null)
				if (transcript) {
					source = 'retell_transcript'
					reason = await askReason({
						kind: 'transcript',
						text: transcript,
						serviceNames,
						startAt: a.startAt,
					})
					if (reason) break
					continue
				}
			}
			if (call.recording) {
				const apiKey = process.env.CALLRAIL_API_KEY?.trim()
				const audio = apiKey
					? await fetchCallRecordingAudio({
							recordingUrl: call.recording,
							callRailApiKey: apiKey,
						}).catch(() => null)
					: null
				if (audio) {
					source = 'call_audio'
					reason = await askReason({
						kind: 'audio',
						audio,
						serviceNames,
						startAt: a.startAt,
					})
					if (reason) break
				}
			}
		}
		await reportsQuery(
			`INSERT INTO cancellation_reasons (appointment_id, source, reason, call_id)
			 VALUES ($1, $2, $3, $4) ON CONFLICT (appointment_id) DO NOTHING`,
			[
				a.id,
				reason ? source : source === 'no_call_found' ? source : `${source}_no_reason`,
				reason,
				callId,
			],
		)
	}
	return mined
}
