/**
 * The formatting controls of the rich editor: the phone row in the dock,
 * the desktop bubble over the selection, and the link row both use.
 *
 * Every button acts on `pointerdown` and prevents its default, so the
 * editor keeps its focus and its selection and the iOS keyboard stays up.
 * The parent runs the command on the view (`onCommand`), opens the link
 * row (`onLink`) and takes the quote for the chat (`comment`).
 */
import { NodeSelection } from 'prosemirror-state'
import { type EditorView } from 'prosemirror-view'
import {
	useId,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { COMMENT_COPY } from '#app/components/comment-on-this.tsx'
import { type EditorSelection } from '#app/components/rich-editor.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	type EditorCommand,
	articleSchema,
	linkRangeAt,
} from '#app/utils/article-markdown.ts'
import { cn } from '#app/utils/misc.tsx'
import { type IconName } from '@/icon-name'

export const TOOLBAR_COPY = {
	toolbar: 'Formatting',
	bold: 'Bold',
	italic: 'Italic',
	heading: 'Heading',
	smallHeading: 'Small heading',
	bullets: 'Bullet list',
	link: 'Link',
	comment: COMMENT_COPY.button,
	/** The phone row's short label; the button's name stays `comment`. */
	commentShort: 'Comment',
	linkLabel: 'Link address',
	linkPlaceholder: 'https://…',
	addLink: 'Add the link',
	removeLink: 'Remove the link',
	cancel: 'Cancel',
	badLink: 'That is not a web address.',
} as const

export type FormatAction = {
	id: EditorCommand
	label: string
	/** The glyph. An action without one shows its `text` alone. */
	icon?: IconName
	/** The letters of a heading level. */
	text?: string
}

export const FORMAT_ACTIONS: FormatAction[] = [
	{ id: 'strong', label: TOOLBAR_COPY.bold, icon: 'font-bold' },
	{ id: 'em', label: TOOLBAR_COPY.italic, icon: 'font-italic' },
	{ id: 'heading2', label: TOOLBAR_COPY.heading, text: 'H2' },
	{ id: 'heading3', label: TOOLBAR_COPY.smallHeading, text: 'H3' },
	{ id: 'bulletList', label: TOOLBAR_COPY.bullets, icon: 'list-bullet' },
]

/** The key of each shortcut the keymap has (article-markdown.ts). */
const SHORTCUT_KEY: Partial<Record<EditorCommand | 'link', string>> = {
	strong: 'B',
	em: 'I',
	link: 'K',
}

/** `Bold (⌘B)` on a Mac or an iPhone, `Bold (Ctrl+B)` elsewhere; the label alone without a shortcut. */
function buttonTitle(label: string, key: string | undefined): string {
	if (!key) return label
	const mac =
		typeof navigator !== 'undefined' &&
		/Mac|iPhone|iPad|iPod/.test(navigator.platform)
	return `${label} (${mac ? `⌘${key}` : `Ctrl+${key}`})`
}

type ToolbarProps = {
	selection: EditorSelection | null
	onCommand: (command: EditorCommand) => void
	/** Opens the link row. */
	onLink: () => void
	/** Takes the quote for the chat. Null hides the button (an own-words row). */
	comment: ((quote: string) => void) | null
	linkOpen: boolean
	/** The link row closed. */
	onLinkDone: () => void
	view: EditorView | null
	/** True while a chat turn runs. Read from the view when not given. */
	locked?: boolean
}

/** The link row has something to work on: selected text, or a caret inside a link. */
export function canLink(selection: EditorSelection | null): boolean {
	return selection !== null && (!selection.empty || selection.link != null)
}

function ToolButton({
	label,
	title,
	pressed,
	disabled,
	onAct,
	className,
	children,
}: {
	label: string
	title?: string
	pressed?: boolean
	disabled?: boolean
	onAct: () => void
	className?: string
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={title ?? label}
			aria-pressed={pressed}
			disabled={disabled}
			onPointerDown={event => {
				event.preventDefault()
				if (!disabled) onAct()
			}}
			className={cn(
				'inline-flex shrink-0 items-center justify-center gap-1 text-sm font-medium aria-pressed:bg-accent aria-pressed:text-accent-foreground disabled:opacity-40',
				className,
			)}
		>
			{children}
		</button>
	)
}

/**
 * The seven controls, shared by the row and the bubble. A heading action
 * shows its letters alone. `compact` (the phone row) shows "Comment" on
 * the comment button; its name stays "Comment on this".
 */
