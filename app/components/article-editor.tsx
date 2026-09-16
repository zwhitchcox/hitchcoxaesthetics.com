import { useBeforeUnload, useBlocker } from '@remix-run/react'
import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import { flushSync } from 'react-dom'
import {
	ARTICLE_CHAT_COPY,
	ChatComposer,
	ChatList,
	summaryLine,
	type ChatEntry,
	type ComposerPayload,
} from '#app/components/article-chat.tsx'
import {
	DropZone,
	useArticleAttachment,
} from '#app/components/article-attachments.tsx'
import {
	CommentOnThis,
	useProseSelection,
} from '#app/components/comment-on-this.tsx'
import { useDictation } from '#app/components/dictation.tsx'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
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
	ARTICLE_CHAT_ENDPOINT,
	type ChatMessageJson,
} from '#app/utils/article-chat.ts'
import { appendSpeech, firstDiffRange } from '#app/utils/article-edit.ts'
import {
	articleImageResolver,
	articleImageUrl,
	zoomTarget,
	type ArticleImageRef,
	type ZoomTarget,
} from '#app/utils/article-images.ts'
import {
	countWords,
	missingLinks,
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

/**
 * The article editor: the article is an artifact, the chat edits it.
 *
 * Phone: three tabs. Article (the rendered working copy; select text to
 * "Comment on this"), Chat (the conversation that answers or edits),
 * Markdown (the raw text, auto-saved). Desktop (lg and up): the chat or
 * the markdown editor on the left, the rendered article always on the
 * right. One component, one shape in the markup; the width is CSS.
 *
 * Every piece of composer state lives here, never inside a tab panel,
 * because Radix Tabs unmounts the inactive panel. A hidden input named
 * `body` carries the working copy, so the parent <Form> (Approve) submits
 * what she sees. Render it inside a <Form method="post"> whose onSubmit is
 * `useSubmitAfterSave(flushRef)`.
 */
export type EditorTab = 'article' | 'chat' | 'markdown'
export const EDITOR_DEFAULT_TAB: EditorTab = 'chat'

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
	initialTab?: EditorTab
	/** From ?quote=: attached on mount, then dropped from the URL. */
	initialQuote?: string | null
	/** A decided row on the admin page. */
	readOnly?: boolean
	/** The title and the where · byline · about line above the article. */
	showHeader?: boolean
	/** px: the height of the page's sticky bar, for the desktop left column. */
	stickyTop?: number
	flushRef?: React.MutableRefObject<(() => Promise<void>) | null>
	/** True while a chat turn runs (Approve disables). */
	onBusyChange?: (busy: boolean) => void
	onSaved?: (hash: string, body: string) => void
	/** Phone: rendered under the composer ("Send this to the writer instead"). */
	writerLink?: React.ReactNode
}

export const ARTICLE_EDITOR_COPY = {
	tabArticle: 'Article',
	tabChat: 'Chat',
	tabMarkdown: 'Markdown',
	saved: 'Saved',
	saving: 'Saving…',
	saveFailed: 'Could not save. Trying again…',
	tryNow: 'Try now',
	conflict: 'The writer sent new text while you were editing.',
	useTheirs: 'Use the new text',
	keepMine: 'Keep mine',
	decided: 'This one is already decided. Reopen it first.',
	networkError: 'Something went wrong. Check the connection and try again.',
	leaveQuestion: 'Your last change is still saving. Leave anyway?',
	leave: 'Leave',
	stay: 'Stay',
	restoreQuestion: 'You changed this text before and did not save it.',
	restore: 'Restore your unsaved edit',
	forget: 'Forget it',
	referenceNote:
		'This publisher takes only text you wrote yourself. Change the words below in your own way.',
	editorHint:
		'Plain text with simple marks: a line starting with ## is a heading, *this* is italic, **this** is bold, and [words](https://...) is a link. A line that starts with ![ is a picture, and the italic line under it is its caption. Leave both where they are.',
	textLabel: 'Article text',
	markdownBusy: 'Working on it… You can change the text when the chat answers.',
	linksTitle: 'Links that must stay in the article',
	inPlace: 'In place: ',
	missing: 'Missing: ',
	linksNote:
		'You can move a link to another sentence. If it is gone, the placement loses its purpose.',
	words: (n: number) => `${n} words`,
	endLine: 'That is all of it.',
	close: 'Close',
} as const

export { summaryLine }

