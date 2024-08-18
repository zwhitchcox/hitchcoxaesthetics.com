import { type MetaFunction } from '@remix-run/node'

import { useOutletContext } from '@remix-run/react'
import Logo from '#app/components/logo.js'
import { safeGtag } from '#app/utils/misc.js'
// import { Button } from '#app/components/ui/button'

export const meta: MetaFunction = () => [{ title: 'Sarah Hitchcox Aesthetics' }]

export default function Index() {
	const context = useOutletContext<{
		setIsMenuOpen: (isOpen: boolean) => void
	}>()

	return (
		<div className="font-poppins flex w-full flex-col bg-white">
			<div className="relative h-[100dvh] w-full flex-col overflow-hidden sm:flex sm:flex-row">
				<div className="flex flex-1 items-center justify-center bg-[#070707] sm:[clip-path:polygon(0_0,_100%_0,_90%_100%,_0%_100%)] ">
					<img
						src="/img/sarah.jpg"
						alt="Sarah Hitchcox"
						className="z-10 mt-[-3rem] h-auto max-w-full translate-y-[7%] animate-fade-in object-contain"
					/>
				</div>
				<div className="absolute bottom-0 z-10 w-full bg-white py-4 text-black sm:relative sm:my-0 sm:flex-1">
					<div className="flex h-full w-full animate-slide-top flex-col items-center justify-center space-y-4 [animation-fill-mode:backwards]">
						<div className="flex flex-col items-center justify-center">
							<Logo className="lg:h-22 lg:w-22 my-4 h-14 w-14 animate-spin-in text-primary [animation-fill-mode:backwards] md:h-20 md:w-20" />
							<div className="my-1 flex flex-col items-center justify-center gap-2 lg:my-2">
								<div className="mb-[-3px] whitespace-nowrap text-xl tracking-[.5rem] sm:tracking-[1rem] md:text-2xl lg:text-3xl">
									SARAH HITCHCOX
								</div>
								<div className="text-lg tracking-[.3rem] text-gray-600 sm:tracking-[.8rem] md:text-xl lg:my-2 lg:text-2xl">
									AESTHETICS
								</div>
							</div>
						</div>
						<div className="flex flex-col items-center justify-center space-y-2">
							<a
								// eslint-disable-next-line remix-react-routes/use-link-for-routes
								href="tel:+18652489365"
								className="text-md mx-2 w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
								onClick={() => {
									safeGtag('event', 'conversion_event_phone_call_lead', {
										event_category: 'Phone Call',
										event_label: '(865) 214-7238',
									})
								}}
							>
								(865) 214-7238
							</a>
							<a
								className="text-md mx-2 w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
								href="https://hitchcoxaesthetics.janeapp.com"
							>
								Book Online
							</a>
							<button
								className="text-md mx-2  w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-center font-semibold text-black transition duration-300 ease-in-out hover:bg-gray-200 sm:w-48 sm:text-lg"
								onClick={() => context.setIsMenuOpen(true)}
							>
								Learn More
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
