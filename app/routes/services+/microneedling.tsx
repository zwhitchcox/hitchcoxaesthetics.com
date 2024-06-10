import { useCallback, useEffect, useState } from 'react'
import Logo from '#app/components/logo.js'

const description = `Microneedling is a transformative skincare service designed to rejuvenate and revitalize your skin. This minimally invasive procedure utilizes fine needles to create micro-injuries on the skin surface, promoting natural collagen and elastin production. Ideal for addressing wrinkles, scars, and enhancing overall skin texture, microneedling offers a safe and effective solution for achieving a youthful, radiant complexion.`

const faq = [
	{
		question: 'What is microneedling?',
		answer:
			'Microneedling is a cosmetic procedure that involves pricking the skin with tiny, sterilized needles. The small wounds cause your body to make more collagen and elastin, which heal your skin and help to achieve a more youthful appearance.',
	},
	{
		question: 'Is microneedling painful?',
		answer:
			'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
	},
	{
		question: 'How long does it take to see results from microneedling?',
		answer:
			'While some effects can be seen immediately, optimal results typically emerge after several sessions and over a few months as collagen production increases.',
	},
	{
		question: 'What are the side effects of microneedling?',
		answer:
			'Common side effects include redness, swelling, and mild irritation, similar to a sunburn, which usually subside within a few days.',
	},
	{
		question: 'Can microneedling be done on all skin types?',
		answer: 'Yes, microneedling is safe for all skin types.',
	},
	{
		question: 'How often can I undergo microneedling?',
		answer:
			'It is generally recommended to wait 4-6 weeks between sessions to allow the skin to heal and regenerate.',
	},
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
							src="/img/microneedling/before.jpg"
							alt="Sarah Hitchcox"
							className="before-image absolute top-0 z-10 mt-[0rem] h-auto max-w-full object-contain lg:mt-0 lg:translate-y-[7%]"
						/>
						<img
							src="/img/microneedling/after.jpg"
							alt="Sarah Hitchcox"
							className="after-image absolute top-0 z-10 mt-[0rem] h-auto max-w-full object-contain lg:mt-0 lg:translate-y-[7%]"
						/>
					</div>
					<div className="absolute bottom-0 z-10 w-full bg-white py-4 text-black sm:relative sm:my-0 sm:flex-1">
						<div className="flex h-full w-full animate-slide-top flex-col items-center justify-center space-y-4 [animation-fill-mode:backwards] lg:space-y-8">
							<div className="flex flex-col items-center justify-center">
								<div className="animate-fade-in whitespace-nowrap text-xl tracking-[.4rem] md:text-2xl lg:text-3xl">
									MICRONEEDLING
								</div>
								<Logo className="my-2 h-8 w-8 animate-spin-in text-primary [animation-fill-mode:backwards] md:h-10 md:w-10 lg:h-10 lg:w-10" />
								<div className="text-md text-center tracking-[.3rem] text-gray-600 sm:tracking-[.3rem] md:text-xl">
									for acne scars, fine lines, wrinkles
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
									onClick={() => scrollToId('microneedling')}
								>
									Learn More
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div
				id="microneedling"
				className="bg-gray-100 px-4 py-8 pb-32 sm:px-8 lg:px-16"
			>
				<h1 className="mb-6 text-center text-3xl font-semibold text-gray-800">
					Microneedling | Knoxville
				</h1>
				<p className="mx-auto mb-8 max-w-2xl text-lg text-gray-700">
					{description}
				</p>
				<h2 className="mb-6 text-center text-2xl font-semibold text-gray-800">
					FAQs
				</h2>
				<ul className="mx-auto max-w-2xl space-y-4">
					{faq.map(item => (
						<li
							key={item.question}
							className="rounded-md bg-white p-4 shadow-md"
						>
							<h3 className="mb-2 text-lg font-semibold text-gray-800">
								{item.question}
							</h3>
							<p className="text-gray-700">{item.answer}</p>
						</li>
					))}
				</ul>
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
