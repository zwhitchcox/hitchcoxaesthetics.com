/**
 * @vitest-environment jsdom
 */
import '#tests/setup/prosemirror-jsdom.ts'
import { Form, Link } from '@remix-run/react'
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
import { type Node } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import { type EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ARTICLE_CHAT_COPY } from '#app/components/article-chat.tsx'
import {
	ArticleEditor,
	ARTICLE_EDITOR_COPY,
	type ArticleEditorProps,
} from '#app/components/article-editor.tsx'
import { CHAT_SHELL_COPY } from '#app/components/chat-shell.tsx'
import { COMMENT_COPY } from '#app/components/comment-on-this.tsx'
import { TOOLBAR_COPY } from '#app/components/editor-toolbar.tsx'
import { RICH_EDITOR_COPY } from '#app/components/rich-editor.tsx'
import { type ChatMessageJson } from '#app/utils/article-chat.ts'
import { AUTO_SAVE_DEBOUNCE_MS } from '#app/utils/auto-save.ts'

/*
 * The editor in jsdom is the phone shape: no matchMedia (the dock and the
 * sheet, Enter is a new line), no MediaRecorder (the Dictate button stays
 * hidden and the keyboard line shows), a fetch mock that answers
 * article-chat and article-save. Typing goes through the rich editor's
 * view (`editorViewRef`), not the keyboard: user-event does not reach a
 * contenteditable in jsdom. The e2e proves the typed path in Chromium.
 */

const LINKS = [
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com' },
	{ name: 'Botox Knox', url: 'https://botoxknox.com' },
]
const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const BODY_CHANGED =
	'## Botox basics\n\nMost people need 15 to 25 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
/** The one shape the round trip does not keep: trailing spaces on a line. */
const BODY_SPACES =
	'## Botox basics\n\nMost people need 20 units.   \n\nThe end.'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const THE_ASK = 'Say 15 to 25 units, it depends on the person.'
const CLAIM = 'Most people need 20 units.'
const ARTICLE: ArticleEditorProps['article'] = {
	id: 'a1',
	kind: 'guest',
	title: 'Botox basics',
	where: 'Goes on example-magazine.com',
	byline: 'By Sarah Hitchcox, RN',
	about: 'About 1 min',
	body: BODY,
	savedHash: HASH_A,
	isReference: false,
}

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

const viewRef: { current: EditorView | null } = { current: null }

function renderEditor(overrides: Partial<ArticleEditorProps> = {}) {
	viewRef.current = null
	const props: ArticleEditorProps = {
		article: ARTICLE,
		images: [],
		links: LINKS,
		claims: [CLAIM],
		history: [],
		editorViewRef: viewRef,
		...overrides,
	}
	const RemixStub = createRemixStub([
		{
			path: '/review/a1/change',
			Component: () => (
				<Form method="post">
					<ArticleEditor {...props} />
					<button type="submit">Approve</button>
					<Link to="/elsewhere">Leave this page</Link>
				</Form>
			),
			action: () => null,
		},
		{ path: '/elsewhere', Component: () => <p>Elsewhere</p> },
	])
	render(<RemixStub initialEntries={['/review/a1/change']} />)
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

function dock() {
	const el = document.querySelector('[data-chat-dock]')
	if (!(el instanceof HTMLElement)) throw new Error('no chat dock')
	return el
}

function composer() {
	return screen.getByLabelText('Message') as HTMLTextAreaElement
}

function statusLine() {
	return screen.getByRole('status')
}

function markdownToggle() {
	return screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.markdown })
}

/** The rich editor's root, once the client render has mounted it. */
async function richEditor() {
	return await screen.findByRole('textbox', { name: RICH_EDITOR_COPY.label })
}

/** Click "Markdown" and return the textarea. */
async function rawBox(user: ReturnType<typeof userEvent.setup>) {
	await user.click(markdownToggle())
	return screen.getByLabelText(
		ARTICLE_EDITOR_COPY.textLabel,
	) as HTMLTextAreaElement
}

async function openChat(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		screen.getByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	)
}

/** The dock's arrow, not the sheet's ×: both read "Close the chat". */
async function closeChat(user: ReturnType<typeof userEvent.setup>) {
	await user.click(
		within(dock()).getByRole('button', { name: CHAT_SHELL_COPY.closeChat }),
	)
}

function chatSheet() {
	return screen.getByRole('dialog', { name: CHAT_SHELL_COPY.chatTitle })
}

function noChatSheet() {
	return screen.queryByRole('dialog', { name: CHAT_SHELL_COPY.chatTitle })
}

function view(): EditorView {
	if (!viewRef.current) throw new Error('the rich editor is not mounted')
	return viewRef.current
}

/** The document positions of `text`, which sits inside one text node. */
function rangeOf(doc: Node, text: string) {
	const hits: Array<{ from: number; to: number }> = []
	doc.descendants((node, pos) => {
		if (hits.length || !node.isText) return
		const at = (node.text ?? '').indexOf(text)
		if (at >= 0) hits.push({ from: pos + at, to: pos + at + text.length })
	})
	const hit = hits[0]
	if (!hit) throw new Error(`"${text}" is not in the document`)
	return hit
}

