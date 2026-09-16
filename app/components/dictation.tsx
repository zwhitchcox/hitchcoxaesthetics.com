/**
 * Dictation with ghost text, for the review pages.
 *
 * The microphone is recorded with MediaRecorder in 3-second chunks. While
 * she speaks, the chunks so far are sent to /resources/transcribe and the
 * answer shows as grey ghost text after her typed words. On stop the whole
 * recording is transcribed once more and that text is committed. Web Speech
 * is used only as a fast path for the grey words, and only where it proves
 * itself within 3 seconds; the final text always comes from the server.
 *
 * Exports: useDictation, DictateButton, GhostTextarea, DictationNote,
 * DICTATION_COPY. The pure pieces live in app/utils/dictation.ts.
 */
import {
	forwardRef,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type ChangeEvent,
	type TextareaHTMLAttributes,
} from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { appendSpeech } from '#app/utils/article-edit.ts'
import {
	DICTATION_FINAL_TIMEOUT_MS,
	DICTATION_LONG_MS,
	DICTATION_MAX_MS,
	DICTATION_PREVIEW_CUTOFF_MS,
	DICTATION_PREVIEW_MS,
	DICTATION_PREVIEW_TIMEOUT_MS,
	DICTATION_SAMPLE_RATE,
	DICTATION_SPEECH_PROVE_MS,
	TRANSCRIBE_ENDPOINT,
	dictationSupported,
	pickRecorderMime,
	speechAllowedHere,
	startErrorKind,
	wavFromAudioBuffer,
	type MonoAudioBuffer,
} from '#app/utils/dictation.ts'
import { cn } from '#app/utils/misc.tsx'

export const DICTATION_COPY = {
	dictate: 'Dictate',
	listening: 'Listening… tap to stop',
	keyboard: 'Use the microphone key on your keyboard.',
	listeningNote: 'Listening… tap the microphone to stop.',
	stillListening: 'Still listening. The rest shows when you stop.',
	finishing: 'Finishing…',
	capped:
		'Dictation stops after two minutes. Tap the microphone again to add more.',
	blocked:
		'The microphone is blocked. Allow it for this site, or use the microphone key on your keyboard.',
	noMic: 'No microphone was found. Use the microphone key on your keyboard.',
	startFailed: 'Could not start the microphone. Try again, or type it.',
	someOff: 'Some words may be off. Check them before you send.',
	notHeard: 'Could not hear that. Try again, or type it.',
} as const

export type DictationPhase = 'idle' | 'starting' | 'listening' | 'finishing'
export type DictationNoteState = {
	text: string
	tone: 'muted' | 'error'
} | null

export type Dictation = {
	/** The browser can record and decode audio. */
	supported: boolean
	/** False on the server and during hydration, before the check ran. */
	checked: boolean
	/** True from start() until the final text is committed or the start failed. */
	listening: boolean
	phase: DictationPhase
	start: () => void
	stop: () => void
	note: DictationNoteState
}

/* ------------------------------------------------------------------------ */
/* Browser types the lib does not fully cover                                */
/* ------------------------------------------------------------------------ */

