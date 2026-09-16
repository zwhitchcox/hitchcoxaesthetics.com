/**
 * @vitest-environment jsdom
 */
import '#tests/setup/prosemirror-jsdom.ts'
import { Form } from '@remix-run/react'
import { createRemixStub } from '@remix-run/testing'
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ARTICLE_CHAT_COPY } from '#app/components/article-chat.tsx'
import { type EditorView } from 'prosemirror-view'
import {
	ArticleEditor,
	ARTICLE_EDITOR_COPY,
	type ArticleEditorProps,
} from '#app/components/article-editor.tsx'
import { CHAT_SHELL_COPY } from '#app/components/chat-shell.tsx'
import { RICH_EDITOR_COPY } from '#app/components/rich-editor.tsx'
import { type ChatMessageJson } from '#app/utils/article-chat.ts'
import { AUTO_SAVE_DEBOUNCE_MS } from '#app/utils/auto-save.ts'

/*
 * The editor on a wide screen. `matchMedia` says (min-width: 1024px)
 * matches, so the chat is a launcher bottom-right that opens a popup, and
 * there is no dock. The fetch mock answers article-chat, article-save and
 * the picture upload.
 */

const WIDE_QUERY = '(min-width: 1024px)'
const LINKS = [
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com' },
]
const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com).'
const BODY_CHANGED =
	'## Botox basics\n\nMost people need 15 to 25 units. See [our site](https://hitchcoxaesthetics.com).'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const THE_ASK = 'Say 15 to 25 units, it depends on the person.'
const QUOTE = 'Most people need 20 units.'

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

function renderEditor(overrides: Partial<ArticleEditorProps> = {}) {
	const props: ArticleEditorProps = {
		article: {
			id: 'a1',
			kind: 'guest',
			title: 'Botox basics',
			where: 'Goes on example-magazine.com',
			byline: 'By Sarah Hitchcox, RN',
			about: 'About 1 min',
			body: BODY,
			savedHash: HASH_A,
			isReference: false,
		},
		images: [],
		links: LINKS,
		claims: [QUOTE],
		history: [],
		showHeader: false,
		stickyTop: 60,
		stickyBottom: 72,
		...overrides,
	}
	const RemixStub = createRemixStub([
		{
			path: '/admin/articles/a1',
			Component: () => (
				<Form method="post">
					<ArticleEditor {...props} />
				</Form>
			),
			action: () => null,
		},
	])
	return render(<RemixStub initialEntries={['/admin/articles/a1']} />)
}

function hiddenBody() {
	const input = document.querySelector('input[name="body"]')
	if (!(input instanceof HTMLInputElement))
		throw new Error('no hidden body input')
	return input.value
}

function preview() {
	const el = document.querySelector('[data-article-preview]')
	if (!(el instanceof HTMLElement)) throw new Error('no article preview')
	return el
}

function jsonResponse(status: number, data: unknown) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

type Call = { url: string; body: Record<string, unknown> }

/** A fetch mock for the chat, the save and the upload; the upload's body is a FormData, recorded as `{}`. */
function mockFetch(handlers: {
	chat?: (body: Record<string, unknown>) => Response | Promise<Response>
	save?: (body: Record<string, unknown>) => Response | Promise<Response>
	upload?: () => Response | Promise<Response>
}) {
	const calls: Call[] = []
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const body =
			typeof init?.body === 'string'
				? (JSON.parse(init.body) as Record<string, unknown>)
				: {}
		calls.push({ url, body })
		if (url === '/resources/article-chat' && handlers.chat)
			return handlers.chat(body)
		if (url === '/resources/article-save' && handlers.save)
			return handlers.save(body)
		if (url === '/resources/article-image-upload' && handlers.upload)
			return handlers.upload()
		return jsonResponse(500, { error: 'unexpected' })
	})
	vi.stubGlobal('fetch', fetchMock)
	return { fetchMock, calls }
}

/** A chat turn that changed the text: her row, then one change row. */
const chatChanged = (body: Record<string, unknown>) =>
	jsonResponse(200, {
		messages: [
			row({ id: 'u1', role: 'user', text: String(body.text) }),
			row({
				id: 'c1',
				role: 'change',
				text: 'Said 15 to 25 units.',
				toolName: 'replace_text',
			}),
		],
		body: BODY_CHANGED,
		hash: HASH_B,
		changed: true,
	})

