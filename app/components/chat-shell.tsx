import { forwardRef, useEffect, useRef } from 'react'
import {
	ARTICLE_CHAT_COPY,
	ChatRow,
	DOCK_TARGET_CLASS,
	WorkingRow,
	type ChatEntry,
	type ComposerPayload,
} from '#app/components/article-chat.tsx'
import { Icon } from '#app/components/ui/icon'
import { cn } from '#app/utils/misc.tsx'

/**
 * The chat's shell: where the chat sits on the page. The phone has a fixed
 * dock at the bottom (the composer, one status line) and a sheet that
 * slides up between the page's top bar and the dock. A wide screen has a
 * round launcher bottom-right and a popup above it. Every piece of chat
 * state lives in ArticleEditor; these components only place its children.
 *
 * Geometry goes through CSS variables and classes, not inline `calc()`:
 * `--editor-top` and `--editor-bottom` come from the editor root (the
 * page's sticky bars), `--keyboard-inset` is the software keyboard's height
 * and `--dock-height` the dock's measured height.
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
/** Above the page's bottom bar, plus the keyboard when it is up. */
const DOCK_BOTTOM_CLASS =
	'bottom-[calc(var(--keyboard-inset)+var(--editor-bottom))]'
const SHEET_BOTTOM_CLASS =
	'bottom-[calc(var(--keyboard-inset)+var(--dock-height)+var(--editor-bottom))]'
const CORNER_BOTTOM_CLASS = 'bottom-[calc(var(--editor-bottom)+1rem)]'
const POPUP_HEIGHT_CLASS =
	'h-[min(70vh,calc(100vh-var(--editor-top)-var(--editor-bottom)-2rem))]'
const SAFE_AREA_PADDING_CLASS = 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'

const noop = () => {}

/* ------------------------------------------------------------------------ */
/* The phone: the dock, the status line, the arrow, the sheet               */
/* ------------------------------------------------------------------------ */

/**
 * The fixed container at the bottom of the phone screen. One DOM element in
 * both chat states, so the composer inside it never remounts. It rises with
 * the keyboard (`keyboardInset`) and sits above the page's bottom bar. The
 * ChatComposer inside it takes `className="space-y-2 px-3 pt-2"` (the dock's
 * own top line is the only one) and `trailing={<ChatToggle … />}`.
 */
export const ChatDock = forwardRef<
	HTMLDivElement,
	{ keyboardInset: number; children: React.ReactNode }
>(function ChatDock({ keyboardInset, children }, ref) {
	return (
		<div
			ref={ref}
			data-chat-dock=""
			className={cn(
				'fixed inset-x-0 z-30 border-t bg-background/95 backdrop-blur',
				DOCK_BOTTOM_CLASS,
				keyboardInset ? 'pb-2' : SAFE_AREA_PADDING_CLASS,
			)}
			style={
				{ '--keyboard-inset': `${keyboardInset}px` } as React.CSSProperties
			}
		>
			{children}
		</div>
	)
})

export type StatusLineProps = {
	/** A chat turn runs. */
	running: boolean
	/** The newest answer she has not seen (an assistant, change or error row), or null. */
	entry: ChatEntry | null
	/** No rows at all: the line invites the first message. */
	empty: boolean
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
 * One line above the composer while the sheet is closed: the working dots,
 * the newest unseen answer, or the invitation to a first message. Absent
 * when there is history and nothing unseen.
 */
export function StatusLine({
	running,
	entry,
	empty,
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
	} else if (empty) {
		content = (
			<button type="button" onClick={onOpen} className="text-left">
				{ARTICLE_CHAT_COPY.emptyTitle}
			</button>
		)
	} else {
		return null
	}
	return (
		<div
			role="status"
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

/** The arrow at the end of the dock's composer row: opens and closes the sheet. */
export function ChatToggle({
	open,
	onOpen,
	onClose,
}: {
	open: boolean
	onOpen: () => void
	onClose: () => void
}) {
	return (
		<button
			type="button"
			aria-label={open ? CHAT_SHELL_COPY.closeChat : CHAT_SHELL_COPY.openChat}
			aria-expanded={open}
			aria-controls={CHAT_SHEET_ID}
			onClick={open ? onClose : onOpen}
			className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
		>
			<Icon name={open ? 'chevron-down' : 'chevron-up'} className="h-5 w-5" />
		</button>
	)
}

/**
 * The phone chat, fixed between the page's top bar and the dock. Not modal:
 * the top bar and the dock stay in reach. Closes on the `×`, Escape, and a
 * swipe down its header. Mount it only while the chat is open.
 */
export function ChatSheet({
	stickyTop,
	keyboardInset,
	dockHeight,
	onClose,
	children,
}: {
	/** px: the page's sticky top bar; the sheet starts under it. */
	stickyTop: number
	keyboardInset: number
	dockHeight: number
	onClose: () => void
	/** The ChatList, with `className="min-h-0 flex-1 overscroll-contain px-4"`. */
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

	return (
		<section
			id={CHAT_SHEET_ID}
			role="dialog"
			aria-label={CHAT_SHELL_COPY.chatTitle}
			className={cn(
				'fixed inset-x-0 z-[29] flex flex-col bg-background motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200',
				SHEET_BOTTOM_CLASS,
			)}
			style={
				{
					top: `${stickyTop}px`,
					'--keyboard-inset': `${keyboardInset}px`,
					'--dock-height': `${dockHeight}px`,
				} as React.CSSProperties
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
