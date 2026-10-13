/**
 * Masseter Botox, a page designed on its own rather than the shared service
 * template. The facts that other pages reuse (name, meta, photos, FAQ) stay
 * in content/injectables/botox/masseter.md; the copy and layout live here.
 */
import { json, type LinksFunction, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { useEffect, type ReactNode } from 'react'
import { BeforeAfterSlider } from '#app/components/before-after-slider.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	BreadcrumbJsonLd,
	FAQJsonLd,
	ServiceFAQ,
	ServiceJsonLd,
} from '#app/routes/_services+/__service-layout.tsx'
import { useBlvdUrl } from '#app/utils/blvd-context.tsx'
import { writeLastBookingServiceHint } from '#app/utils/booking-source-hints.ts'
import { cn } from '#app/utils/misc.tsx'
import { PhoneLink, usePhone } from '#app/utils/phone-context.tsx'
import {
	getReviewHighlights,
	getReviewsMatching,
} from '#app/utils/reviews.server.ts'
import { getSocialMetas } from '#app/utils/seo.ts'
import {
	FIRST_VISIT_OFFER,
	PUBLIC_SERVICE_PRICING,
} from '#app/utils/service-pricing.ts'
import {
	getAncestors,
	getPage,
	getSiblings,
} from '#app/utils/site-pages.server.ts'
import { type ServicePageSection } from '#app/utils/section-types.ts'

const PATH = 'botox/masseter'

const INLINE_LINK =
	'font-medium text-foreground underline decoration-gold/60 underline-offset-4 hover:decoration-gold'

