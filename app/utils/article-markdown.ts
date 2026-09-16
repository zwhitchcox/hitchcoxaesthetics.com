/**
 * The article as a ProseMirror document: markdown in, markdown out.
 *
 * Pure module, no DOM and no React. The rich editor (rich-editor.tsx)
 * builds its view from these parts; the unit test round-trips every
 * production body through `parseArticle` and `serializeArticle` and pins
 * the escaper, the decorations, the diff and the commands.
 *
 * The markdown string stays the source of truth. The serializer writes the
 * style the articles use (`- ` bullets, `*em*`, `**strong**`, `---`, the
 * picture line with its caption on the next line) and escapes only a typed
 * literal that would change meaning.
 */
import { setBlockType, toggleMark } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import {
	inputRules,
	textblockTypeInputRule,
	undoInputRule,
	wrappingInputRule,
} from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import {
	MarkdownParser,
	MarkdownSerializer,
	type MarkdownSerializerState,
	defaultMarkdownParser,
	defaultMarkdownSerializer,
	schema as base,
} from 'prosemirror-markdown'
import { Fragment, type Node, Schema, Slice } from 'prosemirror-model'
import {
	liftListItem,
	splitListItem,
	wrapInList,
} from 'prosemirror-schema-list'
import {
	type Command,
	type EditorState,
	type Plugin,
	type Transaction,
} from 'prosemirror-state'
import { Decoration, type EditorView } from 'prosemirror-view'
import { firstDiffRange } from './article-edit.ts'
import { normalize } from './review-aid.ts'

/* ------------------------------------------------------------------------ */
/* Schema, parser, serializer                                               */
/* ------------------------------------------------------------------------ */

/**
 * The prosemirror-markdown schema plus one inline leaf, `soft_break`, for
 * a newline inside a paragraph (the hard-wrapped blog bodies, the NAP
 * block, the picture caption under its picture). It renders as a space,
 * so the editor reads like the page, and serialises as the newline it was.
 * A picture is one inline `image` node, never dragged.
 */
export const articleSchema = new Schema({
	nodes: base.spec.nodes
		.update('image', {
			...base.spec.nodes.get('image')!,
			draggable: false,
			selectable: true,
		})
		.addToEnd('soft_break', {
			inline: true,
			group: 'inline',
			selectable: false,
			parseDOM: [{ tag: 'span[data-soft-break]' }],
			toDOM: () => ['span', { 'data-soft-break': '' }, ' '],
		}),
	marks: base.spec.marks,
})

/**
 * The default parser's markdown-it instance ('commonmark', html off, no
 * linkify, no GFM) with one more token rule: a soft break becomes the
 * `soft_break` node instead of a space.
 */
export const articleParser = new MarkdownParser(
	articleSchema,
	defaultMarkdownParser.tokenizer,
	{
		...defaultMarkdownParser.tokens,
		softbreak: { node: 'soft_break' },
	},
)

/** A `<` that opens an autolink: a scheme or an e-mail address up to the closing `>`. */
const AUTOLINK_OPEN =
	/<(?=(?:[a-z][a-z0-9+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>@]+)>)/gi

/**
 * Escape a typed literal that would otherwise read as markdown: `\`, a
 * backtick and `*` always, `_` only at a word edge, a bracket pair that a
 * `(` follows, and a `<` that opens an autolink. `[1]`, `#1550`,
 * `Daddy & Dad`, `approved_usd`, `<b>`, bare URLs and e-mail addresses
 * stay as typed.
 */
