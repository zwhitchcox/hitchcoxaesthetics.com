import { type MetaFunction } from '@remix-run/node'
import { useCallback, useEffect, useState } from 'react'
import Logo from '#app/components/logo.js'

export const meta: MetaFunction = () => [
	{ title: 'Filler - Knoxville - Sarah Hitchcox Aesthetics' },
]

export default function () {
	const [showCTA, setShowCTA] = useState(false)

	useEffect(() => {
		if (
			typeof window !== 'undefined' &&
			window.scrollY > window.innerHeight / 2
		) {
			setShowCTA(true)
		}
	}, [])

	const scrollToId = useCallback((id: string) => {
		const element = document.getElementById(id)
		element?.scrollIntoView({ behavior: 'smooth' })
	}, [])

	const handleScroll = useCallback(() => {
		if (window.scrollY > window.innerHeight / 2) {
			setShowCTA(true)
		} else {
			setShowCTA(false)
		}
	}, [])

	useEffect(() => {
		window.addEventListener('scroll', handleScroll)
		return () => window.removeEventListener('scroll', handleScroll)
	}, [handleScroll])

	return (
		<>
			<div className="font-poppins flex w-full flex-col bg-white">
				<div className="relative h-[100dvh] w-full flex-col overflow-hidden sm:flex sm:flex-row">
					<div className="flex flex-1 items-center justify-center bg-[#070707] sm:[clip-path:polygon(0_0,_100%_0,_90%_100%,_0%_100%)] ">
						<img
							src="/img/filler/before.jpg"
							alt="Sarah Hitchcox"
							className="before-image absolute top-0 z-10 mt-[-3rem] h-auto max-w-full translate-y-[7%] object-contain"
						/>
						<img
							src="/img/filler/after.jpg"
							alt="Sarah Hitchcox"
							className="after-image absolute top-0 z-10 mt-[-3rem] h-auto max-w-full translate-y-[7%] object-contain"
						/>
					</div>
					<div className="absolute bottom-0 z-10 w-full bg-white py-4 text-black sm:relative sm:my-0 sm:flex-1">
						<div className="flex h-full w-full animate-slide-top flex-col items-center justify-center space-y-4 [animation-fill-mode:backwards] lg:space-y-8">
							<div className="flex flex-col items-center justify-center">
								<div className="animate-fade-in whitespace-nowrap text-xl tracking-[.4rem] md:text-2xl lg:text-3xl">
									FILLER
								</div>
								<Logo className="my-2 h-8 w-8 animate-spin-in text-primary [animation-fill-mode:backwards] md:h-10 md:w-10 lg:h-10 lg:w-10" />
								<div className="text-md text-center tracking-[.3rem] text-gray-600 sm:tracking-[.3rem] md:text-xl">
									for lips, cheeks, and facial balancing
								</div>
							</div>
							<div className="flex flex-col items-center justify-center space-y-2">
								<a
									className="text-md mx-2 my-1 w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
									href="https://hitchcoxaesthetics.janeapp.com"
								>
									Book Now
								</a>
								<button
									className="text-md mx-2 my-1 w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
									onClick={() => scrollToId('filler')}
								>
									Learn More
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div
				className="bg-gray-50 px-6 py-12 pb-32 sm:px-12 lg:px-24"
				id="filler"
			>
				<div className="flex w-full flex-col items-center justify-center space-y-12">
					<h1 className="text-center text-5xl font-bold text-gray-800">
						Filler | Knoxville
					</h1>
					<div className="w-full max-w-2xl space-y-8">
						<h2 className="text-3xl font-semibold text-gray-700">
							About Juvéderm
						</h2>
						<p className="text-xl">
							Juvéderm is a collection of fillers made from hyaluronic acid, a
							natural substance in the skin that contributes to volume and
							hydration. Approved by the FDA, Juvéderm is designed to restore
							age-related volume loss in the face, enhance lip fullness, and
							smooth out facial lines and folds. The gel-like substance is
							skillfully injected under the skin to provide a smooth, natural
							look and feel.
						</p>
						<h2 className="text-3xl font-semibold text-gray-700">Pricing</h2>
						<p className="text-xl">
							Our Juvéderm treatments are priced at $750 per syringe. The number
							of syringes needed varies based on treatment goals and the areas
							of the face being enhanced.
						</p>
					</div>
				</div>
			</div>
			{showCTA && (
				<div
					className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-800 py-4 text-center ${showCTA ? 'fade-in' : ''}`}
				>
					<div className="flex justify-center space-x-4">
						<a
							className="text-md w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
							href="https://hitchcoxaesthetics.janeapp.com"
						>
							Book Now
						</a>
					</div>
				</div>
			)}
		</>
	)
}