/** The green "changed" mark stays this long. */
const CHANGED_MARK_MS = 6000
/** The right column follows the markdown box this long after a keystroke. */
const PREVIEW_DEBOUNCE_MS = 150
const WIDE_QUERY = '(min-width: 1024px)'
const KEYBOARD_QUERY = '(hover: hover) and (pointer: fine)'
const TABS: ReadonlyArray<EditorTab> = ['article', 'chat', 'markdown']

const PROSE_CLASS =
	'prose prose-lg max-w-none dark:prose-invert [&_li]:leading-[1.6] [&_p]:leading-[1.6] [&_[data-paragraph]]:scroll-mt-4 [&_mark]:rounded-sm [&_mark]:bg-amber-200 [&_mark]:px-0.5 [&_mark]:text-inherit dark:[&_mark]:bg-amber-700 [&_.review-changed]:bg-green-200 dark:[&_.review-changed]:bg-green-800'

const AMBER_CARD =
	'flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'

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

/** True at lg and wider. False on the server and in jsdom. */
export function useWide() {
	return useSyncExternalStore(wideSubscribe, wideNow, serverFalse)
}

/** A physical keyboard: Enter sends. */
function useEnterSends() {
	return useSyncExternalStore(keyboardSubscribe, keyboardNow, serverFalse)
}

/** The tab to show: an unknown value is the default; no chat on own-words rows; no Article column on a wide screen. */
export function normalizeTab(
	value: string | null | undefined,
	{ isReference, wide }: { isReference: boolean; wide: boolean },
): EditorTab {
	let tab: EditorTab = (TABS as ReadonlyArray<string>).includes(value ?? '')
		? (value as EditorTab)
		: EDITOR_DEFAULT_TAB
	if (isReference && tab === 'chat') tab = 'markdown'
	if (wide && tab === 'article') tab = isReference ? 'markdown' : 'chat'
	return tab
}

function replaceTabInUrl(tab: EditorTab) {
	if (typeof window === 'undefined') return
	try {
		window.history.replaceState(window.history.state, '', `?tab=${tab}`)
	} catch {
		// a sandboxed frame: the tab still switches
	}
}

/**
 * The height that fills the visible viewport from the top of `node`, for
 * the phone's Chat panel, so the composer sits above the keyboard. Null
 * until measured and on a wide screen. `node` comes from a callback ref:
 * the panel mounts one render after its tab is picked (Radix Presence),
 * so a ref object is still null when the tab flag flips.
 *
 * The top is measured in document space. A viewport-relative top would
 * grow the panel by the scroll distance on every page scroll, and the
 * page would never stop growing. So there is no window scroll listener;
 * the visual viewport events cover the keyboard.
 */
function useFillHeight(node: HTMLElement | null, enabled: boolean) {
	const [height, setHeight] = useState<number | null>(null)
	useEffect(() => {
		if (!enabled || !node || typeof window === 'undefined') {
			setHeight(null)
			return
		}
		const vv = window.visualViewport
		let frame = 0
		const measure = () => {
			frame = 0
			const top = node.getBoundingClientRect().top + window.scrollY
			const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
			setHeight(Math.max(240, Math.round(bottom - top)))
		}
		const queue = () => {
			if (!frame) frame = requestAnimationFrame(measure)
		}
		measure()
		window.addEventListener('resize', queue)
		vv?.addEventListener('resize', queue)
		vv?.addEventListener('scroll', queue)
		// A card above the panel (restore, conflict, the route's error line)
		// moves its top but not the column's size, and the page wrapper has a
		// min height, so watch every ancestor: the one that holds both the
		// card and the panel changes size, and the panel re-measures.
		const observer =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue)
		for (let el = node.parentElement; el; el = el.parentElement) {
			observer?.observe(el)
		}
		return () => {
			if (frame) cancelAnimationFrame(frame)
			observer?.disconnect()
			window.removeEventListener('resize', queue)
			vv?.removeEventListener('resize', queue)
			vv?.removeEventListener('scroll', queue)
		}
	}, [node, enabled])
	return height
}

/* ------------------------------------------------------------------------ */
/* The save mark                                                            */
/* ------------------------------------------------------------------------ */

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
				{ARTICLE_EDITOR_COPY.saving}
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
				{ARTICLE_EDITOR_COPY.saved}
			</span>
		)
	}
	if (status === 'error') {
		return (
			<span
				className="inline-flex items-center gap-2 text-xs text-red-700 dark:text-red-400"
				aria-live="polite"
			>
				{message ?? ARTICLE_EDITOR_COPY.saveFailed}
				{message ? null : (
					<button
						type="button"
						onClick={onTryNow}
						className="underline underline-offset-2"
					>
						{ARTICLE_EDITOR_COPY.tryNow}
					</button>
				)}
			</span>
		)
	}
	return null
}

