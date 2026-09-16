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
	return render(<RemixStub initialEntries={['/review/a1/change']} />)
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

/** The dock's status line. The save mark is a status too, so the role alone is not enough. */
function statusLine() {
	const el = document.querySelector('[data-status-line]')
	if (!(el instanceof HTMLElement)) throw new Error('no status line')
	return el
}

function noStatusLine() {
	return document.querySelector('[data-status-line]')
}

/** The save mark: `data-save-state` carries its state. */
function saveState() {
	const el = document.querySelector('[data-save-state]')
	if (!(el instanceof HTMLElement)) throw new Error('no save mark')
	return el
}

/** The icon the save mark draws: the fragment of its `<use href>`. */
function saveIcon() {
	const href = saveState().querySelector('use')?.getAttribute('href') ?? ''
	return href.slice(href.indexOf('#') + 1)
}

/** The spinner, with the sr-only "Saving…". */
function expectSaving() {
	const mark = saveState()
	expect(mark.dataset.saveState).toBe('saving')
	expect(saveIcon()).toBe('update')
	expect(mark.querySelector('svg')?.getAttribute('class')).toContain(
		'animate-spin',
	)
	expect(
		within(mark).getByText(ARTICLE_EDITOR_COPY.saving).className,
	).toContain('sr-only')
}

/** The check, with the sr-only "Saved", once the save has landed. */
async function expectSaved() {
	await waitFor(() => expect(saveState().dataset.saveState).toBe('saved'))
	expect(saveIcon()).toBe('check')
	expect(
		within(saveState()).getByText(ARTICLE_EDITOR_COPY.saved).className,
	).toContain('sr-only')
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

/** The dock's tab, not the sheet's ×: both read "Close the chat". */
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

/** A fetch mock that answers article-chat (the POST, and the GET of the thread), article-save, and records every call. */
function mockFetch(handlers: {
	chat?: (body: Record<string, unknown>) => Response | Promise<Response>
	history?: () => Response | Promise<Response>
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
		if (url.startsWith('/resources/article-chat?') && handlers.history)
			return handlers.history()
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

/* The grill: the server asks one question at a time (assistant rows with
 * toolName grill_question); a grill_done row ends it. */
const Q1 = 'Q1. How long do you tell patients Botox lasts? A range is fine.'
const Q2 = 'Q2. What do you charge per unit at the moment?'
const GRILL_DONE =
	'Done. Here is what changed: the article now gives your range.'
const ANSWER_1 = 'Three to four months for most people.'

/** A grill start: the first question and no user row. */
const grillStart = () =>
	jsonResponse(200, {
		messages: [
			row({
				id: 'q1',
				role: 'assistant',
				text: Q1,
				toolName: 'grill_question',
			}),
		],
		body: BODY,
		hash: HASH_A,
		changed: false,
		grill: 'active',
	})

/** Her answer applied to the article, then the next question. */
const grillNext = (body: Record<string, unknown>) =>
	jsonResponse(200, {
		messages: [
			row({ id: 'u1', role: 'user', text: String(body.text) }),
			row({
				id: 'c1',
				role: 'change',
				text: 'Said 15 to 25 units.',
				toolName: 'replace_text',
			}),
			row({
				id: 'q2',
				role: 'assistant',
				text: Q2,
				toolName: 'grill_question',
			}),
		],
		body: BODY_CHANGED,
		hash: HASH_B,
		changed: true,
		grill: 'active',
	})

/** The last answer: the grill ends with the Done row. */
const grillEnd = (body: Record<string, unknown>) =>
	jsonResponse(200, {
		messages: [
			row({ id: 'u2', role: 'user', text: String(body.text) }),
			row({
				id: 'd1',
				role: 'assistant',
				text: GRILL_DONE,
				toolName: 'grill_done',
			}),
		],
		body: BODY_CHANGED,
		hash: HASH_B,
		changed: false,
		grill: 'done',
	})

/** Stop grilling: the server's Stopped. row. */
const grillStopped = () =>
	jsonResponse(200, {
		messages: [
			row({
				id: 'd2',
				role: 'assistant',
				text: 'Stopped.',
				toolName: 'grill_done',
			}),
		],
		body: BODY,
		hash: HASH_A,
		changed: false,
		grill: 'done',
	})

function grillButton() {
	return screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.grillMe })
}

function stopGrillingButton() {
	return screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.stopGrilling })
}

