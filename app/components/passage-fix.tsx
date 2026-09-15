import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
	ARTICLE_CHANGER_COPY,
	useDictation,
} from '#app/components/article-changer.tsx'
import { Sheet, SheetError } from '#app/components/review-sheet.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	ARTICLE_EDIT_CHIPS,
	ARTICLE_EDIT_MAX_SELECTION_CHARS,
	ARTICLE_EDIT_MIN_SELECTION_CHARS,
	appendSpeech,
	appendToPrompt,
	firstDiffRange,
	locatePassage,
	saveArticleBody,
	type ArticleEditSelection,
} from '#app/utils/article-edit.ts'
import { type ArticleLink } from '#app/utils/articles.ts'
import { plainQuote } from '#app/utils/review-aid.ts'
import { highlightId } from '#app/utils/review-prose.ts'

/**
 * "Change this": select a passage in the prose, or tap a claim row, say
 * what is wrong, and the AI changes only that passage.
 *
 * Two ways in. A text selection inside `containerRef` (3 to 2000
 * characters) shows a "Change this" button: a pill above the sticky bar
 * on a phone, a small button by the selection on a wide screen. A
 * `request` prop (a tapped claim row or highlight) opens the sheet with
 * that sentence. Both lead to the same sheet: the passage, chips, a box
 * with Dictate, and "Make this change".
 *
 * The change goes to /resources/article-edit with the passage as
 * `selection`, then the result is saved at once through
 * /resources/article-save with `savedHash` as the base. `onApplied` gets
 * the new body and hash, the summary, and the changed span. A 409 from
 * the save shows "Use the new text" / "Keep mine" inside the sheet.
 */
export type PassageRequest = {
	/** The sentence, as prose (plainQuote). */
	text: string
	/** Its paragraph index, when known. */
	paragraph?: number | null
	/** Its claim index, for "Show me where it is". */
	index?: number | null
	source: 'panel' | 'prose'
	/** A new value opens the sheet again with the same text. */
	nonce: number
}

export type PassageApplied = {
	body: string
	savedHash: string
	/** Null when the writer's text was taken instead of a change. */
	summary: string | null
	/** The changed span in `body`, for the green mark. */
	changed: { start: number; end: number } | null
}

export type PassageFixProps = {
	articleId: string
	/** The working copy the change is applied to. */
	body: string
	/** hashBody of the stored text the working copy was saved as. */
	savedHash: string
	links: ArticleLink[]
	/** The prose the selection must sit inside. */
	containerRef: React.RefObject<HTMLElement | null>
	/** The card is current: the button may show. */
	active: boolean
	/** Decided, own words, or a save in flight: no button, no sheet. */
	disabled: boolean
	request: PassageRequest | null
	onApplied: (applied: PassageApplied) => void
}

const EDIT_ENDPOINT = '/resources/article-edit'
/** The selection reads this long after the last selectionchange. */
const SELECTION_DEBOUNCE_MS = 250
/** The button hides this long after the last selectionchange. */
const BUTTON_TTL_MS = 10_000
const NARROW_QUERY = '(max-width: 640px)'
const WIDE_BUTTON_WIDTH = 128

type Candidate = {
	text: string
	paragraph: number | null
	rect: { top: number; bottom: number; left: number }
}

type Open = {
	text: string
	paragraph: number | null
	index: number | null
	source: 'panel' | 'prose'
}

type Conflict = {
	serverBody: string
	serverHash: string
	aiBody: string
	summary: string
}

function narrowSubscribe(onChange: () => void) {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return () => {}
	}
	const query = window.matchMedia(NARROW_QUERY)
	query.addEventListener('change', onChange)
	return () => query.removeEventListener('change', onChange)
}

function narrowNow() {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false
	}
	return window.matchMedia(NARROW_QUERY).matches
}

/** True on a phone-width viewport. False on the server and in jsdom. */
function useNarrow() {
	return useSyncExternalStore(narrowSubscribe, narrowNow, () => false)
}

