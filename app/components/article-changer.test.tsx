/**
 * @vitest-environment jsdom
 */
import { Form, Link } from '@remix-run/react'
import { createRemixStub } from '@remix-run/testing'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
	ArticleChanger,
	ARTICLE_CHANGER_COPY,
	AUTO_SAVE_DEBOUNCE_MS,
	type ArticleChangerProps,
} from '#app/components/article-changer.tsx'

const LINKS = [
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com' },
	{ name: 'Botox Knox', url: 'https://botoxknox.com' },
]
const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)

function renderChanger(overrides: Partial<ArticleChangerProps> = {}) {
	const props: ArticleChangerProps = {
		articleId: 'a1',
		initialBody: BODY,
		savedHash: HASH_A,
		links: LINKS,
		claims: ['Most people need 20 units.'],
		isReference: false,
		kind: 'guest',
		...overrides,
	}
	const RemixStub = createRemixStub([
		{
			path: '/review/a1/change',
			Component: () => (
				<Form method="post">
					<ArticleChanger {...props} />
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
	if (!(input instanceof HTMLInputElement)) throw new Error('no hidden body input')
	return input.value
}

function jsonResponse(status: number, data: unknown) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

type Call = { url: string; body: Record<string, unknown> }

/** A fetch mock that answers article-edit and article-save and records every call. */
function mockFetch(handlers: {
	edit?: (body: Record<string, unknown>) => Response
	save?: (body: Record<string, unknown>) => Response | Promise<Response>
}) {
	const calls: Call[] = []
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>
		calls.push({ url, body })
		if (url === '/resources/article-edit' && handlers.edit) return handlers.edit(body)
		if (url === '/resources/article-save' && handlers.save) return handlers.save(body)
		return jsonResponse(500, { error: 'unexpected' })
	})
	vi.stubGlobal('fetch', fetchMock)
	return { fetchMock, calls }
}

const saveOk = (hash: string) => () => jsonResponse(200, { ok: true, hash, changed: true })

beforeEach(() => {
	window.sessionStorage.clear()
})

afterEach(() => {
	vi.unstubAllGlobals()
})

test('starts on the prompt tab with the working copy in a hidden input and no save mark', async () => {
	renderChanger()
	expect(await screen.findByRole('tab', { name: ARTICLE_CHANGER_COPY.promptTab })).toBeTruthy()
	expect(screen.getByRole('tab', { name: ARTICLE_CHANGER_COPY.editTab })).toBeTruthy()
	expect(screen.getByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder)).toBeTruthy()
	const make = screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make })
	expect(make.hasAttribute('disabled')).toBe(true)
	// jsdom has no speech API, so the mic button stays hidden
	expect(screen.queryByRole('button', { name: ARTICLE_CHANGER_COPY.dictate })).toBeNull()
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.saved)).toBeNull()
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.saving)).toBeNull()
	expect(screen.queryByRole('button', { name: 'Save edits' })).toBeNull()
	expect(screen.getByText(/In place: Botox Knox/)).toBeTruthy()
	expect(screen.getByText(/\d+ words/)).toBeTruthy()
})

test('chips and claim pills fill the prompt box', async () => {
	const user = userEvent.setup()
	renderChanger()
	await user.click(await screen.findByRole('button', { name: 'Wrong fact' }))
	await user.click(screen.getByRole('button', { name: /Most people need 20 units/ }))
	const box = screen.getByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder)
	expect((box as HTMLTextAreaElement).value).toBe('Wrong fact. "Most people need 20 units."')
	expect(
		screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make }).hasAttribute('disabled'),
	).toBe(false)
})

