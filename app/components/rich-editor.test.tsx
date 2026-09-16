/**
 * @vitest-environment jsdom
 */
import '#tests/setup/prosemirror-jsdom.ts'
import { createRemixStub } from '@remix-run/testing'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { undo } from 'prosemirror-history'
import { type Node } from 'prosemirror-model'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import { type EditorView } from 'prosemirror-view'
import { useReducer } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import {
	RICH_EDITOR_COPY,
	RichEditor,
	type EditorSelection,
	type RichEditorProps,
} from '#app/components/rich-editor.tsx'
import { pictureLines } from '#app/utils/article-edit.ts'
import { docText, serializeArticle } from '#app/utils/article-markdown.ts'
import fixture from '#tests/fixtures/article-bodies.json'

/*
 * The view in jsdom: no layout, so the tests never type into the
 * contenteditable; they dispatch through `editorViewRef` and read the DOM
 * the view draws. The typed path is proved in Chromium by the e2e.
 */

const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const BODY_CHANGED =
	'## Botox basics\n\nMost people need 15 to 25 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const CLAIM = 'See our site and Botox Knox.'
const PICTURE_BODY =
	'## Pictures\n\n![a test picture](images/image-1.png)\n*The clinic room.*\n\nAfter the picture.'
const USER_PICTURE_BODY =
	'![a test picture](images/user-x.png)\n*The clinic room.*'
const FIVE = 'One.\n\nTwo.\n\nThree.\n\nFour.\n\nFive.'
const IMAGE_ROW = {
	id: 'im1',
	fileName: 'image-1.png',
	position: 0,
	width: 1,
	height: 1,
}
const PNG = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', {
	type: 'image/png',
})

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

function select(view: EditorView, from: number, to = from) {
	view.dispatch(
		view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)),
	)
}

/** The position just inside the end of the last block. */
function endOf(view: EditorView) {
	return view.state.doc.content.size - 1
}

function mount(overrides: Partial<RichEditorProps> = {}) {
	const viewRef: React.MutableRefObject<EditorView | null> = { current: null }
	const handlers = {
		onChange: vi.fn<[string], void>(),
		onBlur: vi.fn(),
		onFocusChange: vi.fn<[boolean], void>(),
		onSelection: vi.fn<[EditorSelection], void>(),
		onImageFile: vi.fn<[File], void>(),
		onLinkShortcut: vi.fn(),
	}
	const props: RichEditorProps = {
		body: BODY,
		images: [],
		claims: [],
		changedFrom: null,
		locked: false,
		scrollMargin: 0,
		editorViewRef: viewRef,
		...handlers,
		...overrides,
	}
	let force = () => {}
	const RemixStub = createRemixStub([
		{
			path: '/review/a1/change',
			Component: () => {
				const [, bump] = useReducer((n: number) => n + 1, 0)
				force = bump
				return <RichEditor {...props} />
			},
		},
	])
	render(<RemixStub initialEntries={['/review/a1/change']} />)
	return {
		handlers,
		get view() {
			if (!viewRef.current) throw new Error('no view')
			return viewRef.current
		},
		update(partial: Partial<RichEditorProps>) {
			Object.assign(props, partial)
			act(() => force())
		},
	}
}

function root() {
	return screen.getByRole('textbox', { name: RICH_EDITOR_COPY.label })
}

afterEach(() => {
	vi.useRealTimers()
})

test('mounts the document and never emits on load', () => {
	vi.useFakeTimers()
	const { handlers } = mount()
	const el = root()
	expect(el.classList.contains('ProseMirror')).toBe(true)
	expect(el).toHaveAttribute('aria-multiline', 'true')
	expect(el).toHaveAttribute('contenteditable', 'true')
	expect(el.textContent).toContain('Most people need 20 units.')
	expect(el.querySelector('h2')?.textContent).toBe('Botox basics')
	expect(
		el.querySelector('a[href="https://hitchcoxaesthetics.com"]')?.textContent,
	).toBe('our site')
	act(() => {
		vi.advanceTimersByTime(5000)
	})
	expect(handlers.onChange).not.toHaveBeenCalled()
	expect(handlers.onSelection).not.toHaveBeenCalled()
})