function escapeInline(text: string): string {
	let out = text.replace(/([\\`*])/g, '\\$1')
	out = out
		.replace(/(^|[^\w])_(?=\w)/g, '$1\\_')
		.replace(/(\w)_(?=[^\w]|$)/g, '$1\\_')
	out = out.replace(/\[([^\]]*)\]\(/g, '\\[$1](')
	out = out.replace(AUTOLINK_OPEN, '\\<')
	return out
}

/** Escape a list marker (`- `, `1. `, `1) `), a heading mark, a quote mark or a `~~~` fence at the start of a block line. */
function escapeLineStart(text: string): string {
	return text
		.replace(/^(\+[ ]|[-*>])/, '\\$&')
		.replace(/^(\s*)(#{1,6})(\s|$)/, '$1\\$2$3')
		.replace(/^(\s*\d+)([.)])\s/, '$1\\$2 ')
		.replace(/^(\s*)(~{3,})/, '$1\\$2')
}

/**
 * A line that holds only list or quote prefixes and spaces. Each loop
 * needs a marker, so the match is linear in the line length (a form with
 * an optional marker backtracks exponentially on a run of spaces).
 */
const LINE_START = /(?:^|\n)(?:[ \t]*(?:>|[-*+]|\d+[.)]))*[ \t]*$/

/**
 * The output written so far. prosemirror-markdown keeps `out` out of its
 * public types, but every rule of the state writes to it and the corpus
 * test pins what this module reads from it.
 */
function outputOf(state: MarkdownSerializerState): string {
	return (state as unknown as { out: string }).out
}

/** True when the output so far ends at the start of a block line: empty, after "\n", or after a list or quote prefix. Only the current line is tested. */
function atLineStart(out: string): boolean {
	return LINE_START.test(out.slice(out.lastIndexOf('\n') + 1))
}

/** A newline is written around a picture unless a line break is already there. */
function breaksLine(node: Node | null | undefined): boolean {
	return node?.type.name === 'soft_break' || node?.type.name === 'hard_break'
}

/**
 * The default serializer with five changes: `- ` bullets, a `soft_break`
 * as a newline, a picture kept on its own line, a `text` rule that
 * applies the escaper above instead of the stock one, and a `link` rule
 * that always writes `[text](href)` (the stock one writes `<href>` when
 * the text is the address, a form the writer's tools do not read).
 * `strict: false` writes the content of an unknown node instead of
 * throwing.
 *
 * At the start of a block line the text loses its leading spaces and
 * tabs: markdown cannot carry them (four or more would turn the paragraph
 * into a code block), so the re-parse gives the same paragraph. Spaces
 * before a line break go too: two of them would read as a hard break.
 *
 * A picture and its caption are one paragraph `[image, soft_break, em]`.
 * When a key removes the soft break, the image rule writes the newline
 * itself, so the picture line keeps the form `pictureLines` and the
 * mini's `PICTURE_LINE_RE` match on every save.
 */
export const articleSerializer = new MarkdownSerializer(
	{
		...defaultMarkdownSerializer.nodes,
		bullet_list(state, node) {
			state.renderList(node, '  ', () => '- ')
		},
		soft_break(state) {
			state.write('\n')
		},
		image(state, node, parent, index) {
			if (index > 0 && !breaksLine(parent.child(index - 1))) state.write('\n')
			defaultMarkdownSerializer.nodes.image!(state, node, parent, index)
			const next = parent.maybeChild(index + 1)
			if (next && !breaksLine(next)) state.write('\n')
		},
		text(state, node, parent, index) {
			const lines = (node.text ?? '').split('\n')
			const endsAtBreak = breaksLine(parent.maybeChild(index + 1))
			for (let i = 0; i < lines.length; i++) {
				state.write()
				let line = lines[i]!
				if (i !== lines.length - 1 || endsAtBreak)
					line = line.replace(/[ \t]+$/, '')
				line = escapeInline(line)
				if (atLineStart(outputOf(state)))
					line = escapeLineStart(line.replace(/^[ \t]+/, ''))
				state.text(line, false)
				if (i !== lines.length - 1) state.write('\n')
			}
		},
	},
	{
		...defaultMarkdownSerializer.marks,
		link: {
			open: '[',
			close(_state, mark) {
				const href = String(mark.attrs.href ?? '').replace(/[()"]/g, '\\$&')
				const title = mark.attrs.title
					? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"`
					: ''
				return `](${href}${title})`
			},
			mixable: true,
		},
	},
	{ strict: false },
)

/** Markdown to a document. CRLF folds to LF, as the save path does. */
export function parseArticle(markdown: string): Node {
	return articleParser.parse(markdown.replace(/\r\n/g, '\n'))
}

/** A document to markdown in the articles' style. */
export function serializeArticle(doc: Node): string {
	return articleSerializer.serialize(doc)
}

/* ------------------------------------------------------------------------ */
/* Document text                                                            */
/* ------------------------------------------------------------------------ */

export type DocText = {
	/** The plain text of the document: the text nodes, a picture's alt, one space per soft break, "\n" after each top-level block. */
	text: string
	/** The document position of each character of `text`. */
	positions: number[]
}

/**
 * The document's plain text with a position for every character. It equals
 * `plainQuote` of the markdown up to whitespace, which is what the routes'
 * claims are, so a quote can be found in it the way `locate` finds one in
 * the body.
 */