/** The sticky bottom bar of the page, or null when there is none. */
function findBottomBar(): HTMLElement | null {
	const marked = document.querySelector<HTMLElement>('[data-review-bar]')
	if (marked) return marked
	// The feed, change and desktop bars all use this class pair.
	let best: HTMLElement | null = null
	let bestHeight = 0
	for (const el of document.querySelectorAll<HTMLElement>('.fixed.bottom-0')) {
		if (el.getAttribute('role') === 'dialog') continue
		const rect = el.getBoundingClientRect()
		if (rect.height === 0 || rect.bottom > window.innerHeight + 1) continue
		if (rect.height > bestHeight) {
			best = el
			bestHeight = rect.height
		}
	}
	return best
}

/**
 * The height of the sticky bottom bar in px, so the pill sits above it.
 * The bar is one row on a guest card and two on a blog card, so the
 * height is measured, not guessed. Null until measured, or when the page
 * has no bar.
 */
function useBarHeight(enabled: boolean) {
	const [height, setHeight] = useState<number | null>(null)
	useEffect(() => {
		if (!enabled || typeof window === 'undefined') return
		const bar = findBottomBar()
		if (!bar) {
			setHeight(null)
			return
		}
		const measure = () => setHeight(bar.getBoundingClientRect().height)
		measure()
		window.addEventListener('resize', measure)
		const observer =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
		observer?.observe(bar)
		return () => {
			window.removeEventListener('resize', measure)
			observer?.disconnect()
		}
	}, [enabled])
	return height
}

/** The paragraph index of the nearest [data-paragraph] ancestor, or null. */
function paragraphOf(node: Node | null): number | null {
	const el = node instanceof Element ? node : node?.parentElement
	const block = el?.closest<HTMLElement>('[data-paragraph]')
	const value = Number(block?.dataset.paragraph)
	return block && !Number.isNaN(value) ? value : null
}