/** The sheet's list, once the sheet is open. */
async function sheetList() {
	const sheet = await screen.findByRole('dialog', {
		name: CHAT_SHELL_COPY.chatTitle,
	})
	const list = sheet.querySelector('[data-chat-list]')
	if (!(list instanceof HTMLElement)) throw new Error('no chat list')
	return list
}

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
	// the dock: the composer and the tab; no status line and no invitation over the box before the first turn
	expect(noStatusLine()).toBeNull()
	expect(within(dock()).queryByText(ARTICLE_CHAT_COPY.emptyTitle)).toBeNull()
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
	// the composer row ends with the save mark, and the tab is not in it
	const row = screen.getByRole('button', {
		name: ARTICLE_CHAT_COPY.send,
	}).parentElement
	if (!row) throw new Error('no composer row')
	expect(row.contains(saveState())).toBe(true)
	expect(
		within(row).queryByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeNull()
	// jsdom cannot record, so the mic button stays hidden and the keyboard line shows
	expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull()
	expect(
		screen.getByText('Use the microphone key on your keyboard.'),
	).toBeTruthy()
	// nothing saved yet: the mark is idle and empty; the Markdown toggle is off
	expect(saveState().dataset.saveState).toBe('idle')
	expect(saveState().textContent).toBe('')
	expect(document.querySelectorAll('[data-save-state]')).toHaveLength(1)
	expect(screen.queryByRole('button', { name: 'Save edits' })).toBeNull()
	expect(markdownToggle().getAttribute('aria-pressed')).toBe('false')
	// no bar slot: the toggle sits in a plain row at the top of the editor, not a sticky one
	expect(markdownToggle().parentElement?.className).not.toContain('sticky')
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
	expectSaving()

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
	expectSaving()
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(saveCalls(calls)).toHaveLength(1)
	expect(calls[0]?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_A,
		source: 'auto',
	})
	await expectSaved()
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
	// on the phone the card sits in the dock, so the choice is on screen; the save mark under it points up
	expect(dock().contains(card)).toBe(true)
	expect(saveState().dataset.saveState).toBe('conflict')
	expect(dock().contains(saveState())).toBe(true)
	expect(saveState().textContent).toBe(ARTICLE_EDITOR_COPY.conflictAbove)
	// her copy is still there, and the dock says what to do first
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(
		within(dock()).getByText(ARTICLE_CHAT_COPY.conflictComposer),
	).toBeTruthy()
	expect(screen.queryByLabelText('Message')).toBeNull()

	await user.click(
		screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.keepMine }),
	)
	await expectSaved()
	const saves = saveCalls(calls)
	expect(saves).toHaveLength(2)
	expect(saves[1]?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_B,
		source: 'auto',
	})
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.conflict)).toBeNull()
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
	await expectSaved()
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
	expect(noStatusLine()).toBeNull()
	expect(document.querySelector('[data-chat-dock]')).toBeNull()
	// no composer row to hold the save mark: it sits with the Markdown toggle
	expect(markdownToggle().parentElement?.contains(saveState())).toBe(true)

	// the caret in the article: the dock holds the format row alone, with no tab
	fireEvent.focus(prose)
	expect(
		within(dock()).queryByRole('button', { name: CHAT_SHELL_COPY.openChat }),
	).toBeNull()
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
	expect(noStatusLine()).toBeNull()
	// the article reads through the plain view
	expect(document.querySelector('.ProseMirror')).toBeNull()
	expect(within(preview()).getByText(/Most people need 20 units/)).toBeTruthy()

	const box = await rawBox(user)
	expect(box.hasAttribute('readonly')).toBe(true)
	await user.type(box, ' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(fetchMock).not.toHaveBeenCalled()
	expect(hiddenBody()).toBe(BODY)
	// nothing saves: no save mark at all
	expect(document.querySelector('[data-save-state]')).toBeNull()

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
	await expectSaved()
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
	await expectSaved()
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
	expect(saveState().dataset.saveState).toBe('idle')

	// Open shows the bubble with the quote
	await user.click(
		within(line).getByRole('button', { name: CHAT_SHELL_COPY.open }),
	)
	const sheet = chatSheet()
	expect(
		within(sheet).getByText(CLAIM, { selector: 'blockquote > button' }),
	).toBeTruthy()
	expect(within(sheet).getByText('Yes, 20 units is usual.')).toBeTruthy()
	expect(noStatusLine()).toBeNull()
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
	expect(noStatusLine()).toBeNull()
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

	// while the turn runs the article takes no input
	await waitFor(() =>
		expect(prose.getAttribute('contenteditable')).toBe('false'),
	)
	expect(prose.getAttribute('aria-busy')).toBe('true')
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
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.conflict)).toBeNull()
	expect(saveCalls(calls)).toHaveLength(0)
	await expectSaved()

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
	// before the first turn there is no status line at all
	expect(noStatusLine()).toBeNull()

	// with the caret in the article the format row shows in the dock
	fireEvent.focus(prose)
	expect(toolbar()).toBeTruthy()
	expect(dock().contains(toolbar())).toBe(true)
	expect(noStatusLine()).toBeNull()
	fireEvent.blur(prose)
	expect(toolbar()).toBeNull()
	expect(noStatusLine()).toBeNull()

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
	expectSaving()

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
	await expectSaved()
})