export function docText(doc: Node): DocText {
	let text = ''
	const positions: number[] = []
	doc.forEach((child, offset) => {
		child.nodesBetween(
			0,
			child.content.size,
			(node, pos) => {
				if (node.isText) {
					const value = node.text ?? ''
					text += value
					for (let i = 0; i < value.length; i++) positions.push(pos + i)
				} else if (node.type.name === 'image') {
					const alt = String(node.attrs.alt ?? '')
					text += alt
					for (let i = 0; i < alt.length; i++) positions.push(pos)
				} else if (
					node.type.name === 'soft_break' ||
					node.type.name === 'hard_break'
				) {
					text += ' '
					positions.push(pos)
				}
			},
			offset + 1,
		)
		text += '\n'
		positions.push(offset + child.nodeSize - 1)
	})
	return { text, positions }
}

/** The text between two positions as a selection reads it: a picture gives its alt, any other leaf a space, blocks join with a newline. */
export function articleTextBetween(
	doc: Node,
	from: number,
	to: number,
): string {
	return doc.textBetween(from, to, '\n', leaf =>
		leaf.type.name === 'image' ? String(leaf.attrs.alt ?? '') : ' ',
	)
}

/* ------------------------------------------------------------------------ */
/* Decorations                                                              */
/* ------------------------------------------------------------------------ */

export type DocRange = {
	from: number
	to: number
	/** Position of the matching quote in the `quotes` argument. */
	index: number
}

/**
 * Where each quote sits in the document, sorted by position, first
 * occurrence only. The same rules as `findHighlightRanges`: the text is
 * normalised on both sides, a quote that is not there is left out, and a
 * range that overlaps an earlier one is left out.
 */
export function findDocRanges(
	doc: Node,
	quotes: ReadonlyArray<string>,
): DocRange[] {
	const dt = docText(doc)
	const norm = normalize(dt.text)
	const found: DocRange[] = []
	quotes.forEach((quote, index) => {
		const needle = normalize(quote).text
		if (!needle) return
		const at = norm.text.indexOf(needle)
		if (at < 0) return
		const start = norm.map[at]!
		const end = norm.map[at + needle.length - 1]! + 1
		found.push({
			from: dt.positions[start]!,
			to: dt.positions[end - 1]! + 1,
			index,
		})
	})
	found.sort((a, b) => a.from - b.from || b.to - a.to)
	const out: DocRange[] = []
	let lastTo = -1
	for (const range of found) {
		if (range.from < lastTo) continue
		out.push(range)
		lastTo = range.to
	}
	return out
}

/**
 * The yellow claim marks: one inline decoration per found quote, rendered
 * as `mark.review-mark[data-claim]`. A claim that overlaps `changed` is
 * left out, as `changedWins` does on the page. No `id`: ProseMirror splits
 * one decoration over the inline nodes it covers.
 */
export function claimDecorations(
	doc: Node,
	claims: ReadonlyArray<string>,
	changed?: { from: number; to: number } | null,
): Decoration[] {
	return findDocRanges(doc, claims)
		.filter(r => !changed || !(changed.from < r.to && changed.to > r.from))
		.map(r =>
			Decoration.inline(r.from, r.to, {
				nodeName: 'mark',
				class: 'review-mark',
				'data-claim': String(r.index),
			}),
		)
}

/**
 * The span that changed between two documents, in `after`'s positions:
 * `firstDiffRange` over the two document texts. Null when the texts are
 * equal; an empty span for a pure deletion.
 */
export function docDiffRange(
	before: Node,
	after: Node,
): { from: number; to: number } | null {
	const a = docText(before)
	const b = docText(after)
	const range = firstDiffRange(a.text, b.text)
	if (!range) return null
	const from = b.positions[range.start]
	if (from == null) return null
	const to = range.end > range.start ? b.positions[range.end - 1]! + 1 : from
	return { from, to }
}

/** The green changed mark over the document diff, or null when nothing visible changed. */
export function changedDecoration(
	before: Node,
	after: Node,
): Decoration | null {
	const range = docDiffRange(before, after)
	if (!range || range.to <= range.from) return null
	return Decoration.inline(range.from, range.to, {
		nodeName: 'mark',
		class: 'review-changed',
	})
}

/** `data-paragraph` on each top-level block, the index `splitParagraphs` gives the same block. */
export function blockDecorations(doc: Node): Decoration[] {
	const out: Decoration[] = []
	doc.forEach((child, offset, index) => {
		out.push(
			Decoration.node(offset, offset + child.nodeSize, {
				'data-paragraph': String(index),
			}),
		)
	})
	return out
}

/* ------------------------------------------------------------------------ */
/* External replace                                                         */
/* ------------------------------------------------------------------------ */

/**
 * The top-level range of `before` that `after` changes, and the blocks
 * that go in its place. Null when the documents are equal.
 */
