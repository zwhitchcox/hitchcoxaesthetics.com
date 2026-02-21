import { useLocation } from '@remix-run/react'
import Logo from '#app/components/logo.js'
import { Icon } from '#app/components/ui/icon.js'
import Carousel from '#app/utils/carousel.js'
import { CTA } from '#app/utils/cta.js'
import { getLocationById, PHONE } from '#app/utils/locations.js'
import { cn, scrollToId } from '#app/utils/misc.js'

/**
 * Generates FAQPage JSON-LD structured data for SEO.
 * Use this on any service page that has a FAQ section.
 */
export function FAQJsonLd({
	faq,
}: {
	faq: { question: string; answer: string }[]
}) {
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faq.map(item => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: item.answer,
			},
		})),
	}

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
		/>
	)
}

/**
 * Generates Service JSON-LD structured data for SEO.
 * Location-aware: on location pages, uses location-specific phone/address.
 */
export function ServiceJsonLd({
	name,
	description,
	url,
}: {
	name: string
	description: string
	url: string
}) {
	const bearden = getLocationById('bearden')!

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Service',
		name,
		description,
		url,
		provider: {
			'@type': 'MedicalBusiness',
			name: 'Sarah Hitchcox Aesthetics',
			telephone: PHONE,
			url: 'https://botoxknoxville.com',
			address: {
				'@type': 'PostalAddress',
				streetAddress: bearden.address,
				addressLocality: bearden.city,
				addressRegion: bearden.state,
				postalCode: bearden.zip,
				addressCountry: 'US',
			},
		},
		areaServed: { '@type': 'City', name: 'Knoxville' },
	}

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
		/>
	)
}

export function ServiceHeader({ children }: { children: React.ReactNode }) {
	return <h2 className="text-3xl font-semibold text-gray-700">{children}</h2>
}

export function ServiceCheckMarks({
	bulletPoints,
}: {
	bulletPoints: { title: string; description: string }[]
}) {
	return (
		<div className="grid gap-6 md:grid-cols-2">
			{bulletPoints.map((point, index) => (
				<div
					key={index}
					className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md"
				>
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							<Icon name="check" className="h-5 w-5" />
						</div>
						<h3 className="text-lg font-bold text-gray-900">{point.title}</h3>
					</div>
					<p className="text-gray-600">{point.description}</p>
				</div>
			))}
		</div>
	)
}

export function ServiceFAQ({
	faq,
}: {
	faq: { question: string; answer: string }[]
}) {
	return (
		<div className="w-full divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
			{faq.map(item => (
				<details
					key={item.question}
					className="group p-6 [&_summary::-webkit-details-marker]:hidden"
				>
					<summary className="flex cursor-pointer list-none items-center justify-between font-medium text-gray-900">
						<span className="text-lg font-semibold">{item.question}</span>
						<span className="transition group-open:rotate-90">
							<Icon name="chevron-right" className="h-5 w-5" />
						</span>
					</summary>
					<p className="mt-4 leading-relaxed text-gray-600">{item.answer}</p>
				</details>
			))}
		</div>
	)
}

export function ServiceAreas({
	areas,
}: {
	areas: { name: string; description: string }[]
}) {
	return (
		<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
			{areas.map(item => (
				<div key={item.name} className="rounded-lg bg-white p-6 shadow-sm">
					<h3 className="mb-2 text-xl font-medium text-gray-900">
						{item.name}
					</h3>
					<p className="text-lg text-gray-700">{item.description}</p>
				</div>
			))}
		</div>
	)
}

export function ServiceParagraph({ children }: { children: React.ReactNode }) {
	return <p className="text-lg leading-relaxed text-gray-600">{children}</p>
}

export function ServiceLayout({
	title,
	description,
	children,
	imgClassName,
	imgContainerClassName,
	customClassNames,
	imgs,
	imgAltTexts,
}: {
	title: string
	description: string
	children: React.ReactNode
	imgClassName?: string
	imgContainerClassName?: string
	customClassNames?: (string | undefined)[]
	imgs?: string[]
	imgAltTexts?: string[]
}) {
	const location = useLocation()
	const service = location.pathname.split('/').pop()
	// If no images passed, don't render carousel with broken URLs
	imgs ??= []
	imgAltTexts ??= [
		`${title} before treatment at Sarah Hitchcox Aesthetics`,
		`${title} after treatment at Sarah Hitchcox Aesthetics`,
	]
	const serviceUrl = `https://botoxknoxville.com${location.pathname}`
	return (
		<>
			<ServiceJsonLd name={title} description={description} url={serviceUrl} />
			<div className="font-poppins flex h-[calc(100dvh-3rem)] w-full flex-col bg-white">
				<div className="relative flex h-[calc(100dvh-3.1rem)]  w-full flex-col overflow-hidden bg-[#070707] sm:flex sm:flex-row sm:bg-inherit">
					<div
						className={cn(
							'relative flex w-full flex-1 items-center justify-center bg-[#070707] duration-1000 hover:grayscale-0 lg:[clip-path:polygon(0_0,_100%_0,_90%_100%,_0%_100%)]',
							imgContainerClassName,
						)}
					>
						<Carousel
							images={imgs}
							className={imgClassName}
							customClassNames={customClassNames}
							altTexts={imgAltTexts}
						/>
					</div>
					<div className="z-10 flex w-full bg-white py-4 text-black sm:relative sm:my-0 sm:flex-1">
						<div className="flex h-full w-full animate-slide-top flex-col items-center justify-center space-y-4 [animation-fill-mode:backwards] lg:space-y-8">
							<div className="flex flex-col items-center justify-center">
								<h1 className="animate-fade-in text-center text-xl tracking-[.4rem] md:text-2xl lg:text-3xl">
									{title}
								</h1>
								<Logo className="my-2 h-8 w-8 animate-spin-in text-primary [animation-fill-mode:backwards] md:h-10 md:w-10 lg:h-10 lg:w-10" />
								<div className="text-md flex flex-wrap justify-center px-2 text-center tracking-[.3rem] text-gray-600 sm:tracking-[.3rem] md:text-xl">
									{description.includes(',')
										? description.split(',').map((item, index) => (
												<span key={index}>
													{item}
													{index < description.split(',').length - 1 && ','}
												</span>
											))
										: description}
								</div>
							</div>
							<div className="flex flex-col items-center justify-center space-y-2">
								<button
									className="text-md mx-2  w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-center font-semibold text-black transition duration-300 ease-in-out hover:bg-gray-200 sm:w-48 sm:text-lg"
									onClick={() => scrollToId(service!)}
								>
									Learn More
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div
				id={service!}
				className="bg-gray-50 px-6 py-12 pb-32 sm:px-12 lg:px-24"
			>
				<div className="flex w-full flex-col items-center justify-center space-y-12">
					<div className="w-full max-w-5xl space-y-8">
						<div className="flex flex-col space-y-6">{children}</div>
					</div>
				</div>
			</div>
			<CTA />
		</>
	)
}
