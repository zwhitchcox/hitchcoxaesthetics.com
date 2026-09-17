import { forwardRef, useCallback, useEffect, useRef } from 'react'
import {
	ChatRow,
	DOCK_TARGET_CLASS,
	WorkingRow,
	type ChatEntry,
	type ComposerPayload,
} from '#app/components/article-chat.tsx'
import { Icon } from '#app/components/ui/icon'
import { cn } from '#app/utils/misc.tsx'
import { useMeasuredHeight } from '#app/utils/viewport.ts'

/**
 * The chat's shell: where the chat sits on the page. The phone has a fixed
 * dock at the bottom (the composer, one status line, a tab on its top edge
 * that opens the chat) and a sheet that slides up between the page's top
 * bar and the dock. A wide screen has a
 * round launcher bottom-right and a popup above it. Every piece of chat
 * state lives in ArticleEditor; these components only place its children.
 *
 * Geometry goes through CSS variables and classes, not inline `calc()`:
 * `--editor-top` and `--editor-bottom` come from the editor root (the
 * page's sticky bars) and `--dock-height` is the dock's measured height.
 * The software keyboard is the one inline value: while it is up, the dock
 * and the sheet are placed from the visual viewport's bottom edge
 * (`viewportBottom`, see ChatDock), not from the layout viewport's bottom.
 */

export const CHAT_SHELL_COPY = {
	openChat: 'Open the chat',
	openChatNew: 'Open the chat. A new answer is waiting.',
	closeChat: 'Close the chat',
	chatTitle: 'Chat',
	open: 'Open',
} as const

/** The status line shows this much of an answer. */
export const STATUS_LINE_CHARS = 90
/** A drag down the sheet's header this far closes it. */
export const SHEET_SWIPE_PX = 60

const CHAT_SHEET_ID = 'article-chat-sheet'
const CHAT_POPUP_ID = 'article-chat-popup'
/** Above the page's bottom bar, while the keyboard is down. */
const DOCK_BOTTOM_CLASS = 'bottom-[var(--editor-bottom)]'
/** The keyboard is up: anchored at the top, moved down by a transform, and no more padding than the row needs. */
const DOCK_KEYBOARD_CLASS = 'top-0 py-1'
const SHEET_BOTTOM_CLASS =
	'bottom-[calc(var(--dock-height)+var(--editor-bottom))]'
const CORNER_BOTTOM_CLASS = 'bottom-[calc(var(--editor-bottom)+1rem)]'
const POPUP_HEIGHT_CLASS =
	'h-[min(70vh,calc(100vh-var(--editor-top)-var(--editor-bottom)-2rem))]'
const SAFE_AREA_PADDING_CLASS = 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'

const noop = () => {}

/* ------------------------------------------------------------------------ */
/* The phone: the dock and its tab, the status line, the sheet              */
/* ------------------------------------------------------------------------ */

/**
 * The fixed container at the bottom of the phone screen. One DOM element in
 * both chat states, so the composer inside it never remounts. With the
 * keyboard down it sits above the page's bottom bar. The ChatComposer
 * inside it takes `className="space-y-2 px-3 pt-2"` (the dock's own top
 * line is the only one) and `trailing={<SaveState … />}`.
 *
 * While the keyboard is up (`keyboardInset` > 0) the dock hugs it: it is
 * anchored at the top of the layout viewport and a transform moves it down
 * to the visual viewport's bottom edge (`viewportBottom`) less its own
 * measured height. iOS positions a fixed element against the layout
 * viewport, whose height is not always `innerHeight`, so a `bottom` offset
 * can float above the keyboard or hide under it; an offset from the top to
 * the visual viewport's own edge cannot. The keyboard leaves little room,
 * so the padding is then the least (`py-1`, no safe area).
 *
 * With `chat`, a small tab protrudes from the dock's top edge on the right
 * and opens or closes the sheet; the dock is `fixed`, so the tab's
 * `absolute` offset counts from it. No tab without `chat` (an own-words
 * row: the dock holds the format row alone).
 */
export const ChatDock = forwardRef<
	HTMLDivElement,
	{
		keyboardInset: number
		/** px from the layout viewport's top to the visual viewport's bottom edge (useKeyboardInset). */
		viewportBottom: number
		chat?: { open: boolean; onOpen: () => void; onClose: () => void }
		children: React.ReactNode
	}
