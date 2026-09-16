import { describe, expect, test } from 'vitest'
import {
	applyPictureReplacement,
	articleImageResolver,
	countPictureLines,
	findArticleImage,
	imageDimensions,
	imageStem,
	isPictureSrc,
	isUserPictureFileName,
	pictureList,
	pictureNumber,
	picturesNote,
	placeholderText,
	resolveArticleImage,
	resolveArticleImageSrc,
	sniffImageType,
	stripLocation,
	USER_PICTURE_SRC_RE,
	userPictureFileName,
	userPictureSrcFileName,
	type ArticleImageRef,
} from './article-images.ts'

const IMAGES: ArticleImageRef[] = [
	{ id: 'img-b', fileName: 'image-2.png', position: 1, width: 1600, height: 1067 },
	{ id: 'img-a', fileName: 'image-1.png', position: 0, width: null, height: null },
	{ id: 'img-c', fileName: 'hero.jpg', position: 2 },
]

describe('imageStem', () => {
	test('reads the number from a file name with any extension', () => {
		expect(imageStem('image-1.png')).toBe(1)
		expect(imageStem('image-12.jpg')).toBe(12)
		expect(imageStem('image-3.webp')).toBe(3)
		expect(imageStem('image-4')).toBe(4)
		expect(imageStem('images/image-5.png')).toBe(5)
		expect(imageStem('IMAGE-6.PNG')).toBe(6)
	})

	test('gives null for other names', () => {
		expect(imageStem('hero.jpg')).toBeNull()
		expect(imageStem('image.png')).toBeNull()
		expect(imageStem('image-1-crop.png')).toBeNull()
		expect(imageStem('')).toBeNull()
	})
})

describe('pictureNumber and isPictureSrc', () => {
	test('matches the writer picture src with or without ./', () => {
		expect(pictureNumber('images/image-1.png')).toBe(1)
		expect(pictureNumber('./images/image-7.jpeg')).toBe(7)
		expect(pictureNumber('images/image-2.JPG')).toBe(2)
		expect(isPictureSrc('images/image-2.webp')).toBe(true)
	})

	test('isPictureSrc covers the picture Sarah added too', () => {
		expect(isPictureSrc('images/user-abc123.jpg')).toBe(true)
		expect(isPictureSrc('./images/user-abc123.webp')).toBe(true)
		expect(pictureNumber('images/user-abc123.jpg')).toBeNull()
	})

	test('does not match other paths', () => {
		expect(pictureNumber('/resources/article-images/abc')).toBeNull()
		expect(pictureNumber('https://example.com/images/image-1.png')).toBeNull()
		expect(pictureNumber('images/photo-1.png')).toBeNull()
		expect(pictureNumber('images/image-1.gif')).toBeNull()
		expect(isPictureSrc('')).toBe(false)
	})
})

describe('resolveArticleImageSrc', () => {
	test('matches on the numeric stem, never the extension', () => {
		expect(resolveArticleImageSrc('images/image-2.jpg', IMAGES)).toBe(
			'/resources/article-images/img-b',
		)
		expect(resolveArticleImageSrc('images/image-1.png', IMAGES)).toBe(
			'/resources/article-images/img-a',
		)
	})

	test('accepts the ./ prefix', () => {
		expect(resolveArticleImageSrc('./images/image-2.png', IMAGES)).toBe(
			'/resources/article-images/img-b',
		)
	})

	test('falls back to the picture at position N-1', () => {
		// no file is named image-3; the third by position is hero.jpg
		expect(resolveArticleImageSrc('images/image-3.png', IMAGES)).toBe(
			'/resources/article-images/img-c',
		)
	})

	test('gives null when nothing matches', () => {
		expect(resolveArticleImageSrc('images/image-9.png', IMAGES)).toBeNull()
		expect(resolveArticleImageSrc('images/image-1.png', [])).toBeNull()
		expect(resolveArticleImageSrc('https://example.com/a.png', IMAGES)).toBeNull()
		expect(resolveArticleImageSrc('/resources/article-images/x', IMAGES)).toBeNull()
	})

	test('findArticleImage returns the row itself', () => {
		expect(findArticleImage('images/image-2.png', IMAGES)?.id).toBe('img-b')
		expect(findArticleImage('nope.png', IMAGES)).toBeNull()
	})
})

