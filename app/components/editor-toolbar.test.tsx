/**
 * @vitest-environment jsdom
 */
import '#tests/setup/prosemirror-jsdom.ts'
import {
	act,
	createEvent,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react'
import { type Node } from 'prosemirror-model'
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { useReducer, useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import {
	BubbleMenu,
	FORMAT_ACTIONS,
	FormatRow,
	TOOLBAR_COPY,
} from '#app/components/editor-toolbar.tsx'
import { readSelection } from '#app/components/rich-editor.tsx'
import {
	type EditorCommand,
	articleSchema,
	docText,
	parseArticle,
	runCommand,
	serializeArticle,
} from '#app/utils/article-markdown.ts'

const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const PICTURE_BODY =
	'![a](images/image-1.png)\n*cap*\n\nMost people need 20 units.'

/** The document positions of `needle` in the document text, [from, to). */
function rangeOf(doc: Node, needle: string): { from: number; to: number } {
	const dt = docText(doc)
	const at = dt.text.indexOf(needle)
	if (at < 0) throw new Error(`${needle} is not in the document`)
	return {
		from: dt.positions[at]!,
		to: dt.positions[at + needle.length - 1]! + 1,
	}
}

function rect(top: number, bottom: number, left: number) {
	return { top, bottom, left, right: left }
}

function box(top: number, left: number, width: number, height: number) {
	return () =>
		({
			top,
			left,
			width,
			height,
			bottom: top + height,
			right: left + width,
			x: left,
			y: top,
			toJSON() {},
		}) as DOMRect
}

let views: EditorView[] = []

/** A bare view; the toolbar needs only the document, the commands and the marks. */
function makeView(body = BODY) {
	const mount = document.body.appendChild(document.createElement('div'))
	const view = new EditorView(mount, {
		state: EditorState.create({ doc: parseArticle(body) }),
	})
	views.push(view)
	return view
}

afterEach(() => {
	for (const view of views) {
		view.destroy()
		view.dom.parentElement?.remove()
	}
	views = []
})

/**
 * The parent's part: the selection read from the view after every change,
 * the command run on the view, and the link row's open state.
 */
function Harness({
	view,
	kind,
	comment,
	locked,
	minTop,
	onRefresh,
}: {
	view: EditorView
	kind: 'row' | 'bubble'
	comment: ((quote: string) => void) | null
	locked?: boolean
	minTop?: number
	onRefresh: (refresh: () => void) => void
}) {
	const [, bump] = useReducer((n: number) => n + 1, 0)
	const [linkOpen, setLinkOpen] = useState(false)
	const [wrapper, setWrapper] = useState<HTMLElement | null>(null)
	onRefresh(bump)
	const shared = {
		selection: readSelection(view.state),
		onCommand: (command: EditorCommand) => {
			runCommand(command, view)
			bump()
		},
		onLink: () => setLinkOpen(true),
		comment,
		linkOpen,
		onLinkDone: () => setLinkOpen(false),
		view,
		locked,
	}
	if (kind === 'row') return <FormatRow {...shared} />
	return (
		<div ref={setWrapper} data-testid="wrapper" className="relative">
			<BubbleMenu {...shared} wrapper={wrapper} minTop={minTop} />
		</div>
	)
}

function mount(
	kind: 'row' | 'bubble',
	options: {
		view?: EditorView
		comment?: ((quote: string) => void) | null
		locked?: boolean
		minTop?: number
	} = {},
) {
	const view = options.view ?? makeView()
	let refresh = () => {}
	render(
		<Harness
			view={view}
			kind={kind}
			comment={options.comment ?? null}
			locked={options.locked}
			minTop={options.minTop}
			onRefresh={fn => {
				refresh = fn
			}}
		/>,
	)
	const select = (from: number, to = from) => {
		view.dispatch(
			view.state.tr.setSelection(
				TextSelection.create(view.state.doc, from, to),
			),
		)
		act(() => refresh())
	}
	const selectText = (needle: string) => {
		const range = rangeOf(view.state.doc, needle)
		select(range.from, range.to)
	}
	return {
		view,
		select,
		selectText,
		refresh: () => act(() => refresh()),
		markdown: () => serializeArticle(view.state.doc),
	}
}

const button = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => fireEvent.pointerDown(button(name))
const toolbar = () =>
	screen.queryByRole('toolbar', { name: TOOLBAR_COPY.toolbar })
const wrapper = () => screen.getByTestId('wrapper')

test('Bold toggles strong and reads pressed', () => {
	const editor = mount('row')
	editor.selectText('20 units')
	expect(button(TOOLBAR_COPY.bold)).toHaveAttribute('aria-pressed', 'false')
	press(TOOLBAR_COPY.bold)
	expect(editor.markdown()).toContain('**20 units**')
	expect(button(TOOLBAR_COPY.bold)).toHaveAttribute('aria-pressed', 'true')
	press(TOOLBAR_COPY.bold)
	expect(editor.markdown()).toBe(BODY)
	expect(button(TOOLBAR_COPY.bold)).toHaveAttribute('aria-pressed', 'false')
})

test('Italic toggles em', () => {
	const editor = mount('row')
	editor.selectText('20 units')
	press(TOOLBAR_COPY.italic)
	expect(editor.markdown()).toContain('*20 units*')
	expect(button(TOOLBAR_COPY.italic)).toHaveAttribute('aria-pressed', 'true')
	press(TOOLBAR_COPY.italic)
	expect(editor.markdown()).toBe(BODY)
})

test('Heading turns a paragraph into ## and back', () => {
	const editor = mount('row')
	editor.select(rangeOf(editor.view.state.doc, 'Most').from + 2)
	expect(button(TOOLBAR_COPY.heading)).toHaveAttribute('aria-pressed', 'false')
	press(TOOLBAR_COPY.heading)
	expect(editor.markdown().split('\n\n')[1]).toMatch(/^## Most people/)
	expect(button(TOOLBAR_COPY.heading)).toHaveAttribute('aria-pressed', 'true')
	press(TOOLBAR_COPY.heading)
	expect(editor.markdown()).toBe(BODY)
	expect(button(TOOLBAR_COPY.heading)).toHaveAttribute('aria-pressed', 'false')
})

test('Small heading turns a paragraph into ###', () => {
	const editor = mount('row')
	editor.select(rangeOf(editor.view.state.doc, 'Most').from + 2)
	press(TOOLBAR_COPY.smallHeading)
	expect(editor.markdown().split('\n\n')[1]).toMatch(/^### Most people/)
	expect(button(TOOLBAR_COPY.smallHeading)).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	expect(button(TOOLBAR_COPY.heading)).toHaveAttribute('aria-pressed', 'false')
	press(TOOLBAR_COPY.smallHeading)
	expect(editor.markdown()).toBe(BODY)
})

test('Bullet list wraps and lifts, and the list is tight', () => {
	const editor = mount('row')
	editor.select(rangeOf(editor.view.state.doc, 'Most').from + 2)
	press(TOOLBAR_COPY.bullets)
	const second = editor.markdown().split('\n\n')[1]!
	expect(second).toMatch(/^- Most people need 20 units\./)
	expect(second).not.toContain('\n')
	expect(button(TOOLBAR_COPY.bullets)).toHaveAttribute('aria-pressed', 'true')
	press(TOOLBAR_COPY.bullets)
	expect(editor.markdown()).toBe(BODY)
	expect(button(TOOLBAR_COPY.bullets)).toHaveAttribute('aria-pressed', 'false')
})

test('the link row adds, refuses a bad address, and removes', () => {
	const editor = mount('row')
	const address = () => screen.getByLabelText(TOOLBAR_COPY.linkLabel)

	editor.selectText('our site')
	expect(button(TOOLBAR_COPY.link)).toHaveAttribute('aria-pressed', 'true')
	press(TOOLBAR_COPY.link)
	expect(toolbar()).toBeNull()
	expect(address()).toHaveValue('https://hitchcoxaesthetics.com')
	expect(document.activeElement).toBe(address())
	fireEvent.change(address(), {
		target: { value: 'hitchcoxaesthetics.com/about' },
	})
	fireEvent.click(button(TOOLBAR_COPY.addLink))
	expect(editor.markdown()).toContain(
		'[our site](https://hitchcoxaesthetics.com/about)',
	)
	expect(toolbar()).not.toBeNull()
	editor.refresh()

	press(TOOLBAR_COPY.link)
	fireEvent.change(address(), { target: { value: 'javascript:alert(1)' } })
	fireEvent.click(button(TOOLBAR_COPY.addLink))
	expect(screen.getByRole('alert')).toHaveTextContent(TOOLBAR_COPY.badLink)
	expect(address()).toHaveAttribute('aria-invalid', 'true')
	expect(editor.markdown()).toContain(
		'[our site](https://hitchcoxaesthetics.com/about)',
	)
	fireEvent.click(button(TOOLBAR_COPY.cancel))
	expect(toolbar()).not.toBeNull()

	editor.select(rangeOf(editor.view.state.doc, 'our site').from + 3)
	expect(button(TOOLBAR_COPY.link)).toBeEnabled()
	press(TOOLBAR_COPY.link)
	fireEvent.click(button(TOOLBAR_COPY.removeLink))
	expect(editor.markdown()).toBe(
		BODY.replace('[our site](https://hitchcoxaesthetics.com)', 'our site'),
	)
	editor.refresh()

	editor.selectText('20 units')
	press(TOOLBAR_COPY.link)
	expect(
		screen.queryByRole('button', { name: TOOLBAR_COPY.removeLink }),
	).toBeNull()
	fireEvent.change(address(), { target: { value: 'x.y' } })
	fireEvent.keyDown(address(), { key: 'Enter' })
	expect(editor.markdown()).toContain('[20 units](https://x.y/)')
	editor.refresh()

	editor.selectText('Most')
	press(TOOLBAR_COPY.link)
	fireEvent.change(address(), { target: { value: 'x.y' } })
	fireEvent.keyDown(address(), { key: 'Escape' })
	expect(toolbar()).not.toBeNull()
	expect(editor.markdown()).not.toContain('[Most]')

	editor.select(rangeOf(editor.view.state.doc, 'Most').from)
	expect(button(TOOLBAR_COPY.link)).toBeDisabled()
})

test('pointerdown on every button prevents the default', () => {
	const editor = mount('row', { comment: vi.fn() })
	editor.selectText('20 units')
	expect(within(toolbar()!).getAllByRole('button').length).toBe(
		FORMAT_ACTIONS.length + 2,
	)
	// Link last: it swaps the row for the link row.
	const names = [
		...FORMAT_ACTIONS.map(action => action.label),
		TOOLBAR_COPY.comment,
		TOOLBAR_COPY.link,
	]
	for (const name of names) {
		const el = button(name)
		const event = createEvent.pointerDown(el)
		fireEvent(el, event)
		expect(event.defaultPrevented, name).toBe(true)
	}
	expect(screen.getByLabelText(TOOLBAR_COPY.linkLabel)).toBeInTheDocument()
})

test('Comment on this is disabled without a quote and calls comment on pointerdown with one', () => {
	const comment = vi.fn()
	const editor = mount('row', { comment })
	expect(button(TOOLBAR_COPY.comment)).toBeDisabled()
	press(TOOLBAR_COPY.comment)
	expect(comment).not.toHaveBeenCalled()
	editor.selectText('20 units')
	expect(button(TOOLBAR_COPY.comment)).toBeEnabled()
	press(TOOLBAR_COPY.comment)
	expect(comment).toHaveBeenCalledTimes(1)
	expect(comment).toHaveBeenCalledWith('20 units')
})

test('an own-words row has no Comment button', () => {
	const editor = mount('row', { comment: null })
	editor.selectText('20 units')
	expect(
		screen.queryByRole('button', { name: TOOLBAR_COPY.comment }),
	).toBeNull()
	expect(within(toolbar()!).getAllByRole('button').length).toBe(
		FORMAT_ACTIONS.length + 1,
	)
})

test('the bubble is hidden with an empty selection and placed above the selection with one', () => {
	const view = makeView()
	const rects: Record<number, ReturnType<typeof rect>> = {}
	view.coordsAtPos = (pos: number) => rects[pos] ?? rect(0, 0, 0)
	view.hasFocus = () => true
	const editor = mount('bubble', { view, comment: vi.fn() })
	wrapper().getBoundingClientRect = box(100, 50, 600, 800)
	editor.refresh()
	expect(toolbar()).toBeNull()

	const units = rangeOf(view.state.doc, '20 units')
	rects[units.from] = rect(200, 220, 100)
	rects[units.to] = rect(200, 220, 300)
	editor.select(units.from, units.to)
	const bubble = toolbar()!
	expect(bubble.parentElement).toBe(wrapper())
	expect(bubble.style.top).toBe('56px')
	expect(bubble.style.left).toBe('150px')
	expect(within(bubble).getAllByRole('button').length).toBe(
		FORMAT_ACTIONS.length + 2,
	)

	// above the selection would leave the wrapper's top: below it instead
	rects[units.from] = rect(120, 140, 100)
	rects[units.to] = rect(120, 140, 300)
	editor.select(units.from, units.to)
	expect(toolbar()!.style.top).toBe('48px')

	// the bubble stays inside the wrapper's width
	rects[units.from] = rect(200, 220, 700)
	rects[units.to] = rect(200, 220, 720)
	editor.select(units.from, units.to)
	expect(toolbar()!.style.left).toBe('600px')
	rects[units.from] = rect(200, 220, 10)
	rects[units.to] = rect(200, 220, 20)
	editor.select(units.from, units.to)
	expect(toolbar()!.style.left).toBe('0px')

	editor.select(units.from)
	expect(toolbar()).toBeNull()
})

test('the bubble hides while the editor has no focus and on a selected picture', () => {
	const view = makeView(PICTURE_BODY)
	view.coordsAtPos = () => rect(200, 220, 100)
	let focused = true
	view.hasFocus = () => focused
	const editor = mount('bubble', { view })
	wrapper().getBoundingClientRect = box(0, 0, 600, 800)
	editor.selectText('20 units')
	expect(toolbar()).not.toBeNull()

	focused = false
	editor.refresh()
	expect(toolbar()).toBeNull()

	focused = true
	view.dispatch(
		view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1)),
	)
	editor.refresh()
	expect(view.state.selection).toBeInstanceOf(NodeSelection)
	expect(toolbar()).toBeNull()
})

test('the row and the bubble hide while locked', () => {
	const row = mount('row', { locked: true })
	row.selectText('20 units')
	expect(toolbar()).toBeNull()

	const view = makeView()
	view.coordsAtPos = () => rect(200, 220, 100)
	view.hasFocus = () => true
	const bubble = mount('bubble', { view, locked: true })
	wrapper().getBoundingClientRect = box(0, 0, 600, 800)
	bubble.selectText('20 units')
	expect(toolbar()).toBeNull()

	const readOnly = makeView()
	readOnly.setProps({ editable: () => false })
	const derived = mount('row', { view: readOnly })
	derived.selectText('20 units')
	expect(toolbar()).toBeNull()
	readOnly.setProps({ editable: () => true })
	derived.refresh()
	expect(toolbar()).not.toBeNull()
})

test('the phone row is a plain wrapping row with no band: 44 px buttons, letters for the headings, a short Comment', () => {
	const editor = mount('row', { comment: vi.fn() })
	editor.selectText('20 units')
	const row = toolbar()!
	expect(row.className).toBe('flex flex-wrap items-center gap-0.5 px-1 pt-1')
	expect(row.className).not.toMatch(/border|bg-|overflow/)
	for (const el of within(row).getAllByRole('button')) {
		expect(el.className, el.getAttribute('aria-label') ?? '').toContain('h-11')
		expect(el.className, el.getAttribute('aria-label') ?? '').toContain(
			'min-w-10',
		)
	}
	const heading = button(TOOLBAR_COPY.heading)
	expect(heading.querySelector('svg')).toBeNull()
	expect(heading.textContent).toBe('H2')
	expect(button(TOOLBAR_COPY.smallHeading).textContent).toBe('H3')
	const comment = button(TOOLBAR_COPY.comment)
	expect(comment).toHaveAttribute('aria-label', TOOLBAR_COPY.comment)
	expect(comment.textContent).toBe(TOOLBAR_COPY.commentShort)
	expect(comment.querySelector('svg')).toBeNull()
})

test('the bubble goes below the selection when above would sit under the sticky bars', () => {
	const view = makeView()
	const rects: Record<number, ReturnType<typeof rect>> = {}
	view.coordsAtPos = (pos: number) => rects[pos] ?? rect(0, 0, 0)
	view.hasFocus = () => true
	const editor = mount('bubble', { view, comment: vi.fn(), minTop: 100 })
	wrapper().getBoundingClientRect = box(0, 0, 600, 800)
	const units = rangeOf(view.state.doc, '20 units')
	// above would be at 86 px, under the bars: below the selection instead
	rects[units.from] = rect(130, 150, 100)
	rects[units.to] = rect(130, 150, 300)
	editor.select(units.from, units.to)
	expect(toolbar()!.style.top).toBe('158px')
	// clear of the bars: above, as usual
	rects[units.from] = rect(200, 220, 100)
	rects[units.to] = rect(200, 220, 300)
	editor.select(units.from, units.to)
	expect(toolbar()!.style.top).toBe('156px')
})

test('the link row stores the parsed address, so a space or a paren never breaks the markdown link', () => {
	const editor = mount('row')
	const address = () => screen.getByLabelText(TOOLBAR_COPY.linkLabel)
	const hrefs = (markdown: string) => {
		const out: string[] = []
		parseArticle(markdown).descendants(node => {
			const mark = articleSchema.marks.link!.isInSet(node.marks)
			if (mark) out.push(String(mark.attrs.href))
		})
		return out
	}

	editor.selectText('20 units')
	press(TOOLBAR_COPY.link)
	fireEvent.change(address(), { target: { value: 'example.com/my page' } })
	fireEvent.click(button(TOOLBAR_COPY.addLink))
	expect(editor.markdown()).toContain(
		'[20 units](https://example.com/my%20page)',
	)
	expect(hrefs(editor.markdown())).toContain('https://example.com/my%20page')
	expect(serializeArticle(parseArticle(editor.markdown()))).toBe(
		editor.markdown(),
	)
	editor.refresh()

	editor.selectText('Most')
	press(TOOLBAR_COPY.link)
	fireEvent.change(address(), {
		target: { value: 'en.wikipedia.org/wiki/Botox_(drug)' },
	})
	fireEvent.click(button(TOOLBAR_COPY.addLink))
	expect(editor.markdown()).toContain(
		'[Most](https://en.wikipedia.org/wiki/Botox_%28drug%29)',
	)
	expect(hrefs(editor.markdown())).toContain(
		'https://en.wikipedia.org/wiki/Botox_%28drug%29',
	)
	editor.refresh()

	// a mailto keeps a space, which would end the link early: refused
	editor.selectText('people')
	press(TOOLBAR_COPY.link)
	fireEvent.change(address(), { target: { value: 'mailto:sarah h@x.y' } })
	fireEvent.click(button(TOOLBAR_COPY.addLink))
	expect(screen.getByRole('alert')).toHaveTextContent(TOOLBAR_COPY.badLink)
	expect(editor.markdown()).not.toContain('mailto:')
})

test('the link row works on the words as they are when Add runs, after the text moved', () => {
	const editor = mount('row')
	editor.selectText('20 units')
	press(TOOLBAR_COPY.link)
	// the writer's text lands while the row is open: the selection moves with it
	editor.view.dispatch(
		editor.view.state.tr.insertText(
			'About ',
			rangeOf(editor.view.state.doc, 'Most').from,
		),
	)
	fireEvent.change(screen.getByLabelText(TOOLBAR_COPY.linkLabel), {
		target: { value: 'x.y' },
	})
	fireEvent.click(button(TOOLBAR_COPY.addLink))
	expect(editor.markdown()).toContain(
		'About Most people need [20 units](https://x.y/)',
	)
})