/** Type at the end of the article through the view, as the keyboard would. */
function typeInArticle(text: string) {
	act(() => {
		const v = view()
		v.dispatch(v.state.tr.insertText(text, v.state.doc.content.size - 1))
	})
}

/** Select `text` in the article through the view, as a drag would. */
function selectInArticle(text: string) {
	act(() => {
		const v = view()
		const { from, to } = rangeOf(v.state.doc, text)
		v.dispatch(
			v.state.tr.setSelection(TextSelection.create(v.state.doc, from, to)),
		)
	})
}

function jsonResponse(status: number, data: unknown) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

type Call = { url: string; body: Record<string, unknown> }

/** A fetch mock that answers article-chat and article-save and records every call. */
function mockFetch(handlers: {
	chat?: (body: Record<string, unknown>) => Response | Promise<Response>
	save?: (body: Record<string, unknown>) => Response | Promise<Response>
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
		return jsonResponse(500, { error: 'unexpected' })
	})
	vi.stubGlobal('fetch', fetchMock)
	return { fetchMock, calls }
}

const saveOk = (hash: string) => () =>
	jsonResponse(200, { ok: true, hash, changed: true })

const saveConflict = () =>
	jsonResponse(409, {
		error: 'changed',
		message: 'The writer sent new text while you were editing.',
		body: '## New from the writer',
		hash: HASH_B,
	})

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

/** A chat turn that changed the text and then said "Done.": the status line must show the change, not the note. */
const chatChangedThenNote = (body: Record<string, unknown>) =>
	jsonResponse(200, {
		messages: [
			row({ id: 'u1', role: 'user', text: String(body.text) }),
			row({
				id: 'c1',
				role: 'change',
				text: 'Said 15 to 25 units.',
				toolName: 'replace_text',
			}),
			row({ id: 'n1', role: 'assistant', text: 'Done.' }),
		],
		body: BODY_CHANGED,
		hash: HASH_B,
		changed: true,
	})

const chatCalls = (calls: Call[]) =>
	calls.filter(c => c.url === '/resources/article-chat')
const saveCalls = (calls: Call[]) =>
	calls.filter(c => c.url === '/resources/article-save')

beforeEach(() => {
	window.sessionStorage.clear()
	// jsdom has no layout: the scroll to the green mark is a no-op unless a test measures
	vi.stubGlobal('scrollBy', vi.fn())
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
	window.history.replaceState(null, '', '/')
})

test('starts on the article with the working copy in a hidden input, the dock, and no save mark', async () => {
	renderEditor()
	expect(await richEditor()).toBeTruthy()
	expect(hiddenBody()).toBe(BODY)
	expect(within(preview()).getByText(/Most people need 20 units/)).toBeTruthy()
	expect(screen.queryAllByRole('tab')).toHaveLength(0)
	// the dock: the invitation, the composer, the arrow
	expect(dock().contains(statusLine())).toBe(true)
	expect(statusLine().textContent).toContain(ARTICLE_CHAT_COPY.emptyTitle)
	expect(composer().placeholder).toBe('Say or type what to change…')
	expect(
		screen
			.getByRole('button', { name: ARTICLE_CHAT_COPY.send })
			.hasAttribute('disabled'),
	).toBe(true)
	expect(
		within(dock()).getByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeTruthy()
	expect(document.querySelector('[data-chat-list]')).toBeNull()
	// jsdom cannot record, so the mic button stays hidden and the keyboard line shows
	expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull()
	expect(
		screen.getByText('Use the microphone key on your keyboard.'),
	).toBeTruthy()
	// the top row: no save mark yet, the Markdown toggle off
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saving)).toBeNull()
	expect(screen.queryByRole('button', { name: 'Save edits' })).toBeNull()
	expect(markdownToggle().getAttribute('aria-pressed')).toBe('false')
	expect(screen.getByText(ARTICLE_EDITOR_COPY.endLine)).toBeTruthy()
})

test('a typed change in the article saves after the debounce and blocks leaving only until then', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	let finishSave: (response: Response) => void = () => {}
	const saveLands = new Promise<Response>(resolve => {
		finishSave = resolve
	})
	const { calls } = mockFetch({ save: () => saveLands })
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(screen.getByText(ARTICLE_EDITOR_COPY.saving)).toBeTruthy()

	// still pending: leaving is blocked, and Stay keeps her here
	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(
		await screen.findByText(ARTICLE_EDITOR_COPY.leaveQuestion),
	).toBeTruthy()
	await user.click(
		screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.stay }),
	)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.leaveQuestion)).toBeNull()

	// the debounce passes: the save is in flight, leaving is still blocked
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(saveCalls(calls)).toHaveLength(1)
	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(
		await screen.findByText(ARTICLE_EDITOR_COPY.leaveQuestion),
	).toBeTruthy()

	// the save lands: the page leaves on its own
	finishSave(jsonResponse(200, { ok: true, hash: HASH_B, changed: true }))
	expect(await screen.findByText('Elsewhere')).toBeTruthy()
	expect(calls[0]?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_A,
		source: 'auto',
	})
	expect(saveCalls(calls)).toHaveLength(1)
})

