import { useBeforeUnload, useBlocker } from '@remix-run/react'
import { type EditorView } from 'prosemirror-view'
import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useHydrated } from 'remix-utils/use-hydrated'
import {
	ARTICLE_CHAT_COPY,
	ChatComposer,
	ChatList,
	type ChatEntry,
	type ComposerPayload,
} from '#app/components/article-chat.tsx'
import {
	DropZone,
	useArticleAttachment,
} from '#app/components/article-attachments.tsx'
import {
	ChatDock,
	ChatLauncher,
	ChatPopup,
	ChatSheet,
	StatusLine,
} from '#app/components/chat-shell.tsx'
import { useDictation } from '#app/components/dictation.tsx'
import {
	BubbleMenu,
	canLink,
	FormatRow,
} from '#app/components/editor-toolbar.tsx'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
import {
	PROSE_CLASS,
	RichEditor,
	type EditorSelection,
} from '#app/components/rich-editor.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	ARTICLE_CHAT_ENDPOINT,
	type ChatMessageJson,
} from '#app/utils/article-chat.ts'
import { appendSpeech } from '#app/utils/article-edit.ts'
import {
	articleImageResolver,
	articleImageUrl,
	zoomTarget,
	type ArticleImageRef,
	type ZoomTarget,
} from '#app/utils/article-images.ts'
import { runCommand, type EditorCommand } from '#app/utils/article-markdown.ts'
import {
	countWords,
	missingLinks,
	REFERENCE_NOTE,
	type ArticleLink,
} from '#app/utils/articles.ts'
import {
	isOwed,
	readMirror,
	useAutoSave,
	useFormSubmitting,
	writeMirror,
	type SaveStatus,
} from '#app/utils/auto-save.ts'
import { cn } from '#app/utils/misc.tsx'
import { findHighlightRanges, splitParagraphs } from '#app/utils/review-aid.ts'
import { reviewProsePlugin, type ProseRange } from '#app/utils/review-prose.ts'
import { useKeyboardInset, useMeasuredHeight } from '#app/utils/viewport.ts'

/**
 * The article editor: the article is the screen, edited in place; the chat
 * folds away.
 *
 * One markdown string, `body`, is the working copy. The rich editor
 * serialises every change into it, and the Markdown toggle shows the same
 * string in a textarea. A chat answer, Undo, "Use the new text" and a
 * restored draft all set `body`; the rich editor re-parses it. A hidden
 * input named `body` carries it, so the parent <Form> (Approve) submits
 * what she sees. Render it inside a <Form method="post"> whose onSubmit is
 * `useSubmitAfterSave(flushRef)`.
 *
 * Phone: a fixed dock at the bottom holds the status line, the format row
 * (while the caret is in the article) and the composer, with the save mark
 * at the end of its row; a tab on the dock's top edge opens the
 * conversation as a sheet. Desktop (lg): a launcher bottom-right opens it
 * as a popup. Every piece of chat state lives here; the shell components
 * (chat-shell.tsx) only place it.
 *
 * The Markdown toggle, and the save mark when no dock holds it, go into the
 * route's bar through `barSlot` (a portal), so the editor has no bar of its
 * own.
 */
export type ArticleEditorProps = {
	article: {
		id: string
		kind: string
		title: string
		where: string
		byline: string
		about: string
		body: string
		savedHash: string
		isReference: boolean
	}
	images: ReadonlyArray<
		ArticleImageRef & { altText?: string | null; caption?: string | null }
	>
	links: ArticleLink[]
	/** plainQuote of the aid's claims and credentials: inert highlights. */
	claims: string[]
	/** The stored conversation, oldest first. */
	history: ChatMessageJson[]
	/** From ?quote=: attached on mount, then dropped from the URL. */
	initialQuote?: string | null
	/** A decided row on the admin page: the article reads, nothing saves. */
	readOnly?: boolean
	/** The title and the where · byline · about line above the article. */
	showHeader?: boolean
	/** px: the page's sticky top bar; the phone sheet starts under it, and the See it band and the bubble stay clear of it. */
	stickyTop?: number
	/** px: the page's sticky bottom bar; the dock, the launcher and the popup sit above it. */
	stickyBottom?: number
	flushRef?: React.MutableRefObject<(() => Promise<void>) | null>
	/** True while a chat turn runs (Approve disables). */
	onBusyChange?: (busy: boolean) => void
	/**
	 * The route's bar element for the Markdown toggle and, when no dock holds
	 * it, the save mark: the items render into it through a portal. `null`
	 * while the route has no element yet (the server render): nothing
	 * renders. Undefined (no route, the unit tests): a plain right-aligned
	 * row at the top of the editor holds them.
	 */
	barSlot?: HTMLElement | null
	/** The unit tests type through the rich editor's view. */
	editorViewRef?: React.MutableRefObject<EditorView | null>
}

