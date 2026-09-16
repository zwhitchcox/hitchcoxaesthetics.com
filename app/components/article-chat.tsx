import { useEffect, useRef, useState } from 'react'
import {
	AttachButton,
	AttachmentThumb,
	type useArticleAttachment,
} from '#app/components/article-attachments.tsx'
import {
	DictateButton,
	DictationNote,
	GhostTextarea,
	type Dictation,
} from '#app/components/dictation.tsx'
import { Icon } from '#app/components/ui/icon'
import {
	CHAT_COPY,
	summaryLine,
	type ChatMessageJson,
} from '#app/utils/article-chat.ts'
import { cn } from '#app/utils/misc.tsx'

/**
 * The chat that edits the article: the list of messages and the composer.
 * Both are presentational. Every piece of state (the entries, the words in
 * the box, the quote, the picture, the ghost text) lives in ArticleEditor,
 * because Radix Tabs unmounts this panel on a tab switch.
 */

export const ARTICLE_CHAT_COPY = {
	emptyTitle: 'Ask a question or say what to change.',
	emptyExample:
		'For example: is 20 units the usual dose? Or: make the second paragraph shorter, and say we offer Dysport too.',
	placeholder: 'Say or type what to change…',
	quotePlaceholder: 'What should change here? Or ask about it.',
	send: 'Send',
	removeQuote: 'Remove the quote',
	showPicture: 'Show the picture larger',
	working: 'Working on it…',
	usually: 'Usually 10 to 20 seconds.',
	seeIt: 'See it',
	undo: 'Undo',
	undone: 'Undone.',
	tryAgain: 'Try again',
	assistant: 'Assistant:',
	today: 'Today',
	yesterday: 'Yesterday',
	// The lines the server and the client share come from the chat module.
	pictureChanged: CHAT_COPY.pictureChanged,
	notSaved: CHAT_COPY.notSaved,
	network: CHAT_COPY.network,
	tooMany: CHAT_COPY.tooMany,
	notSetUp: CHAT_COPY.notSetUp,
	noAnswer: CHAT_COPY.noAnswer,
	tooLong: CHAT_COPY.tooLong,
	decided: CHAT_COPY.decided,
	conflictLine: CHAT_COPY.conflict,
	decidedComposer: 'This one is decided. Reopen it to change it.',
	conflictComposer: 'Choose Use the new text or Keep mine first.',
} as const

export { summaryLine }

/** The second "working" line shows after this long. */
export const WORKING_HINT_MS = 6000
/** The list follows a new entry only when the reader was this close to the bottom. */
export const NEAR_BOTTOM_PX = 120
const MAX_ROWS = 6
/** The text links in a row: See it, Undo, Try again. */
const ROW_LINK_CLASS = 'text-primary underline-offset-2 hover:underline'
/** The same links in the phone dock: a 44 px tap target. */
export const DOCK_TARGET_CLASS = 'inline-flex min-h-11 items-center px-3'

/** What one send carries; kept for Try again. */
export type ComposerPayload = {
	text: string
	quote: string | null
	imageId: string | null
}

export type ChatEntry =
	| (ChatMessageJson & {
			/** An optimistic row that waits for the server. */
			pending?: boolean
	  })
	| { id: string; role: 'error'; text: string; retry: ComposerPayload }

/** What `useArticleAttachment` returns: the picture attached to the next message and its state. */
export type AttachmentState = ReturnType<typeof useArticleAttachment>

