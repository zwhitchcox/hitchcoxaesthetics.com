/**
 * Read-aloud for the review pages: one paragraph in, its audio and word times
 * out, paid for once. The voice and the model match the read-along app on
 * the Mac mini (George, eleven_multilingual_v2), but this cache is the site's
 * own: the site's server cannot reach the mini's tailnet.
 */
import { createHash } from 'node:crypto'

import { prisma } from '#app/utils/db.server.ts'
import {
	NARRATION_MAX_CHARS,
	type NarrationAlignment,
	type NarrationWord,
	wordTimings,
} from '#app/utils/narration.ts'

export const NARRATION_VOICE_ID =
	process.env.NARRATION_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb'
export const NARRATION_MODEL_ID =
	process.env.NARRATION_MODEL_ID ?? 'eleven_multilingual_v2'

export type Narration = {
	hash: string
	chars: number
	durationS: number
	words: NarrationWord[]
}

export function hasNarrationConfig(): boolean {
	return Boolean(process.env.ELEVEN_LABS_API_KEY?.trim())
}

/** The same key scheme as the read-along app, so a shared cache stays possible. */
export function narrationHash(
	text: string,
	voiceId = NARRATION_VOICE_ID,
	modelId = NARRATION_MODEL_ID,
): string {
	return createHash('sha256')
		.update(`${voiceId}|${modelId}|v1|${text}`)
		.digest('hex')
}

/** One request per text at a time: two taps on Play must not pay twice. */
const inFlight = new Map<string, Promise<Narration>>()

export async function getNarration(text: string): Promise<Narration> {
	if (text.length > NARRATION_MAX_CHARS) {
		throw new Error(`A paragraph longer than ${NARRATION_MAX_CHARS} characters is not narrated.`)
	}
	const hash = narrationHash(text)
	const cached = await prisma.articleNarration.findUnique({
		where: { hash },
		select: { chars: true, durationS: true, wordsJson: true },
	})
	if (cached) {
		return {
			hash,
			chars: cached.chars,
			durationS: cached.durationS,
			words: JSON.parse(cached.wordsJson) as NarrationWord[],
		}
	}
	const running = inFlight.get(hash)
	if (running) return running
	const work = (async () => {
		const { audio, alignment } = await speak(text)
		const timing = wordTimings(text, alignment)
		await prisma.articleNarration.upsert({
			where: { hash },
			create: {
				hash,
				voiceId: NARRATION_VOICE_ID,
				modelId: NARRATION_MODEL_ID,
				chars: text.length,
				durationS: timing.durationS,
				wordsJson: JSON.stringify(timing.words),
				audio,
			},
			update: {},
		})
		return { hash, chars: text.length, ...timing }
	})()
	inFlight.set(hash, work)
	try {
		return await work
	} finally {
		inFlight.delete(hash)
	}
}

export async function readNarrationAudio(hash: string): Promise<Buffer | null> {
	const row = await prisma.articleNarration.findUnique({
		where: { hash },
		select: { audio: true },
	})
	return row ? Buffer.from(row.audio) : null
}

type SpeakResult = { audio: Buffer; alignment: NarrationAlignment }

/** ElevenLabs with character timestamps. Waits out 429s; gives up on 401/402 and quota. */
async function speak(text: string): Promise<SpeakResult> {
	const key = process.env.ELEVEN_LABS_API_KEY?.trim()
	if (!key) throw new Error('ELEVEN_LABS_API_KEY is not set')
	const url = `https://api.elevenlabs.io/v1/text-to-speech/${NARRATION_VOICE_ID}/with-timestamps?output_format=mp3_44100_64`
	let lastError: unknown
	for (let attempt = 0, waits = 0; attempt < 3; ) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text,
				model_id: NARRATION_MODEL_ID,
				voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.05 },
			}),
		}).catch((error: unknown) => {
			lastError = error
			return null
		})
		if (!res) {
			attempt++
			await sleep(2000 * attempt)
			continue
		}
		if (res.status === 429) {
			await res.text().catch(() => '')
			if (++waits > 12) throw new Error('ElevenLabs is busy (429), gave up after a minute')
			await sleep(5000)
			continue
		}
		const body = res.ok ? null : (await res.text().catch(() => '')).slice(0, 300)
		if (body?.includes('quota_exceeded')) {
			throw new Error('The voice account is out of credits until it resets or is topped up.')
		}
		if (res.status === 401 || res.status === 402) {
			throw new Error(`The voice service refused the key (${res.status}).`)
		}
		if (!res.ok) {
			lastError = new Error(`ElevenLabs ${res.status}: ${body}`)
			attempt++
			await sleep(2000 * attempt)
			continue
		}
		const data = (await res.json()) as {
			audio_base64: string
			alignment: {
				characters: string[]
				character_start_times_seconds: number[]
				character_end_times_seconds: number[]
			}
		}
		return {
			audio: Buffer.from(data.audio_base64, 'base64'),
			alignment: {
				chars: data.alignment.characters,
				starts: data.alignment.character_start_times_seconds,
				ends: data.alignment.character_end_times_seconds,
			},
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}
