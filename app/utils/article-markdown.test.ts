/**
 * The markdown round trip and the pure editor helpers, in node with no DOM.
 *
 * The corpus is tests/fixtures/article-bodies.json: the 85 real production
 * bodies. If Zane asks for the 12-body sample instead, these ids cover one
 * construct each (regenerate the fixture with them):
 *   cmtrp3wdz000lx1sjzg640f7d  the H1, dek, byline and picture form
 *   cmtu8gzhl001l2xmeczt18t1i  the hard-wrapped blog
 *   cmtu8gzhx001n2xme1agub5xp  the `### Sources` ordered list
 *   cmtrp3x3h0010x1sj4v1zkumj  the NAP block
 *   cmtrp3xgw0014x1sj5nf7ixer  the `---` trailer
 *   cmtrozlih000ix1sjior95zxt  the blockquote
 *   cmtvzxlzm004sb88wn46ujzkm  the `[1]` citations
 *   cmttrjymm0022ol3l2phy4tpu  `approved_usd`
 *   cmtu8gzhs001m2xmevhyzt7c6  `No. The` at a line start
 *   cmtu3wcl100062xmeqvu4exhv  an e-mail address
 *   cmtu3wckl00052xmeopmdj27b  the trailing-space body
 *   cmtrp3y0b001bx1sjm8p6qus2  a two-picture body
 */
import { Fragment, Slice, type Node } from 'prosemirror-model'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import { ReplaceStep } from 'prosemirror-transform'
import { type Decoration, type EditorView } from 'prosemirror-view'
import { describe, expect, test, vi } from 'vitest'
import { foldSelection } from '#app/components/comment-on-this.tsx'
import fixture from '#tests/fixtures/article-bodies.json'
import { firstHeading, pictureLines } from './article-edit.ts'
import {
	articleInputRules,
	articleKeymap,
	articleSchema,
	articleTextBetween,
	blockDecorations,
	blockDiff,
	changedDecoration,
	claimDecorations,
	commandActive,
	docDiffRange,
	docText,
	findDocRanges,
	linkRangeAt,
	parseArticle,
	pictureBoundaryAt,
	replaceDocRange,
	runCommand,
	serializeArticle,
	tightenLists,
} from './article-markdown.ts'
import { splitParagraphs } from './review-aid.ts'

/** The one body with three lines that end in a single space. Every markdown parser drops them. */
const TRAILING_SPACE_BODY = 'cmtu3wckl00052xmeopmdj27b'

/** review_sync.py line 157 (tools/article-writer in the pbn repo), the mini's picture line, as a JS regex. */
const MINI_PICTURE_LINE_RE =
	/^!\[[^\]]*\]\((?:\.\/)?images\/image-\d+\.\w+\)\s*$/m

const BODY =
	'## Botox basics\n\nMost people need 20 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const BODY_CHANGED =
	'## Botox basics\n\nMost people need 15 to 25 units. See [our site](https://hitchcoxaesthetics.com) and [Botox Knox](https://botoxknox.com).'
const PICTURE = '![a](images/image-1.png)\n*cap*'

const rt = (markdown: string) => serializeArticle(parseArticle(markdown))
const norm = (s: string) => s.replace(/\r\n/g, '\n').trimEnd()

function firstDifference(expected: string, actual: string): string {
	const a = expected.split('\n')
	const b = actual.split('\n')
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		if (a[i] !== b[i])
			return `line ${i + 1}: expected ${JSON.stringify(a[i])}, got ${JSON.stringify(b[i])}`
	}
	return 'no differing line'
}

const paragraph = (text: string, marks?: ReadonlyArray<string>) =>
	articleSchema.node(
		'paragraph',
		null,
		text
			? [
					articleSchema.text(
						text,
						(marks ?? []).map(m => articleSchema.mark(m)),
					),
				]
			: [],
	)
const item = (text: string) =>
	articleSchema.node('list_item', null, [paragraph(text)])
const docOf = (...blocks: Node[]) => articleSchema.node('doc', null, blocks)
const image = (src = 'images/image-1.png', alt = 'a') =>
	articleSchema.node('image', { src, alt })

function typeNames(node: Node): string[] {
	const out: string[] = []
	node.forEach(child => out.push(child.type.name))
	return out
}