function launcher() {
	return screen.getByRole('button', { name: CHAT_SHELL_COPY.openChat })
}

function popup() {
	return screen.getByRole('dialog', { name: CHAT_SHELL_COPY.chatTitle })
}

function noPopup() {
	return screen.queryByRole('dialog', { name: CHAT_SHELL_COPY.chatTitle })
}

beforeEach(() => {
	window.sessionStorage.clear()
	// jsdom has no layout: the scroll to the green mark is a no-op here
	vi.stubGlobal('scrollBy', vi.fn())
	// jsdom has no object URLs: the thumbnail needs one while a picture uploads
	Object.defineProperty(URL, 'createObjectURL', {
		value: vi.fn(() => 'blob:preview'),
		configurable: true,
	})
	Object.defineProperty(URL, 'revokeObjectURL', {
		value: vi.fn(),
		configurable: true,
	})
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: query === WIDE_QUERY,
		media: query,
		onchange: null,
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		dispatchEvent: () => false,
	}))
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
	Reflect.deleteProperty(URL, 'createObjectURL')
	Reflect.deleteProperty(URL, 'revokeObjectURL')
})

test('a wide screen gets the launcher, no dock, and the article in a 70ch column', async () => {
	renderEditor()
	expect(
		await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label }),
	).toBeTruthy()
	expect(launcher()).toBeTruthy()
	expect(noPopup()).toBeNull()
	expect(document.querySelector('[data-chat-dock]')).toBeNull()
	expect(document.querySelector('[data-chat-list]')).toBeNull()
	expect(document.querySelector('[data-status-line]')).toBeNull()
	expect(preview().className).toContain('max-w-[70ch]')
	// the shell's geometry comes from the editor root
	const root = document.querySelector('[data-article-editor]')
	expect(root instanceof HTMLElement ? root.style.paddingBottom : null).toBe('')
})