describe('resolveArticleImage', () => {
	test('carries the stored size when both sides are known', () => {
		expect(resolveArticleImage('images/image-2.png', IMAGES)).toEqual({
			src: '/resources/article-images/img-b',
			width: 1600,
			height: 1067,
		})
	})

	test('drops the size when either side is missing', () => {
		expect(resolveArticleImage('images/image-1.png', IMAGES)).toEqual({
			src: '/resources/article-images/img-a',
			width: null,
			height: null,
		})
		expect(
			resolveArticleImage('images/image-1.png', [
				{ id: 'x', fileName: 'image-1.png', position: 0, width: 800 },
			]),
		).toEqual({ src: '/resources/article-images/x', width: null, height: null })
	})

	test('articleImageResolver binds the pictures', () => {
		const resolve = articleImageResolver(IMAGES)
		expect(resolve('images/image-1.png')?.src).toBe('/resources/article-images/img-a')
		expect(resolve('images/image-9.png')).toBeNull()
	})
})

describe('countPictureLines', () => {
	test('counts lines that are a picture and nothing else', () => {
		const body = `# Title

![one](images/image-1.png)
*Caption one.*

Text with an inline ![icon](images/image-2.png) picture does not count.

![two](./images/image-2.png "a title")

  ![three](https://example.com/p.jpg)  `
		expect(countPictureLines(body)).toBe(3)
	})

	test('zero for a body without pictures', () => {
		expect(countPictureLines('# Title\n\nJust text.')).toBe(0)
		expect(countPictureLines('')).toBe(0)
	})
})

describe('picturesNote', () => {
	test('the five copy cases', () => {
		expect(picturesNote(0, 0)).toBe(
			'No pictures yet. They are being made and will show up in the text on their own.',
		)
		expect(picturesNote(2, 0)).toBe(
			'No pictures yet. They are being made and will show up in the text on their own.',
		)
		expect(picturesNote(1, 1)).toBe(
			'1 picture, shown in place. Tap it to see it larger.',
		)
		expect(picturesNote(3, 3)).toBe(
			'3 pictures, shown in place. Tap one to see it larger.',
		)
		expect(picturesNote(0, 1)).toBe(
			'1 picture. The writer has not placed it in the text yet, so it shows here.',
		)
		expect(picturesNote(0, 2)).toBe(
			'2 pictures. The writer has not placed them in the text yet, so they show here.',
		)
	})
})

describe('placeholderText', () => {
	test('names the picture and its alt text', () => {
		expect(placeholderText(2, 'A nurse holding a syringe')).toBe(
			'Picture 2: A nurse holding a syringe. It is still being made.',
		)
		expect(placeholderText(1, '')).toBe('Picture 1 is still being made.')
		expect(placeholderText(3, null)).toBe('Picture 3 is still being made.')
	})
})

// ---------------------------------------------------------------------------
// Pictures Sarah added in the chat

const USER_IMAGES: ArticleImageRef[] = [
	{ id: 'img-a', fileName: 'image-1.png', position: 0 },
	{ id: 'img-u', fileName: 'user-ck9z1abc.jpg', position: 1, width: 640, height: 480 },
	{ id: 'img-b', fileName: 'image-2.png', position: 2 },
]