export const links: LinksFunction = () => [
	{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
	{
		rel: 'preconnect',
		href: 'https://fonts.gstatic.com',
		crossOrigin: 'anonymous',
	},
	{
		rel: 'stylesheet',
		href: 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display:ital@0;1&display=swap',
	},
]

export async function loader() {
	const page = getPage(PATH)
	if (!page?.enabled) throw new Response('Not found', { status: 404 })

	const [{ reviews: recent, summary }, jaw] = await Promise.all([
		getReviewHighlights(3),
		getReviewsMatching(/masseter|jaw|tmj|clench|grind/i, 3),
	])
	// Reviews about this treatment first, then recent five-star reviews.
	const reviews = [
		...jaw,
		...recent.filter(r => !jaw.some(j => j.id === r.id)),
	].slice(0, 3)
	// The hero quote: the shortest review that names the treatment.
	const heroQuote =
		jaw
			.filter(r => /masseter/i.test(r.comment))
			.sort((a, b) => a.comment.length - b.comment.length)[0] ?? null

	const faq =
		page.sections?.find(
			(s): s is Extract<ServicePageSection, { type: 'faq-accordion' }> =>
				s.type === 'faq-accordion',
		)?.items ?? []

	return json({
		name: page.name,
		title: page.title,
		description: page.metaDescription,
		pairs: page.heroImages ?? [],
		faq,
		search: [page.name, ...getAncestors(PATH).map(a => a.name)].join(' '),
		siblings: getSiblings(PATH).map(s => ({ name: s.name, path: s.path })),
		reviews,
		heroQuote,
		summary,
	})
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
	if (!data) return [{ title: 'Not Found | Sarah Hitchcox Aesthetics' }]
	return getSocialMetas({
		title: data.title,
		description: data.description,
		pathname: location.pathname,
	})
}

/** "Jordan Perry" becomes "Jordan P." */
function shortName(name: string) {
	const [first = '', ...rest] = name.trim().split(/\s+/)
	const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
	const last = rest.at(-1)
	return last ? `${cap(first)} ${cap(last).charAt(0)}.` : cap(first)
}

function Stars({ className }: { className?: string }) {
	return (
		<span className={cn('flex gap-0.5 text-gold', className)} aria-hidden>
			{[0, 1, 2, 3, 4].map(i => (
				<svg key={i} viewBox="0 0 24 24" className="h-4 w-4 fill-current">
					<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.5 6.6-.8z" />
				</svg>
			))}
		</span>
	)
}

function CallButton({ className }: { className?: string }) {
	const phone = usePhone()
	return (
		<a
			href={`tel:${phone.raw}`}
			className={cn(
				'inline-flex items-center justify-center gap-2 rounded-full border px-7 py-4 font-semibold transition',
				className,
			)}
		>
			<Icon name="phone" className="h-5 w-5" />
			{phone.formatted}
		</a>
	)
}

function Eyebrow({ children }: { children: ReactNode }) {
	return (
		<p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
			{children}
		</p>
	)
}

function SectionTitle({
	eyebrow,
	title,
	children,
	center = false,
}: {
	eyebrow: string
	title: string
	children?: ReactNode
	center?: boolean
}) {
	return (
		<div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
			<Eyebrow>{eyebrow}</Eyebrow>
			<h2 className="mt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl">
				{title}
			</h2>
			{children ? (
				<p className="mt-5 text-lg leading-8 text-muted-foreground">
					{children}
				</p>
			) : null}
		</div>
	)
}

function BookButton({
	href,
	className,
	children = 'Book a free consultation',
}: {
	href: string
	className?: string
	children?: ReactNode
}) {
	return (
		<a
			href={href}
			className={cn(
				'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl',
				className,
			)}
		>
			<Icon name="calendar" className="h-5 w-5" />
			{children}
		</a>
	)
}

const SIGNS = [
	'A sore or tired jaw in the morning',
	'Headaches at the temples',
	'Worn, chipped or flat teeth',
	'Someone hears you grind at night',
]

const REASONS = [
	{
		key: 'slim',
		title: 'Slim a square jaw',
		text: 'A strong masseter can make your lower face look wide, even when you are slim. As the muscle relaxes it gets smaller, and the angle of your jaw softens into a more tapered, V-shaped line.',
		points: [
			'Softer jaw angle',
			'Slimmer lower face',
			'No surgery and no downtime',
		],
		icon: (
			<svg
				viewBox="0 0 24 24"
				className="h-7 w-7"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
			>
				<path
					d="M6 4c-.7 3.5-.6 7 .6 10 1.3 3.3 3.3 5.5 5.4 6 2.1-.5 4.1-2.7 5.4-6 1.2-3 1.3-6.5.6-10"
					strokeLinecap="round"
				/>
				<path
					d="M8.5 15.5 12 18l3.5-2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		),
	},
	{
		key: 'clench',
		title: 'Ease clenching and grinding',
		text: 'When you clench or grind, the masseter does the work, often while you sleep. Botox lowers the force of the strongest clenches, so your jaw and your teeth get a rest.',
		points: [
			'Less jaw soreness',
			'Less clenching at night',
			'Less force on your teeth',
		],
		icon: (
			<svg
				viewBox="0 0 24 24"
				className="h-7 w-7"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
			>
				<path
					d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
					strokeLinejoin="round"
				/>
				<path
					d="M15 4.5h3l-3 3h3M18.5 9h2l-2 2h2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		),
	},
]

const STEPS = [
	{
		title: 'Free consultation',
		text: 'Sarah checks your jaw, asks about clenching and your goals, and tells you your units and your price.',
	},
	{
		title: 'About 15 minutes',
		text: 'A few small injections on each side. Most people say it feels like a quick pinch.',
	},
	{
		title: 'Back to your day',
		text: 'No downtime. You can talk, eat and smile normally right away.',
	},
]

const TIMELINE = [
	{
		when: 'Day 1',
		title: 'Treatment',
		text: 'About 15 minutes, then back to your day.',
	},
	{
		when: 'Weeks 1 to 2',
		title: 'Clenching eases',
		text: 'Your jaw starts to relax, and clenching and grinding calm down.',
	},
	{
		when: 'Weeks 4 to 8',
		title: 'Slimming shows',
		text: 'The muscle gets smaller and your jawline looks softer.',
	},
	{
		when: 'Month 3',
		title: 'Full result',
		text: 'The full slimming effect, like the photos above.',
	},
	{
		when: 'Months 4 to 6',
		title: 'Touch-up time',
		text: 'Results fade slowly. Many people find they last longer after a few treatments.',
	},
]

/** Where the masseter sits on the first before photo (1053 x 1053 px). */
const MUSCLES = [
	{
		cx: 334,
		cy: 708,
		tilt: -8,
		dots: [
			[326, 720],
			[358, 754],
			[330, 784],
		],
	},
	{
		cx: 704,
		cy: 708,
		tilt: 8,
		dots: [
			[712, 720],
			[680, 754],
			[708, 784],
		],
	},
]

export default function MasseterBotoxPage() {
	const {
		name,
		description,
		faq,
		pairs,
		search,
		siblings,
		reviews,
		heroQuote,
		summary,
	} = useLoaderData<typeof loader>()
	const blvdUrl = useBlvdUrl()
	const hero = pairs[0]
	const rating = summary.averageRating.toFixed(1)
	const reviewCount = `${summary.totalReviews}+`

	useEffect(() => {
		writeLastBookingServiceHint({
			label: name,
			path: `/${PATH}`,
			preferredLocationId: null,
			search,
		})
	}, [name, search])

	return (
		<div className="bg-background font-['DM_Sans',ui-sans-serif,system-ui,sans-serif] text-foreground">
			<ServiceJsonLd
				name={name}
				description={description}
				url={`https://hitchcoxaesthetics.com/${PATH}`}
			/>
			<BreadcrumbJsonLd
				items={[
					{ name: 'Home', path: '/' },
					{ name: 'Injectables', path: '/injectables' },
					{ name: 'Botox', path: '/botox' },
					{ name, path: `/${PATH}` },
				]}
			/>
			{faq.length > 0 ? <FAQJsonLd faq={faq} /> : null}

			{/* Hero */}
			<section className="relative overflow-hidden bg-cream">
				<div
					aria-hidden
					className="pointer-events-none absolute -right-32 -top-32 h-[32rem] w-[32rem] rounded-full bg-gold/15 blur-3xl"
				/>
				<div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-24 pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8 lg:pb-32 lg:pt-28">
					<div>
						<nav className="text-sm text-muted-foreground">
							<Link
								to="/"
								prefetch="intent"
								className="hover:text-foreground hover:underline"
							>
								Home
							</Link>
							<span className="mx-2">/</span>
							<Link
								to="/botox"
								prefetch="intent"
								className="hover:text-foreground hover:underline"
							>
								Botox
							</Link>
							<span className="mx-2">/</span>
							<span className="text-foreground">{name}</span>
						</nav>
						<p className="mt-8 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-background/70 px-4 py-1.5 text-sm font-medium text-foreground backdrop-blur">
							<span className="h-2 w-2 rounded-full bg-gold" />
							Sarah Hitchcox, RN, BSN · Knoxville, TN
						</p>
						<h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
							Masseter Botox
							<span className="mt-3 block text-3xl italic leading-tight text-muted-foreground sm:text-4xl lg:text-[2.6rem]">
								for a slimmer jaw and a calmer bite
							</span>
						</h1>
						<p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
							A few quick injections relax the strong chewing muscle at the back
							of your jaw. Your face looks softer and more tapered, and
							clenching and grinding often ease.
						</p>
						<div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
							<BookButton href={blvdUrl} />
							<CallButton className="border-border bg-background text-foreground hover:border-foreground/40" />
						</div>
						<div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
							<Stars />
							<span>
								<span className="font-semibold text-foreground">{rating}</span>{' '}
								from {reviewCount} Google reviews
							</span>
						</div>
						{heroQuote ? (
							<figure className="mt-6 max-w-xl border-l-2 border-gold pl-5">
								<blockquote className="italic leading-7 text-foreground">
									“{heroQuote.comment}”
								</blockquote>
								<figcaption className="mt-2 text-sm text-muted-foreground">
									{shortName(heroQuote.reviewerName)}, Google review
								</figcaption>
							</figure>
						) : null}
					</div>

					{hero ? (
						<figure className="relative">
							<BeforeAfterSlider
								before={hero.before}
								after={hero.after}
								alt="Masseter Botox result"
								eager
								hint
								className="aspect-[4/5] rounded-[2rem] bg-gradient-to-b from-background to-muted shadow-2xl ring-1 ring-border"
							/>
							<figcaption className="mt-4 text-center text-sm text-muted-foreground">
								Drag to compare · Allergan trial patient, 72 units of Botox, day
								90
							</figcaption>
						</figure>
					) : null}
				</div>
			</section>

			{/* Trust strip */}
			<section className="border-b border-border bg-background">
				<ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-4 px-6 py-7 text-sm font-medium text-foreground lg:grid-cols-4 lg:px-8">
					{[
						['clock', 'About 15 minutes'],
						['check', 'No downtime'],
						[
							'star',
							`${PUBLIC_SERVICE_PRICING.botox.display.replace('/unit', '')} per unit, ${FIRST_VISIT_OFFER}`,
						],
						['map-pin', 'Bearden and Farragut offices'],
					].map(([icon, text]) => (
						<li
							key={text}
							className="flex items-center gap-2.5 lg:justify-center"
						>
							<Icon
								name={icon as 'star'}
								className="h-4 w-4 shrink-0 text-gold"
							/>
							{text}
						</li>
					))}
				</ul>
			</section>

			{/* Two reasons */}
			<section className="py-24 lg:py-32">
				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					<SectionTitle
						eyebrow="Why people choose it"
						title="Two reasons to treat the masseter"
						center
					/>
					<div className="mt-16 grid gap-6 lg:grid-cols-2">
						{REASONS.map(reason => (
							<div
								key={reason.title}
								className="rounded-[2rem] border border-border bg-card p-8 text-card-foreground lg:p-12"
							>
								{reason.key === 'slim' && pairs[1] ? (
									<div className="mb-8 grid grid-cols-2 gap-2 overflow-hidden rounded-2xl">
										{(['before', 'after'] as const).map(side => (
											<div
												key={side}
												className="relative h-44 overflow-hidden bg-gradient-to-b from-cream to-muted sm:h-52"
											>
												<img
													src={pairs[1]![side]}
													alt={`Jawline ${side} masseter Botox, Allergan trial patient`}
													loading="lazy"
													className="h-full w-full origin-[50%_85%] scale-[1.35] object-cover"
												/>
												<span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
													{side}
												</span>
											</div>
										))}
									</div>
								) : null}
								{reason.key === 'clench' ? (
									<div className="mb-8 rounded-2xl bg-cream p-6">
										<p className="text-sm font-semibold uppercase tracking-wider text-gold">
											Signs you clench or grind
										</p>
										<ul className="mt-4 grid gap-3 sm:grid-cols-2">
											{SIGNS.map(sign => (
												<li
													key={sign}
													className="flex gap-2.5 text-sm leading-6 text-foreground"
												>
													<span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
													{sign}
												</li>
											))}
										</ul>
									</div>
								) : null}
								<div className="flex items-center gap-4">
									<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold">
										{reason.icon}
									</span>
									<h3 className="font-display text-3xl">{reason.title}</h3>
								</div>
								<p className="mt-4 text-lg leading-8 text-muted-foreground">
									{reason.text}
								</p>
								<ul className="mt-7 space-y-3">
									{reason.points.map(point => (
										<li
											key={point}
											className="flex items-center gap-3 font-medium"
										>
											<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
												<Icon name="check" className="h-3.5 w-3.5" />
											</span>
											{point}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Where it goes */}
			<section className="bg-cream py-24 lg:py-32">
				<div className="mx-auto grid max-w-7xl items-center gap-14 px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
					{hero ? (
						<figure>
							<div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-background to-muted shadow-xl ring-1 ring-border">
								<img
									src={hero.before}
									alt="Where masseter Botox goes, marked on a trial patient's face"
									loading="lazy"
									className="w-full"
								/>
								<svg
									viewBox="0 0 1053 1053"
									className="absolute inset-0 h-full w-full"
									aria-hidden
								>
									{MUSCLES.map(m => (
										<g key={m.cx}>
											<ellipse
												cx={m.cx}
												cy={m.cy}
												rx={46}
												ry={98}
												transform={`rotate(${m.tilt} ${m.cx} ${m.cy})`}
												className="fill-gold/15 stroke-gold"
												strokeWidth={2.5}
												strokeDasharray="10 8"
											/>
											{m.dots.map(([x, y]) => (
												<g key={`${x}-${y}`}>
													<circle
														cx={x}
														cy={y}
														r={12}
														className="fill-white/80"
													/>
													<circle cx={x} cy={y} r={6.5} className="fill-gold" />
												</g>
											))}
										</g>
									))}
									<path
										d="M748 660 L880 585"
										className="stroke-gold"
										strokeWidth={2.5}
									/>
								</svg>
								<span className="absolute right-[3%] top-[52%] rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm sm:text-sm">
									Masseter muscle
								</span>
							</div>
							<figcaption className="mt-4 text-center text-sm text-muted-foreground">
								Illustration. Sarah maps the injection points to your muscle.
							</figcaption>
						</figure>
					) : null}
					<div>
						<SectionTitle
							eyebrow="The treatment"
							title="How masseter Botox works"
						>
							The masseter sits at the back of your jaw, in front of your ear.
							Clench your teeth and you can feel it bulge. Sarah checks the
							muscle while you clench, then gives a few small injections in the
							thickest part on each side. It is one of our{' '}
							<Link to="/botox" prefetch="intent" className={INLINE_LINK}>
								Botox treatments in Knoxville
							</Link>
							, so you can also treat{' '}
							<Link
								to="/botox/forehead-lines"
								prefetch="intent"
								className={INLINE_LINK}
							>
								forehead lines
							</Link>{' '}
							or{' '}
							<Link
								to="/botox/frown-lines"
								prefetch="intent"
								className={INLINE_LINK}
							>
								frown lines
							</Link>{' '}
							in the same visit.
						</SectionTitle>
						<ol className="mt-10 space-y-8">
							{STEPS.map((step, i) => (
								<li key={step.title} className="flex gap-5">
									<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/40 font-display text-xl text-gold">
										{i + 1}
									</span>
									<div>
										<h3 className="text-lg font-semibold text-foreground">
											{step.title}
										</h3>
										<p className="mt-1 leading-7 text-muted-foreground">
											{step.text}
										</p>
									</div>
								</li>
							))}
						</ol>
					</div>
				</div>
			</section>

			{/* Results */}
			{pairs.length > 0 ? (
				<section className="py-24 lg:py-32">
					<div className="mx-auto max-w-7xl px-6 lg:px-8">
						<SectionTitle
							eyebrow="Results"
							title="Before and after masseter Botox"
							center
						>
							Drag each photo to compare. These patients are from Allergan's
							phase 3 masseter trial, photographed 90 days after 72 units of
							Botox. They are not our patients, and your result depends on your
							muscle.
						</SectionTitle>
						<div className="mt-16 grid gap-8 md:grid-cols-3">
							{pairs.map((pair, i) => (
								<figure key={pair.before}>
									<BeforeAfterSlider
										before={pair.before}
										after={pair.after}
										alt={`Masseter Botox result ${i + 1}`}
										className="aspect-[4/5] rounded-3xl bg-gradient-to-b from-cream to-muted ring-1 ring-border"
									/>
									<figcaption className="mt-3 text-center text-sm text-muted-foreground">
										{pair.caption ?? 'Allergan trial patient'}
									</figcaption>
								</figure>
							))}
						</div>
					</div>
				</section>
			) : null}

			{/* Timeline */}
			<section className="bg-cream py-24 lg:py-32">
				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					<SectionTitle
						eyebrow="Timeline"
						title="Your masseter Botox timeline"
						center
					/>
					<ol className="relative mt-16 grid gap-10 lg:grid-cols-5 lg:gap-6">
						<span
							aria-hidden
							className="absolute left-[1.35rem] top-2 h-[calc(100%-1rem)] w-px bg-gold/40 lg:left-0 lg:top-[1.35rem] lg:h-px lg:w-full"
						/>
						{TIMELINE.map(item => (
							<li key={item.when} className="relative pl-14 lg:pl-0 lg:pt-14">
								<span className="absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-background">
									<span className="h-3 w-3 rounded-full bg-gold" />
								</span>
								<p className="text-sm font-semibold uppercase tracking-wider text-gold">
									{item.when}
								</p>
								<h3 className="mt-2 font-display text-2xl text-foreground">
									{item.title}
								</h3>
								<p className="mt-2 leading-7 text-muted-foreground">
									{item.text}
								</p>
							</li>
						))}
					</ol>
				</div>
			</section>

			{/* Reviews */}
			{reviews.length > 0 ? (
				<section className="py-24 lg:py-32">
					<div className="mx-auto max-w-7xl px-6 lg:px-8">
						<SectionTitle
							eyebrow="Reviews"
							title="Knoxville patients on masseter Botox"
							center
						/>
						<div className="mt-6 flex items-center justify-center gap-3 text-muted-foreground">
							<Stars />
							<span>
								<span className="font-semibold text-foreground">{rating}</span>{' '}
								from {reviewCount} Google reviews
							</span>
						</div>
						<div className="mt-14 grid items-start gap-6 md:grid-cols-3">
							{reviews.map(review => (
								<figure
									key={review.id}
									className="flex flex-col rounded-[2rem] border border-border bg-card p-8 text-card-foreground"
								>
									<Stars />
									<blockquote className="mt-5 text-lg leading-8">
										“{review.comment}”
									</blockquote>
									<figcaption className="mt-6 text-sm">
										<span className="font-semibold">
											{shortName(review.reviewerName)}
										</span>
										<span className="text-muted-foreground">
											{' '}
											· Google review
										</span>
									</figcaption>
								</figure>
							))}
						</div>
					</div>
				</section>
			) : null}

			{/* Pricing and Sarah */}
			<section className="bg-cream py-24 lg:py-32">
				<div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-2 lg:px-8">
					<div className="flex flex-col rounded-[2rem] bg-card p-8 text-card-foreground shadow-xl ring-1 ring-border lg:p-12">
						<Eyebrow>Pricing</Eyebrow>
						<h2 className="mt-3 font-display text-4xl leading-tight">
							Masseter Botox cost in Knoxville
						</h2>
						<div className="mt-8 flex flex-wrap items-end gap-x-4 gap-y-3">
							<p className="flex items-baseline gap-2">
								<span className="font-display text-6xl">
									{PUBLIC_SERVICE_PRICING.botox.display.replace('/unit', '')}
								</span>
								<span className="text-xl text-muted-foreground">per unit</span>
							</p>
							<span className="mb-2 rounded-full bg-gold/15 px-3 py-1 text-sm font-semibold text-foreground">
								{FIRST_VISIT_OFFER}
							</span>
						</div>
						<ul className="mt-8 space-y-4 text-lg">
							{[
								'Free consultation with Sarah',
								'Your units and your price before you start',
								'You pay only for the units you need',
								'The masseter needs more units than an area like the forehead',
							].map(item => (
								<li key={item} className="flex gap-3">
									<Icon
										name="check"
										className="mt-1 h-5 w-5 shrink-0 text-gold"
									/>
									<span>{item}</span>
								</li>
							))}
						</ul>
						<BookButton
							href={blvdUrl}
							className="mt-10 w-full whitespace-nowrap sm:w-auto sm:self-start"
						/>
					</div>

					<div className="grid overflow-hidden rounded-[2rem] bg-card text-card-foreground shadow-xl ring-1 ring-border sm:grid-cols-[2fr_3fr] lg:grid-cols-1 xl:grid-cols-[2fr_3fr]">
						<img
							src="/img/sarah.jpg"
							alt="Sarah Hitchcox, RN, BSN"
							loading="lazy"
							className="h-96 w-full object-cover object-[center_15%] sm:h-full lg:h-80 xl:h-full"
						/>
						<div className="flex flex-col justify-center p-8 lg:p-10">
							<Eyebrow>Your injector</Eyebrow>
							<h2 className="mt-3 font-display text-4xl leading-tight">
								Meet Sarah Hitchcox, RN, BSN
							</h2>
							<p className="mt-5 leading-7 text-muted-foreground">
								Sarah is a Knoxville native and a registered nurse. Years in the
								emergency department taught her calm, careful patient care, and
								she is working toward her Doctor of Nursing Practice.
							</p>
							<blockquote className="mt-6 border-l-2 border-gold pl-5 font-display text-xl italic leading-8">
								“My practice is grounded in nurturing a trusting relationship
								with each client, ensuring a seamless journey to enhanced
								natural beauty.”
							</blockquote>
						</div>
					</div>
				</div>
			</section>

			{/* FAQ */}
			{faq.length > 0 ? (
				<section className="py-24 lg:py-32">
					<div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[2fr_3fr] lg:gap-20 lg:px-8">
						<div>
							<SectionTitle
								eyebrow="Questions"
								title="Masseter Botox questions"
							>
								Still deciding? Sarah answers all of these at your free
								consultation, and you can call us any time.
							</SectionTitle>
							<p className="mt-6 inline-flex items-center gap-2 font-semibold text-foreground">
								<Icon name="phone" className="h-5 w-5 text-gold" />
								<PhoneLink className="hover:underline" />
							</p>
						</div>
						<ServiceFAQ faq={faq} />
					</div>
				</section>
			) : null}

			{/* Final call to action, on the treatment room photo */}
			<section className="relative isolate overflow-hidden">
				<img
					src="/img/knoxville-med-spa.webp"
					alt="A treatment room at Sarah Hitchcox Aesthetics"
					loading="lazy"
					className="absolute inset-0 -z-10 h-full w-full object-cover object-[0%_center] lg:object-[center_35%]"
				/>
				<div
					aria-hidden
					className="absolute inset-0 -z-10 bg-gradient-to-b from-black/95 via-black/80 to-black/45 lg:bg-gradient-to-r lg:from-black/85 lg:via-black/60 lg:to-black/20"
				/>
				<div className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">
					<div className="max-w-xl text-white">
						<p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
							Bearden · Farragut
						</p>
						<h2 className="mt-4 font-display text-5xl leading-tight sm:text-6xl">
							Book masseter Botox in Knoxville
						</h2>
						<p className="mt-6 text-lg leading-8 text-white/80">
							Start with a free consultation. You leave with a plan and a price,
							and no pressure.
						</p>
						<div className="mt-9 flex flex-col gap-3 sm:flex-row">
							<a
								href={blvdUrl}
								className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 font-semibold text-black shadow-lg transition hover:-translate-y-0.5"
							>
								<Icon name="calendar" className="h-5 w-5" />
								Book a free consultation
							</a>
							<CallButton className="border-white/40 text-white hover:border-white" />
						</div>
					</div>
				</div>
			</section>

			{/* More Botox areas */}
			<section className="py-16">
				<div className="mx-auto max-w-7xl px-6 lg:px-8">
					<h2 className="font-display text-2xl text-foreground">
						More Botox treatments in Knoxville
					</h2>
					<div className="mt-6 flex flex-wrap gap-3">
						{siblings.map(sibling => (
							<Link
								key={sibling.path}
								to={`/${sibling.path}`}
								prefetch="intent"
								className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-foreground/40 hover:bg-muted"
							>
								{sibling.name} Botox
							</Link>
						))}
						<Link
							to="/botox"
							prefetch="intent"
							className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
						>
							All Botox treatments in Knoxville
						</Link>
					</div>
				</div>
			</section>
		</div>
	)
}