type SpeechAlternativeLike = { transcript: string }
type SpeechResultLike = ArrayLike<SpeechAlternativeLike> & { isFinal: boolean }
type SpeechEventLike = {
	resultIndex: number
	results: ArrayLike<SpeechResultLike>
}
type SpeechRecognitionLike = {
	continuous: boolean
	interimResults: boolean
	lang: string
	onresult: ((event: SpeechEventLike) => void) | null
	onend: (() => void) | null
	onerror: (() => void) | null
	start: () => void
	stop: () => void
	abort: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

type AudioContextLike = {
	decodeAudioData: (
		data: ArrayBuffer,
		onDone?: (buffer: AudioBuffer) => void,
		onFail?: (error: unknown) => void,
	) => Promise<AudioBuffer> | void
	close?: () => Promise<void>
}
type AudioContextCtor = new () => AudioContextLike
type OfflineContextLike = {
	destination: AudioNode
	createBufferSource: () => AudioBufferSourceNode
	startRendering: () => Promise<AudioBuffer> | void
	oncomplete: ((event: { renderedBuffer: AudioBuffer }) => void) | null
}
type OfflineContextCtor = new (
	channels: number,
	length: number,
	sampleRate: number,
) => OfflineContextLike

type BrowserGlobals = {
	SpeechRecognition?: SpeechRecognitionCtor
	webkitSpeechRecognition?: SpeechRecognitionCtor
	AudioContext?: AudioContextCtor
	webkitAudioContext?: AudioContextCtor
	OfflineAudioContext?: OfflineContextCtor
	webkitOfflineAudioContext?: OfflineContextCtor
}

function browser(): BrowserGlobals {
	return window as unknown as BrowserGlobals
}

/* ------------------------------------------------------------------------ */
/* The recording session                                                     */
/* ------------------------------------------------------------------------ */

type Session = {
	stream: MediaStream
	recorder: MediaRecorder
	mime: string
	chunks: Blob[]
	startedAt: number
	stopRequested: boolean
	finalized: boolean
	previewInFlight: boolean
	speech: SpeechRecognitionLike | null
	speechProven: boolean
	speechFinal: string
	ghost: string
	capped: boolean
	audio: AudioContextLike | null
	timers: ReturnType<typeof setTimeout>[]
}

type ControllerHooks = {
	setPhase: (phase: DictationPhase) => void
	setNote: (note: DictationNoteState) => void
	onInterim: (text: string) => void
	onFinal: (text: string) => void
}

/**
 * One controller per hook instance. It owns the stream, the recorder, the
 * timers and the fetches, so the React side only reads phase and note.
 */
class DictationController {
	private session: Session | null = null
	private phase: DictationPhase = 'idle'
	private disposed = false
	private pendingStart: { cancelled: boolean } | null = null

	constructor(private hooks: ControllerHooks) {}

	start = () => {
		if (this.disposed || this.phase !== 'idle' || this.session) return
		if (!dictationSupported()) return
		this.note(null)
		this.setPhase('starting')
		const pending = { cancelled: false }
		this.pendingStart = pending
		void this.open(pending)
	}

	stop = () => {
		if (this.session) {
			this.requestStop(this.session)
			return
		}
		if (this.pendingStart) this.pendingStart.cancelled = true
	}

	/** The page goes away: stop everything, report nothing. */
	dispose() {
		this.disposed = true
		if (this.pendingStart) this.pendingStart.cancelled = true
		const session = this.session
		this.session = null
		this.phase = 'idle'
		if (!session) return
		session.stopRequested = true
		session.finalized = true
		this.release(session)
		try {
			if (session.recorder.state !== 'inactive') session.recorder.stop()
		} catch {
			// already stopped
		}
	}

	/** The effect ran again (StrictMode mounts twice): take calls again. */
	revive() {
		this.disposed = false
	}

	private setPhase(phase: DictationPhase) {
		this.phase = phase
		if (!this.disposed) this.hooks.setPhase(phase)
	}

	private note(note: DictationNoteState) {
		if (!this.disposed) this.hooks.setNote(note)
	}

	private ghost(session: Session, text: string) {
		session.ghost = text
		if (!this.disposed && this.session === session) this.hooks.onInterim(text)
	}

	private async open(pending: { cancelled: boolean }) {
		let stream: MediaStream
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true },
			})
		} catch (error) {
			this.pendingStart = null
			if (this.disposed) return
			const kind = startErrorKind(error)
			this.note({
				text:
					kind === 'blocked'
						? DICTATION_COPY.blocked
						: kind === 'noMic'
							? DICTATION_COPY.noMic
							: DICTATION_COPY.startFailed,
				tone: 'error',
			})
			this.setPhase('idle')
			return
		}
		this.pendingStart = null
		if (pending.cancelled || this.disposed) {
			stopTracks(stream)
			this.setPhase('idle')
			return
		}

		const mime = pickRecorderMime()
		let recorder: MediaRecorder
		try {
			recorder = new MediaRecorder(
				stream,
				mime ? { mimeType: mime } : undefined,
			)
		} catch {
			stopTracks(stream)
			this.note({ text: DICTATION_COPY.startFailed, tone: 'error' })
			this.setPhase('idle')
			return
		}

		const session: Session = {
			stream,
			recorder,
			mime: mime ?? '',
			chunks: [],
			startedAt: Date.now(),
			stopRequested: false,
			finalized: false,
			previewInFlight: false,
			speech: null,
			speechProven: false,
			speechFinal: '',
			ghost: '',
			capped: false,
			audio: null,
			timers: [],
		}
		recorder.ondataavailable = event => {
			if (event.data && event.data.size > 0) session.chunks.push(event.data)
			if (!session.stopRequested) void this.preview(session)
		}
		recorder.onstop = () => {
			void this.finish(session)
		}
		recorder.onerror = () => {
			if (!session.stopRequested) this.requestStop(session)
		}
		try {
			recorder.start(DICTATION_PREVIEW_MS)
		} catch {
			stopTracks(stream)
			this.note({ text: DICTATION_COPY.startFailed, tone: 'error' })
			this.setPhase('idle')
			return
		}

		this.session = session
		session.startedAt = Date.now()
		this.setPhase('listening')
		this.note({ text: DICTATION_COPY.listeningNote, tone: 'muted' })
		session.timers.push(
			setTimeout(() => {
				if (this.session === session && this.phase === 'listening') {
					this.note({ text: DICTATION_COPY.stillListening, tone: 'muted' })
				}
			}, DICTATION_LONG_MS),
		)
		session.timers.push(
			setTimeout(() => {
				if (this.session === session && this.phase === 'listening') {
					session.capped = true
					this.requestStop(session)
				}
			}, DICTATION_MAX_MS),
		)
		this.startSpeech(session)
	}

	private requestStop(session: Session) {
		if (session.stopRequested) return
		session.stopRequested = true
		this.setPhase('finishing')
		this.note({ text: DICTATION_COPY.finishing, tone: 'muted' })
		this.dropSpeech(session)
		try {
			if (session.recorder.state !== 'inactive') {
				session.recorder.stop()
			} else {
				void this.finish(session)
			}
		} catch {
			void this.finish(session)
		}
	}

	/** Stop the timers, the microphone and Web Speech. The audio context waits for finish(). */
	private release(session: Session) {
		for (const timer of session.timers) clearTimeout(timer)
		session.timers = []
		this.dropSpeech(session)
		stopTracks(session.stream)
	}

	private async preview(session: Session) {
		if (
			session.stopRequested ||
			session.previewInFlight ||
			session.speechProven
		)
			return
		if (Date.now() - session.startedAt > DICTATION_PREVIEW_CUTOFF_MS) return
		if (session.chunks.length === 0) return
		session.previewInFlight = true
		try {
			const wav = await this.toWav(session)
			if (session.stopRequested || session.speechProven) return
			const text = await postClip(wav, false, DICTATION_PREVIEW_TIMEOUT_MS)
			if (session.stopRequested || session.speechProven) return
			// No words yet: the ghost text stays as it is.
			if (text.trim()) this.ghost(session, text)
		} catch {
			// a preview that fails is skipped in silence
		} finally {
			session.previewInFlight = false
		}
	}

	private async finish(session: Session) {
		if (session.finalized) return
		session.finalized = true
		this.release(session)
		let text: string | null = null
		try {
			const wav = await this.toWav(session)
			text = await postClip(wav, true, DICTATION_FINAL_TIMEOUT_MS)
		} catch {
			text = null
		}
		await closeAudio(session)
		if (this.disposed) return
		if (this.session === session) this.session = null
		if (text !== null && text.trim()) {
			this.commit(text)
			this.note(
				session.capped ? { text: DICTATION_COPY.capped, tone: 'muted' } : null,
			)
		} else if (session.ghost.trim()) {
			this.commit(session.ghost)
			this.note({ text: DICTATION_COPY.someOff, tone: 'error' })
		} else {
			this.hooks.onInterim('')
			this.note({ text: DICTATION_COPY.notHeard, tone: 'error' })
		}
		this.setPhase('idle')
	}

	private commit(text: string) {
		this.hooks.onInterim('')
		this.hooks.onFinal(text)
	}

	/** All chunks so far as one mono 16 kHz WAV. */
	private async toWav(session: Session): Promise<ArrayBuffer> {
		const blob = new Blob(
			session.chunks,
			session.mime ? { type: session.mime } : undefined,
		)
		const bytes = await readBlob(blob)
		if (!session.audio) session.audio = createAudioContext()
		const decoded = await decode(session.audio, bytes)
		const rendered = await renderMono(decoded)
		return wavFromAudioBuffer(rendered as MonoAudioBuffer, rendered.sampleRate)
	}

	/* Web Speech: the fast path for the grey words. */

	private startSpeech(session: Session) {
		if (!speechAllowedHere()) return
		const Ctor =
			browser().SpeechRecognition ?? browser().webkitSpeechRecognition
		if (!Ctor) return
		let recognition: SpeechRecognitionLike
		try {
			recognition = new Ctor()
		} catch {
			return
		}
		recognition.continuous = true
		recognition.interimResults = true
		recognition.lang = 'en-US'
		recognition.onresult = event => {
			if (session.speech !== recognition || session.stopRequested) return
			let interim = ''
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i]
				const transcript = result?.[0]?.transcript ?? ''
				if (result?.isFinal) {
					session.speechFinal = appendSpeech(session.speechFinal, transcript)
				} else {
					interim += transcript
				}
			}
			session.speechProven = true
			this.ghost(session, appendSpeech(session.speechFinal, interim))
		}
		recognition.onerror = () => {
			if (session.speech === recognition && !session.speechProven)
				this.dropSpeech(session)
		}
		recognition.onend = () => {
			if (session.speech !== recognition) return
			// Chrome ends after a pause; keep it going while the recorder runs.
			if (session.speechProven && !session.stopRequested) {
				try {
					recognition.start()
				} catch {
					// it is gone; the server previews take over
					session.speech = null
					session.speechProven = false
				}
			}
		}
		try {
			recognition.start()
		} catch {
			return
		}
		session.speech = recognition
		session.timers.push(
			setTimeout(() => {
				if (session.speech === recognition && !session.speechProven)
					this.dropSpeech(session)
			}, DICTATION_SPEECH_PROVE_MS),
		)
	}

	private dropSpeech(session: Session) {
		const recognition = session.speech
		session.speech = null
		if (!recognition) return
		try {
			recognition.abort()
		} catch {
			// nothing to stop
		}
	}
}