function firstWords(text: string, max = 40): string {
	return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

export function PassageFix({
	articleId,
	body,
	savedHash,
	links,
	containerRef,
	active,
	disabled,
	request,
	onApplied,
}: PassageFixProps) {
	const narrow = useNarrow()
	const [candidate, setCandidate] = useState<Candidate | null>(null)
	const [open, setOpen] = useState<Open | null>(null)
	const [prompt, setPrompt] = useState('')
	const [interim, setInterim] = useState('')
	const [running, setRunning] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [conflict, setConflict] = useState<Conflict | null>(null)
	const [expanded, setExpanded] = useState(false)
	const candidateRef = useRef<Candidate | null>(null)
	candidateRef.current = candidate
	const dictation = useDictation({
		onFinal: text => setPrompt(current => appendSpeech(current, text)),
		onInterim: setInterim,
	})

	const showButton = active && !disabled && open === null
	const barHeight = useBarHeight(narrow && showButton)

	// Watch the selection while the button may show.
	useEffect(() => {
		if (!showButton) {
			setCandidate(null)
			return
		}
		let readTimer: ReturnType<typeof setTimeout> | null = null
		let hideTimer: ReturnType<typeof setTimeout> | null = null
		const read = () => {
			const sel = window.getSelection()
			const container = containerRef.current
			if (!sel || !container || sel.isCollapsed || sel.rangeCount === 0) {
				setCandidate(null)
				return
			}
			const range = sel.getRangeAt(0)
			if (!container.contains(range.commonAncestorContainer)) {
				setCandidate(null)
				return
			}
			const text = sel.toString().replace(/\s+/g, ' ').trim()
			if (
				text.length < ARTICLE_EDIT_MIN_SELECTION_CHARS ||
				text.length > ARTICLE_EDIT_MAX_SELECTION_CHARS
			) {
				setCandidate(null)
				return
			}
			const rect = range.getBoundingClientRect()
			setCandidate({
				text,
				paragraph: paragraphOf(range.startContainer),
				rect: { top: rect.top, bottom: rect.bottom, left: rect.left },
			})
			if (hideTimer) clearTimeout(hideTimer)
			hideTimer = setTimeout(() => setCandidate(null), BUTTON_TTL_MS)
		}
		const onChange = () => {
			if (readTimer) clearTimeout(readTimer)
			readTimer = setTimeout(read, SELECTION_DEBOUNCE_MS)
		}
		document.addEventListener('selectionchange', onChange)
		return () => {
			document.removeEventListener('selectionchange', onChange)
			if (readTimer) clearTimeout(readTimer)
			if (hideTimer) clearTimeout(hideTimer)
		}
	}, [showButton, containerRef])

	const openSheet = useCallback((next: Open) => {
		setOpen(next)
		setPrompt('')
		setInterim('')
		setError(null)
		setConflict(null)
		setExpanded(false)
	}, [])

	// A tapped claim row or highlight.
	useEffect(() => {
		if (!request || disabled) return
		openSheet({
			text: request.text,
			paragraph: request.paragraph ?? null,
			index: request.index ?? null,
			source: request.source,
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps -- a new nonce is the signal
	}, [request?.nonce])

	function close() {
		if (running) return
		dictation.stop()
		setOpen(null)
	}

	/** pointerdown, so the cached selection is read before the tap clears it. */
	function onButtonPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
		event.preventDefault()
		const picked = candidateRef.current
		if (!picked) return
		window.getSelection()?.removeAllRanges()
		setCandidate(null)
		openSheet({
			text: picked.text,
			paragraph: picked.paragraph,
			index: null,
			source: 'prose',
		})
	}

	function showWhere() {
		if (!open) return
		// Scoped to this card's prose: the feed repeats mark ids across cards.
		const container = containerRef.current
		const mark =
			open.index === null
				? null
				: container?.querySelector(`#${highlightId(open.index)}`)
		const block =
			open.paragraph === null
				? null
				: container?.querySelector(`[data-paragraph="${open.paragraph}"]`)
		setOpen(null)
		;(mark ?? block)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	function handleSave(
		result: Awaited<ReturnType<typeof saveArticleBody>>,
		aiBody: string,
		summary: string,
		before: string,
	) {
		if (result.ok) {
			onApplied({
				body: aiBody,
				savedHash: result.hash,
				summary,
				changed: firstDiffRange(before, aiBody),
			})
			window.getSelection()?.removeAllRanges()
			setOpen(null)
			setPrompt('')
			return
		}
		if (result.kind === 'changed') {
			setConflict({
				serverBody: result.body,
				serverHash: result.hash,
				aiBody,
				summary,
			})
			return
		}
		if (result.kind === 'decided') {
			setError(ARTICLE_CHANGER_COPY.decided)
			return
		}
		setError(result.message ?? ARTICLE_CHANGER_COPY.networkError)
	}

	async function makeChange() {
		const words = prompt.trim()
		if (!open || !words || running) return
		dictation.stop()
		setRunning(true)
		setError(null)
		try {
			const located = locatePassage(body, open.text)
			const selection: ArticleEditSelection = {
				text: open.text,
				...(open.paragraph !== null ? { paragraph: open.paragraph } : {}),
				...(located ? { markdown: body.slice(located.start, located.end) } : {}),
			}
			const response = await fetch(EDIT_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					articleId,
					prompt: words,
					markdown: body,
					links,
					selection,
				}),
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
			const summary = typeof data.summary === 'string' ? data.summary : ''
			const saved = await saveArticleBody({
				articleId,
				body: data.markdown,
				baseHash: savedHash,
				source: 'ai',
			})
			handleSave(saved, data.markdown, summary, body)
		} catch {
			setError(ARTICLE_CHANGER_COPY.networkError)
		} finally {
			setRunning(false)
		}
	}

	async function keepMine() {
		if (!conflict || running) return
		setRunning(true)
		setError(null)
		try {
			const saved = await saveArticleBody({
				articleId,
				body: conflict.aiBody,
				baseHash: conflict.serverHash,
				source: 'ai',
			})
			setConflict(null)
			handleSave(saved, conflict.aiBody, conflict.summary, conflict.serverBody)
		} catch {
			setError(ARTICLE_CHANGER_COPY.networkError)
		} finally {
			setRunning(false)
		}
	}

	function useTheirs() {
		if (!conflict) return
		onApplied({
			body: conflict.serverBody,
			savedHash: conflict.serverHash,
			summary: null,
			changed: null,
		})
		setConflict(null)
		setOpen(null)
	}

	const button =
		showButton && candidate ? (
			narrow ? (
				<button
					type="button"
					onPointerDown={onButtonPointerDown}
					className="fixed left-1/2 z-[35] flex h-11 max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 text-base font-medium text-primary-foreground shadow-lg"
					style={{
						// The bar's own height already holds the safe-area padding.
						bottom:
							barHeight === null
								? 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)'
								: `calc(${Math.ceil(barHeight)}px + 0.5rem)`,
					}}
				>
					<span className="shrink-0">{ARTICLE_CHANGER_COPY.changeThis}</span>
					<span className="truncate text-sm font-normal opacity-80">
						{firstWords(candidate.text)}
					</span>
				</button>
			) : (
				<button
					type="button"
					onPointerDown={onButtonPointerDown}
					className="fixed z-[35] h-9 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground shadow-lg"
					style={{
						top:
							candidate.rect.top < 60
								? candidate.rect.bottom + 8
								: candidate.rect.top - 44,
						left: Math.min(
							Math.max(8, candidate.rect.left),
							(typeof window === 'undefined' ? 800 : window.innerWidth) -
								WIDE_BUTTON_WIDTH -
								8,
						),
					}}
				>
					{ARTICLE_CHANGER_COPY.changeThis}
				</button>
			)
		) : null

	return (
		<>
			{button}
			{open ? (
				<Sheet title={ARTICLE_CHANGER_COPY.whatsWrong} onClose={close}>
					<div className="space-y-3">
						<blockquote
							className={`border-l-2 pl-3 text-sm italic text-muted-foreground ${
								expanded ? '' : 'line-clamp-6'
							}`}
						>
							“{plainQuote(open.text)}”
						</blockquote>
						{!expanded && open.text.length > 240 ? (
							<button
								type="button"
								onClick={() => setExpanded(true)}
								className="text-xs text-primary underline-offset-2 hover:underline"
							>
								{ARTICLE_CHANGER_COPY.more}
							</button>
						) : null}
						{open.source === 'panel' ? (
							<button
								type="button"
								onClick={showWhere}
								className="text-xs text-primary underline-offset-2 hover:underline"
							>
								{ARTICLE_CHANGER_COPY.showWhere}
							</button>
						) : null}

						{conflict ? (
							<div
								role="alert"
								className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
							>
								<p>{ARTICLE_CHANGER_COPY.conflict}</p>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={running}
										onClick={useTheirs}
									>
										{ARTICLE_CHANGER_COPY.useTheirs}
									</Button>
									<Button type="button" size="sm" disabled={running} onClick={keepMine}>
										{ARTICLE_CHANGER_COPY.keepMine}
									</Button>
								</div>
							</div>
						) : (
							<>
								<div className="flex flex-wrap gap-2">
									{ARTICLE_EDIT_CHIPS.map(chip => (
										<button
											key={chip}
											type="button"
											disabled={running}
											onClick={() =>
												setPrompt(current => appendToPrompt(current, chip))
											}
											className="rounded-full border bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
										>
											{chip}
										</button>
									))}
								</div>
								<div>
									<label htmlFor="passage-fix-prompt" className="sr-only">
										What should change here
									</label>
									<Textarea
										id="passage-fix-prompt"
										value={prompt}
										readOnly={running}
										aria-busy={running}
										rows={3}
										onChange={e => setPrompt(e.currentTarget.value)}
										placeholder={ARTICLE_CHANGER_COPY.passagePlaceholder}
										className="text-base"
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
										size="lg"
										className="min-w-0 flex-1 text-base"
										disabled={running || !prompt.trim()}
										onClick={makeChange}
									>
										{running
											? ARTICLE_CHANGER_COPY.working
											: ARTICLE_CHANGER_COPY.makeChange}
									</Button>
								</div>
								{running ? (
									<p className="text-xs text-muted-foreground">
										{ARTICLE_CHANGER_COPY.usually}
									</p>
								) : null}
							</>
						)}

						{error ? <SheetError>{error}</SheetError> : null}
					</div>
				</Sheet>
			) : null}
		</>
	)
}