export function blockDiff(
	before: Node,
	after: Node,
): { from: number; to: number; slice: Fragment } | null {
	if (before.eq(after)) return null
	let prefix = 0
	while (
		prefix < before.childCount &&
		prefix < after.childCount &&
		before.child(prefix).eq(after.child(prefix))
	)
		prefix++
	let suffix = 0
	while (
		suffix < before.childCount - prefix &&
		suffix < after.childCount - prefix &&
		before
			.child(before.childCount - 1 - suffix)
			.eq(after.child(after.childCount - 1 - suffix))
	)
		suffix++
	const sizeOf = (doc: Node, a: number, b: number) => {
		let n = 0
		for (let i = a; i < b; i++) n += doc.child(i).nodeSize
		return n
	}
	const from = sizeOf(before, 0, prefix)
	const to =
		before.content.size -
		sizeOf(before, before.childCount - suffix, before.childCount)
	const slice = after.content.cut(
		sizeOf(after, 0, prefix),
		after.content.size -
			sizeOf(after, after.childCount - suffix, after.childCount),
	)
	return { from, to, slice }
}

/**
 * A transaction that turns the state's document into `next` by replacing
 * only the changed top-level blocks. Blocks outside the span keep their
 * nodes, so the page does not jump and the decorations map through. It is
 * marked `external` and kept out of the history, so Mod-Z stays hers.
 * Null when nothing changed.
 */
export function replaceDocRange(
	state: EditorState,
	next: Node,
): Transaction | null {
	const diff = blockDiff(state.doc, next)
	if (!diff) return null
	return state.tr
		.replaceWith(diff.from, diff.to, diff.slice)
		.setMeta('external', true)
		.setMeta('addToHistory', false)
}

/* ------------------------------------------------------------------------ */
/* Paste and links                                                          */
/* ------------------------------------------------------------------------ */

function tightenFragment(fragment: Fragment): Fragment {
	let changed = false
	const nodes: Node[] = []
	fragment.forEach(node => {
		const content = node.isLeaf ? node.content : tightenFragment(node.content)
		const isList =
			node.type.name === 'bullet_list' || node.type.name === 'ordered_list'
		const loose = isList && !node.attrs.tight
		if (content === node.content && !loose) {
			nodes.push(node)
			return
		}
		changed = true
		nodes.push(
			loose
				? node.type.create({ ...node.attrs, tight: true }, content, node.marks)
				: node.copy(content),
		)
	})
	return changed ? Fragment.from(nodes) : fragment
}

/**
 * The slice with `tight: true` on every list in it. A pasted HTML list
 * parses loose, which would serialise with blank lines between the items
 * and render `<li><p>` on the page.
 */
export function tightenLists(slice: Slice): Slice {
	const content = tightenFragment(slice.content)
	return content === slice.content
		? slice
		: new Slice(content, slice.openStart, slice.openEnd)
}

export type LinkRange = { from: number; to: number; href: string }

/**
 * The extent of the link around `pos`: the run of inline nodes in the same
 * block that carry a `link` mark with the same address. Null when there is
 * no link at `pos`. A position at the start or the end of the link counts.
 */
export function linkRangeAt(doc: Node, pos: number): LinkRange | null {
	const link = doc.type.schema.marks.link
	if (!link) return null
	const $pos = doc.resolve(pos)
	const parent = $pos.parent
	if (!parent.inlineContent) return null
	const mark =
		link.isInSet($pos.marks()) ??
		link.isInSet($pos.nodeAfter?.marks ?? []) ??
		link.isInSet($pos.nodeBefore?.marks ?? [])
	if (!mark) return null
	const href = String(mark.attrs.href ?? '')
	const same = (node: Node) => {
		const m = link.isInSet(node.marks)
		return m != null && String(m.attrs.href ?? '') === href
	}
	let index = $pos.index()
	if (
		!$pos.textOffset &&
		!(index < parent.childCount && same(parent.child(index)))
	)
		index--
	if (index < 0 || index >= parent.childCount || !same(parent.child(index)))
		return null
	let first = index
	let last = index
	while (first > 0 && same(parent.child(first - 1))) first--
	while (last + 1 < parent.childCount && same(parent.child(last + 1))) last++
	let from = $pos.start()
	for (let i = 0; i < first; i++) from += parent.child(i).nodeSize
	let to = from
	for (let i = first; i <= last; i++) to += parent.child(i).nodeSize
	return { from, to, href }
}

/* ------------------------------------------------------------------------ */
/* Pictures                                                                 */
/* ------------------------------------------------------------------------ */

export type PictureBoundary = 'after-image' | 'before-caption'

