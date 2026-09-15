/**
 * Pictures inside an article body.
 *
 * The writer's markdown carries picture lines like
 * `![alt](images/image-3.png)` where the publisher will place them. The
 * pictures themselves arrive as ArticleImage rows, served from
 * /resources/article-images/<id>. This module joins the two: a picture
 * src resolves to the stored picture with the same numeric stem
 * (`image-3`), else to the picture at that position. The extension is
 * never compared: the mini sends `image-3.png` as the file name with a
 * JPEG body.
 *
 * Browser-safe and pure. No DOM, no prisma. The one DOM helper,
 * `zoomTarget`, only reads an element it is given.
 */

/** A picture src the writer's markdown uses. Group 1 is the number. */
export const PICTURE_SRC_RE = /^(?:\.\/)?images\/image-(\d+)\.(?:png|jpe?g|webp)$/i

/** One picture line on its own line: `![alt](src)` with an optional title. */
const PICTURE_LINE_RE = /^[ \t]*!\[[^\]\n]*\]\([^)\n]*\)[ \t]*$/gm

/** The class `MarkdownContent` puts on a picture that opens the zoom. */
export const ZOOM_CLASS = 'cursor-zoom-in'

/** The fields a resolver needs from an ArticleImage row. */
export type ArticleImageRef = {
	id: string
	fileName: string
	position: number
	width?: number | null
	height?: number | null
}

/** What `MarkdownContent` needs for one `<img>`. */
export type ResolvedArticleImage = {
	src: string
	width: number | null
	height: number | null
}

/** The path of a stored picture. */
export function articleImageUrl(id: string): string {
	return `/resources/article-images/${id}`
}

/**
 * The number in a file name like `image-3.png`, `image-3.jpg`,
 * `images/image-3.png` or `image-3`. Null when there is none.
 */
export function imageStem(fileName: string): number | null {
	const base = fileName.split('/').pop() ?? ''
	const m = /^image-(\d+)(?:\.[a-z0-9]+)?$/i.exec(base.trim())
	if (!m) return null
	const n = Number(m[1])
	return Number.isFinite(n) ? n : null
}

/** The number N in a picture src, or null when the src is not one. */
export function pictureNumber(src: string): number | null {
	const m = PICTURE_SRC_RE.exec(src.trim())
	if (!m) return null
	const n = Number(m[1])
	return Number.isFinite(n) ? n : null
}

/** True when `src` is a writer's picture src (`images/image-N.ext`). */
export function isPictureSrc(src: string): boolean {
	return pictureNumber(src) !== null
}

/**
 * The stored picture for a picture src: the one whose file name has the
 * same numeric stem, else the one at sorted position N-1, else null. A
 * src that is not a picture src gives null.
 */
export function findArticleImage<T extends ArticleImageRef>(
	src: string,
	images: ReadonlyArray<T>,
): T | null {
	const n = pictureNumber(src)
	if (n === null) return null
	const byStem = images.find(im => imageStem(im.fileName) === n)
	if (byStem) return byStem
	const sorted = [...images].sort((a, b) => a.position - b.position)
	return sorted[n - 1] ?? null
}

function size(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.round(value)
		: null
}

/**
 * The src and pixel size for a picture src, or null when no stored
 * picture matches. The size is null when the row has none.
 */
export function resolveArticleImage(
	src: string,
	images: ReadonlyArray<ArticleImageRef>,
): ResolvedArticleImage | null {
	const image = findArticleImage(src, images)
	if (!image) return null
	const width = size(image.width)
	const height = size(image.height)
	return {
		src: articleImageUrl(image.id),
		width: width && height ? width : null,
		height: width && height ? height : null,
	}
}

/** The served path for a picture src, or null when no stored picture matches. */
export function resolveArticleImageSrc(
	src: string,
	images: ReadonlyArray<ArticleImageRef>,
): string | null {
	return resolveArticleImage(src, images)?.src ?? null
}

/**
 * A resolver bound to one article's pictures, for `MarkdownContent`'s
 * `resolveImageSrc` prop. Pass the same `images` array between renders
 * and memoize the result where it matters.
 */
export function articleImageResolver(
	images: ReadonlyArray<ArticleImageRef>,
): (src: string) => ResolvedArticleImage | null {
	return src => resolveArticleImage(src, images)
}

/** How many picture lines the body has. */
export function countPictureLines(body: string): number {
	return body.match(PICTURE_LINE_RE)?.length ?? 0
}

/** The one-line "Pictures" note for the "things to check" panel. */
export function picturesNote(pictureLines: number, imageCount: number): string {
	if (imageCount === 0) {
		return 'No pictures yet. They are being made and will show up in the text on their own.'
	}
	if (pictureLines >= 1) {
		return imageCount === 1
			? '1 picture, shown in place. Tap it to see it larger.'
			: `${imageCount} pictures, shown in place. Tap one to see it larger.`
	}
	return imageCount === 1
		? '1 picture. The writer has not placed it in the text yet, so it shows here.'
		: `${imageCount} pictures. The writer has not placed them in the text yet, so they show here.`
}

/** The text of the dashed box that stands in for a picture not stored yet. */
export function placeholderText(n: number, alt: string | null | undefined): string {
	const text = alt?.trim()
	return text ? `Picture ${n}: ${text}. It is still being made.` : `Picture ${n} is still being made.`
}

/** What the zoom overlay shows for one tapped picture. */
export type ZoomTarget = { src: string; alt: string }

/**
 * The picture under a tap inside the prose, or null. Give it
 * `event.target`. `MarkdownContent` marks each resolved picture with
 * `data-zoom-src`, so a click handler on the prose container can do
 * `const hit = zoomTarget(event.target); if (hit) setZoom(hit)`.
 */
export function zoomTarget(target: EventTarget | null): ZoomTarget | null {
	if (!target || typeof (target as Element).closest !== 'function') return null
	const img = (target as Element).closest<HTMLElement>('img[data-zoom-src]')
	if (!img) return null
	const src = img.getAttribute('data-zoom-src')
	if (!src) return null
	return { src, alt: img.getAttribute('alt') ?? '' }
}
