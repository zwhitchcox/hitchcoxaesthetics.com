/**
 * AI analysis of CallRail call recordings via OpenRouter.
 *
 * CallRail's plan does not include transcription, so we pull the raw
 * recording audio and send it to an audio-capable model (Gemini) through
 * OpenRouter, getting back a structured read on why the person called and
 * whether/why they did not book.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'google/gemini-2.5-flash'
const MAX_AUDIO_BYTES = 15 * 1024 * 1024 // ~30+ min of mp3; guardrail

export type CallAnalysis = {
	reason: string | null
	caller_intent:
		| 'appointment'
		| 'reschedule'
		| 'cancel'
		| 'question'
		| 'vendor'
		| 'spam'
		| 'other'
	service_interest: string | null
	outcome: 'booked' | 'callback' | 'info_only' | 'lost' | 'voicemail' | 'other'
	not_booked_reason: string | null
	follow_up_recommended: boolean
	summary: string
}

const ANALYSIS_PROMPT = `You are analyzing a recorded inbound phone call to Sarah Hitchcox Aesthetics, a med spa in Knoxville, TN (Botox, fillers, laser treatments, weight loss). The call may be answered by an AI receptionist, a human, or go to voicemail.

Reply with ONLY a JSON object, no markdown fence, matching exactly:
{
  "reason": string | null,            // one sentence: why they called
  "caller_intent": "appointment" | "reschedule" | "cancel" | "question" | "vendor" | "spam" | "other",
  "service_interest": string | null,  // e.g. "Botox", "lip filler", "weight loss" if mentioned
  "outcome": "booked" | "callback" | "info_only" | "lost" | "voicemail" | "other",
  "not_booked_reason": string | null, // if a real prospective customer did NOT book: why (price, availability, just researching, call dropped, told to book online, etc.)
  "follow_up_recommended": boolean,   // true when a warm prospect left without booking
  "summary": string                   // 2-3 sentences covering the call
}`

export function getCallIntelligenceConfig() {
	const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim()
	if (!apiKey) return null
	return {
		apiKey,
		model: process.env.OPENROUTER_CALL_MODEL?.trim() || DEFAULT_MODEL,
	}
}

/** Downloads a CallRail recording, following its temporary-URL indirection. */
export async function fetchCallRecordingAudio({
	recordingUrl,
	callRailApiKey,
	fetchImpl = fetch,
}: {
	recordingUrl: string
	callRailApiKey: string
	fetchImpl?: typeof fetch
}): Promise<{ base64: string; format: string } | null> {
	const metaResponse = await fetchImpl(`${recordingUrl}.json`, {
		headers: { Authorization: `Token token=${callRailApiKey}` },
	})
	if (!metaResponse.ok) return null
	const meta = (await metaResponse.json().catch(() => null)) as {
		url?: string
	} | null
	if (!meta?.url) return null

	const audioResponse = await fetchImpl(meta.url)
	if (!audioResponse.ok) return null
	const bytes = Buffer.from(await audioResponse.arrayBuffer())
	if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) return null

	const contentType = audioResponse.headers.get('content-type') ?? ''
	const format = contentType.includes('wav') ? 'wav' : 'mp3'
	return { base64: bytes.toString('base64'), format }
}

export async function analyzeCallAudio({
	audio,
	config = getCallIntelligenceConfig(),
	fetchImpl = fetch,
}: {
	audio: { base64: string; format: string }
	config?: ReturnType<typeof getCallIntelligenceConfig>
	fetchImpl?: typeof fetch
}): Promise<{ ok: true; analysis: CallAnalysis } | { ok: false; error: string }> {
	if (!config) return { ok: false, error: 'missing_open_router_api_key' }

	const response = await fetchImpl(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: config.model,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: ANALYSIS_PROMPT },
						{
							type: 'input_audio',
							input_audio: { data: audio.base64, format: audio.format },
						},
					],
				},
			],
		}),
	})

	if (!response.ok) {
		return { ok: false, error: `openrouter_http_${response.status}` }
	}
	const data = (await response.json().catch(() => null)) as {
		choices?: { message?: { content?: string } }[]
	} | null
	const content = data?.choices?.[0]?.message?.content
	if (!content) return { ok: false, error: 'openrouter_empty_response' }

	const parsed = parseAnalysisJson(content)
	if (!parsed) return { ok: false, error: 'openrouter_unparseable_response' }
	return { ok: true, analysis: parsed }
}

const INTENTS = new Set([
	'appointment',
	'reschedule',
	'cancel',
	'question',
	'vendor',
	'spam',
	'other',
])
const OUTCOMES = new Set([
	'booked',
	'callback',
	'info_only',
	'lost',
	'voicemail',
	'other',
])

function parseAnalysisJson(content: string): CallAnalysis | null {
	const match = content.match(/\{[\s\S]*\}/)
	if (!match) return null
	try {
		const raw = JSON.parse(match[0]) as Record<string, unknown>
		const intent = String(raw.caller_intent ?? 'other')
		const outcome = String(raw.outcome ?? 'other')
		return {
			reason: optionalText(raw.reason),
			caller_intent: (INTENTS.has(intent)
				? intent
				: 'other') as CallAnalysis['caller_intent'],
			service_interest: optionalText(raw.service_interest),
			outcome: (OUTCOMES.has(outcome)
				? outcome
				: 'other') as CallAnalysis['outcome'],
			not_booked_reason: optionalText(raw.not_booked_reason),
			follow_up_recommended: Boolean(raw.follow_up_recommended),
			summary: optionalText(raw.summary) ?? '',
		}
	} catch {
		return null
	}
}

function optionalText(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : null
}
