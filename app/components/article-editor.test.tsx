/**
 * @vitest-environment jsdom
 */
import { Form, Link } from '@remix-run/react'
import { createRemixStub } from '@remix-run/testing'
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ARTICLE_CHAT_COPY } from '#app/components/article-chat.tsx'
import {
	ArticleEditor,
	ARTICLE_EDITOR_COPY,
	type ArticleEditorProps,
} from '#app/components/article-editor.tsx'
import { type ChatMessageJson } from '#app/utils/article-chat.ts'
import { AUTO_SAVE_DEBOUNCE_MS } from '#app/utils/auto-save.ts'

/*
 * The editor in jsdom: no matchMedia (one column, Enter is a new line), no
 * MediaRecorder (the Dictate button stays hidden and the keyboard line
 * shows), a fetch mock that answers article-chat and article-save.
 */

const LINKS = [
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com' },
	{ name: 'Botox Knox', url: 'https://botoxknox.com' },
]
const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const BODY_CHANGED =
	'## Botox basics\n\nMost people need 15 to 25 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const THE_ASK = 'Say 15 to 25 units, it depends on the person.'

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
		claims: ['Most people need 20 units.'],
		history: [],
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
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>
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

async function openTab(user: ReturnType<typeof userEvent.setup>, name: string) {
	await user.click(await screen.findByRole('tab', { name }))
}

function composer() {
	return screen.getByLabelText('Message') as HTMLTextAreaElement
}

beforeEach(() => {
	window.sessionStorage.clear()
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

test('starts on the Chat tab with the working copy in a hidden input and no save mark', async () => {
	renderEditor()
	const chat = await screen.findByRole('tab', {
		name: ARTICLE_EDITOR_COPY.tabChat,
	})
	expect(chat.getAttribute('aria-selected')).toBe('true')
	expect(
		screen.getByRole('tab', { name: ARTICLE_EDITOR_COPY.tabArticle }),
	).toBeTruthy()
	expect(
		screen.getByRole('tab', { name: ARTICLE_EDITOR_COPY.tabMarkdown }),
	).toBeTruthy()
	expect(screen.getByText(ARTICLE_CHAT_COPY.emptyTitle)).toBeTruthy()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder)
	expect(
		screen
			.getByRole('button', { name: ARTICLE_CHAT_COPY.send })
			.hasAttribute('disabled'),
	).toBe(true)
	// jsdom cannot record, so the mic button stays hidden and the keyboard line shows
	expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull()
	expect(
		screen.getByText('Use the microphone key on your keyboard.'),
	).toBeTruthy()
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saving)).toBeNull()
	expect(screen.queryByRole('button', { name: 'Save edits' })).toBeNull()
	expect(
		screen.queryByRole('tab', { name: 'Tell it what to change' }),
	).toBeNull()
})

test('the Chat panel gets its fill height after a switch from another tab', async () => {
	const user = userEvent.setup()
	renderEditor({ initialTab: 'markdown' })
	const markdown = await screen.findByRole('tab', {
		name: ARTICLE_EDITOR_COPY.tabMarkdown,
	})
	expect(markdown.getAttribute('aria-selected')).toBe('true')
	// Radix mounts the panel one render after the tab switch; the fill
	// measure must key on the mounted node, not on the tab flag.
	expect(document.querySelector('[data-chat-panel]')).toBeNull()
	await openTab(user, ARTICLE_EDITOR_COPY.tabChat)
	await waitFor(() => {
		const panel = document.querySelector('[data-chat-panel]')
		// jsdom: the panel top is 0, so the fill height is the window height
		expect(panel instanceof HTMLElement ? panel.style.height : null).toBe(
			`${window.innerHeight}px`,
		)
	})
})

test('a typed change under Markdown saves after the debounce and blocks leaving only until then', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	let finishSave: (response: Response) => void = () => {}
	const saveLands = new Promise<Response>(resolve => {
		finishSave = resolve
	})
	const { calls } = mockFetch({ save: () => saveLands })
	renderEditor()
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	const editor = await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel)
	await user.type(editor, ' more')
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
	expect(calls.filter(c => c.url === '/resources/article-save')).toHaveLength(1)
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
	expect(calls.filter(c => c.url === '/resources/article-save')).toHaveLength(1)
})

