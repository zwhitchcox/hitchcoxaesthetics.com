/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { articleImageResolver, zoomTarget } from '#app/utils/article-images.ts'
import { MarkdownContent } from './markdown-content.tsx'

const IMAGES = [
	{ id: 'img-a', fileName: 'image-1.png', position: 0, width: 1600, height: 1067 },
	{ id: 'img-b', fileName: 'image-2.png', position: 1, width: null, height: null },
]

const BODY = `Intro.

![a test picture](images/image-1.png)
*A caption.*

![second](images/image-2.png)

![not stored yet](images/image-3.png)

![outside](https://example.com/p.jpg)`

function render(resolve?: (src: string) => any) {
	return renderToStaticMarkup(
		createElement(MarkdownContent, {
			content: BODY,
			className: 'prose',
			resolveImageSrc: resolve,
		}),
	)
}

describe('MarkdownContent pictures', () => {
	test('renders a resolved picture in place with zoom hooks and its size', () => {
		const html = render(articleImageResolver(IMAGES))
		expect(html).toMatch(
			/<p><img loading="lazy" decoding="async" class="mx-auto rounded-lg shadow-md cursor-zoom-in" src="\/resources\/article-images\/img-a" alt="a test picture" data-zoom-src="\/resources\/article-images\/img-a" width="1600" height="1067"\/>\s*<em>A caption\.<\/em><\/p>/,
		)
		// no size stored: no width or height attributes
		expect(html).toContain(
			'<img loading="lazy" decoding="async" class="mx-auto rounded-lg shadow-md cursor-zoom-in" src="/resources/article-images/img-b" alt="second" data-zoom-src="/resources/article-images/img-b"/>',
		)
	})

	test('a picture line with no stored picture renders a placeholder, never a broken image', () => {
		const html = render(articleImageResolver(IMAGES))
		expect(html).not.toContain('images/image-3.png')
		expect(html).toContain(
			'<span class="block rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-picture-placeholder="3">Picture 3: not stored yet. It is still being made.</span>',
		)
	})

	test('an outside picture is left as it is, without zoom', () => {
		const html = render(articleImageResolver(IMAGES))
		expect(html).toContain(
			'<img loading="lazy" decoding="async" class="rounded-lg shadow-md" src="https://example.com/p.jpg" alt="outside"/>',
		)
	})

	test('a plain served path from the resolver works too', () => {
		const html = render(src =>
			src === 'images/image-1.png' ? '/resources/article-images/plain' : null,
		)
		expect(html).toContain(
			'src="/resources/article-images/plain" alt="a test picture" data-zoom-src="/resources/article-images/plain"/>',
		)
	})

	test('without a resolver a writer picture line is a placeholder', () => {
		const html = render()
		expect(html).not.toContain('src="images/image-1.png"')
		expect(html).toContain('data-picture-placeholder="1"')
	})
})

describe('zoomTarget', () => {
	test('finds the tapped picture and ignores other taps', () => {
		document.body.innerHTML = `<div id="prose"><p><img data-zoom-src="/resources/article-images/img-a" alt="a test picture" src="/resources/article-images/img-a"><em>Cap</em></p><p>Text</p></div>`
		const img = document.querySelector('img')
		expect(zoomTarget(img)).toEqual({
			src: '/resources/article-images/img-a',
			alt: 'a test picture',
		})
		expect(zoomTarget(document.querySelector('em'))).toBeNull()
		expect(zoomTarget(null)).toBeNull()
	})
})
