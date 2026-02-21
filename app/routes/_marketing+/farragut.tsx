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
			'Farragut Med Spa | Botox, Fillers & Lasers | Sarah Hitchcox Aesthetics',
	},
	{
		name: 'description',
		content:
			'Visit Sarah Hitchcox Aesthetics in Farragut, TN (102 S Campbell Station Rd). Expert Botox, dermal fillers, laser treatments, and GLP-1 weight loss.',
	},
	{
		property: 'og:title',
		content:
			'Farragut Med Spa | Botox, Fillers & Lasers | Sarah Hitchcox Aesthetics',
	},
	{
		property: 'og:description',
		content:
			'Visit Sarah Hitchcox Aesthetics in Farragut, TN for expert Botox, fillers, and laser treatments.',
	},
]

export async function loader() {
	const categories = getCategoryPages().map(c => ({
		slug: c.path,
		serviceName: c.name,
		shortDescription: c.shortDescription,
		heroImage: c.heroImage,
	}))
	return json({ categories })
}

export default function FarragutLocation() {
	const { categories } = useLoaderData<typeof loader>()
	const location = getLocationById('farragut')!

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'MedicalBusiness',
		name: 'Sarah Hitchcox Aesthetics - Farragut',
		description:
			'Medical spa in Farragut offering Botox, dermal fillers, laser treatments, and GLP-1 weight loss.',
		url: 'https://botoxknoxville.com/farragut',
		telephone: location.phone,
		email: 'sarah@hitchcoxaesthetics.com',
		image: 'https://botoxknoxville.com/img/sarah.jpg',
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
			latitude: location.lat,
			longitude: location.lng,
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
					imageAlt="Sarah Hitchcox - Farragut Med Spa"
					topText="SARAH HITCHCOX"
					bottomText="AESTHETICS"
					subText="Farragut Med Spa"
					ctaText="Book Appointment"
					ctaHref="https://hitchcoxaesthetics.janeapp.com"
				/>

				<div className="mx-auto w-full max-w-4xl px-6 py-16">
					<div className="space-y-12">
						<div className="text-center">
							<h2 className="mb-4 text-3xl font-bold text-gray-900">
								Knoxville Med Spa | Farragut
							</h2>
							<p className="text-lg leading-relaxed text-gray-600">
								Located on Campbell Station Road, Sarah Hitchcox Aesthetics
								brings premier medical spa services to the Farragut community.
								We specialize in natural-looking results through expert Botox
								injections, dermal fillers, and cutting-edge skin treatments.
								Visit our Farragut location for a personalized consultation
								tailored to your aesthetic goals.
							</p>
						</div>

						<div>
							<h2 className="text-center text-2xl font-bold text-gray-900">
								Knoxville Med Spa Services Available in Farragut
							</h2>
							<div className="mt-8">
								<ServiceCardGrid services={categories} variant="thumbnail" />
							</div>
						</div>

						<div className="rounded-xl bg-gray-50 p-8 text-center">
							<h3 className="mb-4 text-2xl font-semibold text-gray-900">
								Visit Our Farragut Location
							</h3>
							<p className="mb-6 text-gray-600">
								We are located at 102 S Campbell Station Rd, Suite 8, near the
								heart of Farragut. Ample parking is available.
							</p>
							<div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
								<Link
									to={`tel:${location.phoneRaw}`}
									reloadDocument
									className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
								>
									Call {location.phone}
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
									title="Map of Sarah Hitchcox Aesthetics Farragut"
									style={{ border: 0 }}
								/>
							</div>
						</div>

						<div className="text-center">
							<p className="text-gray-600">
								Also visit our{' '}
								<Link
									to="/bearden"
									className="font-medium text-primary hover:underline"
								>
									Bearden (West Knoxville) location
								</Link>
								.
							</p>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}
