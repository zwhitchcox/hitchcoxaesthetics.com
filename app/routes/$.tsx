import {
	json,
	redirect,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Link, useLoaderData, useLocation } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { MarkdownContent } from '#app/components/markdown-content.js'
import { PricingSection } from '#app/components/pricing-table.js'
import { ServiceCardGrid } from '#app/components/service-card-grid.js'
import { Icon } from '#app/components/ui/icon.tsx'
import { type ServicePageSection } from '#app/utils/location-service-data.server.js'
import {
	getPage,
	getChildren,
	getAncestors,
	getSiblings,
	type SitePage,
} from '#app/utils/site-pages.server.js'
import {
	FAQJsonLd,
	ServiceCheckMarks,
	ServiceFAQ,
	ServiceHeader,
	ServiceJsonLd,
	ServiceLayout,
	ServiceParagraph,
} from './_services+/__service-layout'

/**
 * Strip a location prefix from a slug.
 * "knoxville-botox" → "botox"
 * "farragut-filler/lip-filler" → "filler/lip-filler"
 * "knoxville-med-spa" → null (special case, handled by redirect routes)
 */
function stripLocationPrefix(slug: string): { basePath: string } | null {
	const match = slug.match(/^(knoxville|farragut)-(.+)$/)
	if (!match) return null
	const remainder = match[2]!
	return { basePath: remainder }
}

type LoaderData = {
	page: SitePage
	children: SitePage[]
	ancestors: SitePage[]
	siblings: SitePage[]
	markdown: string
}

export async function loader({ params }: LoaderFunctionArgs) {
	const splat = params['*'] ?? ''

	// 301 redirect: old location-prefixed service URLs → base service URLs
	// e.g. /knoxville-botox → /botox, /farragut-filler/lip-filler → /filler/lip-filler
	const stripped = stripLocationPrefix(splat)
	if (stripped) {
		// Special case: knoxville-med-spa and farragut-med-spa redirect to location pages
		if (stripped.basePath === 'med-spa') {
			const locId = splat.startsWith('knoxville') ? 'bearden' : 'farragut'
			return redirect(`/${locId}`, { status: 301 })
		}
		return redirect(`/${stripped.basePath}`, { status: 301 })
	}

	// Direct match in site-pages → render the service page
	const page = getPage(splat)
	if (page && page.enabled) {
		const children = getChildren(splat)
		const ancestors = getAncestors(splat)
		const siblings = getSiblings(splat)

		return json<LoaderData>({
			page,
			children,
			ancestors,
			siblings,
			markdown: page.content,
		})
	}

	throw new Response('Not found', { status: 404 })
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	if (!data) return [{ title: 'Not Found | Sarah Hitchcox Aesthetics' }]
	const { page } = data
	return [
		{ title: page.title },
		{ name: 'description', content: page.metaDescription },
		{ property: 'og:title', content: page.title },
		{ property: 'og:description', content: page.metaDescription },
	]
}