test('a 409 shows the conflict card and Keep mine re-posts with the server hash', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { calls } = mockFetch({
		save: body =>
			body.baseHash === HASH_A
				? jsonResponse(409, {
						error: 'changed',
						message: 'The writer sent new text while you were editing.',
						body: '## New from the writer',
						hash: HASH_B,
					})
				: jsonResponse(200, { ok: true, hash: HASH_C, changed: true }),
	})
	renderEditor()
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	await user.type(
		await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel),
		' more',
	)
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)

	expect(await screen.findByText(ARTICLE_EDITOR_COPY.conflict)).toBeTruthy()
	// her copy is still there
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()

	await user.click(
		screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.keepMine }),
	)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
	const saves = calls.filter(c => c.url === '/resources/article-save')
	expect(saves).toHaveLength(2)
	expect(saves[1]?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_B,
		source: 'auto',
	})
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.conflict)).toBeNull()
})

test('Use the new text takes the writer’s text into every tab', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	mockFetch({
		save: () =>
			jsonResponse(409, {
				error: 'changed',
				message: 'x',
				body: '## New from the writer',
				hash: HASH_B,
			}),
	})
	renderEditor()
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	const editor = await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel)
	await user.type(editor, ' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	await user.click(
		await screen.findByRole('button', { name: ARTICLE_EDITOR_COPY.useTheirs }),
	)
	expect(hiddenBody()).toBe('## New from the writer')
	expect((editor as HTMLTextAreaElement).value).toBe('## New from the writer')
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()
	await openTab(user, ARTICLE_EDITOR_COPY.tabArticle)
	expect(within(preview()).getByText('New from the writer')).toBeTruthy()
})

test('a 409 keeps her copy: leaving asks first and the mirror still holds it', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	mockFetch({
		save: () =>
			jsonResponse(409, {
				error: 'changed',
				message: 'x',
				body: '## New from the writer',
				hash: HASH_B,
			}),
	})
	renderEditor()
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	await user.type(
		await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel),
		' more',
	)
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.conflict)).toBeTruthy()

	// the mirror holds her copy while the conflict waits
	expect(window.sessionStorage.getItem('article-editor:a1')).toBe(
		`${BODY} more`,
	)

	// leaving asks first
	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(
		await screen.findByText(ARTICLE_EDITOR_COPY.leaveQuestion),
	).toBeTruthy()
	await user.click(
		screen.getByRole('button', { name: ARTICLE_EDITOR_COPY.stay }),
	)
	expect(screen.queryByText('Elsewhere')).toBeNull()
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(window.sessionStorage.getItem('article-editor:a1')).toBe(
		`${BODY} more`,
	)
})

test('the Markdown tab is bound to the same working copy as the Article tab', async () => {
	const user = userEvent.setup()
	mockFetch({ save: saveOk(HASH_B) })
	renderEditor()
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	const editor = await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel)
	expect((editor as HTMLTextAreaElement).value).toBe(BODY)
	await user.clear(editor)
	await user.type(editor, 'My own words')
	expect(hiddenBody()).toBe('My own words')
	expect(screen.getByText(/Missing: Sarah Hitchcox Aesthetics/)).toBeTruthy()
	await openTab(user, ARTICLE_EDITOR_COPY.tabArticle)
	await waitFor(() =>
		expect(within(preview()).getByText('My own words')).toBeTruthy(),
	)
	expect(screen.getByText(ARTICLE_EDITOR_COPY.endLine)).toBeTruthy()
})

test('a no-ai publisher gets Article and Markdown only', async () => {
	renderEditor({
		article: {
			id: 'a1',
			kind: 'guest',
			title: 'Botox basics',
			where: 'Goes on example-magazine.com',
			byline: 'By Sarah Hitchcox, RN',
			about: 'About 1 min',
			body: BODY,
			savedHash: HASH_A,
			isReference: true,
		},
	})
	expect(
		await screen.findByText(ARTICLE_EDITOR_COPY.referenceNote),
	).toBeTruthy()
	expect(
		screen.getByRole('tab', { name: ARTICLE_EDITOR_COPY.tabArticle }),
	).toBeTruthy()
	expect(
		screen.queryByRole('tab', { name: ARTICLE_EDITOR_COPY.tabChat }),
	).toBeNull()
	expect(
		screen
			.getByRole('tab', { name: ARTICLE_EDITOR_COPY.tabMarkdown })
			.getAttribute('aria-selected'),
	).toBe('true')
	expect(screen.getByLabelText(ARTICLE_EDITOR_COPY.textLabel)).toBeTruthy()
	expect(screen.queryByLabelText('Message')).toBeNull()
})

