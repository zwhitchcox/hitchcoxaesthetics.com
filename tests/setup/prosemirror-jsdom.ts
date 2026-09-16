/**
 * jsdom has no layout: prosemirror-view's coordsAtPos and scrollIntoView
 * need these (https://github.com/jsdom/jsdom/issues/3002, #3729; the same
 * polyfills jest-remirror ships). Import this file at the top of every
 * test file that mounts an EditorView. A pure test in node does not need
 * it and must not import it (there is no `Range` there).
 */
const zeroRect = {
	top: 0,
	bottom: 0,
	left: 0,
	right: 0,
	width: 0,
	height: 0,
	x: 0,
	y: 0,
	toJSON() {
		return this
	},
}
Range.prototype.getBoundingClientRect ??= () => zeroRect as DOMRect
Range.prototype.getClientRects ??= () =>
	({
		length: 0,
		item: () => null,
		[Symbol.iterator]: function* () {},
	}) as unknown as DOMRectList
Element.prototype.scrollIntoView ??= () => {}
document.elementFromPoint ??= () => null

export {}
