/**
 * The article as a ProseMirror view inside React.
 *
 * The markdown string `body` stays the source of truth. The view is built
 * from `parseArticle(body)` once per mount; every user transaction that
 * changes the document is serialised and handed to `onChange`, and a
 * `body` that did not come from `onChange` (a chat answer, Undo, Use the
 * new text, a raw edit under the Markdown toggle) replaces only the
 * changed top-level blocks, outside the history and without a scroll.
 *
 * The yellow claim marks, the green changed mark and `data-paragraph` are
 * decorations, never content. ProseMirror puts `ProseMirror-selectednode`
 * on a selected picture and an `img.ProseMirror-separator` after an
 * inline leaf; tailwind.css styles the `.ProseMirror` root and both.
 *
 * The parent renders this component only after hydration, so the layout
 * effect that creates the view never runs on the server.
 */
import { baseKeymap } from 'prosemirror-commands'
import { history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { type Node } from 'prosemirror-model'
import {
	EditorState,
	Plugin,
	NodeSelection,
	PluginKey,
	TextSelection,
} from 'prosemirror-state'
import {
	DecorationSet,
	EditorView,
	type EditorProps,
	type NodeView,
} from 'prosemirror-view'
import {
	forwardRef,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
} from 'react'
import { foldSelection } from '#app/components/comment-on-this.tsx'
import {
	ARTICLE_EDIT_MAX_SELECTION_CHARS,
	ARTICLE_EDIT_MIN_SELECTION_CHARS,
} from '#app/utils/article-edit.ts'
import {
	type ArticleImageRef,
	type ResolvedArticleImage,
	articleImageResolver,
	pictureNumber,
	placeholderText,
	ZOOM_CLASS,
} from '#app/utils/article-images.ts'
import {
	type EditorCommand,
	EDITOR_COMMANDS,
	articleInputRules,
	articleKeymap,
	articleSchema,
	articleTextBetween,
	blockDecorations,
	changedDecoration,
	claimDecorations,
	commandActive,
	docDiffRange,
	linkRangeAt,
	parseArticle,
	pictureBoundaryAt,
	replaceDocRange,
	serializeArticle,
	tightenLists,
} from '#app/utils/article-markdown.ts'
import { cn } from '#app/utils/misc.tsx'

export const RICH_EDITOR_COPY = {
	label: 'Article',
} as const

/** The prose classes of the article, on the rich root and on `ArticleView`, so the swap after hydration moves nothing. */
export const PROSE_CLASS =
	'prose prose-lg max-w-none dark:prose-invert [&_li]:leading-[1.6] [&_p]:leading-[1.6] [&_[data-paragraph]]:scroll-mt-4 [&_mark]:rounded-sm [&_mark]:bg-amber-200 [&_mark]:px-0.5 [&_mark]:text-inherit dark:[&_mark]:bg-amber-700 [&_.review-changed]:bg-green-200 dark:[&_.review-changed]:bg-green-800'

/* ------------------------------------------------------------------------ */
/* The selection the parent sees                                            */
/* ------------------------------------------------------------------------ */

export type EditorSelection = {
	from: number
	to: number
	empty: boolean
	/** The selected words, whitespace folded, when 3 to 2000 characters; else null. */
	quote: string | null
	/** The address of the link at the selection, or null. */
	link: string | null
	active: Record<EditorCommand, boolean>
}

/** The address of the link at a collapsed selection, or on the selected text. A selection that starts where a link ends is not on that link. */
function linkHrefIn(doc: Node, from: number, to: number): string | null {
	if (from === to) return linkRangeAt(doc, from)?.href ?? null
	const link = doc.type.schema.marks.link
	if (!link) return null
	let href: string | null = null
	doc.nodesBetween(from, to, node => {
		if (href !== null) return false
		const mark = link.isInSet(node.marks)
		if (mark) href = String(mark.attrs.href ?? '')
		return true
	})
	return href
}

/** What the toolbar and "Comment on this" need from the state's selection. */
export function readSelection(state: EditorState): EditorSelection {
	const { from, to, empty } = state.selection
	const text = empty
		? ''
		: foldSelection(articleTextBetween(state.doc, from, to))
	const quote =
		text.length >= ARTICLE_EDIT_MIN_SELECTION_CHARS &&
		text.length <= ARTICLE_EDIT_MAX_SELECTION_CHARS
			? text
			: null
	const active = {} as Record<EditorCommand, boolean>
	for (const command of EDITOR_COMMANDS)
		active[command] = commandActive(command, state)
	return {
		from,
		to,
		empty,
		quote,
		link: linkHrefIn(state.doc, from, to),
		active,
	}
}

function sameSelection(a: EditorSelection | null, b: EditorSelection): boolean {
	return (
		a !== null &&
		a.from === b.from &&
		a.to === b.to &&
		a.empty === b.empty &&
		a.quote === b.quote &&
		a.link === b.link &&
		EDITOR_COMMANDS.every(command => a.active[command] === b.active[command])
	)
}

/* ------------------------------------------------------------------------ */
/* Decorations                                                              */
/* ------------------------------------------------------------------------ */

type DecorationArgs = {
	claims: ReadonlyArray<string>
	changedFrom: string | null
}

type DecorationsState = {
	/** The yellow claim marks and the green changed mark; mapped through every transaction. */
	inline: DecorationSet
	/** `data-paragraph` on each top-level block; rebuilt from the document. */
	blocks: DecorationSet
	/** Both, for the view. */
	all: DecorationSet
}

export const decorationsKey = new PluginKey<DecorationsState>(
	'article-decorations',
)

function withBlocks(doc: Node, inline: DecorationSet): DecorationsState {
	const blocks = DecorationSet.create(doc, blockDecorations(doc))
	return {
		inline,
		blocks,
		all: DecorationSet.create(doc, [...inline.find(), ...blocks.find()]),
	}
}

function buildDecorations(
	doc: Node,
	{ claims, changedFrom }: DecorationArgs,
): DecorationsState {
	const before = changedFrom == null ? null : parseArticle(changedFrom)
	const changed = before ? docDiffRange(before, doc) : null
	const green = before ? changedDecoration(before, doc) : null
	const inline = DecorationSet.create(doc, [
		...claimDecorations(doc, claims, changed),
		...(green ? [green] : []),
	])
	return withBlocks(doc, inline)
}

/**
 * The decoration plugin. A transaction with the `decorationsKey` meta
 * `{ rebuild: true, claims, changedFrom }` rebuilds both sets from its
 * document; any other transaction that changes the document maps the
 * inline set through it (typing inside a claim stretches its mark) and
 * rebuilds the block set.
 */
function decorationsPlugin(args: DecorationArgs): Plugin<DecorationsState> {
	return new Plugin<DecorationsState>({
		key: decorationsKey,
		state: {
			init: (_config, state) => buildDecorations(state.doc, args),
			apply(tr, prev) {
				const meta = tr.getMeta(decorationsKey) as
					| (DecorationArgs & { rebuild: true })
					| undefined
				if (meta?.rebuild) return buildDecorations(tr.doc, meta)
				if (!tr.docChanged) return prev
				return withBlocks(tr.doc, prev.inline.map(tr.mapping, tr.doc))
			},
		},
		props: {
			decorations: state => decorationsKey.getState(state)?.all,
		},
	})
}

/* ------------------------------------------------------------------------ */
/* Pictures                                                                 */
/* ------------------------------------------------------------------------ */

type ImageResolver = (src: string) => ResolvedArticleImage | null

function renderPicture(node: Node, resolve: ImageResolver): HTMLElement {
	const src = String(node.attrs.src ?? '')
	const alt = String(node.attrs.alt ?? '')
	const resolved = resolve(src)
	const finalSrc = resolved?.src ?? src
	const number = pictureNumber(finalSrc)
	if (number !== null) {
		// the writer's picture line with no stored picture yet
		const span = document.createElement('span')
		span.className =
			'block rounded-lg border border-dashed p-3 text-sm text-muted-foreground'
		span.setAttribute('data-picture-placeholder', String(number))
		span.textContent = placeholderText(number, alt)
		return span
	}
	const img = document.createElement('img')
	img.setAttribute('loading', 'lazy')
	img.setAttribute('decoding', 'async')
	img.setAttribute('draggable', 'false')
	img.className = resolved
		? `mx-auto rounded-lg shadow-md ${ZOOM_CLASS}`
		: 'rounded-lg shadow-md'
	img.src = finalSrc
	img.alt = alt
	if (resolved) img.setAttribute('data-zoom-src', finalSrc)
	if (resolved?.width && resolved.height) {
		img.width = resolved.width
		img.height = resolved.height
	}
	return img
}

/**
 * The picture node: read-only, resolved through the same resolver
 * `ArticleView` uses. A resolved picture is `img[data-zoom-src]`, so a
 * click that bubbles to the wrapper opens the zoom; a writer's line with
 * no stored picture is the dashed placeholder. The caption is the `em`
 * run after the soft break in the same paragraph and is edited as text.
 */
export class PictureView implements NodeView {
	dom: HTMLElement

	constructor(
		private node: Node,
		resolve: ImageResolver,
	) {
		this.dom = renderPicture(node, resolve)
	}

	update(node: Node): boolean {
		return node.sameMarkup(this.node)
	}

	ignoreMutation(): boolean {
		return true
	}

	stopEvent(): boolean {
		return false
	}
}

/**
 * Keys at the two edges of a picture pair `[image, soft_break, caption]`
 * leave the pair whole: Enter after the picture moves the caret into the
 * caption; Backspace at the caption's start and Delete after the picture
 * do nothing. The serializer heals the pair on every save regardless;
 * this is only what she sees while typing.
 */
const pictureKeys = keymap({
	Backspace: state =>
		state.selection.empty && pictureBoundaryAt(state) === 'before-caption',
	Delete: state =>
		state.selection.empty && pictureBoundaryAt(state) === 'after-image',
	Enter: (state, dispatch) => {
		if (!state.selection.empty) return false
		const boundary = pictureBoundaryAt(state)
		if (boundary === 'after-image') {
			dispatch?.(
				state.tr.setSelection(
					TextSelection.create(state.doc, state.selection.from + 1),
				),
			)
			return true
		}
		return boundary === 'before-caption'
	},
})

/**
 * Text typed right after a picture, or with the picture selected (a tap
 * puts a NodeSelection on it), goes to the start of its caption with the
 * caption's marks: the caption stays one italic line and the picture is
 * never replaced.
 */
const handleTextInput: EditorProps['handleTextInput'] = (
	view,
	from,
	to,
	text,
) => {
	const { state } = view
	const { selection } = state
	let at: number
	if (
		selection instanceof NodeSelection &&
		selection.node.type === articleSchema.nodes.image
	) {
		const $after = state.doc.resolve(selection.to)
		at =
			$after.nodeAfter?.type.name === 'soft_break'
				? selection.to + 1
				: selection.to
	} else if (from === to && pictureBoundaryAt(state) === 'after-image') {
		at = from + 1
	} else {
		return false
	}
	const $at = state.doc.resolve(at)
	const tr = state.tr
		.setStoredMarks($at.nodeAfter?.marks ?? $at.marks())
		.insertText(text, at)
	view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + text.length)))
	return true
}

