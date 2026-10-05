import {
	json,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { useEffect } from 'react'
import {
	ProductCard,
	ProductImage,
	RoutineCard,
	StepTag,
	type ProductSummary,
} from '#app/components/skincare.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	BreadcrumbJsonLd,
	FAQJsonLd,
	ServiceFAQ,
} from '#app/routes/_services+/__service-layout.tsx'
import { useBlvdUrl } from '#app/utils/blvd-context.tsx'
import { writeLastBookingServiceHint } from '#app/utils/booking-source-hints.ts'
import { getSocialMetas } from '#app/utils/seo.ts'
import {
	getSkincareProduct,
	loadSkincareProducts,
	ROUTINES,
} from '#app/utils/skincare.server.ts'

export async function loader({ params }: LoaderFunctionArgs) {
	const product = getSkincareProduct(params.slug ?? '')
	if (!product) throw new Response('Not found', { status: 404 })

	const all = loadSkincareProducts()
	const summaries: ProductSummary[] = all.map(p => ({
		slug: p.slug,
		name: p.name,
		image: p.image,
		step: p.step,
		shortDescription: p.shortDescription,
	}))
	const routines = Object.entries(ROUTINES).map(([key, r]) => ({
		key,
		...r,
		hasProduct: r.steps.some(s => s.slug === product.slug),
	}))
	// The next three products in regimen order, wrapping around.
	const index = all.findIndex(p => p.slug === product.slug)
	const related = [1, 2, 3]
		.map(n => summaries[(index + n) % summaries.length])
		.filter((p): p is ProductSummary => Boolean(p) && p!.slug !== product.slug)

	return json({ product, products: summaries, routines, related })
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
	if (!data) return [{ title: 'Not Found | Sarah Hitchcox Aesthetics' }]
	return getSocialMetas({
		title: data.product.title,
		description: data.product.metaDescription,
		pathname: location.pathname,
		image: 'https://hitchcoxaesthetics.com/img/skincare/skincare-regimen.webp',
	})
}

