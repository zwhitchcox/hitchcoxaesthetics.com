import { json, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Hero } from '#app/components/hero.js'
import { ServiceCardGrid } from '#app/components/service-card-grid.js'
import { Icon } from '#app/components/ui/icon.js'
import { useBlvdUrl } from '#app/utils/blvd-context.tsx'
import { getLocationById, mapsUrl } from '#app/utils/locations.js'
import { getSocialMetas } from '#app/utils/seo.ts'
import { getCategoryPages } from '#app/utils/site-pages.server.js'

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title:
			'West Hills Med Spa | Botox, Fillers & Lasers | Sarah Hitchcox Aesthetics',
		description:
			'Sarah Hitchcox Aesthetics near West Hills, Knoxville (7600 Kingston Pike). Expert Botox, dermal fillers, laser treatments, and GLP-1 weight loss.',
		pathname: location.pathname,
	})

export async function loader() {
	const categories = getCategoryPages().map(c => ({
		slug: c.path,
		serviceName: c.name,
		shortDescription: c.shortDescription,
		heroImage: c.heroImage,
	}))
	return json({ categories })
}

export default function WestHillsLocation() {
	const { categories } = useLoaderData<typeof loader>()
	const location = getLocationById('west-hills')!
	const blvdUrl = useBlvdUrl()

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'MedicalBusiness',
		name: location.gbp.title,
		description:
			'Medical spa near West Hills, Knoxville offering Botox, dermal fillers, laser treatments, and GLP-1 weight loss.',
		url: 'https://hitchcoxaesthetics.com/west-hills',
		hasMap: mapsUrl(location),
		sameAs: [mapsUrl(location)],
		telephone: location.phone,
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
			<div className="font-poppins flex w-full flex-col bg-background">
				<Hero
					image="/img/sarah.jpg"
					imageAlt="Sarah Hitchcox - West Hills Med Spa"
					topText="SARAH HITCHCOX"
					bottomText="AESTHETICS"
					subText="West Hills Med Spa"
					ctaText="Book Appointment"
					ctaHref={blvdUrl}
				/>

				<div className="mx-auto w-full max-w-4xl px-6 py-16">
					<div className="space-y-12">
						<div className="text-center">
							<h2 className="mb-4 text-3xl font-bold text-foreground">
								Knoxville Med Spa | West Hills
							</h2>
							<p className="text-lg leading-relaxed text-muted-foreground">
								Just off Kingston Pike, Sarah Hitchcox Aesthetics brings premier
								medical spa services to the West Hills community. We specialize
								in natural-looking results through expert Botox injections,
								dermal fillers, and cutting-edge skin treatments. Visit us for a
								personalized consultation tailored to your aesthetic goals.
							</p>
						</div>

						<div>
							<h2 className="text-center text-2xl font-bold text-foreground">
								Knoxville Med Spa Services Available in West Hills
							</h2>
							<div className="mt-8">
								<ServiceCardGrid services={categories} variant="thumbnail" />
							</div>
						</div>

						<div className="rounded-xl bg-muted/50 p-8 text-center">
							<h3 className="mb-4 text-2xl font-semibold text-foreground">
								Visit Our West Hills Location
							</h3>
							<p className="mb-6 text-muted-foreground">
								We are located at {location.address}, near West Hills off
								Kingston Pike. Ample parking is available.
							</p>
							<div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
								<Link
									to={`tel:${location.phoneRaw}`}
									reloadDocument
									className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-6 py-3 font-semibold text-foreground/80 hover:bg-muted"
								>
									Call {location.phone}
								</Link>
								<a
									href={location.googleMapsDirectionsUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
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
									title="Map of Sarah Hitchcox Aesthetics West Hills"
									style={{ border: 0 }}
								/>
							</div>
						</div>

						<div className="text-center">
							<p className="text-muted-foreground">
								Also visit our{' '}
								<Link
									to="/bearden"
									className="font-medium text-primary hover:underline"
								>
									Bearden
								</Link>{' '}
								and{' '}
								<Link
									to="/farragut"
									className="font-medium text-primary hover:underline"
								>
									Farragut
								</Link>{' '}
								locations.
							</p>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}