test('a user transaction emits the serialised markdown once', () => {
	const { view, handlers } = mount()
	view.dispatch(view.state.tr.insertText(' more', endOf(view)))
	expect(handlers.onChange).toHaveBeenCalledTimes(1)
	expect(handlers.onChange).toHaveBeenCalledWith(`${BODY} more`)
	expect(root()).toHaveAttribute('contenteditable', 'true')
	expect(root().textContent).toContain('Botox Knox. more')
})

test('claims are yellow marks with data-claim and no id', () => {
	mount({ claims: [CLAIM] })
	const pieces = root().querySelectorAll('mark.review-mark[data-claim="0"]')
	expect(pieces.length).toBeGreaterThanOrEqual(2)
	expect(
		Array.from(pieces)
			.map(m => m.textContent)
			.join(''),
	).toBe(CLAIM)
	for (const piece of pieces) expect(piece.hasAttribute('id')).toBe(false)
	expect(root().querySelectorAll('mark[data-claim]').length).toBe(pieces.length)
})

test('every top-level block carries data-paragraph in order', () => {
	mount()
	const blocks = root().querySelectorAll('[data-paragraph]')
	expect(Array.from(blocks).map(b => b.getAttribute('data-paragraph'))).toEqual(
		['0', '1'],
	)
	expect(root().querySelector('[data-paragraph="1"]')?.tagName).toBe('P')
	expect(root().querySelector('[data-paragraph="0"]')?.tagName).toBe('H2')
})

test('a picture line resolves through the resolver, else the placeholder', () => {
	const editor = mount({ body: PICTURE_BODY, images: [IMAGE_ROW] })
	const img = root().querySelector('img')
	expect(img).not.toBeNull()
	expect(img).toHaveAttribute('src', '/resources/article-images/im1')
	expect(img).toHaveAttribute('alt', 'a test picture')
	expect(img).toHaveAttribute('data-zoom-src', '/resources/article-images/im1')
	expect(img).toHaveAttribute('width', '1')
	expect(img).toHaveAttribute('height', '1')
	expect(img).toHaveAttribute('draggable', 'false')
	expect(img).toHaveAttribute('loading', 'lazy')
	expect(img?.className).toContain('cursor-zoom-in')
	expect(root().querySelector('em')?.textContent).toBe('The clinic room.')
	expect(root().querySelector('[data-picture-placeholder]')).toBeNull()

	editor.update({ images: [] })
	expect(root().querySelector('img')).toBeNull()
	const placeholder = root().querySelector('[data-picture-placeholder="1"]')
	expect(placeholder?.textContent).toBe(
		'Picture 1: a test picture. It is still being made.',
	)
	expect(root().querySelector('em')?.textContent).toBe('The clinic room.')
	expect(editor.handlers.onChange).not.toHaveBeenCalled()

	editor.update({ body: USER_PICTURE_BODY })
	const plain = root().querySelector('img')
	expect(plain).toHaveAttribute('src', 'images/user-x.png')
	expect(plain?.hasAttribute('data-zoom-src')).toBe(false)
	expect(root().querySelector('[data-picture-placeholder]')).toBeNull()

	editor.update({
		images: [{ id: 'im2', fileName: 'user-x.png', position: 1 }],
	})
	expect(root().querySelector('img[data-zoom-src]')).toHaveAttribute(
		'src',
		'/resources/article-images/im2',
	)
	expect(editor.handlers.onChange).not.toHaveBeenCalled()
})

