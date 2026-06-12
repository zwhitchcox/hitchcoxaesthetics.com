/**
 * AI analysis of phone calls via OpenRouter.
 *
 * Preferred source is the Retell transcript when the call was handled by the
 * AI receptionist (free, exact, includes both sides). For calls without one
 * (human-answered, voicemail), CallRail has no transcription on our plan, so
 * we pull the raw recording audio and send it to an audio-capable model.
 *
 * The tag vocabulary comes from the CallTagGroup/CallTag tables (see
 * call-tags.server.ts), so the taxonomy is editable from /admin/call-tags
 * without touching this prompt.
 */

import {
	buildTaxonomyPromptSection,
	validateTagSelections,
	type CallTaxonomy,
} from '#app/utils/call-tags.server.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'google/gemini-2.5-flash'
const MAX_AUDIO_BYTES = 15 * 1024 * 1024 // ~30+ min of mp3; guardrail
const RETELL_API_URL = 'https://api.retellai.com'

export type CallAnalysisInput =
	| { kind: 'audio'; audio: { base64: string; format: string } }
	| { kind: 'transcript'; transcript: string }

export type CallAnalysis = {
	reason: string | null
	service_interest: string | null
	follow_up_recommended: boolean
	summary: string
	lost_reason: string | null
	frustration_reason: string | null
	agent_fix_suggestion: string | null
	tags: Record<string, string | string[] | null>
}

function buildAnalysisPrompt(taxonomy: CallTaxonomy, input: CallAnalysisInput) {
	const { instructions, shape } = buildTaxonomyPromptSection(taxonomy)
	const sourceLine =
		input.kind === 'transcript'
			? 'Below is the transcript of an inbound phone call ("Agent" is the AI receptionist, "User" is the caller).'
			: 'You are given the recorded audio of an inbound phone call. It may be answered by an AI receptionist, a human, or go to voicemail.'
	return `${sourceLine} The business is Sarah Hitchcox Aesthetics, a med spa in Knoxville, TN (Botox, fillers, laser treatments, weight loss).

Tag the call using these groups:
${instructions}

Reply with ONLY a JSON object, no markdown fence, matching exactly:
{
  "reason": string | null,            // one sentence: why they called
  "service_interest": string | null,  // e.g. "Botox", "lip filler", "weight loss" if mentioned
  "follow_up_recommended": boolean,   // true when a warm prospect left without booking
  "summary": string,                  // 2-3 sentences covering the call
  "lost_reason": string | null,       // if the caller hung up unsatisfied or gave up: a specific sentence on WHY (what they wanted and what blocked them). null otherwise
  "frustration_reason": string | null,// if the caller got frustrated with the AI receptionist: what specifically frustrated them (quote them when possible). null otherwise
  "agent_fix_suggestion": string | null, // if the AI receptionist made a mistake or frustrated the caller: one concrete suggestion to change its prompt/behavior to prevent it. null otherwise
${shape}
}${input.kind === 'transcript' ? `\n\nTranscript:\n${input.transcript}` : ''}`
}

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

/** Pulls the full transcript for a Retell call, or null if unavailable. */
export async function fetchRetellTranscript({
	retellCallId,
	apiKey = process.env.RETELL_API_KEY?.trim(),
	fetchImpl = fetch,
}: {
	retellCallId: string
	apiKey?: string
	fetchImpl?: typeof fetch
}): Promise<string | null> {
	if (!apiKey) return null
	const response = await fetchImpl(
		`${RETELL_API_URL}/v2/get-call/${retellCallId}`,
		{ headers: { Authorization: `Bearer ${apiKey}` } },
	)
	if (!response.ok) return null
	const data = (await response.json().catch(() => null)) as {
		transcript?: string
	} | null
	const transcript = data?.transcript?.trim()
	return transcript ? transcript : null
}

export async function analyzeCall({
	input,
	taxonomy,
	config = getCallIntelligenceConfig(),
	fetchImpl = fetch,
}: {
	input: CallAnalysisInput
	taxonomy: CallTaxonomy
	config?: ReturnType<typeof getCallIntelligenceConfig>
	fetchImpl?: typeof fetch
}): Promise<
	{ ok: true; analysis: CallAnalysis } | { ok: false; error: string }
> {
	if (!config) return { ok: false, error: 'missing_open_router_api_key' }

	const prompt = buildAnalysisPrompt(taxonomy, input)
	const content: unknown[] = [{ type: 'text', text: prompt }]
	if (input.kind === 'audio') {
		content.push({
			type: 'input_audio',
			input_audio: { data: input.audio.base64, format: input.audio.format },
		})
	}

	const response = await fetchImpl(OPENROUTER_URL, {
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

	if (!response.ok) {
		return { ok: false, error: `openrouter_http_${response.status}` }
	}
	const data = (await response.json().catch(() => null)) as {
		choices?: { message?: { content?: string } }[]
	} | null
	const text = data?.choices?.[0]?.message?.content
	if (!text) return { ok: false, error: 'openrouter_empty_response' }

	const parsed = parseAnalysisJson(text, taxonomy)
	if (!parsed) return { ok: false, error: 'openrouter_unparseable_response' }
	return { ok: true, analysis: parsed }
}

function parseAnalysisJson(
	content: string,
	taxonomy: CallTaxonomy,
): CallAnalysis | null {
	const match = content.match(/\{[\s\S]*\}/)
	if (!match) return null
	try {
		const raw = JSON.parse(match[0]) as Record<string, unknown>
		return {
			reason: optionalText(raw.reason),
			service_interest: optionalText(raw.service_interest),
			follow_up_recommended: Boolean(raw.follow_up_recommended),
			summary: optionalText(raw.summary) ?? '',
			lost_reason: optionalText(raw.lost_reason),
			frustration_reason: optionalText(raw.frustration_reason),
			agent_fix_suggestion: optionalText(raw.agent_fix_suggestion),
			tags: validateTagSelections(taxonomy, raw),
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