test('a typed change under the Markdown toggle saves the same way', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { calls } = mockFetch({ save: saveOk(HASH_B) })
	renderEditor()
	await richEditor()
	const box = await rawBox(user)
	expect(markdownToggle().getAttribute('aria-pressed')).toBe('true')
	expect(box.value).toBe(BODY)
	await user.type(box, ' more')
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(screen.getByText(ARTICLE_EDITOR_COPY.saving)).toBeTruthy()
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(saveCalls(calls)).toHaveLength(1)
	expect(calls[0]?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_A,
		source: 'auto',
	})
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
})

test('a 409 shows the conflict card and Keep mine re-posts with the server hash', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { calls } = mockFetch({
		save: body =>
			body.baseHash === HASH_A
				? saveConflict()
				: jsonResponse(200, { ok: true, hash: HASH_C, changed: true }),
	})
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)

	const card = await screen.findByRole('alert')
	expect(card.textContent).toContain(ARTICLE_EDITOR_COPY.conflict)
	// on the phone the card sits in the dock, so the choice is on screen; the top row points down at it
	expect(dock().contains(card)).toBe(true)
	expect(screen.getByText(ARTICLE_EDITOR_COPY.conflictBelow)).toBeTruthy()
	// her copy is still there, and the dock says what to do first
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()
	expect(
		within(dock()).getByText(ARTICLE_CHAT_COPY.conflictComposer),
	).toBeTruthy()
	expect(screen.queryByLabelText('Message')).toBeNull()

	await user.click(
		screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.keepMine }),
	)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
	const saves = saveCalls(calls)
	expect(saves).toHaveLength(2)
	expect(saves[1]?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_B,
		source: 'auto',
	})
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.conflict)).toBeNull()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.conflictBelow)).toBeNull()
	expect(composer()).toBeTruthy()
})

test('Use the new text takes the writer’s text into the article, the Markdown box and the hidden input', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { calls } = mockFetch({ save: saveConflict })
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	await user.click(
		await screen.findByRole('button', { name: ARTICLE_EDITOR_COPY.useTheirs }),
	)
	expect(hiddenBody()).toBe('## New from the writer')
	expect((await richEditor()).textContent).toContain('New from the writer')
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
	expect(saveCalls(calls)).toHaveLength(1)
	expect((await rawBox(user)).value).toBe('## New from the writer')
})

test('a 409 keeps her copy: leaving asks first and the mirror still holds it', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	mockFetch({ save: saveConflict })
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.conflict)).toBeTruthy()

	// the mirror holds her copy while the conflict waits
	expect(window.sessionStorage.getItem('article-editor:a1')).toBe(
		`${BODY} more`,
	)

	// leaving asks first, in the conflict's words
	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(
		await screen.findByText(ARTICLE_EDITOR_COPY.leaveConflict),
	).toBeTruthy()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.leaveQuestion)).toBeNull()
	await user.click(
		screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.stay }),
	)
	expect(screen.queryByText('Elsewhere')).toBeNull()
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(window.sessionStorage.getItem('article-editor:a1')).toBe(
		`${BODY} more`,
	)
})

test('the Markdown toggle and the article share one working copy', async () => {
	const user = userEvent.setup()
	mockFetch({ save: saveOk(HASH_B) })
	renderEditor()
	await richEditor()
	const box = await rawBox(user)
	expect(box.value).toBe(BODY)
	await user.clear(box)
	await user.type(box, 'My own words')
	expect(hiddenBody()).toBe('My own words')
	expect(screen.getByText(/Missing: Sarah Hitchcox Aesthetics/)).toBeTruthy()

	// back to the article: the same words, and the links box stays under it
	await user.click(markdownToggle())
	expect(markdownToggle().getAttribute('aria-pressed')).toBe('false')
	expect((await richEditor()).textContent).toContain('My own words')
	expect(screen.getByText(ARTICLE_EDITOR_COPY.endLine)).toBeTruthy()
	expect(screen.getByText(/Missing: Sarah Hitchcox Aesthetics/)).toBeTruthy()

	// a rich edit shows under the toggle again
	typeInArticle('!')
	expect(hiddenBody()).toBe('My own words!')
	expect((await rawBox(user)).value).toBe('My own words!')
})

