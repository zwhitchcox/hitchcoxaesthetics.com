import { type MetaFunction } from '@remix-run/node'
import { Link } from '@remix-run/react'
import { blogPosts } from '#app/utils/blog-posts.ts'
import { getSocialMetas } from '#app/utils/seo.ts'

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title: 'Skincare Guides | Sarah Hitchcox Aesthetics, Knoxville',
		description:
			'Plain-English skincare guides from a Knoxville RN: what firms skin, how to read an ingredient label, essential oils, acne, and hand care.',
		pathname: location.pathname,
	})

export default function BlogIndex() {
	return (
		<div className="font-poppins bg-background py-16 lg:py-24">
			<div className="mx-auto max-w-5xl px-6 lg:px-8">
				<header className="mb-12 max-w-2xl">
					<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
						Skincare Guides
					</h1>
					<p className="mt-4 text-lg leading-relaxed text-muted-foreground">
						Straightforward answers to the questions we get asked most, written
						and reviewed by Sarah Hitchcox, RN, BSN. No product pitches, no
						miracle claims.
					</p>
				</header>

				<div className="grid gap-8 sm:grid-cols-2">
					{blogPosts.map(post => (
						<Link
							key={post.slug}
							to={`/blog/${post.slug}`}
							className="group flex flex-col overflow-hidden rounded-2xl border border-border transition hover:border-primary hover:shadow-lg"
						>
							<div className="aspect-[16/10] overflow-hidden bg-muted">
								<img
									src={post.image}
									alt={post.imageAlt}
									loading="lazy"
									className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
								/>
							</div>
							<div className="flex flex-1 flex-col p-6">
								<h2 className="text-xl font-semibold text-foreground group-hover:text-primary">
									{post.title}
								</h2>
								<p className="mt-3 flex-1 text-muted-foreground">{post.summary}</p>
								<span className="mt-4 text-sm font-medium text-primary">
									Read the guide &rarr;
								</span>
							</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	)
}