function stopTracks(stream: MediaStream) {
	for (const track of stream.getTracks()) {
		try {
			track.stop()
		} catch {
			// already stopped
		}
	}
}

async function closeAudio(session: Session) {
	const audio = session.audio
	session.audio = null
	if (!audio?.close) return
	try {
		await audio.close()
	} catch {
		// already closed
	}
}

function createAudioContext(): AudioContextLike {
	const Ctor = browser().AudioContext ?? browser().webkitAudioContext
	if (!Ctor) throw new Error('No AudioContext')
	return new Ctor()
}

/** Blob bytes, through the promise API or FileReader on old engines. */
function readBlob(blob: Blob): Promise<ArrayBuffer> {
	if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as ArrayBuffer)
		reader.onerror = () => reject(reader.error)
		reader.readAsArrayBuffer(blob)
	})
}

/** decodeAudioData through its promise or its callbacks, whichever this engine has. */
function decode(
	audio: AudioContextLike,
	bytes: ArrayBuffer,
): Promise<AudioBuffer> {
	return new Promise((resolve, reject) => {
		try {
			const result = audio.decodeAudioData(bytes, resolve, reject)
			if (
				result &&
				typeof (result as Promise<AudioBuffer>).then === 'function'
			) {
				;(result as Promise<AudioBuffer>).then(resolve, reject)
			}
		} catch (error) {
			reject(error)
		}
	})
}