>(function ChatDock({ keyboardInset, viewportBottom, chat, children }, ref) {
	// The dock measures itself for the transform; the forwarded ref gets the same element.
	const ownRef = useRef<HTMLDivElement | null>(null)
	const setRef = useCallback(
		(el: HTMLDivElement | null) => {
			ownRef.current = el
			if (typeof ref === 'function') ref(el)
			else if (ref) ref.current = el
		},
		[ref],
	)
	const height = useMeasuredHeight(ownRef)
	const onKeyboard = keyboardInset > 0
	return (
		<div
			ref={setRef}
			data-chat-dock=""
			className={cn(
				'fixed inset-x-0 z-30 overflow-visible border-t bg-background/95 backdrop-blur',
				onKeyboard
					? DOCK_KEYBOARD_CLASS
					: cn(DOCK_BOTTOM_CLASS, SAFE_AREA_PADDING_CLASS),
			)}
			style={
				onKeyboard
					? { transform: `translate3d(0, ${viewportBottom - height}px, 0)` }
					: undefined
			}
		>
			{chat ? (
				<button
					type="button"
					aria-label={
						chat.open ? CHAT_SHELL_COPY.closeChat : CHAT_SHELL_COPY.openChat
					}
					aria-expanded={chat.open}
					aria-controls={CHAT_SHEET_ID}
					onClick={chat.open ? chat.onClose : chat.onOpen}
					className="absolute -top-7 right-3 flex h-7 w-12 items-center justify-center rounded-t-lg border border-b-0 bg-background"
				>
					<Icon
						name={chat.open ? 'chevron-down' : 'chevron-up'}
						className="h-5 w-5"
					/>
				</button>
			) : null}
			{children}
		</div>
	)
})

export type StatusLineProps = {
	/** A chat turn runs. */
	running: boolean
	/** The newest answer she has not seen (an assistant, change or error row), or null. */
	entry: ChatEntry | null
	/** The newest change row of this visit: the one with Undo. */
	undoRowId: string | null
	undoneIds: ReadonlySet<string>
	undoBusy: boolean
	onOpen: () => void
	onSeeIt: () => void
	onUndo: () => void
	onRetry: (payload: ComposerPayload) => void
}

/**
 * One line above the composer while the sheet is closed: the working dots
 * or the newest unseen answer. Absent otherwise; the sheet's list carries
 * the invitation to a first message, so nothing sits over the box.
 */
export function StatusLine({
	running,
	entry,
	undoRowId,
	undoneIds,
	undoBusy,
	onOpen,
	onSeeIt,
	onUndo,
	onRetry,
}: StatusLineProps) {
	const unseen = entry && entry.role !== 'user' ? entry : null
	let content: React.ReactNode
	if (running) {
		content = <WorkingRow />
	} else if (unseen?.role === 'assistant') {
		content = (
			<div className="flex items-center gap-2">
				<p className="line-clamp-1 min-w-0 flex-1">{cutAnswer(unseen.text)}</p>
				<button
					type="button"
					onClick={onOpen}
					className={cn(
						'-mr-3 shrink-0 font-medium text-primary underline-offset-2 hover:underline',
						DOCK_TARGET_CLASS,
					)}
				>
					{CHAT_SHELL_COPY.open}
				</button>
			</div>
		)
	} else if (unseen) {
		content = (
			<ChatRow
				entry={unseen}
				expanded={false}
				onToggle={noop}
				canUndo={unseen.id === undoRowId}
				undone={undoneIds.has(unseen.id)}
				undoBusy={undoBusy}
				onSeeIt={onSeeIt}
				onUndo={onUndo}
				onRetry={onRetry}
				onZoom={noop}
				dock
			/>
		)
	} else {
		return null
	}
	return (
		<div
			role="status"
			data-status-line=""
			aria-live="polite"
			className="min-h-7 px-3 pt-2 text-sm text-muted-foreground"
		>
			{content}
		</div>
	)
}

function cutAnswer(text: string): string {
	const line = text.trim()
	return line.length > STATUS_LINE_CHARS
		? `${line.slice(0, STATUS_LINE_CHARS).trimEnd()}…`
		: line
}

/**
 * The phone chat, fixed between the page's top bar and the dock. Not modal:
 * the top bar and the dock stay in reach. Closes on the `×`, Escape, and a
 * swipe down its header. Mount it only while the chat is open. While the
 * keyboard is up its bottom edge is the dock's top edge, measured from the
 * visual viewport as the dock is (see ChatDock).
 */