/* ------------------------------------------------------------------------ */
/* The article, as it reads                                                 */
/* ------------------------------------------------------------------------ */

const ArticleView = memo(function ArticleView({
	article,
	images,
	body,
	claims,
	changed,
	showHeader,
	proseRef,
	onProseClick,
}: {
	article: ArticleEditorProps['article']
	images: ReadonlyArray<ArticleImageRef>
	body: string
	claims: ReadonlyArray<string>
	changed: { start: number; end: number } | null
	showHeader: boolean
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
		if (changed) ranges.push({ ...changed, index: -1, kind: 'changed' })
		return [reviewProsePlugin({ paragraphs: splitParagraphs(body), ranges })]
	}, [body, claims, changed])
	return (
		<div>
			{showHeader ? (
				<header>
					<h1 className="text-2xl font-semibold leading-tight">
						{article.title}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{article.where} · {article.byline} · {article.about}
					</p>
				</header>
			) : null}
			<div
				ref={proseRef}
				role="presentation"
				onClick={onProseClick}
				className={showHeader ? 'mt-4' : ''}
			>
				<MarkdownContent
					content={body}
					className={PROSE_CLASS}
					remarkPlugins={plugins}
					resolveImageSrc={resolveImage}
				/>
			</div>
			<p className="mt-8 text-center text-sm text-muted-foreground">
				{ARTICLE_EDITOR_COPY.endLine}
			</p>
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
	range: { start: number; end: number } | null
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
	initialTab,
	initialQuote = null,
	readOnly = false,
	showHeader = true,
	stickyTop = 0,
	flushRef,
	onBusyChange,
	onSaved,
	writerLink,
}: ArticleEditorProps) {
	const articleId = article.id
	const isReference = article.isReference
	const wide = useWide()
	const enterSends = useEnterSends()

	/* ---- the working copy ---- */

	const [body, setBody] = useState(article.body)
	const [previewBody, setPreviewBody] = useState(article.body)
	const bodyRef = useRef(body)
	bodyRef.current = body
	const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const autoSave = useAutoSave({
		articleId,
		initialBody: article.body,
		savedHash: article.savedHash,
		enabled: !readOnly,
		onSaved,
	})
	if (flushRef) {
		flushRef.current = async () => {
			await autoSave.flush()
		}
	}

	/* ---- the tabs ---- */

	const [tab, setTab] = useState<EditorTab>(() =>
		normalizeTab(initialTab, { isReference, wide: false }),
	)
	const tabValue = normalizeTab(tab, { isReference, wide })
	const switchTab = useCallback((next: EditorTab) => {
		setTab(next)
		replaceTabInUrl(next)
	}, [])

	/* ---- the chat ---- */

	const [entries, setEntries] = useState<ChatEntry[]>(() => [...history])
	const [composerText, setComposerText] = useState('')
	const [ghost, setGhost] = useState('')
	const [quote, setQuote] = useState<string | null>(null)
	const [running, setRunning] = useState(false)
	const runningRef = useRef(false)
	const [decidedNow, setDecidedNow] = useState(false)
	const [undo, setUndo] = useState<Undo | null>(null)
	const [undoneIds, setUndoneIds] = useState<Set<string>>(() => new Set())
	const [undoBusy, setUndoBusy] = useState(false)
	const [changed, setChanged] = useState<{ start: number; end: number } | null>(
		null,
	)
	const [seeIt, setSeeIt] = useState(0)
	const [extraImages, setExtraImages] = useState<ArticleImageRef[]>([])
	const [zoom, setZoom] = useState<ZoomTarget | null>(null)
	const localIdRef = useRef(0)
	const boxRef = useRef<HTMLTextAreaElement>(null)
	const proseRef = useRef<HTMLDivElement>(null)
	const chatPanelRef = useRef<HTMLDivElement | null>(null)
	const [chatPanelNode, setChatPanelNode] = useState<HTMLDivElement | null>(
		null,
	)
	const setChatPanel = useCallback((node: HTMLDivElement | null) => {
		chatPanelRef.current = node
		setChatPanelNode(node)
	}, [])
	const chatOn = !readOnly && !isReference && !decidedNow

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
	useBeforeUnload(
		useCallback(
			(event: BeforeUnloadEvent) => {
				if (!owed) return
				event.preventDefault()
				event.returnValue = ARTICLE_EDITOR_COPY.leaveQuestion
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

	/* ---- the working copy: typed, applied, restored ---- */

	/**
	 * A typed change in the Markdown tab. Ignored while a chat turn runs:
	 * the answer replaces the text the model was given, so a change typed
	 * in between would be lost.
	 */
	function updateBody(next: string) {
		if (runningRef.current) return
		setBody(next)
		autoSave.schedule(next)
		if (previewTimer.current) clearTimeout(previewTimer.current)
		previewTimer.current = setTimeout(() => {
			previewTimer.current = null
			setPreviewBody(next)
		}, PREVIEW_DEBOUNCE_MS)
	}
	useEffect(
		() => () => {
			if (previewTimer.current) clearTimeout(previewTimer.current)
		},
		[],
	)

	/** A change that lands at once: the server saved it, or a save starts now. */
	function showBody(next: string) {
		if (previewTimer.current) clearTimeout(previewTimer.current)
		previewTimer.current = null
		setBody(next)
		setPreviewBody(next)
	}

	function restoreMirror() {
		if (mirror !== null) {
			showBody(mirror)
			void autoSave.saveNow(mirror, 'auto')
		}
		setMirrorDismissed(true)
	}

	function useNewText() {
		const theirs = autoSave.useTheirs()
		if (theirs !== null) {
			showBody(theirs)
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

	const onPickQuote = useCallback((text: string) => {
		setQuote(text)
		// In the same gesture, so iOS opens the keyboard when it can.
		flushSync(() => {
			setTab('chat')
		})
		replaceTabInUrl('chat')
		const list = chatPanelRef.current?.querySelector('[data-chat-list]')
		if (list) list.scrollTop = list.scrollHeight
		boxRef.current?.focus()
	}, [])
	const selection = useProseSelection({
		containerRef: proseRef,
		active: chatOn && !running,
		onPick: onPickQuote,
	})

	// ?quote= from the reading page: attach once, then drop it from the URL.
	const initialQuoteRef = useRef(initialQuote)
	useEffect(() => {
		const text = initialQuoteRef.current
		if (!text || !chatOn) return
		setQuote(text)
		setTab('chat')
		replaceTabInUrl('chat')
		initialQuoteRef.current = null
	}, [chatOn])

	/* ---- the article view: zoom and the green mark ---- */

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

	const articleVisible = tabValue === 'article' || wide
	useEffect(() => {
		if (!articleVisible) return
		if (!changed && !(undo?.pictureSrc && seeIt)) return
		// One frame later: on the phone the Chat panel leaves the page in a
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
			if (!target || typeof target.scrollIntoView !== 'function') return
			const rect = target.getBoundingClientRect()
			const inView = rect.top >= 0 && rect.bottom <= window.innerHeight
			if (!inView)
				target.scrollIntoView({ block: 'center', behavior: 'smooth' })
		})
		return () => cancelAnimationFrame(frame)
	}, [articleVisible, changed, seeIt, undo])

	function onSeeIt() {
		if (undo?.range) setChanged(undo.range)
		if (!wide) switchTab('article')
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
					const range = pictureRow ? null : firstDiffRange(prevBody, nextBody)
					showBody(nextBody)
					autoSave.markSaved(nextBody, data.hash)
					onSaved?.(data.hash, nextBody)
					setUndo({
						prevBody,
						rowId: changeRows.at(-1)?.id ?? null,
						range,
						pictureSrc: pictureRow?.imageUrl ?? null,
					})
					setChanged(range)
					setSeeIt(n => n + 1)
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
		showBody(prevBody)
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
	const chatFill = useFillHeight(chatPanelNode, !wide && tabValue === 'chat')

	const indicator = readOnly ? null : (
		<SaveIndicator
			status={autoSave.status}
			message={autoSave.message}
			onTryNow={autoSave.tryNow}
		/>
	)

	const triggerClass =
		'min-h-11 flex-1 text-base lg:min-h-9 lg:flex-none lg:px-4 lg:text-sm'

	const markdownPanel = (
		<div className="flex min-h-0 flex-1 flex-col gap-3 lg:overflow-y-auto">
			{isReference ? (
				<p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
					{ARTICLE_EDITOR_COPY.referenceNote}
				</p>
			) : null}
			<div className="flex flex-1 flex-col">
				<label htmlFor="article-editor-body" className="sr-only">
					{ARTICLE_EDITOR_COPY.textLabel}
				</label>
				<p className="mb-1 text-xs text-muted-foreground">
					{running
						? ARTICLE_EDITOR_COPY.markdownBusy
						: ARTICLE_EDITOR_COPY.editorHint}
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
					className="min-h-[60vh] flex-1 font-mono text-base leading-relaxed lg:min-h-[16rem]"
				/>
			</div>
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
	)

	const chatPanel = isReference ? null : (
		<div
			ref={setChatPanel}
			data-chat-panel=""
			className="flex min-h-0 flex-1 flex-col"
			style={
				chatFill !== null
					? {
							// The measured height must win over the flex basis, so the
							// composer sits at the bottom edge on the phone.
							flex: '0 0 auto',
							height: chatFill,
							paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
						}
					: undefined
			}
		>
			<ChatList
				entries={entries}
				running={running}
				undoRowId={undo?.rowId ?? null}
				undoneIds={undoneIds}
				undoBusy={undoBusy}
				onSeeIt={onSeeIt}
				onUndo={() => void undoChange()}
				onRetry={payload => void send(payload)}
				onZoom={(src, alt) => setZoom({ src, alt })}
			/>
			<ChatComposer
				text={composerText}
				ghost={ghost}
				onTextChange={setComposerText}
				quote={quote}
				onRemoveQuote={() => setQuote(null)}
				attachment={attachment}
				dictation={dictation}
				running={running}
				note={composerNote}
				canSend={canSend}
				onSend={() => void send()}
				enterSends={enterSends}
				boxRef={boxRef}
				writerLink={writerLink}
			/>
		</div>
	)

	return (
		<Tabs
			value={tabValue}
			onValueChange={value =>
				switchTab(normalizeTab(value, { isReference, wide }))
			}
			className="lg:grid lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:gap-6"
			style={{ '--editor-top': `${stickyTop}px` } as React.CSSProperties}
		>
			<input type="hidden" name="body" value={body} />

			<DropZone
				enabled={wide && chatOn}
				onPick={attachment.pickFile}
				className="flex min-w-0 flex-col lg:sticky lg:top-[var(--editor-top)] lg:h-[calc(100vh-var(--editor-top))] lg:self-start"
			>
				<div className="flex items-center gap-2">
					<TabsList className="flex h-auto min-w-0 flex-1 rounded-md bg-muted p-1 lg:flex-none">
						<TabsTrigger
							value="article"
							className={cn(triggerClass, 'lg:hidden')}
						>
							{ARTICLE_EDITOR_COPY.tabArticle}
						</TabsTrigger>
						{!isReference ? (
							<TabsTrigger value="chat" className={triggerClass}>
								{ARTICLE_EDITOR_COPY.tabChat}
							</TabsTrigger>
						) : null}
						<TabsTrigger value="markdown" className={triggerClass}>
							{ARTICLE_EDITOR_COPY.tabMarkdown}
						</TabsTrigger>
					</TabsList>
					<span className="ml-auto shrink-0">{indicator}</span>
				</div>

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

				{autoSave.conflict ? (
					<div role="alert" className={cn(AMBER_CARD, 'mt-2')}>
						<p className="flex-1">{ARTICLE_EDITOR_COPY.conflict}</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={useNewText}
						>
							{ARTICLE_EDITOR_COPY.useTheirs}
						</Button>
						<Button type="button" size="sm" onClick={autoSave.keepMine}>
							{ARTICLE_EDITOR_COPY.keepMine}
						</Button>
					</div>
				) : null}

				{chatPanel ? (
					<TabsContent
						value="chat"
						className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
					>
						{chatPanel}
					</TabsContent>
				) : null}
				<TabsContent
					value="markdown"
					className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
				>
					{markdownPanel}
				</TabsContent>
			</DropZone>

			<div
				data-article-preview=""
				className={cn(
					'min-w-0 lg:block',
					tabValue === 'article' ? 'mt-3' : 'hidden',
				)}
			>
				<ArticleView
					article={article}
					images={allImages}
					body={previewBody}
					claims={claims}
					changed={changed}
					showHeader={showHeader}
					proseRef={proseRef}
					onProseClick={onProseClick}
				/>
			</div>

			<CommentOnThis
				candidate={selection.candidate}
				bottom="edge"
				onPick={selection.pick}
			/>

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
						{ARTICLE_EDITOR_COPY.leaveQuestion}
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
		</Tabs>
	)
}
