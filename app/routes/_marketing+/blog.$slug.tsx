import {
	json,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { getSocialMetas } from '#app/utils/seo.ts'

/** One skincare guide. Live only after Sarah approves it in /admin/articles. */
export async function loader({ params }: LoaderFunctionArgs) {
	const post = await prisma.article.findFirst({
		where: { kind: 'blog', status: 'approved', slug: params.slug ?? '' },
		select: {
			slug: true,
			title: true,
			dek: true,
			body: true,
			publishedAt: true,
			updatedAt: true,
			images: {
				orderBy: { position: 'asc' },
				select: { id: true, altText: true, caption: true },
			},
		},
	})
	if (!post) throw new Response('Not found', { status: 404 })
	return json({ post })
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) =>
	getSocialMetas({
		title: data
			? `${data.post.title} | Sarah Hitchcox Aesthetics`
			: 'Skincare Guide | Sarah Hitchcox Aesthetics',
		description: data?.post.dek ?? '',
		pathname: location.pathname,
		image: data?.post.images[0]
			? `https://hitchcoxaesthetics.com/resources/article-images/${data.post.images[0].id}`
			: undefined,
	})

export default function BlogPost() {
	const { post } = useLoaderData<typeof loader>()
	const hero = post.images[0]
	const published = post.publishedAt ?? post.updatedAt

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: post.title,
		description: post.dek ?? undefined,
		image: hero
			? `https://hitchcoxaesthetics.com/resources/article-images/${hero.id}`
			: undefined,
		datePublished: published,
		dateModified: post.updatedAt,
		author: {
			'@type': 'Person',
			name: 'Sarah Hitchcox, RN, BSN',
			url: 'https://hitchcoxaesthetics.com/about',
		},
		publisher: {
			'@type': 'MedicalBusiness',
			name: 'Sarah Hitchcox Aesthetics',
			url: 'https://hitchcoxaesthetics.com',
		},
		mainEntityOfPage: `https://hitchcoxaesthetics.com/blog/${post.slug}`,
	}

	const breadcrumb = {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{
				'@type': 'ListItem',
				position: 1,
				name: 'Home',
				item: 'https://hitchcoxaesthetics.com',
			},
			{
				'@type': 'ListItem',
				position: 2,
				name: 'Skincare Guides',
				item: 'https://hitchcoxaesthetics.com/blog',
			},
			{ '@type': 'ListItem', position: 3, name: post.title },
		],
	}

	return (
		<div className="font-poppins bg-background py-16 lg:py-24">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
			/>
			<article className="mx-auto max-w-3xl px-6 lg:px-8">
				<nav className="mb-8 text-sm text-muted-foreground">
					<Link to="/blog" className="hover:text-primary">
						Skincare Guides
					</Link>
				</nav>

				<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
					{post.title}
				</h1>
				{post.dek ? (
					<p className="mt-4 text-lg text-muted-foreground">{post.dek}</p>
				) : null}
				<p className="mt-4 text-sm text-muted-foreground">
					Written and reviewed by{' '}
					<Link to="/about" className="font-medium text-primary hover:underline">
						Sarah Hitchcox, RN, BSN
					</Link>
				</p>

				{hero ? (
					<figure className="mt-8">
						<img
							src={`/resources/article-images/${hero.id}`}
							alt={hero.altText ?? ''}
							className="max-h-[420px] w-full rounded-2xl object-cover"
						/>
						{hero.caption ? (
							<figcaption className="mt-2 text-sm text-muted-foreground">
								{hero.caption}
							</figcaption>
						) : null}
					</figure>
				) : null}

				<div className="mt-8">
					<MarkdownContent
						content={post.body}
						className="prose prose-lg prose-gray max-w-none dark:prose-invert"
					/>
				</div>

				{post.images.length > 1 ? (
					<div className="mt-10 grid gap-6 sm:grid-cols-2">
						{post.images.slice(1).map(im => (
							<figure key={im.id}>
								<img
									src={`/resources/article-images/${im.id}`}
									alt={im.altText ?? ''}
									loading="lazy"
									className="w-full rounded-2xl object-cover"
								/>
								{im.caption ? (
									<figcaption className="mt-2 text-sm text-muted-foreground">
										{im.caption}
									</figcaption>
								) : null}
							</figure>
						))}
					</div>
				) : null}

				<aside className="mt-12 rounded-2xl bg-muted/50 p-6">
					<p className="text-sm text-muted-foreground">
						Nothing here is medical advice. For a personal assessment, book a
						consultation at our{' '}
						<Link to="/bearden" className="text-primary hover:underline">
							Bearden
						</Link>{' '}
						or{' '}
						<Link to="/farragut" className="text-primary hover:underline">
							Farragut
						</Link>{' '}
						location.
					</p>
				</aside>
			</article>
		</div>
	)
}
