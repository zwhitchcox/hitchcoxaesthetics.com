import { useBeforeUnload, useBlocker, useNavigation, useSubmit } from '@remix-run/react'
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
import { PassageFix, type PassageApplied } from '#app/components/passage-fix.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '#app/components/ui/tabs.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	ARTICLE_EDIT_CHIPS,
	ARTICLE_SAVE_KEEPALIVE_MAX_BYTES,
	appendSpeech,
	appendToPrompt,
	firstDiffRange,
	saveArticleBody,
} from '#app/utils/article-edit.ts'
import {
	articleImageResolver,
	type ArticleImageRef,
} from '#app/utils/article-images.ts'
import {
	countWords,
	missingLinks,
	type ArticleLink,
} from '#app/utils/articles.ts'
import { splitParagraphs } from '#app/utils/review-aid.ts'
import { reviewProsePlugin, type ProseRange } from '#app/utils/review-prose.ts'

/**
 * "Change it": the working copy of an article with three ways to change it.
 *
 * Tab 1, "Tell it what to change" (default): dictate or type a request,
 * tap "Make these changes", and the server applies it (resources/article-edit).
 * Tab 2, "Edit the text myself": a plain textarea on the same working copy.
 * The preview: select a passage and tap "Change this" (PassageFix).
 *
 * Every change saves itself (resources/article-save): an AI change at
 * once, a typed change 1.5 s after the last keystroke and on blur. There
 * is no Save button. A quiet mark says "Saving…" or "Saved". The parent
 * form still gets the working copy in a hidden input named "body", so
 * Approve submits what she sees. Render it INSIDE a <Form method="post">
 * that posts to its own route, and give the form `useSubmitAfterSave` so
 * Approve waits for a save in flight.
 */
export type ArticleChangerProps = {
	articleId: string
	/** The working copy to start from: the stored body. */
	initialBody: string
	/** hashBody(initialBody). Every save carries the hash it started from. */
	savedHash: string
	links: ArticleLink[]
	/** Verbatim claims from the "things to check" panel, offered as pills. */
	claims: string[]
	/** No-ai publisher: only the plain editor shows. */
	isReference: boolean
	kind: string
	/** The stored pictures, so the preview shows them in place. */
	images?: ReadonlyArray<ArticleImageRef>
	/** A decided article: read only, no prompt tab, no auto-save. */
	readOnly?: boolean
	/** After every successful save. */
	onSaved?: (hash: string, body: string) => void
	/** The parent sets this to wait for a save before it submits (Approve). */
	flushRef?: React.MutableRefObject<(() => Promise<void>) | null>
}

export const ARTICLE_CHANGER_COPY = {
	promptTab: 'Tell it what to change',
	editTab: 'Edit the text myself',
	placeholder:
		'Say or type what to change. For example: make the second paragraph shorter, and say we offer Dysport too.',
	dictate: 'Dictate',
	listening: 'Listening… tap to stop',
	make: 'Make these changes',
	working: 'Working on it…',
	undo: 'Undo that',
	saved: 'Saved',
	saving: 'Saving…',
	saveFailed: 'Could not save. Trying again…',
	tryNow: 'Try now',
	conflict: 'The writer sent new text while you were editing.',
	useTheirs: 'Use the new text',
	keepMine: 'Keep mine',
	decided: 'This one is already decided. Reopen it first.',
	changeThis: 'Change this',
	whatsWrong: 'What’s wrong with this?',
	passagePlaceholder: 'What should change here? Say or type it.',
	makeChange: 'Make this change',
	usually: 'Usually 10 to 20 seconds.',
	more: 'More',
	showWhere: 'Show me where it is',
	networkError: 'Something went wrong. Check the connection and try again.',
	leaveQuestion: 'Your last change is still saving. Leave anyway?',
	leave: 'Leave',
	stay: 'Stay',
	restore: 'Restore your unsaved edit',
	referenceNote:
		'This publisher takes only text you wrote yourself. Change the words below in your own way.',
	editorHint:
		'Plain text with simple marks: a line starting with ## is a heading, *this* is italic, **this** is bold, and [words](https://...) is a link. A line that starts with ![ is a picture, and the italic line under it is its caption. Leave both where they are.',
} as const