/** What a decoration renders with. `type` is not in the public types; it is there at run time. */
const internals = (decoration: Decoration) =>
	(
		decoration as unknown as {
			type: { attrs: Record<string, string>; constructor: { name: string } }
		}
	).type
const attrsOf = (decoration: Decoration) => internals(decoration).attrs
/** InlineType, NodeType or WidgetType. */
const kindOf = (decoration: Decoration) =>
	internals(decoration).constructor.name

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

/** The two members of an EditorView the commands and the keymap read. */
function viewFor(state: EditorState) {
	const view = {
		composing: false,
		state,
		dispatch(tr: Transaction) {
			view.state = view.state.apply(tr)
		},
	}
	return view as unknown as EditorView & { state: EditorState }
}

function stateFor(doc: Node, from?: number, to?: number): EditorState {
	return EditorState.create({
		doc,
		selection:
			from == null ? undefined : TextSelection.create(doc, from, to ?? from),
	})
}

/** Type `text` at the end of a one-block document through the input rules plugin. */
function typeAtEnd(doc: Node, text: string): EditorState {
	const end = doc.content.size - 1
	const view = viewFor(
		EditorState.create({
			doc,
			selection: TextSelection.create(doc, end),
			plugins: [articleInputRules],
		}),
	)
	const handled = articleInputRules.props.handleTextInput!.call(
		articleInputRules,
		view,
		end,
		end,
		text,
		() => view.state.tr.insertText(text, end, end),
	)
	expect(handled).toBe(true)
	return view.state
}

function keyEvent(key: string, modifiers: Partial<KeyboardEvent> = {}) {
	return {
		key,
		keyCode: 0,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		...modifiers,
	} as KeyboardEvent
}

describe('the corpus', () => {
	test('holds the 85 real bodies', () => {
		expect(fixture).toHaveLength(85)
		expect(new Set(fixture.map(b => b.id)).size).toBe(85)
	})

	test('every real body round-trips byte for byte', () => {
		const failures: string[] = []
		for (const { id, body } of fixture) {
			const expected =
				id === TRAILING_SPACE_BODY
					? norm(body.replace(/ +$/gm, ''))
					: norm(body)
			const actual = norm(rt(body))
			if (actual !== expected)
				failures.push(`${id}: ${firstDifference(expected, actual)}`)
		}
		expect(failures, failures.join('\n')).toEqual([])
		const trailing = fixture.find(b => b.id === TRAILING_SPACE_BODY)!
		expect(norm(rt(trailing.body))).not.toBe(norm(trailing.body))
	})

	test('the round trip is a fixed point', () => {
		const moved: string[] = []
		for (const { id, body } of fixture) {
			const once = rt(body)
			if (rt(once) !== once) moved.push(id)
		}
		expect(moved).toEqual([])
	})

	test('the first heading and the picture lines survive', () => {
		for (const { body } of fixture) {
			const out = rt(body)
			expect(firstHeading(out)).toBe(firstHeading(body))
			expect(pictureLines(out)).toEqual(pictureLines(body))
		}
	})

	test('the top-level blocks are the paragraphs splitParagraphs counts', () => {
		for (const { id, body } of fixture) {
			expect(blockDecorations(parseArticle(body)).length, id).toBe(
				splitParagraphs(body).length,
			)
		}
	})
})