/**
 * Render to one channel at 16 kHz. An engine that refuses that rate gets
 * the next one; the WAV header carries whatever rate was used.
 */
async function renderMono(decoded: AudioBuffer): Promise<AudioBuffer> {
	const Ctor =
		browser().OfflineAudioContext ?? browser().webkitOfflineAudioContext
	if (!Ctor) throw new Error('No OfflineAudioContext')
	const rates = [DICTATION_SAMPLE_RATE, 22_050, decoded.sampleRate]
	let lastError: unknown = null
	for (const rate of rates) {
		try {
			const length = Math.max(1, Math.ceil(decoded.duration * rate))
			const context = new Ctor(1, length, rate)
			const source = context.createBufferSource()
			source.buffer = decoded
			source.connect(context.destination)
			source.start(0)
			return await startRendering(context)
		} catch (error) {
			lastError = error
		}
	}
	throw lastError ?? new Error('Could not render the audio')
}

function startRendering(context: OfflineContextLike): Promise<AudioBuffer> {
	return new Promise((resolve, reject) => {
		try {
			context.oncomplete = event => resolve(event.renderedBuffer)
			const result = context.startRendering()
			if (
				result &&
				typeof (result as Promise<AudioBuffer>).then === 'function'
			) {
				;(result as Promise<AudioBuffer>).then(resolve, reject)
			}
		} catch (error) {
			reject(error)
		}
	})
}

