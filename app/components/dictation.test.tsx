/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import {
	DICTATION_COPY,
	DictateButton,
	DictationNote,
	GhostTextarea,
	useDictation,
} from '#app/components/dictation.tsx'
import { appendSpeech } from '#app/utils/article-edit.ts'
import { DICTATION_MAX_MS, DICTATION_PREVIEW_MS } from '#app/utils/dictation.ts'

/* ------------------------------------------------------------------------ */
/* Fakes for the browser pieces                                              */
/* ------------------------------------------------------------------------ */

class FakeRecorder {
	static instances: FakeRecorder[] = []
	static isTypeSupported(type: string) {
		return type === 'audio/webm;codecs=opus'
	}
	state: 'inactive' | 'recording' = 'inactive'
	mimeType: string
	timeslice = 0
	ondataavailable: ((event: { data: Blob }) => void) | null = null
	onstop: (() => void) | null = null
	onerror: (() => void) | null = null
	constructor(_stream: unknown, options?: { mimeType?: string }) {
		this.mimeType = options?.mimeType ?? ''
		FakeRecorder.instances.push(this)
	}
	start(timeslice?: number) {
		this.state = 'recording'
		this.timeslice = timeslice ?? 0
	}
	stop() {
		this.state = 'inactive'
		// The browser sends the last chunk, then stop, after the call returns.
		queueMicrotask(() => {
			this.ondataavailable?.({ data: new Blob(['tail']) })
			this.onstop?.()
		})
	}
	/** A 3-second chunk arrives. */
	emit() {
		this.ondataavailable?.({ data: new Blob(['chunk']) })
	}
}

const decodedBuffer = {
	duration: 1,
	sampleRate: 48_000,
	length: 48_000,
	numberOfChannels: 2,
	getChannelData: () => new Float32Array(48_000),
}
const renderedBuffer = {
	duration: 1,
	sampleRate: 16_000,
	length: 16_000,
	numberOfChannels: 1,
	getChannelData: () => new Float32Array(16_000),
}

class FakeAudioContext {
	decodeAudioData = async () => decodedBuffer
	close = vi.fn(async () => {})
}

class FakeOfflineAudioContext {
	static rates: number[] = []
	destination = {}
	oncomplete = null
	constructor(_channels: number, _length: number, sampleRate: number) {
		FakeOfflineAudioContext.rates.push(sampleRate)
	}
	createBufferSource() {
		return { buffer: null, connect() {}, start() {} }
	}
	async startRendering() {
		return renderedBuffer
	}
}

/** A FormData that keeps what it is given, so the test can read the parts. */
class FakeFormData {
	private map = new Map<string, unknown>()
	append(name: string, value: unknown) {
		this.map.set(name, value)
	}
	get(name: string) {
		return this.map.get(name) ?? null
	}
}

type Posted = { final: string; audioBytes: number; audioType: string }

function jsonResponse(status: number, data: unknown) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

/** The track and the stream getUserMedia hands back. */
function fakeStream() {
	const track = { stop: vi.fn() }
	return { track, stream: { getTracks: () => [track] } }
}

function installSupport({
	getUserMedia,
	reply = () => jsonResponse(200, { text: 'hello there' }),
}: {
	getUserMedia?: () => Promise<unknown>
	reply?: (posted: Posted, n: number) => Response | Promise<Response>
} = {}) {
	const { track, stream } = fakeStream()
	const gum = vi.fn(getUserMedia ?? (async () => stream))
	Object.defineProperty(navigator, 'mediaDevices', {
		value: { getUserMedia: gum },
		configurable: true,
	})
	FakeRecorder.instances = []
	FakeOfflineAudioContext.rates = []
	vi.stubGlobal('MediaRecorder', FakeRecorder)
	vi.stubGlobal('AudioContext', FakeAudioContext)
	vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext)
	vi.stubGlobal('FormData', FakeFormData)
	const posted: Posted[] = []
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init?: RequestInit) => {
			const form = init?.body as unknown as FakeFormData
			const audio = form.get('audio')
			const entry: Posted = {
				final: String(form.get('final')),
				audioBytes: audio instanceof Blob ? audio.size : -1,
				audioType: audio instanceof Blob ? audio.type : '',
			}
			posted.push(entry)
			return reply(entry, posted.length)
		}),
	)
	return { getUserMedia: gum, track, posted }
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
	Object.defineProperty(navigator, 'mediaDevices', {
		value: undefined,
		configurable: true,
	})
})

