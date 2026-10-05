import { json, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { useEffect } from 'react'
import {
	GoogleRatingBadge,
	ReviewQuotes,
} from '#app/components/google-reviews.tsx'
import {
	ProductCard,
	RoutineCard,
	type ProductSummary,
} from '#app/components/skincare.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	FAQJsonLd,
	ServiceFAQ,
} from '#app/routes/_services+/__service-layout.tsx'
import { useBlvdUrl } from '#app/utils/blvd-context.tsx'
import { writeLastBookingServiceHint } from '#app/utils/booking-source-hints.ts'
import { getReviewHighlights } from '#app/utils/reviews.server.ts'
import { getSocialMetas } from '#app/utils/seo.ts'
import {
	loadSkincareLanding,
	loadSkincareProducts,
	ROUTINES,
} from '#app/utils/skincare.server.ts'

const TRUST = [
	{ icon: 'check', label: 'Led by a registered nurse' },
	{ icon: 'star', label: 'Free skin consultations' },
	{ icon: 'check', label: 'Medical-grade skinbetter science' },
	{ icon: 'map-pin', label: 'Bearden and Farragut offices' },
] as const

const CONCERNS: {
	title: string
	text: string
	slugs: string[]
	treatment?: { to: string; label: string }
}[] = [
	{
		title: 'Fine lines and wrinkles',
		text: 'A retinoid at night and a peptide eye cream soften the look of lines. Botox takes the deeper ones further.',
		slugs: ['alpharet-overnight-cream', 'interfuse-treatment-cream-eye'],
		treatment: { to: '/botox', label: 'Botox' },
	},
	{
		title: 'Sun damage and dull tone',
		text: 'Antioxidants by day and mineral sunscreen protect skin while it brightens. Laser clears spots that are already there.',
		slugs: [
			'alto-advanced-defense-and-repair-serum',
			'sunbetter-tone-smart-spf-75',
		],
		treatment: {
			to: '/pigmented-lesion-reduction',
			label: 'Pigmented lesion reduction',
		},
	},
	{
		title: 'Dryness and a weak barrier',
		text: 'Ceramides, cholesterol and fatty acids rebuild the skin barrier so it holds on to moisture.',
		slugs: ['trio-rebalancing-moisture-treatment'],
	},
	{
		title: 'Redness',
		text: 'Calming ingredients like bisabolol and ginger root reduce the look of redness from day to day.',
		slugs: ['alto-advanced-defense-and-repair-serum'],
	},
	{
		title: 'Tired, puffy eyes',
		text: 'Caffeine and brightening ingredients help with morning puffiness and dark circles.',
		slugs: ['interfuse-treatment-cream-eye'],
	},
	{
		title: 'Rough texture',
		text: 'Lactic acid and a retinoid smooth texture over time. Microneedling and laser build on the results.',
		slugs: ['alpharet-overnight-cream'],
		treatment: { to: '/skin-revitalization', label: 'Skin revitalization' },
	},
]

const CONSULT_STEPS = [
	{
		title: 'We look at your skin',
		text: 'Sarah looks closely at your skin and asks what you would like to change.',
	},
	{
		title: 'We build your regimen',
		text: 'A morning and evening routine with only the steps your skin needs.',
	},
	{
		title: 'We show you how',
		text: 'How much to use, in what order, and when to start each product.',
	},
	{
		title: 'You take it home',
		text: 'Pick up your products at either office, and check in with us as your skin changes.',
	},
]

export async function loader() {
	const products = loadSkincareProducts()
	const landing = loadSkincareLanding()
	const { reviews, summary } = await getReviewHighlights(3)
	const summaries: ProductSummary[] = products.map(p => ({
		slug: p.slug,
		name: p.name,
		image: p.image,
		step: p.step,
		shortDescription: p.shortDescription,
	}))
	return json({
		products: summaries,
		landing,
		routines: ROUTINES,
		reviews,
		reviewSummary: summary,
	})
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
	if (!data) return [{ title: 'Skincare | Sarah Hitchcox Aesthetics' }]
	return getSocialMetas({
		title: data.landing.title,
		description: data.landing.metaDescription,
		pathname: location.pathname,
		image: 'https://hitchcoxaesthetics.com/img/skincare/skincare-regimen.webp',
	})
}