test('an own-words row has no chat but keeps the format row', async () => {
	const user = userEvent.setup()
	renderEditor({ article: { ...ARTICLE, isReference: true } })
	expect(
		await screen.findByText(ARTICLE_EDITOR_COPY.referenceNote),
	).toBeTruthy()
	const prose = await richEditor()
	expect(prose.getAttribute('contenteditable')).toBe('true')
	expect(screen.queryByLabelText('Message')).toBeNull()
	expect(
		screen.queryByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeNull()
	expect(screen.queryByRole('status')).toBeNull()
	expect(document.querySelector('[data-chat-dock]')).toBeNull()

	// the caret in the article: the dock holds the format row alone
	fireEvent.focus(prose)
	const toolbar = within(dock()).getByRole('toolbar', {
		name: TOOLBAR_COPY.toolbar,
	})
	expect(
		within(toolbar).getByRole('button', { name: TOOLBAR_COPY.bold }),
	).toBeTruthy()
	expect(
		within(toolbar).queryByRole('button', { name: COMMENT_COPY.button }),
	).toBeNull()
	expect(screen.queryByLabelText('Message')).toBeNull()
	fireEvent.blur(prose)
	expect(document.querySelector('[data-chat-dock]')).toBeNull()

	expect((await rawBox(user)).value).toBe(BODY)
})

test('a decided article in readOnly is not editable, posts nothing, and still opens the history', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { fetchMock } = mockFetch({ save: saveOk(HASH_B) })
	renderEditor({
		readOnly: true,
		history: [
			row({ id: 'h1', role: 'user', text: 'Is 20 units usual?' }),
			row({ id: 'h2', role: 'assistant', text: 'Yes, for the glabella.' }),
		],
	})
	expect(
		await screen.findByText(ARTICLE_CHAT_COPY.decidedComposer),
	).toBeTruthy()
	expect(dock().textContent).toContain(ARTICLE_CHAT_COPY.decidedComposer)
	expect(screen.queryByLabelText('Message')).toBeNull()
	expect(screen.queryByRole('status')).toBeNull()
	// the article reads through the plain view
	expect(document.querySelector('.ProseMirror')).toBeNull()
	expect(within(preview()).getByText(/Most people need 20 units/)).toBeTruthy()

	const box = await rawBox(user)
	expect(box.hasAttribute('readonly')).toBe(true)
	await user.type(box, ' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(fetchMock).not.toHaveBeenCalled()
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saving)).toBeNull()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()

	// the history is still there to read
	await openChat(user)
	const sheet = chatSheet()
	expect(sheet.querySelector('[data-chat-list]')).toBeTruthy()
	expect(within(sheet).getByText('Is 20 units usual?')).toBeTruthy()
	expect(within(sheet).getByText('Yes, for the glabella.')).toBeTruthy()
	expect(screen.getByText(ARTICLE_CHAT_COPY.decidedComposer)).toBeTruthy()
	await closeChat(user)
	expect(noChatSheet()).toBeNull()
})

test('does not block leaving when nothing changed', async () => {
	const user = userEvent.setup()
	renderEditor()
	await user.click(await screen.findByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText('Elsewhere')).toBeTruthy()
})

test('a quick thought from the closed dock changes the article in place and the status line shows See it and Undo', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({ chat: chatChanged })
	renderEditor()
	await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))

	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	expect(calls).toHaveLength(1)
	expect(calls[0]?.url).toBe('/resources/article-chat')
	expect(calls[0]?.body).toEqual({
		articleId: 'a1',
		text: THE_ASK,
		baseHash: HASH_A,
	})
	// the server saved it: the mark says so and no save was posted
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
	expect(saveCalls(calls)).toHaveLength(0)

	// the status line carries the change with See it and Undo; the box is empty
	const line = statusLine()
	expect(line.textContent).toContain('Changed: said 15 to 25 units.')
	expect(
		within(line).getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	).toBeTruthy()
	expect(
		within(line).getByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	).toBeTruthy()
	expect(composer().value).toBe('')

	// the article changed in place, with the changed span marked
	expect((await richEditor()).textContent).toContain('15 to 25 units')
	await waitFor(() =>
		expect(preview().querySelector('mark.review-changed')?.textContent).toBe(
			'15 to 25',
		),
	)

	// See it keeps the sheet closed
	await user.click(
		within(line).getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	)
	expect(noChatSheet()).toBeNull()

	// the conversation holds her words and the change
	await openChat(user)
	const list = chatSheet().querySelector('[data-chat-list]')
	if (!(list instanceof HTMLElement)) throw new Error('no chat list')
	expect(within(list).getByText(THE_ASK)).toBeTruthy()
	expect(within(list).getByText('Changed: said 15 to 25 units.')).toBeTruthy()
	await closeChat(user)

	// the Markdown toggle holds the new text
	expect((await rawBox(user)).value).toBe(BODY_CHANGED)
})

test('Undo from the status line saves the previous body from the new hash and reads Undone.', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({ chat: chatChanged, save: saveOk(HASH_C) })
	renderEditor()
	await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await user.click(
		await screen.findByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	)

	expect(await screen.findByText(ARTICLE_CHAT_COPY.undone)).toBeTruthy()
	expect(statusLine().textContent).toContain(ARTICLE_CHAT_COPY.undone)
	expect(hiddenBody()).toBe(BODY)
	const save = saveCalls(calls)[0]
	expect(save?.body).toEqual({
		articleId: 'a1',
		body: BODY,
		baseHash: HASH_B,
		source: 'ai',
	})
	expect(
		screen.queryByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	).toBeNull()
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
	expect((await richEditor()).textContent).toContain('20 units')
	expect(preview().querySelector('mark.review-changed')).toBeNull()
})