test('a decided article in readOnly has no composer and no save', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { fetchMock } = mockFetch({ save: saveOk(HASH_B) })
	renderEditor({ readOnly: true })
	expect(
		await screen.findByText(ARTICLE_CHAT_COPY.decidedComposer),
	).toBeTruthy()
	expect(screen.queryByLabelText('Message')).toBeNull()
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	const editor = await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel)
	expect(editor.hasAttribute('readonly')).toBe(true)
	await user.type(editor, ' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(fetchMock).not.toHaveBeenCalled()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saving)).toBeNull()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()
})

test('does not block leaving when nothing changed', async () => {
	const user = userEvent.setup()
	renderEditor()
	await user.click(await screen.findByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText('Elsewhere')).toBeTruthy()
})

test('a chat turn that changed the body marks it saved and the change row shows See it and Undo', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({ chat: chatChanged })
	renderEditor()
	await user.type(await screen.findByLabelText('Message'), THE_ASK)
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
	expect(calls.filter(c => c.url === '/resources/article-save')).toHaveLength(0)
	expect(screen.getByText(THE_ASK)).toBeTruthy()
	expect(screen.getByText('Changed: said 15 to 25 units.')).toBeTruthy()
	expect(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	).toBeTruthy()
	expect(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	).toBeTruthy()
	expect(composer().value).toBe('')

	// See it opens the Article tab with the changed text marked
	await user.click(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	)
	expect(
		screen
			.getByRole('tab', { name: ARTICLE_EDITOR_COPY.tabArticle })
			.getAttribute('aria-selected'),
	).toBe('true')
	// the changed span is inside the green mark, so read the whole prose
	await waitFor(() => expect(preview().textContent).toContain('15 to 25 units'))
	expect(preview().querySelector('mark.review-changed')?.textContent).toBe(
		'15 to 25',
	)
	// the Markdown tab holds the new text
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	expect(
		(
			(await screen.findByLabelText(
				ARTICLE_EDITOR_COPY.textLabel,
			)) as HTMLTextAreaElement
		).value,
	).toBe(BODY_CHANGED)
})

test('Undo saves the previous body from the new hash and reads Undone.', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({ chat: chatChanged, save: saveOk(HASH_C) })
	renderEditor()
	await user.type(await screen.findByLabelText('Message'), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await user.click(
		await screen.findByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	)

	expect(await screen.findByText(ARTICLE_CHAT_COPY.undone)).toBeTruthy()
	expect(hiddenBody()).toBe(BODY)
	const save = calls.find(c => c.url === '/resources/article-save')
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
})

test('the composer is disabled while a conflict waits', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	mockFetch({
		save: () =>
			jsonResponse(409, {
				error: 'changed',
				message: 'x',
				body: '## New from the writer',
				hash: HASH_B,
			}),
	})
	renderEditor()
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	await user.type(
		await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel),
		' more',
	)
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.conflict)).toBeTruthy()
	await openTab(user, ARTICLE_EDITOR_COPY.tabChat)
	expect(
		await screen.findByText(ARTICLE_CHAT_COPY.conflictComposer),
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
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	await user.type(
		await screen.findByLabelText(ARTICLE_EDITOR_COPY.textLabel),
		' more',
	)
	await openTab(user, ARTICLE_EDITOR_COPY.tabChat)
	await user.type(await screen.findByLabelText('Message'), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))

	expect(await screen.findByText(ARTICLE_CHAT_COPY.notSaved)).toBeTruthy()
	expect(calls.filter(c => c.url === '/resources/article-chat')).toHaveLength(0)
	expect(
		calls.filter(c => c.url === '/resources/article-save').length,
	).toBeGreaterThan(0)
	// her words stay in the box
	expect(composer().value).toBe(THE_ASK)
})