test('an AI change saves at once and shows Saved; Undo that saves the old text back', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({
		edit: body => {
			expect(body.articleId).toBe('a1')
			expect(body.prompt).toBe('Shorter')
			expect(body.markdown).toBe(BODY)
			expect(body.links).toEqual(LINKS)
			expect(body.selection).toBeUndefined()
			return jsonResponse(200, {
				markdown: '## Botox basics\n\nShort.',
				summary: 'Shortened the article.',
			})
		},
		save: body => jsonResponse(200, { ok: true, hash: body.body === BODY ? HASH_C : HASH_B, changed: true }),
	})
	renderChanger()

	await user.click(await screen.findByRole('button', { name: 'Shorter' }))
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make }))

	await waitFor(() => expect(hiddenBody()).toBe('## Botox basics\n\nShort.'))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.saved)).toBeTruthy()
	const save = calls.find(c => c.url === '/resources/article-save')
	expect(save?.body).toEqual({
		articleId: 'a1',
		body: '## Botox basics\n\nShort.',
		baseHash: HASH_A,
		source: 'ai',
	})
	expect(screen.getByText('Changed: shortened the article.')).toBeTruthy()
	expect(
		(screen.getByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder) as HTMLTextAreaElement).value,
	).toBe('')
	// the links that must stay are now gone from the short text
	expect(screen.getByText(/Missing: Botox Knox/)).toBeTruthy()

	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.undo }))
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText('Changed: shortened the article.')).toBeNull()
	await waitFor(() => {
		const undoSave = calls.filter(c => c.url === '/resources/article-save').at(-1)
		// the undo save starts from the hash the AI save returned
		expect(undoSave?.body).toEqual({ articleId: 'a1', body: BODY, baseHash: HASH_B, source: 'ai' })
	})
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.saved)).toBeTruthy()
})

test('shows the server error and keeps the working copy', async () => {
	const user = userEvent.setup()
	mockFetch({ edit: () => jsonResponse(429, { error: 'Wait a moment and try again.' }) })
	renderChanger()
	await user.click(await screen.findByRole('button', { name: 'Shorter' }))
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make }))
	expect(await screen.findByRole('alert')).toBeTruthy()
	expect(screen.getByText('Wait a moment and try again.')).toBeTruthy()
	expect(hiddenBody()).toBe(BODY)
	// the request stays in the box so she can try again
	expect(
		(screen.getByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder) as HTMLTextAreaElement).value,
	).toBe('Shorter')
})

test('a typed change saves after the debounce and blocks leaving only until then', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	// the save stays in flight until the test lets it land
	let finishSave: (response: Response) => void = () => {}
	const saveLands = new Promise<Response>(resolve => {
		finishSave = resolve
	})
	const { calls } = mockFetch({ save: () => saveLands })
	renderChanger()
	await user.click(await screen.findByRole('tab', { name: ARTICLE_CHANGER_COPY.editTab }))
	const editor = await screen.findByLabelText('Article text')
	await user.type(editor, ' more')
	expect(hiddenBody()).toBe(`${BODY} more`)
	expect(screen.getByText(ARTICLE_CHANGER_COPY.saving)).toBeTruthy()

	// still pending: leaving is blocked, and Stay keeps her here
	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.leaveQuestion)).toBeTruthy()
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.stay }))
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.leaveQuestion)).toBeNull()

	// the debounce passes: the save is in flight, leaving is still blocked
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(calls.filter(c => c.url === '/resources/article-save')).toHaveLength(1)
	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.leaveQuestion)).toBeTruthy()

	// the save lands: the page leaves on its own
	finishSave(jsonResponse(200, { ok: true, hash: HASH_B, changed: true }))
	expect(await screen.findByText('Elsewhere')).toBeTruthy()
	const save = calls.find(c => c.url === '/resources/article-save')
	expect(save?.body).toEqual({
		articleId: 'a1',
		body: `${BODY} more`,
		baseHash: HASH_A,
		source: 'auto',
	})
	expect(calls.filter(c => c.url === '/resources/article-save')).toHaveLength(1)
	vi.useRealTimers()
})

test('a 409 shows the conflict box and Keep mine re-posts with the server hash', async () => {
	const user = userEvent.setup()
	const { calls } = mockFetch({
		edit: () =>
			jsonResponse(200, { markdown: '## Botox basics\n\nShort.', summary: 'Shortened.' }),
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
	renderChanger()
	await user.click(await screen.findByRole('button', { name: 'Shorter' }))
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make }))

	expect(await screen.findByText(ARTICLE_CHANGER_COPY.conflict)).toBeTruthy()
	// her copy is still there
	expect(hiddenBody()).toBe('## Botox basics\n\nShort.')
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.saved)).toBeNull()

	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.keepMine }))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.saved)).toBeTruthy()
	const saves = calls.filter(c => c.url === '/resources/article-save')
	expect(saves).toHaveLength(2)
	expect(saves[1]?.body).toEqual({
		articleId: 'a1',
		body: '## Botox basics\n\nShort.',
		baseHash: HASH_B,
		source: 'ai',
	})
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.conflict)).toBeNull()
})