/**
 * Where the selection head sits in a picture pair `[image, soft_break,
 * caption]`: `after-image` right after the picture with the soft break
 * next, `before-caption` right after that soft break. Null anywhere else.
 * The rich editor's keymap uses it to keep Backspace, Enter and typing
 * from breaking the pair.
 */
export function pictureBoundaryAt(state: EditorState): PictureBoundary | null {
	const $from = state.selection.$from
	if (!$from.parent.inlineContent || $from.textOffset) return null
	const before = $from.nodeBefore
	const after = $from.nodeAfter
	if (before?.type.name === 'image' && after?.type.name === 'soft_break')
		return 'after-image'
	if (
		before?.type.name === 'soft_break' &&
		$from.parent.maybeChild($from.index() - 2)?.type.name === 'image'
	)
		return 'before-caption'
	return null
}

/* ------------------------------------------------------------------------ */
/* Commands, keymap, input rules                                            */
/* ------------------------------------------------------------------------ */

export type EditorCommand =
	| 'strong'
	| 'em'
	| 'heading2'
	| 'heading3'
	| 'bulletList'

export const EDITOR_COMMANDS: ReadonlyArray<EditorCommand> = [
	'strong',
	'em',
	'heading2',
	'heading3',
	'bulletList',
]

const { strong, em } = articleSchema.marks
const { paragraph, heading, bullet_list, ordered_list, list_item, blockquote } =
	articleSchema.nodes

const HEADING_LEVEL: Record<'heading2' | 'heading3', number> = {
	heading2: 2,
	heading3: 3,
}

/** True when the selection already carries the command's mark, heading level or list. */
export function commandActive(
	command: EditorCommand,
	state: EditorState,
): boolean {
	const { $from, from, to, empty } = state.selection
	if (command === 'strong' || command === 'em') {
		const mark = command === 'strong' ? strong : em
		if (empty) return mark.isInSet(state.storedMarks ?? $from.marks()) != null
		return state.doc.rangeHasMark(from, to, mark)
	}
	if (command === 'heading2' || command === 'heading3') {
		return (
			$from.parent.type === heading &&
			$from.parent.attrs.level === HEADING_LEVEL[command]
		)
	}
	return $from.depth >= 2 && $from.node(-2).type === bullet_list
}

function commandFor(command: EditorCommand, state: EditorState): Command {
	if (command === 'strong') return toggleMark(strong)
	if (command === 'em') return toggleMark(em)
	if (command === 'bulletList') {
		return commandActive('bulletList', state)
			? liftListItem(list_item)
			: wrapInList(bullet_list, { tight: true })
	}
	return commandActive(command, state)
		? setBlockType(paragraph)
		: setBlockType(heading, { level: HEADING_LEVEL[command] })
}

/** Run a toolbar command on the view. Each one toggles: a second run undoes the first. */
export function runCommand(command: EditorCommand, view: EditorView): boolean {
	return commandFor(command, view.state)(view.state, view.dispatch)
}

/**
 * The article's keys: bold, italic, the link row, undo and redo, Enter
 * and Shift-Tab in a list, and Backspace to undo an input rule. The view
 * adds `keymap(baseKeymap)` after it. No Tab (the articles have no nested
 * lists) and no Shift-Enter (a hard break is foreign to the articles).
 */
export function articleKeymap({ openLink }: { openLink: () => void }): Plugin {
	return keymap({
		'Mod-b': toggleMark(strong),
		'Mod-i': toggleMark(em),
		'Mod-k': () => {
			openLink()
			return true
		},
		'Mod-z': undo,
		'Shift-Mod-z': redo,
		'Mod-y': redo,
		Enter: splitListItem(list_item),
		'Shift-Tab': liftListItem(list_item),
		Backspace: undoInputRule,
	})
}

/**
 * Typed markers at the start of a block: `- ` or `* ` starts a tight
 * bullet list, `1. ` a tight ordered list, `# ` to `### ` a heading, `> `
 * a quote. No smart quotes and no autolink: the articles carry neither.
 */
export const articleInputRules: Plugin = inputRules({
	rules: [
		wrappingInputRule(/^\s*([-*])\s$/, bullet_list, () => ({ tight: true })),
		wrappingInputRule(
			/^(\d+)\.\s$/,
			ordered_list,
			match => ({ order: Number(match[1]), tight: true }),
			(match, node) => node.childCount + node.attrs.order === Number(match[1]),
		),
		textblockTypeInputRule(/^(#{1,3})\s$/, heading, match => ({
			level: match[1]!.length,
		})),
		wrappingInputRule(/^\s*>\s$/, blockquote),
	],
})
