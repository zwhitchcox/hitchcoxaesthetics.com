/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
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

/** The rail and the dock hanging from it, once rendered. */
function railAndDock(container: HTMLElement) {
	const rail = container.querySelector<HTMLElement>('[data-chat-rail]')
	const dock = container.querySelector<HTMLElement>('[data-chat-dock]')
	if (!rail || !dock) throw new Error('no rail or no dock')
	return { rail, dock }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

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
/* The rail and the dock, its tabs, the sheet, the decisions panel          */
/* ------------------------------------------------------------------------ */

test('the rail sits above the page bottom bar with the keyboard down and at the visual viewport’s bottom edge with it up; the dock hangs from it with no height in the offset', () => {
	const ref = createRef<HTMLDivElement>()
	const { container, rerender } = render(
		<ChatDock keyboardInset={0} viewportBottom={844} ref={ref}>
			<p>the composer</p>
		</ChatDock>,
	)
	const { rail, dock } = railAndDock(container)
	expect(rail.contains(dock)).toBe(true)
	expect(ref.current).toBe(dock)
	expect(dock).toHaveTextContent('the composer')
	const railClasses = () => rail.className.split(' ')
	const dockClasses = () => dock.className.split(' ')
	// the rail: fixed, no height, at the layout viewport's bottom above the page bar
	expect(railClasses()).toContain('fixed')
	expect(railClasses()).toContain('h-0')
	expect(railClasses()).toContain('inset-x-0')
	expect(railClasses()).toContain('bottom-[var(--editor-bottom)]')
	expect(railClasses()).not.toContain('top-0')
	expect(rail.style.transform).toBe('')
	// the dock hangs from the rail: its bottom edge is the rail's line
	expect(dockClasses()).toContain('absolute')
	expect(dockClasses()).toContain('inset-x-0')
	expect(dockClasses()).toContain('bottom-0')
	expect(dockClasses()).not.toContain('fixed')
	expect(dockClasses()).toContain(
		'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
	)
	expect(dockClasses()).not.toContain('py-1')
	expect(dock.style.transform).toBe('')
	// nothing measures the dock: no ResizeObserver is asked for
	expect(typeof ResizeObserver).toBe('undefined')

	// The keyboard is up: the visual viewport ends 500 px from the layout
	// viewport's top, so the rail goes there and the dock's bottom with it.
	rerender(
		<ChatDock keyboardInset={300} viewportBottom={500} ref={ref}>
			<p>the composer</p>
		</ChatDock>,
	)
	// the same two elements: the composer inside never remounts
	expect(railAndDock(container)).toEqual({ rail, dock })
	expect(ref.current).toBe(dock)
	expect(railClasses()).toContain('top-0')
	expect(railClasses()).not.toContain('bottom-[var(--editor-bottom)]')
	expect(rail.style.transform).toBe('translate3d(0, 500px, 0)')
	expect(dockClasses()).toContain('absolute')
	expect(dockClasses()).toContain('bottom-0')
	expect(dockClasses()).toContain('py-1')
	expect(dock.className).not.toContain('safe-area-inset-bottom')
	expect(dock.style.transform).toBe('')

	// The visual viewport pans 40 px: the rail follows its edge.
	rerender(
		<ChatDock keyboardInset={260} viewportBottom={540} ref={ref}>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(rail.style.transform).toBe('translate3d(0, 540px, 0)')

	// The keyboard goes down: back to the bottom class, and no transform.
	rerender(
		<ChatDock keyboardInset={0} viewportBottom={844} ref={ref}>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(railAndDock(container)).toEqual({ rail, dock })
	expect(railClasses()).toContain('bottom-[var(--editor-bottom)]')
	expect(railClasses()).not.toContain('top-0')
	expect(rail.style.transform).toBe('')
	expect(dockClasses()).toContain(
		'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
	)
	expect(dockClasses()).not.toContain('py-1')
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

test("the sheet's top is stickyTop; its bottom is the dock height above the page bar, or the dock's top edge from the visual viewport with the keyboard up", () => {
	const { rerender } = render(
		<ChatSheet
			stickyTop={44}
			keyboardInset={0}
			viewportBottom={844}
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
	expect(sheet.style.getPropertyValue('--dock-height')).toBe('96px')
	expect(sheet.className).toContain(
		'bottom-[calc(var(--dock-height)+var(--editor-bottom))]',
	)
	expect(sheet.style.height).toBe('')
	expect(
		within(sheet).getByRole('heading', { name: CHAT_SHELL_COPY.chatTitle }),
	).toBeInTheDocument()
	expect(sheet).toHaveTextContent('the list')

	// The keyboard is up: the sheet ends where the dock starts, 500 - 96.
	rerender(
		<ChatSheet
			stickyTop={44}
			keyboardInset={300}
			viewportBottom={500}
			dockHeight={96}
			onClose={vi.fn()}
		>
			<p>the list</p>
		</ChatSheet>,
	)
	expect(sheet.style.top).toBe('44px')
	expect(sheet.style.height).toBe('360px')
	expect(sheet.className).not.toContain('bottom-[')
})

test('two tabs protrude from the dock’s top-right edge in both keyboard modes: the chat (a dot while an answer waits unseen) and the decisions, each with its names, aria-expanded and aria-controls; either is absent without its prop', async () => {
	const user = userEvent.setup()
	const chat = { open: false, onOpen: vi.fn(), onClose: vi.fn() }
	const decisions = {
		open: false,
		onOpen: vi.fn(),
		onClose: vi.fn(),
		panel: <button type="button">Approve</button>,
	}
	const { container, rerender } = render(
		<ChatDock
			keyboardInset={0}
			viewportBottom={844}
			chat={chat}
			decisions={decisions}
		>
			<p>the composer</p>
		</ChatDock>,
	)
	const { dock } = railAndDock(container)
	expect(dock.className).toContain('overflow-visible')
	const chatTab = screen.getByRole('button', { name: CHAT_SHELL_COPY.openChat })
	const decisionsTab = screen.getByRole('button', {
		name: CHAT_SHELL_COPY.openDecisions,
	})
	// one group at the dock's top right, the chat tab first
	const group = chatTab.parentElement
	if (!group) throw new Error('no tab group')
	expect(dock.contains(group)).toBe(true)
	expect(group.parentElement).toBe(dock)
	expect(Array.from(group.children)).toEqual([chatTab, decisionsTab])
	const groupClasses = group.className.split(' ')
	for (const cls of ['absolute', '-top-7', 'right-3', 'flex', 'gap-1']) {
		expect(groupClasses, cls).toContain(cls)
	}
	for (const tab of [chatTab, decisionsTab]) {
		const classes = tab.className.split(' ')
		for (const cls of [
			'h-7',
			'w-12',
			'rounded-t-lg',
			'border',
			'border-b-0',
			'bg-background',
		]) {
			expect(classes, cls).toContain(cls)
		}
	}
	expect(chatTab).toHaveAttribute('aria-expanded', 'false')
	expect(chatTab).toHaveAttribute('aria-controls', 'article-chat-sheet')
	expect(iconOf(chatTab)).toBe('chat-bubble')
	expect(chatTab.querySelector('span[aria-hidden="true"]')).toBeNull()
	expect(decisionsTab).toHaveAttribute('aria-expanded', 'false')
	expect(decisionsTab).toHaveAttribute('aria-controls', 'article-decisions')
	expect(iconOf(decisionsTab)).toBe('check')
	// the panel is not there while closed
	expect(screen.queryByRole('dialog')).toBeNull()
	expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
	// a tab acts on the pointer's down, before the tap's focus change can move
	// the dock under the finger; the pointerdown keeps its default (the focus goes)
	const pointerDown = (el: Element) =>
		fireEvent(
			el,
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
		)
	expect(pointerDown(chatTab)).toBe(true)
	expect(chat.onOpen).toHaveBeenCalledTimes(1)
	expect(pointerDown(decisionsTab)).toBe(true)
	expect(decisions.onOpen).toHaveBeenCalledTimes(1)
	// the click behind a pointer adds nothing; a keyboard's click (no pointer, detail 0) acts
	fireEvent.click(chatTab, { detail: 1 })
	fireEvent.click(decisionsTab, { detail: 1 })
	expect(chat.onOpen).toHaveBeenCalledTimes(1)
	expect(decisions.onOpen).toHaveBeenCalledTimes(1)
	fireEvent.click(chatTab, { detail: 0 })
	fireEvent.click(decisionsTab, { detail: 0 })
	expect(chat.onOpen).toHaveBeenCalledTimes(2)
	expect(decisions.onOpen).toHaveBeenCalledTimes(2)
	expect(chat.onClose).not.toHaveBeenCalled()
	expect(decisions.onClose).not.toHaveBeenCalled()
	// a whole tap (user-event: pointer, then click) acts once
	chat.onOpen.mockClear()
	decisions.onOpen.mockClear()
	await user.click(chatTab)
	expect(chat.onOpen).toHaveBeenCalledTimes(1)
	expect(chat.onClose).not.toHaveBeenCalled()
	await user.click(decisionsTab)
	expect(decisions.onOpen).toHaveBeenCalledTimes(1)
	expect(decisions.onClose).not.toHaveBeenCalled()

	// an answer waits unseen: the dot on the chat tab, the name unchanged
	rerender(
		<ChatDock
			keyboardInset={0}
			viewportBottom={844}
			chat={{ ...chat, unseen: true }}
			decisions={decisions}
		>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(screen.getByRole('button', { name: CHAT_SHELL_COPY.openChat })).toBe(
		chatTab,
	)
	expect(chatTab.querySelector('span[aria-hidden="true"]')).not.toBeNull()

	// open: the names flip, the chat's icon stays, the dot goes
	rerender(
		<ChatDock
			keyboardInset={300}
			viewportBottom={500}
			chat={{ ...chat, open: true, unseen: true }}
			decisions={{ ...decisions, open: true }}
		>
			<p>the composer</p>
		</ChatDock>,
	)
	const chatOpen = screen.getByRole('button', {
		name: CHAT_SHELL_COPY.closeChat,
	})
	expect(chatOpen).toBe(chatTab)
	expect(chatOpen).toHaveAttribute('aria-expanded', 'true')
	expect(iconOf(chatOpen)).toBe('chat-bubble')
	expect(chatOpen.querySelector('span[aria-hidden="true"]')).toBeNull()
	const decisionsOpen = screen.getByRole('button', {
		name: CHAT_SHELL_COPY.closeDecisions,
	})
	expect(decisionsOpen).toBe(decisionsTab)
	expect(decisionsOpen).toHaveAttribute('aria-expanded', 'true')
	// the tabs stay while the keyboard is up
	expect(dock.contains(group)).toBe(true)
	await user.click(chatOpen)
	expect(chat.onClose).toHaveBeenCalledTimes(1)
	expect(chat.onOpen).toHaveBeenCalledTimes(1)
	await user.click(decisionsOpen)
	expect(decisions.onClose).toHaveBeenCalledTimes(1)
	expect(decisions.onOpen).toHaveBeenCalledTimes(1)

	// an own-words row: no chat, so no chat tab; the decisions tab stays
	rerender(
		<ChatDock keyboardInset={0} viewportBottom={844} decisions={decisions}>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(screen.getAllByRole('button')).toEqual([
		screen.getByRole('button', { name: CHAT_SHELL_COPY.openDecisions }),
	])

	// no decisions and no chat: no tabs at all
	rerender(
		<ChatDock keyboardInset={0} viewportBottom={844}>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(screen.queryByRole('button')).toBeNull()
	expect(dock.querySelector('.-top-7')).toBeNull()
	expect(dock).toHaveTextContent('the composer')
})

test('the decisions panel rides on the dock’s top edge with the dock’s look, before the tabs so they paint over its bottom band; Escape closes it; it is gone while closed', () => {
	const onClose = vi.fn()
	const decisions = {
		open: true,
		onOpen: vi.fn(),
		onClose,
		panel: (
			<>
				<button type="button">Approve</button>
				<button type="button">Grill me</button>
			</>
		),
	}
	const { container, rerender } = render(
		<ChatDock
			keyboardInset={0}
			viewportBottom={844}
			chat={{ open: false, onOpen: vi.fn(), onClose: vi.fn() }}
			decisions={decisions}
		>
			<p>the composer</p>
		</ChatDock>,
	)
	const { dock } = railAndDock(container)
	const panel = screen.getByRole('dialog', {
		name: CHAT_SHELL_COPY.decisionsTitle,
	})
	expect(panel.id).toBe('article-decisions')
	expect(panel).not.toHaveAttribute('aria-modal')
	expect(panel.parentElement).toBe(dock)
	expect(
		within(panel)
			.getAllByRole('button')
			.map(b => b.textContent),
	).toEqual(['Approve', 'Grill me'])
	const classes = panel.className.split(' ')
	for (const cls of [
		'absolute',
		'inset-x-0',
		'bottom-full',
		'flex',
		'flex-wrap',
		'border-t',
		'bg-background/95',
		'backdrop-blur',
		'pb-9',
	]) {
		expect(classes, cls).toContain(cls)
	}
	// the dock's own look, so the seam is one line
	expect(dock.className).toContain('border-t')
	expect(dock.className).toContain('bg-background/95')
	// before the tab group in the tree
	const group = screen.getByRole('button', {
		name: CHAT_SHELL_COPY.closeDecisions,
	}).parentElement
	if (!group) throw new Error('no tab group')
	expect(
		panel.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
	// the composer is still in the dock after the panel
	expect(dock).toHaveTextContent('the composer')

	fireEvent.keyDown(document, { key: 'Escape' })
	expect(onClose).toHaveBeenCalledTimes(1)

	// the keyboard comes up: the panel stays on the dock's top edge
	rerender(
		<ChatDock
			keyboardInset={300}
			viewportBottom={500}
			chat={{ open: false, onOpen: vi.fn(), onClose: vi.fn() }}
			decisions={decisions}
		>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(
		screen.getByRole('dialog', { name: CHAT_SHELL_COPY.decisionsTitle }),
	).toBe(panel)
	expect(panel.parentElement).toBe(dock)

	rerender(
		<ChatDock
			keyboardInset={0}
			viewportBottom={844}
			chat={{ open: false, onOpen: vi.fn(), onClose: vi.fn() }}
			decisions={{ ...decisions, open: false }}
		>
			<p>the composer</p>
		</ChatDock>,
	)
	expect(screen.queryByRole('dialog')).toBeNull()
	expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(onClose).toHaveBeenCalledTimes(1)
})

test('Escape closes the sheet and the popup; a 60 px drag down the sheet header closes it', async () => {
	const user = userEvent.setup()
	const onCloseSheet = vi.fn()
	const { unmount } = render(
		<ChatSheet
			stickyTop={44}
			keyboardInset={0}
			viewportBottom={844}
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
			viewportBottom={844}
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
