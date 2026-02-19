import { json, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData, useOutletContext } from '@remix-run/react'
import { Hero } from '#app/components/hero.js'
import { ServiceCardGrid } from '#app/components/service-card-grid.js'
import { Icon } from '#app/components/ui/icon.js'
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '#app/components/ui/tabs.js'
import { locationServices } from '#app/utils/location-service-data.server.js'
import { getCategoryPages } from '#app/utils/site-pages.server.js'

export const meta: MetaFunction = () => [
	{ title: 'Sarah Hitchcox Aesthetics | Knoxville and Farragut Medical Spa' },
	{
		name: 'description',
		content:
			'Sarah Hitchcox Aesthetics is a premier med spa in Knoxville and Farragut, TN offering Botox, dermal fillers, laser treatments, microneedling, and medical weight loss.',
	},
	{
		property: 'og:title',
		content: 'Sarah Hitchcox Aesthetics | Knoxville and Farragut Medical Spa',
	},
	{
		property: 'og:description',
		content:
			'Premier med spa in Knoxville and Farragut, TN offering Botox, dermal fillers, laser treatments, microneedling, and medical weight loss.',
	},
]

function mapToLocationPath(p: string, locationId: string): string {
	const [first, ...rest] = p.split('/')
	return rest.length
		? `${locationId}-${first}/${rest.join('/')}`
		: `${locationId}-${first}`
}

export async function loader() {
	const categories = getCategoryPages()

	const knoxvilleCategories = categories.map(c => {
		const locSlug = mapToLocationPath(c.path, 'knoxville')
		const locData = locationServices[locSlug]
		return {
			slug: locSlug,
			serviceName: c.name,
			shortDescription: c.shortDescription,
			heroImage: locData?.heroImage ?? c.heroImage,
		}
	})

	const farragutCategories = categories.map(c => {
		const locSlug = mapToLocationPath(c.path, 'farragut')
		const locData = locationServices[locSlug]
		return {
			slug: locSlug,
			serviceName: c.name,
			shortDescription: c.shortDescription,
			heroImage: locData?.heroImage ?? c.heroImage,
		}
	})

	return json({ knoxvilleCategories, farragutCategories })
}