/* ------------------------------------------------------------------------ */
/* A box with the hook, as the composer mounts it                            */
/* ------------------------------------------------------------------------ */

function Harness({
	initialValue = '',
	onFinal,
	onInterim,
}: {
	initialValue?: string
	onFinal?: (text: string) => void
	onInterim?: (text: string) => void
}) {
	const [value, setValue] = useState(initialValue)
	const [ghost, setGhost] = useState('')
	const dictation = useDictation({
		onInterim: text => {
			setGhost(text)
			onInterim?.(text)
		},
		onFinal: text => {
			setValue(current => appendSpeech(current, text))
			onFinal?.(text)
		},
	})
	return (
		<div>
			<GhostTextarea
				aria-label="Message"
				value={value}
				ghost={ghost}
				listening={dictation.listening}
				onChange={event => setValue(event.currentTarget.value)}
			/>
			<DictateButton dictation={dictation} />
			<DictationNote dictation={dictation} />
			<output data-testid="phase">{dictation.phase}</output>
		</div>
	)
}

function overlay() {
	return document.querySelector('[data-ghost-overlay]')
}
function ghostText() {
	return document.querySelector('[data-ghost-text]')?.textContent ?? ''
}
function box() {
	return screen.getByLabelText('Message') as HTMLTextAreaElement
}
function recorder() {
	const instance = FakeRecorder.instances[0]
	if (!instance) throw new Error('no recorder was made')
	return instance
}

async function startListening() {
	const user = userEvent.setup()
	await user.click(screen.getByRole('button', { name: DICTATION_COPY.dictate }))
	await screen.findByText(DICTATION_COPY.listeningNote)
	return user
}

/* ------------------------------------------------------------------------ */

test('without recording support the button is hidden and the keyboard line shows', () => {
	render(<Harness />)
	expect(screen.getByText(DICTATION_COPY.keyboard)).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: DICTATION_COPY.dictate }),
	).toBeNull()
	expect(overlay()).toBeNull()
})

test('start asks for the microphone and shows Listening', async () => {
	const { getUserMedia } = installSupport()
	render(<Harness />)
	expect(screen.queryByText(DICTATION_COPY.keyboard)).toBeNull()
	await startListening()

	expect(getUserMedia).toHaveBeenCalledWith({
		audio: { echoCancellation: true, noiseSuppression: true },
	})
	const button = screen.getByRole('button', { name: DICTATION_COPY.listening })
	expect(button).toHaveAttribute('aria-pressed', 'true')
	expect(recorder().state).toBe('recording')
	expect(recorder().timeslice).toBe(DICTATION_PREVIEW_MS)
	expect(recorder().mimeType).toBe('audio/webm;codecs=opus')
	expect(box()).toHaveAttribute('readonly')
	expect(overlay()).not.toBeNull()
	expect(screen.getByTestId('phase')).toHaveTextContent('listening')
})

test('a preview reply replaces the ghost text', async () => {
	const onInterim = vi.fn()
	const { posted } = installSupport({
		reply: (_posted, n) =>
			jsonResponse(200, {
				text: n === 1 ? 'hello there' : 'hello there friend',
			}),
	})
	render(<Harness initialValue="Say we offer Dysport" onInterim={onInterim} />)
	await startListening()

	act(() => recorder().emit())
	await waitFor(() => expect(ghostText()).toBe(' hello there'))
	expect(posted[0]).toMatchObject({ final: 'false' })
	expect(posted[0]!.audioBytes).toBe(44 + 16_000 * 2)
	expect(posted[0]!.audioType).toBe('audio/wav')
	expect(FakeOfflineAudioContext.rates[0]).toBe(16_000)
	expect(onInterim).toHaveBeenLastCalledWith('hello there')

	act(() => recorder().emit())
	await waitFor(() => expect(ghostText()).toBe(' hello there friend'))
	expect(posted).toHaveLength(2)
	// The committed text stays in the box; the grey words sit in the overlay.
	expect(box().value).toBe('Say we offer Dysport')
	expect(document.querySelector('[data-ghost-committed]')?.textContent).toBe(
		'Say we offer Dysport',
	)
})

