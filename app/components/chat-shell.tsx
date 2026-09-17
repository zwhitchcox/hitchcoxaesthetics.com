import { forwardRef, useEffect, useRef } from 'react'
import {
	ChatRow,
	DOCK_TARGET_CLASS,
	WorkingRow,
	type ChatEntry,
	type ComposerPayload,
} from '#app/components/article-chat.tsx'
import { Icon } from '#app/components/ui/icon'
import { cn } from '#app/utils/misc.tsx'

/**
 * The chat's shell: where the chat sits on the page. The phone has a dock
 * at the bottom (the composer, one status line, two tabs on its top edge:
 * the chat and the decisions), a sheet that slides up between the page's
 * top bar and the dock, and a decisions panel that rises above the dock. A
 * wide screen has a round launcher bottom-right and a popup above it. Every
 * piece of chat state lives in ArticleEditor; these components only place
 * its children.
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
	openDecisions: 'Open the decisions',
	closeDecisions: 'Close the decisions',
	decisionsTitle: 'Decisions',
} as const

/** The status line shows this much of an answer. */
export const STATUS_LINE_CHARS = 90
/** A drag down the sheet's header this far closes it. */
export const SHEET_SWIPE_PX = 60

const CHAT_SHEET_ID = 'article-chat-sheet'
const CHAT_POPUP_ID = 'article-chat-popup'
const DECISIONS_ID = 'article-decisions'
/** The rail with the keyboard down: at the layout viewport's bottom, above the page's bottom bar. */
const RAIL_BOTTOM_CLASS = 'bottom-[var(--editor-bottom)]'
/** The rail with the keyboard up: anchored at the top; a transform moves it down to the visual viewport's bottom edge. */
const RAIL_KEYBOARD_CLASS = 'top-0'
/** The dock with the keyboard up: no more padding than the row needs. */
const DOCK_KEYBOARD_CLASS = 'py-1'
const SHEET_BOTTOM_CLASS =
	'bottom-[calc(var(--dock-height)+var(--editor-bottom))]'
const CORNER_BOTTOM_CLASS = 'bottom-[calc(var(--editor-bottom)+1rem)]'
const POPUP_HEIGHT_CLASS =
	'h-[min(70vh,calc(100vh-var(--editor-top)-var(--editor-bottom)-2rem))]'
const SAFE_AREA_PADDING_CLASS = 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
/** One tab on the dock's top edge. `relative` for the chat tab's dot. */
const TAB_CLASS =
	'relative flex h-7 w-12 items-center justify-center rounded-t-lg border border-b-0 bg-background'

const noop = () => {}

/**
 * A tab acts on the pointer's down. With the caret in the article the dock
 * is folded; the tap's own default then takes the focus, the article lets
 * go (the keyboard closes) and the dock unfolds. Acting first, the tab has
 * done its work before anything moves, and what opens sits on the unfolded
 * dock, where the next tap finds a still target. The click that follows a
 * pointer adds nothing; a click with no pointer behind it (`detail` 0: a
 * keyboard's activation) acts instead. The pointerdown is not cancelled:
 * a click after a cancelled one is not a given on iOS, and the format
 * row's buttons, which do cancel theirs, never wait for one either.
 */
function tabHandlers(act: () => void) {
	return {
		onPointerDown: () => act(),
		onClick: (event: React.MouseEvent) => {
			if (event.detail === 0) act()
		},
	}
}

/* ------------------------------------------------------------------------ */
/* The phone: the dock and its tabs, the status line, the sheet, the panel  */
/* ------------------------------------------------------------------------ */

/** A tab on the dock's top edge and what it opens. */
export type DockTab = {
	open: boolean
	onOpen: () => void
	onClose: () => void
}

/**
 * The container at the bottom of the phone screen: a zero-height fixed
 * rail and the dock hanging from it (`absolute inset-x-0 bottom-0`), so the
 * dock's bottom edge is the rail's line whatever the dock's height. The
 * rail is there in both keyboard modes and the dock is one DOM element in
 * every state, so the composer inside it never remounts (a remount would
 * drop the focus, and the keyboard with it). The ChatComposer inside it
 * takes `className="space-y-2 px-3 pt-2"` (the dock's own top line is the
 * only one) and `trailing={<SaveState … />}`.
 *
 * Keyboard down: the rail sits at the layout viewport's bottom, above the
 * page's bottom bar (`--editor-bottom`), and the dock keeps the safe-area
 * padding. Keyboard up (`keyboardInset` > 0): the rail is anchored at the
 * top of the layout viewport and a transform moves it down to the visual
 * viewport's bottom edge (`viewportBottom`); no height goes into that
 * offset, so a measurement can never lag behind a fold of the dock. iOS
 * positions a fixed element against the layout viewport, whose height is
 * not always `innerHeight`, so a `bottom` offset can float above the
 * keyboard or hide under it; an offset from the top to the visual
 * viewport's own edge cannot. The keyboard leaves little room, so the
 * padding is then the least (`py-1`, no safe area).
 *
 * Two tabs protrude from the dock's top edge on the right, in both
 * keyboard modes: `chat` opens the sheet (a dot on it while an answer waits
 * unseen), `decisions` opens the DecisionsPanel above the dock. Either is
 * absent without its prop (an own-words row has no chat; a row with no
 * route bar and no decisions has no panel).
 */
