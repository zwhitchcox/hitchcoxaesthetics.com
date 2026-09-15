import { Link } from '@remix-run/react'
import ReactMarkdown, { type Options } from 'react-markdown'
import {
	isPictureSrc,
	pictureNumber,
	placeholderText,
	ZOOM_CLASS,
	type ResolvedArticleImage,
} from '#app/utils/article-images.ts'

/**
 * Renders markdown with Remix <Link prefetch="intent"> for internal links.
 * External links get target="_blank" and rel="noopener noreferrer".
 *
 * `remarkPlugins` lets a page change the markdown tree before it renders
 * (the phone review page wraps claims in <mark> this way). Optional.
 *
 * `resolveImageSrc` maps a picture src in the markdown (the writer's
 * `images/image-N.png`) to the stored picture: a served path, or
 * `{ src, width, height }` so the page reserves the box before the
 * picture loads. Return null for a src that has no stored picture; a
 * writer's picture src then renders as a dashed placeholder, never as a
 * broken image. Every resolved picture gets `data-zoom-src`, so a click
 * handler on the container can open a zoom (see `zoomTarget`).
 */
export function MarkdownContent({
	content,
	className = 'prose prose-lg prose-gray max-w-none',
	remarkPlugins,
	unresolvedPicture = 'placeholder',
	resolveImageSrc,
}: {
	content: string
	className?: string
	remarkPlugins?: Options['remarkPlugins']
	/** What to render for a picture line with no stored picture: a note for the review pages (default), nothing on the public site. */
	unresolvedPicture?: 'placeholder' | 'hide'
	resolveImageSrc?: (src: string) => string | ResolvedArticleImage | null
}) {
	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={remarkPlugins}
				components={{
					a: ({ href, children, node: _node, ...props }) => {
						if (!href) return <a {...props}>{children}</a>

						const isInternal =
							href.startsWith('/') ||
							(!href.startsWith('http') &&
								!href.startsWith('mailto:') &&
								!href.startsWith('#'))

						if (isInternal) {
							return (
								<Link to={href} prefetch="intent" {...props}>
									{children}
								</Link>
							)
						}

						return (
							<a
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								{...props}
							>
								{children}
							</a>
						)
					},
					img: ({ src, alt, node: _node, ...props }) => {
						const original = typeof src === 'string' ? src : ''
						const found = resolveImageSrc ? resolveImageSrc(original) : null
						const resolved =
							typeof found === 'string'
								? { src: found, width: null, height: null }
								: found
						const finalSrc = resolved?.src ?? original

						if (isPictureSrc(finalSrc)) {
							// a writer's picture line with no stored picture yet
							if (unresolvedPicture === 'hide') return null
							return (
								<span
									className="block rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
									data-picture-placeholder={String(pictureNumber(finalSrc))}
								>
									{placeholderText(pictureNumber(finalSrc) ?? 0, alt)}
								</span>
							)
						}

						const zoomable = resolved !== null
						return (
							// eslint-disable-next-line jsx-a11y/alt-text -- alt comes from the markdown source
							<img
								loading="lazy"
								decoding="async"
								className={
									zoomable
										? `rounded-lg shadow-md mx-auto ${ZOOM_CLASS}`
										: 'rounded-lg shadow-md'
								}
								src={finalSrc}
								alt={alt}
								{...(zoomable ? { 'data-zoom-src': finalSrc } : {})}
								{...(resolved?.width && resolved.height
									? { width: resolved.width, height: resolved.height }
									: {})}
								{...props}
							/>
						)
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	)
}
