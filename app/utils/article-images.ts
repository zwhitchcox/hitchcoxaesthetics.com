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
 * A picture Sarah adds in the chat is stored as `user-<id>.<ext>` and its
 * line reads `![alt](images/user-<id>.<ext>)`; that src resolves by the
 * exact file name. `pictureList` and `applyPictureReplacement` are what the
 * chat's `replace_picture` tool uses. `sniffImageType` and `imageDimensions`
 * read the bytes of an upload without a decoder; `stripLocation` takes the
 * GPS position and the text blocks out of them.
 *
 * Browser-safe and pure. No DOM, no prisma, no Buffer. The one DOM helper,
 * `zoomTarget`, only reads an element it is given.
 */

/** A picture src the writer's markdown uses. Group 1 is the number. */
export const PICTURE_SRC_RE = /^(?:\.\/)?images\/image-(\d+)\.(?:png|jpe?g|webp)$/i

/** A picture src for a picture Sarah added in the chat. Group 1 is the file name. */
export const USER_PICTURE_SRC_RE =
	/^(?:\.\/)?images\/(user-[a-z0-9]+\.(?:png|jpe?g|webp))$/i

/** One picture line on its own line: `![alt](src)` with an optional title. */
const PICTURE_LINE_RE = /^[ \t]*!\[[^\]\n]*\]\([^)\n]*\)[ \t]*$/gm

/** The same line, one at a time. Group 1 is the alt text, group 2 the src (with its title, if any). */
const PICTURE_LINE_CAPTURE_RE = /^[ \t]*!\[([^\]\n]*)\]\(([^)\n]*)\)[ \t]*$/

/** The upload resource for a picture Sarah adds in the chat. */
export const ARTICLE_IMAGE_UPLOAD_ENDPOINT = '/resources/article-image-upload'
export const ARTICLE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const ARTICLE_IMAGE_UPLOAD_RATE_LIMIT = { max: 10, windowMs: 60_000 }

/** What the upload resource answers, and what the composer shows. */
export const ARTICLE_IMAGE_UPLOAD_COPY = {
	tooBig: 'That picture is over 10 MB. Choose a smaller one.',
	wrongType:
		'That file is not a picture the site can use. Choose a JPEG, PNG or WebP.',
	heic: 'That picture is HEIC. Choose JPEG or PNG, or take a screenshot of it.',
	tooMany: 'That is many pictures in one minute. Wait a moment and try again.',
	decided: 'This one is already decided. Reopen it first.',
	unreadable: 'The upload could not be read. Try again.',
} as const

/** The picture types the site stores as sent. */
export type ArticleImageType = 'jpeg' | 'png' | 'webp'

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

/** The file name in a user picture src (`images/user-<id>.<ext>`), or null. */
export function userPictureSrcFileName(src: string): string | null {
	const m = USER_PICTURE_SRC_RE.exec(src.trim())
	return m ? m[1]! : null
}

/** True for a stored file name Sarah's upload made (`user-<id>.<ext>`). */
export function isUserPictureFileName(fileName: string): boolean {
	return /^user-/i.test(fileName)
}

/** The stored file name for an upload: `user-<id>.jpg`, `.png` or `.webp`. */
export function userPictureFileName(id: string, type: ArticleImageType): string {
	return `user-${id}.${type === 'jpeg' ? 'jpg' : type}`
}

/**
 * True when `src` is a picture src the article can hold: the writer's
 * `images/image-N.ext` or Sarah's `images/user-<id>.ext`.
 */
export function isPictureSrc(src: string): boolean {
	return pictureNumber(src) !== null || userPictureSrcFileName(src) !== null
}

/**
 * The stored picture for a picture src. A user src matches the row with
 * that exact file name (case does not matter). A writer src matches the
 * row whose file name has the same numeric stem, else the writer's row at
 * sorted position N-1 (Sarah's rows are skipped there). Else null. A src
 * that is not a picture src gives null.
 */
