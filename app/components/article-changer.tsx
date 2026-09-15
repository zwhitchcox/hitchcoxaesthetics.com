import { useBeforeUnload, useBlocker, useNavigation } from '@remix-run/react'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '#app/components/ui/tabs.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	ARTICLE_EDIT_CHIPS,
	appendSpeech,
	appendToPrompt,
} from '#app/utils/article-edit.ts'
import {
	countWords,
	missingLinks,
	type ArticleLink,
} from '#app/utils/articles.ts'

/**
 * "Change it": the working copy of an article with two ways to change it.
 *
 * Tab 1, "Tell it what to change" (default): dictate or type a request,
 * tap "Make these changes", and the server applies it (resources/article-edit).
 * Tab 2, "Edit the text myself": a plain textarea on the same working copy.
 * Below both: the preview, the links check, and the word count.
 *
 * Nothing here saves. Render it INSIDE a <Form method="post">: the component
 * puts the working copy in a hidden input named "body", so the parent's
 * Save edits / Approve buttons submit it. The parent form must post to its
 * own route (no action prop) so the unsaved-changes blocker stands down
 * for the submission and the redirect that follows it.
 */
export type ArticleChangerProps = {
	articleId: string
	/** The working copy to start from. Usually the same as savedBody. */
	initialBody: string
	/** The body stored on the server. "Unsaved" shows when the copy differs. */
	savedBody: string
	links: ArticleLink[]
	/** Verbatim claims from the "things to check" panel, offered as pills. */
	claims: string[]
	/** No-ai publisher: only the plain editor shows. */
	isReference: boolean
	kind: string
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
	unsaved: 'Unsaved',
	leaveQuestion: 'You have unsaved changes. Leave without saving?',
	leave: 'Leave without saving',
	stay: 'Stay',
	restore: 'Restore your unsaved edit',
	referenceNote:
		'This publisher takes only text you wrote yourself. Change the words below in your own way.',
} as const

const EDIT_ENDPOINT = '/resources/article-edit'

/* Web Speech API: typed locally, because the DOM lib does not ship it. */
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

/* A copy of the working copy in sessionStorage, so a reload can offer it back. */
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
function writeMirror(articleId: string, body: string, savedBody: string) {
	try {
		if (body === savedBody) window.sessionStorage.removeItem(mirrorKey(articleId))
		else window.sessionStorage.setItem(mirrorKey(articleId), body)
	} catch {
		// storage can be blocked; the beforeunload warning still stands
	}
}

function summaryLine(summary: string) {
	const second = summary.charAt(1)
	const lowered =
		second && second === second.toLowerCase()
			? summary.charAt(0).toLowerCase() + summary.slice(1)
			: summary
	return `Changed: ${lowered}`
}

export function ArticleChanger({
	articleId,
	initialBody,
	savedBody,
	links,
	claims,
	isReference,
	kind,
}: ArticleChangerProps) {
	const [body, setBody] = useState(initialBody)
	const [undoBody, setUndoBody] = useState<string | null>(null)
	const [summary, setSummary] = useState<string | null>(null)
	const [prompt, setPrompt] = useState('')
	const [running, setRunning] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [listening, setListening] = useState(false)
	const [interim, setInterim] = useState('')
	const [mirrorDismissed, setMirrorDismissed] = useState(false)
	const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
	const speechSupported = useSpeechSupported()
	const mirror = useSyncExternalStore(
		noSubscribe,
		() => readMirror(articleId),
		() => null,
	)

	const dirty = body !== savedBody
	const missing = missingLinks(body, links)
	const words = countWords(body)
	const offerRestore =
		!mirrorDismissed && mirror !== null && mirror !== body && mirror !== savedBody

	function updateBody(next: string) {
		setBody(next)
		writeMirror(articleId, next, savedBody)
	}

	/* Unsaved changes: warn on close or reload, and block in-app navigation.
	   The blocker stands down while the parent form submits, so Save and
	   Approve (and the redirect after Approve) pass. */
	const navigation = useNavigation()
	const submitting = navigation.state !== 'idle'
	useBeforeUnload(
		useCallback(
			(event: BeforeUnloadEvent) => {
				if (!dirty) return
				event.preventDefault()
				event.returnValue = ARTICLE_CHANGER_COPY.leaveQuestion
			},
			[dirty],
		),
	)
	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			dirty &&
			!submitting &&
			(currentLocation.pathname !== nextLocation.pathname ||
				currentLocation.search !== nextLocation.search),
	)

	function startListening() {
		const Ctor = speechRecognitionCtor()
		if (!Ctor || running) return
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
			if (finalText) setPrompt(current => appendSpeech(current, finalText))
			setInterim(interimText)
		}
		recognition.onend = () => {
			recognitionRef.current = null
			setListening(false)
			setInterim('')
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
	}

	function stopListening() {
		recognitionRef.current?.stop()
	}

	async function makeChanges() {
		const request = prompt.trim()
		if (!request || running) return
		stopListening()
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
			updateBody(data.markdown)
			setSummary(typeof data.summary === 'string' ? data.summary : '')
			setPrompt('')
		} catch {
			setError('Something went wrong. Check the connection and try again.')
		} finally {
			setRunning(false)
		}
	}

	function undoLastChange() {
		if (undoBody === null) return
		updateBody(undoBody)
		setUndoBody(null)
		setSummary(null)
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
				{speechSupported ? (
					<Button
						type="button"
						variant={listening ? 'secondary' : 'outline'}
						disabled={running}
						aria-pressed={listening}
						onClick={listening ? stopListening : startListening}
					>
						{listening ? ARTICLE_CHANGER_COPY.listening : ARTICLE_CHANGER_COPY.dictate}
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
		</div>
	)

	const editPanel = (
		<div>
			<label htmlFor="article-change-body" className="sr-only">
				Article text
			</label>
			<p className="mb-1 text-xs text-muted-foreground">
				Plain text with simple marks: a line starting with ## is a heading,
				*this* is italic, **this** is bold, and [words](https://...) is a link.
			</p>
			<Textarea
				id="article-change-body"
				value={body}
				onChange={e => updateBody(e.currentTarget.value)}
				className="min-h-[50vh] font-mono text-base leading-relaxed"
			/>
		</div>
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
							if (mirror !== null) updateBody(mirror)
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

			<div className="grid gap-4 lg:grid-cols-2">
				<div>
					{isReference ? (
						<div className="space-y-3">
							<p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
								{ARTICLE_CHANGER_COPY.referenceNote}
							</p>
							{editPanel}
						</div>
					) : (
						<Tabs defaultValue="prompt">
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="prompt">
									{ARTICLE_CHANGER_COPY.promptTab}
								</TabsTrigger>
								<TabsTrigger value="edit">{ARTICLE_CHANGER_COPY.editTab}</TabsTrigger>
							</TabsList>
							<TabsContent value="prompt">{promptPanel}</TabsContent>
							<TabsContent value="edit">{editPanel}</TabsContent>
						</Tabs>
					)}
				</div>

				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-medium">How it reads</p>
						<span className="text-xs text-muted-foreground">{words} words</span>
						{dirty ? (
							<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
								{ARTICLE_CHANGER_COPY.unsaved}
							</span>
						) : null}
					</div>
					<p className="text-xs text-muted-foreground">
						{kind === 'blog'
							? 'This is how it will read on your blog. It updates as the text changes.'
							: 'This is how it will read on the publisher’s site. It updates as the text changes.'}
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

					<div className="rounded-md border bg-background p-4">
						<MarkdownContent
							content={body}
							className="prose max-w-none dark:prose-invert"
						/>
					</div>
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