test('the sheet opens from the tab, and See it from inside it closes it', async () => {
	const user = userEvent.setup()
	mockFetch({ chat: chatChanged })
	renderEditor()
	await richEditor()

	// the tab on the dock's top edge
	const tab = within(dock()).getByRole('button', {
		name: CHAT_SHELL_COPY.openChat,
	})
	expect(tab.getAttribute('aria-expanded')).toBe('false')
	expect(tab.className).toContain('-top-7')
	await user.click(tab)
	expect(chatSheet().querySelector('[data-chat-list]')).toBeTruthy()
	expect(noStatusLine()).toBeNull()
	const close = within(dock()).getByRole('button', {
		name: CHAT_SHELL_COPY.closeChat,
	})
	expect(close.getAttribute('aria-expanded')).toBe('true')
	await user.click(close)
	expect(noChatSheet()).toBeNull()
	// nothing to report yet: the dock has no status line
	expect(noStatusLine()).toBeNull()

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
	expect(saveState().dataset.saveState).toBe('idle')
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
	// the phone's geometry: the page's top bar ends at 76 px (stickyTop), the dock starts at 700
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
	let markTop = 300
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
		function (this: Element) {
			if (this.matches('mark.review-changed')) return rectOf(markTop, 20)
			if (this.matches('[data-chat-dock]')) return rectOf(700, 100)
			return zero
		},
	)
	renderEditor({ stickyTop: 76 })
	await richEditor()
	await user.type(composer(), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	await waitFor(() =>
		expect(preview().querySelector('mark.review-changed')).not.toBeNull(),
	)
	// the mark lands inside the band (under the bar, above the dock): no scroll
	await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
	expect(scrollBy).not.toHaveBeenCalled()

	// the mark is far below the dock: See it scrolls it to the middle of the band
	markTop = 1500
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
	await waitFor(() => expect(saveState().dataset.saveState).toBe('error'))
	expect(saveState().textContent).toContain(ARTICLE_EDITOR_COPY.saveFailed)
	expect(
		within(saveState()).getByRole('button', {
			name: ARTICLE_EDITOR_COPY.tryNow,
		}),
	).toBeTruthy()

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
	expect(noStatusLine()).toBeNull()

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

test('a failed save shows Could not save. with Try now in the dock, and Try now posts it again', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	let attempts = 0
	const { calls } = mockFetch({
		save: () => {
			attempts += 1
			return attempts === 1
				? jsonResponse(500, { error: 'down' })
				: jsonResponse(200, { ok: true, hash: HASH_B, changed: true })
		},
	})
	renderEditor()
	await richEditor()
	typeInArticle(' more')
	expectSaving()
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)

	await waitFor(() => expect(saveState().dataset.saveState).toBe('error'))
	expect(dock().contains(saveState())).toBe(true)
	expect(saveState().textContent).toContain(ARTICLE_EDITOR_COPY.saveFailed)
	await user.click(
		within(saveState()).getByRole('button', {
			name: ARTICLE_EDITOR_COPY.tryNow,
		}),
	)
	await expectSaved()
	const saves = saveCalls(calls)
	expect(saves).toHaveLength(2)
	expect(saves[1]?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_A,
		source: 'auto',
	})
})