test('an external body replaces only the changed block and keeps the selection and the DOM', () => {
	const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	const editor = mount({ body: FIVE })
	const { view } = editor
	const inThree = rangeOf(view.state.doc, 'Three').from + 2
	select(view, inThree)
	const third = root().querySelectorAll('p')[2]!
	editor.update({ body: FIVE.replace('One.', 'One changed.') })
	expect(editor.handlers.onChange).not.toHaveBeenCalled()
	expect(view.state.selection.from).toBe(inThree + ' changed'.length)
	expect(root().querySelectorAll('p')[2]!.isSameNode(third)).toBe(true)
	expect(root().querySelectorAll('p')[0]!.textContent).toBe('One changed.')
	expect(root().querySelectorAll('p').length).toBe(5)
	expect(scrollTo).not.toHaveBeenCalled()
	expect(editor.handlers.onSelection).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: inThree + ' changed'.length }),
	)
})

test('changedFrom draws one green mark and drops an overlapping claim', () => {
	const editor = mount({
		claims: ['Most people need 15 to 25 units.', CLAIM],
	})
	expect(root().querySelector('mark[data-claim="0"]')).toBeNull()
	expect(root().querySelector('mark[data-claim="1"]')).not.toBeNull()

	editor.update({ body: BODY_CHANGED, changedFrom: BODY })
	const green = root().querySelectorAll('mark.review-changed')
	expect(green.length).toBe(1)
	expect(green[0]!.textContent).toBe('15 to 25')
	expect(root().querySelector('mark[data-claim="0"]')).toBeNull()
	expect(root().querySelector('mark[data-claim="1"]')?.textContent).toContain(
		'See',
	)

	editor.update({ changedFrom: null })
	expect(root().querySelector('mark.review-changed')).toBeNull()
	expect(root().querySelector('mark[data-claim="0"]')).not.toBeNull()
	expect(editor.handlers.onChange).not.toHaveBeenCalled()
})

test('locked makes the editor not editable, blurs it, and drops typed changes', () => {
	const editor = mount()
	const { view } = editor
	const el = root()
	act(() => el.focus())
	editor.update({ locked: true })
	expect(el).toHaveAttribute('contenteditable', 'false')
	expect(el).toHaveAttribute('aria-busy', 'true')
	expect(el).toHaveAttribute('aria-readonly', 'true')
	expect(document.activeElement).not.toBe(el)
	const before = view.state.doc
	view.dispatch(view.state.tr.insertText(' more', endOf(view)))
	expect(editor.handlers.onChange).not.toHaveBeenCalled()
	expect(view.state.doc).toBe(before)
	expect(el.textContent).not.toContain(' more')

	editor.update({ locked: false })
	expect(el).toHaveAttribute('contenteditable', 'true')
	expect(el).toHaveAttribute('aria-busy', 'false')
	view.dispatch(view.state.tr.insertText(' more', endOf(view)))
	expect(editor.handlers.onChange).toHaveBeenCalledTimes(1)
	expect(editor.handlers.onChange).toHaveBeenCalledWith(`${BODY} more`)
})

test('an external replace works while locked and does not join the history', () => {
	const editor = mount({ locked: true })
	editor.update({ body: BODY_CHANGED })
	expect(root().textContent).toContain('15 to 25 units')
	expect(root()).toHaveAttribute('contenteditable', 'false')
	expect(undo(editor.view.state)).toBe(false)
	expect(editor.handlers.onChange).not.toHaveBeenCalled()
})

test('focus and blur report, and blur flushes', () => {
	const { handlers } = mount()
	fireEvent.focus(root())
	expect(handlers.onFocusChange).toHaveBeenLastCalledWith(true)
	expect(handlers.onBlur).not.toHaveBeenCalled()
	fireEvent.blur(root())
	expect(handlers.onFocusChange).toHaveBeenLastCalledWith(false)
	expect(handlers.onBlur).toHaveBeenCalledTimes(1)
})