test('a 409 keeps her copy: leaving asks first and the mirror still holds it', async () => {
	const user = userEvent.setup()
	mockFetch({
		edit: () =>
			jsonResponse(200, { markdown: '## Botox basics\n\nShort.', summary: 'Shortened.' }),
		save: () =>
			jsonResponse(409, {
				error: 'changed',
				message: 'x',
				body: '## New from the writer',
				hash: HASH_B,
			}),
	})
	renderChanger()
	await user.click(await screen.findByRole('button', { name: 'Shorter' }))
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make }))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.conflict)).toBeTruthy()

	// the mirror holds her copy while the conflict waits
	expect(window.sessionStorage.getItem('article-changer:a1')).toBe('## Botox basics\n\nShort.')

	// leaving asks first
	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.leaveQuestion)).toBeTruthy()
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.stay }))
	expect(screen.queryByText('Elsewhere')).toBeNull()
	expect(hiddenBody()).toBe('## Botox basics\n\nShort.')
	expect(window.sessionStorage.getItem('article-changer:a1')).toBe('## Botox basics\n\nShort.')
})

test('Use the new text takes the writer’s text and drops hers', async () => {
	const user = userEvent.setup()
	mockFetch({
		edit: () =>
			jsonResponse(200, { markdown: '## Botox basics\n\nShort.', summary: 'Shortened.' }),
		save: () =>
			jsonResponse(409, {
				error: 'changed',
				message: 'x',
				body: '## New from the writer',
				hash: HASH_B,
			}),
	})
	renderChanger()
	await user.click(await screen.findByRole('button', { name: 'Shorter' }))
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make }))
	await user.click(await screen.findByRole('button', { name: ARTICLE_CHANGER_COPY.useTheirs }))
	expect(hiddenBody()).toBe('## New from the writer')
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.saved)).toBeTruthy()
	expect(screen.queryByText(/^Changed: /)).toBeNull()
})

test('the edit tab is bound to the same working copy', async () => {
	const user = userEvent.setup()
	mockFetch({ save: saveOk(HASH_B) })
	renderChanger()
	await user.click(await screen.findByRole('tab', { name: ARTICLE_CHANGER_COPY.editTab }))
	const editor = await screen.findByLabelText('Article text')
	expect((editor as HTMLTextAreaElement).value).toBe(BODY)
	await user.clear(editor)
	await user.type(editor, 'My own words')
	expect(hiddenBody()).toBe('My own words')
	expect(screen.getByText(/Missing: Sarah Hitchcox Aesthetics/)).toBeTruthy()
})

test('a no-ai publisher gets only the plain editor', async () => {
	renderChanger({ isReference: true })
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.referenceNote)).toBeTruthy()
	expect(screen.queryByRole('tab', { name: ARTICLE_CHANGER_COPY.promptTab })).toBeNull()
	expect(screen.getByLabelText('Article text')).toBeTruthy()
	expect(screen.queryByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder)).toBeNull()
})

test('a decided article in readOnly has no prompt tab and no save', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
	const { fetchMock } = mockFetch({ save: saveOk(HASH_B) })
	renderChanger({ readOnly: true })
	const editor = await screen.findByLabelText('Article text')
	expect(editor.hasAttribute('readonly')).toBe(true)
	expect(screen.queryByRole('tab', { name: ARTICLE_CHANGER_COPY.promptTab })).toBeNull()
	expect(screen.queryByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder)).toBeNull()
	await user.type(editor, ' more')
	await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS + 50)
	expect(fetchMock).not.toHaveBeenCalled()
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.saving)).toBeNull()
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.saved)).toBeNull()
	vi.useRealTimers()
})

test('does not block leaving when nothing changed', async () => {
	const user = userEvent.setup()
	renderChanger()
	await user.click(await screen.findByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText('Elsewhere')).toBeTruthy()
})