const EDIT_ENDPOINT = '/resources/article-edit'
/** A typed change saves this long after the last keystroke. */
export const AUTO_SAVE_DEBOUNCE_MS = 1500
/** One retry after a failed save, this long later. */
export const AUTO_SAVE_RETRY_MS = 3000
/** Approve waits at most this long for a save in flight. */
export const AUTO_SAVE_WAIT_MS = 3000
/** The green "changed" mark stays this long. */
const CHANGED_MARK_MS = 6000

/* ------------------------------------------------------------------------ */
/* Dictation (Web Speech API)                                               */
/* ------------------------------------------------------------------------ */

/* Typed locally, because the DOM lib does not ship it. */
type SpeechAlternativeLike = { transcript: string }
type SpeechResultLike = {
	isFinal: boolean
	length: number
	[index: number]: SpeechAlternativeLike
}
type SpeechEventLike = {
	resultIndex: number
	results: { length: number; [index: number]: SpeechResultLike }
}
type SpeechRecognitionLike = {
	continuous: boolean
	interimResults: boolean
	lang: string
	onresult: ((event: SpeechEventLike) => void) | null
	onend: (() => void) | null
	onerror: ((event: { error?: string }) => void) | null
	start: () => void
	stop: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
	if (typeof window === 'undefined') return null
	const w = window as unknown as {
		SpeechRecognition?: SpeechRecognitionCtor
		webkitSpeechRecognition?: SpeechRecognitionCtor
	}
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const noSubscribe = () => () => {}

/** false on the server and during hydration, so the markup matches. */
function useSpeechSupported() {
	return useSyncExternalStore(
		noSubscribe,
		() => speechRecognitionCtor() !== null,
		() => false,
	)
}

/**
 * Dictate into a box. `onFinal` gets each finished piece (append it);
 * `onInterim` gets the words still being recognised (show them, then
 * clear). `supported` is false where the browser has no speech API; hide
 * the button then, the keyboard's own microphone still works.
 */
export function useDictation({
	onFinal,
	onInterim,
}: {
	onFinal: (text: string) => void
	onInterim: (text: string) => void
}) {
	const supported = useSpeechSupported()
	const [listening, setListening] = useState(false)
	const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
	const onFinalRef = useRef(onFinal)
	const onInterimRef = useRef(onInterim)
	onFinalRef.current = onFinal
	onInterimRef.current = onInterim

	const stop = useCallback(() => {
		recognitionRef.current?.stop()
	}, [])

	const start = useCallback(() => {
		const Ctor = speechRecognitionCtor()
		if (!Ctor || recognitionRef.current) return
		const recognition = new Ctor()
		recognition.continuous = true
		recognition.interimResults = true
		recognition.lang = 'en-US'
		recognition.onresult = event => {
			let finalText = ''
			let interimText = ''
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i]
				const transcript = result?.[0]?.transcript ?? ''
				if (result?.isFinal) finalText += transcript
				else interimText += transcript
			}
			if (finalText) onFinalRef.current(finalText)
			onInterimRef.current(interimText)
		}
		recognition.onend = () => {
			recognitionRef.current = null
			setListening(false)
			onInterimRef.current('')
		}
		recognition.onerror = () => {
			// onend follows every error; nothing else to do
		}
		recognitionRef.current = recognition
		try {
			recognition.start()
			setListening(true)
		} catch {
			recognitionRef.current = null
		}
	}, [])

	useEffect(() => stop, [stop])

	return { supported, listening, start, stop }
}

/* ------------------------------------------------------------------------ */
/* Auto-save                                                                */
/* ------------------------------------------------------------------------ */