describe('user picture src', () => {
	test('USER_PICTURE_SRC_RE and userPictureSrcFileName read the file name', () => {
		expect(USER_PICTURE_SRC_RE.test('images/user-ck9z1abc.jpg')).toBe(true)
		expect(userPictureSrcFileName('images/user-ck9z1abc.jpg')).toBe('user-ck9z1abc.jpg')
		expect(userPictureSrcFileName('./images/user-ck9z1abc.png')).toBe('user-ck9z1abc.png')
		expect(userPictureSrcFileName('images/USER-CK9Z1ABC.JPEG')).toBe('USER-CK9Z1ABC.JPEG')
		expect(userPictureSrcFileName('images/user-ck9z1abc.gif')).toBeNull()
		expect(userPictureSrcFileName('images/user-.jpg')).toBeNull()
		expect(userPictureSrcFileName('images/image-1.png')).toBeNull()
		expect(userPictureSrcFileName('https://x.test/images/user-abc.jpg')).toBeNull()
	})

	test('userPictureFileName and isUserPictureFileName', () => {
		expect(userPictureFileName('ck9z1abc', 'jpeg')).toBe('user-ck9z1abc.jpg')
		expect(userPictureFileName('ck9z1abc', 'png')).toBe('user-ck9z1abc.png')
		expect(userPictureFileName('ck9z1abc', 'webp')).toBe('user-ck9z1abc.webp')
		expect(isUserPictureFileName('user-ck9z1abc.jpg')).toBe(true)
		expect(isUserPictureFileName('image-1.png')).toBe(false)
		expect(isUserPictureFileName('hero.jpg')).toBe(false)
	})

	test('findArticleImage matches a user src by the exact file name, case aside', () => {
		expect(findArticleImage('images/user-ck9z1abc.jpg', USER_IMAGES)?.id).toBe('img-u')
		expect(findArticleImage('./images/USER-CK9Z1ABC.JPG', USER_IMAGES)?.id).toBe('img-u')
		// the extension is part of the name for a user picture
		expect(findArticleImage('images/user-ck9z1abc.png', USER_IMAGES)).toBeNull()
		expect(findArticleImage('images/user-nope.jpg', USER_IMAGES)).toBeNull()
		expect(resolveArticleImage('images/user-ck9z1abc.jpg', USER_IMAGES)).toEqual({
			src: '/resources/article-images/img-u',
			width: 640,
			height: 480,
		})
	})

	test('the position fallback for a writer src skips user- rows', () => {
		// no file is named image-3; by position the third writer picture would be
		// img-b only when the user row is skipped: [img-a, img-b] has no third
		expect(findArticleImage('images/image-3.png', USER_IMAGES)).toBeNull()
		const noStems: ArticleImageRef[] = [
			{ id: 'w1', fileName: 'hero.jpg', position: 0 },
			{ id: 'u1', fileName: 'user-x1.jpg', position: 1 },
			{ id: 'w2', fileName: 'second.jpg', position: 2 },
		]
		expect(findArticleImage('images/image-2.png', noStems)?.id).toBe('w2')
	})
})

const BODY_WITH_PICTURES = [
	'# Title',
	'',
	'![A nurse](images/image-1.png)',
	'*The clinic.*',
	'',
	'Some text.',
	'',
	'![Second](./images/image-2.png "a title")',
	'',
	'More text with an inline ![icon](images/image-3.png) picture.',
	'',
	'![](https://example.com/p.jpg)',
	'',
].join('\n')

describe('pictureList', () => {
	test('numbers the picture lines in document order with alt and file', () => {
		expect(pictureList(BODY_WITH_PICTURES, USER_IMAGES)).toEqual([
			{ n: 1, alt: 'A nurse', src: 'images/image-1.png', fileName: 'image-1.png' },
			{ n: 2, alt: 'Second', src: './images/image-2.png', fileName: 'image-2.png' },
			{ n: 3, alt: '', src: 'https://example.com/p.jpg', fileName: null },
		])
	})

	test('a user picture line names its stored file; CRLF is fine', () => {
		const body = 'Text\r\n\r\n![Her photo](images/user-ck9z1abc.jpg)\r\n'
		expect(pictureList(body, USER_IMAGES)).toEqual([
			{ n: 1, alt: 'Her photo', src: 'images/user-ck9z1abc.jpg', fileName: 'user-ck9z1abc.jpg' },
		])
		expect(pictureList('No pictures here.', USER_IMAGES)).toEqual([])
	})

	test('agrees with countPictureLines', () => {
		expect(pictureList(BODY_WITH_PICTURES, [])).toHaveLength(countPictureLines(BODY_WITH_PICTURES))
	})
})