export default function SkincarePage() {
	const { products, landing, routines, reviews, reviewSummary } =
		useLoaderData<typeof loader>()
	const blvdUrl = useBlvdUrl()
	const bySlug = Object.fromEntries(products.map(p => [p.slug, p]))

	useEffect(() => {
		writeLastBookingServiceHint({
			label: 'Skincare consultation',
			path: '/skincare',
			preferredLocationId: null,
			search: 'Skincare consultation',
		})
	}, [])

	return (
		<div className="font-poppins bg-background text-foreground">
			{/* Hero */}
			<section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-16 pt-16 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pb-24">
				<div>
					<p className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground">
						<Icon name="map-pin" className="h-4 w-4" />
						Skincare in Bearden and Farragut
					</p>
					<h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
						Skincare built around your skin
					</h1>
					<p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
						Sarah Hitchcox, RN, BSN, builds a morning and evening regimen for
						your skin and your goals, using medical-grade skinbetter science
						products. It all starts with a free skin consultation.
					</p>
					<div className="mt-8 flex flex-col gap-3 sm:flex-row">
						<a
							href={blvdUrl}
							className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
						>
							<Icon name="calendar" className="h-5 w-5" />
							Book a Free Skin Consultation
						</a>
						<a
							href="#products"
							className="inline-flex items-center justify-center rounded-full border border-border bg-card px-8 py-4 font-semibold text-card-foreground transition hover:bg-muted"
						>
							See the products
						</a>
					</div>
					<div className="mt-8">
						<GoogleRatingBadge summary={reviewSummary} />
					</div>
				</div>
				<div className="relative">
					<div className="overflow-hidden rounded-[2rem] bg-muted shadow-xl">
						<img
							src="/img/skincare/skincare-regimen.webp"
							alt="A skinbetter science regimen: AlphaRet Overnight Cream, Alto serum, sunbetter TONE SMART SPF 75, Trio moisturizer, InterFuse EYE and the sunbetter SHEER stick"
							className="aspect-[8/5] w-full object-cover"
							loading="eager"
						/>
					</div>
					<div className="absolute -bottom-6 left-6 flex items-center gap-3 rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-lg sm:left-10">
						<img
							src="/img/sarah-sq.jpg"
							alt="Sarah Hitchcox, RN, BSN"
							className="h-11 w-11 rounded-full object-cover"
						/>
						<div>
							<p className="text-sm font-semibold">Free skin consultation</p>
							<p className="text-xs text-muted-foreground">
								with Sarah Hitchcox, RN, BSN
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Trust bar */}
			<section className="bg-primary text-primary-foreground">
				<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-5 text-sm font-medium lg:px-8">
					{TRUST.map(item => (
						<span key={item.label} className="inline-flex items-center gap-2">
							<Icon name={item.icon} className="h-4 w-4" />
							{item.label}
						</span>
					))}
				</div>
			</section>

			{/* Routines */}
			<section className="bg-muted/40 py-20 lg:py-28">
				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					<div className="max-w-2xl">
						<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
							Your regimen
						</p>
						<h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							Morning and night, step by step
						</h2>
						<p className="mt-4 text-lg leading-8 text-muted-foreground">
							Every regimen is different, but most start here. Sarah adjusts
							each step to your skin at your consultation.
						</p>
					</div>
					<div className="mt-12 grid items-start gap-8 lg:grid-cols-2">
						<RoutineCard
							label={routines.morning.label}
							icon="sun"
							texture="/img/skincare/texture-alto.webp"
							steps={routines.morning.steps}
							products={bySlug}
						/>
						<RoutineCard
							label={routines.evening.label}
							icon="moon"
							texture="/img/skincare/texture-alpharet.webp"
							steps={routines.evening.steps}
							products={bySlug}
						/>
					</div>
				</div>
			</section>

			{/* Concerns */}
			<section className="py-20 lg:py-28">
				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					<div className="max-w-2xl">
						<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
							What it helps with
						</p>
						<h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							A regimen for the skin you have
						</h2>
					</div>
					<div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{CONCERNS.map(c => (
							<div
								key={c.title}
								className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground"
							>
								<div className="flex h-48 items-center justify-center bg-muted py-5">
									{c.slugs.map(slug =>
										bySlug[slug] ? (
											<Link
												key={slug}
												to={`/skincare/${slug}`}
												prefetch="intent"
												title={bySlug[slug].name}
												className="mx-3 h-full"
											>
												<img
													src={bySlug[slug].image}
													alt={bySlug[slug].name}
													loading="lazy"
													className="h-full w-auto drop-shadow-[0_14px_18px_rgba(15,23,42,0.18)] transition duration-300 hover:-translate-y-1"
												/>
											</Link>
										) : null,
									)}
								</div>
								<div className="flex flex-1 flex-col p-6">
									<h3 className="text-lg font-semibold text-foreground">
										{c.title}
									</h3>
									<p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
										{c.text}
									</p>
									<ul className="mt-4 space-y-1 text-sm font-semibold">
										{c.slugs.map(slug =>
											bySlug[slug] ? (
												<li key={slug}>
													<Link
														to={`/skincare/${slug}`}
														prefetch="intent"
														className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
													>
														{bySlug[slug].name.replace(/^sunbetter /, '')}
														<Icon name="arrow-right" className="h-3.5 w-3.5" />
													</Link>
												</li>
											) : null,
										)}
									</ul>
									{c.treatment ? (
										<p className="mt-3 text-sm text-muted-foreground">
											In the office:{' '}
											<Link
												to={c.treatment.to}
												prefetch="intent"
												className="font-semibold text-foreground underline-offset-4 hover:underline"
											>
												{c.treatment.label}
											</Link>
										</p>
									) : null}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Consultation */}
			<section className="bg-muted/40 py-20 lg:py-28">
				<div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
					<div>
						<img
							src="/img/knoxville-med-spa.webp"
							alt="A treatment room at Sarah Hitchcox Aesthetics"
							loading="lazy"
							className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-xl"
						/>
					</div>
					<div>
						<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
							Start here
						</p>
						<h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							Your free skin consultation
						</h2>
						<p className="mt-4 text-lg leading-8 text-muted-foreground">
							Skincare works best when it is chosen for your skin, not off a
							shelf. Come in to either office and leave with a plan.
						</p>
						<ol className="mt-8 space-y-6">
							{CONSULT_STEPS.map((s, i) => (
								<li key={s.title} className="flex gap-4">
									<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
										{i + 1}
									</span>
									<div>
										<p className="font-semibold text-foreground">{s.title}</p>
										<p className="text-muted-foreground">{s.text}</p>
									</div>
								</li>
							))}
						</ol>
						<a
							href={blvdUrl}
							className="mt-10 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
						>
							<Icon name="calendar" className="h-5 w-5" />
							Book a Free Skin Consultation
						</a>
					</div>
				</div>
			</section>

			{/* Products */}
			<section id="products" className="scroll-mt-20 py-20 lg:py-28">
				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					<div className="max-w-2xl">
						<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
							The products
						</p>
						<h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							The skincare we recommend
						</h2>
						<p className="mt-4 text-lg leading-8 text-muted-foreground">
							Medical-grade products from skinbetter science, chosen for real
							results with less irritation.
						</p>
					</div>
					<div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
						{products.map(p => (
							<ProductCard key={p.slug} product={p} />
						))}
					</div>
				</div>
			</section>

			{/* Reviews */}
			{reviews.length > 0 ? (
				<section className="bg-muted/40 py-20 lg:py-24">
					<div className="mx-auto max-w-7xl px-6 lg:px-8">
						<ReviewQuotes reviews={reviews} summary={reviewSummary} />
					</div>
				</section>
			) : null}

			{/* FAQ */}
			<section className="py-20 lg:py-24">
				<div className="mx-auto max-w-3xl px-6 lg:px-8">
					<h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						Skincare questions
					</h2>
					<div className="mt-8">
						<ServiceFAQ faq={landing.faq} />
					</div>
					<FAQJsonLd faq={landing.faq} />
				</div>
			</section>

			{/* Closing call to action */}
			<section className="px-6 pb-24 lg:px-8">
				<div className="mx-auto flex max-w-7xl flex-col items-center gap-6 rounded-[2rem] bg-primary px-8 py-14 text-center text-primary-foreground sm:px-16">
					<h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
						Not sure where to start?
					</h2>
					<p className="max-w-2xl text-lg leading-8 opacity-90">
						Book a free skin consultation and leave with a regimen made for your
						skin.
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