export function findArticleImage<T extends ArticleImageRef>(
	src: string,
	images: ReadonlyArray<T>,
): T | null {
	const user = userPictureSrcFileName(src)
	if (user !== null) {
		const want = user.toLowerCase()
		return images.find(im => im.fileName.toLowerCase() === want) ?? null
	}
	const n = pictureNumber(src)
	if (n === null) return null
	const byStem = images.find(im => imageStem(im.fileName) === n)
	if (byStem) return byStem
	const sorted = images
		.filter(im => !isUserPictureFileName(im.fileName))
		.sort((a, b) => a.position - b.position)
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

// ---------------------------------------------------------------------------
// The picture lines, for the chat's replace_picture tool

/** One picture line as the chat sees it. `n` counts from 1 in document order. */
export type PictureListItem = {
	n: number
	alt: string
	src: string
	/** The stored row's file name, or null when no stored picture matches. */
	fileName: string | null
}

/** The path in a picture line's parentheses, without a title or angle brackets. */
function pictureSrcPath(inner: string): string {
	const first = inner.trim().split(/\s+/)[0] ?? ''
	return first.startsWith('<') && first.endsWith('>') ? first.slice(1, -1) : first
}

/** Every picture line of the body, in document order, numbered from 1. */
export function pictureList(
	markdown: string,
	images: ReadonlyArray<ArticleImageRef>,
): PictureListItem[] {
	const out: PictureListItem[] = []
	for (const raw of markdown.split('\n')) {
		const m = PICTURE_LINE_CAPTURE_RE.exec(raw.replace(/\r$/, ''))
		if (!m) continue
		const src = pictureSrcPath(m[2] ?? '')
		out.push({
			n: out.length + 1,
			alt: (m[1] ?? '').trim(),
			src,
			fileName: findArticleImage(src, images)?.fileName ?? null,
		})
	}
	return out
}

export type PictureReplacement =
	| { ok: true; markdown: string }
	| { ok: false; reason: 'no_such_picture'; count: number }

/**
 * Picture line number `pictureNumber` (from 1, document order) rewritten to
 * `![alt](images/<fileName>)`. An empty alt keeps the old one. The caption
 * line under it is untouched. CRLF is folded, as the server does.
 */
export function applyPictureReplacement(
	markdown: string,
	pictureNumber: number,
	fileName: string,
	alt: string | null | undefined,
): PictureReplacement {
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
	const name = fileName.trim().replace(/^(?:\.\/)?images\//i, '')
	let n = 0
	for (let i = 0; i < lines.length; i++) {
		const m = PICTURE_LINE_CAPTURE_RE.exec(lines[i] ?? '')
		if (!m) continue
		n += 1
		if (n !== pictureNumber) continue
		const oldAlt = (m[1] ?? '').trim()
		const newAlt = ((alt ?? '').trim() || oldAlt).replace(/[\]\n\r]/g, ' ')
		lines[i] = `![${newAlt}](images/${name})`
		return { ok: true, markdown: lines.join('\n') }
	}
	return { ok: false, reason: 'no_such_picture', count: n }
}

// ---------------------------------------------------------------------------
// The bytes of an upload: type and size from the headers, no decoder

function ascii(bytes: Uint8Array, at: number, length: number): string {
	let out = ''
	for (let i = at; i < at + length && i < bytes.length; i++) {
		out += String.fromCharCode(bytes[i]!)
	}
	return out
}

function u16be(bytes: Uint8Array, at: number): number {
	return ((bytes[at]! << 8) | bytes[at + 1]!) >>> 0
}

function u32be(bytes: Uint8Array, at: number): number {
	return (
		((bytes[at]! << 24) |
			(bytes[at + 1]! << 16) |
			(bytes[at + 2]! << 8) |
			bytes[at + 3]!) >>>
		0
	)
}

function u24le(bytes: Uint8Array, at: number): number {
	return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)) >>> 0
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heif', 'mif1']

/**
 * The picture type from the first bytes, never from the client's MIME type.
 * `heic` is named so the upload can refuse it with its own line. Anything
 * else gives null.
 */
export function sniffImageType(
	bytes: Uint8Array,
): ArticleImageType | 'heic' | null {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'jpeg'
	}
	if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
		return 'png'
	}
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
		return 'webp'
	}
	if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
		// the major brand, then the compatible brands to the end of the ftyp box
		const boxEnd = Math.min(bytes.length, Math.max(12, u32be(bytes, 0)))
		for (let at = 8; at + 4 <= boxEnd; at += 4) {
			if (at === 12) continue // the minor version
			if (HEIC_BRANDS.includes(ascii(bytes, at, 4).toLowerCase())) return 'heic'
		}
	}
	return null
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
	if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null
	return checked(u32be(b, 16), u32be(b, 20))
}

/** Walks the JPEG markers to the first frame header (SOF0, SOF1, SOF2, ...). */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
	let i = 2
	while (i + 3 < b.length) {
		if (b[i] !== 0xff) return null
		const marker = b[i + 1]!
		if (marker === 0xff) {
			i += 1 // a fill byte
			continue
		}
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2 // no length behind these
			continue
		}
		if (marker === 0xd9 || marker === 0xda) return null // the end, or the scan, before any frame
		const length = u16be(b, i + 2)
		if (length < 2) return null
		const isFrame =
			marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
		if (isFrame) {
			if (i + 8 >= b.length) return null
			return checked(u16be(b, i + 7), u16be(b, i + 5))
		}
		i += 2 + length
	}
	return null
}