describe('pictures', () => {
	test('the picture pair is one paragraph', () => {
		const doc = parseArticle(PICTURE)
		expect(doc.childCount).toBe(1)
		const pair = doc.firstChild!
		expect(pair.type.name).toBe('paragraph')
		expect(typeNames(pair)).toEqual(['image', 'soft_break', 'text'])
		expect(pair.child(2).marks.map(m => m.type.name)).toEqual(['em'])
		expect(serializeArticle(doc)).toBe(PICTURE)
		expect(MINI_PICTURE_LINE_RE.test(serializeArticle(doc))).toBe(true)
	})

	test('a caption that lost its soft break gets the newline back', () => {
		const joined = docOf(
			articleSchema.node('paragraph', null, [
				image(),
				articleSchema.text('cap', [articleSchema.mark('em')]),
			]),
		)
		expect(serializeArticle(joined)).toBe(PICTURE)
		expect(
			typeNames(parseArticle(serializeArticle(joined)).firstChild!),
		).toEqual(['image', 'soft_break', 'text'])
		const spaced = docOf(
			articleSchema.node('paragraph', null, [
				image(),
				articleSchema.text(' cap'),
			]),
		)
		expect(serializeArticle(spaced)).toBe('![a](images/image-1.png)\ncap')
		const led = docOf(
			articleSchema.node('paragraph', null, [
				articleSchema.text('Hello'),
				image(),
				articleSchema.node('soft_break'),
				articleSchema.text('cap', [articleSchema.mark('em')]),
			]),
		)
		expect(serializeArticle(led)).toBe('Hello\n![a](images/image-1.png)\n*cap*')
		expect(MINI_PICTURE_LINE_RE.test(serializeArticle(led))).toBe(true)
	})

	test('pictureBoundaryAt names the two edges of the pair', () => {
		const doc = parseArticle(PICTURE)
		// 0 opens the paragraph; the image is at 1, the soft break at 2, "cap" at 3 to 5.
		expect(pictureBoundaryAt(stateFor(doc, 2))).toBe('after-image')
		expect(pictureBoundaryAt(stateFor(doc, 3))).toBe('before-caption')
		expect(pictureBoundaryAt(stateFor(doc, 4))).toBeNull()
		expect(pictureBoundaryAt(stateFor(doc, 1))).toBeNull()
		const plain = parseArticle('one\ntwo')
		expect(pictureBoundaryAt(stateFor(plain, 4))).toBeNull()
		expect(pictureBoundaryAt(stateFor(plain, 5))).toBeNull()
	})
})

