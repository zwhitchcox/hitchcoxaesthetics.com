/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import {
	COMMENT_COPY,
	CommentOnThis,
	SELECTION_DEBOUNCE_MS,
	SELECTION_TTL_MS,
	foldSelection,
	useProseSelection,
} from '#app/components/comment-on-this.tsx'

/* jsdom lays nothing out; the button only needs a rect to place itself. */
beforeAll(() => {
	if (typeof Range.prototype.getBoundingClientRect !== 'function') {
		Range.prototype.getBoundingClientRect = () =>
			({
				top: 100,
				bottom: 120,
				left: 10,
				right: 200,
				width: 190,
				height: 20,
				x: 10,
				y: 100,
				toJSON() {},
			}) as DOMRect
	}
})

afterEach(() => {
	vi.useRealTimers()
	window.getSelection()?.removeAllRanges()
})

function Harness({
	active,
	onPick,
}: {
	active: boolean
	onPick: (text: string, paragraph: number | null) => void
}) {
	const ref = useRef<HTMLDivElement>(null)
	const selection = useProseSelection({ containerRef: ref, active, onPick })
	return (
		<div>
			<div ref={ref} data-testid="prose">
				<p data-paragraph="0">Most people need 20 units on each side.</p>
				<p data-paragraph="1">A second paragraph.</p>
			</div>
			<p data-testid="outside">Words outside the prose.</p>
			<div data-review-bar="">Approve · Change it</div>
			<CommentOnThis
				candidate={selection.candidate}
				bottom="bar"
				onPick={selection.pick}
				narrow={false}
			/>
		</div>
	)
}

/** Select `text` inside `node` and fire selectionchange, as a drag does. */
function select(node: Node, text: string) {
	const textNode = node.firstChild
	if (!textNode || textNode.nodeType !== Node.TEXT_NODE)
		throw new Error('no text')
	const start = (textNode.textContent ?? '').indexOf(text)
	if (start < 0) throw new Error(`"${text}" is not in the node`)
	const range = document.createRange()
	range.setStart(textNode, start)
	range.setEnd(textNode, start + text.length)
	const sel = window.getSelection()
	if (!sel) throw new Error('no selection')
	sel.removeAllRanges()
	sel.addRange(range)
	document.dispatchEvent(new Event('selectionchange'))
}

async function settle(ms = SELECTION_DEBOUNCE_MS + 20) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}

test('the button renders only while active and the selection qualifies', async () => {
	vi.useFakeTimers()
	const onPick = vi.fn()
	const { rerender } = render(<Harness active={false} onPick={onPick} />)
	const first = screen.getByText(/Most people need/)

	// not active: a good selection shows nothing
	select(first, 'need 20 units')
	await settle()
	expect(screen.queryByRole('button', { name: COMMENT_COPY.button })).toBeNull()

	// active: the same selection shows the button
	rerender(<Harness active={true} onPick={onPick} />)
	select(first, 'need 20 units')
	await settle()
	expect(screen.getByRole('button', { name: COMMENT_COPY.button })).toBeTruthy()

	// a selection outside the prose hides it
	select(screen.getByTestId('outside'), 'outside the prose')
	await settle()
	expect(screen.queryByRole('button', { name: COMMENT_COPY.button })).toBeNull()

	// a collapsed selection hides it too
	select(first, 'need 20 units')
	await settle()
	expect(screen.getByRole('button', { name: COMMENT_COPY.button })).toBeTruthy()
	window.getSelection()?.removeAllRanges()
	document.dispatchEvent(new Event('selectionchange'))
	await settle()
	expect(screen.queryByRole('button', { name: COMMENT_COPY.button })).toBeNull()
})

test('a 2-character selection shows nothing', async () => {
	vi.useFakeTimers()
	render(<Harness active={true} onPick={vi.fn()} />)
	select(screen.getByText(/Most people need/), '20')
	await settle()
	expect(screen.queryByRole('button', { name: COMMENT_COPY.button })).toBeNull()
})

test('pointerdown calls onPick with the folded text and its paragraph, and clears the selection', async () => {
	vi.useFakeTimers()
	const onPick = vi.fn()
	render(<Harness active={true} onPick={onPick} />)
	select(screen.getByText(/second paragraph/), 'second paragraph')
	await settle()
	const button = screen.getByRole('button', { name: COMMENT_COPY.button })

	fireEvent.pointerDown(button)

	expect(onPick).toHaveBeenCalledTimes(1)
	expect(onPick).toHaveBeenCalledWith('second paragraph', 1)
	expect(window.getSelection()?.isCollapsed).toBe(true)
	expect(screen.queryByRole('button', { name: COMMENT_COPY.button })).toBeNull()
})

test('the button hides after the TTL', async () => {
	vi.useFakeTimers()
	render(<Harness active={true} onPick={vi.fn()} />)
	select(screen.getByText(/Most people need/), 'need 20 units')
	await settle()
	expect(screen.getByRole('button', { name: COMMENT_COPY.button })).toBeTruthy()
	await settle(SELECTION_TTL_MS + 20)
	expect(screen.queryByRole('button', { name: COMMENT_COPY.button })).toBeNull()
})

test('foldSelection folds whitespace and trims', () => {
	expect(foldSelection('  Most  people\n\tneed 20 units.  ')).toBe(
		'Most people need 20 units.',
	)
})