test('an initialQuote is attached on mount and the placeholder changes', async () => {
	const user = userEvent.setup()
	renderEditor({ initialQuote: 'Most people need 20 units.' })
	const box = await screen.findByLabelText('Message')
	expect((box as HTMLTextAreaElement).placeholder).toBe(
		ARTICLE_CHAT_COPY.quotePlaceholder,
	)
	expect(
		screen.getByText('Most people need 20 units.', {
			selector: 'blockquote > button',
		}),
	).toBeTruthy()
	await user.click(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.removeQuote }),
	)
	expect(
		screen.queryByText('Most people need 20 units.', {
			selector: 'blockquote > button',
		}),
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
	renderEditor({ initialQuote: 'Most people need 20 units.' })
	await user.type(await screen.findByLabelText('Message'), 'Is that right?')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	expect(await screen.findByText('Yes, 20 units is usual.')).toBeTruthy()
	expect(calls[0]?.body).toEqual({
		articleId: 'a1',
		text: 'Is that right?',
		quote: 'Most people need 20 units.',
		baseHash: HASH_A,
	})
	// the quote left the composer and sits in the bubble
	expect(
		screen.getByText('Most people need 20 units.', {
			selector: 'blockquote > button',
		}),
	).toBeTruthy()
	expect(composer().placeholder).toBe(ARTICLE_CHAT_COPY.placeholder)
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.saved)).toBeNull()
})

test('the error entry keeps her words and Try again re-sends', async () => {
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
	await user.type(await screen.findByLabelText('Message'), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))

	expect(await screen.findByText(ARTICLE_CHAT_COPY.noAnswer)).toBeTruthy()
	expect(composer().value).toBe(THE_ASK)
	expect(hiddenBody()).toBe(BODY)

	await user.click(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.tryAgain }),
	)
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	expect(calls.filter(c => c.url === '/resources/article-chat')).toHaveLength(2)
	expect(calls[1]?.body).toEqual({
		articleId: 'a1',
		text: THE_ASK,
		baseHash: HASH_A,
	})
	expect(screen.queryByText(ARTICLE_CHAT_COPY.noAnswer)).toBeNull()
})

test('the stored history renders oldest first with the day divider', async () => {
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
	expect(await screen.findByText('Is 20 units usual?')).toBeTruthy()
	expect(screen.getByText('Yes, for the glabella.')).toBeTruthy()
	expect(screen.getByText('Changed: added Dysport.')).toBeTruthy()
	expect(screen.getByText(ARTICLE_CHAT_COPY.today)).toBeTruthy()
	// a change from an earlier visit has See it but no Undo
	expect(
		screen.getByRole('button', { name: ARTICLE_CHAT_COPY.seeIt }),
	).toBeTruthy()
	expect(
		screen.queryByRole('button', { name: ARTICLE_CHAT_COPY.undo }),
	).toBeNull()
	expect(screen.queryByText(ARTICLE_CHAT_COPY.emptyTitle)).toBeNull()
})

test('typing under Markdown while a chat turn runs is held, and the answer lands on the text it was built on', async () => {
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
	await user.type(await screen.findByLabelText('Message'), THE_ASK)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHAT_COPY.send }))
	await waitFor(() =>
		expect(calls.filter(c => c.url === '/resources/article-chat')).toHaveLength(
			1,
		),
	)

	// while the turn runs the Markdown tab is read-only and says why
	await openTab(user, ARTICLE_EDITOR_COPY.tabMarkdown)
	const editor = (await screen.findByLabelText(
		ARTICLE_EDITOR_COPY.textLabel,
	)) as HTMLTextAreaElement
	expect(editor.readOnly).toBe(true)
	expect(screen.getByText(ARTICLE_EDITOR_COPY.markdownBusy)).toBeTruthy()
	await user.type(editor, ' more')
	fireEvent.change(editor, { target: { value: `${BODY} more` } })
	expect(editor.value).toBe(BODY)
	expect(hiddenBody()).toBe(BODY)

	// the answer lands on the text the model was given; no words were dropped, no save was posted
	finishChat(chatChanged(asked))
	await waitFor(() => expect(hiddenBody()).toBe(BODY_CHANGED))
	expect(editor.value).toBe(BODY_CHANGED)
	expect(editor.readOnly).toBe(false)
	expect(screen.getByText(ARTICLE_EDITOR_COPY.editorHint)).toBeTruthy()
	expect(screen.queryByText(ARTICLE_EDITOR_COPY.conflict)).toBeNull()
	expect(calls.filter(c => c.url === '/resources/article-save')).toHaveLength(0)
	expect(await screen.findByText(ARTICLE_EDITOR_COPY.saved)).toBeTruthy()

	// the text opens again: a typed change goes into the working copy as usual
	await user.type(editor, ' more')
	expect(hiddenBody()).toBe(`${BODY_CHANGED} more`)
})
