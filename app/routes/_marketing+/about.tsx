import { type MetaFunction } from '@remix-run/node'

export const meta: MetaFunction = () => [
	{
		title:
			'About Sarah Hitchcox | Knoxville and Farragut | Sarah Hitchcox Aesthetics',
	},
	{
		name: 'description',
		content:
			'Meet Sarah Hitchcox, RN and aesthetic injector in Knoxville and Farragut, TN. Specializing in Botox, dermal fillers, and preventative treatments with a focus on natural beauty.',
	},
	{
		property: 'og:title',
		content: 'About Sarah Hitchcox | Knoxville and Farragut Med Spa',
	},
	{
		property: 'og:description',
		content:
			'Meet Sarah Hitchcox, RN and aesthetic injector in Knoxville and Farragut, TN. Specializing in Botox, dermal fillers, and preventative treatments.',
	},
]

export default function About() {
	return (
		<div className="font-poppins bg-white py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-6 lg:px-8">
				<div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
					{/* Image Column */}
					<div className="relative mx-auto w-full max-w-md lg:max-w-none">
						<div className="aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 shadow-xl">
							<img
								src="/img/sarah.jpg"
								alt="Sarah Hitchcox, RN - Aesthetic Injector"
								className="h-full w-full object-cover object-center"
							/>
						</div>
						{/* Optional decorative element */}
						<div className="absolute -bottom-6 -right-6 -z-10 h-full w-full rounded-2xl bg-gray-50" />
					</div>

					{/* Content Column */}
					<div className="flex flex-col space-y-8">
						<div>
							<h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
								Meet Sarah Hitchcox, RN
							</h1>
							<h2 className="mt-4 text-xl font-medium text-primary">
								Aesthetic Nurse Specialist in Knoxville & Farragut
							</h2>
						</div>

						<div className="space-y-6 text-lg leading-relaxed text-gray-600">
							<p>
								Sarah Hitchcox is a Knoxville native and dedicated Registered
								Nurse specializing in medical aesthetics. She brings a unique
								combination of clinical expertise and a passion for enhancing
								natural beauty to the Knoxville and Farragut area.
							</p>
							<p>
								With a background primarily in the emergency department, Sarah
								has developed a profound understanding of patient care and
								empathy—skills she now applies daily in the field of aesthetics.
								She believes in the power of preventative treatments and focuses
								on accentuating each client's unique features rather than
								altering them.
							</p>
							<p>
								Currently working towards her Doctor of Nursing Practice degree,
								Sarah is committed to staying at the forefront of nursing
								practice and education.
							</p>
							<blockquote className="border-l-4 border-primary pl-6 italic text-gray-800">
								"My practice is grounded in nurturing a trusting relationship
								with each client, ensuring a seamless journey to enhanced
								natural beauty."
							</blockquote>
							<p>
								At her med spa locations in Knoxville and Farragut, Sarah offers
								personalized Botox and dermal filler services, always
								emphasizing patient safety, satisfaction, and the celebration of
								individuality.
							</p>
						</div>

						<div className="pt-4">
							<a
								href="https://hitchcoxaesthetics.janeapp.com"
								className="inline-block rounded-md bg-black px-8 py-4 text-center font-semibold text-white transition duration-300 hover:bg-gray-800"
							>
								Book a Consultation with Sarah
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
