import { json, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Hero } from '#app/components/hero.js'
import { ServiceCardGrid } from '#app/components/service-card-grid.js'
import { Icon } from '#app/components/ui/icon.js'
import { getLocationById } from '#app/utils/locations.js'
import { getCategoryPages } from '#app/utils/site-pages.server.js'

export const meta: MetaFunction = () => [
	{
		title:
			'Knoxville Med Spa | Botox, Fillers & Lasers | Sarah Hitchcox Aesthetics',
	},
	{
		name: 'description',
		content:
			'Visit Sarah Hitchcox Aesthetics in Knoxville, TN (5113 Kingston Pike). Expert Botox, dermal fillers, laser treatments, and medical weight loss.',
	},
	{
		property: 'og:title',
		content:
			'Knoxville Med Spa | Botox, Fillers & Lasers | Sarah Hitchcox Aesthetics',
	},
	{
		property: 'og:description',
		content:
			'Visit Sarah Hitchcox Aesthetics in Knoxville, TN for expert Botox, fillers, and laser treatments.',
	},
]

export async function loader() {
	const categories = getCategoryPages().map(c => ({
		slug: `knoxville-${c.path}`,
		serviceName: c.name,
		shortDescription: c.shortDescription,
		heroImage: c.heroImage,
	}))
	return json({ categories })
}

export default function KnoxvilleLocation() {
	const { categories } = useLoaderData<typeof loader>()
	const location = getLocationById('knoxville')!

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'MedicalBusiness',
		name: 'Sarah Hitchcox Aesthetics - Knoxville',
		description:
			'Medical spa in Knoxville offering Botox, dermal fillers, laser treatments, and medical weight loss.',
		url: 'https://hitchcoxaesthetics.com/knoxville-med-spa',
		telephone: '(865) 214-7238',
		email: 'sarah@hitchcoxaesthetics.com',
		image: 'https://hitchcoxaesthetics.com/img/sarah.jpg',
		priceRange: '$$',
		address: {
			'@type': 'PostalAddress',
			streetAddress: location.address,
			addressLocality: location.city,
			addressRegion: location.state,
			postalCode: location.zip,
			addressCountry: 'US',
		},
		geo: {
			'@type': 'GeoCoordinates',
			latitude: 35.9392,
			longitude: -83.9913,
		},
		openingHoursSpecification: [
			{
				'@type': 'OpeningHoursSpecification',
				dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
				opens: '09:00',
				closes: '17:00',
			},
		],
	}

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<div className="font-poppins flex w-full flex-col bg-white">
				<Hero
					image="/img/sarah.jpg"
					imageAlt="Sarah Hitchcox - Knoxville Med Spa"
					topText="SARAH HITCHCOX"
					bottomText="AESTHETICS"
					subText="Knoxville Med Spa"
					ctaText="Book Appointment"
					ctaHref="https://hitchcoxaesthetics.janeapp.com"
				/>

				{/* Content Section */}
				<div className="mx-auto w-full max-w-4xl px-6 py-16">
					<div className="space-y-12">
						<div className="text-center">
							<h2 className="mb-4 text-3xl font-bold text-gray-900">
								Expert Aesthetic Services in Knoxville, TN
							</h2>
							<p className="text-lg leading-relaxed text-gray-600">
								Conveniently located on Kingston Pike in the Bearden area, Sarah
								Hitchcox Aesthetics provides premier medical spa services to
								Knoxville residents. Whether you are looking for preventative
								Botox, volume restoration with fillers, or advanced laser skin
								treatments, our Knoxville location offers a private and
								luxurious setting for your aesthetic journey.
							</p>
						</div>

						<div>
							<h2 className="text-center text-2xl font-bold text-gray-900">
								Med Spa Services Available in Knoxville
							</h2>
							<div className="mt-8">
								<ServiceCardGrid services={categories} variant="thumbnail" />
							</div>
						</div>

						<div className="rounded-xl bg-gray-50 p-8 text-center">
							<h3 className="mb-4 text-2xl font-semibold text-gray-900">
								Visit Our Knoxville Medical Spa
							</h3>
							<p className="mb-6 text-gray-600">
								We are located at 5113 Kingston Pike, Suite 15, right in the
								heart of Knoxville. Ample parking is available.
							</p>
							<div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
								<Link
									to="tel:8652147238"
									reloadDocument
									className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
								>
									Call (865) 214-7238
								</Link>
								<a
									href={location.googleMapsDirectionsUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
								>
									<Icon name="map-pin" className="h-5 w-5" />
									Get Directions
								</a>
							</div>

							<div className="h-64 w-full overflow-hidden rounded-lg shadow-sm">
								<iframe
									src={location.googleMapsEmbedUrl}
									width="100%"
									height="100%"
									allowFullScreen={false}
									loading="lazy"
									referrerPolicy="no-referrer-when-downgrade"
									title={`Map of Sarah Hitchcox Aesthetics ${location.name}`}
									style={{ border: 0 }}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}