export type SaveStatus =
	/** Nothing changed this visit. No mark. */
	| 'clean'
	| 'saved'
	/** A typed change waits for the debounce. */
	| 'pending'
	| 'saving'
	/** The last save failed. One retry is scheduled, then Try now. */
	| 'error'
	/** The writer's text moved on. Her copy waits for Use the new text / Keep mine. */
	| 'conflict'

export type SaveConflict = { body: string; hash: string }

/**
 * Save the working copy without a button. `schedule(body)` for a typed
 * change (debounced), `saveNow(body, 'ai')` for an AI change, `flush()`
 * before Approve. One save in flight at a time; a change during a flight
 * runs one more save after it. A 409 `changed` never loses her copy: it
 * stays in `conflict` until `keepMine()` or `useTheirs()`.
 */
export function useAutoSave({
	articleId,
	initialBody,
	savedHash,
	enabled = true,
	onSaved,
}: {
	articleId: string
	initialBody: string
	savedHash: string
	enabled?: boolean
	onSaved?: (hash: string, body: string) => void
}) {
	const [status, setStatus] = useState<SaveStatus>('clean')
	const [hash, setHash] = useState(savedHash)
	const [conflict, setConflict] = useState<SaveConflict | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const hashRef = useRef(savedHash)
	const lastSavedRef = useRef(initialBody)
	const everSavedRef = useRef(false)
	const pendingRef = useRef<{ body: string; source: 'auto' | 'ai' } | null>(null)
	const inFlightRef = useRef<Promise<void> | null>(null)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const retriedRef = useRef(false)
	const conflictRef = useRef<SaveConflict | null>(null)
	const onSavedRef = useRef(onSaved)
	onSavedRef.current = onSaved

	const clearTimer = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = null
	}, [])

	const settle = useCallback((body: string, nextHash: string) => {
		lastSavedRef.current = body
		hashRef.current = nextHash
		everSavedRef.current = true
		retriedRef.current = false
		conflictRef.current = null
		if (pendingRef.current?.body === body) pendingRef.current = null
		setHash(nextHash)
		setConflict(null)
		setMessage(null)
		setStatus('saved')
	}, [])

	const run = useCallback(
		(keepalive = false): Promise<void> => {
			if (!enabled) return Promise.resolve()
			if (inFlightRef.current) return inFlightRef.current
			if (conflictRef.current) return Promise.resolve()
			const pending = pendingRef.current
			if (!pending || pending.body === lastSavedRef.current) {
				if (pending) pendingRef.current = null
				setStatus(current =>
					current === 'pending' || current === 'error'
						? everSavedRef.current
							? 'saved'
							: 'clean'
						: current,
				)
				return Promise.resolve()
			}
			const useKeepalive =
				keepalive && new Blob([pending.body]).size <= ARTICLE_SAVE_KEEPALIVE_MAX_BYTES
			setStatus('saving')
			const flight = (async () => {
				const result = await saveArticleBody(
					{
						articleId,
						body: pending.body,
						baseHash: hashRef.current,
						source: pending.source,
					},
					{ keepalive: useKeepalive },
				)
				inFlightRef.current = null
				if (result.ok) {
					settle(pending.body, result.hash)
					onSavedRef.current?.(result.hash, pending.body)
					// a change that arrived during the flight
					if (pendingRef.current && pendingRef.current.body !== pending.body) {
						void run()
					}
					return
				}
				if (result.kind === 'changed') {
					const found = { body: result.body, hash: result.hash }
					conflictRef.current = found
					setConflict(found)
					setStatus('conflict')
					return
				}
				if (result.kind === 'decided') {
					retriedRef.current = true
					setMessage(ARTICLE_CHANGER_COPY.decided)
					setStatus('error')
					return
				}
				setMessage(null)
				setStatus('error')
				if (!retriedRef.current) {
					retriedRef.current = true
					retryRef.current = setTimeout(() => {
						retryRef.current = null
						void run()
					}, AUTO_SAVE_RETRY_MS)
				}
			})()
			inFlightRef.current = flight
			return flight
		},
		[articleId, enabled, settle],
	)

	/** A typed change: save after the debounce. */
	const schedule = useCallback(
		(body: string) => {
			if (!enabled) return
			pendingRef.current = { body, source: 'auto' }
			clearTimer()
			if (conflictRef.current) return
			if (body === lastSavedRef.current) {
				setStatus(current =>
					current === 'saving' ? current : everSavedRef.current ? 'saved' : 'clean',
				)
				return
			}
			setStatus(current => (current === 'saving' ? current : 'pending'))
			timerRef.current = setTimeout(() => {
				timerRef.current = null
				void run()
			}, AUTO_SAVE_DEBOUNCE_MS)
		},
		[clearTimer, enabled, run],
	)

	/** An AI change (or Undo that): save at once. */
	const saveNow = useCallback(
		(body: string, source: 'auto' | 'ai' = 'ai') => {
			if (!enabled) return Promise.resolve()
			pendingRef.current = { body, source }
			clearTimer()
			return run()
		},
		[clearTimer, enabled, run],
	)

	/** Cancel the debounce, save what waits, and wait for the flight (bounded). */
	const flush = useCallback(
		async (keepalive = false, waitMs = AUTO_SAVE_WAIT_MS) => {
			clearTimer()
			const flight = run(keepalive)
			await Promise.race([
				flight,
				new Promise<void>(resolve => setTimeout(resolve, waitMs)),
			])
		},
		[clearTimer, run],
	)

	/** Another component saved this text already (PassageFix). */
	const markSaved = useCallback(
		(body: string, nextHash: string) => {
			clearTimer()
			pendingRef.current = null
			settle(body, nextHash)
		},
		[clearTimer, settle],
	)

	/** "Keep mine": save her copy over the writer's new text. */
	const keepMine = useCallback(() => {
		const found = conflictRef.current
		if (!found) return
		hashRef.current = found.hash
		setHash(found.hash)
		conflictRef.current = null
		setConflict(null)
		void run()
	}, [run])

	/** "Use the new text": drop her copy. Returns the writer's text to show. */
	const useTheirs = useCallback((): string | null => {
		const found = conflictRef.current
		if (!found) return null
		markSaved(found.body, found.hash)
		return found.body
	}, [markSaved])

	const tryNow = useCallback(() => {
		if (retryRef.current) clearTimeout(retryRef.current)
		retryRef.current = null
		void run()
	}, [run])

	// Save before the page goes away. The mirror covers a payload too big
	// for keepalive.
	useEffect(() => {
		if (!enabled) return
		const onHidden = () => {
			if (document.visibilityState === 'hidden') void flush(true, 0)
		}
		const onPageHide = () => void flush(true, 0)
		document.addEventListener('visibilitychange', onHidden)
		window.addEventListener('pagehide', onPageHide)
		return () => {
			document.removeEventListener('visibilitychange', onHidden)
			window.removeEventListener('pagehide', onPageHide)
			clearTimer()
			if (retryRef.current) clearTimeout(retryRef.current)
		}
	}, [enabled, flush, clearTimer])

	/** A save is still owed (or her copy waits on a conflict): block leaving. */
	const busy =
		status === 'pending' ||
		status === 'saving' ||
		status === 'error' ||
		status === 'conflict'

	return {
		status,
		hash,
		conflict,
		message,
		busy,
		schedule,
		saveNow,
		flush,
		markSaved,
		keepMine,
		useTheirs,
		tryNow,
	}
}