describe('the escaper', () => {
	test('typed markers are escaped once and stay', () => {
		const doc = docOf(
			paragraph('1. typed'),
			paragraph('- typed'),
			paragraph('# typed'),
			articleSchema.node('bullet_list', { tight: true }, [item('# inside')]),
		)
		const out = serializeArticle(doc)
		expect(out).toBe('1\\. typed\n\n\\- typed\n\n\\# typed\n\n- \\# inside')
		const back = parseArticle(out)
		expect(typeNames(back)).toEqual([
			'paragraph',
			'paragraph',
			'paragraph',
			'bullet_list',
		])
		expect(back.child(0).textContent).toBe('1. typed')
		expect(back.child(3).textContent).toBe('# inside')
		expect(rt(out)).toBe(out)
		expect(serializeArticle(docOf(paragraph('5 * 3')))).toBe('5 \\* 3')
		expect(rt('5 \\* 3')).toBe('5 \\* 3')
	})

	test('literal characters are not escaped', () => {
		for (const text of [
			'[1]',
			'[1, 2]',
			'[Sarah: add the price]',
			'#1550',
			'Daddy & Dad',
			'approved_usd',
			'sarah@x.com',
			'https://x.y',
			'7600 Kingston Pike, #1550',
		]) {
			expect(serializeArticle(docOf(paragraph(text)))).toBe(text)
			expect(rt(text)).toBe(text)
		}
		expect(serializeArticle(docOf(paragraph('[x](y)')))).toBe('\\[x](y)')
		expect(rt('\\[x](y)')).toBe('\\[x](y)')
		const typed = parseArticle('\\[x](y)')
		expect(typed.firstChild!.textContent).toBe('[x](y)')
		expect(typed.firstChild!.firstChild!.marks).toEqual([])
	})

	test('heading text is not escaped', () => {
		expect(rt('## 1. No consultation')).toBe('## 1. No consultation')
		expect(rt('## - Two\n\n## # Three')).toBe('## - Two\n\n## # Three')
	})

	test('no autolink, no smart quotes, no HTML', () => {
		const url = parseArticle('see https://x.y now')
		expect(
			url.rangeHasMark(0, url.content.size, articleSchema.marks.link!),
		).toBe(false)
		expect(rt('see https://x.y now')).toBe('see https://x.y now')
		expect(rt('"it\'s" -- fine...')).toBe('"it\'s" -- fine...')
		expect(rt('a <b>x</b>')).toBe('a <b>x</b>')
		expect(parseArticle('a <b>x</b>').firstChild!.textContent).toBe(
			'a <b>x</b>',
		)
	})

	test('a numbered line with a paren and a tilde fence are escaped once and stay', () => {
		expect(serializeArticle(docOf(paragraph('1) first')))).toBe('1\\) first')
		expect(rt('1\\) first')).toBe('1\\) first')
		const numbered = parseArticle('1\\) first')
		expect(typeNames(numbered)).toEqual(['paragraph'])
		expect(numbered.firstChild!.textContent).toBe('1) first')

		const fence = serializeArticle(docOf(paragraph('~~~'), paragraph('next')))
		expect(fence).toBe('\\~~~\n\nnext')
		expect(rt(fence)).toBe(fence)
		expect(typeNames(parseArticle(fence))).toEqual(['paragraph', 'paragraph'])
		expect(parseArticle(fence).firstChild!.textContent).toBe('~~~')
	})

	test('spaces before a line break go, so the break stays soft', () => {
		const doc = docOf(
			articleSchema.node('paragraph', null, [
				articleSchema.text('line one  '),
				articleSchema.node('soft_break'),
				articleSchema.text('line two '),
				articleSchema.node('soft_break'),
				articleSchema.text('line three'),
			]),
		)
		const out = serializeArticle(doc)
		expect(out).toBe('line one\nline two\nline three')
		expect(rt(out)).toBe(out)
		const back = parseArticle(out)
		expect(typeNames(back.firstChild!)).toEqual([
			'text',
			'soft_break',
			'text',
			'soft_break',
			'text',
		])
		expect(parseArticle('word  \nnext').firstChild!.childCount).toBe(3)
		expect(typeNames(parseArticle('word  \nnext').firstChild!)).toContain(
			'hard_break',
		)
	})

	test('a link whose text is its address writes [text](href), and a typed autolink stays text', () => {
		const url = 'https://example.com/page'
		const link = articleSchema.marks.link!
		const doc = docOf(
			articleSchema.node('paragraph', null, [
				articleSchema.text('go to '),
				articleSchema.text(url, [link.create({ href: url })]),
			]),
		)
		const out = serializeArticle(doc)
		expect(out).toBe(`go to [${url}](${url})`)
		expect(rt(out)).toBe(out)
		const back = parseArticle(out)
		expect(back.rangeHasMark(0, back.content.size, link)).toBe(true)
		expect(back.firstChild!.textContent).toBe(`go to ${url}`)

		for (const text of [
			'visit <https://example.com> today',
			'mail <sarah@example.com>',
		]) {
			const typed = serializeArticle(docOf(paragraph(text)))
			expect(typed).toBe(text.replace('<', '\\<'))
			expect(rt(typed)).toBe(typed)
			const again = parseArticle(typed)
			expect(again.firstChild!.textContent).toBe(text)
			expect(again.rangeHasMark(0, again.content.size, link)).toBe(false)
		}
		// a tag is not an autolink
		expect(serializeArticle(docOf(paragraph('a <b>x</b>')))).toBe('a <b>x</b>')
	})

	test('leading spaces at a line start serialise fast and re-parse as one paragraph', () => {
		const largest = fixture.reduce((a, b) =>
			b.body.length > a.body.length ? b : a,
		)
		const big = parseArticle(largest.body)
		for (const lead of [' '.repeat(200), '\t'.repeat(200), ' \t'.repeat(100)]) {
			const doc = big.copy(
				big.content.append(Fragment.from(paragraph(`${lead}typed text`))),
			)
			const started = performance.now()
			const out = serializeArticle(doc)
			expect(performance.now() - started).toBeLessThan(50)
			expect(out.endsWith('\n\ntyped text')).toBe(true)
			const back = parseArticle(out)
			expect(back.childCount).toBe(big.childCount + 1)
			expect(back.lastChild!.type.name).toBe('paragraph')
			expect(back.lastChild!.textContent).toBe('typed text')
		}
		const inList = docOf(
			articleSchema.node('bullet_list', { tight: true }, [
				item(`${' '.repeat(200)}x`),
			]),
		)
		expect(serializeArticle(inList)).toBe('- x')
	})
})