export default function Index() {
	const { knoxvilleCategories, farragutCategories } =
		useLoaderData<typeof loader>()
	const _context = useOutletContext<{
		setIsMenuOpen: (isOpen: boolean) => void
	}>()

	return (
		<div className="font-poppins flex w-full flex-col bg-white">
			<Hero
				image="/img/sarah.jpg"
				imageAlt="Sarah Hitchcox"
				topText="SARAH HITCHCOX"
				bottomText="AESTHETICS"
				subText="Knoxville and Farragut Med Spa"
				ctaText="Med Spa Services"
				onCtaClick={() => {
					const element = document.getElementById('services')
					element?.scrollIntoView({ behavior: 'smooth' })
				}}
			/>

			{/* Welcome / Intro Section */}
			<div className="bg-white py-16 text-center">
				<div className="mx-auto max-w-3xl px-6">
					<h2 className="mb-6 text-3xl font-bold text-gray-900">
						Enhance Your Natural Beauty
					</h2>
					<p className="text-lg leading-relaxed text-gray-600">
						At Sarah Hitchcox Aesthetics, we believe in subtle, natural-looking
						results that help you look and feel your best. Specializing in
						injectables, laser treatments, and medical grade skincare, our goal
						is to provide a personalized experience tailored to your unique
						needs.
					</p>
					<div className="mt-8">
						<Link
							to="/about"
							className="inline-flex items-center text-primary hover:underline"
						>
							Meet Sarah <Icon name="arrow-right" className="ml-2 h-4 w-4" />
						</Link>
					</div>
				</div>
			</div>

			{/* Services Section with Location Tab Switcher */}
			<div id="services" className="bg-gray-50 py-20">
				<div className="mx-auto max-w-7xl px-6">
					<h2 className="mb-8 text-center text-3xl font-bold text-gray-900">
						Medical Aesthetic Services
					</h2>

					<Tabs defaultValue="knoxville" className="w-full">
						<div className="mb-12 flex justify-center">
							<TabsList className="grid h-14 w-full max-w-md grid-cols-2 rounded-full bg-gray-100 p-1">
								<TabsTrigger
									value="knoxville"
									className="h-full rounded-full text-lg font-medium text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md"
								>
									Knoxville
								</TabsTrigger>
								<TabsTrigger
									value="farragut"
									className="h-full rounded-full text-lg font-medium text-gray-600 transition-all data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md"
								>
									Farragut
								</TabsTrigger>
							</TabsList>
						</div>

						<TabsContent value="knoxville">
							<ServiceCardGrid
								services={knoxvilleCategories}
								variant="thumbnail"
							/>
							<div className="mt-8 text-center">
								<Link
									to="/knoxville-med-spa"
									className="inline-flex items-center text-primary hover:underline"
								>
									View all Knoxville med spa services{' '}
									<Icon name="arrow-right" className="ml-2 h-4 w-4" />
								</Link>
							</div>
						</TabsContent>

						<TabsContent value="farragut">
							<ServiceCardGrid
								services={farragutCategories}
								variant="thumbnail"
							/>
							<div className="mt-8 text-center">
								<Link
									to="/farragut-med-spa"
									className="inline-flex items-center text-primary hover:underline"
								>
									View all Farragut med spa services{' '}
									<Icon name="arrow-right" className="ml-2 h-4 w-4" />
								</Link>
							</div>
						</TabsContent>
					</Tabs>
				</div>
			</div>

			{/* Locations Section */}
			<div className="py-20">
				<div className="mx-auto max-w-7xl px-6">
					<h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
						Our Medical Spa Locations
					</h2>
					<div className="grid gap-8 md:grid-cols-2">
						<div className="group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-gray-900 p-12 text-center text-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
							<div className="absolute inset-0 z-0 bg-gray-900" />
							<img
								src="/img/med-spa-2.webp"
								alt="Knoxville Med Spa Interior"
								className="absolute inset-0 z-0 h-full w-full object-cover opacity-60 grayscale transition-all duration-700 group-hover:scale-105 group-hover:grayscale-0"
								loading="lazy"
							/>
							<div className="absolute inset-0 z-10 bg-black/50 transition-opacity duration-300 group-hover:bg-black/40" />
							<div className="relative z-20 flex flex-col items-center">
								<h3 className="mb-4 text-3xl font-bold tracking-widest text-white shadow-black drop-shadow-md">
									KNOXVILLE MED SPA
								</h3>
								<p className="mb-8 text-lg font-medium text-white shadow-black drop-shadow-md">
									5113 Kingston Pike
								</p>
								<Link
									to="/knoxville-med-spa"
									className="rounded-md bg-white px-8 py-3 text-sm font-bold text-black transition hover:bg-gray-200"
								>
									Knoxville Services
								</Link>
							</div>
						</div>

						<div className="group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-gray-900 p-12 text-center text-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
							<div className="absolute inset-0 z-0 bg-gray-900" />
							<img
								src="/img/knoxville-med-spa.webp"
								alt="Farragut Med Spa Interior"
								className="absolute inset-0 z-0 h-full w-full object-cover opacity-60 grayscale transition-all duration-700 group-hover:scale-105 group-hover:grayscale-0"
								loading="lazy"
							/>
							<div className="absolute inset-0 z-10 bg-black/50 transition-opacity duration-300 group-hover:bg-black/40" />
							<div className="relative z-20 flex flex-col items-center">
								<h3 className="mb-4 text-3xl font-bold tracking-widest text-white shadow-black drop-shadow-md">
									FARRAGUT MED SPA
								</h3>
								<p className="mb-8 text-lg font-medium text-white shadow-black drop-shadow-md">
									102 S Campbell Station Rd
								</p>
								<Link
									to="/farragut-med-spa"
									className="rounded-md bg-white px-8 py-3 text-sm font-bold text-black transition hover:bg-gray-200"
								>
									Farragut Services
								</Link>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