test('the composer is replaced by the conflict line while a conflict waits', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	mockFetch({ save: saveConflict })
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.conflict)).toBeTruthy()
	expect(
		within(dock()).getByText(ARTICLE_CHAT_COPY.conflictComposer),
	).toBeTruthy()
	expect(screen.queryByLabelText('Message')).toBeNull()

	// the conversation is still reachable, with the same line under it
	await openChat(user)
	expect(chatSheet().querySelector('[data-chat-list]')).toBeTruthy()
	expect(
		within(dock()).getByText(ARTICLE_CHAT_COPY.conflictComposer),
	).toBeTruthy()
	expect(screen.queryByLabelText('Message')).toBeNull()
})

test('a send while a save is owed shows the not-saved line and sends nothing', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { calls } = mockFetch({
		chat: chatChanged,
		save: () => jsonResponse(500, { error: 'down' }),
	})
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))

	expect(await screen.findByText(ARTICLE_CHAT_COPY.notSaved)).toBeTruthy()
	const alert = screen.getByRole('alert')
	expect(alert.textContent).toContain(ARTICLE_CHAT_COPY.notSaved)
	expect(statusLine().contains(alert)).toBe(true)
	expect(chatCalls(calls)).toHaveLength(0)
	expect(saveCalls(calls).length).toBeGreaterThan(0)
	// her words stay in the box
	expect(composer().value).toBe(THE_ASK)
})

test('an initialQuote is attached to the dock’s composer on mount, the URL drops it, and Remove the quote clears it', async () => {
	const user = userEvent.setup()
	// The Remix stub's memory router never touches window.location, so the
	// page address is set by hand and the drop is read from the spy.
	window.history.replaceState(null, '', '/review/a1/change?quote=x')
	const spy = vi.spyOn(window.history, 'replaceState')
	renderEditor({ initialQuote: CLAIM })
	const box = await screen.findByLabelText('Message')
	expect((box as HTMLTextAreaElement).placeholder).toBe(
		ARTICLE_CHAT_COPY.quotePlaceholder,
	)
	expect(
		within(dock()).getByText(CLAIM, { selector: 'blockquote > button' }),
	).toBeTruthy()
	expect(spy).toHaveBeenCalledTimes(1)
	expect(spy.mock.calls[0]?.[1]).toBe('')
	expect(spy.mock.calls[0]?.[2]).toBe('/review/a1/change')
	expect(window.location.search).toBe('')
	expect(window.location.pathname).toBe('/review/a1/change')
	expect(noChatSheet()).toBeNull()

	await user.click(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.removeQuote }),
	)
	expect(
		screen.queryByText(CLAIM, { selector: 'blockquote > button' }),
	).toBeNull()
	expect((box as HTMLTextAreaElement).placeholder).toBe(
		ARTICLE_CHAT_COPY.placeholder,
	)
})

test('a quote goes with her words and the sent bubble shows it', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({
		chat: body =>
			jsonResponse(200, {
				messages: [
					row({
						id: 'u1',
						role: 'user',
						text: String(body.text),
						quote: String(body.quote),
					}),
					row({ id: 'a1', role: 'assistant', text: 'Yes, 20 units is usual.' }),
				],
				body: BODY,
				hash: HASH_A,
				changed: false,
			}),
	})
	renderEditor({ initialQuote: CLAIM })
	await user.type(await screen.findByLabelText('Message'), 'Is that right?')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))

	// the answer's first line on the status line, with Open
	expect(await screen.findByText('Yes, 20 units is usual.')).toBeTruthy()
	const line = statusLine()
	expect(line.textContent).toContain('Yes, 20 units is usual.')
	expect(
		within(line).getByRole('button', { name: CHAT_SHELL_COPY.open }),
	).toBeTruthy()
	expect(calls[0]?.body).toEqual({
		articleId: 'a1',
		text: 'Is that right?',
		quote: CLAIM,
		baseHash: HASH_A,
	})
	// the quote left the composer
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder)
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()

	// Open shows the bubble with the quote
	await user.click(
		within(line).getByRole('button', { name: CHAT_SHELL_COPY.open }),
	)
	const sheet = chatSheet()
	expect(
		within(sheet).getByText(CLAIM, { selector: 'blockquote > button' }),
	).toBeTruthy()
	expect(within(sheet).getByText('Yes, 20 units is usual.')).toBeTruthy()
	expect(screen.queryByRole('status')).toBeNull()
})