/* ------------------------------------------------------------------------ */
/* The component                                                            */
/* ------------------------------------------------------------------------ */

export type RichEditorProps = {
	/** The working copy; re-parsed when it did not come from `onChange`. */
	body: string
	/** The article's pictures: the loader rows and the ones added this visit. */
	images: ReadonlyArray<ArticleImageRef>
	/** The claim quotes from the route, drawn as the yellow marks. */
	claims: ReadonlyArray<string>
	/** The body before the chat's change, for the green mark; null = no mark. */
	changedFrom: string | null
	/** True while a chat turn runs: not editable, blurred, `aria-busy`. */
	locked: boolean
	/** The dock's measured height on the phone, 0 on the desktop: the caret scrolls above it. */
	scrollMargin: number
	/** The page's sticky top bar height on the phone: the caret scrolls below it. 0 on the desktop. */
	scrollTop?: number
	/** Every user transaction that changed the document, serialised. */
	onChange: (markdown: string) => void
	/** The editor lost focus (the parent flushes the save). */
	onBlur: () => void
	/** The editor gained or lost focus (the phone format row). */
	onFocusChange: (focused: boolean) => void
	/** After every transaction that moved the selection or changed the document. */
	onSelection: (selection: EditorSelection) => void
	/** A pasted or dropped picture file; it never lands in the document. */
	onImageFile: (file: File) => void
	/** Mod-K: the parent opens the link row. */
	onLinkShortcut: () => void
	/** The view, for the unit tests and the toolbar. */
	editorViewRef?: React.MutableRefObject<EditorView | null>
	className?: string
}