test('stop posts final=true, commits the final text and frees the microphone', async () => {
	const onFinal = vi.fn()
	const { posted, track } = installSupport({
		reply: posted =>
			jsonResponse(200, {
				text: posted.final === 'true' ? 'Hello there, friend.' : 'hello there',
			}),
	})
	render(<Harness initialValue="First." onFinal={onFinal} />)
	const user = await startListening()
	act(() => recorder().emit())
	await waitFor(() => expect(ghostText()).toBe(' hello there'))

	await user.click(
		screen.getByRole('button', { name: DICTATION_COPY.listening }),
	)
	await waitFor(() =>
		expect(onFinal).toHaveBeenCalledWith('Hello there, friend.'),
	)
	expect(posted.at(-1)).toMatchObject({ final: 'true' })
	expect(box().value).toBe('First. Hello there, friend.')
	expect(overlay()).toBeNull()
	expect(box()).not.toHaveAttribute('readonly')
	expect(
		screen.getByRole('button', { name: DICTATION_COPY.dictate }),
	).toBeInTheDocument()
	expect(track.stop).toHaveBeenCalled()
	expect(screen.queryByText(DICTATION_COPY.finishing)).toBeNull()
	expect(screen.queryByText(DICTATION_COPY.listeningNote)).toBeNull()
	expect(screen.getByTestId('phase')).toHaveTextContent('idle')
})

test('a failed final commits the ghost text and says some words may be off', async () => {
	const onFinal = vi.fn()
	installSupport({
		reply: posted =>
			posted.final === 'true'
				? jsonResponse(502, { error: 'no' })
				: jsonResponse(200, { text: 'ghost words' }),
	})
	render(<Harness onFinal={onFinal} />)
	const user = await startListening()
	act(() => recorder().emit())
	await waitFor(() => expect(ghostText()).toBe('ghost words'))

	await user.click(
		screen.getByRole('button', { name: DICTATION_COPY.listening }),
	)
	await waitFor(() => expect(onFinal).toHaveBeenCalledWith('ghost words'))
	expect(box().value).toBe('ghost words')
	expect(screen.getByRole('alert')).toHaveTextContent(DICTATION_COPY.someOff)
	expect(overlay()).toBeNull()
})

test('a failed final with no ghost text says it could not hear', async () => {
	const onFinal = vi.fn()
	installSupport({ reply: () => jsonResponse(502, { error: 'no' }) })
	render(<Harness onFinal={onFinal} />)
	const user = await startListening()
	await user.click(
		screen.getByRole('button', { name: DICTATION_COPY.listening }),
	)
	await screen.findByText(DICTATION_COPY.notHeard)
	expect(onFinal).not.toHaveBeenCalled()
	expect(
		screen.getByRole('button', { name: DICTATION_COPY.dictate }),
	).toBeInTheDocument()
})

test('an empty preview keeps the earlier ghost text', async () => {
	const { posted } = installSupport({
		reply: (_posted, n) =>
			jsonResponse(200, { text: n === 1 ? 'hello there' : '' }),
	})
	render(<Harness />)
	await startListening()
	act(() => recorder().emit())
	await waitFor(() => expect(ghostText()).toBe('hello there'))
	act(() => recorder().emit())
	await waitFor(() => expect(posted).toHaveLength(2))
	await act(async () => {
		await new Promise(resolve => setTimeout(resolve, 20))
	})
	expect(ghostText()).toBe('hello there')
})

test('an empty final commits the ghost text and says some words may be off', async () => {
	const onFinal = vi.fn()
	installSupport({
		reply: posted =>
			jsonResponse(200, { text: posted.final === 'true' ? '' : 'ghost words' }),
	})
	render(<Harness onFinal={onFinal} />)
	const user = await startListening()
	act(() => recorder().emit())
	await waitFor(() => expect(ghostText()).toBe('ghost words'))
	await user.click(
		screen.getByRole('button', { name: DICTATION_COPY.listening }),
	)
	await waitFor(() => expect(onFinal).toHaveBeenCalledWith('ghost words'))
	expect(screen.getByRole('alert')).toHaveTextContent(DICTATION_COPY.someOff)
})

test('an empty final with no ghost text says it could not hear', async () => {
	const onFinal = vi.fn()
	installSupport({ reply: () => jsonResponse(200, { text: '' }) })
	render(<Harness onFinal={onFinal} />)
	const user = await startListening()
	await user.click(
		screen.getByRole('button', { name: DICTATION_COPY.listening }),
	)
	await screen.findByText(DICTATION_COPY.notHeard)
	expect(onFinal).not.toHaveBeenCalled()
})