test('the bar slot holds Grill me then the Markdown toggle on the phone, and nothing while it is null; the save mark stays in the dock', async () => {
	const user = userEvent.setup()
	const { unmount } = renderEditor({ barSlot: null })
	await richEditor()
	expect(
		screen.queryByRole('button', { name: ARTICLE_EDITOR_COPY.markdown }),
	).toBeNull()
	expect(dock().contains(saveState())).toBe(true)
	unmount()

	const slot = document.body.appendChild(document.createElement('div'))
	slot.setAttribute('data-editor-bar-slot', '')
	try {
		renderEditor({ barSlot: slot })
		await richEditor()
		const toggle = within(slot).getByRole('button', {
			name: ARTICLE_EDITOR_COPY.markdown,
		})
		const grill = within(slot).getByRole('button', {
			name: ARTICLE_EDITOR_COPY.grillMe,
		})
		expect(within(slot).getAllByRole('button')).toEqual([grill, toggle])
		expect(slot.querySelector('[data-save-state]')).toBeNull()
		expect(document.querySelectorAll('[data-save-state]')).toHaveLength(1)
		expect(dock().contains(saveState())).toBe(true)
		// the toggle works from the slot
		await user.click(toggle)
		expect(toggle.getAttribute('aria-pressed')).toBe('true')
		expect(screen.getByLabelText(ARTICLE_EDITOR_COPY.textLabel)).toBeTruthy()
	} finally {
		slot.remove()
	}
})

test('Grill me posts mode grill with the hash and no text; the question opens the sheet, the box asks for the answer, and the button reads Stop grilling', async () => {
	const user = userEvent.setup()
	let finishChat: (response: Response) => void = () => {}
	const chatLands = new Promise<Response>(resolve => {
		finishChat = resolve
	})
	const { calls } = mockFetch({ chat: () => chatLands })
	renderEditor()
	await richEditor()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder)
	expect(
		screen.queryByRole('button', { name: ARTICLE_EDITOR_COPY.stopGrilling }),
	).toBeNull()

	await user.click(grillButton())
	await waitFor(() => expect(chatCalls(calls)).toHaveLength(1))
	expect(calls[0]?.body).toEqual({
		articleId: 'a1',
		mode: 'grill',
		baseHash: HASH_A,
	})
	expect(saveCalls(calls)).toHaveLength(0)
	// while it runs: the button is off, the dock shows the working dots, the sheet stays closed
	expect(grillButton().hasAttribute('disabled')).toBe(true)
	expect(statusLine().textContent).toContain(ARTICLE_CHAT_COPY.working)
	expect(noChatSheet()).toBeNull()

	finishChat(grillStart())
	// the sheet opens on the question, labelled as one
	const list = await sheetList()
	expect(within(list).getByText(Q1)).toBeTruthy()
	expect(within(list).getByText(ARTICLE_CHAT_COPY.question)).toBeTruthy()
	expect(list.querySelectorAll('[data-grill-question]')).toHaveLength(1)
	expect(noStatusLine()).toBeNull()
	// the box asks for the answer and has the focus; the bar button flips
	expect(composer().placeholder).toBe('Answer here, or say skip')
	await waitFor(() => expect(document.activeElement).toBe(composer()))
	expect(stopGrillingButton().hasAttribute('disabled')).toBe(false)
	expect(
		screen.queryByRole('button', { name: ARTICLE_EDITOR_COPY.grillMe }),
	).toBeNull()
	// nothing changed in the article
	expect(hiddenBody()).toBe(BODY)
	expect(saveState().dataset.saveState).toBe('idle')
})