/**
 * POST one WAV clip. Resolves with the text (empty when the clip has no
 * words), rejects on any failure.
 */
async function postClip(
	wav: ArrayBuffer,
	final: boolean,
	timeoutMs: number,
): Promise<string> {
	const form = new FormData()
	form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'clip.wav')
	form.append('final', final ? 'true' : 'false')
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetch(TRANSCRIBE_ENDPOINT, {
			method: 'POST',
			body: form,
			credentials: 'same-origin',
			signal: controller.signal,
		})
		if (!response.ok) throw new Error(`transcribe ${response.status}`)
		const data = (await response.json()) as { text?: unknown }
		if (typeof data.text !== 'string') throw new Error('transcribe: no text')
		return data.text
	} finally {
		clearTimeout(timer)
	}
}

/* ------------------------------------------------------------------------ */
/* The hook                                                                  */
/* ------------------------------------------------------------------------ */

const noSubscribe = () => () => {}

function useDictationSupport(): 'unknown' | 'yes' | 'no' {
	return useSyncExternalStore(
		noSubscribe,
		() => (dictationSupported() ? 'yes' : 'no'),
		() => 'unknown',
	)
}

/**
 * Dictate into a box. `onInterim` gets the grey words (show them after the
 * committed text, then clear); `onFinal` gets the finished text once (append
 * it). `supported` is false where the browser cannot record; hide the
 * button then, the keyboard's own microphone still works.
 */
export function useDictation({
	onInterim,
	onFinal,
}: {
	onInterim: (text: string) => void
	onFinal: (text: string) => void
}): Dictation {
	const support = useDictationSupport()
	const [phase, setPhase] = useState<DictationPhase>('idle')
	const [note, setNote] = useState<DictationNoteState>(null)
	const onInterimRef = useRef(onInterim)
	const onFinalRef = useRef(onFinal)
	onInterimRef.current = onInterim
	onFinalRef.current = onFinal
	const controllerRef = useRef<DictationController | null>(null)
	if (!controllerRef.current) {
		controllerRef.current = new DictationController({
			setPhase,
			setNote,
			onInterim: text => onInterimRef.current(text),
			onFinal: text => onFinalRef.current(text),
		})
	}
	const controller = controllerRef.current

	useEffect(() => {
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') controller.stop()
		}
		document.addEventListener('visibilitychange', onVisibility)
		return () => document.removeEventListener('visibilitychange', onVisibility)
	}, [controller])

	useEffect(() => {
		controller.revive()
		return () => controller.dispose()
	}, [controller])

	const start = useCallback(() => controller.start(), [controller])
	const stop = useCallback(() => controller.stop(), [controller])

	return {
		supported: support === 'yes',
		checked: support !== 'unknown',
		listening: phase !== 'idle',
		phase,
		start,
		stop,
		note,
	}
}

/* ------------------------------------------------------------------------ */
/* The components                                                            */
/* ------------------------------------------------------------------------ */

/** The microphone button. Hidden where dictation is not supported. */
export function DictateButton({
	dictation,
	disabled,
	className,
}: {
	dictation: Dictation
	disabled?: boolean
	className?: string
}) {
	if (!dictation.supported) return null
	const { listening, phase } = dictation
	const busy = phase === 'finishing'
	return (
		<Button
			type="button"
			size="icon"
			variant={listening ? 'default' : 'outline'}
			aria-label={listening ? DICTATION_COPY.listening : DICTATION_COPY.dictate}
			aria-pressed={listening}
			disabled={disabled || busy}
			onClick={listening ? dictation.stop : dictation.start}
			className={cn(
				'relative shrink-0 rounded-full',
				listening && 'bg-red-600 text-white hover:bg-red-600/90',
				className,
			)}
		>
			{listening && !busy ? (
				<span
					aria-hidden
					className="absolute inset-0 animate-ping rounded-full bg-red-500/40"
				/>
			) : null}
			{busy ? (
				<Icon name="update" size="sm" className="animate-spin" />
			) : (
				<Icon name="microphone" size="sm" className="relative" />
			)}
		</Button>
	)
}