export const ChatDock = forwardRef<
	HTMLDivElement,
	{
		keyboardInset: number
		/** px from the layout viewport's top to the visual viewport's bottom edge (useKeyboardInset). */
		viewportBottom: number
		chat?: DockTab & {
			/** An answer arrived while the sheet was closed: the tab shows a dot. */
			unseen?: boolean
		}
		decisions?: DockTab & {
			/** The panel's row: the route's decision buttons, then the editor's bar items. */
			panel: React.ReactNode
		}
		children: React.ReactNode
	}
>(function ChatDock(
	{ keyboardInset, viewportBottom, chat, decisions, children },
	ref,
) {
	const onKeyboard = keyboardInset > 0
	return (
		<div
			data-chat-rail=""
			className={cn(
				'fixed inset-x-0 z-30 h-0',
				onKeyboard ? RAIL_KEYBOARD_CLASS : RAIL_BOTTOM_CLASS,
			)}
			style={
				onKeyboard
					? { transform: `translate3d(0, ${viewportBottom}px, 0)` }
					: undefined
			}
		>
			<div
				ref={ref}
				data-chat-dock=""
				className={cn(
					'absolute inset-x-0 bottom-0 overflow-visible border-t bg-background/95 backdrop-blur',
					onKeyboard ? DOCK_KEYBOARD_CLASS : SAFE_AREA_PADDING_CLASS,
				)}
			>
				{/* Before the tabs in the tree: they paint over its bottom band. */}
				{decisions?.open ? (
					<DecisionsPanel onClose={decisions.onClose}>
						{decisions.panel}
					</DecisionsPanel>
				) : null}
				{chat || decisions ? (
					<div className="absolute -top-7 right-3 flex gap-1">
						{chat ? (
							<button
								type="button"
								aria-label={
									chat.open
										? CHAT_SHELL_COPY.closeChat
										: CHAT_SHELL_COPY.openChat
								}
								aria-expanded={chat.open}
								aria-controls={CHAT_SHEET_ID}
								{...tabHandlers(chat.open ? chat.onClose : chat.onOpen)}
								className={TAB_CLASS}
							>
								<Icon name="chat-bubble" className="h-5 w-5" />
								{chat.unseen && !chat.open ? (
									<span
										aria-hidden="true"
										className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-green-600"
									/>
								) : null}
							</button>
						) : null}
						{decisions ? (
							<button
								type="button"
								aria-label={
									decisions.open
										? CHAT_SHELL_COPY.closeDecisions
										: CHAT_SHELL_COPY.openDecisions
								}
								aria-expanded={decisions.open}
								aria-controls={DECISIONS_ID}
								{...tabHandlers(
									decisions.open ? decisions.onClose : decisions.onOpen,
								)}
								className={TAB_CLASS}
							>
								<Icon name="check" className="h-5 w-5" />
							</button>
						) : null}
					</div>
				) : null}
				{children}
			</div>
		</div>
	)
})

/**
 * The decisions on the phone: the route's decision buttons (Approve; Write
 * a different article), then the editor's bar items (Grill me, the
 * Markdown toggle), in one wrapping row above the dock. It rides on the
 * dock's top edge (`bottom-full` inside the dock), so it follows the dock
 * in both keyboard modes with no measurement. The dock's tabs protrude
 * into its bottom band and paint over it; that band is padding (`pb-9`:
 * the tabs are 28 px tall). Not modal: the article and the dock stay in
 * reach. Escape closes it. Mount it only while open; a decision that
 * submits leaves the page, which closes it too.
 */
function DecisionsPanel({
	onClose,
	children,
}: {
	onClose: () => void
	children: React.ReactNode
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [onClose])
	return (
		<section
			id={DECISIONS_ID}
			role="dialog"
			aria-label={CHAT_SHELL_COPY.decisionsTitle}
			className="absolute inset-x-0 bottom-full flex flex-wrap items-center gap-2 border-t bg-background/95 px-3 pb-9 pt-3 backdrop-blur motion-safe:duration-200 motion-safe:animate-in motion-safe:slide-in-from-bottom"
		>
			{children}
		</section>
	)
}

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
 * keyboard is up its bottom edge is the dock's top edge: the rail's line
 * (`viewportBottom`, see ChatDock) less the dock's measured height. That
 * measurement can lag a frame behind a fold of the dock, which the seam
 * can bear (the dock paints over it); the dock itself needs no height.
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