test('the launcher opens the popup with the list and the box focused; Escape closes it and the launcher takes the focus', async () => {
	const user = userEvent.setup()
	renderEditor()
	await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
	await user.click(launcher())

	const open = popup()
	expect(open.querySelector('[data-chat-list]')).toBeTruthy()
	expect(within(open).getByText(ARTICLE_CHAT_COPY.emptyTitle)).toBeTruthy()
	const box = within(open).getByLabelText('Message')
	expect(document.activeElement).toBe(box)
	expect(
		screen.queryByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeNull()

	fireEvent.keyDown(box, { key: 'Escape' })
	expect(noPopup()).toBeNull()
	await waitFor(() => expect(document.activeElement).toBe(launcher()))
})

test('an answer that lands while the popup is closed marks the launcher until she opens it', async () => {
	const user = userEvent.setup()
	let finishChat: (response: Response) => void = () => {}
	const chatLands = new Promise<Response>(resolve => {
		finishChat = resolve
	})
	let asked: Record<string, unknown> = {}
	const { calls } = mockFetch({
		chat: body => {
			asked = body
			return chatLands
		},
	})
	renderEditor()
	await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
	await user.click(launcher())
	await user.type(within(popup()).getByLabelText('Message'), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() =>
		expect(calls.filter(c => c.url === '/resources/article-chat')).toHaveLength(
			1,
		),
	)
	// closed during the turn: the plain launcher
	await user.click(
		within(popup()).getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	)
	expect(launcher()).toBeTruthy()

	finishChat(chatChanged(asked))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	const marked = await screen.findByRole('button', {
		name: CHAT_SHELL_COPY.openChatNew,
	})
	expect(
		screen.queryByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeNull()

	// the article changed in place behind the closed popup
	expect(preview().querySelector('mark.review-changed')?.textContent).toBe(
		'15 to 25',
	)

	// opening it shows the answer and clears the mark on the launcher
	await user.click(marked)
	expect(
		within(popup()).getByText('Changed: said 15 to 25 units.'),
	).toBeTruthy()
	await user.click(
		within(popup()).getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	)
	expect(launcher()).toBeTruthy()
	expect(
		screen.queryByRole('button', { name: CHAT_SHELL_COPY.openChatNew }),
	).toBeNull()
})

test('a quote from the reading page opens the popup with the quote attached; closed, it stays closed', async () => {
	const user = userEvent.setup()
	renderEditor({ initialQuote: QUOTE })
	const open = await screen.findByRole('dialog', {
		name: CHAT_SHELL_COPY.chatTitle,
	})
	expect(
		within(open).getByText(QUOTE, { selector: 'blockquote > button' }),
	).toBeTruthy()
	expect(
		(within(open).getByLabelText('Message') as HTMLTextAreaElement).placeholder,
	).toBe(ARTICLE_CHAT_COPY.quotePlaceholder)
	expect(
		screen.queryByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeNull()

	await user.click(
		within(open).getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	)
	expect(noPopup()).toBeNull()
	expect(launcher()).toBeTruthy()

	// the quote waits in the composer for the next open
	await user.click(launcher())
	expect(
		within(popup()).getByText(QUOTE, { selector: 'blockquote > button' }),
	).toBeTruthy()
})

test('a picture dropped on the article attaches to the chat and opens the popup', async () => {
	mockFetch({
		upload: () =>
			jsonResponse(200, {
				image: {
					id: 'im1',
					fileName: 'user-im1.png',
					width: 1,
					height: 1,
					url: '/resources/article-images/im1',
				},
			}),
	})
	renderEditor()
	await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
	const file = new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', {
		type: 'image/png',
	})
	fireEvent.drop(preview(), {
		dataTransfer: { files: [file], types: ['Files'] },
	})

	const open = popup()
	expect(open.querySelector('[data-status]')).toBeTruthy()
	await waitFor(() =>
		expect(open.querySelector('[data-status="ready"]')).toBeTruthy(),
	)
	expect(
		within(open).getByRole('button', { name: 'Remove the picture' }),
	).toBeTruthy()
})

test('a decided row keeps the launcher: the popup reads the history with the decided line, and the article reads', async () => {
	const user = userEvent.setup()
	renderEditor({
		readOnly: true,
		history: [
			row({ id: 'h1', role: 'user', text: 'Is 20 units usual?' }),
			row({ id: 'h2', role: 'assistant', text: 'Yes, for the glabella.' }),
		],
	})
	expect(
		await screen.findByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeTruthy()
	expect(document.querySelector('.ProseMirror')).toBeNull()
	expect(
		screen.queryByRole('textbox', { name: RICH_EDITOR_COPY.label }),
	).toBeNull()
	expect(within(preview()).getByText(/Most people need 20 units/)).toBeTruthy()

	await user.click(launcher())
	const open = popup()
	expect(within(open).getByText('Is 20 units usual?')).toBeTruthy()
	expect(within(open).getByText('Yes, for the glabella.')).toBeTruthy()
	expect(within(open).getByText(ARTICLE_CHAT_COPY.decidedComposer)).toBeTruthy()
	expect(within(open).queryByLabelText('Message')).toBeNull()
})

test('the article re-centres beside the open popup and takes the full width again when it closes', async () => {
	const user = userEvent.setup()
	renderEditor()
	await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
	const column = () => preview().parentElement?.className ?? ''
	expect(column()).not.toContain('lg:pr-[26rem]')
	await user.click(launcher())
	expect(column()).toContain('lg:pr-[26rem]')
	await user.click(
		within(popup()).getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	)
	expect(column()).not.toContain('lg:pr-[26rem]')
})

test('a 409 keeps the conflict card in flow above the article, and the save mark points up at it', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	mockFetch({
		save: () =>
			jsonResponse(409, {
				error: 'changed',
				message: 'The writer sent new text while you were editing.',
				body: '## New from the writer',
				hash: HASH_B,
			}),
	})
	const viewRef: { current: EditorView | null } = { current: null }
	renderEditor({ editorViewRef: viewRef })
	await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
	act(() => {
		const view = viewRef.current
		if (!view) throw new Error('no view')
		view.dispatch(
			view.state.tr.insertText(' more', view.state.doc.content.size - 1),
		)
	})
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)

	const card = await screen.findByRole('alert')
	expect(card.textContent).toContain(ARTICLE_EDITOR_COPY.conflict)
	expect(document.querySelector('[data-chat-dock]')).toBeNull()
	// in flow, before the article
	expect(
		card.compareDocumentPosition(preview()) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
	const mark = document.querySelector('[data-save-state]')
	expect(mark?.getAttribute('data-save-state')).toBe('conflict')
	expect(mark?.textContent).toBe(ARTICLE_EDITOR_COPY.conflictAbove)

	await user.click(
		within(card).getByRole('button', { name: ARTICLE_EDITOR_COPY.useTheirs }),
	)
	expect(hiddenBody()).toBe('## New from the writer')
	expect(mark?.getAttribute('data-save-state')).toBe('saved')
})

test('the bar slot holds the save mark then the Markdown toggle, and nothing while it is null', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	mockFetch({
		save: () => jsonResponse(200, { ok: true, hash: HASH_B, changed: true }),
	})
	const { unmount } = renderEditor({ barSlot: null })
	await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
	expect(
		screen.queryByRole('button', { name: ARTICLE_EDITOR_COPY.markdown }),
	).toBeNull()
	expect(document.querySelector('[data-save-state]')).toBeNull()
	unmount()

	const slot = document.body.appendChild(document.createElement('div'))
	try {
		const viewRef: { current: EditorView | null } = { current: null }
		renderEditor({ barSlot: slot, editorViewRef: viewRef })
		await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
		const mark = slot.querySelector('[data-save-state]')
		const toggle = within(slot).getByRole('button', {
			name: ARTICLE_EDITOR_COPY.markdown,
		})
		if (!(mark instanceof HTMLElement)) throw new Error('no save mark')
		expect(mark.dataset.saveState).toBe('idle')
		expect(
			mark.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		expect(document.querySelectorAll('[data-save-state]')).toHaveLength(1)

		// a typed change: the spinner in the slot, then the check
		act(() => {
			const view = viewRef.current
			if (!view) throw new Error('no view')
			view.dispatch(
				view.state.tr.insertText(' more', view.state.doc.content.size - 1),
			)
		})
		expect(mark.dataset.saveState).toBe('saving')
		expect(mark.querySelector('svg')?.getAttribute('class')).toContain(
			'animate-spin',
		)
		expect(
			within(mark).getByText(ARTICLE_EDITOR_COPY.saving).className,
		).toContain('sr-only')
		await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
		await waitFor(() => expect(mark.dataset.saveState).toBe('saved'))
		expect(
			within(mark).getByText(ARTICLE_EDITOR_COPY.saved).className,
		).toContain('sr-only')
	} finally {
		slot.remove()
	}
})

test('an error that lands while the popup is closed does not mark the launcher as an answer', async () => {
	const user = userEvent.setup()
	let finishChat: (response: Response) => void = () => {}
	const chatLands = new Promise<Response>(resolve => {
		finishChat = resolve
	})
	const { calls } = mockFetch({ chat: () => chatLands })
	renderEditor()
	const prose = await screen.findByRole('textbox', {
		name: RICH_EDITOR_COPY.label,
	})
	await user.click(launcher())
	await user.type(within(popup()).getByLabelText('Message'), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() =>
		expect(calls.filter(c => c.url === '/resources/article-chat')).toHaveLength(
			1,
		),
	)
	await user.click(
		within(popup()).getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	)
	finishChat(jsonResponse(502, { error: 'The assistant did not answer.' }))

	// the turn ends: the article opens again and the launcher stays plain
	await waitFor(() =>
		expect(prose.getAttribute('contenteditable')).toBe('true'),
	)
	expect(launcher()).toBeTruthy()
	expect(
		screen.queryByRole('button', { name: CHAT_SHELL_COPY.openChatNew }),
	).toBeNull()

	// the error waits in the popup with Try again, and her words are still in the box
	await user.click(launcher())
	expect(
		within(popup()).getByRole('button', { name: ARTICLE_CHAT_COPY.tryAgain }),
	).toBeTruthy()
	expect(
		(within(popup()).getByLabelText('Message') as HTMLTextAreaElement).value,
	).toBe(THE_ASK)
})

test('a picture dropped on the open popup attaches to the chat', async () => {
	mockFetch({
		upload: () =>
			jsonResponse(200, {
				image: {
					id: 'im2',
					fileName: 'user-im2.png',
					width: 1,
					height: 1,
					url: '/resources/article-images/im2',
				},
			}),
	})
	renderEditor()
	await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
	const user = userEvent.setup()
	await user.click(launcher())
	const open = popup()
	const file = new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', {
		type: 'image/png',
	})
	fireEvent.drop(open, {
		dataTransfer: { files: [file], types: ['Files'] },
	})

	await waitFor(() =>
		expect(open.querySelector('[data-status="ready"]')).toBeTruthy(),
	)
	expect(
		within(open).getByRole('button', { name: 'Remove the picture' }),
	).toBeTruthy()
})