test('the error line keeps her words and Try again re-sends', async () => {
	const user = userEvent.setup()
	let attempts = 0
	const { calls } = mockFetch({
		chat: body => {
			attempts += 1
			return attempts === 1
				? jsonResponse(502, { error: 'The assistant did not answer.' })
				: chatChanged(body)
		},
	})
	renderEditor()
	await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))

	expect(await screen.findByText(ARTICLE_CHAT_COPY.noAnswer)).toBeTruthy()
	expect(statusLine().contains(screen.getByRole('alert'))).toBe(true)
	expect(composer().value).toBe(THE_ASK)
	expect(hiddenBody()).toBe(BODY)

	await user.click(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.tryAgain }),
	)
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	expect(chatCalls(calls)).toHaveLength(2)
	expect(calls[1]?.body).toEqual({
		articleId: 'a1',
		text: THE_ASK,
		baseHash: HASH_A,
	})
	expect(screen.queryByText(ARTICLE_CHAT_COPY.noAnswer)).toBeNull()
})

test('the stored history renders oldest first with the day divider in the sheet', async () => {
	const user = userEvent.setup()
	renderEditor({
		history: [
			row({ id: 'h1', role: 'user', text: 'Is 20 units usual?' }),
			row({ id: 'h2', role: 'assistant', text: 'Yes, for the glabella.' }),
			row({
				id: 'h3',
				role: 'change',
				text: 'Added Dysport.',
				toolName: 'replace_text',
			}),
		],
	})
	await richEditor()
	// stored rows are seen: no status line while the sheet is closed
	expect(screen.queryByRole('status')).toBeNull()
	expect(screen.queryByText('Is 20 units usual?')).toBeNull()

	await openChat(user)
	const sheet = chatSheet()
	expect(within(sheet).getByText('Is 20 units usual?')).toBeTruthy()
	expect(within(sheet).getByText('Yes, for the glabella.')).toBeTruthy()
	expect(within(sheet).getByText('Changed: added Dysport.')).toBeTruthy()
	expect(within(sheet).getByText(ARTICLE_CHAT_COPY.today)).toBeTruthy()
	// a change from an earlier visit has See it but no Undo
	expect(
		within(sheet).getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	).toBeTruthy()
	expect(
		within(sheet).queryByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	).toBeNull()
	expect(screen.queryByText(ARTICLE_CHAT_COPY.emptyTitle)).toBeNull()
})

test('the article is locked while a chat turn runs, and the answer lands on the text it was built on', async () => {
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
		save: saveOk(HASH_C),
	})
	renderEditor()
	const prose = await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(chatCalls(calls)).toHaveLength(1))

	// while the turn runs the article takes no input and the top row says why
	await waitFor(() =>
		expect(prose.getAttribute('contenteditable')).toBe('false'),
	)
	expect(prose.getAttribute('aria-busy')).toBe('true')
	expect(screen.getByText(ARTICLE_EDITOR_COPY.markdownBusy)).toBeTruthy()
	typeInArticle(' more')
	expect(hiddenBody()).toBe(BODY)

	// the Markdown box is read-only too
	const box = await rawBox(user)
	expect(box.readOnly).toBe(true)
	await user.type(box, ' more')
	fireEvent.change(box, { target: { value: `${BODY} more` } })
	expect(box.value).toBe(BODY)
	expect(hiddenBody()).toBe(BODY)

	// the answer lands on the text the model was given; no words were dropped, no save was posted
	finishChat(chatChanged(asked))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	expect(box.value).toBe(BODY_CHANGED)
	expect(box.readOnly).toBe(false)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.markdownBusy)).toBeNull()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.conflict)).toBeNull()
	expect(saveCalls(calls)).toHaveLength(0)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()

	// the article opens again: a typed change goes into the working copy as usual
	await user.click(markdownToggle())
	const again = await richEditor()
	expect(again.getAttribute('contenteditable')).toBe('true')
	typeInArticle(' more')
	expect(hiddenBody()).toBe(`${BODY_CHANGED} more`)
})

test('Comment on this from the format row attaches the folded selection to the composer', async () => {
	renderEditor()
	const prose = await richEditor()
	fireEvent.focus(prose)
	const toolbar = within(dock()).getByRole('toolbar', {
		name: TOOLBAR_COPY.toolbar,
	})
	const comment = within(toolbar).getByRole('button', {
		name: COMMENT_COPY.button,
	})
	expect(comment.hasAttribute('disabled')).toBe(true)

	selectInArticle(CLAIM)
	expect(comment.hasAttribute('disabled')).toBe(false)
	fireEvent.pointerDown(comment)

	expect(
		within(dock()).getByText(CLAIM, { selector: 'blockquote > button' }),
	).toBeTruthy()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.quotePlaceholder)
	expect(document.activeElement).toBe(composer())
	expect(noChatSheet()).toBeNull()
})

