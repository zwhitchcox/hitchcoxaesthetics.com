import { type MetaFunction } from '@remix-run/node'
import { Link } from '@remix-run/react'
import { Icon } from '#app/components/ui/icon.js'
import { publicLocations, formatAddress } from '#app/utils/locations.js'
import { PhoneLink } from '#app/utils/phone-context.tsx'
import { getSocialMetas } from '#app/utils/seo.ts'

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title: 'Contact & Support | Sarah Hitchcox Aesthetics',
		description:
			'Contact Sarah Hitchcox Aesthetics in Knoxville and Farragut, TN. Call, email, or visit one of our two locations for Botox, fillers, lasers, and weight loss.',
		pathname: location.pathname,
	})

export default function SupportRoute() {
	return (
		<div className="font-poppins mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
			<h1 className="mb-8 text-3xl font-bold text-gray-900">
				Contact & Support
			</h1>
			<p className="mb-8 text-lg text-gray-600">
				Questions about a treatment, your appointment, or anything else? Reach
				out and we'll be happy to help.
			</p>
			<div className="mb-12 space-y-4">
				<p className="flex items-center gap-2 text-lg">
					<Icon name="envelope-closed" className="h-5 w-5" />
					<Link
						to="mailto:sarah@hitchcoxaesthetics.com"
						className="hover:text-primary hover:underline"
					>
						sarah@hitchcoxaesthetics.com
					</Link>
				</p>
				<PhoneLink className="text-lg hover:text-primary" />
			</div>
			<div className="grid gap-8 md:grid-cols-2">
				{publicLocations.map(location => (
					<div key={location.id} className="space-y-2">
						<Link to={`/${location.id}`}>
							<h2 className="text-xl font-semibold hover:text-primary hover:underline">
								{location.displayName} Location
							</h2>
						</Link>
						<p className="text-lg">{formatAddress(location)}</p>
						<a
							href={location.googleMapsDirectionsUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 text-primary hover:underline"
						>
							<Icon name="map-pin" className="h-4 w-4" />
							Get Directions
						</a>
					</div>
				))}
			</div>
			<p className="mt-12 text-gray-600">
				Ready to book?{' '}
				<Link to="/book" className="text-primary hover:underline">
					Schedule your appointment online
				</Link>
				.
			</p>
		</div>
	)
}
