/**
 * Dictation: the pure pieces the hook in app/components/dictation.tsx uses.
 * Browser-safe, no React, no server imports.
 *
 * The recorder captures the microphone in 3-second chunks. Every preview and
 * the final pass send one WAV file (16-bit PCM, mono, 16 kHz) to
 * /resources/transcribe. Web Speech is an optional fast path: it may supply
 * the grey words while she speaks, never the final text.
 */

/** The recorder hands over a chunk this often. */
export const DICTATION_PREVIEW_MS = 3000
/** After this long no more previews go out; the final pass covers the rest. */
export const DICTATION_PREVIEW_CUTOFF_MS = 60_000
/** The note changes at this point: "Still listening…". */
export const DICTATION_LONG_MS = 60_000
/** The recording stops on its own here. */
export const DICTATION_MAX_MS = 120_000
/** Web Speech must give a result within this time, or it is dropped. */
export const DICTATION_SPEECH_PROVE_MS = 3000
/** The WAV sample rate the previews and the final use. */
export const DICTATION_SAMPLE_RATE = 16_000
/** Timeouts for the two kinds of POST. */
export const DICTATION_PREVIEW_TIMEOUT_MS = 20_000
export const DICTATION_FINAL_TIMEOUT_MS = 45_000
export const TRANSCRIBE_ENDPOINT = '/resources/transcribe'

/** The first supported type wins. iOS Safari has only audio/mp4. */
export const RECORDER_MIMES = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus',
] as const

type WindowLike = {
	navigator?: {
		mediaDevices?: { getUserMedia?: unknown }
		userAgent?: string
		maxTouchPoints?: number
		standalone?: boolean
	}
	MediaRecorder?: unknown
	AudioContext?: unknown
	webkitAudioContext?: unknown
	SpeechRecognition?: unknown
	webkitSpeechRecognition?: unknown
	matchMedia?: (query: string) => { matches: boolean }
}

function currentWindow(): WindowLike | undefined {
	return typeof window === 'undefined' ? undefined : (window as WindowLike)
}

/**
 * True when the browser can record and decode audio: getUserMedia,
 * MediaRecorder and an AudioContext. Without one of them the button is
 * hidden and the keyboard's own microphone is the way in.
 */
export function dictationSupported(
	win: WindowLike | undefined = currentWindow(),
): boolean {
	if (!win) return false
	const hasMedia =
		typeof win.navigator?.mediaDevices?.getUserMedia === 'function'
	const hasRecorder = typeof win.MediaRecorder === 'function'
	const hasAudio =
		typeof win.AudioContext === 'function' ||
		typeof win.webkitAudioContext === 'function'
	return hasMedia && hasRecorder && hasAudio
}

/**
 * The first recorder type this browser supports, or null (then the
 * recorder picks its own default).
 */
export function pickRecorderMime(
	isTypeSupported: (type: string) => boolean = defaultIsTypeSupported,
): string | null {
	for (const type of RECORDER_MIMES) {
		try {
			if (isTypeSupported(type)) return type
		} catch {
			// an old recorder without isTypeSupported: try the next
		}
	}
	return null
}

function defaultIsTypeSupported(type: string): boolean {
	const win = currentWindow()
	const recorder = win?.MediaRecorder as
		| { isTypeSupported?: (type: string) => boolean }
		| undefined
	return recorder?.isTypeSupported?.(type) === true
}

/** iPhone, iPad (also the desktop-class iPad that says Macintosh) and iPod. */
export function isIosUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
	if (/iPhone|iPad|iPod/i.test(userAgent)) return true
	return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

/**
 * Web Speech may run as a fast path only where it is known to work: the
 * browser has the API, the device is not iOS and the page is not a
 * home-screen (standalone) app.
 */
export function speechAllowedHere(
	env: {
		userAgent: string
		standalone: boolean
		hasSpeech: boolean
		maxTouchPoints?: number
	} = readSpeechEnv(),
): boolean {
	if (!env.hasSpeech) return false
	if (env.standalone) return false
	return !isIosUserAgent(env.userAgent, env.maxTouchPoints ?? 0)
}

function readSpeechEnv() {
	const win = currentWindow()
	const nav = win?.navigator
	let standalone = nav?.standalone === true
	try {
		if (!standalone && typeof win?.matchMedia === 'function') {
			standalone = win.matchMedia('(display-mode: standalone)').matches
		}
	} catch {
		// matchMedia can throw in odd embeds; treat as not standalone
	}
	return {
		userAgent: nav?.userAgent ?? '',
		maxTouchPoints: nav?.maxTouchPoints ?? 0,
		standalone,
		hasSpeech:
			typeof win?.SpeechRecognition === 'function' ||
			typeof win?.webkitSpeechRecognition === 'function',
	}
}

/** The part of an AudioBuffer the WAV writer needs. */
export type MonoAudioBuffer = {
	length: number
	sampleRate: number
	getChannelData: (channel: number) => Float32Array
}

/**
 * A 16-bit PCM mono WAV file from channel 0 of an already rendered buffer.
 * The header says `sampleRate`; pass the rate the buffer was rendered at.
 */
export function wavFromAudioBuffer(
	buffer: MonoAudioBuffer,
	sampleRate: number = buffer.sampleRate || DICTATION_SAMPLE_RATE,
): ArrayBuffer {
	const samples = buffer.getChannelData(0)
	const frames = Math.min(samples.length, buffer.length)
	const dataBytes = frames * 2
	const out = new ArrayBuffer(44 + dataBytes)
	const view = new DataView(out)
	writeAscii(view, 0, 'RIFF')
	view.setUint32(4, 36 + dataBytes, true)
	writeAscii(view, 8, 'WAVE')
	writeAscii(view, 12, 'fmt ')
	view.setUint32(16, 16, true) // fmt chunk size
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, 1, true) // mono
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * 2, true) // byte rate
	view.setUint16(32, 2, true) // block align
	view.setUint16(34, 16, true) // bits per sample
	writeAscii(view, 36, 'data')
	view.setUint32(40, dataBytes, true)
	let offset = 44
	for (let i = 0; i < frames; i++) {
		const s = Math.max(-1, Math.min(1, samples[i] ?? 0))
		view.setInt16(offset, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true)
		offset += 2
	}
	return out
}

function writeAscii(view: DataView, offset: number, text: string) {
	for (let i = 0; i < text.length; i++) {
		view.setUint8(offset + i, text.charCodeAt(i))
	}
}

/** The kind of start failure, from the error getUserMedia threw. */
export function startErrorKind(error: unknown): 'blocked' | 'noMic' | 'other' {
	const name = error instanceof Error ? error.name : ''
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked'
	if (name === 'NotFoundError' || name === 'OverconstrainedError')
		return 'noMic'
	return 'other'
}
