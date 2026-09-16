/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { expect, test, vi } from 'vitest'
import {
	ARTICLE_CHAT_COPY,
	ChatComposer,
	ChatRow,
	type AttachmentState,
	type ChatEntry,
} from '#app/components/article-chat.tsx'
import { type Dictation } from '#app/components/dictation.tsx'
import {
	ChatDock,
	ChatLauncher,
	ChatPopup,
	ChatSheet,
	CHAT_SHELL_COPY,
	SHEET_SWIPE_PX,
	STATUS_LINE_CHARS,
	StatusLine,
	type StatusLineProps,
} from '#app/components/chat-shell.tsx'
import { type ChatMessageJson } from '#app/utils/article-chat.ts'

/*
 * The chat shell with plain props: no editor, no ProseMirror, no fetch. The
 * geometry is asserted through the CSS variables and the classes that carry
 * it, because jsdom keeps a custom property verbatim but drops any inline
 * value with var(), max() or min() in it.
 */

const RETRY = { text: 'Say 15 to 25 units.', quote: null, imageId: null }

function row(
	partial: Partial<ChatMessageJson> &
		Pick<ChatMessageJson, 'id' | 'role' | 'text'>,
): ChatMessageJson {
	return {
		quote: null,
		imageId: null,
		imageUrl: null,
		toolName: null,
		createdAt: new Date().toISOString(),
		...partial,
	}
}

function statusProps(
	overrides: Partial<StatusLineProps> = {},
): StatusLineProps {
	return {
		running: false,
		entry: null,
		undoRowId: null,
		undoneIds: new Set(),
		undoBusy: false,
		onOpen: vi.fn(),
		onSeeIt: vi.fn(),
		onUndo: vi.fn(),
		onRetry: vi.fn(),
		...overrides,
	}
}

/** The icon an `<Icon>` draws: the fragment of its `<use href>`. */
function iconOf(button: HTMLElement): string {
	const href = button.querySelector('use')?.getAttribute('href') ?? ''
	return href.slice(href.indexOf('#') + 1)
}

function pointer(el: Element, type: string, clientY: number) {
	fireEvent(el, new MouseEvent(type, { bubbles: true, clientY }))
}

/* ------------------------------------------------------------------------ */
/* The status line                                                          */
/* ------------------------------------------------------------------------ */

test('the status line shows Working on it… while running, as a polite live region', () => {
	render(<StatusLine {...statusProps({ running: true })} />)
	const line = screen.getByRole('status')
	expect(line).toHaveAttribute('aria-live', 'polite')
	expect(line).toHaveTextContent(ARTICLE_CHAT_COPY.working)
	expect(line).not.toHaveTextContent(ARTICLE_CHAT_COPY.emptyTitle)
})

test('the status line shows Changed: with See it and Undo for an unseen change, and Undone. after', async () => {
	const user = userEvent.setup()
	const change = row({
		id: 'c1',
		role: 'change',
		text: 'Said 15 to 25 units.',
		toolName: 'replace_text',
	})
	const onSeeIt = vi.fn()
	const onUndo = vi.fn()
	const props = statusProps({
		entry: change,
		undoRowId: 'c1',
		onSeeIt,
		onUndo,
	})
	const { rerender } = render(<StatusLine {...props} />)
	const line = screen.getByRole('status')
	expect(line).toHaveTextContent('Changed: said 15 to 25 units.')
	await user.click(
		within(line).getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	)
	expect(onSeeIt).toHaveBeenCalledTimes(1)
	await user.click(
		within(line).getByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	)
	expect(onUndo).toHaveBeenCalledTimes(1)

	// An older change row carries no Undo.
	rerender(<StatusLine {...props} undoRowId="c0" />)
	expect(
		within(screen.getByRole('status')).queryByRole('button', {
			name: ARTICLE_CHAT_COPY.undo,
		}),
	).toBeNull()

	rerender(<StatusLine {...props} undoneIds={new Set(['c1'])} />)
	expect(screen.getByRole('status')).toHaveTextContent(ARTICLE_CHAT_COPY.undone)
	expect(
		screen.queryByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	).toBeNull()
})