test('the selection reports the quote, the link and the active marks', () => {
	const editor = mount({ body: `${BODY}\n\nSome **bold** words.` })
	const { view, handlers } = editor
	const last = () => handlers.onSelection.mock.lastCall![0]

	const units = rangeOf(view.state.doc, '20 units')
	select(view, units.from, units.to)
	expect(last()).toMatchObject({
		from: units.from,
		to: units.to,
		empty: false,
		quote: '20 units',
		link: null,
	})
	expect(last().active.strong).toBe(false)

	select(view, units.from, units.from + 2)
	expect(last().quote).toBeNull()

	const site = rangeOf(view.state.doc, 'our site')
	select(view, site.from, site.to)
	expect(last()).toMatchObject({
		quote: 'our site',
		link: 'https://hitchcoxaesthetics.com',
	})

	const bold = rangeOf(view.state.doc, 'bold')
	select(view, bold.from + 1)
	expect(last()).toMatchObject({ empty: true, quote: null, link: null })
	expect(last().active.strong).toBe(true)
	expect(last().active.em).toBe(false)

	const calls = handlers.onSelection.mock.calls.length
	select(view, bold.from + 1)
	expect(handlers.onSelection.mock.calls.length).toBe(calls)
})

test('a pasted image file goes to onImageFile, never into the doc', () => {
	const editor = mount()
	const { view, handlers } = editor
	const before = view.state.doc
	fireEvent.paste(root(), {
		clipboardData: { files: [PNG], getData: () => '' },
	})
	expect(handlers.onImageFile).toHaveBeenCalledTimes(1)
	expect(handlers.onImageFile).toHaveBeenCalledWith(PNG)
	fireEvent.drop(root(), {
		dataTransfer: { files: [PNG], getData: () => '' },
	})
	expect(handlers.onImageFile).toHaveBeenCalledTimes(2)
	expect(view.state.doc).toBe(before)
	expect(handlers.onChange).not.toHaveBeenCalled()
	expect(root().querySelector('img')).toBeNull()
})

test('scrollMargin is applied', () => {
	const editor = mount({ scrollMargin: 120 })
	expect(editor.view.props.scrollMargin).toBe(120)
	expect(editor.view.props.scrollThreshold).toBe(120)
	editor.update({ scrollMargin: 80 })
	expect(editor.view.props.scrollMargin).toBe(80)
	expect(editor.view.props.scrollThreshold).toBe(80)
})

test('a real production body with a picture: typing, an external replace and the lock', () => {
	const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	const real = fixture.find(b => b.id === 'cmtrp3wdz000lx1sjzg640f7d')!
	const body = real.body.replace(/\r\n/g, '\n').trimEnd()
	expect(pictureLines(body).length).toBeGreaterThan(0)
	const editor = mount({ body, images: [IMAGE_ROW] })
	const { view, handlers } = editor
	expect(serializeArticle(view.state.doc)).toBe(body)
	const picture = root().querySelector('img[data-zoom-src]')
	expect(picture).not.toBeNull()
	expect(picture?.closest('p')?.querySelector('em')).not.toBeNull()

	const monday = 'usually on a Monday.'
	view.dispatch(
		view.state.tr.insertText(' x', rangeOf(view.state.doc, monday).to),
	)
	expect(handlers.onChange).toHaveBeenCalledTimes(1)
	const typed = body.replace(monday, `${monday} x`)
	expect(handlers.onChange).toHaveBeenCalledWith(typed)
	expect(serializeArticle(view.state.doc)).toBe(typed)

	const caret = rangeOf(view.state.doc, 'Monday').from
	select(view, caret)
	const lastLine = typed.slice(typed.lastIndexOf('\n\n') + 2)
	const changed = typed.replace(lastLine, `${lastLine}\n\nSarah changed this.`)
	editor.update({ body: changed, changedFrom: typed })
	expect(view.state.selection.from).toBe(caret)
	expect(scrollTo).not.toHaveBeenCalled()
	expect(root().querySelector('mark.review-changed')?.textContent).toBe(
		'Sarah changed this.',
	)
	expect(root().querySelector('img[data-zoom-src]')).not.toBeNull()
	expect(handlers.onChange).toHaveBeenCalledTimes(1)
	expect(serializeArticle(view.state.doc)).toBe(changed)

	editor.update({ locked: true })
	expect(root()).toHaveAttribute('contenteditable', 'false')
	const docBefore = view.state.doc
	view.dispatch(view.state.tr.insertText('y', endOf(view)))
	expect(view.state.doc).toBe(docBefore)
	expect(handlers.onChange).toHaveBeenCalledTimes(1)
})