export default function DynamicPage() {
	const { page, children, ancestors, siblings, markdown } =
		useLoaderData<LoaderData>()

	// Carousel images: use heroImages (all before/after pairs) from content-loader
	const imgs: string[] =
		page.heroImages ?? (page.heroImage ? [page.heroImage] : [])

	const childCards = (children ?? [])
		.filter(c => c.enabled)
		.map(c => ({
			slug: c.path,
			serviceName: c.name,
			shortDescription: c.shortDescription,
			heroImage: c.heroImage,
		}))

	const renderSection = (section: ServicePageSection, index: number) => {
		switch (section.type) {
			case 'text-block':
				return (
					<div key={index} className="space-y-4">
						{section.title && <ServiceHeader>{section.title}</ServiceHeader>}
						<ServiceParagraph>{section.content}</ServiceParagraph>
					</div>
				)
			case 'features-grid':
				return (
					<div key={index} className="space-y-4">
						{section.title && <ServiceHeader>{section.title}</ServiceHeader>}
						<ServiceCheckMarks bulletPoints={section.items} />
					</div>
				)
			case 'faq-accordion':
				return (
					<div key={index} className="space-y-4">
						{section.title && <ServiceHeader>{section.title}</ServiceHeader>}
						<ServiceFAQ faq={section.items} />
					</div>
				)
			case 'cta-banner':
				return (
					<div
						key={index}
						className="my-8 rounded-xl bg-gray-900 p-8 text-center text-white shadow-lg"
					>
						<h3 className="mb-4 text-2xl font-bold">{section.title}</h3>
						<p className="mb-6 text-lg text-gray-300">{section.text}</p>
						<a
							href={section.link}
							className="inline-block rounded-md bg-white px-8 py-3 font-semibold text-black transition hover:bg-gray-200"
						>
							{section.buttonText}
						</a>
					</div>
				)
			case 'testimonials':
				return (
					<div key={index} className="space-y-4">
						<ServiceHeader>What Our Clients Say</ServiceHeader>
						<div className="grid gap-6 md:grid-cols-2">
							{section.items.map((item, i) => (
								<div key={i} className="rounded-lg bg-white p-6 shadow-sm">
									<p className="mb-4 italic text-gray-600">"{item.quote}"</p>
									<p className="font-semibold text-gray-900">- {item.author}</p>
								</div>
							))}
						</div>
					</div>
				)
			default:
				return null
		}
	}

	// Breadcrumb: Home -> ancestors (reversed) -> current
	const breadcrumbItems = [
		{ path: '/', name: 'Home' },
		...[...(ancestors ?? [])].reverse().map(a => ({
			path: `/${a.path}`,
			name: a.name,
		})),
	]

	const title = page.name.toLowerCase().includes('knoxville')
		? page.name
		: `${page.name} Knoxville`

	return (
		<ServiceLayout
			title={title}
			description={page.tagline}
			imgClassName="w-full h-full object-cover"
			imgs={imgs}
		>
			<ServiceJsonLd
				name={page.name}
				description={page.metaDescription}
				url={`https://botoxknoxville.com/${page.path}`}
			/>

			{page.faq && page.faq.length > 0 && (
				<FAQJsonLd faq={page.faq as { question: string; answer: string }[]} />
			)}

			{/* Breadcrumb: Home / Category / Current */}
			<nav className="mb-6 text-sm text-gray-500">
				{breadcrumbItems.map(item => (
					<span key={item.path}>
						<Link
							to={item.path}
							prefetch="intent"
							className="hover:text-primary hover:underline"
						>
							{item.name}
						</Link>
						<span className="mx-2">/</span>
					</span>
				))}
				<span className="font-medium text-gray-800">{page.name}</span>
			</nav>

			{/* Main Content */}
			<MarkdownContent content={markdown} />

			{/* Ancestor Links (keyword-rich, in content body) */}
			{(ancestors ?? []).length > 0 && (
				<div className="mt-8 rounded-lg border border-gray-100 bg-white p-6">
					<h3 className="mb-4 text-lg font-semibold text-gray-900">
						Explore More {page.name} Treatments
					</h3>
					<p className="text-gray-600">
						{page.name} is part of our{' '}
						{(ancestors ?? []).map((ancestor, i) => (
							<span key={ancestor.path}>
								<Link
									to={`/${ancestor.path}`}
									className="font-medium text-primary hover:underline"
								>
									{ancestor.name.toLowerCase()} treatments in Knoxville
								</Link>
								{i < (ancestors ?? []).length - 1 && ' under our '}
							</span>
						))}{' '}
						at Sarah Hitchcox Aesthetics in Knoxville, TN. Browse our full range
						of services to find the right treatment for your goals.
					</p>
				</div>
			)}

			{/* Dynamic Sections */}
			{page.sections?.map((section, index) => renderSection(section, index))}

			{/* Pricing */}
			<PricingSection serviceSlug={page.path} />

			{/* Sub-service Grid (for pages with children) */}
			{childCards.length > 0 && (
				<div className="mt-12">
					<ServiceHeader>{page.name} Treatments in Knoxville</ServiceHeader>
					<div className="mt-6">
						<ServiceCardGrid services={childCards} variant="thumbnail" />
					</div>
				</div>
			)}

			{/* Sibling Links */}
			{(siblings ?? []).length > 0 && (
				<div className="mt-12 border-t border-gray-200 pt-8">
					<ServiceHeader>
						Related Aesthetic Treatments in Knoxville
					</ServiceHeader>
					<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{(siblings ?? []).map(sibling => (
							<Link
								key={sibling.path}
								to={`/${sibling.path}`}
								className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-4 transition-all hover:shadow-md"
							>
								{sibling.heroImage && (
									<img
										src={sibling.heroImage}
										alt={sibling.name}
										className="h-16 w-16 rounded-lg object-cover"
										loading="lazy"
									/>
								)}
								<div>
									<h4 className="font-semibold text-gray-900 hover:text-primary">
										{sibling.name}
									</h4>
									<p className="text-sm text-gray-500">
										{sibling.shortDescription}
									</p>
								</div>
							</Link>
						))}
					</div>
				</div>
			)}

			{/* Location links */}
			<div className="mt-8 rounded-lg border border-gray-100 bg-white p-6">
				<p className="text-gray-600">
					Available at both of our Knoxville area locations:{' '}
					<Link
						to="/bearden"
						className="font-medium text-primary hover:underline"
					>
						Bearden (West Knoxville)
					</Link>
					{' and '}
					<Link
						to="/farragut"
						className="font-medium text-primary hover:underline"
					>
						Farragut
					</Link>
					.
				</p>
			</div>

			{/* CTA */}
			<div className="mt-12 flex flex-col items-center justify-center">
				<a
					href="https://hitchcoxaesthetics.janeapp.com"
					className="rounded-full bg-black px-10 py-4 text-lg font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:-translate-y-1 hover:bg-gray-900 hover:shadow-xl"
				>
					{page.ctaText || 'Book Your Consultation'}
				</a>
			</div>
		</ServiceLayout>
	)
}

export function ErrorBoundary() {
	const location = useLocation()
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="flex flex-col gap-6">
						<div className="flex flex-col gap-3">
							<h1>We can't find this page:</h1>
							<pre className="whitespace-pre-wrap break-all text-body-lg">
								{location.pathname}
							</pre>
						</div>
						<Link to="/" className="text-body-md underline">
							<Icon name="arrow-left">Back to home</Icon>
						</Link>
					</div>
				),
			}}
		/>
	)
}
