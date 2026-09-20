/**
 * Read-aloud for the review pages: the parts shared by the server (which
 * turns ElevenLabs' character times into word times) and the browser (which
 * finds the same words in the page). One paragraph is one narration.
 */

/** A paragraph longer than this is not narrated in one piece. */
export const NARRATION_MAX_CHARS = 3000

/** A word: a run of non-space characters, as [start, end) in the text. */
export type NarrationToken = { start: number; end: number }

/** One word's place in the text and in the audio: [charStart, charEnd, startSeconds, endSeconds]. */
export type NarrationWord = [number, number, number, number]

export type NarrationTiming = {
	durationS: number
	words: NarrationWord[]
}

export type NarrationAlignment = {
	chars: string[]
	starts: number[]
	ends: number[]
}

/** The text as it is spoken: one space between words, no ends. */
export function normalizeNarrationText(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim()
}

/** True when there is something to say: a letter or a digit. */
export function hasSpeech(text: string): boolean {
	return /[\p{L}\p{N}]/u.test(text)
}

export function narrationTokens(text: string): NarrationToken[] {
	const out: NarrationToken[] = []
	const re = /\S+/g
	let m: RegExpExecArray | null
	while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length })
	return out
}

/**
 * Word times from ElevenLabs' per-character times. The alignment covers the
 * text character for character; a word's time runs from its first character's
 * start to its last character's end.
 */
export function wordTimings(
	text: string,
	alignment: NarrationAlignment,
): NarrationTiming {
	const n = alignment.chars.length
	const durationS = n > 0 ? (alignment.ends[n - 1] ?? 0) : 0
	const words: NarrationWord[] = narrationTokens(text).map(t => {
		const first = Math.min(t.start, Math.max(0, n - 1))
		const last = Math.min(t.end, n) - 1
		return [
			t.start,
			t.end,
			round3(alignment.starts[first] ?? 0),
			round3(last >= 0 ? (alignment.ends[last] ?? 0) : 0),
		]
	})
	return { durationS: round3(durationS), words }
}

/** The word being spoken at `t` seconds, or -1 before the first word. */
export function wordAt(words: ReadonlyArray<NarrationWord>, t: number): number {
	let lo = 0
	let hi = words.length - 1
	let best = -1
	while (lo <= hi) {
		const mid = (lo + hi) >> 1
		if ((words[mid]?.[2] ?? 0) <= t + 0.05) {
			best = mid
			lo = mid + 1
		} else hi = mid - 1
	}
	return best
}

function round3(n: number): number {
	return Math.round(n * 1000) / 1000
}