test('an answer during a grill posts as a normal turn; the next question keeps the grill and takes the status line over the change; grill_done ends it', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({
		chat: body =>
			body.mode === 'grill'
				? grillStart()
				: body.text === ANSWER_1
					? grillNext(body)
					: grillEnd(body),
	})
	renderEditor()
	await richEditor()
	await user.click(grillButton())
	await sheetList()
	// she answers from the dock with the sheet closed
	await closeChat(user)
	expect(noStatusLine()).toBeNull()
	await user.type(composer(), ANSWER_1)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	expect(calls[1]?.body).toEqual({
		articleId: 'a1',
		text: ANSWER_1,
		baseHash: HASH_A,
	})
	await expectSaved()

	// the next question waits on the status line, over the change it came with
	const line = statusLine()
	expect(line.textContent).toContain(Q2)
	expect(line.textContent).not.toContain('Changed:')
	expect(
		within(line).getByRole('button', { name: CHAT_SHELL_COPY.open }),
	).toBeTruthy()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.grillPlaceholder)
	expect(composer().value).toBe('')
	expect(stopGrillingButton()).toBeTruthy()
	// the article changed in place all the same
	await waitFor(() =>
		expect(preview().querySelector('mark.review-changed')?.textContent).toBe(
			'15 to 25',
		),
	)

	// "skip" is an ordinary turn too; the Done row ends the grill
	await user.type(composer(), 'skip')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() => expect(chatCalls(calls)).toHaveLength(3))
	expect(calls[2]?.body).toEqual({
		articleId: 'a1',
		text: 'skip',
		baseHash: HASH_B,
	})
	await waitFor(() =>
		expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder),
	)
	expect(grillButton()).toBeTruthy()
	expect(statusLine().textContent).toContain(GRILL_DONE)

	// in the conversation the questions carry the label and the Done row is a plain answer
	await openChat(user)
	const list = await sheetList()
	expect(within(list).getByText(Q1)).toBeTruthy()
	expect(within(list).getByText(Q2)).toBeTruthy()
	expect(within(list).getByText(GRILL_DONE)).toBeTruthy()
	expect(within(list).getByText(ANSWER_1)).toBeTruthy()
	expect(within(list).getByText('Changed: said 15 to 25 units.')).toBeTruthy()
	expect(list.querySelectorAll('[data-grill-question]')).toHaveLength(2)
	expect(within(list).getAllByText(ARTICLE_CHAT_COPY.question)).toHaveLength(2)
})

test('Stop grilling posts mode grill_stop with the hash; the Stopped. row lands and the box returns to normal with her words kept', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({
		chat: body =>
			body.mode === 'grill'
				? grillStart()
				: body.mode === 'grill_stop'
					? grillStopped()
					: jsonResponse(500, { error: 'unexpected' }),
	})
	renderEditor()
	await richEditor()
	await user.click(grillButton())
	const list = await sheetList()
	await user.type(composer(), 'About four')

	await user.click(stopGrillingButton())
	await waitFor(() => expect(chatCalls(calls)).toHaveLength(2))
	expect(calls[1]?.body).toEqual({
		articleId: 'a1',
		mode: 'grill_stop',
		baseHash: HASH_A,
	})
	await waitFor(() =>
		expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder),
	)
	expect(grillButton()).toBeTruthy()
	expect(composer().value).toBe('About four')
	// the sheet stays open and shows the end as a plain answer
	expect(within(list).getByText('Stopped.')).toBeTruthy()
	expect(list.querySelectorAll('[data-grill-question]')).toHaveLength(1)
	expect(hiddenBody()).toBe(BODY)
})

test('a grill start that fails shows the error with Try again, and Try again posts mode grill once more', async () => {
	const user = userEvent.setup()
	let attempts = 0
	const { calls } = mockFetch({
		chat: () => {
			attempts += 1
			return attempts === 1
				? jsonResponse(502, { error: 'The assistant did not answer.' })
				: grillStart()
		},
	})
	renderEditor()
	await richEditor()
	await user.click(grillButton())
	expect(await screen.findByText(ARTICLE_CHAT_COPY.noAnswer)).toBeTruthy()
	expect(statusLine().contains(screen.getByRole('alert'))).toBe(true)
	expect(noChatSheet()).toBeNull()
	// no grill yet: the button and the box read as before
	expect(grillButton().hasAttribute('disabled')).toBe(false)
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder)

	await user.click(
		within(statusLine()).getByRole('button', {
			name: ARTICLE_CHAT_COPY.tryAgain,
		}),
	)
	await waitFor(() => expect(chatCalls(calls)).toHaveLength(2))
	expect(calls[1]?.body).toEqual({
		articleId: 'a1',
		mode: 'grill',
		baseHash: HASH_A,
	})
	const list = await sheetList()
	expect(within(list).getByText(Q1)).toBeTruthy()
	expect(screen.queryByText(ARTICLE_CHAT_COPY.noAnswer)).toBeNull()
	expect(stopGrillingButton()).toBeTruthy()
})

