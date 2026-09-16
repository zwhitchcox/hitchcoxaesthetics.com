import { describe, expect, test } from 'vitest'
import {
	dictationSupported,
	isIosUserAgent,
	pickRecorderMime,
	speechAllowedHere,
	startErrorKind,
	wavFromAudioBuffer,
} from './dictation.ts'

const IPHONE_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_UA =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
const DESKTOP_CHROME_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

function ascii(view: DataView, offset: number, length: number) {
	let out = ''
	for (let i = 0; i < length; i++)
		out += String.fromCharCode(view.getUint8(offset + i))
	return out
}

describe('wavFromAudioBuffer', () => {
	test('writes a 16-bit mono PCM header and the right byte length for 1 s at 16 kHz', () => {
		// A 1 s stereo 48 kHz clip rendered to mono 16 kHz is 16000 frames.
		const frames = 16_000
		const samples = new Float32Array(frames)
		for (let i = 0; i < frames; i++) samples[i] = Math.sin(i / 10) * 0.5
		const wav = wavFromAudioBuffer(
			{ length: frames, sampleRate: 16_000, getChannelData: () => samples },
			16_000,
		)
		expect(wav.byteLength).toBe(44 + frames * 2)
		const view = new DataView(wav)
		expect(ascii(view, 0, 4)).toBe('RIFF')
		expect(view.getUint32(4, true)).toBe(36 + frames * 2)
		expect(ascii(view, 8, 4)).toBe('WAVE')
		expect(ascii(view, 12, 4)).toBe('fmt ')
		expect(view.getUint32(16, true)).toBe(16)
		expect(view.getUint16(20, true)).toBe(1) // PCM
		expect(view.getUint16(22, true)).toBe(1) // mono
		expect(view.getUint32(24, true)).toBe(16_000)
		expect(view.getUint32(28, true)).toBe(32_000) // byte rate
		expect(view.getUint16(32, true)).toBe(2) // block align
		expect(view.getUint16(34, true)).toBe(16) // bits
		expect(ascii(view, 36, 4)).toBe('data')
		expect(view.getUint32(40, true)).toBe(frames * 2)
	})

	test('scales and clamps samples to int16', () => {
		const samples = new Float32Array([0, 1, -1, 2, -2, 0.5])
		const wav = wavFromAudioBuffer({
			length: samples.length,
			sampleRate: 16_000,
			getChannelData: () => samples,
		})
		const view = new DataView(wav)
		expect(view.getInt16(44, true)).toBe(0)
		expect(view.getInt16(46, true)).toBe(0x7fff)
		expect(view.getInt16(48, true)).toBe(-0x8000)
		expect(view.getInt16(50, true)).toBe(0x7fff)
		expect(view.getInt16(52, true)).toBe(-0x8000)
		expect(view.getInt16(54, true)).toBe(Math.round(0.5 * 0x7fff))
		expect(view.getUint32(24, true)).toBe(16_000) // the buffer's own rate by default
	})
})

describe('pickRecorderMime', () => {
	test('picks the first supported type in order', () => {
		expect(pickRecorderMime(type => type === 'audio/webm;codecs=opus')).toBe(
			'audio/webm;codecs=opus',
		)
		expect(pickRecorderMime(type => type === 'audio/mp4')).toBe('audio/mp4')
		expect(
			pickRecorderMime(type => type === 'audio/mp4' || type === 'audio/webm'),
		).toBe('audio/webm')
	})

	test('is null when nothing is supported or the check throws', () => {
		expect(pickRecorderMime(() => false)).toBeNull()
		expect(
			pickRecorderMime(() => {
				throw new Error('no isTypeSupported')
			}),
		).toBeNull()
	})
})

describe('speechAllowedHere', () => {
	test('is false on an iPhone, on an iPad that says Macintosh, and in standalone mode', () => {
		expect(
			speechAllowedHere({
				userAgent: IPHONE_UA,
				standalone: false,
				hasSpeech: true,
			}),
		).toBe(false)
		expect(
			speechAllowedHere({
				userAgent: IPAD_AS_MAC_UA,
				standalone: false,
				hasSpeech: true,
				maxTouchPoints: 5,
			}),
		).toBe(false)
		expect(
			speechAllowedHere({
				userAgent: ANDROID_UA,
				standalone: true,
				hasSpeech: true,
			}),
		).toBe(false)
	})

	test('is true on Android Chrome and desktop Chrome with the API', () => {
		expect(
			speechAllowedHere({
				userAgent: ANDROID_UA,
				standalone: false,
				hasSpeech: true,
			}),
		).toBe(true)
		expect(
			speechAllowedHere({
				userAgent: DESKTOP_CHROME_UA,
				standalone: false,
				hasSpeech: true,
				maxTouchPoints: 0,
			}),
		).toBe(true)
	})

	test('is false without the API', () => {
		expect(
			speechAllowedHere({
				userAgent: ANDROID_UA,
				standalone: false,
				hasSpeech: false,
			}),
		).toBe(false)
	})

	test('isIosUserAgent needs touch points for the Macintosh case', () => {
		expect(isIosUserAgent(IPAD_AS_MAC_UA, 0)).toBe(false)
		expect(isIosUserAgent(IPAD_AS_MAC_UA, 5)).toBe(true)
		expect(isIosUserAgent(IPHONE_UA)).toBe(true)
	})
})

describe('dictationSupported', () => {
	test('needs getUserMedia, MediaRecorder and an AudioContext', () => {
		const full = {
			navigator: { mediaDevices: { getUserMedia: () => {} } },
			MediaRecorder: class {},
			webkitAudioContext: class {},
		}
		expect(dictationSupported(full)).toBe(true)
		expect(dictationSupported({ ...full, MediaRecorder: undefined })).toBe(
			false,
		)
		expect(dictationSupported({ ...full, navigator: {} })).toBe(false)
		expect(
			dictationSupported({
				...full,
				webkitAudioContext: undefined,
				AudioContext: undefined,
			}),
		).toBe(false)
		expect(dictationSupported(undefined)).toBe(false)
	})
})

describe('startErrorKind', () => {
	test('maps getUserMedia errors to the three notes', () => {
		expect(
			startErrorKind(
				Object.assign(new Error('no'), { name: 'NotAllowedError' }),
			),
		).toBe('blocked')
		expect(
			startErrorKind(Object.assign(new Error('no'), { name: 'SecurityError' })),
		).toBe('blocked')
		expect(
			startErrorKind(Object.assign(new Error('no'), { name: 'NotFoundError' })),
		).toBe('noMic')
		expect(startErrorKind(new Error('odd'))).toBe('other')
		expect(startErrorKind('string')).toBe('other')
	})
})