function FormatButtons({
	selection,
	onCommand,
	onLink,
	comment,
	buttonClass,
	compact = false,
}: Pick<ToolbarProps, 'selection' | 'onCommand' | 'onLink' | 'comment'> & {
	buttonClass: string
	compact?: boolean
}) {
	const quote = selection?.quote ?? null
	return (
		<>
			{FORMAT_ACTIONS.map(action => (
				<ToolButton
					key={action.id}
					label={action.label}
					title={buttonTitle(action.label, SHORTCUT_KEY[action.id])}
					pressed={selection?.active[action.id] ?? false}
					onAct={() => onCommand(action.id)}
					className={buttonClass}
				>
					{action.icon ? <Icon name={action.icon} size="sm" /> : null}
					{action.text ? <span aria-hidden>{action.text}</span> : null}
				</ToolButton>
			))}
			<ToolButton
				label={TOOLBAR_COPY.link}
				title={buttonTitle(TOOLBAR_COPY.link, SHORTCUT_KEY.link)}
				pressed={selection?.link != null}
				disabled={!canLink(selection)}
				onAct={onLink}
				className={buttonClass}
			>
				<Icon name="link-2" size="sm" />
			</ToolButton>
			{comment ? (
				<>
					<hr
						aria-orientation="vertical"
						className="mx-1 h-6 w-px shrink-0 border-0 bg-border"
					/>
					<ToolButton
						label={TOOLBAR_COPY.comment}
						disabled={quote === null}
						onAct={() => {
							if (quote !== null) comment(quote)
						}}
						className={cn(buttonClass, 'ml-auto px-2')}
					>
						{compact ? null : <Icon name="chat-bubble" size="sm" />}
						<span>
							{compact ? TOOLBAR_COPY.commentShort : TOOLBAR_COPY.comment}
						</span>
					</ToolButton>
				</>
			) : null}
		</>
	)
}

/** The phone row in the dock: the controls, or the link row in their place. Sized to fit a 375 px screen. */
export function FormatRow({
	selection,
	onCommand,
	onLink,
	comment,
	linkOpen,
	onLinkDone,
	view,
	locked,
}: ToolbarProps) {
	if (!view || (locked ?? !view.editable)) return null
	if (linkOpen)
		return <LinkRow view={view} selection={selection} onDone={onLinkDone} />
	return (
		<div
			role="toolbar"
			aria-label={TOOLBAR_COPY.toolbar}
			className="flex h-11 items-center gap-1 overflow-x-auto px-1"
		>
			<FormatButtons
				selection={selection}
				onCommand={onCommand}
				onLink={onLink}
				comment={comment}
				buttonClass="h-11 min-w-10 rounded-md"
				compact
			/>
		</div>
	)
}

const BUBBLE_GAP_ABOVE = 44
const BUBBLE_GAP_BELOW = 8

function resizeSubscribe(onChange: () => void) {
	if (typeof window === 'undefined') return () => {}
	window.addEventListener('resize', onChange)
	return () => window.removeEventListener('resize', onChange)
}

function resizeSnapshot() {
	return typeof window === 'undefined'
		? ''
		: `${window.innerWidth}x${window.innerHeight}`
}

/**
 * Where the bubble sits inside the wrapper: above the selection, or below
 * it when above would leave the wrapper or sit under the page's sticky
 * bars (`minTop`, in viewport px).
 */
function placeBubble(
	view: EditorView,
	wrapper: HTMLElement,
	selection: EditorSelection,
	width: number,
	minTop: number,
): { top: number; left: number } {
	const a = view.coordsAtPos(selection.from)
	const b = view.coordsAtPos(selection.to)
	const box = wrapper.getBoundingClientRect()
	const above = Math.min(a.top, b.top) - BUBBLE_GAP_ABOVE
	const top =
		above - box.top < 0 || above < minTop
			? Math.max(a.bottom, b.bottom) - box.top + BUBBLE_GAP_BELOW
			: above - box.top
	const centre = (a.left + b.left) / 2 - box.left - width / 2
	const left = Math.min(Math.max(centre, 0), Math.max(0, box.width - width))
	return { top, left }
}

/**
 * The desktop bubble over the selection, rendered into the `relative`
 * editor wrapper so a page scroll needs no listener. Hidden with an empty
 * selection, a selected picture, while locked, and while neither the
 * editor nor the link row has focus. It is placed after every render and
 * on a window resize, with its own measured width; it goes below the
 * selection when above would put it under the page's sticky bars.
 */