export const ARTICLE_EDITOR_COPY = {
	markdown: 'Markdown',
	saved: 'Saved',
	saving: 'Saving…',
	saveFailed: 'Could not save.',
	tryNow: 'Try now',
	conflict: 'The writer sent new text while you were editing.',
	useTheirs: 'Use the new text',
	keepMine: 'Keep mine',
	conflictAbove: 'The writer sent new text. Choose above.',
	conflictBelow: 'The writer sent new text. Choose below.',
	leaveQuestion: 'Your last change is still saving. Leave anyway?',
	leaveNotSaved: 'Your last change did not save. Leave anyway?',
	leaveConflict:
		"The writer's new text is waiting for your choice. Leave anyway?",
	leave: 'Leave',
	stay: 'Stay',
	restoreQuestion: 'You changed this text before and did not save it.',
	restore: 'Restore your unsaved edit',
	forget: 'Forget it',
	referenceNote: REFERENCE_NOTE,
	editorHint:
		'Plain text with simple marks: a line starting with ## is a heading, *this* is italic, **this** is bold, and [words](https://...) is a link. A line that starts with ![ is a picture, and the italic line under it is its caption. Leave both where they are.',
	textLabel: 'Article text',
	linksTitle: 'Links that must stay in the article',
	inPlace: 'In place: ',
	missing: 'Missing: ',
	linksNote:
		'You can move a link to another sentence. If it is gone, the placement loses its purpose.',
	words: (n: number) => `${n} words`,
	endLine: 'That is all of it.',
	close: 'Close',
} as const

/** The green "changed" mark stays this long. */
const CHANGED_MARK_MS = 6000
/** A chat turn ends here: a little above the server's 60 s limit, so a hung turn frees the article. */
const CHAT_TIMEOUT_MS = 90_000

/**
 * The entry the status line shows for the unseen rows: the last turn's
 * change (with See it and Undo) or its error before a trailing note such
 * as "Done."; an answer when the turn changed nothing. A turn = the rows
 * after the last user row.
 */
function lastTurnStatus(unseen: ReadonlyArray<ChatEntry>): ChatEntry | null {
	let start = 0
	for (let i = unseen.length - 1; i >= 0; i--) {
		if (unseen[i]?.role === 'user') {
			start = i + 1
			break
		}
	}
	const turn = unseen.slice(start).filter(e => e.role !== 'user')
	for (let i = turn.length - 1; i >= 0; i--) {
		const e = turn[i]
		if (e && (e.role === 'change' || e.role === 'error')) return e
	}
	return turn.at(-1) ?? null
}
/** The space between the last line of the page and the phone dock. */
const DOCK_GAP_PX = 16
/** The article and what sits under it: centred, about 70 characters wide. */
const COLUMN_CLASS = 'mx-auto w-full max-w-[70ch]'
/** The desktop popup's width and margins: the article re-centres beside it while the popup is open. */
const POPUP_ASIDE_CLASS = 'lg:pr-[26rem]'
const WIDE_QUERY = '(min-width: 1024px)'
const KEYBOARD_QUERY = '(hover: hover) and (pointer: fine)'

const AMBER_NOTE =
	'rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
const AMBER_CARD = cn('flex flex-wrap items-center gap-2', AMBER_NOTE)

/* ------------------------------------------------------------------------ */
/* Media queries                                                            */
/* ------------------------------------------------------------------------ */

function mediaSubscribe(query: string) {
	return (onChange: () => void) => {
		if (
			typeof window === 'undefined' ||
			typeof window.matchMedia !== 'function'
		) {
			return () => {}
		}
		const list = window.matchMedia(query)
		list.addEventListener('change', onChange)
		return () => list.removeEventListener('change', onChange)
	}
}

function mediaNow(query: string) {
	return () =>
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia(query).matches
}

const wideSubscribe = mediaSubscribe(WIDE_QUERY)
const wideNow = mediaNow(WIDE_QUERY)
const keyboardSubscribe = mediaSubscribe(KEYBOARD_QUERY)
const keyboardNow = mediaNow(KEYBOARD_QUERY)
const serverFalse = () => false

/** True at lg and wider: the popup and the bubble. False on the server and in jsdom: the dock and the sheet. */
function useWide() {
	return useSyncExternalStore(wideSubscribe, wideNow, serverFalse)
}

/** A physical keyboard: Enter sends. */
function useEnterSends() {
	return useSyncExternalStore(keyboardSubscribe, keyboardNow, serverFalse)
}

/* ------------------------------------------------------------------------ */
/* The save mark                                                            */
/* ------------------------------------------------------------------------ */

export type SaveStateName = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

/** The save status as the mark shows it: `pending` and `saving` are one spinner, `clean` is nothing. */
export function saveStateName(status: SaveStatus): SaveStateName {
	if (status === 'clean') return 'idle'
	if (status === 'pending') return 'saving'
	return status
}

/**
 * The small save mark: a spinner while a save waits or is in flight, a
 * check after it (until the next change), the retry line, or where the
 * conflict's choice is. `data-save-state` carries the state for the tests.
 * It ends the phone dock's composer row; elsewhere it goes into the route's
 * bar slot. One live region in every state, so a change in it is read out.
 */