describe('applyPictureReplacement', () => {
	test('rewrites the N-th picture line and leaves the caption line alone', () => {
		const res = applyPictureReplacement(BODY_WITH_PICTURES, 1, 'user-ck9z1abc.jpg', 'Sarah at the desk')
		expect(res.ok).toBe(true)
		if (!res.ok) return
		const lines = res.markdown.split('\n')
		expect(lines[2]).toBe('![Sarah at the desk](images/user-ck9z1abc.jpg)')
		expect(lines[3]).toBe('*The clinic.*')
		expect(lines[7]).toBe('![Second](./images/image-2.png "a title")')
		expect(res.markdown.split('\n').length).toBe(BODY_WITH_PICTURES.split('\n').length)
	})

	test('an empty alt keeps the old one; the title is dropped from the rewritten line', () => {
		const res = applyPictureReplacement(BODY_WITH_PICTURES, 2, 'images/user-ck9z1abc.png', '')
		expect(res).toEqual({
			ok: true,
			markdown: BODY_WITH_PICTURES.replace(
				'![Second](./images/image-2.png "a title")',
				'![Second](images/user-ck9z1abc.png)',
			),
		})
	})

	test('out of range says how many there are', () => {
		expect(applyPictureReplacement(BODY_WITH_PICTURES, 4, 'user-x.jpg', null)).toEqual({
			ok: false,
			reason: 'no_such_picture',
			count: 3,
		})
		expect(applyPictureReplacement('No pictures.', 1, 'user-x.jpg', null)).toEqual({
			ok: false,
			reason: 'no_such_picture',
			count: 0,
		})
		expect(applyPictureReplacement(BODY_WITH_PICTURES, 0, 'user-x.jpg', null).ok).toBe(false)
	})

	test('an alt with a closing bracket cannot break the line', () => {
		const res = applyPictureReplacement('![a](images/image-1.png)', 1, 'user-x.jpg', 'odd] alt')
		expect(res).toEqual({ ok: true, markdown: '![odd  alt](images/user-x.jpg)' })
		expect(pictureList(res.ok ? res.markdown : '', [])).toHaveLength(1)
	})
})

// ---------------------------------------------------------------------------
// The bytes of an upload

const PNG_1x1 = Uint8Array.from(
	atob(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	),
	c => c.charCodeAt(0),
)

/** SOI, an APP0 segment, then a baseline frame header for 320 x 240. */
const JPEG_320x240 = Uint8Array.from([
	0xff, 0xd8,
	0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
	0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xf0, 0x01, 0x40, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
])

/** A progressive frame header (SOF2) behind a fill byte, 1024 x 768. */
const JPEG_PROGRESSIVE = Uint8Array.from([
	0xff, 0xd8, 0xff, 0xff, 0xc2, 0x00, 0x11, 0x08, 0x03, 0x00, 0x04, 0x00, 0x03,
])

function ascii(text: string) {
	return Array.from(text, c => c.charCodeAt(0))
}

const WEBP_VP8X_640x480 = Uint8Array.from([
	...ascii('RIFF'), 0x1e, 0x00, 0x00, 0x00, ...ascii('WEBP'),
	...ascii('VP8X'), 0x0a, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00,
	0x7f, 0x02, 0x00, // 639
	0xdf, 0x01, 0x00, // 479
])

const WEBP_VP8L_16x8 = Uint8Array.from([
	...ascii('RIFF'), 0x1e, 0x00, 0x00, 0x00, ...ascii('WEBP'),
	...ascii('VP8L'), 0x0a, 0x00, 0x00, 0x00,
	0x2f, 0x0f, 0xc0, 0x01, 0x00, // 15 | (7 << 14)
	0x00, 0x00, 0x00, 0x00, 0x00,
])

const WEBP_VP8_100x50 = Uint8Array.from([
	...ascii('RIFF'), 0x1e, 0x00, 0x00, 0x00, ...ascii('WEBP'),
	...ascii('VP8 '), 0x0a, 0x00, 0x00, 0x00,
	0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a,
	0x64, 0x00, 0x32, 0x00,
])

