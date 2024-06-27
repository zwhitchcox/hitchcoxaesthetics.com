import { useLocation } from '@remix-run/react'
import Logo from '#app/components/logo.js'
import { scrollToId } from '#app/utils/misc.js'

export function ServiceHeader({ children }: { children: React.ReactNode }) {
	return <h2 className="text-3xl font-semibold text-gray-700">{children}</h2>
}

export function ServiceCheckMarks({
	bulletPoints,
}: {
	bulletPoints: { title: string; description: string }[]
}) {
	return (
		<ul className="list-none space-y-4 rounded-md bg-white p-4 shadow-md">
			{bulletPoints.map((point, index) => (
				<li key={index} className="flex flex-col space-y-2">
					<h3 className="text-xl font-semibold text-gray-800">
						<span className="mr-2 text-blue-500">✔️</span>
						{point.title}
					</h3>
					<p className="text-lg text-gray-600">{point.description}</p>
				</li>
			))}
		</ul>
	)
}

export default function ServiceLayout() {
	const location = useLocation()
	const service = location.pathname.split('/').pop()
	return (
		<>
			<div className="font-poppins flex w-full flex-col bg-white">
				<div className="relative h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden bg-[#070707] sm:flex sm:flex-row sm:bg-inherit">
					<div className="flex h-full w-full flex-1 items-center justify-center bg-[#070707] duration-1000 hover:grayscale-0 lg:[clip-path:polygon(0_0,_100%_0,_90%_100%,_0%_100%)]">
						<iframe
							src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3230.3167435991245!2d-83.99134392334948!3d35.939220815757366!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x885c3daeef676e4f%3A0x36d0dab4a91039cb!2sSarah%20Hitchcox%20Aesthetics!5e0!3m2!1sen!2sus!4v1719521149673!5m2!1sen!2sus"
							width="100%"
							height="100%"
							allowFullScreen={false}
							loading="lazy"
							referrerPolicy="no-referrer-when-downgrade"
							title="location"
						/>
					</div>
					<div className="absolute bottom-0 z-10 w-full bg-white py-4 text-black sm:relative sm:my-0 sm:flex-1">
						<div className="flex h-full w-full animate-slide-top flex-col items-center justify-center space-y-4 [animation-fill-mode:backwards] lg:space-y-8">
							<div className="flex flex-col items-center justify-center">
								<div className="animate-fade-in whitespace-nowrap text-xl tracking-[.4rem] md:text-2xl lg:text-3xl">
									Sarah Hitchcox Aesthetics
								</div>
								<Logo className="my-2 h-8 w-8 animate-spin-in text-primary [animation-fill-mode:backwards] md:h-10 md:w-10 lg:h-10 lg:w-10" />
								<div className="text-md text-center tracking-[.3rem] text-gray-600 sm:tracking-[.3rem] md:text-xl">
									Botox, Fillers, Laser Treatments, and More
								</div>
							</div>
							<div className="flex flex-col items-center justify-center space-y-2">
								<a
									className="text-md mx-2 my-1 w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
									href="https://hitchcoxaesthetics.janeapp.com"
								>
									Book Now
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
			{/* <div
				id={service!}
				className="bg-gray-50 px-6 py-12 pb-32 sm:px-12 lg:px-24"
			>
				<div className="flex w-full flex-col items-center justify-center space-y-12">
					<div className="w-full max-w-2xl space-y-8">
						<h1 className="text-center text-5xl font-bold text-gray-800">
							{title} | Knoxville
						</h1>
						<div className="flex flex-col space-y-6">{children}</div>
					</div>
				</div>
			</div>
			<CTA /> */}
		</>
	)
}
