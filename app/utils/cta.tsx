import { Icon } from '#app/components/ui/icon.js'
import { safeGtag } from './misc'

export function CTA() {
	// const [showCTA, setShowCTA] = useState(false)

	// useEffect(() => {
	// 	if (
	// 		typeof window !== 'undefined' &&
	// 		window.scrollY > window.innerHeight / 2
	// 	) {
	// 		setShowCTA(true)
	// 	}
	// }, [])

	// const handleScroll = useCallback(() => {
	// 	if (window.scrollY > window.innerHeight / 2) {
	// 		setShowCTA(true)
	// 	} else {
	// 		setShowCTA(false)
	// 	}
	// }, [])

	// useEffect(() => {
	// 	window.addEventListener('scroll', handleScroll)
	// 	return () => window.removeEventListener('scroll', handleScroll)
	// }, [handleScroll])
	const showCTA = true

	return showCTA ? (
		<div
			className={`fixed bottom-0 left-0 right-0 z-50 bg-black py-4 text-center ${showCTA ? 'fade-in' : ''} flex h-[3.7rem] items-center justify-center`}
		>
			<div className="text-md flex w-full animate-fade-in justify-center px-2 sm:text-xl">
				<a
					className="flex w-[50%] items-center justify-center rounded-md bg-black px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-gray-800"
					href="https://hitchcoxaesthetics.janeapp.com"
				>
					<Icon name="calendar" className="mr-2 inline-block h-6 w-6" />
					Book Online
				</a>
				<a
					// eslint-disable-next-line remix-react-routes/use-link-for-routes
					href="tel:+18652489365"
					className="flex w-[50%] items-center justify-center rounded-md bg-black px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-gray-800"
					onClick={() => {
						safeGtag('event', 'conversion_event_phone_call_lead', {
							event_category: 'Phone Call',
							event_label: '(865) 214-7238',
						})
					}}
				>
					<Icon name="phone" className="mb-[-1px] mr-2 inline-block h-6 w-6" />
					<div className="mt-[-0px]">(865) 214-7238</div>
				</a>
			</div>
		</div>
	) : null
}
