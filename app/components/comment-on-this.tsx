import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import {
	ARTICLE_EDIT_MAX_SELECTION_CHARS,
	ARTICLE_EDIT_MIN_SELECTION_CHARS,
} from '#app/utils/article-edit.ts'

/**
 * "Comment on this": select a passage in the prose and a button offers to
 * put it in the chat as a quote.
 *
 * `useProseSelection` watches `selectionchange` (debounced 250 ms). A
 * selection qualifies when it is not collapsed, sits inside
 * `containerRef`, and folds to 3 to 2000 characters. The qualified text is
 * cached at once, so a tap that collapses the native selection still has
 * it. The candidate clears when the selection collapses or leaves the
 * prose, or 10 s after the last change.
 *
 * `CommentOnThis` renders the button: a pill centred above the page's
 * sticky bar on a phone, a small button by the selection on a wide screen. It
 * reads the cached selection on `pointerdown`, before the tap clears it.
 */
export const COMMENT_COPY = {
	button: 'Comment on this',
} as const

/** The selection reads this long after the last selectionchange. */
export const SELECTION_DEBOUNCE_MS = 250
/** The button hides this long after the last selectionchange. */
export const SELECTION_TTL_MS = 10_000
const NARROW_QUERY = '(max-width: 640px)'
const WIDE_BUTTON_WIDTH = 160

export type SelectionCandidate = {
	/** The selected text, whitespace folded. */
	text: string
	/** The paragraph index of the range start, when known. */
	paragraph: number | null
	rect: { top: number; bottom: number; left: number }
}

function narrowSubscribe(onChange: () => void) {
	if (
		typeof window === 'undefined' ||
		typeof window.matchMedia !== 'function'
	) {
		return () => {}
	}
	const query = window.matchMedia(NARROW_QUERY)
	query.addEventListener('change', onChange)
	return () => query.removeEventListener('change', onChange)
}

function narrowNow() {
	if (
		typeof window === 'undefined' ||
		typeof window.matchMedia !== 'function'
	) {
		return false
	}
	return window.matchMedia(NARROW_QUERY).matches
}

/** True on a phone-width viewport. False on the server and in jsdom. */
export function useNarrow() {
	return useSyncExternalStore(narrowSubscribe, narrowNow, () => false)
}

/** The sticky bottom bar of the page, or null when there is none. */
function findBottomBar(): HTMLElement | null {
	const marked = document.querySelector<HTMLElement>('[data-review-bar]')
	if (marked) return marked
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
 * The height of the page's sticky bottom bar in px, so the pill sits above
 * it. Measured, not guessed: the bar is one row on a guest card and two on
 * a blog card. Null until measured, or when the page has no bar.
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

/** The selected text, whitespace folded, for the request and the display. */
export function foldSelection(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

export function firstWords(text: string, max = 40): string {
	return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

export function useProseSelection({
	containerRef,
	active,
	onPick,
}: {
	/** The prose the selection must sit inside. */
	containerRef: React.RefObject<HTMLElement | null>
	/** The button may show. */
	active: boolean
	/** The tap: the folded text and its paragraph. */
	onPick: (text: string, paragraph: number | null) => void
}) {
	const [candidate, setCandidate] = useState<SelectionCandidate | null>(null)
	const candidateRef = useRef<SelectionCandidate | null>(null)
	candidateRef.current = candidate
	const onPickRef = useRef(onPick)
	onPickRef.current = onPick

	useEffect(() => {
		if (!active) {
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
			const text = foldSelection(sel.toString())
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
			hideTimer = setTimeout(() => setCandidate(null), SELECTION_TTL_MS)
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
	}, [active, containerRef])

	/** Read the cached selection, clear the native one, and hand it on. */
	const pick = useCallback(() => {
		const picked = candidateRef.current
		if (!picked) return
		window.getSelection()?.removeAllRanges()
		setCandidate(null)
		onPickRef.current(picked.text, picked.paragraph)
	}, [])

	return { candidate, pick }
}

export function CommentOnThis({
	candidate,
	bottom,
	onPick,
	narrow: narrowProp,
}: {
	candidate: SelectionCandidate | null
	/** The phone pill sits above the page's sticky bar (`[data-review-bar]`). */
	bottom: 'bar'
	/** The hook's `pick`. Called on pointerdown. */
	onPick: () => void
	/** Force the phone or the wide shape. Defaults to the viewport width. */
	narrow?: boolean
}) {
	const narrowNow = useNarrow()
	const narrow = narrowProp ?? narrowNow
	const barHeight = useBarHeight(
		narrow && bottom === 'bar' && candidate !== null,
	)
	if (!candidate) return null

	/** pointerdown, so the cached selection is read before the tap clears it. */
	const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		event.preventDefault()
		onPick()
	}

	if (narrow) {
		return (
			<button
				type="button"
				onPointerDown={onPointerDown}
				className="fixed left-1/2 z-[35] flex h-11 max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 text-base font-medium text-primary-foreground shadow-lg"
				style={{
					bottom:
						barHeight === null
							? 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)'
							: `calc(${Math.ceil(barHeight)}px + 0.5rem)`,
				}}
			>
				<span className="shrink-0">{COMMENT_COPY.button}</span>
				<span className="truncate text-sm font-normal opacity-80">
					{firstWords(candidate.text)}
				</span>
			</button>
		)
	}
	return (
		<button
			type="button"
			onPointerDown={onPointerDown}
			className="fixed z-[35] h-9 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground shadow-lg"
			style={{
				top:
					candidate.rect.top < 60
						? candidate.rect.bottom + 8
						: candidate.rect.top - 44,
				left: Math.min(
					Math.max(8, candidate.rect.left),
					(typeof window === 'undefined' ? 800 : window.innerWidth) -
						WIDE_BUTTON_WIDTH,
				),
			}}
		>
			{COMMENT_COPY.button}
		</button>
	)
}