const HEIC = Uint8Array.from([
	0x00, 0x00, 0x00, 0x18, ...ascii('ftyp'), ...ascii('heic'), 0x00, 0x00, 0x00, 0x00, ...ascii('mif1'), ...ascii('heic'),
])
const HEIF_MIF1 = Uint8Array.from([
	0x00, 0x00, 0x00, 0x18, ...ascii('ftyp'), ...ascii('mif1'), 0x00, 0x00, 0x00, 0x00, ...ascii('mif1'), ...ascii('heic'),
])
const MP4 = Uint8Array.from([
	0x00, 0x00, 0x00, 0x14, ...ascii('ftyp'), ...ascii('isom'), 0x00, 0x00, 0x02, 0x00, ...ascii('isom'),
])

describe('sniffImageType', () => {
	test('reads the type from the first bytes', () => {
		expect(sniffImageType(PNG_1x1)).toBe('png')
		expect(sniffImageType(JPEG_320x240)).toBe('jpeg')
		expect(sniffImageType(WEBP_VP8X_640x480)).toBe('webp')
		expect(sniffImageType(WEBP_VP8L_16x8)).toBe('webp')
		expect(sniffImageType(HEIC)).toBe('heic')
		expect(sniffImageType(HEIF_MIF1)).toBe('heic')
	})

	test('anything else is null', () => {
		expect(sniffImageType(MP4)).toBeNull()
		expect(sniffImageType(Uint8Array.from(ascii('GIF89a')))).toBeNull()
		expect(sniffImageType(Uint8Array.from(ascii('hello, this is text renamed .jpg')))).toBeNull()
		expect(sniffImageType(new Uint8Array(0))).toBeNull()
		expect(sniffImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull()
		expect(sniffImageType(Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]))).toBeNull()
	})
})

