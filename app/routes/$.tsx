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
import {
	locationServices,
	type ServicePageSection,
} from '#app/utils/location-service-data.server.js'
import {
	getPage,
	getChildren,
	getAncestors,
	getSiblings,
	sitePages,
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

/** Convert a base service path to a location-prefixed path */
function mapToLocationPath(p: string, locationId: string): string {
	const [first, ...rest] = p.split('/')
	return rest.length
		? `${locationId}-${first}/${rest.join('/')}`
		: `${locationId}-${first}`
}

type LoaderData = {
	page: SitePage
	children: SitePage[]
	ancestors: SitePage[]
	siblings: SitePage[]
	markdown: string
	isLocationPage: boolean
	baseServiceSlug?: string
}

export async function loader({ params }: LoaderFunctionArgs) {
	const splat = params['*'] ?? ''
	const locationMatch = splat.match(/^(knoxville|farragut)-(.+)$/)

	// Case 1: Direct match in site-pages → 301 redirect to knoxville equivalent
	// Main service pages no longer exist as standalone pages.
	const page = getPage(splat)
	if (page && page.enabled) {
		const knoxvillePath = mapToLocationPath(splat, 'knoxville')
		return redirect(`/${knoxvillePath}`, { status: 301 })
	}

	// Case 2: Location-service match (e.g., "knoxville-botox")
	if (locationServices[splat]) {
		const locPage = locationServices[splat]
		const baseServicePage = getPage(locPage.serviceSlug)
		const ancestors = baseServicePage ? getAncestors(locPage.serviceSlug) : []
		const siblings = baseServicePage ? getSiblings(locPage.serviceSlug) : []
		const children = baseServicePage ? getChildren(locPage.serviceSlug) : []

		// Look up location-specific heroImage for children/siblings from locationServices
		const getLocHeroImage = (servicePath: string) => {
			const locSlug = mapToLocationPath(servicePath, locPage.locationId)
			return locationServices[locSlug]?.heroImage
		}

		const locSitePage: SitePage = {
			path: locPage.slug,
			name: `${locPage.locationName} ${locPage.serviceName}`,
			tagline: locPage.tagline || `in ${locPage.locationName}, TN`,
			title: locPage.title,
			metaDescription: locPage.metaDescription,
			content: '',
			enabled: true,
			locationId: locPage.locationId,
			locationName: locPage.locationName,
			shortDescription: locPage.shortDescription,
			whyChooseTitle: locPage.whyChooseTitle,
			whyChoose: locPage.whyChoose,
			ctaText: locPage.ctaText,
			heroImage: locPage.heroImage,
			heroImages: locPage.heroImages,
		}
		const markdown = `## ${locPage.h1}\n\n### ${locPage.h2}\n\n${locPage.introParagraph}\n\n${locPage.bodyParagraph}`

		return json<LoaderData>({
			page: locSitePage,
			children: children.map(c => ({
				...c,
				path: mapToLocationPath(c.path, locPage.locationId),
				heroImage: getLocHeroImage(c.path) ?? c.heroImage,
			})),
			ancestors: ancestors.map(a => ({
				...a,
				path: mapToLocationPath(a.path, locPage.locationId),
			})),
			siblings: siblings.map(s => ({
				...s,
				path: mapToLocationPath(s.path, locPage.locationId),
				heroImage: getLocHeroImage(s.path) ?? s.heroImage,
			})),
			markdown,
			isLocationPage: true,
			baseServiceSlug: locPage.serviceSlug,
		})
	}

	// Case 3: Location-prefixed slug maps to a base site page
	if (locationMatch) {
		const [, locationId, remainder] = locationMatch
		const locationName = locationId === 'knoxville' ? 'Knoxville' : 'Farragut'
		const basePage = Object.values(sitePages).find(p => p.path === remainder)
		if (basePage && basePage.enabled) {
			const ancestors = getAncestors(basePage.path)
			const siblings = getSiblings(basePage.path)
			const children = getChildren(basePage.path)

			const locSitePage: SitePage = {
				...basePage,
				path: splat,
				name: `${locationName} ${basePage.name}`,
				locationId,
				locationName,
			}

			return json<LoaderData>({
				page: locSitePage,
				children: children.map(c => ({
					...c,
					path: mapToLocationPath(c.path, locationId!),
				})),
				ancestors: ancestors.map(a => ({
					...a,
					path: mapToLocationPath(a.path, locationId!),
				})),
				siblings: siblings.map(s => ({
					...s,
					path: mapToLocationPath(s.path, locationId!),
				})),
				markdown: basePage.content,
				isLocationPage: true,
				baseServiceSlug: basePage.path,
			})
		}
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
	const {
		page,
		children,
		ancestors,
		siblings,
		markdown,
		isLocationPage,
		baseServiceSlug,
	} = useLoaderData<LoaderData>()

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

	// Determine the location context from the page
	const pageLocationId = page.locationId ?? 'knoxville'
	const pageLocationName =
		page.locationName ??
		(pageLocationId === 'knoxville' ? 'Knoxville' : 'Farragut')
	const otherLocationId =
		pageLocationId === 'knoxville' ? 'farragut' : 'knoxville'
	const otherLocationName =
		pageLocationId === 'knoxville' ? 'Farragut' : 'Knoxville'

	// Build full breadcrumb: Home -> Location Med Spa -> ancestors (reversed) -> current
	const breadcrumbItems = [
		{ path: '/', name: 'Home' },
		...(isLocationPage
			? [
					{
						path: `/${pageLocationId}-med-spa`,
						name: `${pageLocationName} Med Spa`,
					},
				]
			: []),
		...[...(ancestors ?? [])].reverse().map(a => ({
			path: `/${a.path}`,
			name: a.name,
		})),
	]

	return (
		<ServiceLayout
			title={page.name}
			description={page.tagline}
			imgClassName="w-full h-full object-cover"
			imgs={imgs}
		>
			<ServiceJsonLd
				name={page.name}
				description={page.metaDescription}
				url={`https://hitchcoxaesthetics.com/${page.path}`}
			/>

			{page.faq && page.faq.length > 0 && (
				<FAQJsonLd faq={page.faq as { question: string; answer: string }[]} />
			)}

			{/* Full Breadcrumb: Home / Category / Service / Current */}
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

			<h1 className="mb-6 text-3xl font-bold text-gray-900 sm:text-4xl">
				{page.name}
			</h1>

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
									{ancestor.name.toLowerCase()} treatments
								</Link>
								{i < (ancestors ?? []).length - 1 && ' under our '}
							</span>
						))}{' '}
						at Sarah Hitchcox Aesthetics in Knoxville and Farragut, TN. Browse
						our full range of services to find the right treatment for your
						goals.
					</p>
				</div>
			)}

			{/* Dynamic Sections */}
			{page.sections?.map((section, index) => renderSection(section, index))}

			{/* Pricing */}
			<PricingSection serviceSlug={baseServiceSlug ?? page.path} />

			{/* Sub-service Grid (for pages with children) */}
			{childCards.length > 0 && (
				<div className="mt-12">
					<ServiceHeader>{page.name} Treatments</ServiceHeader>
					<div className="mt-6">
						<ServiceCardGrid services={childCards} variant="thumbnail" />
					</div>
				</div>
			)}

			{/* Sibling Links */}
			{(siblings ?? []).length > 0 && (
				<div className="mt-12 border-t border-gray-200 pt-8">
					<ServiceHeader>Related Treatments</ServiceHeader>
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

			{/* Why Choose Section (location pages) */}
			{isLocationPage && page.whyChooseTitle && (
				<div className="mt-12 border-t pt-8">
					<ServiceHeader>{page.whyChooseTitle}</ServiceHeader>
					<ServiceParagraph>{page.whyChoose || ''}</ServiceParagraph>
				</div>
			)}

			{/* Cross-location link + location med spa link */}
			{isLocationPage && baseServiceSlug && (
				<div className="mt-8 rounded-lg border border-gray-100 bg-white p-6">
					<p className="text-gray-600">
						Also available at our{' '}
						<Link
							to={`/${otherLocationId}-${baseServiceSlug.split('/')[0]}${baseServiceSlug.includes('/') ? '/' + baseServiceSlug.split('/').slice(1).join('/') : ''}`}
							className="font-medium text-primary hover:underline"
						>
							{otherLocationName}{' '}
							{baseServiceSlug
								.split('/')
								.pop()!
								.split('-')
								.map(w => w.charAt(0).toUpperCase() + w.slice(1))
								.join(' ')}{' '}
							location
						</Link>
						, or{' '}
						<Link
							to={`/${pageLocationId}-med-spa`}
							className="font-medium text-primary hover:underline"
						>
							explore all services at our {pageLocationName} med spa
						</Link>
						.
					</p>
				</div>
			)}

			{/* CTA */}
			<div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
				<a
					href="https://hitchcoxaesthetics.janeapp.com"
					className="rounded-md bg-black px-8 py-3 font-semibold text-white transition hover:bg-gray-800"
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