/**
 * An onSubmit for the parent <Form>: wait for a save in flight, then
 * submit with the button that was pressed. Approve then carries the text
 * she sees, byte for byte.
 */
export function useSubmitAfterSave(
	flushRef: React.MutableRefObject<(() => Promise<void>) | null>,
) {
	const submit = useSubmit()
	return useCallback(
		async (event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault()
			const form = event.currentTarget
			const submitter = (event.nativeEvent as SubmitEvent).submitter
			const data = new FormData(form)
			if (submitter instanceof HTMLButtonElement && submitter.name) {
				data.set(submitter.name, submitter.value)
			}
			await flushRef.current?.()
			submit(data, { method: 'post' })
		},
		[flushRef, submit],
	)
}

/** The quiet mark: "Saving…", "Saved", or the retry line. Never a button. */
export function SaveIndicator({
	status,
	message,
	onTryNow,
}: {
	status: SaveStatus
	message: string | null
	onTryNow: () => void
}) {
	if (status === 'saving' || status === 'pending') {
		return (
			<span className="text-xs text-muted-foreground" aria-live="polite">
				{ARTICLE_CHANGER_COPY.saving}
			</span>
		)
	}
	if (status === 'saved') {
		return (
			<span
				className="inline-flex items-center gap-1 text-xs text-muted-foreground"
				aria-live="polite"
			>
				<Icon name="check" className="h-3.5 w-3.5" />
				{ARTICLE_CHANGER_COPY.saved}
			</span>
		)
	}
	if (status === 'error') {
		return (
			<span
				className="inline-flex items-center gap-2 text-xs text-red-700 dark:text-red-400"
				aria-live="polite"
			>
				{message ?? ARTICLE_CHANGER_COPY.saveFailed}
				{message ? null : (
					<button
						type="button"
						onClick={onTryNow}
						className="underline underline-offset-2"
					>
						{ARTICLE_CHANGER_COPY.tryNow}
					</button>
				)}
			</span>
		)
	}
	return null
}

