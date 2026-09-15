/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { ARTICLE_CHANGER_COPY } from '#app/components/article-changer.tsx'
import {
	PassageFix,
	type PassageApplied,
	type PassageFixProps,
	type PassageRequest,
} from '#app/components/passage-fix.tsx'

const LINKS = [{ name: 'Botox Knox', url: 'https://botoxknox.com' }]
const BODY =
	'## Botox basics\n\nMost people need 20 units.\n\nResults last three months.'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function jsonResponse(status: number, data: unknown) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

type Call = { url: string; body: Record<string, unknown> }

function mockFetch(handlers: {
	edit?: (body: Record<string, unknown>) => Response
	save?: (body: Record<string, unknown>) => Response
}) {
	const calls: Call[] = []
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>
			calls.push({ url, body })
			if (url === '/resources/article-edit' && handlers.edit) return handlers.edit(body)
			if (url === '/resources/article-save' && handlers.save) return handlers.save(body)
			return jsonResponse(500, { error: 'unexpected' })
		}),
	)
	return calls
}

/** A prose container with two paragraphs and the fix around it. */
function Harness({
	request = null,
	active = true,
	disabled = false,
	onApplied = () => {},
}: Partial<Pick<PassageFixProps, 'request' | 'active' | 'disabled' | 'onApplied'>>) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [body] = useState(BODY)
	return (
		<>
			<div ref={containerRef}>
				<p data-paragraph="1">Most people need 20 units.</p>
				<p data-paragraph="2">Results last three months.</p>
			</div>
			<p>Outside the prose.</p>
			<PassageFix
				articleId="a1"
				body={body}
				savedHash={HASH_A}
				links={LINKS}
				containerRef={containerRef}
				active={active}
				disabled={disabled}
				request={request}
				onApplied={onApplied}
			/>
		</>
	)
}

const claimRequest = (nonce: number): PassageRequest => ({
	text: 'Most people need 20 units.',
	paragraph: 1,
	index: 0,
	source: 'panel',
	nonce,
})

/** Select the text of one element and fire selectionchange. */
async function selectText(el: Element) {
	const range = document.createRange()
	range.selectNodeContents(el)
	const sel = window.getSelection()
	sel?.removeAllRanges()
	sel?.addRange(range)
	document.dispatchEvent(new Event('selectionchange'))
	await new Promise(resolve => setTimeout(resolve, 300))
}

beforeAll(() => {
	// jsdom ranges have no layout
	Range.prototype.getBoundingClientRect = () =>
		({ top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20, x: 10, y: 100, toJSON: () => ({}) }) as DOMRect
})

afterEach(() => {
	vi.unstubAllGlobals()
	window.getSelection()?.removeAllRanges()
})

test('a request prop opens the sheet with the passage and Make this change waits for words', async () => {
	render(<Harness request={claimRequest(1)} />)
	const sheet = await screen.findByRole('dialog', { name: ARTICLE_CHANGER_COPY.whatsWrong })
	expect(sheet.textContent).toContain('Most people need 20 units.')
	const make = screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.makeChange })
	expect(make.hasAttribute('disabled')).toBe(true)
	// from the panel: the way back to the sentence is offered
	expect(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.showWhere })).toBeTruthy()
	// jsdom has no speech API
	expect(screen.queryByRole('button', { name: ARTICLE_CHANGER_COPY.dictate })).toBeNull()
})

test('a change is applied, saved at once, and reported with the diff', async () => {
	const user = userEvent.setup()
	const applied: PassageApplied[] = []
	const calls = mockFetch({
		edit: body => {
			expect(body.markdown).toBe(BODY)
			expect(body.links).toEqual(LINKS)
			expect(body.selection).toEqual({
				text: 'Most people need 20 units.',
				paragraph: 1,
				markdown: 'Most people need 20 units.',
			})
			return jsonResponse(200, {
				markdown: '## Botox basics\n\nMost people need 2 to 4 units.\n\nResults last three months.',
				summary: 'Changed the dose.',
			})
		},
		save: body => {
			expect(body.baseHash).toBe(HASH_A)
			expect(body.source).toBe('ai')
			return jsonResponse(200, { ok: true, hash: HASH_B, changed: true })
		},
	})
	render(<Harness request={claimRequest(1)} onApplied={a => applied.push(a)} />)
	await screen.findByRole('dialog', { name: ARTICLE_CHANGER_COPY.whatsWrong })
	await user.click(screen.getByRole('button', { name: 'Wrong fact' }))
	await user.type(screen.getByLabelText('What should change here'), ' say 2 to 4')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.makeChange }))

	await waitFor(() => expect(applied).toHaveLength(1))
	expect(calls.map(c => c.url)).toEqual([
		'/resources/article-edit',
		'/resources/article-save',
	])
	expect(calls[0]?.body.prompt).toBe('Wrong fact say 2 to 4')
	expect(applied[0]?.savedHash).toBe(HASH_B)
	expect(applied[0]?.summary).toBe('Changed the dose.')
	expect(applied[0]?.body).toContain('2 to 4 units')
	const changed = applied[0]?.changed
	expect(changed).not.toBeNull()
	expect(applied[0]?.body.slice(changed!.start, changed!.end)).toBe(' to 4')
	expect(screen.queryByRole('dialog')).toBeNull()
})