describe('imageDimensions', () => {
	test('PNG from the IHDR chunk', () => {
		expect(imageDimensions(PNG_1x1)).toEqual({ width: 1, height: 1 })
	})

	test('JPEG from the frame header, baseline and progressive', () => {
		expect(imageDimensions(JPEG_320x240)).toEqual({ width: 320, height: 240 })
		expect(imageDimensions(JPEG_PROGRESSIVE)).toEqual({ width: 1024, height: 768 })
		// a JPEG cut before its frame header has no size
		expect(imageDimensions(JPEG_320x240.slice(0, 22))).toBeNull()
	})

	test('WebP from the VP8X, VP8L and VP8 headers', () => {
		expect(imageDimensions(WEBP_VP8X_640x480)).toEqual({ width: 640, height: 480 })
		expect(imageDimensions(WEBP_VP8L_16x8)).toEqual({ width: 16, height: 8 })
		expect(imageDimensions(WEBP_VP8_100x50)).toEqual({ width: 100, height: 50 })
	})

	test('null for HEIC, other files and cut headers', () => {
		expect(imageDimensions(HEIC)).toBeNull()
		expect(imageDimensions(MP4)).toBeNull()
		expect(imageDimensions(PNG_1x1.slice(0, 20))).toBeNull()
		expect(imageDimensions(WEBP_VP8X_640x480.slice(0, 26))).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// The location a phone puts in a photo

/** The first index of `needle` in `hay`, or -1. */
function find(hay: Uint8Array, needle: number[]): number {
	outer: for (let i = 0; i + needle.length <= hay.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (hay[i + j] !== needle[j]) continue outer
		}
		return i
	}
	return -1
}

function u32be(n: number) {
	return [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}

function u32le(n: number) {
	return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24]
}

/** A JPEG segment with its length field. */
function segment(marker: number, payload: number[]) {
	const length = payload.length + 2
	return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

/**
 * A TIFF block as a phone writes it: IFD0 with Orientation 6 and a GPSInfo
 * pointer, then the GPS IFD (a latitude reference and three rationals
 * stored outside the entries).
 */
function tiffWithGps(le: boolean) {
	const u16 = (n: number) => (le ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff])
	const u32 = (n: number) => (le ? u32le(n) : u32be(n))
	const entry = (tag: number, type: number, count: number, value: number[]) => [
		...u16(tag),
		...u16(type),
		...u32(count),
		...value,
	]
	const ifd0 = 8
	const gps = ifd0 + 2 + 2 * 12 + 4 // 38
	const latitude = gps + 2 + 2 * 12 + 4 // 68
	return [
		...ascii(le ? 'II' : 'MM'), ...u16(0x2a), ...u32(ifd0),
		...u16(2),
		...entry(0x0112, 3, 1, [...u16(6), 0, 0]),
		...entry(0x8825, 4, 1, u32(gps)),
		...u32(0),
		...u16(2),
		...entry(0x0001, 2, 2, [...ascii('N'), 0, 0, 0]),
		...entry(0x0002, 5, 3, u32(latitude)),
		...u32(0),
		...u32(35), ...u32(1), ...u32(58), ...u32(1), ...u32(1234), ...u32(100),
	]
}

const TIFF_ORIENTATION_ONLY = [
	...ascii('MM'), 0x00, 0x2a, ...u32be(8),
	0x00, 0x01,
	0x01, 0x12, 0x00, 0x03, ...u32be(1), 0x00, 0x06, 0x00, 0x00,
	...u32be(0),
]

const SOF0_320x240 = JPEG_320x240.slice(20)
/** A short scan and the end marker. */
const SCAN = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xab, 0xcd, 0xff, 0xd9]
const COMMENT = segment(0xfe, ascii('taken at home'))
const XMP = segment(0xe1, [
	...ascii('http://ns.adobe.com/xap/1.0/'), 0,
	...ascii('<x:xmpmeta><exif:GPSLatitude>35,58.1234N</exif:GPSLatitude></x:xmpmeta>'),
])

function phoneJpeg(le: boolean) {
	return Uint8Array.from([
		0xff, 0xd8,
		...segment(0xe1, [...ascii('Exif'), 0, 0, ...tiffWithGps(le)]),
		...COMMENT,
		...XMP,
		...SOF0_320x240,
		...SCAN,
	])
}

/** The tags of IFD0 in a JPEG whose first segment is the Exif APP1. */
function ifd0Tags(jpeg: Uint8Array, le: boolean): number[] {
	const tiff = 12
	const u16 = (at: number) => (le ? jpeg[at]! | (jpeg[at + 1]! << 8) : (jpeg[at]! << 8) | jpeg[at + 1]!)
	const ifd0 = tiff + 8
	const count = u16(ifd0)
	return Array.from({ length: count }, (_, k) => u16(ifd0 + 2 + k * 12))
}

describe('stripLocation', () => {
	test.each([
		['big-endian Exif', false],
		['little-endian Exif', true],
	])('a phone JPEG with %s loses its GPS, XMP and comment and keeps its orientation', (_, le) => {
		const input = phoneJpeg(le)
		const before = input.slice()
		const out = stripLocation(input)

		expect(sniffImageType(out)).toBe('jpeg')
		expect(imageDimensions(out)).toEqual({ width: 320, height: 240 })
		// the pointer tag is renamed; Orientation is still first and still 6
		expect(ifd0Tags(out, le)).toEqual([0x0112, 0xffff])
		expect(ifd0Tags(input, le)).toEqual([0x0112, 0x8825])
		expect(out[12 + 8 + 2 + 8 + (le ? 0 : 1)]).toBe(6)
		// the GPS IFD and its rationals are zero
		const tiff = 12
		expect(Array.from(out.subarray(tiff + 38, tiff + 68 + 24)).every(b => b === 0)).toBe(true)
		expect(find(out, [...(le ? u32le(1234) : u32be(1234)), ...(le ? u32le(100) : u32be(100))])).toBe(-1)
		// the comment and the XMP are gone; the frame and the scan are intact
		expect(find(out, ascii('taken at home'))).toBe(-1)
		expect(find(out, ascii('ns.adobe.com'))).toBe(-1)
		expect(find(out, ascii('GPSLatitude'))).toBe(-1)
		expect(Array.from(out.subarray(out.length - SCAN.length))).toEqual(SCAN)
		expect(out.length).toBe(input.length - COMMENT.length - XMP.length)
		// the input is untouched
		expect(input).toEqual(before)
	})

	test('a JPEG whose Exif has no GPS comes back as it is', () => {
		const plain = Uint8Array.from([
			0xff, 0xd8,
			...segment(0xe1, [...ascii('Exif'), 0, 0, ...TIFF_ORIENTATION_ONLY]),
			...SOF0_320x240,
			...SCAN,
		])
		expect(stripLocation(plain)).toEqual(plain)
		expect(stripLocation(JPEG_320x240)).toEqual(JPEG_320x240)
		expect(stripLocation(JPEG_PROGRESSIVE)).toEqual(JPEG_PROGRESSIVE)
	})

	test('an Exif segment that cannot be read is dropped whole', () => {
		const broken = Uint8Array.from([
			0xff, 0xd8,
			...segment(0xe1, [...ascii('Exif'), 0, 0, ...ascii('MM'), 0x00, 0x2a, ...u32be(4096)]),
			...SOF0_320x240,
			...SCAN,
		])
		const out = stripLocation(broken)
		expect(find(out, ascii('Exif'))).toBe(-1)
		expect(imageDimensions(out)).toEqual({ width: 320, height: 240 })
	})

	test('a PNG loses its eXIf and text chunks and nothing else', () => {
		const ihdrEnd = 8 + 4 + 4 + 13 + 4
		const chunk = (type: string, data: number[]) => [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
		const withText = Uint8Array.from([
			...PNG_1x1.subarray(0, ihdrEnd),
			...chunk('eXIf', [...ascii('MM'), 0x00, 0x2a, ...u32be(8), 0, 0]),
			...chunk('tEXt', [...ascii('Comment'), 0, ...ascii('taken at home')]),
			...chunk('zTXt', [...ascii('Comment'), 0, 0, 0x78, 0x9c]),
			...chunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii('GPSLatitude')]),
			...PNG_1x1.subarray(ihdrEnd),
		])
		expect(stripLocation(withText)).toEqual(PNG_1x1)
		expect(stripLocation(PNG_1x1)).toEqual(PNG_1x1)
		expect(imageDimensions(stripLocation(withText))).toEqual({ width: 1, height: 1 })
	})

	test('a WebP loses its EXIF and XMP chunks and the VP8X flags say so', () => {
		const chunk = (type: string, data: number[]) => [
			...ascii(type), ...u32le(data.length), ...data, ...(data.length & 1 ? [0] : []),
		]
		const body = [
			...ascii('VP8X'), ...u32le(10), 0x2c, 0x00, 0x00, 0x00, 0x7f, 0x02, 0x00, 0xdf, 0x01, 0x00,
			...chunk('EXIF', [...ascii('MM'), 0x00, 0x2a]),
			...chunk('XMP ', ascii('GPSLatitude')),
			...chunk('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, 0x64, 0x00, 0x32, 0x00]),
		]
		const input = Uint8Array.from([...ascii('RIFF'), ...u32le(4 + body.length), ...ascii('WEBP'), ...body])
		const out = stripLocation(input)

		expect(sniffImageType(out)).toBe('webp')
		expect(imageDimensions(out)).toEqual({ width: 640, height: 480 })
		expect(find(out, ascii('EXIF'))).toBe(-1)
		expect(find(out, ascii('XMP '))).toBe(-1)
		expect(find(out, ascii('GPSLatitude'))).toBe(-1)
		expect(find(out, ascii('VP8 '))).toBeGreaterThan(0)
		expect(out[20]).toBe(0x20) // the ICC flag stays; EXIF and XMP are cleared
		expect(Array.from(out.subarray(4, 8))).toEqual(u32le(out.length - 8))
		expect(out.length).toBe(input.length - (8 + 4) - (8 + 12))
		expect(stripLocation(WEBP_VP8X_640x480)).toEqual(WEBP_VP8X_640x480)
		expect(stripLocation(WEBP_VP8_100x50)).toEqual(WEBP_VP8_100x50)
	})

	test('other bytes come back as they are', () => {
		expect(stripLocation(HEIC)).toEqual(HEIC)
		expect(stripLocation(MP4)).toEqual(MP4)
		expect(stripLocation(new Uint8Array(0))).toEqual(new Uint8Array(0))
	})
})