describe('lists', () => {
	test('lists from the input rule and the command are tight', () => {
		const bullets = typeAtEnd(docOf(paragraph('-')), ' ')
		expect(bullets.doc.firstChild!.type.name).toBe('bullet_list')
		expect(bullets.doc.firstChild!.attrs.tight).toBe(true)
		const numbers = typeAtEnd(docOf(paragraph('1.')), ' ')
		expect(numbers.doc.firstChild!.type.name).toBe('ordered_list')
		expect(numbers.doc.firstChild!.attrs).toEqual({ order: 1, tight: true })
		const heading = typeAtEnd(docOf(paragraph('##')), ' ')
		expect(heading.doc.firstChild!.type.name).toBe('heading')
		expect(heading.doc.firstChild!.attrs.level).toBe(2)
		const quote = typeAtEnd(docOf(paragraph('>')), ' ')
		expect(quote.doc.firstChild!.type.name).toBe('blockquote')

		const doc = parseArticle('Most people need 20 units.')
		const view = viewFor(stateFor(doc, 3))
		expect(runCommand('bulletList', view)).toBe(true)
		expect(view.state.doc.firstChild!.attrs.tight).toBe(true)
		expect(serializeArticle(view.state.doc)).toBe(
			'- Most people need 20 units.',
		)

		const two = parseArticle('a\n\nb')
		const both = viewFor(stateFor(two, 1, two.content.size - 1))
		runCommand('bulletList', both)
		expect(serializeArticle(both.state.doc)).toBe('- a\n- b')

		expect(rt('+ a\n+ b')).toBe('- a\n- b')
	})
})

describe('document text', () => {
	test('docText maps every character', () => {
		const doc = parseArticle(
			'# T\n\nMost *people* need 20.\n\n![a](images/image-1.png)\n*cap*',
		)
		const { text, positions } = docText(doc)
		expect(text).toBe('T\nMost people need 20.\na cap\n')
		expect(positions).toHaveLength(text.length)
		for (let i = 0; i < text.length; i++) {
			const pos = positions[i]!
			if (text[i] === '\n' || doc.nodeAt(pos)?.type.name === 'image') continue
			expect(doc.textBetween(pos, pos + 1, '', ' ')).toBe(text[i])
		}
		expect(docText(parseArticle('Thanks,\nSarah')).text).toBe('Thanks, Sarah\n')
	})

	test('articleTextBetween reads across bold and a link', () => {
		const doc = parseArticle(
			'Most **people** need [our site](https://x.y) now.',
		)
		const range = rangeOf(doc, 'people need our site')
		expect(articleTextBetween(doc, range.from, range.to)).toBe(
			'people need our site',
		)
		const picture = parseArticle(PICTURE)
		expect(articleTextBetween(picture, 1, picture.content.size - 1)).toBe(
			'a cap',
		)
		const blocks = parseArticle('p one\n\np two')
		const across = articleTextBetween(blocks, 1, blocks.content.size - 1)
		expect(across).toBe('p one\np two')
		expect(foldSelection(across)).toBe('p one p two')
	})
})