test('the status line shows the first 90 characters of an answer and Open', async () => {
	const user = userEvent.setup()
	const onOpen = vi.fn()
	const text =
		'Yes, 20 units is the usual dose for the glabella. Some people need less, and a few need more, so the range is wide.'
	expect(text.length).toBeGreaterThan(STATUS_LINE_CHARS)
	const { rerender } = render(
		<StatusLine
			{...statusProps({
				entry: row({ id: 'a1', role: 'assistant', text }),
				onOpen,
			})}
		/>,
	)
	const line = screen.getByRole('status')
	expect(line).toHaveTextContent(`${text.slice(0, STATUS_LINE_CHARS)}…`)
	expect(line).not.toHaveTextContent(text)
	await user.click(
		within(line).getByRole('button', { name: CHAT_SHELL_COPY.open }),
	)
	expect(onOpen).toHaveBeenCalledTimes(1)

	rerender(
		<StatusLine
			{...statusProps({
				entry: row({
					id: 'a2',
					role: 'assistant',
					text: 'Yes, that is usual.',
				}),
			})}
		/>,
	)
	expect(screen.getByRole('status')).toHaveTextContent('Yes, that is usual.')
	expect(screen.getByRole('status')).not.toHaveTextContent('…')
})

test('the status line shows an error with Try again as an alert', async () => {
	const user = userEvent.setup()
	const onRetry = vi.fn()
	const entry: ChatEntry = {
		id: 'e1',
		role: 'error',
		text: ARTICLE_CHAT_COPY.noAnswer,
		retry: RETRY,
	}
	render(<StatusLine {...statusProps({ entry, onRetry })} />)
	const alert = within(screen.getByRole('status')).getByRole('alert')
	expect(alert).toHaveTextContent(ARTICLE_CHAT_COPY.noAnswer)
	await user.click(
		within(alert).getByRole('button', { name: ARTICLE_CHAT_COPY.tryAgain }),
	)
	expect(onRetry).toHaveBeenCalledWith(RETRY)
})

test('the status line is absent with nothing unseen and no turn running: the invitation lives in the list, not over the box', () => {
	const { rerender } = render(<StatusLine {...statusProps({ entry: null })} />)
	expect(screen.queryByRole('status')).toBeNull()
	expect(screen.queryByText(ARTICLE_CHAT_COPY.emptyTitle)).toBeNull()
	// Her own row is never an answer.
	rerender(
		<StatusLine
			{...statusProps({ entry: row({ id: 'u1', role: 'user', text: 'Hi' }) })}
		/>,
	)
	expect(screen.queryByRole('status')).toBeNull()
})

/* ------------------------------------------------------------------------ */
/* The dock and its tab, the sheet                                          */
/* ------------------------------------------------------------------------ */