type Callbacks = Pick<
	RichEditorProps,
	| 'onChange'
	| 'onBlur'
	| 'onFocusChange'
	| 'onSelection'
	| 'onImageFile'
	| 'onLinkShortcut'
>

function imageFileIn(files: ArrayLike<File> | null | undefined): File | null {
	const file = files?.[0]
	return file && file.type.startsWith('image/') ? file : null
}

/**
 * The rich editor. The forwarded ref is the wrapper `div`: the view mounts
 * inside it, the parent's scroll-to-mark effect searches it, and a click
 * on a picture bubbles to the parent's handler on an ancestor.
 */
/**
 * On the phone, ProseMirror's own scroll-into-view measures against the
 * layout viewport, which iOS keeps under the keyboard, so every keystroke
 * near the bottom scrolled the page down and WebKit scrolled it back: the
 * text jumped. This scrolls the caret into the band between the sticky top
 * bar and the dock, measured against the visual viewport, and returns true
 * so ProseMirror does nothing. With no dock (band.bottom 0) ProseMirror
 * keeps its own behaviour.
 */
export function scrollCaretIntoBand(
	view: Pick<EditorView, 'coordsAtPos' | 'state'>,
	band: { top: number; bottom: number },
	win: Pick<Window, 'visualViewport' | 'innerHeight' | 'scrollBy'> = window,
): boolean {
	if (band.bottom <= 0) return false
	const vv = win.visualViewport
	const viewTop = vv ? vv.offsetTop : 0
	const viewBottom = vv ? vv.offsetTop + vv.height : win.innerHeight
	const top = viewTop + band.top + CARET_GAP_PX
	const bottom = viewBottom - band.bottom - CARET_GAP_PX
	if (bottom <= top) return true
	const caret = view.coordsAtPos(view.state.selection.head)
	if (caret.top < top) win.scrollBy(0, caret.top - top)
	else if (caret.bottom > bottom) win.scrollBy(0, caret.bottom - bottom)
	return true
}
/** Breathing room between the caret and the band's edges. */
const CARET_GAP_PX = 8