/* ------------------------------------------------------------------------ */
/* Mirror: a copy of an unsaved working copy in sessionStorage             */
/* ------------------------------------------------------------------------ */

function mirrorKey(articleId: string) {
	return `article-changer:${articleId}`
}
function readMirror(articleId: string): string | null {
	try {
		return window.sessionStorage.getItem(mirrorKey(articleId))
	} catch {
		return null
	}
}
function writeMirror(articleId: string, body: string | null) {
	try {
		if (body === null) window.sessionStorage.removeItem(mirrorKey(articleId))
		else window.sessionStorage.setItem(mirrorKey(articleId), body)
	} catch {
		// storage can be blocked; the beforeunload warning still stands
	}
}

export function summaryLine(summary: string) {
	const second = summary.charAt(1)
	const lowered =
		second && second === second.toLowerCase()
			? summary.charAt(0).toLowerCase() + summary.slice(1)
			: summary
	return `Changed: ${lowered}`
}

/* ------------------------------------------------------------------------ */
/* The component                                                            */
/* ------------------------------------------------------------------------ */

export function ArticleChanger({
	articleId,
	initialBody,
	savedHash,
	links,
	claims,
	isReference,
	kind,
	images = [],
	readOnly = false,
	onSaved,
	flushRef,
}: ArticleChangerProps) {
	const [body, setBody] = useState(initialBody)
	const [undoBody, setUndoBody] = useState<string | null>(null)
	const [summary, setSummary] = useState<string | null>(null)
	const [changed, setChanged] = useState<{ start: number; end: number } | null>(null)
	const [prompt, setPrompt] = useState('')
	const [running, setRunning] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [interim, setInterim] = useState('')
	const [mirrorDismissed, setMirrorDismissed] = useState(false)
	const previewRef = useRef<HTMLDivElement>(null)
	const mirror = useSyncExternalStore(
		noSubscribe,
		() => readMirror(articleId),
		() => null,
	)
	const dictation = useDictation({
		onFinal: text => setPrompt(current => appendSpeech(current, text)),
		onInterim: setInterim,
	})
	const autoSave = useAutoSave({
		articleId,
		initialBody,
		savedHash,
		enabled: !readOnly,
		onSaved,
	})

	if (flushRef) flushRef.current = () => autoSave.flush()

	const missing = missingLinks(body, links)
	const words = countWords(body)
	const offerRestore =
		!readOnly &&
		!mirrorDismissed &&
		mirror !== null &&
		mirror !== body &&
		mirror !== initialBody
	const resolveImage = useMemo(() => articleImageResolver(images), [images])
	const previewPlugins = useMemo(() => {
		if (!changed) return undefined
		const ranges: ProseRange[] = [{ ...changed, index: 0, kind: 'changed' }]
		return [reviewProsePlugin({ paragraphs: splitParagraphs(body), ranges })]
	}, [body, changed])

	// The mirror holds a copy while a save is owed or a conflict waits.
	useEffect(() => {
		if (readOnly) return
		const owed =
			autoSave.status === 'pending' ||
			autoSave.status === 'error' ||
			autoSave.status === 'conflict'
		writeMirror(articleId, owed ? body : null)
	}, [articleId, body, autoSave.status, readOnly])

	// The green mark fades on its own.
	useEffect(() => {
		if (!changed) return
		const timer = setTimeout(() => setChanged(null), CHANGED_MARK_MS)
		return () => clearTimeout(timer)
	}, [changed])

	/** A typed change. */
	function updateBody(next: string) {
		setBody(next)
		autoSave.schedule(next)
	}

	/** An AI change, an undo, or a restore: save at once. */
	function applyBody(next: string, source: 'auto' | 'ai' = 'ai') {
		setBody(next)
		void autoSave.saveNow(next, source)
	}

	/* Leaving is blocked only while a save is owed. The blocker stands down
	   while the parent form submits, so Approve and its redirect pass. */
	const navigation = useNavigation()
	const submitting = navigation.state !== 'idle'
	const owed = !readOnly && autoSave.busy
	useBeforeUnload(
		useCallback(
			(event: BeforeUnloadEvent) => {
				if (!owed) return
				event.preventDefault()
				event.returnValue = ARTICLE_CHANGER_COPY.leaveQuestion
			},
			[owed],
		),
	)
	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			owed &&
			!submitting &&
			(currentLocation.pathname !== nextLocation.pathname ||
				currentLocation.search !== nextLocation.search),
	)

	// The save that blocked the navigation has landed: go on without asking.
	useEffect(() => {
		if (blocker.state === 'blocked' && !owed) blocker.proceed()
	}, [blocker, owed])

	async function makeChanges() {
		const request = prompt.trim()
		if (!request || running) return
		dictation.stop()
		setRunning(true)
		setError(null)
		try {
			const response = await fetch(EDIT_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ articleId, prompt: request, markdown: body, links }),
			})
			const data = (await response.json().catch(() => null)) as {
				markdown?: unknown
				summary?: unknown
				error?: unknown
			} | null
			if (!response.ok || typeof data?.markdown !== 'string') {
				setError(
					typeof data?.error === 'string'
						? data.error
						: 'Something went wrong. Try again in a moment.',
				)
				return
			}
			setUndoBody(body)
			setChanged(firstDiffRange(body, data.markdown))
			applyBody(data.markdown)
			setSummary(typeof data.summary === 'string' ? data.summary : '')
			setPrompt('')
		} catch {
			setError(ARTICLE_CHANGER_COPY.networkError)
		} finally {
			setRunning(false)
		}
	}

	function undoLastChange() {
		if (undoBody === null) return
		applyBody(undoBody)
		setUndoBody(null)
		setSummary(null)
		setChanged(null)
	}

	/** "Change this" on the preview saved already; take the result. */
	function onPassageApplied(applied: PassageApplied) {
		if (applied.summary !== null) {
			setUndoBody(body)
			setSummary(applied.summary)
		} else {
			setUndoBody(null)
			setSummary(null)
		}
		setChanged(applied.changed)
		setBody(applied.body)
		autoSave.markSaved(applied.body, applied.savedHash)
		onSaved?.(applied.savedHash, applied.body)
	}

	function useNewText() {
		const theirs = autoSave.useTheirs()
		if (theirs !== null) {
			setBody(theirs)
			setUndoBody(null)
			setSummary(null)
			setChanged(null)
		}
	}

	const promptPanel = (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-2">
				{ARTICLE_EDIT_CHIPS.map(chip => (
					<button
						key={chip}
						type="button"
						disabled={running}
						onClick={() => setPrompt(current => appendToPrompt(current, chip))}
						className="rounded-full border bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
					>
						{chip}
					</button>
				))}
			</div>

			{claims.length > 0 ? (
				<div>
					<p className="text-xs text-muted-foreground">
						Tap a claim to put it in the box.
					</p>
					<div className="mt-1 flex flex-wrap gap-2">
						{claims.map(quote => (
							<button
								key={quote}
								type="button"
								disabled={running}
								title={quote}
								onClick={() =>
									setPrompt(current => appendToPrompt(current, `"${quote}"`))
								}
								className="line-clamp-2 max-w-full rounded-md border border-dashed bg-background px-2 py-1 text-left text-xs leading-snug hover:bg-accent disabled:opacity-50"
							>
								“{quote}”
							</button>
						))}
					</div>
				</div>
			) : null}

			<div>
				<label htmlFor="article-change-prompt" className="sr-only">
					What to change
				</label>
				<Textarea
					id="article-change-prompt"
					value={prompt}
					readOnly={running}
					aria-busy={running}
					onChange={e => setPrompt(e.currentTarget.value)}
					placeholder={ARTICLE_CHANGER_COPY.placeholder}
					className="min-h-[7rem] text-base"
				/>
				{interim ? (
					<p aria-live="polite" className="mt-1 text-sm italic text-muted-foreground">
						{interim}…
					</p>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{dictation.supported ? (
					<Button
						type="button"
						variant={dictation.listening ? 'secondary' : 'outline'}
						disabled={running}
						aria-pressed={dictation.listening}
						onClick={dictation.listening ? dictation.stop : dictation.start}
					>
						{dictation.listening
							? ARTICLE_CHANGER_COPY.listening
							: ARTICLE_CHANGER_COPY.dictate}
					</Button>
				) : null}
				<Button
					type="button"
					disabled={running || !prompt.trim()}
					onClick={makeChanges}
				>
					{running ? ARTICLE_CHANGER_COPY.working : ARTICLE_CHANGER_COPY.make}
				</Button>
			</div>

			{error ? (
				<p
					role="alert"
					className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
				>
					{error}
				</p>
			) : null}
		</div>
	)

	const editPanel = (
		<div>
			<label htmlFor="article-change-body" className="sr-only">
				Article text
			</label>
			<p className="mb-1 text-xs text-muted-foreground">
				{ARTICLE_CHANGER_COPY.editorHint}
			</p>
			<Textarea
				id="article-change-body"
				value={body}
				readOnly={readOnly}
				onChange={e => updateBody(e.currentTarget.value)}
				onBlur={() => {
					if (!readOnly) void autoSave.flush(false, 0)
				}}
				className="min-h-[50vh] font-mono text-base leading-relaxed"
			/>
		</div>
	)

	const indicator = readOnly ? null : (
		<SaveIndicator
			status={autoSave.status}
			message={autoSave.message}
			onTryNow={autoSave.tryNow}
		/>
	)

	return (
		<div className="space-y-4">
			<input type="hidden" name="body" value={body} />

			{offerRestore ? (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
					<p className="flex-1">You changed this text before and did not save it.</p>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => {
							if (mirror !== null) applyBody(mirror, 'auto')
							setMirrorDismissed(true)
						}}
					>
						{ARTICLE_CHANGER_COPY.restore}
					</Button>
					<button
						type="button"
						onClick={() => setMirrorDismissed(true)}
						className="text-sm underline underline-offset-2"
					>
						Forget it
					</button>
				</div>
			) : null}

			{autoSave.conflict ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
				>
					<p className="flex-1">{ARTICLE_CHANGER_COPY.conflict}</p>
					<Button type="button" size="sm" variant="outline" onClick={useNewText}>
						{ARTICLE_CHANGER_COPY.useTheirs}
					</Button>
					<Button type="button" size="sm" onClick={autoSave.keepMine}>
						{ARTICLE_CHANGER_COPY.keepMine}
					</Button>
				</div>
			) : null}

			{summary !== null ? (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-green-300 bg-green-50 p-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
					<p className="flex-1">{summaryLine(summary)}</p>
					{undoBody !== null ? (
						<button
							type="button"
							onClick={undoLastChange}
							className="text-sm font-medium underline underline-offset-2"
						>
							{ARTICLE_CHANGER_COPY.undo}
						</button>
					) : null}
				</div>
			) : null}

			<div className="grid gap-4 lg:grid-cols-2">
				<div>
					{isReference || readOnly ? (
						<div className="space-y-3">
							{isReference ? (
								<p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
									{ARTICLE_CHANGER_COPY.referenceNote}
								</p>
							) : null}
							{indicator ? <div className="flex justify-end">{indicator}</div> : null}
							{editPanel}
						</div>
					) : (
						<Tabs defaultValue="prompt">
							<div className="flex items-center gap-3">
								<TabsList className="grid min-w-0 flex-1 grid-cols-2">
									<TabsTrigger value="prompt">
										{ARTICLE_CHANGER_COPY.promptTab}
									</TabsTrigger>
									<TabsTrigger value="edit">
										{ARTICLE_CHANGER_COPY.editTab}
									</TabsTrigger>
								</TabsList>
								<span className="shrink-0">{indicator}</span>
							</div>
							<TabsContent value="prompt">{promptPanel}</TabsContent>
							<TabsContent value="edit">{editPanel}</TabsContent>
						</Tabs>
					)}
				</div>

				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-medium">How it reads</p>
						<span className="text-xs text-muted-foreground">{words} words</span>
					</div>
					<p className="text-xs text-muted-foreground">
						{kind === 'blog'
							? 'This is how it will read on your blog. It updates as the text changes.'
							: 'This is how it will read on the publisher’s site. It updates as the text changes.'}
						{!readOnly && !isReference
							? ' Select a few words to change just that part.'
							: ''}
					</p>

					{links.length > 0 ? (
						<div className="rounded-md border p-3 text-sm">
							<p className="font-medium">Links that must stay in the article</p>
							<ul className="mt-1 space-y-1">
								{links.map(l => {
									const gone = missing.some(m => m.url === l.url)
									return (
										<li
											key={l.url}
											className={
												gone
													? 'text-red-700 dark:text-red-400'
													: 'text-muted-foreground'
											}
										>
											{gone ? 'Missing: ' : 'In place: '}
											{l.name} ({l.url})
										</li>
									)
								})}
							</ul>
							{missing.length > 0 ? (
								<p className="mt-2 text-xs text-muted-foreground">
									You can move a link to another sentence. If it is gone, the
									placement loses its purpose.
								</p>
							) : null}
						</div>
					) : null}

					<div ref={previewRef} className="rounded-md border bg-background p-4">
						<MarkdownContent
							content={body}
							className="prose max-w-none dark:prose-invert [&_.review-changed]:rounded-sm [&_.review-changed]:bg-green-200 [&_.review-changed]:px-0.5 [&_.review-changed]:text-inherit dark:[&_.review-changed]:bg-green-800"
							remarkPlugins={previewPlugins}
							resolveImageSrc={resolveImage}
						/>
					</div>
					<PassageFix
						articleId={articleId}
						body={body}
						savedHash={autoSave.hash}
						links={links}
						containerRef={previewRef}
						active={!readOnly && !isReference}
						disabled={
							running || autoSave.status === 'saving' || autoSave.conflict !== null
						}
						request={null}
						onApplied={onPassageApplied}
					/>
				</div>
			</div>

			{blocker.state === 'blocked' ? (
				<div
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="article-changer-leave"
					className="fixed inset-x-0 bottom-0 z-50 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
				>
					<p id="article-changer-leave" className="text-sm font-medium">
						{ARTICLE_CHANGER_COPY.leaveQuestion}
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<Button type="button" variant="outline" onClick={() => blocker.reset()}>
							{ARTICLE_CHANGER_COPY.stay}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => blocker.proceed()}
						>
							{ARTICLE_CHANGER_COPY.leave}
						</Button>
					</div>
				</div>
			) : null}
		</div>
	)
}
