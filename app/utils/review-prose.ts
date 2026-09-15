/**
 * The remark transform behind "Every word" on /review/:id.
 *
 * MarkdownContent renders with react-markdown and no raw HTML, so a `<mark>`
 * in the markdown source would print as text. This transform works on the
 * markdown tree instead:
 *
 * - every top-level block gets `data-paragraph="<index>"` (the index from
 *   splitParagraphs on the same body), so the page can scroll to a paragraph
 *   and the read_to beacon can report one;
 * - each highlight range (body offsets from findHighlightRanges) is wrapped
 *   in a `<mark id="hl-<index>" data-claim="<index>">`, split across text
 *   nodes when a quote spans emphasis or a link;
 * - a range with `kind: 'changed'` (the passage an AI edit just changed) is
 *   wrapped in a `<mark class="review-changed">` with no id and no claim;
 *   where it overlaps a claim range it wins;
 * - the "You were here" marker is inserted before the paragraph she reached.
 *
 * Browser-safe and pure: no DOM, no prisma. The offsets must come from the
 * exact string that is rendered.
 */
import { type Paragraph } from './review-aid.ts'

/**
 * A highlight to wrap. `index` is the claim row it belongs to. `kind`
 * defaults to `claim`; a `changed` range marks text an AI edit changed and
 * has no claim row.
 */
export type ProseRange = {
	start: number
	end: number
	index: number
	kind?: 'claim' | 'changed'
}

export type ReviewProseOptions = {
	/** From splitParagraphs(body). Only start and end are read. */
	paragraphs: ReadonlyArray<Pick<Paragraph, 'start' | 'end'>>
	/** From findHighlightRanges(body, quotes). */
	ranges: ReadonlyArray<ProseRange>
	/** Paragraph index for the "You were here" marker, or null for none. */
	markerAt?: number | null
}

export const MARKER_ID = 'you-were-here'
export const MARKER_TEXT = 'You were here'
export const MARK_CLASS = 'review-mark'
export const CHANGED_CLASS = 'review-changed'

export function highlightId(index: number): string {
	return `hl-${index}`
}

export function claimRowId(index: number): string {
	return `claim-${index}`
}

/* Minimal mdast shapes. The real types live in a transitive package. */
type Position = { start: { offset?: number }; end: { offset?: number } }
export type MdNode = {
	type: string
	value?: string
	children?: MdNode[]
	position?: Position
	data?: Record<string, unknown>
}

/** The paragraph that holds `offset`, or -1 (the same rule as paragraphIndexAt). */
function indexAt(
	paragraphs: ReadonlyArray<Pick<Paragraph, 'start' | 'end'>>,
	offset: number,
): number {
	return paragraphs.findIndex(p => offset >= p.start && offset < p.end)
}

function startOffset(node: MdNode): number | null {
	const at = node.position?.start.offset
	return typeof at === 'number' ? at : null
}

function endOffset(node: MdNode): number | null {
	const at = node.position?.end.offset
	return typeof at === 'number' ? at : null
}

function withProperties(node: MdNode, properties: Record<string, unknown>) {
	const data = (node.data ??= {})
	const current = (data.hProperties as Record<string, unknown> | undefined) ?? {}
	data.hProperties = { ...current, ...properties }
}

function isChanged(range: ProseRange): boolean {
	return range.kind === 'changed'
}

function markNode(text: string, range: ProseRange, withId: boolean): MdNode {
	const hProperties = isChanged(range)
		? { className: [CHANGED_CLASS] }
		: {
				className: [MARK_CLASS],
				dataClaim: String(range.index),
				...(withId ? { id: highlightId(range.index) } : {}),
			}
	return {
		type: 'reviewMark',
		data: { hName: 'mark', hProperties },
		children: [{ type: 'text', value: text }],
	}
}

/** By start; a changed range before a claim that starts at the same place. */
function byStart(a: ProseRange, b: ProseRange): number {
	return a.start - b.start || Number(isChanged(b)) - Number(isChanged(a))
}

/** The ranges without any claim that overlaps a changed range. */
function changedWins(ranges: ReadonlyArray<ProseRange>): ProseRange[] {
	const changed = ranges.filter(isChanged)
	if (changed.length === 0) return [...ranges]
	return ranges.filter(
		r => isChanged(r) || !changed.some(c => c.start < r.end && c.end > r.start),
	)
}

function markerNode(): MdNode {
	return {
		type: 'reviewMarker',
		data: {
			hName: 'div',
			hProperties: { id: MARKER_ID, className: ['review-marker'] },
		},
		children: [{ type: 'text', value: MARKER_TEXT }],
	}
}

/**
 * Split one text node on the highlight ranges. Returns the replacement
 * nodes, or null when nothing in the node is highlighted. `idGiven` tracks
 * which ranges already carry their id, so a quote split across two text
 * nodes gets one id.
 */
function splitTextNode(
	node: MdNode,
	ranges: ReadonlyArray<ProseRange>,
	idGiven: Set<number>,
): MdNode[] | null {
	const value = node.value ?? ''
	const s = startOffset(node)
	const e = endOffset(node)
	// escapes and entities make the value shorter than the source; skip those
	if (s === null || e === null || value.length !== e - s) return null
	const hits = ranges.filter(r => r.start < e && r.end > s).sort(byStart)
	if (hits.length === 0) return null
	const out: MdNode[] = []
	let cursor = 0
	for (const r of hits) {
		const from = Math.max(0, r.start - s)
		const to = Math.min(value.length, r.end - s)
		if (to <= from || from < cursor) continue
		if (from > cursor) out.push({ type: 'text', value: value.slice(cursor, from) })
		const claim = !isChanged(r)
		out.push(markNode(value.slice(from, to), r, claim && !idGiven.has(r.index)))
		if (claim) idGiven.add(r.index)
		cursor = to
	}
	if (cursor < value.length) out.push({ type: 'text', value: value.slice(cursor) })
	return out
}

function highlightChildren(
	parent: MdNode,
	ranges: ReadonlyArray<ProseRange>,
	idGiven: Set<number>,
) {
	if (!parent.children) return
	const next: MdNode[] = []
	for (const child of parent.children) {
		if (child.type === 'text') {
			const replaced = splitTextNode(child, ranges, idGiven)
			if (replaced) next.push(...replaced)
			else next.push(child)
			continue
		}
		highlightChildren(child, ranges, idGiven)
		next.push(child)
	}
	parent.children = next
}

/**
 * Apply the transform to a parsed tree in place. Exported for tests; the
 * page uses `reviewProsePlugin`.
 */
export function transformReviewProse(root: MdNode, options: ReviewProseOptions) {
	const { paragraphs, ranges, markerAt } = options
	if (!root.children) return
	const blocks = root.children
	const indexes = blocks.map(block => {
		const at = startOffset(block)
		return at === null ? -1 : indexAt(paragraphs, at)
	})
	blocks.forEach((block, i) => {
		const index = indexes[i] ?? -1
		if (index >= 0) withProperties(block, { dataParagraph: String(index) })
	})
	if (ranges.length > 0)
		highlightChildren(root, changedWins(ranges), new Set<number>())
	if (typeof markerAt === 'number' && markerAt > 0) {
		const at = indexes.findIndex(index => index >= markerAt)
		if (at >= 0) root.children.splice(at, 0, markerNode())
	}
}

/** A remark plugin for MarkdownContent's `remarkPlugins`. */
export function reviewProsePlugin(options: ReviewProseOptions) {
	return function reviewProse() {
		return (tree: MdNode) => {
			transformReviewProse(tree, options)
		}
	}
}