test('a 409 shows the conflict box; Keep mine re-posts with the server hash', async () => {
	const user = userEvent.setup()
	const applied: PassageApplied[] = []
	const calls = mockFetch({
		edit: () => jsonResponse(200, { markdown: 'AI text', summary: 'Changed it.' }),
		save: body =>
			body.baseHash === HASH_A
				? jsonResponse(409, {
						error: 'changed',
						message: 'x',
						body: 'Writer text',
						hash: HASH_B,
					})
				: jsonResponse(200, { ok: true, hash: 'c'.repeat(64), changed: true }),
	})
	render(<Harness request={claimRequest(1)} onApplied={a => applied.push(a)} />)
	await screen.findByRole('dialog')
	await user.type(screen.getByLabelText('What should change here'), 'fix')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.makeChange }))

	expect(await screen.findByText(ARTICLE_CHANGER_COPY.conflict)).toBeTruthy()
	expect(applied).toHaveLength(0)
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.keepMine }))
	await waitFor(() => expect(applied).toHaveLength(1))
	expect(calls.filter(c => c.url === '/resources/article-save')[1]?.body).toEqual({
		articleId: 'a1',
		body: 'AI text',
		baseHash: HASH_B,
		source: 'ai',
	})
	expect(applied[0]?.body).toBe('AI text')
	expect(applied[0]?.savedHash).toBe('c'.repeat(64))
})

test('Use the new text hands back the writer’s text with no summary', async () => {
	const user = userEvent.setup()
	const applied: PassageApplied[] = []
	mockFetch({
		edit: () => jsonResponse(200, { markdown: 'AI text', summary: 'Changed it.' }),
		save: () =>
			jsonResponse(409, { error: 'changed', message: 'x', body: 'Writer text', hash: HASH_B }),
	})
	render(<Harness request={claimRequest(1)} onApplied={a => applied.push(a)} />)
	await screen.findByRole('dialog')
	await user.type(screen.getByLabelText('What should change here'), 'fix')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.makeChange }))
	await user.click(await screen.findByRole('button', { name: ARTICLE_CHANGER_COPY.useTheirs }))
	expect(applied).toEqual([
		{ body: 'Writer text', savedHash: HASH_B, summary: null, changed: null },
	])
	expect(screen.queryByRole('dialog')).toBeNull()
})

test('a 409 decided and a server error show in the sheet and keep her words', async () => {
	const user = userEvent.setup()
	mockFetch({
		edit: () => jsonResponse(200, { markdown: 'AI text', summary: 'Changed it.' }),
		save: () => jsonResponse(409, { error: 'decided', message: 'x' }),
	})
	render(<Harness request={claimRequest(1)} />)
	await screen.findByRole('dialog')
	await user.type(screen.getByLabelText('What should change here'), 'fix')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.makeChange }))
	expect(await screen.findByText(ARTICLE_CHANGER_COPY.decided)).toBeTruthy()
	expect((screen.getByLabelText('What should change here') as HTMLTextAreaElement).value).toBe(
		'fix',
	)
	expect(screen.getByRole('dialog')).toBeTruthy()
})

test('the button shows for a selection inside the prose, and only while active and enabled', async () => {
	render(<Harness />)
	const paragraph = screen.getByText('Results last three months.')
	await selectText(paragraph)
	const button = await screen.findByRole('button', { name: ARTICLE_CHANGER_COPY.changeThis })
	expect(button).toBeTruthy()

	// a selection outside the prose hides it
	await selectText(screen.getByText('Outside the prose.'))
	await waitFor(() =>
		expect(screen.queryByRole('button', { name: ARTICLE_CHANGER_COPY.changeThis })).toBeNull(),
	)
})

test('no button while disabled or not active', async () => {
	const { rerender } = render(<Harness disabled />)
	await selectText(screen.getByText('Results last three months.'))
	expect(screen.queryByRole('button', { name: ARTICLE_CHANGER_COPY.changeThis })).toBeNull()
	rerender(<Harness active={false} />)
	await selectText(screen.getByText('Results last three months.'))
	expect(screen.queryByRole('button', { name: ARTICLE_CHANGER_COPY.changeThis })).toBeNull()
})

test('the button opens the sheet with the selected words and their paragraph', async () => {
	const user = userEvent.setup()
	const calls = mockFetch({
		edit: () => jsonResponse(200, { markdown: BODY, summary: 'Nothing.' }),
		save: () => jsonResponse(200, { ok: true, hash: HASH_B, changed: false }),
	})
	render(<Harness />)
	await selectText(screen.getByText('Results last three months.'))
	const button = await screen.findByRole('button', { name: ARTICLE_CHANGER_COPY.changeThis })
	await user.pointer({ keys: '[MouseLeft>]', target: button })
	const sheet = await screen.findByRole('dialog', { name: ARTICLE_CHANGER_COPY.whatsWrong })
	expect(sheet.textContent).toContain('Results last three months.')
	// from the prose: no "Show me where it is"
	expect(screen.queryByRole('button', { name: ARTICLE_CHANGER_COPY.showWhere })).toBeNull()
	await user.type(screen.getByLabelText('What should change here'), 'say four')
	await user.click(screen.getByRole('button', { name: ARTICLE_CHANGER_COPY.makeChange }))
	await waitFor(() => expect(calls).toHaveLength(2))
	expect(calls[0]?.body.selection).toEqual({
		text: 'Results last three months.',
		paragraph: 2,
		markdown: 'Results last three months.',
	})
})
