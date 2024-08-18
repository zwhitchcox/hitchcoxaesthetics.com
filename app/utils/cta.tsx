import { useEffect, useRef } from 'react'
import { Icon } from '#app/components/ui/icon.js'
import { safeGtag } from './misc'

export function CTA() {
	const phoneIconRef = useRef<SVGSVGElement>(null)
	const calendarIconRef = useRef<SVGSVGElement>(null)
	useEffect(() => {
		const wiggleIcons = () => {
			// Start calendar icon wiggle
			if (calendarIconRef.current) {
				calendarIconRef.current.classList.add('wiggle')
			}

			// Start phone icon wiggle after 1000ms
			setTimeout(() => {
				if (phoneIconRef.current) {
					phoneIconRef.current.classList.add('wiggle')
				}
			}, 1000)

			// Remove calendar icon wiggle after 3000ms
			setTimeout(() => {
				if (calendarIconRef.current) {
					calendarIconRef.current.classList.remove('wiggle')
				}
			}, 3000)

			// Remove phone icon wiggle after it has wiggled for 3000ms (4000ms after the initial start)
			setTimeout(() => {
				if (phoneIconRef.current) {
					phoneIconRef.current.classList.remove('wiggle')
				}
			}, 4000)
		}

		const interval = setInterval(wiggleIcons, 10000)

		return () => clearInterval(interval)
	}, [])
	const showCTA = true

	return showCTA ? (
		<div
			className={`fixed bottom-0 left-0 right-0 z-50 bg-black py-4 text-center ${showCTA ? 'fade-in' : ''} flex h-[3.7rem] items-center justify-center`}
		>
			<div className="text-md flex w-full animate-fade-in justify-evenly px-2 sm:text-xl">
				<a
					className="flex w-56 items-center justify-center rounded-md bg-black px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-gray-800"
					href="https://hitchcoxaesthetics.janeapp.com/#/staff_member/1"
				>
					<Icon
						name="calendar"
						className="mr-2 inline-block h-6 w-6"
						ref={calendarIconRef}
					/>
					Book Online
				</a>
				<a
					// eslint-disable-next-line remix-react-routes/use-link-for-routes
					href="tel:+18652489365"
					className="flex w-56 items-center justify-center rounded-md bg-black px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-gray-800"
					onClick={() => {
						safeGtag('event', 'conversion_event_phone_call_lead', {
							event_category: 'Phone Call',
							event_label: '(865) 214-7238',
						})
					}}
				>
					<Icon
						name="phone"
						className="mb-[-1px] mr-2 inline-block h-6 w-6"
						ref={phoneIconRef}
					/>
					<div className="mt-[-0px]">(865) 214-7238</div>
				</a>
			</div>
		</div>
	) : null
}