/**
 * The status line under a box: listening, finishing, the cap, an error, or
 * the keyboard hint where dictation is not supported.
 */
export function DictationNote({
	dictation,
	className,
}: {
	dictation: Dictation
	className?: string
}) {
	if (dictation.checked && !dictation.supported) {
		return (
			<p className={cn('text-xs text-muted-foreground', className)}>
				{DICTATION_COPY.keyboard}
			</p>
		)
	}
	const note = dictation.note
	if (!note) return null
	return (
		<p
			role={note.tone === 'error' ? 'alert' : 'status'}
			aria-live="polite"
			className={cn(
				'text-xs',
				note.tone === 'error'
					? 'text-red-700 dark:text-red-300'
					: 'text-muted-foreground',
				className,
			)}
		>
			{note.text}
		</p>
	)
}

export type GhostTextareaProps = Omit<
	TextareaHTMLAttributes<HTMLTextAreaElement>,
	'value' | 'onChange'
> & {
	value: string
	/** The grey words after the committed text. */
	ghost: string
	/** Read-only while true; the overlay shows. */
	listening?: boolean
	onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
	wrapperClassName?: string
}

/* The overlay mirrors the Textarea's box: same padding, border width and
   text size, so the words sit where the textarea's own words would. */
const OVERLAY_BASE =
	'min-h-[80px] w-full overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm'

/**
 * A textarea with ghost text. While `listening` or while `ghost` is
 * non-empty an overlay sits over the box: the committed text in the normal
 * colour, then the ghost text in grey. The box grows with the overlay. When
 * the overlay goes the caret returns to the end.
 */
export const GhostTextarea = forwardRef<
	HTMLTextAreaElement,
	GhostTextareaProps
>(function GhostTextarea(
	{
		value,
		ghost,
		listening = false,
		onChange,
		className,
		readOnly,
		wrapperClassName,
		...rest
	},
	ref,
) {
	const innerRef = useRef<HTMLTextAreaElement | null>(null)
	const overlayRef = useRef<HTMLDivElement | null>(null)
	const show = listening || ghost.length > 0
	const wasShowing = useRef(show)

	const setRefs = useCallback(
		(node: HTMLTextAreaElement | null) => {
			innerRef.current = node
			if (typeof ref === 'function') ref(node)
			else if (ref) ref.current = node
		},
		[ref],
	)

	// The newest grey words stay in view when the box has a fixed height.
	useEffect(() => {
		const overlay = overlayRef.current
		if (!overlay) return
		overlay.scrollTop = overlay.scrollHeight
	}, [ghost, value, show])

	// The overlay went: the caret goes to the end of the committed text.
	useEffect(() => {
		if (wasShowing.current && !show) {
			const box = innerRef.current
			if (box) {
				try {
					box.focus({ preventScroll: true })
					box.setSelectionRange(box.value.length, box.value.length)
				} catch {
					// not focusable right now
				}
			}
		}
		wasShowing.current = show
	}, [show])

	const joiner = value && ghost && !/\s$/.test(value) ? ' ' : ''
	return (
		<div className={cn('grid', wrapperClassName)}>
			<Textarea
				ref={setRefs}
				value={value}
				onChange={onChange}
				readOnly={readOnly || listening}
				aria-busy={listening || undefined}
				className={cn(
					'[grid-area:1/1]',
					show &&
						'text-transparent caret-transparent placeholder:text-transparent',
					className,
				)}
				{...rest}
			/>
			{show ? (
				<div
					ref={overlayRef}
					aria-hidden
					data-ghost-overlay
					className={cn(
						'pointer-events-none [grid-area:1/1]',
						OVERLAY_BASE,
						className,
					)}
				>
					<span data-ghost-committed className="text-foreground">
						{value}
					</span>
					<span data-ghost-text className="text-muted-foreground">
						{joiner}
						{ghost}
					</span>
				</div>
			) : null}
		</div>
	)
})