test('typing inside a claim stretches its mark, and a same-content claims array does not rebuild it', () => {
	const editor = mount({ claims: ['Most people need 20 units.'] })
	const { view } = editor
	const marked = () =>
		Array.from(root().querySelectorAll('mark[data-claim="0"]'))
			.map(m => m.textContent)
			.join('')
	expect(marked()).toBe('Most people need 20 units.')
	view.dispatch(
		view.state.tr.insertText(
			'about ',
			rangeOf(view.state.doc, '20 units').from,
		),
	)
	expect(marked()).toBe('Most people need about 20 units.')

	editor.update({ claims: ['Most people need 20 units.'] })
	expect(marked()).toBe('Most people need about 20 units.')

	editor.update({ claims: ['Most people need about 20 units.', CLAIM] })
	expect(marked()).toBe('Most people need about 20 units.')
	expect(root().querySelector('mark[data-claim="1"]')).not.toBeNull()
	expect(editor.handlers.onChange).toHaveBeenCalledTimes(1)
})

test('text typed after a picture, or with the picture selected, joins the caption in its italic', () => {
	const editor = mount({ body: PICTURE_BODY, images: [IMAGE_ROW] })
	const { view, handlers } = editor
	let imagePos = -1
	view.state.doc.descendants((node, pos) => {
		if (node.type.name === 'image') imagePos = pos
	})
	expect(imagePos).toBeGreaterThan(0)
	const typed = (from: number, to: number, text: string) =>
		view.props.handleTextInput!.call(view, view, from, to, text, () =>
			view.state.tr.insertText(text, from, to),
		)

	// the caret right after the picture
	select(view, imagePos + 1)
	expect(typed(imagePos + 1, imagePos + 1, 'x')).toBe(true)
	expect(handlers.onChange).toHaveBeenLastCalledWith(
		PICTURE_BODY.replace('*The clinic room.*', '*xThe clinic room.*'),
	)
	expect(root().querySelectorAll('em').length).toBe(1)
	expect(root().querySelector('em')?.textContent).toBe('xThe clinic room.')

	// the picture selected, as a tap leaves it: the text goes after it, never in its place
	view.dispatch(
		view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos)),
	)
	expect(view.state.selection).toBeInstanceOf(NodeSelection)
	expect(typed(imagePos, imagePos + 1, 'y')).toBe(true)
	expect(root().querySelector('img[data-zoom-src]')).not.toBeNull()
	expect(root().querySelectorAll('em').length).toBe(1)
	expect(root().querySelector('em')?.textContent).toBe('yxThe clinic room.')
	expect(handlers.onChange).toHaveBeenLastCalledWith(
		PICTURE_BODY.replace('*The clinic room.*', '*yxThe clinic room.*'),
	)
	expect(view.state.selection).toBeInstanceOf(TextSelection)
	// after the picture, the soft break and the "y"
	expect(view.state.selection.from).toBe(imagePos + 3)
})

test('a selection that starts where a link ends is not on that link', () => {
	const editor = mount({ body: 'go [here](https://a.b) now and then' })
	const { view, handlers } = editor
	const last = () => handlers.onSelection.mock.lastCall![0]
	const now = rangeOf(view.state.doc, ' now')
	select(view, now.from, now.to)
	expect(last()).toMatchObject({ empty: false, link: null })

	const here = rangeOf(view.state.doc, 'here')
	select(view, here.from, here.to)
	expect(last().link).toBe('https://a.b')
	// a caret at either edge of the link is in it
	select(view, here.to)
	expect(last().link).toBe('https://a.b')
	select(view, here.from)
	expect(last().link).toBe('https://a.b')
	select(view, now.to)
	expect(last().link).toBeNull()
})