function webpSize(b: Uint8Array): { width: number; height: number } | null {
	if (b.length < 30) return null
	const chunk = ascii(b, 12, 4)
	if (chunk === 'VP8 ') {
		// the frame tag (3 bytes), the start code 9D 01 2A, then 14-bit width and height
		if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
		return checked((b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff)
	}
	if (chunk === 'VP8L') {
		if (b[20] !== 0x2f) return null
		const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0
		return checked((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
	}
	if (chunk === 'VP8X') {
		return checked(u24le(b, 24) + 1, u24le(b, 27) + 1)
	}
	return null
}

function checked(width: number, height: number): { width: number; height: number } | null {
	return width > 0 && height > 0 && width <= 20000 && height <= 20000
		? { width, height }
		: null
}

/**
 * The pixel size from the file header: PNG IHDR, the JPEG frame header, or
 * the WebP VP8 / VP8L / VP8X header. Null when the type is not one of those
 * or the header is cut short.
 */
export function imageDimensions(
	bytes: Uint8Array,
): { width: number; height: number } | null {
	switch (sniffImageType(bytes)) {
		case 'png':
			return pngSize(bytes)
		case 'jpeg':
			return jpegSize(bytes)
		case 'webp':
			return webpSize(bytes)
		default:
			return null
	}
}

// ---------------------------------------------------------------------------
// The metadata a phone puts in a photo: take it out before the bytes are stored

/** An APP1 payload that starts with this holds XMP (`xap/1.0/` or `xmp/extension/`). */
const XMP_PREFIX = 'http://ns.adobe.com/x'

/** The Exif tag in IFD0 whose value points at the GPS IFD. */
const GPS_IFD_TAG = 0x8825

/** Bytes per Exif value type, indexed by type (1 BYTE ... 12 DOUBLE). */
const TIFF_TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8]

/** The PNG chunks that carry text or Exif. */
const PNG_TEXT_CHUNKS = ['eXIf', 'tEXt', 'zTXt', 'iTXt']

/**
 * The same picture without the fields that say where it was taken. A phone
 * photo carries the GPS position in its Exif; XMP and comment blocks can
 * carry it too. A picture that goes to a publisher under Sarah's name must
 * not. The Orientation tag stays, so the picture still turns upright.
 *
 * JPEG: the GPS IFD in the Exif segment is zeroed and its pointer tag is
 * renamed to 0xFFFF, so no reader finds it; XMP APP1 segments and COM
 * segments are dropped. An Exif segment that cannot be read is dropped
 * whole. PNG: the eXIf, tEXt, zTXt and iTXt chunks are dropped. WebP: the
 * EXIF and XMP chunks are dropped and the VP8X flags no longer claim them.
 * Other bytes come back as they are. The input is never changed.
 */
export function stripLocation(bytes: Uint8Array): Uint8Array {
	switch (sniffImageType(bytes)) {
		case 'jpeg':
			return stripJpeg(bytes)
		case 'png':
			return stripPng(bytes)
		case 'webp':
			return stripWebp(bytes)
		default:
			return bytes
	}
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
	let at = 0
	for (const p of parts) {
		out.set(p, at)
		at += p.length
	}
	return out
}

function u32le(bytes: Uint8Array, at: number): number {
	return (
		(bytes[at]! |
			(bytes[at + 1]! << 8) |
			(bytes[at + 2]! << 16) |
			(bytes[at + 3]! << 24)) >>>
		0
	)
}

/** Walks the markers before the scan, as `jpegSize` does, and rebuilds the file. */
function stripJpeg(b: Uint8Array): Uint8Array {
	const parts: Uint8Array[] = [b.subarray(0, 2)]
	let changed = false
	let i = 2
	while (i + 3 < b.length && b[i] === 0xff) {
		const marker = b[i + 1]!
		if (marker === 0xff) {
			parts.push(b.subarray(i, i + 1)) // a fill byte
			i += 1
			continue
		}
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			parts.push(b.subarray(i, i + 2)) // no length behind these
			i += 2
			continue
		}
		if (marker === 0xd9 || marker === 0xda) break // the end, or the scan: the rest is copied
		const length = u16be(b, i + 2)
		if (length < 2) break
		const end = Math.min(b.length, i + 2 + length)
		const segment = b.subarray(i, end)
		const head = ascii(b, i + 4, XMP_PREFIX.length)
		if (marker === 0xfe || (marker === 0xe1 && head.startsWith(XMP_PREFIX))) {
			changed = true // a comment, or XMP
		} else if (marker === 0xe1 && head.startsWith('Exif\0\0')) {
			const cleaned = blankGpsIfd(segment)
			if (cleaned !== segment) changed = true
			if (cleaned) parts.push(cleaned)
		} else {
			parts.push(segment)
		}
		i = end
	}
	if (!changed) return b
	parts.push(b.subarray(i))
	return concat(parts)
}

/**
 * The APP1 Exif segment with its GPS IFD zeroed and the pointer tag in IFD0
 * renamed to 0xFFFF. The other entries keep their place, so the offsets
 * still hold. Returns the segment itself when it has no GPS IFD, a copy
 * when it had one, and null when the TIFF structure cannot be read.
 */
function blankGpsIfd(segment: Uint8Array): Uint8Array | null {
	const tiff = 10 // FF E1, the length, then "Exif\0\0"
	if (segment.length < tiff + 8) return null
	const order = ascii(segment, tiff, 2)
	if (order !== 'II' && order !== 'MM') return null
	const le = order === 'II'
	const u16 = (at: number) =>
		le ? (segment[at]! | (segment[at + 1]! << 8)) >>> 0 : u16be(segment, at)
	const u32 = (at: number) => (le ? u32le(segment, at) : u32be(segment, at))
	if (u16(tiff + 2) !== 0x2a) return null
	const ifd0 = tiff + u32(tiff + 4)
	if (ifd0 + 2 > segment.length) return null
	const count = u16(ifd0)
	const entriesEnd = ifd0 + 2 + count * 12
	if (entriesEnd > segment.length) return null

	let out: Uint8Array | null = null
	for (let e = ifd0 + 2; e < entriesEnd; e += 12) {
		if (u16(e) !== GPS_IFD_TAG) continue
		const gps = tiff + u32(e + 8)
		if (gps + 2 > segment.length) return null
		const gpsEnd = gps + 2 + u16(gps) * 12
		if (gpsEnd > segment.length) return null
		out ??= segment.slice()
		for (let g = gps + 2; g < gpsEnd; g += 12) {
			// a value wider than 4 bytes sits elsewhere in the TIFF block
			const size = (TIFF_TYPE_SIZE[u16(g + 2)] ?? 0) * u32(g + 4)
			if (size <= 4) continue
			const at = tiff + u32(g + 8)
			if (at + size > segment.length) return null
			out.fill(0, at, at + size)
		}
		out.fill(0, gps, Math.min(segment.length, gpsEnd + 4)) // the entries and the next-IFD pointer
		out[e] = 0xff
		out[e + 1] = 0xff
	}
	return out ?? segment
}

function stripPng(b: Uint8Array): Uint8Array {
	const parts: Uint8Array[] = [b.subarray(0, 8)]
	let changed = false
	let i = 8
	while (i + 8 <= b.length) {
		const type = ascii(b, i + 4, 4)
		const end = Math.min(b.length, i + 12 + u32be(b, i)) // the length, the type, the data, the CRC
		if (PNG_TEXT_CHUNKS.includes(type)) changed = true
		else parts.push(b.subarray(i, end))
		i = end
		if (type === 'IEND') break
	}
	if (!changed) return b
	parts.push(b.subarray(i))
	return concat(parts)
}

function stripWebp(b: Uint8Array): Uint8Array {
	const parts: Uint8Array[] = [b.subarray(0, 12)]
	let changed = false
	let i = 12
	while (i + 8 <= b.length) {
		const type = ascii(b, i, 4)
		const size = u32le(b, i + 4)
		const end = Math.min(b.length, i + 8 + size + (size & 1)) // an odd chunk has a pad byte
		if (type === 'EXIF' || type === 'XMP ') {
			changed = true
		} else if (type === 'VP8X' && i + 8 < b.length && (b[i + 8]! & 0x0c) !== 0) {
			const chunk = b.slice(i, end)
			chunk[8] = chunk[8]! & 0xf3 // bit 3 says EXIF, bit 2 says XMP
			changed = true
			parts.push(chunk)
		} else {
			parts.push(b.subarray(i, end))
		}
		i = end
	}
	if (!changed) return b
	parts.push(b.subarray(i))
	const out = concat(parts)
	const riffSize = out.length - 8 // everything after "RIFF" and the size itself
	out[4] = riffSize & 0xff
	out[5] = (riffSize >>> 8) & 0xff
	out[6] = (riffSize >>> 16) & 0xff
	out[7] = (riffSize >>> 24) & 0xff
	return out
}
