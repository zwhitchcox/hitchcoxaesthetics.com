import { Link } from '@remix-run/react'
import ReactMarkdown, { type Options } from 'react-markdown'

/**
 * Renders markdown with Remix <Link prefetch="intent"> for internal links.
 * External links get target="_blank" and rel="noopener noreferrer".
 *
 * `remarkPlugins` lets a page change the markdown tree before it renders
 * (the phone review page wraps claims in <mark> this way). Optional.
 */
export function MarkdownContent({
	content,
	className = 'prose prose-lg prose-gray max-w-none',
	remarkPlugins,
}: {
	content: string
	className?: string
	remarkPlugins?: Options['remarkPlugins']
}) {
	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={remarkPlugins}
				components={{
					a: ({ href, children, ...props }) => {
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
					img: props => (
						// eslint-disable-next-line jsx-a11y/alt-text -- alt is always provided via {...props} from markdown source
						<img
							loading="lazy"
							decoding="async"
							className="rounded-lg shadow-md"
							{...props}
						/>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	)
}
