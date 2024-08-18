import { useCallback, useEffect, useState } from 'react'
import { safeGtag } from './misc'

export function CTA() {
	const [showCTA, setShowCTA] = useState(false)

	useEffect(() => {
		if (
			typeof window !== 'undefined' &&
			window.scrollY > window.innerHeight / 2
		) {
			setShowCTA(true)
		}
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

	return showCTA ? (
		<div
			className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-800 py-4 text-center ${showCTA ? 'fade-in' : ''}`}
		>
			<div className="flex justify-center space-x-4">
				<a
					className="text-md w-48 rounded-md bg-gray-800 px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-black sm:w-48 sm:text-lg"
					href="https://hitchcoxaesthetics.janeapp.com"
				>
					Book Online
				</a>
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
			</div>
		</div>
	) : null
}
