import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { getPost, type BlogSection } from '#app/utils/blog-posts.ts'
import { getSocialMetas } from '#app/utils/seo.ts'

export async function loader({ params }: LoaderFunctionArgs) {
	const post = getPost(params.slug ?? '')
	if (!post) throw new Response('Not found', { status: 404 })
	return json({ post })
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) =>
	getSocialMetas({
		title: data
			? `${data.post.title} | Sarah Hitchcox Aesthetics`
			: 'Skincare Guide | Sarah Hitchcox Aesthetics',
		description: data?.post.description ?? '',
		pathname: location.pathname,
	})

function Section({ section }: { section: BlogSection }) {
	if (section.type === 'h2')
		return (
			<h2 className="mt-10 text-2xl font-semibold text-foreground">
				{section.text}
			</h2>
		)
	if (section.type === 'ul')
		return (
			<ul className="mt-4 list-disc space-y-2 pl-6 text-foreground/80">
				{section.items.map(i => (
					<li key={i}>{i}</li>
				))}
			</ul>
		)
	if (section.type === 'note')
		return (
			<p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base leading-relaxed text-amber-900">
				{section.text}
			</p>
		)
	return <p className="mt-4 leading-relaxed text-foreground/80">{section.text}</p>
}

export default function BlogPost() {
	const { post } = useLoaderData<typeof loader>()

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: post.title,
		description: post.description,
		image: `https://hitchcoxaesthetics.com${post.image}`,
		datePublished: post.published,
		dateModified: post.published,
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
			{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://hitchcoxaesthetics.com' },
			{ '@type': 'ListItem', position: 2, name: 'Skincare Guides', item: 'https://hitchcoxaesthetics.com/blog' },
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
				<p className="mt-4 text-lg text-muted-foreground">{post.summary}</p>
				<p className="mt-4 text-sm text-muted-foreground">
					Written and reviewed by{' '}
					<Link to="/about" className="font-medium text-primary hover:underline">
						Sarah Hitchcox, RN, BSN
					</Link>
				</p>

				<figure className="mt-8">
					<img
						src={post.image}
						alt={post.imageAlt}
						className="max-h-[420px] w-full rounded-2xl object-cover"
					/>
				</figure>

				<div className="mt-2 text-lg">
					{post.sections.map((s, i) => (
						<Section key={i} section={s} />
					))}
				</div>

				<aside className="mt-12 rounded-2xl bg-muted/50 p-6">
					<h2 className="text-lg font-semibold text-foreground">
						Related treatments
					</h2>
					<ul className="mt-3 space-y-2">
						{post.related.map(r => (
							<li key={r.href}>
								<Link to={r.href} className="text-primary hover:underline">
									{r.label}
								</Link>
							</li>
						))}
					</ul>
					<p className="mt-4 text-sm text-muted-foreground">
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