describe('decorations', () => {
	test('findDocRanges finds a claim across bold and across a link', () => {
		const doc = parseArticle(BODY)
		const ranges = findDocRanges(doc, [
			'Most people need 20 units.',
			'See our site and Botox Knox.',
		])
		expect(ranges.map(r => r.index)).toEqual([0, 1])
		expect(articleTextBetween(doc, ranges[0]!.from, ranges[0]!.to)).toBe(
			'Most people need 20 units.',
		)
		expect(articleTextBetween(doc, ranges[1]!.from, ranges[1]!.to)).toBe(
			'See our site and Botox Knox.',
		)

		const overlap = findDocRanges(doc, [
			'Most people need 20 units.',
			'need 20 units. See our site',
		])
		expect(overlap.map(r => r.index)).toEqual([0])
		const tie = findDocRanges(doc, [
			'Most people',
			'Most people need 20 units.',
		])
		expect(tie.map(r => r.index)).toEqual([1])
		expect(findDocRanges(doc, ['Not in the text at all.'])).toEqual([])

		const curly = parseArticle('She said “yes” to it.')
		const said = findDocRanges(curly, ['said "yes" to'])
		expect(said).toHaveLength(1)
		expect(articleTextBetween(curly, said[0]!.from, said[0]!.to)).toBe(
			'said “yes” to',
		)

		const caption = parseArticle(
			'![a](images/image-1.png)\n*A caption line here*',
		)
		const cap = findDocRanges(caption, ['A caption line here'])
		expect(cap).toHaveLength(1)
		expect(articleTextBetween(caption, cap[0]!.from, cap[0]!.to)).toBe(
			'A caption line here',
		)
	})

	test('changedDecoration is the document diff and wins over a claim', () => {
		const before = parseArticle(BODY)
		const after = parseArticle(BODY_CHANGED)
		const mark = changedDecoration(before, after)!
		expect(kindOf(mark)).toBe('InlineType')
		expect(articleTextBetween(after, mark.from, mark.to)).toBe('15 to 25')
		expect(attrsOf(mark)).toEqual({ nodeName: 'mark', class: 'review-changed' })
		expect(changedDecoration(before, parseArticle(BODY))).toBeNull()
		expect(docDiffRange(before, parseArticle(BODY))).toBeNull()

		const shorter = parseArticle(BODY.replace('need 20 units', 'need units'))
		const deletion = docDiffRange(before, shorter)!
		expect(deletion.to).toBe(deletion.from)
		expect(changedDecoration(before, shorter)).toBeNull()

		const claim = 'Most people need 15 to 25 units.'
		const kept = claimDecorations(after, [claim])
		expect(kept).toHaveLength(1)
		expect(attrsOf(kept[0]!)).toEqual({
			nodeName: 'mark',
			class: 'review-mark',
			'data-claim': '0',
		})
		expect(
			claimDecorations(after, [claim], docDiffRange(before, after)),
		).toEqual([])
		const elsewhere = claimDecorations(
			after,
			['See our site and Botox Knox.'],
			docDiffRange(before, after),
		)
		expect(elsewhere).toHaveLength(1)
	})

	test('block decorations index the top-level blocks', () => {
		const doc = parseArticle('# T\n\np1\n\n- a\n- b\n\np2')
		const blocks = blockDecorations(doc)
		expect(blocks).toHaveLength(4)
		expect(blocks.map(d => attrsOf(d)['data-paragraph'])).toEqual([
			'0',
			'1',
			'2',
			'3',
		])
		expect(blocks.map(kindOf)).toEqual(Array(4).fill('NodeType'))
		doc.forEach((child, offset, index) => {
			expect(blocks[index]!.from).toBe(offset)
			expect(blocks[index]!.to).toBe(offset + child.nodeSize)
		})
	})
})

describe('external replace', () => {
	test('replaceDocRange touches only the changed blocks', () => {
		const state = stateFor(parseArticle(BODY))
		const tr = replaceDocRange(state, parseArticle(BODY_CHANGED))!
		expect(tr.steps).toHaveLength(1)
		const step = tr.steps[0] as ReplaceStep
		expect(step).toBeInstanceOf(ReplaceStep)
		expect(step.from).toBe(state.doc.firstChild!.nodeSize)
		expect(tr.doc.firstChild).toBe(state.doc.firstChild)
		expect(tr.getMeta('external')).toBe(true)
		expect(tr.getMeta('addToHistory')).toBe(false)
		expect(serializeArticle(tr.doc)).toBe(BODY_CHANGED)
		expect(replaceDocRange(state, parseArticle(BODY))).toBeNull()

		const grown = blockDiff(
			state.doc,
			parseArticle(`${BODY}\n\nA new last block.`),
		)!
		expect(grown.slice.childCount).toBe(1)
		expect(grown.from).toBe(state.doc.content.size)
		expect(grown.to).toBe(state.doc.content.size)
		expect(grown.slice.firstChild!.textContent).toBe('A new last block.')
	})
})