test('the dock sits at the keyboard inset plus the page bottom bar and drops the safe-area padding with the keyboard up', () => {
	const ref = createRef<HTMLDivElement>()
	const { container, rerender } = render(
		<ChatDock keyboardInset={120} ref={ref}>
			<p>the composer</p>
		</ChatDock>,
	)
	const dock = container.querySelector<HTMLElement>('[data-chat-dock]')
	if (!dock) throw new Error('no dock')
	expect(ref.current).toBe(dock)
	expect(dock).toHaveTextContent('the composer')
	expect(dock.className).toContain('fixed')
	expect(dock.className).toContain(
		'bottom-[calc(var(--keyboard-inset)+var(--editor-bottom))]',
	)
	expect(dock.style.getPropertyValue('--keyboard-inset')).toBe('120px')
	expect(dock.className).toContain('pb-2')
	expect(dock.className).not.toContain('safe-area-inset-bottom')

	rerender(
		<ChatDock keyboardInset={0} ref={ref}>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(dock.style.getPropertyValue('--keyboard-inset')).toBe('0px')
	expect(dock.className).toContain(
		'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
	)
	expect(dock.className).not.toContain('pb-2')
})

test('the composer note line drops its top border inside the dock', () => {
	const props = {
		text: '',
		ghost: '',
		onTextChange: vi.fn(),
		quote: null,
		onRemoveQuote: vi.fn(),
		// The note branch returns before the composer reads these.
		attachment: {} as AttachmentState,
		dictation: {} as Dictation,
		running: false,
		note: ARTICLE_CHAT_COPY.decidedComposer,
		canSend: false,
		onSend: vi.fn(),
		enterSends: false,
		boxRef: createRef<HTMLTextAreaElement>(),
	}
	const { rerender } = render(
		<ChatComposer {...props} className="space-y-2 px-3 pt-2" />,
	)
	const inDock = screen.getByText(
		ARTICLE_CHAT_COPY.decidedComposer,
	).parentElement
	expect(inDock?.className).not.toContain('border-t')
	expect(inDock?.className).toContain('pt-3')
	expect(screen.queryByLabelText('Message')).toBeNull()

	rerender(<ChatComposer {...props} />)
	const alone = screen.getByText(
		ARTICLE_CHAT_COPY.decidedComposer,
	).parentElement
	expect(alone?.className).toContain('border-t')
})

test("the sheet's top is stickyTop and its bottom is the inset plus the dock height", () => {
	render(
		<ChatSheet
			stickyTop={44}
			keyboardInset={120}
			dockHeight={96}
			onClose={vi.fn()}
		>
			<p>the list</p>
		</ChatSheet>,
	)
	const sheet = screen.getByRole('dialog', { name: CHAT_SHELL_COPY.chatTitle })
	expect(sheet.id).toBe('article-chat-sheet')
	expect(sheet).not.toHaveAttribute('aria-modal')
	expect(sheet.style.top).toBe('44px')
	expect(sheet.style.getPropertyValue('--keyboard-inset')).toBe('120px')
	expect(sheet.style.getPropertyValue('--dock-height')).toBe('96px')
	expect(sheet.className).toContain(
		'bottom-[calc(var(--keyboard-inset)+var(--dock-height)+var(--editor-bottom))]',
	)
	expect(
		within(sheet).getByRole('heading', { name: CHAT_SHELL_COPY.chatTitle }),
	).toBeInTheDocument()
	expect(sheet).toHaveTextContent('the list')
})

test('the dock’s tab protrudes from its top edge, reads Open the chat then Close the chat with aria-expanded and aria-controls, and its icon flips; no tab without chat', async () => {
	const user = userEvent.setup()
	const onOpen = vi.fn()
	const onClose = vi.fn()
	const { container, rerender } = render(
		<ChatDock keyboardInset={0} chat={{ open: false, onOpen, onClose }}>
			<p>the composer</p>
		</ChatDock>,
	)
	const dock = container.querySelector<HTMLElement>('[data-chat-dock]')
	if (!dock) throw new Error('no dock')
	expect(dock.className).toContain('overflow-visible')
	const closed = screen.getByRole('button', { name: CHAT_SHELL_COPY.openChat })
	expect(dock.contains(closed)).toBe(true)
	expect(closed).toHaveAttribute('aria-expanded', 'false')
	expect(closed).toHaveAttribute('aria-controls', 'article-chat-sheet')
	const classes = closed.className.split(' ')
	for (const cls of [
		'absolute',
		'-top-7',
		'right-3',
		'h-7',
		'w-12',
		'rounded-t-lg',
		'border',
		'border-b-0',
		'bg-background',
	]) {
		expect(classes, cls).toContain(cls)
	}
	expect(iconOf(closed)).toBe('chevron-up')
	await user.click(closed)
	expect(onOpen).toHaveBeenCalledTimes(1)
	expect(onClose).not.toHaveBeenCalled()

	rerender(
		<ChatDock keyboardInset={0} chat={{ open: true, onOpen, onClose }}>
			<p>the composer</p>
		</ChatDock>,
	)
	const open = screen.getByRole('button', { name: CHAT_SHELL_COPY.closeChat })
	expect(open).toBe(closed)
	expect(open).toHaveAttribute('aria-expanded', 'true')
	expect(iconOf(open)).toBe('chevron-down')
	await user.click(open)
	expect(onClose).toHaveBeenCalledTimes(1)
	expect(onOpen).toHaveBeenCalledTimes(1)

	// an own-words row: no chat, so no tab
	rerender(
		<ChatDock keyboardInset={0}>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(screen.queryByRole('button')).toBeNull()
	expect(dock).toHaveTextContent('the composer')
})

test('Escape closes the sheet and the popup; a 60 px drag down the sheet header closes it', async () => {
	const user = userEvent.setup()
	const onCloseSheet = vi.fn()
	const { unmount } = render(
		<ChatSheet
			stickyTop={44}
			keyboardInset={0}
			dockHeight={80}
			onClose={onCloseSheet}
		>
			<p>the list</p>
		</ChatSheet>,
	)
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(onCloseSheet).toHaveBeenCalledTimes(1)
	await user.click(
		screen.getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	)
	expect(onCloseSheet).toHaveBeenCalledTimes(2)

	const header = screen.getByRole('dialog').firstElementChild
	if (!header) throw new Error('no header')
	pointer(header, 'pointerdown', 100)
	pointer(header, 'pointermove', 100 + SHEET_SWIPE_PX - 10)
	pointer(header, 'pointerup', 100 + SHEET_SWIPE_PX - 10)
	expect(onCloseSheet).toHaveBeenCalledTimes(2)
	pointer(header, 'pointerdown', 100)
	pointer(header, 'pointermove', 100 + SHEET_SWIPE_PX + 10)
	pointer(header, 'pointerup', 100 + SHEET_SWIPE_PX + 10)
	expect(onCloseSheet).toHaveBeenCalledTimes(3)
	unmount()
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(onCloseSheet).toHaveBeenCalledTimes(3)

	const onClosePopup = vi.fn()
	render(
		<>
			<ChatLauncher unseenCount={0} onOpen={vi.fn()} />
			<ChatPopup onClose={onClosePopup}>
				<button type="button">inside</button>
			</ChatPopup>
		</>,
	)
	// With the focus outside, Escape is not the popup's.
	fireEvent.keyDown(document.body, { key: 'Escape' })
	expect(onClosePopup).not.toHaveBeenCalled()
	const inside = screen.getByRole('button', { name: 'inside' })
	inside.focus()
	fireEvent.keyDown(inside, { key: 'Escape' })
	expect(onClosePopup).toHaveBeenCalledTimes(1)
	await Promise.resolve()
	expect(document.activeElement).toBe(
		screen.getByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	)
	await user.click(
		within(screen.getByRole('dialog')).getByRole('button', {
			name: CHAT_SHELL_COPY.closeChat,
		}),
	)
	expect(onClosePopup).toHaveBeenCalledTimes(2)
})

/* ------------------------------------------------------------------------ */
/* The launcher and the popup                                               */
/* ------------------------------------------------------------------------ */

test('the launcher shows the dot and the longer label when unseen > 0, and the popup height rule uses the two CSS variables', async () => {
	const user = userEvent.setup()
	const onOpen = vi.fn()
	const { rerender } = render(<ChatLauncher unseenCount={2} onOpen={onOpen} />)
	const waiting = screen.getByRole('button', {
		name: CHAT_SHELL_COPY.openChatNew,
	})
	expect(waiting).toHaveAttribute('aria-expanded', 'false')
	expect(waiting).toHaveAttribute('aria-controls', 'article-chat-popup')
	expect(waiting.className).toContain(
		'bottom-[calc(var(--editor-bottom)+1rem)]',
	)
	expect(waiting.querySelector('span[aria-hidden="true"]')).not.toBeNull()
	expect(iconOf(waiting)).toBe('chat-bubble')
	await user.click(waiting)
	expect(onOpen).toHaveBeenCalledTimes(1)

	rerender(<ChatLauncher unseenCount={0} onOpen={onOpen} />)
	const quiet = screen.getByRole('button', { name: CHAT_SHELL_COPY.openChat })
	expect(quiet.querySelector('span[aria-hidden="true"]')).toBeNull()

	render(
		<ChatPopup onClose={vi.fn()}>
			<p>the list and the composer</p>
		</ChatPopup>,
	)
	const popup = screen.getByRole('dialog', { name: CHAT_SHELL_COPY.chatTitle })
	expect(popup.id).toBe('article-chat-popup')
	expect(popup).not.toHaveAttribute('aria-modal')
	expect(popup.className).toContain(
		'h-[min(70vh,calc(100vh-var(--editor-top)-var(--editor-bottom)-2rem))]',
	)
	expect(popup.className).toContain('bottom-[calc(var(--editor-bottom)+1rem)]')
	expect(popup.className).toContain('w-96')
	expect(
		within(popup).getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	).toBeInTheDocument()
	expect(popup).toHaveTextContent('the list and the composer')
})

test('in the dock, See it, Undo, Open and Try again are 44 px tap targets; in the list they stay text links', () => {
	const change = row({
		id: 'c1',
		role: 'change',
		text: 'Said 15 to 25 units.',
		toolName: 'replace_text',
	})
	const error: ChatEntry = {
		id: 'e1',
		role: 'error',
		text: ARTICLE_CHAT_COPY.noAnswer,
		retry: RETRY,
	}
	const target = (name: string) =>
		screen.getByRole('button', { name }).className
	const { rerender } = render(
		<StatusLine {...statusProps({ entry: change, undoRowId: 'c1' })} />,
	)
	expect(target(ARTICLE_CHAT_COPY.seeIt)).toContain('min-h-11')
	expect(target(ARTICLE_CHAT_COPY.undo)).toContain('min-h-11')
	rerender(
		<StatusLine
			{...statusProps({
				entry: row({ id: 'a1', role: 'assistant', text: 'Yes.' }),
			})}
		/>,
	)
	expect(target(CHAT_SHELL_COPY.open)).toContain('min-h-11')
	rerender(<StatusLine {...statusProps({ entry: error })} />)
	expect(target(ARTICLE_CHAT_COPY.tryAgain)).toContain('min-h-11')

	const rowProps = {
		expanded: false,
		onToggle: vi.fn(),
		canUndo: true,
		undone: false,
		undoBusy: false,
		onSeeIt: vi.fn(),
		onUndo: vi.fn(),
		onRetry: vi.fn(),
		onZoom: vi.fn(),
	}
	rerender(<ChatRow entry={change} {...rowProps} />)
	expect(target(ARTICLE_CHAT_COPY.seeIt)).not.toContain('min-h-11')
	expect(target(ARTICLE_CHAT_COPY.undo)).not.toContain('min-h-11')
	rerender(<ChatRow entry={error} {...rowProps} />)
	expect(target(ARTICLE_CHAT_COPY.tryAgain)).not.toContain('min-h-11')
})

test('a pointer down on the × does not capture the pointer, and its click closes the sheet', async () => {
	const user = userEvent.setup()
	const onClose = vi.fn()
	render(
		<ChatSheet
			stickyTop={44}
			keyboardInset={0}
			dockHeight={80}
			onClose={onClose}
		>
			<p>the list</p>
		</ChatSheet>,
	)
	const header = screen.getByRole('dialog').firstElementChild
	if (!(header instanceof HTMLElement)) throw new Error('no header')
	const capture = vi.fn()
	header.setPointerCapture = capture
	const close = screen.getByRole('button', { name: CHAT_SHELL_COPY.closeChat })
	pointer(close, 'pointerdown', 100)
	expect(capture).not.toHaveBeenCalled()
	await user.click(close)
	expect(onClose).toHaveBeenCalledTimes(1)

	// a drag that starts on the header itself is captured, so a swipe still closes
	pointer(header, 'pointerdown', 100)
	expect(capture).toHaveBeenCalledTimes(1)
	pointer(header, 'pointermove', 100 + SHEET_SWIPE_PX + 10)
	pointer(header, 'pointerup', 100 + SHEET_SWIPE_PX + 10)
	expect(onClose).toHaveBeenCalledTimes(2)
})
