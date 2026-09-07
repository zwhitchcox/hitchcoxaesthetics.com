import { json, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { prisma } from '#app/utils/db.server.ts'
import { getSocialMetas } from '#app/utils/seo.ts'

/**
 * Skincare guides. A guide is live only after Sarah approves it in
 * /admin/articles. With nothing approved the page does not exist.
 */
export async function loader() {
	const posts = await prisma.article.findMany({
		where: { kind: 'blog', status: 'approved', slug: { not: null } },
		orderBy: [{ publishedAt: 'desc' }],
		select: {
			slug: true,
			title: true,
			dek: true,
			publishedAt: true,
			images: {
				orderBy: { position: 'asc' },
				take: 1,
				select: { id: true, altText: true },
			},
		},
	})
	if (posts.length === 0) throw new Response('Not found', { status: 404 })
	return json({ posts })
}

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title: 'Skincare Guides | Sarah Hitchcox Aesthetics, Knoxville',
		description:
			'Plain-English skincare guides from a Knoxville RN: what firms skin, how to read an ingredient label, essential oils, acne, and hand care.',
		pathname: location.pathname,
	})

export default function BlogIndex() {
	const { posts } = useLoaderData<typeof loader>()
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
					{posts.map(post => {
						const image = post.images[0]
						return (
							<Link
								key={post.slug}
								to={`/blog/${post.slug}`}
								className="group flex flex-col overflow-hidden rounded-2xl border border-border transition hover:border-primary hover:shadow-lg"
							>
								{image ? (
									<div className="aspect-[16/10] overflow-hidden bg-muted">
										<img
											src={`/resources/article-images/${image.id}`}
											alt={image.altText ?? ''}
											loading="lazy"
											className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
										/>
									</div>
								) : null}
								<div className="flex flex-1 flex-col p-6">
									<h2 className="text-xl font-semibold text-foreground group-hover:text-primary">
										{post.title}
									</h2>
									{post.dek ? (
										<p className="mt-3 flex-1 text-muted-foreground">{post.dek}</p>
									) : null}
									<span className="mt-4 text-sm font-medium text-primary">
										Read the guide &rarr;
									</span>
								</div>
							</Link>
						)
					})}
				</div>
			</div>
		</div>
	)
}