test('the format row shows while the article has focus and hides on blur and while running', async () => {
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
	const prose = await richEditor()
	const toolbar = () =>
		screen.queryByRole('toolbar', { name: TOOLBAR_COPY.toolbar })
	expect(toolbar()).toBeNull()
	expect(statusLine().textContent).toContain(ARTICLE_CHAT_COPY.emptyTitle)

	// with the caret in the article the invitation makes way for the format row
	fireEvent.focus(prose)
	expect(toolbar()).toBeTruthy()
	expect(dock().contains(toolbar())).toBe(true)
	expect(screen.queryByRole('status')).toBeNull()
	fireEvent.blur(prose)
	expect(toolbar()).toBeNull()
	expect(statusLine().textContent).toContain(ARTICLE_CHAT_COPY.emptyTitle)

	fireEvent.focus(prose)
	expect(toolbar()).toBeTruthy()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(chatCalls(calls)).toHaveLength(1))
	await waitFor(() => expect(toolbar()).toBeNull())
	expect(statusLine().textContent).toContain(ARTICLE_CHAT_COPY.working)

	finishChat(chatChanged(asked))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
})

test('Bold from the format row toggles the mark and serialises', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const { calls } = mockFetch({ save: saveOk(HASH_B) })
	renderEditor()
	const prose = await richEditor()
	fireEvent.focus(prose)
	selectInArticle('20 units')
	const bold = within(dock()).getByRole('button', { name: TOOLBAR_COPY.bold })
	expect(bold.getAttribute('aria-pressed')).toBe('false')

	fireEvent.pointerDown(bold)
	const BOLD_BODY = BODY.replace('20 units', '**20 units**')
	expect(hiddenBody()).toBe(BOLD_BODY)
	expect(bold.getAttribute('aria-pressed')).toBe('true')
	expect(screen.getByText(ARTICLE_EDITOR_COPY.saving)).toBeTruthy()

	fireEvent.pointerDown(bold)
	expect(hiddenBody()).toBe(BODY)
	expect(bold.getAttribute('aria-pressed')).toBe('false')

	// one debounced save carries the last state
	fireEvent.pointerDown(bold)
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	const saves = saveCalls(calls)
	expect(saves).toHaveLength(1)
	expect(saves[0]?.body).toEqual({
		articleId: 'a1',
		body: BOLD_BODY,
		baseHash: HASH_A,
		source: 'auto',
	})
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
})

test('the sheet opens from the arrow and from the status line, and See it closes it', async () => {
	const user = userEvent.setup()
	mockFetch({ chat: chatChanged })
	renderEditor()
	await richEditor()

	// the arrow
	const arrow = within(dock()).getByRole('button', {
		name: CHAT_SHELL_COPY.openChat,
	})
	expect(arrow.getAttribute('aria-expanded')).toBe('false')
	await user.click(arrow)
	expect(chatSheet().querySelector('[data-chat-list]')).toBeTruthy()
	expect(screen.queryByRole('status')).toBeNull()
	const close = within(dock()).getByRole('button', {
		name: CHAT_SHELL_COPY.closeChat,
	})
	expect(close.getAttribute('aria-expanded')).toBe('true')
	await user.click(close)
	expect(noChatSheet()).toBeNull()

	// the invitation on the status line
	await user.click(
		within(statusLine()).getByRole('button', {
			name: ARTICLE_CHAT_COPY.emptyTitle,
		}),
	)
	expect(chatSheet()).toBeTruthy()
	await closeChat(user)
	expect(noChatSheet()).toBeNull()

	// a change turn, then See it from inside the sheet
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	await openChat(user)
	const list = chatSheet().querySelector('[data-chat-list]')
	if (!(list instanceof HTMLElement)) throw new Error('no chat list')
	await user.click(
		within(list).getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	)
	expect(noChatSheet()).toBeNull()
	await waitFor(() =>
		expect(preview().querySelector('mark.review-changed')?.textContent).toBe(
			'15 to 25',
		),
	)
})

test.each([
	['the body as stored', BODY],
	['a body with trailing spaces the round trip drops', BODY_SPACES],
])('opening the editor never posts a save: %s', async (_name, body) => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const { fetchMock } = mockFetch({ save: saveOk(HASH_B) })
	renderEditor({ article: { ...ARTICLE, body } })
	await richEditor()
	await vi.advanceTimersByTimeAsync(5000)
	expect(fetchMock).not.toHaveBeenCalled()
	expect(hiddenBody()).toBe(body)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saving)).toBeNull()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()
})

test('a picture drop is not offered on the phone', async () => {
	const { fetchMock } = mockFetch({})
	renderEditor()
	await richEditor()
	const file = new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', {
		type: 'image/png',
	})
	fireEvent.drop(preview(), {
		dataTransfer: { files: [file], types: ['Files'] },
	})
	expect(document.querySelector('[data-status]')).toBeNull()
	expect(fetchMock).not.toHaveBeenCalled()
	expect(noChatSheet()).toBeNull()
})

test('a change followed by a "Done." note keeps the change on the status line', async () => {
	const user = userEvent.setup()
	mockFetch({ chat: chatChangedThenNote })
	renderEditor()
	await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))

	const line = statusLine()
	expect(line.textContent).toContain('Changed: said 15 to 25 units.')
	expect(line.textContent).not.toContain('Done.')
	expect(
		within(line).getByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	).toBeTruthy()
})