export function BubbleMenu({
	selection,
	onCommand,
	onLink,
	comment,
	linkOpen,
	onLinkDone,
	view,
	wrapper,
	locked,
	minTop = 0,
}: ToolbarProps & {
	wrapper: HTMLElement | null
	/** px from the top of the viewport that the page's sticky bars cover. */
	minTop?: number
}) {
	const bubbleRef = useRef<HTMLDivElement>(null)
	useSyncExternalStore(resizeSubscribe, resizeSnapshot, () => '')
	const shown =
		view &&
		wrapper &&
		selection &&
		!selection.empty &&
		!(locked ?? !view.editable) &&
		!(view.state.selection instanceof NodeSelection) &&
		(linkOpen || view.hasFocus())
			? { view, wrapper, selection }
			: null
	useLayoutEffect(() => {
		const bubble = bubbleRef.current
		if (!shown || !bubble) return
		const place = placeBubble(
			shown.view,
			shown.wrapper,
			shown.selection,
			bubble.offsetWidth,
			minTop,
		)
		bubble.style.top = `${place.top}px`
		bubble.style.left = `${place.left}px`
	})
	if (!shown) return null
	return createPortal(
		<div
			ref={bubbleRef}
			role="toolbar"
			aria-label={TOOLBAR_COPY.toolbar}
			className={cn(
				'absolute z-20 flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md',
				linkOpen ? 'h-auto' : 'h-9',
			)}
		>
			{linkOpen ? (
				<LinkRow view={view} selection={selection} onDone={onLinkDone} />
			) : (
				<FormatButtons
					selection={selection}
					onCommand={onCommand}
					onLink={onLink}
					comment={comment}
					buttonClass="h-7 min-w-7 rounded px-1"
				/>
			)}
		</div>,
		shown.wrapper,
	)
}

/**
 * The range the link row works on, read from the view when Add or Remove
 * runs: the selection, or the link around a collapsed one. The state's
 * selection follows every change made while the row is open (Undo, Use
 * the new text, a restored draft), so the mark lands on the same words.
 */
function linkRangeNow(view: EditorView): { from: number; to: number } | null {
	const { doc, selection } = view.state
	const range = selection.empty
		? linkRangeAt(doc, selection.from)
		: { from: selection.from, to: selection.to }
	return range && range.to <= doc.content.size
		? { from: range.from, to: range.to }
		: null
}

/**
 * The typed text as a web address: `https://` added when there is no
 * scheme, then the parsed form (a space or an angle bracket in an http
 * address is percent-encoded there; a paren is encoded here, so the
 * markdown link needs no escape). Null when it is not http, https or
 * mailto, or when a character would end the markdown link early.
 */
function webAddress(raw: string): string | null {
	const text = raw.trim()
	if (!text) return null
	const address = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
	try {
		const url = new URL(address)
		if (
			url.protocol !== 'http:' &&
			url.protocol !== 'https:' &&
			url.protocol !== 'mailto:'
		)
			return null
		const href = url.href.replace(/[()]/g, c => (c === '(' ? '%28' : '%29'))
		return /[\s<>]/.test(href) ? null : href
	} catch {
		return null
	}
}

/**
 * The link row: the address box, Add the link, Remove the link (when the
 * selection has a link) and Cancel. Enter adds, Escape cancels. Focus
 * returns to the editor on close.
 */
export function LinkRow({
	view,
	selection,
	onDone,
}: {
	view: EditorView | null
	selection: EditorSelection | null
	onDone: () => void
}) {
	const id = useId()
	const [value, setValue] = useState(() => selection?.link ?? '')
	const [error, setError] = useState<string | null>(null)
	const link = articleSchema.marks.link!

	const close = () => {
		onDone()
		view?.focus()
	}
	const add = () => {
		const href = webAddress(value)
		if (!href) {
			setError(TOOLBAR_COPY.badLink)
			return
		}
		const range = view && linkRangeNow(view)
		if (view && range)
			view.dispatch(
				view.state.tr.addMark(range.from, range.to, link.create({ href })),
			)
		close()
	}
	const remove = () => {
		const range = view && linkRangeNow(view)
		if (view && range)
			view.dispatch(view.state.tr.removeMark(range.from, range.to, link))
		close()
	}

	return (
		<div className="flex min-h-11 flex-wrap items-center gap-2 px-2 py-1">
			<input
				aria-label={TOOLBAR_COPY.linkLabel}
				type="url"
				inputMode="url"
				autoCapitalize="none"
				autoCorrect="off"
				spellCheck={false}
				autoFocus
				placeholder={TOOLBAR_COPY.linkPlaceholder}
				value={value}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				onChange={event => {
					setValue(event.currentTarget.value)
					setError(null)
				}}
				onKeyDown={event => {
					if (event.key === 'Enter') {
						event.preventDefault()
						add()
					} else if (event.key === 'Escape') {
						event.preventDefault()
						close()
					}
				}}
				className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-base"
			/>
			<button
				type="button"
				onClick={add}
				className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
			>
				{TOOLBAR_COPY.addLink}
			</button>
			{selection?.link != null ? (
				<button
					type="button"
					onClick={remove}
					className="h-9 shrink-0 rounded-md border px-3 text-sm"
				>
					{TOOLBAR_COPY.removeLink}
				</button>
			) : null}
			<button
				type="button"
				onClick={close}
				className="h-9 shrink-0 rounded-md px-3 text-sm"
			>
				{TOOLBAR_COPY.cancel}
			</button>
			{error ? (
				<p
					id={`${id}-error`}
					role="alert"
					className="basis-full text-sm text-destructive"
				>
					{error}
				</p>
			) : null}
		</div>
	)
}