function SaveState({
	status,
	message,
	conflictNote,
	onTryNow,
}: {
	status: SaveStatus
	message: string | null
	/** Shown while a conflict waits: where its two buttons are. */
	conflictNote: string
	onTryNow: () => void
}) {
	const state = saveStateName(status)
	return (
		<span
			role="status"
			data-save-state={state}
			className="inline-flex h-10 min-w-6 shrink-0 items-center justify-center text-xs text-muted-foreground"
		>
			{state === 'saving' ? (
				<>
					<Icon name="update" size="sm" className="animate-spin" />
					<span className="sr-only">{ARTICLE_EDITOR_COPY.saving}</span>
				</>
			) : state === 'saved' ? (
				<>
					<Icon name="check" size="sm" />
					<span className="sr-only">{ARTICLE_EDITOR_COPY.saved}</span>
				</>
			) : state === 'error' ? (
				<span className="max-w-24 text-right leading-tight text-red-700 dark:text-red-400">
					{message ?? ARTICLE_EDITOR_COPY.saveFailed}
					{message ? null : (
						<>
							{' '}
							<button
								type="button"
								onClick={onTryNow}
								className="underline underline-offset-2"
							>
								{ARTICLE_EDITOR_COPY.tryNow}
							</button>
						</>
					)}
				</span>
			) : state === 'conflict' ? (
				<span className="text-amber-800 dark:text-amber-200">
					{conflictNote}
				</span>
			) : null}
		</span>
	)
}

/* ------------------------------------------------------------------------ */
/* The article, as it reads                                                 */
/* ------------------------------------------------------------------------ */