export function ChatSheet({
	stickyTop,
	keyboardInset,
	viewportBottom,
	dockHeight,
	onClose,
	children,
}: {
	/** px: the page's sticky top bar; the sheet starts under it. */
	stickyTop: number
	keyboardInset: number
	/** px from the layout viewport's top to the visual viewport's bottom edge (useKeyboardInset). */
	viewportBottom: number
	dockHeight: number
	onClose: () => void
	/** The ChatList, with `className="min-h-0 flex-1 overscroll-contain px-4 pb-7"` (the dock's tab covers the list's bottom-right corner). */
	children: React.ReactNode
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [onClose])

	const swipe = useRef<{ startY: number; passed: boolean } | null>(null)
	const onKeyboard = keyboardInset > 0

	return (
		<section
			id={CHAT_SHEET_ID}
			role="dialog"
			aria-label={CHAT_SHELL_COPY.chatTitle}
			className={cn(
				'fixed inset-x-0 z-[29] flex flex-col bg-background motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200',
				onKeyboard ? null : SHEET_BOTTOM_CLASS,
			)}
			style={
				onKeyboard
					? {
							top: `${stickyTop}px`,
							height: `${Math.max(0, viewportBottom - dockHeight - stickyTop)}px`,
						}
					: ({
							top: `${stickyTop}px`,
							'--dock-height': `${dockHeight}px`,
						} as React.CSSProperties)
			}
		>
			<div
				className="flex h-11 touch-none items-center justify-between border-b px-4"
				onPointerDown={event => {
					// The × is a tap, not a drag: capturing the pointer here would swallow its click.
					if ((event.target as Element).closest('button')) return
					swipe.current = { startY: event.clientY, passed: false }
					const el = event.currentTarget
					if (typeof el.setPointerCapture === 'function') {
						try {
							el.setPointerCapture(event.pointerId)
						} catch {
							// a synthetic pointer: the header still gets the moves over it
						}
					}
				}}
				onPointerMove={event => {
					const drag = swipe.current
					if (drag && event.clientY - drag.startY > SHEET_SWIPE_PX)
						drag.passed = true
				}}
				onPointerUp={() => {
					const passed = swipe.current?.passed ?? false
					swipe.current = null
					if (passed) onClose()
				}}
				onPointerCancel={() => {
					swipe.current = null
				}}
			>
				<span
					aria-hidden="true"
					className="h-1 w-10 rounded-full bg-muted-foreground/40"
				/>
				<h2 className="text-base font-medium">{CHAT_SHELL_COPY.chatTitle}</h2>
				<button
					type="button"
					aria-label={CHAT_SHELL_COPY.closeChat}
					onClick={onClose}
					className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full"
				>
					<Icon name="x" className="h-5 w-5" />
				</button>
			</div>
			{children}
		</section>
	)
}

/* ------------------------------------------------------------------------ */
/* The desktop: the launcher and the popup                                  */
/* ------------------------------------------------------------------------ */

/**
 * The round button bottom-right, above the page's bottom bar, while the
 * popup is closed. A green dot when an answer waits unseen.
 */
export function ChatLauncher({
	unseenCount,
	onOpen,
}: {
	/** Answers that arrived while the popup was closed. */
	unseenCount: number
	onOpen: () => void
}) {
	const unseen = unseenCount > 0
	return (
		<button
			type="button"
			data-chat-launcher=""
			aria-label={
				unseen ? CHAT_SHELL_COPY.openChatNew : CHAT_SHELL_COPY.openChat
			}
			aria-expanded={false}
			aria-controls={CHAT_POPUP_ID}
			onClick={onOpen}
			className={cn(
				'fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg',
				CORNER_BOTTOM_CLASS,
			)}
		>
			<Icon name="chat-bubble" className="h-6 w-6" />
			{unseen ? (
				<span
					aria-hidden="true"
					className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-green-600 ring-2 ring-background"
				/>
			) : null}
		</button>
	)
}

/**
 * The desktop chat, in the launcher's corner, up to 70vh tall and never
 * under the page's bars. Not modal: the article stays editable behind it.
 * Escape (with focus inside) and the close button return focus to the
 * launcher, which takes the popup's place. Mount it only while open.
 */
export function ChatPopup({
	onClose,
	children,
}: {
	onClose: () => void
	/** The ChatList (`min-h-0 flex-1 px-3`) and the ChatComposer (`className="space-y-2 border-t px-3 pt-2 pb-3"`). */
	children: React.ReactNode
}) {
	const sectionRef = useRef<HTMLElement>(null)
	const closeRef = useRef(onClose)
	closeRef.current = onClose

	// Escape closes only while the focus is inside the popup.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			if (!sectionRef.current?.contains(event.target as Node)) return
			closeRef.current()
			focusLauncher()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [])

	return (
		<section
			ref={sectionRef}
			id={CHAT_POPUP_ID}
			role="dialog"
			aria-label={CHAT_SHELL_COPY.chatTitle}
			className={cn(
				'fixed right-4 z-30 flex w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border bg-card shadow-xl',
				CORNER_BOTTOM_CLASS,
				POPUP_HEIGHT_CLASS,
			)}
		>
			<div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
				<h2 className="text-base font-medium">{CHAT_SHELL_COPY.chatTitle}</h2>
				<button
					type="button"
					aria-label={CHAT_SHELL_COPY.closeChat}
					onClick={() => {
						onClose()
						focusLauncher()
					}}
					className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
				>
					<Icon name="minus" className="h-5 w-5" />
				</button>
			</div>
			{children}
		</section>
	)
}

/** After the popup closes, the launcher takes its place and the focus. */
function focusLauncher() {
	// The launcher mounts when the parent has re-rendered.
	queueMicrotask(() => {
		document.querySelector<HTMLElement>('[data-chat-launcher]')?.focus()
	})
}