/** `Today`, `Yesterday`, else `Sep 12`. */
export function dayLabel(iso: string, now = new Date()): string {
	const at = new Date(iso)
	if (Number.isNaN(at.getTime())) return ''
	const dayStart = (d: Date) =>
		new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
	const diff = Math.round((dayStart(now) - dayStart(at)) / 86_400_000)
	if (diff === 0) return ARTICLE_CHAT_COPY.today
	if (diff === 1) return ARTICLE_CHAT_COPY.yesterday
	return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ------------------------------------------------------------------------ */
/* The list                                                                 */
/* ------------------------------------------------------------------------ */

export function ChatList({
	entries,
	running,
	undoRowId,
	undoneIds,
	undoBusy,
	onSeeIt,
	onUndo,
	onRetry,
	onZoom,
	className,
}: {
	entries: ReadonlyArray<ChatEntry>
	running: boolean
	/** The newest change row of this visit: the one with Undo. */
	undoRowId: string | null
	undoneIds: ReadonlySet<string>
	undoBusy: boolean
	onSeeIt: () => void
	onUndo: () => void
	onRetry: (payload: ComposerPayload) => void
	onZoom: (src: string, alt: string) => void
	className?: string
}) {
	const listRef = useRef<HTMLDivElement>(null)
	const nearBottomRef = useRef(true)
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

	// On open: the bottom. After a new entry: the bottom only when she was near it.
	useEffect(() => {
		const el = listRef.current
		if (!el) return
		if (nearBottomRef.current) el.scrollTop = el.scrollHeight
	}, [entries.length, running])

	function onScroll() {
		const el = listRef.current
		if (!el) return
		nearBottomRef.current =
			el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
	}

	function toggle(id: string) {
		setExpanded(current => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	let lastDay = ''
	const rows: React.ReactNode[] = []
	for (const entry of entries) {
		if (entry.role !== 'error') {
			const day = dayLabel(entry.createdAt)
			if (day && day !== lastDay) {
				lastDay = day
				rows.push(
					<p
						key={`day-${entry.id}`}
						className="my-2 text-center text-xs text-muted-foreground"
					>
						{day}
					</p>,
				)
			}
		}
		rows.push(
			<ChatRow
				key={entry.id}
				entry={entry}
				expanded={expanded.has(entry.id)}
				onToggle={() => toggle(entry.id)}
				canUndo={entry.id === undoRowId}
				undone={undoneIds.has(entry.id)}
				undoBusy={undoBusy}
				onSeeIt={onSeeIt}
				onUndo={onUndo}
				onRetry={onRetry}
				onZoom={onZoom}
			/>,
		)
	}

	return (
		<div
			ref={listRef}
			onScroll={onScroll}
			data-chat-list=""
			className={cn(
				'min-h-0 flex-1 overflow-y-auto overscroll-contain',
				className,
			)}
		>
			{entries.length === 0 ? (
				<div className="pt-2 text-sm text-muted-foreground">
					<p>{ARTICLE_CHAT_COPY.emptyTitle}</p>
					<p className="mt-1">{ARTICLE_CHAT_COPY.emptyExample}</p>
				</div>
			) : null}
			<div className="space-y-3 py-2">
				{rows}
				{running ? <WorkingRow /> : null}
			</div>
		</div>
	)
}

export function ChatRow({
	entry,
	expanded,
	onToggle,
	canUndo,
	undone,
	undoBusy,
	onSeeIt,
	onUndo,
	onRetry,
	onZoom,
	dock = false,
}: {
	entry: ChatEntry
	expanded: boolean
	onToggle: () => void
	canUndo: boolean
	undone: boolean
	undoBusy: boolean
	onSeeIt: () => void
	onUndo: () => void
	onRetry: (payload: ComposerPayload) => void
	onZoom: (src: string, alt: string) => void
	/** In the phone dock: See it, Undo and Try again are 44 px tap targets. */
	dock?: boolean
}) {
	if (entry.role === 'error') {
		return (
			<p
				role="alert"
				className={cn(
					'text-sm text-muted-foreground',
					dock ? 'flex flex-wrap items-center gap-x-2 gap-y-1' : '',
				)}
			>
				{entry.text}
				{dock ? null : ' '}
				<button
					type="button"
					onClick={() => onRetry(entry.retry)}
					className={cn(
						'font-medium',
						ROW_LINK_CLASS,
						dock ? DOCK_TARGET_CLASS : '',
					)}
				>
					{ARTICLE_CHAT_COPY.tryAgain}
				</button>
			</p>
		)
	}
	if (entry.role === 'user') {
		return (
			<div className="flex justify-end">
				<div
					className={cn(
						'max-w-[85%] space-y-2 rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-base',
						entry.pending ? 'opacity-70' : '',
					)}
					aria-busy={entry.pending ? 'true' : undefined}
				>
					{entry.quote ? (
						<blockquote className="border-l-2 pl-2 text-sm italic text-muted-foreground">
							<button
								type="button"
								onClick={onToggle}
								aria-expanded={expanded}
								className={cn(
									'block text-left',
									expanded ? '' : 'line-clamp-4',
								)}
							>
								{entry.quote}
							</button>
						</blockquote>
					) : null}
					{entry.imageUrl ? (
						<button
							type="button"
							aria-label={ARTICLE_CHAT_COPY.showPicture}
							onClick={() => onZoom(entry.imageUrl ?? '', '')}
							className="block"
						>
							<img
								src={entry.imageUrl}
								alt=""
								className="max-h-40 rounded object-contain"
							/>
						</button>
					) : null}
					{entry.text ? (
						<p className="whitespace-pre-wrap">{entry.text}</p>
					) : null}
				</div>
			</div>
		)
	}
	if (entry.role === 'assistant') {
		return (
			<div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
				<span className="sr-only">{ARTICLE_CHAT_COPY.assistant} </span>
				{entry.text}
			</div>
		)
	}
	// a change row
	if (undone) {
		return (
			<p className="text-sm text-muted-foreground">
				{ARTICLE_CHAT_COPY.undone}
			</p>
		)
	}
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
			<Icon
				name="check"
				className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400"
			/>
			{entry.imageUrl ? (
				<img
					src={entry.imageUrl}
					alt=""
					className="h-10 w-10 rounded object-cover"
				/>
			) : null}
			<span>{summaryLine(entry.text)}</span>
			<button
				type="button"
				onClick={onSeeIt}
				className={cn(ROW_LINK_CLASS, dock ? DOCK_TARGET_CLASS : '')}
			>
				{ARTICLE_CHAT_COPY.seeIt}
			</button>
			{canUndo ? (
				<button
					type="button"
					disabled={undoBusy}
					onClick={onUndo}
					className={cn(
						ROW_LINK_CLASS,
						'disabled:opacity-50',
						dock ? DOCK_TARGET_CLASS : '',
					)}
				>
					{ARTICLE_CHAT_COPY.undo}
				</button>
			) : null}
		</div>
	)
}

export function WorkingRow() {
	const [long, setLong] = useState(false)
	useEffect(() => {
		const timer = setTimeout(() => setLong(true), WORKING_HINT_MS)
		return () => clearTimeout(timer)
	}, [])
	return (
		<div aria-live="polite" className="text-sm text-muted-foreground">
			<p className="flex items-center gap-2">
				<span className="flex items-center gap-1" aria-hidden="true">
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
				</span>
				{ARTICLE_CHAT_COPY.working}
			</p>
			{long ? <p className="mt-1">{ARTICLE_CHAT_COPY.usually}</p> : null}
		</div>
	)
}

/* ------------------------------------------------------------------------ */
/* The composer                                                             */
/* ------------------------------------------------------------------------ */

export function ChatComposer({
	text,
	ghost,
	onTextChange,
	quote,
	onRemoveQuote,
	attachment,
	dictation,
	running,
	note,
	canSend,
	onSend,
	enterSends,
	boxRef,
	trailing,
	className,
}: {
	text: string
	ghost: string
	onTextChange: (text: string) => void
	quote: string | null
	onRemoveQuote: () => void
	attachment: AttachmentState
	dictation: Dictation
	/** A chat turn runs: the box is read-only, the buttons are off. */
	running: boolean
	/** Replaces the composer (a decided row, a conflict that waits). */
	note: string | null
	canSend: boolean
	onSend: () => void
	/** Enter sends (a physical keyboard); else Enter is a new line. */
	enterSends: boolean
	boxRef: React.RefObject<HTMLTextAreaElement>
	/** Rendered after the Send button, inside the row (the phone dock's save mark). */
	trailing?: React.ReactNode
	/** Replaces the whole wrapper class string; the note line then drops its top line too (the dock draws its own). */
	className?: string
}) {
	const [expanded, setExpanded] = useState(false)

	// One to six rows, from the text.
	useEffect(() => {
		const el = boxRef.current
		if (!el) return
		el.style.height = 'auto'
		const line = parseFloat(getComputedStyle(el).lineHeight) || 24
		const max = line * MAX_ROWS + 16
		el.style.height = `${Math.min(el.scrollHeight, max)}px`
	}, [text, ghost, boxRef])

	if (note) {
		// Inside the dock the container draws the top line; no second one here.
		return (
			<div
				className={cn(
					'pt-3 text-sm text-muted-foreground',
					className === undefined ? 'border-t' : 'px-3',
				)}
			>
				<p>{note}</p>
			</div>
		)
	}

	const busy =
		running || dictation.listening || attachment.status === 'uploading'

	return (
		<div className={className ?? 'space-y-2 border-t pt-2'}>
			{quote ? (
				<div className="flex items-start gap-2">
					<blockquote className="min-w-0 flex-1 border-l-2 pl-3 text-sm italic text-muted-foreground">
						<button
							type="button"
							onClick={() => setExpanded(current => !current)}
							aria-expanded={expanded}
							className={cn(
								'block w-full text-left',
								expanded ? '' : 'line-clamp-3',
							)}
						>
							{quote}
						</button>
					</blockquote>
					<button
						type="button"
						aria-label={ARTICLE_CHAT_COPY.removeQuote}
						onClick={onRemoveQuote}
						disabled={running}
						className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent"
					>
						<Icon name="x" className="h-4 w-4" />
					</button>
				</div>
			) : null}
			<AttachmentThumb
				attachment={attachment.attachment}
				status={attachment.status}
				error={attachment.error}
				previewUrl={attachment.previewUrl}
				onRemove={attachment.remove}
				onRetry={attachment.retry}
			/>
			<div className="flex items-end gap-2">
				<div className="flex shrink-0 items-center gap-1">
					<DictateButton dictation={dictation} disabled={running} />
					<AttachButton onPick={attachment.pickFile} disabled={busy} />
				</div>
				<div className="min-w-0 flex-1">
					<label htmlFor="article-chat-box" className="sr-only">
						Message
					</label>
					<GhostTextarea
						id="article-chat-box"
						ref={boxRef}
						value={text}
						ghost={ghost}
						listening={dictation.listening}
						readOnly={running}
						aria-busy={running}
						rows={1}
						className={cn(
							'min-h-10 resize-none text-base leading-6',
							// While the ghost words sit over the box, GhostTextarea keeps the placeholder transparent under them.
							dictation.listening || ghost
								? ''
								: 'placeholder:text-muted-foreground/60',
						)}
						placeholder={
							quote
								? ARTICLE_CHAT_COPY.quotePlaceholder
								: ARTICLE_CHAT_COPY.placeholder
						}
						onChange={event => onTextChange(event.currentTarget.value)}
						onKeyDown={event => {
							if (!enterSends || event.key !== 'Enter' || event.shiftKey) return
							if (event.nativeEvent.isComposing) return
							event.preventDefault()
							if (canSend) onSend()
						}}
						onPaste={event => {
							const file = Array.from(event.clipboardData?.files ?? [])[0]
							if (file && file.type.startsWith('image/')) {
								event.preventDefault()
								attachment.pickFile(file)
							}
						}}
					/>
				</div>
				<button
					type="button"
					aria-label={ARTICLE_CHAT_COPY.send}
					disabled={!canSend}
					onClick={onSend}
					className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
				>
					<Icon name="arrow-up" className="h-5 w-5" />
				</button>
				{trailing}
			</div>
			<DictationNote dictation={dictation} />
		</div>
	)
}