describe('commands', () => {
	test('the toolbar commands toggle', () => {
		const doc = parseArticle('Most people need 20 units.')
		const word = rangeOf(doc, 'people')
		const bold = viewFor(stateFor(doc, word.from, word.to))
		expect(runCommand('strong', bold)).toBe(true)
		expect(serializeArticle(bold.state.doc)).toBe(
			'Most **people** need 20 units.',
		)
		expect(commandActive('strong', bold.state)).toBe(true)
		runCommand('strong', bold)
		expect(serializeArticle(bold.state.doc)).toBe('Most people need 20 units.')
		expect(commandActive('strong', bold.state)).toBe(false)

		const title = viewFor(stateFor(parseArticle('Title'), 2))
		expect(commandActive('heading2', title.state)).toBe(false)
		runCommand('heading2', title)
		expect(serializeArticle(title.state.doc)).toBe('## Title')
		expect(commandActive('heading2', title.state)).toBe(true)
		expect(commandActive('heading3', title.state)).toBe(false)
		runCommand('heading2', title)
		expect(serializeArticle(title.state.doc)).toBe('Title')
		runCommand('heading3', title)
		expect(serializeArticle(title.state.doc)).toBe('### Title')
		expect(commandActive('heading3', title.state)).toBe(true)

		const list = viewFor(stateFor(parseArticle('Title'), 2))
		expect(commandActive('bulletList', list.state)).toBe(false)
		runCommand('bulletList', list)
		expect(serializeArticle(list.state.doc)).toBe('- Title')
		expect(commandActive('bulletList', list.state)).toBe(true)
		runCommand('bulletList', list)
		expect(serializeArticle(list.state.doc)).toBe('Title')

		const em = parseArticle('a *xyz* b')
		expect(commandActive('em', stateFor(em, 4))).toBe(true)
		expect(commandActive('em', stateFor(em, 1))).toBe(false)
		expect(commandActive('em', stateFor(em, 3, 6))).toBe(true)
	})

	test('the keymap splits a list item on Enter and opens the link row on Mod-K', () => {
		const openLink = vi.fn()
		const plugin = articleKeymap({ openLink })
		const doc = parseArticle('- one')
		const view = viewFor(stateFor(doc, doc.content.size - 3))
		expect(
			plugin.props.handleKeyDown!.call(plugin, view, keyEvent('Enter')),
		).toBe(true)
		expect(serializeArticle(view.state.doc)).toBe('- one\n- ')
		const withMeta = plugin.props.handleKeyDown!.call(
			plugin,
			view,
			keyEvent('k', { metaKey: true }),
		)
		const withCtrl = plugin.props.handleKeyDown!.call(
			plugin,
			view,
			keyEvent('k', { ctrlKey: true }),
		)
		expect([withMeta, withCtrl]).toContain(true)
		expect(openLink).toHaveBeenCalledTimes(1)
	})
})

describe('paste and links', () => {
	test('tightenLists makes every pasted list tight', () => {
		const loose = articleSchema.node('bullet_list', { tight: false }, [
			item('a'),
			articleSchema.node('list_item', null, [
				paragraph('b'),
				articleSchema.node('ordered_list', { order: 1, tight: false }, [
					item('c'),
				]),
			]),
		])
		const slice = new Slice(Fragment.from(loose), 0, 0)
		const tight = tightenLists(slice)
		let lists = 0
		tight.content.descendants(node => {
			if (
				node.type.name === 'bullet_list' ||
				node.type.name === 'ordered_list'
			) {
				lists++
				expect(node.attrs.tight).toBe(true)
			}
		})
		expect(lists).toBe(2)
		expect(tight.content.textBetween(0, tight.content.size, ' ')).toBe(
			slice.content.textBetween(0, slice.content.size, ' '),
		)
		expect(tight.openStart).toBe(0)
		expect(serializeArticle(docOf(tight.content.firstChild!))).toBe(
			'- a\n- b\n  1. c',
		)

		const plain = new Slice(Fragment.from(paragraph('x')), 0, 0)
		expect(tightenLists(plain).eq(plain)).toBe(true)
	})

	test('linkRangeAt gives the extent of the link', () => {
		const doc = parseArticle('See [our site](https://x.y) now.')
		// "See " is 1 to 4, "our site" 5 to 12, " now." 13 to 17.
		const inside = linkRangeAt(doc, 7)!
		expect(inside).toEqual({ from: 5, to: 13, href: 'https://x.y' })
		expect(articleTextBetween(doc, inside.from, inside.to)).toBe('our site')
		expect(linkRangeAt(doc, 5)).toEqual(inside)
		expect(linkRangeAt(doc, 13)).toEqual(inside)
		expect(linkRangeAt(doc, 2)).toBeNull()
		expect(linkRangeAt(doc, 15)).toBeNull()
		expect(linkRangeAt(doc, 0)).toBeNull()

		const split = parseArticle('See [our **site**](https://x.y) now.')
		expect(split.firstChild!.childCount).toBe(4)
		expect(linkRangeAt(split, 6)).toEqual({
			from: 5,
			to: 13,
			href: 'https://x.y',
		})
		expect(linkRangeAt(split, 11)).toEqual({
			from: 5,
			to: 13,
			href: 'https://x.y',
		})
	})
})