test('See it lets go of the box and scrolls the mark to the middle of the readable band', async () => {
	const user = userEvent.setup()
	mockFetch({ chat: chatChanged })
	const scrollBy = vi.fn()
	vi.stubGlobal('scrollBy', scrollBy)
	renderEditor()
	await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	await waitFor(() =>
		expect(preview().querySelector('mark.review-changed')).not.toBeNull(),
	)
	// the mark measures as in view when it lands (jsdom draws nothing): no scroll
	await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
	expect(scrollBy).not.toHaveBeenCalled()

	// the phone's geometry: the top row ends at 76 px, the dock starts at 700, the mark is far below
	const zero = {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		width: 0,
		height: 0,
		x: 0,
		y: 0,
		toJSON() {},
	} as DOMRect
	const rectOf = (top: number, height: number) =>
		({ ...zero, top, y: top, height, bottom: top + height }) as DOMRect
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
		function (this: Element) {
			if (this.matches('mark.review-changed')) return rectOf(1500, 20)
			if (this.matches('[data-chat-dock]')) return rectOf(700, 100)
			if (this.matches('.sticky.z-20')) return rectOf(44, 32)
			return zero
		},
	)
	composer().focus()
	expect(document.activeElement).toBe(composer())
	fireEvent.click(
		within(statusLine()).getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	)
	expect(document.activeElement).not.toBe(composer())
	await waitFor(() =>
		expect(scrollBy).toHaveBeenCalledWith({
			top: 1510 - (76 + 700) / 2,
			behavior: 'smooth',
		}),
	)
})

test('a turn that never answers ends with the error line, and the article opens again', async () => {
	const user = userEvent.setup()
	let signal: AbortSignal | null | undefined = null
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url === '/resources/article-chat') {
				signal = init?.signal
				throw new DOMException('The operation timed out.', 'TimeoutError')
			}
			return jsonResponse(500, { error: 'unexpected' })
		}),
	)
	renderEditor()
	const prose = await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))

	expect(await screen.findByText(ARTICLE_CHAT_COPY.network)).toBeTruthy()
	expect(signal).toBeInstanceOf(AbortSignal)
	expect(
		within(statusLine()).getByRole('button', {
			name: ARTICLE_CHAT_COPY.tryAgain,
		}),
	).toBeTruthy()
	await waitFor(() =>
		expect(prose.getAttribute('contenteditable')).toBe('true'),
	)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.markdownBusy)).toBeNull()
	expect(composer().value).toBe(THE_ASK)
	expect(hiddenBody()).toBe(BODY)
})

test('leaving after a failed save asks in those words', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	mockFetch({ save: () => jsonResponse(500, { error: 'down' }) })
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saveFailed)).toBeTruthy()

	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(
		await screen.findByText(ARTICLE_EDITOR_COPY.leaveNotSaved),
	).toBeTruthy()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.leaveQuestion)).toBeNull()
	await user.click(
		screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.stay }),
	)
	expect(screen.queryByText('Elsewhere')).toBeNull()
})

test('a second failed turn after opening and closing the sheet still shows its error with Try again', async () => {
	const user = userEvent.setup()
	let attempts = 0
	mockFetch({
		chat: () => {
			attempts += 1
			return jsonResponse(502, { error: 'The assistant did not answer.' })
		},
	})
	renderEditor()
	await richEditor()

	// the first failure: the line shows the error
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	expect(await screen.findByText(ARTICLE_CHAT_COPY.noAnswer)).toBeTruthy()
	expect(statusLine().contains(screen.getByRole('alert'))).toBe(true)
	expect(attempts).toBe(1)

	// she looks at the conversation and closes it: everything so far is seen
	await openChat(user)
	await closeChat(user)
	expect(screen.queryByRole('status')).toBeNull()

	// the second failure drops the old rows; the new error must still show
	expect(composer().value).toBe(THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(attempts).toBe(2))
	expect(await screen.findByText(ARTICLE_CHAT_COPY.noAnswer)).toBeTruthy()
	const line = statusLine()
	expect(line.contains(screen.getByRole('alert'))).toBe(true)
	expect(
		within(line).getByRole('button', { name: ARTICLE_CHAT_COPY.tryAgain }),
	).toBeTruthy()
	expect(composer().value).toBe(THE_ASK)
})

test('Mod-K opens the link row only with a selection or a caret in a link', async () => {
	renderEditor()
	const prose = await richEditor()
	fireEvent.focus(prose)
	const modK = () =>
		act(() => {
			const v = view()
			v.someProp('handleKeyDown', f =>
				f.call(v, v, new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })),
			)
		})

	// the caret alone: nothing to link, the row keeps its buttons
	modK()
	expect(screen.queryByLabelText(TOOLBAR_COPY.linkLabel)).toBeNull()
	expect(
		within(dock()).getByRole('button', { name: TOOLBAR_COPY.bold }),
	).toBeTruthy()

	selectInArticle('20 units')
	modK()
	expect(screen.getByLabelText(TOOLBAR_COPY.linkLabel)).toBeTruthy()
})
