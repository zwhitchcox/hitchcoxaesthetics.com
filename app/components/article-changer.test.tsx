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
	type ArticleChangerProps,
} from '#app/components/article-changer.tsx'

const LINKS = [
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com' },
	{ name: 'Botox Knox', url: 'https://botoxknox.com' },
]
const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'

function renderChanger(overrides: Partial<ArticleChangerProps> = {}) {
	const props: ArticleChangerProps = {
		articleId: 'a1',
		initialBody: BODY,
		savedBody: BODY,
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
					<button type="submit">Save edits</button>
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

beforeEach(() => {
	window.sessionStorage.clear()
})

afterEach(() => {
	vi.unstubAllGlobals()
})

test('starts on the prompt tab with the working copy in a hidden input', async () => {
	renderChanger()
	expect(await screen.findByRole('tab', { name: ARTICLE_CHANGER_COPY.promptTab })).toBeTruthy()
	expect(screen.getByRole('tab', { name: ARTICLE_CHANGER_COPY.editTab })).toBeTruthy()
	expect(screen.getByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder)).toBeTruthy()
	const make = screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make })
	expect(make.hasAttribute('disabled')).toBe(true)
	// jsdom has no speech API, so the mic button stays hidden
	expect(screen.queryByRole('button', { name: ARTICLE_CHANGER_COPY.dictate })).toBeNull()
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.unsaved)).toBeNull()
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

test('Make these changes replaces the working copy and Undo that puts it back', async () => {
	const user = userEvent.setup()
	const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
		const sent = JSON.parse(String(init?.body)) as Record<string, unknown>
		expect(sent.articleId).toBe('a1')
		expect(sent.prompt).toBe('Shorter')
		expect(sent.markdown).toBe(BODY)
		expect(sent.links).toEqual(LINKS)
		return new Response(
			JSON.stringify({ markdown: '## Botox basics\n\nShort.', summary: 'Shortened the article.' }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } },
		)
	})
	vi.stubGlobal('fetch', fetchMock)
	renderChanger()

	await user.click(await screen.findByRole('button', { name: 'Shorter' }))
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.make }))

	await waitFor(() => expect(hiddenBody()).toBe('## Botox basics\n\nShort.'))
	expect(fetchMock).toHaveBeenCalledTimes(1)
	expect(fetchMock.mock.calls[0]?.[0]).toBe('/resources/article-edit')
	expect(screen.getByText('Changed: shortened the article.')).toBeTruthy()
	expect(
		(screen.getByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder) as HTMLTextAreaElement).value,
	).toBe('')
	expect(screen.getByText(ARTICLE_CHANGER_COPY.unsaved)).toBeTruthy()
	// the links that must stay are now gone from the short text
	expect(screen.getByText(/Missing: Botox Knox/)).toBeTruthy()

	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.undo }))
	expect(hiddenBody()).toBe(BODY)
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.unsaved)).toBeNull()
	expect(screen.queryByText('Changed: shortened the article.')).toBeNull()
})

test('shows the server error and keeps the working copy', async () => {
	const user = userEvent.setup()
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(JSON.stringify({ error: 'Wait a moment and try again.' }), {
					status: 429,
					headers: { 'Content-Type': 'application/json' },
				}),
		),
	)
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

test('the edit tab is bound to the same working copy', async () => {
	const user = userEvent.setup()
	renderChanger()
	await user.click(await screen.findByRole('tab', { name: ARTICLE_CHANGER_COPY.editTab }))
	const editor = await screen.findByLabelText('Article text')
	expect((editor as HTMLTextAreaElement).value).toBe(BODY)
	await user.clear(editor)
	await user.type(editor, 'My own words')
	expect(hiddenBody()).toBe('My own words')
	expect(screen.getByText(ARTICLE_CHANGER_COPY.unsaved)).toBeTruthy()
	expect(screen.getByText(/Missing: Sarah Hitchcox Aesthetics/)).toBeTruthy()
})

test('a no-ai publisher gets only the plain editor', async () => {
	renderChanger({ isReference: true })
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.referenceNote)).toBeTruthy()
	expect(screen.queryByRole('tab', { name: ARTICLE_CHANGER_COPY.promptTab })).toBeNull()
	expect(screen.getByLabelText('Article text')).toBeTruthy()
	expect(screen.queryByPlaceholderText(ARTICLE_CHANGER_COPY.placeholder)).toBeNull()
})

test('blocks in-app navigation while there are unsaved changes', async () => {
	const user = userEvent.setup()
	renderChanger()
	// clean: leaving is not blocked
	await user.click(await screen.findByRole('tab', { name: ARTICLE_CHANGER_COPY.editTab }))
	const editor = await screen.findByLabelText('Article text')
	await user.type(editor, ' more')
	expect(screen.getByText(ARTICLE_CHANGER_COPY.unsaved)).toBeTruthy()

	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.leaveQuestion)).toBeTruthy()
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.stay }))
	expect(screen.queryByText(ARTICLE_CHANGER_COPY.leaveQuestion)).toBeNull()
	expect(screen.getByLabelText('Article text')).toBeTruthy()

	await user.click(screen.getByRole('link', { name: 'Leave this page' }))
	await user.click(await screen.findByRole('button', { name: ARTICLE_CHANGER_COPY.leave }))
	expect(await screen.findByText('Elsewhere')).toBeTruthy()
})

test('does not block leaving when nothing changed', async () => {
	const user = userEvent.setup()
	renderChanger()
	await user.click(await screen.findByRole('link', { name: 'Leave this page' }))
	expect(await screen.findByText('Elsewhere')).toBeTruthy()
})