export const RichEditor = forwardRef<HTMLDivElement, RichEditorProps>(
	function RichEditor(
		{
			body,
			images,
			claims,
			changedFrom,
			locked,
			scrollMargin,
			scrollTop = 0,
			onChange,
			onBlur,
			onFocusChange,
			onSelection,
			onImageFile,
			onLinkShortcut,
			editorViewRef,
			className,
		},
		ref,
	) {
		const rootRef = useRef<HTMLDivElement>(null)
		const bandRef = useRef({ top: scrollTop, bottom: scrollMargin })
		const viewRef = useRef<EditorView | null>(null)
		/** The last markdown handed to `onChange`, or applied from `body`. */
		const lastEmittedRef = useRef<string | null>(null)
		const lastSelectionRef = useRef<EditorSelection | null>(null)
		const lockedRef = useRef(locked)
		const classNameRef = useRef(className)
		const resolver = useMemo(() => articleImageResolver(images), [images])
		const resolverRef = useRef(resolver)
		const decorationArgsRef = useRef<DecorationArgs>({ claims, changedFrom })
		decorationArgsRef.current = { claims, changedFrom }
		/** The claims by content, so a parent that builds the array on each render does not rebuild the marks on every keystroke. */
		const claimsKey = claims.join('\n')
		const callbacksRef = useRef<Callbacks>({
			onChange,
			onBlur,
			onFocusChange,
			onSelection,
			onImageFile,
			onLinkShortcut,
		})
		callbacksRef.current = {
			onChange,
			onBlur,
			onFocusChange,
			onSelection,
			onImageFile,
			onLinkShortcut,
		}

		useImperativeHandle(ref, () => rootRef.current!, [])

		/* The view: once per mount, before the browser paints. */
		useLayoutEffect(() => {
			const root = rootRef.current
			if (!root) return
			const attributes = () => ({
				class: cn(PROSE_CLASS, classNameRef.current),
				role: 'textbox',
				'aria-multiline': 'true',
				'aria-label': RICH_EDITOR_COPY.label,
				'aria-busy': lockedRef.current ? 'true' : 'false',
				'aria-readonly': lockedRef.current ? 'true' : 'false',
				spellcheck: 'true',
				autocorrect: 'on',
				autocapitalize: 'sentences',
			})
			const takeImageFile = (files: ArrayLike<File> | null | undefined) => {
				const file = imageFileIn(files)
				if (!file) return false
				callbacksRef.current.onImageFile(file)
				return true
			}
			const report = (state: EditorState) => {
				const selection = readSelection(state)
				if (sameSelection(lastSelectionRef.current, selection)) return
				lastSelectionRef.current = selection
				callbacksRef.current.onSelection(selection)
			}
			const view: EditorView = new EditorView(root, {
				state: EditorState.create({
					doc: parseArticle(body),
					plugins: [
						history(),
						articleInputRules,
						pictureKeys,
						articleKeymap({
							openLink: () => callbacksRef.current.onLinkShortcut(),
						}),
						keymap(baseKeymap),
						decorationsPlugin(decorationArgsRef.current),
					],
				}),
				editable: () => !lockedRef.current,
				attributes,
				scrollMargin,
				scrollThreshold: scrollMargin,
				handleScrollToSelection: v => scrollCaretIntoBand(v, bandRef.current),
				nodeViews: {
					image: node => new PictureView(node, resolverRef.current),
				},
				handleDOMEvents: {
					focus: () => {
						callbacksRef.current.onFocusChange(true)
						return false
					},
					blur: () => {
						callbacksRef.current.onFocusChange(false)
						callbacksRef.current.onBlur()
						return false
					},
					// Before ProseMirror's own drop handler, which needs a position under the pointer and gives up over the padding.
					drop: (_view, event) => {
						if (!takeImageFile(event.dataTransfer?.files)) return false
						event.preventDefault()
						return true
					},
				},
				handlePaste: (_view, event) =>
					takeImageFile(event.clipboardData?.files),
				handleTextInput,
				transformPasted: slice => tightenLists(slice),
				dispatchTransaction(tr) {
					// held while a chat turn runs, like the parent's updateBody
					if (lockedRef.current && tr.docChanged && !tr.getMeta('external'))
						return
					const next = view.state.apply(tr)
					view.updateState(next)
					if (tr.docChanged && !tr.getMeta('external')) {
						const markdown = serializeArticle(next.doc)
						lastEmittedRef.current = markdown
						callbacksRef.current.onChange(markdown)
					}
					if (tr.docChanged || tr.selectionSet) report(next)
				},
			})
			viewRef.current = view
			lastEmittedRef.current = body
			if (editorViewRef) editorViewRef.current = view
			return () => {
				view.destroy()
				viewRef.current = null
				if (editorViewRef) editorViewRef.current = null
			}
			// The view is created once per mount; the effects below apply every later prop change.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [])

		/* A body that did not come from onChange: replace only the changed blocks. */
		useLayoutEffect(() => {
			const view = viewRef.current
			if (!view || body === lastEmittedRef.current) return
			const tr = replaceDocRange(view.state, parseArticle(body))
			if (tr)
				view.dispatch(
					tr.setMeta(decorationsKey, {
						rebuild: true,
						...decorationArgsRef.current,
					}),
				)
			lastEmittedRef.current = body
		}, [body])

		/* New claims or a new green mark: rebuild the decorations. */
		useLayoutEffect(() => {
			const view = viewRef.current
			if (!view) return
			view.dispatch(
				view.state.tr.setMeta(decorationsKey, {
					rebuild: true,
					...decorationArgsRef.current,
				}),
			)
		}, [claimsKey, changedFrom])

		/* The lock: contenteditable, aria-busy, and the blur that closes the keyboard. */
		useLayoutEffect(() => {
			lockedRef.current = locked
			classNameRef.current = className
			const view = viewRef.current
			if (!view) return
			view.setProps({ editable: () => !lockedRef.current })
			if (locked && view.hasFocus()) view.dom.blur()
		}, [locked, className])

		useLayoutEffect(() => {
			const view = viewRef.current
			if (!view || view.props.scrollMargin === scrollMargin) return
			view.setProps({ scrollMargin, scrollThreshold: scrollMargin })
		}, [scrollMargin])
		bandRef.current = { top: scrollTop, bottom: scrollMargin }

		/* A picture uploaded this visit: the picture nodes resolve again. */
		useLayoutEffect(() => {
			const view = viewRef.current
			if (!view || resolverRef.current === resolver) return
			resolverRef.current = resolver
			view.setProps({
				nodeViews: {
					image: node => new PictureView(node, resolverRef.current),
				},
			})
		}, [resolver])

		return <div ref={rootRef} className="relative" />
	},
)
