import { describe, expect, test } from 'vitest'
import {
	articleImageResolver,
	countPictureLines,
	findArticleImage,
	imageStem,
	isPictureSrc,
	pictureNumber,
	picturesNote,
	placeholderText,
	resolveArticleImage,
	resolveArticleImageSrc,
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
