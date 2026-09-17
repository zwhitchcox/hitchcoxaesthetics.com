/**
 * @vitest-environment jsdom
 */
import { json } from '@remix-run/node'
import { createRemixStub } from '@remix-run/testing'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import {
	ASK_CARD_COPY,
	AskCard,
	type AskCardAsk,
} from '#app/components/ask-card.tsx'
import type * as DictationModule from '#app/components/dictation.tsx'

/*
 * One question card with plain props and a stub router. The dictation hook
 * is replaced: the test holds its callbacks and plays the grey words and the
 * final text into the card, as the chat tests do.
 */

const fake = vi.hoisted(() => ({
	hooks: null as null | {
		onInterim: (text: string) => void
		onFinal: (text: string) => void
	},
	dictation: {
		supported: true,
		checked: true,
		listening: false,
		phase: 'idle',
		start: () => {},
		stop: () => {},
		note: null,
	},
}))

vi.mock('#app/components/dictation.tsx', async importOriginal => {
	const actual = await importOriginal<typeof DictationModule>()
	return {
		...actual,
		useDictation: (hooks: typeof fake.hooks) => {
			fake.hooks = hooks
			return fake.dictation as DictationModule.Dictation
		},
	}
})

const ASK: AskCardAsk = {
	id: 'ask1',
	domain: 'example.com',
	ask: 'Which days are you open?',
	effort: '2min',
	about: 'They list local clinics with their hours.',
	standing: 'The listing is drafted and waits on this.',
	files: [{ name: 'notes.md', text: 'line one\nline two' }],
}

function renderCard(
	over: Partial<AskCardAsk> = {},
	props: { error?: string | null; busy?: boolean } = {},
) {
	const posted: FormData[] = []
	const RemixStub = createRemixStub([
		{
			path: '/review',
			action: async ({ request }) => {
				posted.push(await request.formData())
				return json({ ok: true })
			},
			Component: () => (
				<ul>
					<AskCard ask={{ ...ASK, ...over }} {...props} />
				</ul>
			),
		},
	])
	render(<RemixStub initialEntries={['/review']} />)
	return { posted }
}

const box = () =>
	screen.getByRole('textbox', { name: ASK_CARD_COPY.answerLabel })

test('renders the domain, the ask, the effort words and the details', async () => {
	renderCard()
	expect(screen.getByText('example.com')).toBeVisible()
	expect(screen.getByText('Which days are you open?')).toBeVisible()
	expect(screen.getByText('about 2 minutes')).toBeVisible()

	const about = screen.getByText(ASK.about!)
	expect(about).not.toBeVisible()
	await userEvent.click(screen.getByText(ASK_CARD_COPY.details))
	expect(about).toBeVisible()
	expect(screen.getByText(ASK.standing!)).toBeVisible()
	expect(screen.getByText('notes.md')).toBeVisible()
	const file = screen.getByText(/line one/)
	expect(file.tagName).toBe('PRE')
	expect(file).toHaveClass('whitespace-pre-wrap')
	expect(file).toHaveTextContent('line one line two')
})

test('no effort words for an unknown effort; no Details with nothing behind it', () => {
	renderCard({ effort: 'someday', about: null, standing: null, files: [] })
	expect(screen.queryByText(/about /)).toBeNull()
	expect(screen.queryByText(ASK_CARD_COPY.details)).toBeNull()
})

test('the box is named answer, labelled, with a grey placeholder', () => {
	renderCard()
	expect(box()).toHaveAttribute('name', 'answer')
	expect(box()).toHaveAttribute('placeholder', ASK_CARD_COPY.placeholder)
	expect(box()).toHaveClass('placeholder:text-muted-foreground')
	expect(screen.getByRole('button', { name: 'Dictate' })).toBeVisible()
	expect(screen.getByRole('button', { name: ASK_CARD_COPY.send })).toBeEnabled()
})

test('dictation: the grey words show after her text, the final text is appended', async () => {
	renderCard()
	await userEvent.type(box(), 'Yes')
	act(() => fake.hooks?.onInterim('we open'))
	const ghost = document.querySelector('[data-ghost-text]')
	expect(ghost).toHaveTextContent('we open')
	expect(document.querySelector('[data-ghost-committed]')).toHaveTextContent(
		'Yes',
	)
	act(() => fake.hooks?.onFinal('we open Tuesday to Saturday'))
	expect(box()).toHaveValue('Yes we open Tuesday to Saturday')
	expect(document.querySelector('[data-ghost-text]')).toBeNull()
})

test('Send posts intent answer with the ask id and her text', async () => {
	const { posted } = renderCard()
	await userEvent.type(box(), 'Tuesday to Saturday.')
	await userEvent.click(
		screen.getByRole('button', { name: ASK_CARD_COPY.send }),
	)
	await waitFor(() => expect(posted).toHaveLength(1))
	expect(posted[0]?.get('intent')).toBe('answer')
	expect(posted[0]?.get('askId')).toBe('ask1')
	expect(posted[0]?.get('answer')).toBe('Tuesday to Saturday.')
})

test('the refusal shows under the box; busy turns the buttons off', () => {
	renderCard({}, { error: ASK_CARD_COPY.empty, busy: true })
	expect(screen.getByRole('alert')).toHaveTextContent(ASK_CARD_COPY.empty)
	expect(
		screen.getByRole('button', { name: ASK_CARD_COPY.send }),
	).toBeDisabled()
	expect(screen.getByRole('button', { name: 'Dictate' })).toBeDisabled()
})