/** The rendered article: the server render, the first client render, and a decided row. */
const ArticleView = memo(function ArticleView({
	images,
	body,
	claims,
	proseRef,
	onProseClick,
}: {
	images: ReadonlyArray<ArticleImageRef>
	body: string
	claims: ReadonlyArray<string>
	proseRef: React.RefObject<HTMLDivElement>
	onProseClick: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
	const resolveImage = useMemo(() => articleImageResolver(images), [images])
	const plugins = useMemo(() => {
		const ranges: ProseRange[] = findHighlightRanges(body, claims).map(r => ({
			start: r.start,
			end: r.end,
			index: r.index,
			kind: 'claim',
		}))
		return [reviewProsePlugin({ paragraphs: splitParagraphs(body), ranges })]
	}, [body, claims])
	return (
		<div ref={proseRef} role="presentation" onClick={onProseClick}>
			<MarkdownContent
				content={body}
				className={PROSE_CLASS}
				remarkPlugins={plugins}
				resolveImageSrc={resolveImage}
			/>
		</div>
	)
})

/* ------------------------------------------------------------------------ */
/* The editor                                                               */
/* ------------------------------------------------------------------------ */

type Undo = {
	prevBody: string
	/** The change row that carries Undo. */
	rowId: string | null
	/** A picture change: the new picture to scroll to. */
	pictureSrc: string | null
}

const noSubscribe = () => () => {}

export function ArticleEditor({
	article,
	images,
	links,
	claims,
	history,
	initialQuote = null,
	readOnly = false,
	showHeader = true,
	stickyTop = 0,
	stickyBottom = 0,
	flushRef,
	onBusyChange,
	barSlot,
	editorViewRef,
}: ArticleEditorProps) {
	const articleId = article.id
	const isReference = article.isReference
	const wide = useWide()
	const hydrated = useHydrated()
	const enterSends = useEnterSends()

	/* ---- the working copy ---- */

	const [body, setBody] = useState(article.body)
	const bodyRef = useRef(body)
	bodyRef.current = body
	const autoSave = useAutoSave({
		articleId,
		initialBody: article.body,
		savedHash: article.savedHash,
		enabled: !readOnly,
	})
	if (flushRef) {
		flushRef.current = async () => {
			await autoSave.flush()
		}
	}

	/* ---- the views ---- */

	const [raw, setRaw] = useState(false)
	const [selection, setSelection] = useState<EditorSelection | null>(null)
	const [editorFocused, setEditorFocused] = useState(false)
	const [linkOpen, setLinkOpen] = useState(false)
	const ownViewRef = useRef<EditorView | null>(null)
	const viewRef = editorViewRef ?? ownViewRef
	const proseRef = useRef<HTMLDivElement>(null)
	const bubbleBoxRef = useRef<HTMLDivElement>(null)

	/* ---- the chat ---- */

	const [entries, setEntries] = useState<ChatEntry[]>(() => [...history])
	const entriesRef = useRef(entries)
	entriesRef.current = entries
	const [composerText, setComposerText] = useState('')
	const [ghost, setGhost] = useState('')
	const [quote, setQuote] = useState<string | null>(null)
	const [running, setRunning] = useState(false)
	const runningRef = useRef(false)
	const [decidedNow, setDecidedNow] = useState(false)
	const [undo, setUndo] = useState<Undo | null>(null)
	const [undoneIds, setUndoneIds] = useState<Set<string>>(() => new Set())
	const [undoBusy, setUndoBusy] = useState(false)
	/** The body before the chat's change: the green mark is the diff against it. */
	const [changed, setChanged] = useState<{ from: string } | null>(null)
	const [seeIt, setSeeIt] = useState(0)
	const [extraImages, setExtraImages] = useState<ArticleImageRef[]>([])
	const [zoom, setZoom] = useState<ZoomTarget | null>(null)
	/** Her open or close; null until she chooses. */
	const [chatOpenChoice, setChatOpenChoice] = useState<boolean | null>(null)
	/** The rows she has seen, by id: the stored history, then whatever was there when she last opened or closed the chat. By id, because a failed turn drops rows. */
	const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(
		() => new Set(history.map(row => row.id)),
	)
	const localIdRef = useRef(0)
	const boxRef = useRef<HTMLTextAreaElement>(null)
	const dockRef = useRef<HTMLDivElement>(null)

	/** Sending is possible. */
	const chatOn = !readOnly && !isReference && !decidedNow
	/** The dock, the sheet, the launcher and the popup render at all. */
	const chatSurface = !isReference
	// The desktop opens on a quote hand-off; the phone shows the quote in the dock.
	const chatOpen =
		chatSurface && (chatOpenChoice ?? (wide && initialQuote != null))
	const unseenRows = entries.filter(e => !seenIds.has(e.id))
	const statusEntry = lastTurnStatus(unseenRows)
	/** The answers that wait unseen: the launcher's dot. An error row is not one. */
	const answers = unseenRows.filter(
		e => e.role === 'assistant' || e.role === 'change',
	)
	/** The article takes no input while a chat turn runs: the answer lands on the text it was built on. */
	const locked = running
	const keyboardInset = useKeyboardInset(!wide)
	const dockHeight = useMeasuredHeight(dockRef)

	const openChat = useCallback(() => {
		flushSync(() => {
			setChatOpenChoice(true)
			setSeenIds(new Set(entriesRef.current.map(e => e.id)))
		})
		// The popup mounts with its box: focus it in the same gesture. The
		// phone keeps the keyboard down; its composer is in the dock.
		if (wide) boxRef.current?.focus()
	}, [wide])
	const closeChat = useCallback(() => {
		setChatOpenChoice(false)
		setSeenIds(new Set(entriesRef.current.map(e => e.id)))
	}, [])

	const dictation = useDictation({
		onInterim: setGhost,
		onFinal: text => {
			setGhost('')
			setComposerText(current => appendSpeech(current, text))
		},
	})
	const attachment = useArticleAttachment({
		articleId,
		disabled: !chatOn || running,
	})

	// A picture uploaded this visit: the resolver must know its file name.
	const readyImage =
		attachment.status === 'ready' ? attachment.attachment : null
	useEffect(() => {
		if (!readyImage || !readyImage.id || !readyImage.fileName) return
		setExtraImages(current =>
			current.some(im => im.id === readyImage.id)
				? current
				: [
						...current,
						{
							id: readyImage.id,
							fileName: readyImage.fileName,
							position: 1000 + current.length,
							width: readyImage.width,
							height: readyImage.height,
						},
					],
		)
	}, [readyImage])
	const allImages = useMemo(
		() => (extraImages.length ? [...images, ...extraImages] : images),
		[images, extraImages],
	)

	useEffect(() => {
		onBusyChange?.(running)
	}, [running, onBusyChange])

	/* ---- the mirror and the leave guard ---- */

	const [mirrorDismissed, setMirrorDismissed] = useState(false)
	const mirror = useSyncExternalStore(
		noSubscribe,
		() => readMirror(articleId),
		() => null,
	)
	const offerRestore =
		!readOnly &&
		!mirrorDismissed &&
		mirror !== null &&
		mirror !== body &&
		mirror !== article.body
	useEffect(() => {
		if (readOnly) return
		const owed =
			autoSave.status === 'pending' ||
			autoSave.status === 'error' ||
			autoSave.status === 'conflict'
		writeMirror(articleId, owed ? body : null)
	}, [articleId, body, autoSave.status, readOnly])

	const submitting = useFormSubmitting()
	const owed = !readOnly && isOwed(autoSave.status)
	/** What the leave dialog asks: the save that is still owed, in its state. */
	const leaveQuestion =
		autoSave.status === 'error'
			? ARTICLE_EDITOR_COPY.leaveNotSaved
			: autoSave.status === 'conflict'
				? ARTICLE_EDITOR_COPY.leaveConflict
				: ARTICLE_EDITOR_COPY.leaveQuestion
	useBeforeUnload(
		useCallback(
			(event: BeforeUnloadEvent) => {
				if (!owed) return
				event.preventDefault()
				event.returnValue = leaveQuestion
			},
			[owed, leaveQuestion],
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

	/* ---- the working copy: typed, applied, restored ---- */

	/**
	 * A typed change, in the article or under the Markdown toggle. Ignored
	 * while a chat turn runs: the answer replaces the text the model was
	 * given, so a change typed in between would be lost.
	 */
	function updateBody(next: string) {
		if (runningRef.current) return
		setBody(next)
		autoSave.schedule(next)
	}

	function restoreMirror() {
		if (mirror !== null) {
			setBody(mirror)
			void autoSave.saveNow(mirror, 'auto')
		}
		setMirrorDismissed(true)
	}

	function useNewText() {
		const theirs = autoSave.useTheirs()
		if (theirs !== null) {
			setBody(theirs)
			setUndo(null)
			setChanged(null)
		}
	}

	// The green mark fades on its own.
	useEffect(() => {
		if (!changed) return
		const timer = setTimeout(() => setChanged(null), CHANGED_MARK_MS)
		return () => clearTimeout(timer)
	}, [changed])

	/* ---- the quote from a selection ---- */

	const onPickQuote = useCallback(
		(text: string) => {
			setQuote(text)
			if (wide) {
				openChat()
				const list = document.querySelector('[data-chat-list]')
				if (list) list.scrollTop = list.scrollHeight
			} else {
				// In the same gesture, so iOS opens the keyboard when it can.
				boxRef.current?.focus()
			}
		},
		[wide, openChat],
	)

	// ?quote= from the reading page: attach once, then drop it from the URL.
	const initialQuoteRef = useRef(initialQuote)
	useEffect(() => {
		const text = initialQuoteRef.current
		if (!text || !chatOn) return
		initialQuoteRef.current = null
		setQuote(text)
		boxRef.current?.focus()
		try {
			window.history.replaceState(
				window.history.state,
				'',
				window.location.pathname,
			)
		} catch {
			// a sandboxed frame: the quote is still attached
		}
	}, [chatOn])

	/* ---- the article: zoom and the green mark ---- */

	const onProseClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			const hit = zoomTarget(event.target)
			if (hit) setZoom(hit)
		},
		[],
	)
	const zoomedImage = zoom
		? images.find(im => articleImageUrl(im.id) === zoom.src)
		: undefined

	/**
	 * The mark or the new picture scrolls into the readable band: under the
	 * page's sticky top bar, above the dock or the page's bottom bar, inside
	 * the visual viewport (the software keyboard shrinks it). When an answer
	 * lands it scrolls only when the mark is outside that band; See it always
	 * scrolls, to the middle of the band.
	 */
	const seeItDoneRef = useRef(seeIt)
	useEffect(() => {
		const forced = seeIt !== seeItDoneRef.current
		seeItDoneRef.current = seeIt
		if (!changed && !undo?.pictureSrc) return
		// One frame later: on the phone the sheet leaves the page in a
		// re-render after this effect, so measure the mark once it is gone.
		const frame = requestAnimationFrame(() => {
			const container = proseRef.current
			if (!container) return
			const target =
				container.querySelector<HTMLElement>('mark.review-changed') ??
				(undo?.pictureSrc
					? container.querySelector<HTMLElement>(
							`img[src="${undo.pictureSrc}"]`,
						)
					: null)
			if (!target) return
			const vv = window.visualViewport
			const visualTop = vv?.offsetTop ?? 0
			const visualBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
			const dock = dockRef.current?.getBoundingClientRect()
			const bandTop = Math.max(visualTop, stickyTop)
			const bandBottom = dock
				? Math.min(visualBottom, dock.top)
				: visualBottom - stickyBottom
			const rect = target.getBoundingClientRect()
			if (!forced && rect.top >= bandTop && rect.bottom <= bandBottom) return
			window.scrollBy({
				top: (rect.top + rect.bottom) / 2 - (bandTop + bandBottom) / 2,
				behavior: 'smooth',
			})
		})
		return () => cancelAnimationFrame(frame)
	}, [changed, seeIt, undo, stickyTop, stickyBottom])

	function onSeeIt() {
		// The box lets go of the focus first: the keyboard closes and the mark can land mid-screen.
		if (document.activeElement === boxRef.current) boxRef.current?.blur()
		if (undo) setChanged({ from: undo.prevBody })
		if (!wide && chatOpen) closeChat()
		setSeeIt(n => n + 1)
	}

	/* ---- the send ---- */

	function pushEntry(entry: ChatEntry) {
		setEntries(list => [...list, entry])
	}
	function pushError(text: string, retry: ComposerPayload) {
		pushEntry({
			id: `local-${++localIdRef.current}`,
			role: 'error',
			text,
			retry,
		})
	}
	function dropEntry(id: string) {
		setEntries(list => list.filter(e => e.id !== id))
	}

	async function send(payload?: ComposerPayload) {
		if (runningRef.current || !chatOn) return
		const text = (payload?.text ?? composerText).trim()
		const quoteToSend = payload ? payload.quote : quote
		const imageId = payload
			? payload.imageId
			: attachment.status === 'ready'
				? (attachment.attachment?.id ?? null)
				: null
		if (!text && !imageId && !quoteToSend) return
		dictation.stop()
		runningRef.current = true
		setRunning(true)
		const sent: ComposerPayload = { text, quote: quoteToSend, imageId }
		setEntries(list => list.filter(e => e.role !== 'error'))
		try {
			const { owed: stillOwed, hash } = await autoSave.flush()
			if (stillOwed) {
				pushError(ARTICLE_CHAT_COPY.notSaved, sent)
				return
			}
			const localId = `local-${++localIdRef.current}`
			pushEntry({
				id: localId,
				role: 'user',
				text,
				quote: quoteToSend,
				imageId,
				imageUrl: imageId ? articleImageUrl(imageId) : null,
				toolName: null,
				createdAt: new Date().toISOString(),
				pending: true,
			})
			let response: Response
			try {
				response = await fetch(ARTICLE_CHAT_ENDPOINT, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
					body: JSON.stringify({
						articleId,
						text,
						...(quoteToSend ? { quote: quoteToSend } : {}),
						...(imageId ? { imageId } : {}),
						baseHash: hash,
					}),
					// A hung turn ends here: the error row shows and the article opens again.
					signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
				})
			} catch {
				dropEntry(localId)
				pushError(ARTICLE_CHAT_COPY.network, sent)
				return
			}
			const data = (await response.json().catch(() => null)) as {
				messages?: unknown
				body?: unknown
				hash?: unknown
				changed?: unknown
				error?: unknown
			} | null
			if (
				response.ok &&
				data &&
				Array.isArray(data.messages) &&
				typeof data.body === 'string' &&
				typeof data.hash === 'string'
			) {
				const rows = data.messages as ChatMessageJson[]
				setEntries(list => [...list.filter(e => e.id !== localId), ...rows])
				const changeRows = rows.filter(r => r.role === 'change')
				if (data.changed === true) {
					const prevBody = bodyRef.current
					const nextBody = data.body
					const pictureRow = changeRows.find(
						r => r.toolName === 'replace_picture',
					)
					setBody(nextBody)
					autoSave.markSaved(nextBody, data.hash)
					setUndo({
						prevBody,
						rowId: changeRows.at(-1)?.id ?? null,
						pictureSrc: pictureRow?.imageUrl ?? null,
					})
					// A picture change has no text to mark: See it scrolls to the picture.
					setChanged(pictureRow ? null : { from: prevBody })
				}
				setComposerText('')
				setGhost('')
				setQuote(null)
				// A picture with no change yet stays attached: her next message answers the question.
				if (!(imageId && changeRows.length === 0)) attachment.remove()
				return
			}
			dropEntry(localId)
			if (
				response.status === 409 &&
				data?.error === 'changed' &&
				typeof data.body === 'string' &&
				typeof data.hash === 'string'
			) {
				autoSave.raiseConflict(
					{ body: data.body, hash: data.hash },
					bodyRef.current,
				)
				pushEntry({
					id: `local-${++localIdRef.current}`,
					role: 'assistant',
					text: ARTICLE_CHAT_COPY.conflictLine,
					quote: null,
					imageId: null,
					imageUrl: null,
					toolName: null,
					createdAt: new Date().toISOString(),
				})
				return
			}
			if (response.status === 409 && data?.error === 'decided') {
				setDecidedNow(true)
				pushError(ARTICLE_CHAT_COPY.decided, sent)
				return
			}
			const copy =
				response.status === 429
					? ARTICLE_CHAT_COPY.tooMany
					: response.status === 503
						? ARTICLE_CHAT_COPY.notSetUp
						: response.status === 502
							? ARTICLE_CHAT_COPY.noAnswer
							: response.status === 504
								? ARTICLE_CHAT_COPY.tooLong
								: typeof data?.error === 'string'
									? data.error
									: ARTICLE_CHAT_COPY.noAnswer
			pushError(copy, sent)
		} finally {
			runningRef.current = false
			setRunning(false)
		}
	}

	async function undoChange() {
		if (!undo || undoBusy || readOnly || runningRef.current) return
		setUndoBusy(true)
		const { prevBody, rowId } = undo
		setBody(prevBody)
		setChanged(null)
		const outcome = await autoSave.saveNow(prevBody, 'ai')
		setUndoBusy(false)
		if (outcome === 'saved' || outcome === 'same') {
			if (rowId) setUndoneIds(ids => new Set(ids).add(rowId))
			setUndo(null)
			return
		}
		if (outcome === 'decided') {
			setDecidedNow(true)
			setUndo(null)
		}
		// 'changed': the conflict card shows; 'error': the save mark shows the retry.
	}

	/* ---- derived ---- */

	const missing = missingLinks(body, links)
	const words = countWords(body)
	const composerNote =
		readOnly || decidedNow
			? ARTICLE_CHAT_COPY.decidedComposer
			: autoSave.conflict
				? ARTICLE_CHAT_COPY.conflictComposer
				: null
	const canSend =
		chatOn &&
		!running &&
		!autoSave.conflict &&
		!dictation.listening &&
		attachment.status !== 'uploading' &&
		(composerText.trim().length > 0 ||
			attachment.status === 'ready' ||
			quote !== null)
	const richOn = hydrated && !readOnly && !raw
	const formatRowOn =
		richOn && !locked && !chatOpen && (editorFocused || linkOpen)
	const dockOn = !wide && (chatSurface || formatRowOn)
	/**
	 * The phone's chat lives in the dock: the composer row with the save mark
	 * at its end, and the conflict card above them so the choice is on
	 * screen. Elsewhere the card is in flow above the article and the save
	 * mark goes into the route's bar.
	 */
	const chatInDock = !wide && chatSurface
	const conflictCard = autoSave.conflict ? (
		<div
			role="alert"
			className={cn(AMBER_CARD, chatInDock ? 'mx-3 mt-2' : 'mt-2')}
		>
			<p className="flex-1">{ARTICLE_EDITOR_COPY.conflict}</p>
			<Button type="button" size="sm" variant="outline" onClick={useNewText}>
				{ARTICLE_EDITOR_COPY.useTheirs}
			</Button>
			<Button type="button" size="sm" onClick={autoSave.keepMine}>
				{ARTICLE_EDITOR_COPY.keepMine}
			</Button>
		</div>
	) : null

	function toggleRaw() {
		setRaw(current => !current)
		// The rich editor unmounts or remounts: what it reported is stale.
		setEditorFocused(false)
		setLinkOpen(false)
		setSelection(null)
	}

	// The card is above the mark in the dock, and in flow above the desktop's
	// bottom bar; only a narrow page's top bar (an own-words row) has it below.
	const saveState = readOnly ? null : (
		<SaveState
			status={autoSave.status}
			message={autoSave.message}
			conflictNote={
				chatInDock || wide
					? ARTICLE_EDITOR_COPY.conflictAbove
					: ARTICLE_EDITOR_COPY.conflictBelow
			}
			onTryNow={autoSave.tryNow}
		/>
	)
	const markdownToggle = (
		<button
			type="button"
			aria-pressed={raw}
			onClick={toggleRaw}
			className={cn(
				'inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent',
				raw ? 'bg-accent text-foreground' : '',
			)}
		>
			<Icon name="file-text" className="h-4 w-4" />
			{ARTICLE_EDITOR_COPY.markdown}
		</button>
	)
	const barItems = (
		<>
			{chatInDock ? null : saveState}
			{markdownToggle}
		</>
	)
	const bar =
		barSlot === undefined ? (
			<div className="flex items-center justify-end gap-2">{barItems}</div>
		) : barSlot === null ? null : (
			createPortal(barItems, barSlot)
		)

	function onCommand(command: EditorCommand) {
		const view = viewRef.current
		if (view) runCommand(command, view)
	}
	// `view` is read at render: the rich editor mounts it before any focus
	// or selection can reach the toolbar, and clears it as it unmounts.
	const toolbarProps = {
		selection,
		onCommand,
		onLink: () => setLinkOpen(true),
		comment: chatOn ? onPickQuote : null,
		linkOpen,
		onLinkDone: () => setLinkOpen(false),
		view: viewRef.current,
		locked,
	}

	const markdownPanel = (
		<div className="flex flex-col">
			<label htmlFor="article-editor-body" className="sr-only">
				{ARTICLE_EDITOR_COPY.textLabel}
			</label>
			<p className="mb-1 text-xs text-muted-foreground">
				{ARTICLE_EDITOR_COPY.editorHint}
			</p>
			<Textarea
				id="article-editor-body"
				value={body}
				readOnly={readOnly || running}
				aria-busy={running}
				onChange={e => updateBody(e.currentTarget.value)}
				onBlur={() => {
					if (!readOnly) void autoSave.flush(false, 0)
				}}
				className="min-h-[60vh] font-mono text-base leading-relaxed"
			/>
		</div>
	)

	const articleBlock = raw ? (
		markdownPanel
	) : readOnly || !hydrated ? (
		<ArticleView
			images={allImages}
			body={body}
			claims={claims}
			proseRef={proseRef}
			onProseClick={onProseClick}
		/>
	) : (
		<div
			ref={bubbleBoxRef}
			role="presentation"
			onClick={onProseClick}
			className="relative"
		>
			<RichEditor
				ref={proseRef}
				body={body}
				images={allImages}
				claims={claims}
				changedFrom={changed?.from ?? null}
				locked={locked}
				scrollMargin={wide ? 0 : dockHeight}
				onChange={updateBody}
				onBlur={() => void autoSave.flush(false, 0)}
				onFocusChange={setEditorFocused}
				onSelection={setSelection}
				onImageFile={file => {
					attachment.pickFile(file)
					if (wide) openChat()
				}}
				onLinkShortcut={() => {
					if (canLink(selection)) setLinkOpen(true)
				}}
				editorViewRef={viewRef}
			/>
			{wide ? (
				<BubbleMenu
					{...toolbarProps}
					wrapper={bubbleBoxRef.current}
					minTop={stickyTop}
				/>
			) : null}
		</div>
	)

	const listProps = {
		entries,
		running,
		undoRowId: undo?.rowId ?? null,
		undoneIds,
		undoBusy,
		onSeeIt,
		onUndo: () => void undoChange(),
		onRetry: (payload: ComposerPayload) => void send(payload),
		onZoom: (src: string, alt: string) => setZoom({ src, alt }),
	}
	const composerProps = {
		text: composerText,
		ghost,
		onTextChange: setComposerText,
		quote,
		onRemoveQuote: () => setQuote(null),
		attachment,
		dictation,
		running,
		note: composerNote,
		canSend,
		onSend: () => void send(),
		enterSends,
		boxRef,
	}
	const dock = dockOn ? (
		<ChatDock
			ref={dockRef}
			keyboardInset={keyboardInset}
			chat={
				chatSurface
					? { open: chatOpen, onOpen: openChat, onClose: closeChat }
					: undefined
			}
		>
			{chatInDock ? conflictCard : null}
			{chatOn && !chatOpen ? (
				<StatusLine
					running={running}
					entry={statusEntry}
					undoRowId={undo?.rowId ?? null}
					undoneIds={undoneIds}
					undoBusy={undoBusy}
					onOpen={openChat}
					onSeeIt={onSeeIt}
					onUndo={() => void undoChange()}
					onRetry={payload => void send(payload)}
				/>
			) : null}
			{formatRowOn ? <FormatRow {...toolbarProps} /> : null}
			{!chatSurface ? null : composerNote ? (
				// The note takes the composer's place; the save mark keeps the row's end.
				<div className="flex items-center gap-2 pr-3">
					<div className="min-w-0 flex-1">
						<ChatComposer {...composerProps} className="space-y-2 px-3 pt-2" />
					</div>
					{saveState}
				</div>
			) : (
				<ChatComposer
					{...composerProps}
					className="space-y-2 px-3 pt-2"
					trailing={saveState}
				/>
			)}
		</ChatDock>
	) : null

	const sheet =
		!wide && chatOpen ? (
			<ChatSheet
				stickyTop={stickyTop}
				keyboardInset={keyboardInset}
				dockHeight={dockHeight}
				onClose={closeChat}
			>
				<ChatList
					{...listProps}
					className="min-h-0 flex-1 overscroll-contain px-4 pb-7"
				/>
			</ChatSheet>
		) : null

	const corner =
		wide && chatSurface ? (
			chatOpen ? (
				<ChatPopup onClose={closeChat}>
					<ChatList {...listProps} className="min-h-0 flex-1 px-3" />
					<ChatComposer
						{...composerProps}
						className="space-y-2 border-t px-3 pb-3 pt-2"
					/>
				</ChatPopup>
			) : (
				<ChatLauncher unseenCount={answers.length} onOpen={openChat} />
			)
		) : null

	return (
		<div
			data-article-editor=""
			style={
				{
					'--editor-top': `${stickyTop}px`,
					'--editor-bottom': `${stickyBottom}px`,
					// The last lines and the links box end above the dock.
					paddingBottom: wide ? undefined : dockHeight + DOCK_GAP_PX,
				} as React.CSSProperties
			}
		>
			<input type="hidden" name="body" value={body} />

			<DropZone
				enabled={wide && chatOn}
				onPick={file => {
					attachment.pickFile(file)
					openChat()
				}}
			>
				{bar}

				{isReference ? (
					<p className={cn(AMBER_NOTE, 'mt-2')}>
						{ARTICLE_EDITOR_COPY.referenceNote}
					</p>
				) : null}

				{offerRestore ? (
					<div className={cn(AMBER_CARD, 'mt-2')}>
						<p className="flex-1">{ARTICLE_EDITOR_COPY.restoreQuestion}</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={restoreMirror}
						>
							{ARTICLE_EDITOR_COPY.restore}
						</Button>
						<button
							type="button"
							onClick={() => setMirrorDismissed(true)}
							className="text-sm underline underline-offset-2"
						>
							{ARTICLE_EDITOR_COPY.forget}
						</button>
					</div>
				) : null}

				{chatInDock ? null : conflictCard}

				<div className={wide && chatOpen ? POPUP_ASIDE_CLASS : undefined}>
					{showHeader ? (
						<header className={cn(COLUMN_CLASS, 'mt-3')}>
							<h1 className="text-2xl font-semibold leading-tight">
								{article.title}
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								{article.where} · {article.byline} · {article.about}
							</p>
						</header>
					) : null}

					<div data-article-preview="" className={cn(COLUMN_CLASS, 'mt-4')}>
						{articleBlock}
						{raw ? null : (
							<p className="mt-8 text-center text-sm text-muted-foreground">
								{ARTICLE_EDITOR_COPY.endLine}
							</p>
						)}
					</div>

					<div className={cn(COLUMN_CLASS, 'mt-4 space-y-3')}>
						{links.length > 0 ? (
							<div className="rounded-md border p-3 text-sm">
								<p className="font-medium">{ARTICLE_EDITOR_COPY.linksTitle}</p>
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
												{gone
													? ARTICLE_EDITOR_COPY.missing
													: ARTICLE_EDITOR_COPY.inPlace}
												{l.name} ({l.url})
											</li>
										)
									})}
								</ul>
								{missing.length > 0 ? (
									<p className="mt-2 text-xs text-muted-foreground">
										{ARTICLE_EDITOR_COPY.linksNote}
									</p>
								) : null}
							</div>
						) : null}
						<p className="text-xs text-muted-foreground">
							{ARTICLE_EDITOR_COPY.words(words)}
						</p>
					</div>
				</div>
			</DropZone>

			{dock}
			{sheet}
			{corner}

			{zoom ? (
				<div className="fixed inset-0 z-50">
					<button
						type="button"
						aria-label={ARTICLE_EDITOR_COPY.close}
						onClick={() => setZoom(null)}
						className="absolute inset-0 h-full w-full bg-black/90"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label={zoom.alt || 'Picture'}
						className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4"
					>
						<img
							src={zoom.src}
							alt={zoom.alt}
							className="max-h-[80vh] w-full max-w-xl rounded object-contain"
						/>
						{zoom.alt || zoomedImage?.caption ? (
							<p className="mt-3 max-w-xl text-center text-sm text-white">
								{zoom.alt || zoomedImage?.caption}
							</p>
						) : null}
						<button
							type="button"
							className="pointer-events-auto mt-4 rounded-full bg-white/10 px-4 py-2 text-sm text-white"
							onClick={() => setZoom(null)}
						>
							{ARTICLE_EDITOR_COPY.close}
						</button>
					</div>
				</div>
			) : null}

			{blocker.state === 'blocked' ? (
				<div
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="article-editor-leave"
					className="fixed inset-x-0 bottom-0 z-50 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
				>
					<p id="article-editor-leave" className="text-sm font-medium">
						{leaveQuestion}
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => blocker.reset()}
						>
							{ARTICLE_EDITOR_COPY.stay}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => blocker.proceed()}
						>
							{ARTICLE_EDITOR_COPY.leave}
						</Button>
					</div>
				</div>
			) : null}
		</div>
	)
}