test('Grill me is absent for a decided row and an own-words row; a stored open grill starts active and a closed one does not', async () => {
	const decided = renderEditor({ readOnly: true })
	await screen.findByText(ARTICLE_CHAT_COPY.decidedComposer)
	expect(
		screen.queryByRole('button', { name: ARTICLE_EDITOR_COPY.grillMe }),
	).toBeNull()
	expect(
		screen.queryByRole('button', { name: ARTICLE_EDITOR_COPY.stopGrilling }),
	).toBeNull()
	decided.unmount()

	const ownWords = renderEditor({ article: { ...ARTICLE, isReference: true } })
	await richEditor()
	expect(markdownToggle()).toBeTruthy()
	expect(
		screen.queryByRole('button', { name: ARTICLE_EDITOR_COPY.grillMe }),
	).toBeNull()
	ownWords.unmount()

	const question = row({
		id: 'q1',
		role: 'assistant',
		text: Q1,
		toolName: 'grill_question',
	})
	const open = renderEditor({ history: [question] })
	await richEditor()
	expect(stopGrillingButton()).toBeTruthy()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.grillPlaceholder)
	open.unmount()

	renderEditor({
		history: [
			question,
			row({
				id: 'd1',
				role: 'assistant',
				text: GRILL_DONE,
				toolName: 'grill_done',
			}),
		],
	})
	await richEditor()
	expect(grillButton()).toBeTruthy()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder)
})

test('Grill me while the server already runs a grill (409 grill_active) takes the thread from the server and flips to Stop grilling', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({
		chat: () =>
			jsonResponse(409, {
				error: 'grill_active',
				message:
					'A grill is already running. Answer in the chat, or stop it first.',
			}),
		history: () =>
			jsonResponse(200, {
				messages: [
					row({ id: 'h1', role: 'user', text: 'Is 20 units usual?' }),
					row({
						id: 'q1',
						role: 'assistant',
						text: Q1,
						toolName: 'grill_question',
					}),
				],
				grill: 'active',
			}),
	})
	renderEditor()
	await richEditor()
	await user.click(grillButton())

	// the sheet opens on the thread as stored, with the question that waits
	const list = await sheetList()
	expect(within(list).getByText('Is 20 units usual?')).toBeTruthy()
	expect(within(list).getByText(Q1)).toBeTruthy()
	expect(list.querySelectorAll('[data-grill-question]')).toHaveLength(1)
	expect(screen.queryByRole('alert')).toBeNull()
	expect(
		screen.queryByRole('button', { name: ARTICLE_CHAT_COPY.tryAgain }),
	).toBeNull()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.grillPlaceholder)
	await waitFor(() => expect(document.activeElement).toBe(composer()))
	expect(stopGrillingButton()).toBeTruthy()
	expect(calls.map(c => c.url)).toEqual([
		'/resources/article-chat',
		'/resources/article-chat?articleId=a1',
	])
	expect(hiddenBody()).toBe(BODY)
})

test('the same 409 with the thread unreadable shows the server’s line in the chat and still flips to Stop grilling', async () => {
	const user = userEvent.setup()
	const line =
		'A grill is already running. Answer in the chat, or stop it first.'
	mockFetch({
		chat: () => jsonResponse(409, { error: 'grill_active', message: line }),
	})
	renderEditor()
	await richEditor()
	await user.click(grillButton())

	const list = await sheetList()
	expect(within(list).getByText(line)).toBeTruthy()
	expect(list.querySelector('[data-grill-question]')).toBeNull()
	expect(screen.queryByRole('alert')).toBeNull()
	expect(
		screen.queryByRole('button', { name: ARTICLE_CHAT_COPY.tryAgain }),
	).toBeNull()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.grillPlaceholder)
	expect(stopGrillingButton()).toBeTruthy()
})