test('a blocked microphone shows the blocked line and the button returns to idle', async () => {
	installSupport({
		getUserMedia: async () => {
			throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
		},
	})
	render(<Harness />)
	const user = userEvent.setup()
	await user.click(screen.getByRole('button', { name: DICTATION_COPY.dictate }))
	await screen.findByText(DICTATION_COPY.blocked)
	expect(screen.getByRole('alert')).toHaveTextContent(DICTATION_COPY.blocked)
	expect(
		screen.getByRole('button', { name: DICTATION_COPY.dictate }),
	).toBeInTheDocument()
	expect(FakeRecorder.instances).toHaveLength(0)
	expect(screen.getByTestId('phase')).toHaveTextContent('idle')
})

test('no microphone shows its own line', async () => {
	installSupport({
		getUserMedia: async () => {
			throw Object.assign(new Error('none'), { name: 'NotFoundError' })
		},
	})
	render(<Harness />)
	const user = userEvent.setup()
	await user.click(screen.getByRole('button', { name: DICTATION_COPY.dictate }))
	await screen.findByText(DICTATION_COPY.noMic)
})

test('the recording stops on its own at the cap and says so', async () => {
	const onFinal = vi.fn()
	installSupport({
		reply: () => jsonResponse(200, { text: 'two minutes of words' }),
	})
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
	render(<Harness onFinal={onFinal} />)
	fireEvent.click(screen.getByRole('button', { name: DICTATION_COPY.dictate }))
	// getUserMedia resolves on the microtask queue, which is not faked.
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
	})
	expect(recorder().state).toBe('recording')

	act(() => {
		vi.advanceTimersByTime(DICTATION_MAX_MS)
	})
	expect(recorder().state).toBe('inactive')
	vi.useRealTimers()

	await waitFor(() =>
		expect(onFinal).toHaveBeenCalledWith('two minutes of words'),
	)
	await screen.findByText(DICTATION_COPY.capped)
	expect(
		screen.getByRole('button', { name: DICTATION_COPY.dictate }),
	).toBeInTheDocument()
})

test('hiding the page stops the recording', async () => {
	const onFinal = vi.fn()
	installSupport({ reply: () => jsonResponse(200, { text: 'kept' }) })
	render(<Harness onFinal={onFinal} />)
	await startListening()
	Object.defineProperty(document, 'visibilityState', {
		value: 'hidden',
		configurable: true,
	})
	act(() => {
		document.dispatchEvent(new Event('visibilitychange'))
	})
	Object.defineProperty(document, 'visibilityState', {
		value: 'visible',
		configurable: true,
	})
	await waitFor(() => expect(onFinal).toHaveBeenCalledWith('kept'))
})

test('unmounting while listening frees the microphone and reports nothing', async () => {
	const onFinal = vi.fn()
	const { track } = installSupport()
	const view = render(<Harness onFinal={onFinal} />)
	await startListening()
	view.unmount()
	expect(track.stop).toHaveBeenCalled()
	expect(recorder().state).toBe('inactive')
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
	})
	expect(onFinal).not.toHaveBeenCalled()
})

test('GhostTextarea shows the committed text and the ghost text after it', () => {
	const { rerender } = render(
		<GhostTextarea
			aria-label="Box"
			value="hello"
			ghost="world"
			listening
			onChange={() => {}}
		/>,
	)
	const committed = document.querySelector('[data-ghost-committed]')
	expect(committed).toHaveTextContent('hello')
	expect(ghostText()).toBe(' world')
	expect(document.querySelector('[data-ghost-text]')).toHaveClass(
		'text-muted-foreground',
	)
	const textarea = screen.getByLabelText('Box')
	expect(textarea).toHaveAttribute('readonly')
	expect(textarea).toHaveClass('text-transparent')

	rerender(
		<GhostTextarea
			aria-label="Box"
			value="hello"
			ghost=""
			onChange={() => {}}
		/>,
	)
	expect(overlay()).toBeNull()
	expect(screen.getByLabelText('Box')).not.toHaveClass('text-transparent')
	expect(screen.getByLabelText('Box')).not.toHaveAttribute('readonly')
})