export default function SkincareProductPage() {
	const { product, products, routines, related } =
		useLoaderData<typeof loader>()
	const blvdUrl = useBlvdUrl()
	const bySlug = Object.fromEntries(products.map(p => [p.slug, p]))
	const tagline =
		product.tagline.charAt(0).toUpperCase() + product.tagline.slice(1)

	useEffect(() => {
		writeLastBookingServiceHint({
			label: product.name,
			path: `/skincare/${product.slug}`,
			preferredLocationId: null,
			search: 'Skincare consultation',
		})
	}, [product.name, product.slug])

	return (
		<div className="font-poppins bg-background text-foreground">
			<BreadcrumbJsonLd
				items={[
					{ name: 'Home', path: '/' },
					{ name: 'Skincare', path: '/skincare' },
					{ name: product.name, path: `/skincare/${product.slug}` },
				]}
			/>

			{/* Breadcrumb */}
			<nav className="mx-auto max-w-7xl px-6 pt-16 text-sm text-muted-foreground lg:px-8">
				<Link
					to="/"
					prefetch="intent"
					className="hover:text-foreground hover:underline"
				>
					Home
				</Link>
				<span className="mx-2">/</span>
				<Link
					to="/skincare"
					prefetch="intent"
					className="hover:text-foreground hover:underline"
				>
					Skincare
				</Link>
				<span className="mx-2">/</span>
				<span className="font-medium text-foreground">{product.name}</span>
			</nav>

			{/* Hero */}
			<section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pb-28">
				<div className="relative">
					<ProductImage
						product={product}
						eager
						className="aspect-square rounded-[2rem]"
						imgClassName="p-12 sm:p-16"
					/>
					<StepTag className="absolute left-6 top-6">{product.step}</StepTag>
					{product.texture ? (
						<div className="absolute -bottom-6 -right-2 w-32 overflow-hidden rounded-2xl bg-white shadow-xl ring-4 ring-background sm:-right-6 sm:w-44">
							<img
								src={product.texture}
								alt={`The texture of ${product.name}`}
								loading="lazy"
								className="aspect-square w-full object-contain p-2"
							/>
						</div>
					) : null}
				</div>
				<div>
					<div className="flex flex-wrap gap-2">
						{routines
							.filter(r => r.hasProduct)
							.map(r => (
								<span
									key={r.key}
									className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
								>
									<Icon
										name={r.key === 'morning' ? 'sun' : 'moon'}
										className="h-4 w-4"
									/>
									{r.label}
								</span>
							))}
					</div>
					<h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
						{product.name}
					</h1>
					<p className="mt-3 text-xl text-muted-foreground">{tagline}</p>
					{product.facts.length > 0 ? (
						<ul className="mt-6 grid gap-3 sm:grid-cols-2">
							{product.facts.map(fact => (
								<li
									key={fact}
									className="flex items-center gap-2 text-foreground"
								>
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
										<Icon name="check" className="h-3.5 w-3.5" />
									</span>
									{fact}
								</li>
							))}
						</ul>
					) : null}
					<p className="mt-6 text-lg leading-8 text-muted-foreground">
						{product.why}
					</p>
					{product.sizes ? (
						<p className="mt-4 text-sm text-muted-foreground">
							<span className="font-semibold text-foreground">Sizes:</span>{' '}
							{product.sizes}
						</p>
					) : null}
					<div className="mt-8 flex flex-col items-start gap-4">
						<a
							href={blvdUrl}
							className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
						>
							<Icon name="calendar" className="h-5 w-5" />
							Book a Free Skin Consultation
						</a>
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<Icon name="map-pin" className="h-4 w-4 shrink-0" />
							Available at our Bearden and Farragut offices
						</p>
					</div>
				</div>
			</section>

			{/* How to use */}
			{product.howTo.length > 0 ? (
				<section className="bg-muted/40 py-20 lg:py-28">
					<div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
						<div className="order-2 lg:order-1">
							<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
								Step by step
							</p>
							<h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
								How to use it
							</h2>
							<ol className="mt-8 space-y-6">
								{product.howTo.map((step, i) => (
									<li key={step} className="flex gap-4">
										<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
											{i + 1}
										</span>
										<p className="pt-1.5 text-lg leading-7 text-muted-foreground">
											{step}
										</p>
									</li>
								))}
							</ol>
						</div>
						<div className="order-1 lg:order-2">
							{product.texture ? (
								<div className="overflow-hidden rounded-[2rem] bg-white shadow-xl">
									<img
										src={product.texture}
										alt={`The texture of ${product.name}`}
										loading="lazy"
										className="aspect-[4/3] w-full object-contain p-6"
									/>
								</div>
							) : (
								<img
									src="/img/skincare/skincare-regimen.webp"
									alt="The skincare products we recommend"
									loading="lazy"
									className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-xl"
								/>
							)}
						</div>
					</div>
				</section>
			) : null}

			{/* Ingredients */}
			{product.ingredients.length > 0 ? (
				<section className="py-20 lg:py-28">
					<div className="mx-auto max-w-7xl px-6 lg:px-8">
						<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
							What is inside
						</p>
						<h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							Key ingredients
						</h2>
						<div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
							{product.ingredients.map(item => (
								<div
									key={item.name}
									className="rounded-3xl border border-border bg-card p-6 text-card-foreground"
								>
									<span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
										<Icon name="check" className="h-5 w-5" />
									</span>
									<h3 className="mt-4 font-semibold text-foreground">
										{item.name}
									</h3>
									<p className="mt-2 text-sm leading-6 text-muted-foreground">
										{item.does}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>
			) : null}

			{/* Where it fits */}
			<section className="bg-muted/40 py-20 lg:py-28">
				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					<div className="max-w-2xl">
						<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
							Your regimen
						</p>
						<h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							Where it fits in your routine
						</h2>
						<p className="mt-4 text-lg leading-8 text-muted-foreground">
							A typical regimen, step by step. Sarah Hitchcox, RN, BSN, adjusts
							it to your skin at your free consultation.
						</p>
					</div>
					<div className="mt-12 grid items-start gap-8 lg:grid-cols-2">
						{routines.map(r => (
							<RoutineCard
								key={r.key}
								label={r.label}
								icon={r.key === 'morning' ? 'sun' : 'moon'}
								steps={r.steps}
								products={bySlug}
								highlight={product.slug}
							/>
						))}
					</div>
				</div>
			</section>

			{/* FAQ */}
			{product.faq.length > 0 ? (
				<section className="py-20 lg:py-24">
					<div className="mx-auto max-w-3xl px-6 lg:px-8">
						<h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							Questions about {product.name.replace(/^sunbetter /, '')}
						</h2>
						<div className="mt-8">
							<ServiceFAQ faq={product.faq} />
						</div>
						<FAQJsonLd faq={product.faq} />
					</div>
				</section>
			) : null}

			{/* Related */}
			{related.length > 0 ? (
				<section className="bg-muted/40 py-20 lg:py-28">
					<div className="mx-auto max-w-7xl px-6 lg:px-8">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
							<h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
								More skincare we recommend
							</h2>
							<Link
								to="/skincare"
								prefetch="intent"
								className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline"
							>
								See every regimen step
								<Icon name="arrow-right" className="h-4 w-4" />
							</Link>
						</div>
						<div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
							{related.map(p => (
								<ProductCard key={p.slug} product={p} />
							))}
						</div>
					</div>
				</section>
			) : null}

			{/* Closing call to action */}
			<section className="px-6 py-24 lg:px-8">
				<div className="mx-auto flex max-w-7xl flex-col items-center gap-6 rounded-[2rem] bg-primary px-8 py-14 text-center text-primary-foreground sm:px-16">
					<h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
						Is {product.name.replace(/^sunbetter /, '')} right for you?
					</h2>
					<p className="max-w-2xl text-lg leading-8 opacity-90">
						Book a free skin consultation. We will look at your skin and build a
						regimen around it.
					</p>
					<a
						href={blvdUrl}
						className="inline-flex items-center justify-center gap-2 rounded-full bg-background px-8 py-4 font-semibold text-foreground transition hover:opacity-90"
					>
						<Icon name="calendar" className="h-5 w-5" />
						Book a Free Skin Consultation
					</a>
				</div>
			</section>
		</div>
	)
}
