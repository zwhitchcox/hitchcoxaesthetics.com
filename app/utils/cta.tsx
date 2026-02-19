import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '#app/components/ui/icon.js'
import { gtag } from './misc'
import { usePhone } from './phone-context'

/**
 * CTA bar at the bottom of every page. Uses the phone context for
 * location-specific numbers. GTM callback can still override.
 * Memoized to prevent re-renders that would reset GTM's DOM phone replacement.
 */
export const CTA = memo(function CTA() {
	const phoneIconRef = useRef<SVGSVGElement>(null)
	const calendarIconRef = useRef<SVGSVGElement>(null)
	const contextPhone = usePhone()
	const [gtmPhone, setGtmPhone] = useState<{
		formatted: string
		mobile: string
	} | null>(null)

	// The displayed phone: GTM override wins if set, otherwise use context
	const phone = gtmPhone ?? {
		formatted: contextPhone.formatted,
		mobile: contextPhone.raw,
	}

	useEffect(() => {
		const wiggleIcons = () => {
			if (calendarIconRef.current) {
				calendarIconRef.current.classList.add('wiggle')
			}
			setTimeout(() => {
				if (phoneIconRef.current) {
					phoneIconRef.current.classList.add('wiggle')
				}
			}, 1000)
			setTimeout(() => {
				if (calendarIconRef.current) {
					calendarIconRef.current.classList.remove('wiggle')
				}
			}, 3000)
			setTimeout(() => {
				if (phoneIconRef.current) {
					phoneIconRef.current.classList.remove('wiggle')
				}
			}, 4000)
		}

		const interval = setInterval(wiggleIcons, 10000)

		return () => clearInterval(interval)
	}, [])

	const callback = useCallback((formatted: string, mobile: string) => {
		if (!(formatted && mobile)) {
			return
		}
		setGtmPhone({ formatted, mobile })
	}, [])

	useEffect(() => {
		gtag('config', `${ENV.GA_CONVERSION_ID}/${ENV.GA_CONVERSION_LABEL}`, {
			phone_conversion_number: ENV.GA_PHONE_NUMBER,
			phone_conversion_callback: callback,
		})
	}, [callback])

	return (
		<div
			className={`fade-in shadow-top fixed bottom-0 left-0 right-0 z-50 flex h-[3.2rem] items-center justify-center bg-black py-4 text-center`}
		>
			<div className="flex w-full animate-fade-in justify-evenly px-2 text-sm sm:text-xl">
				<a
					className="icon-container flex w-56 items-center justify-center rounded-md bg-black px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-gray-800"
					href="https://hitchcoxaesthetics.janeapp.com/#/staff_member/1"
				>
					<Icon
						name="calendar"
						className="wiggle-hover mr-2 inline-block h-6 w-6"
						ref={calendarIconRef}
					/>
					Book Online
				</a>
				<a
					// eslint-disable-next-line remix-react-routes/use-link-for-routes
					href={`tel:${phone.mobile}`}
					className="icon-container flex w-56 items-center justify-center rounded-md bg-black px-3 py-2 text-center font-semibold text-white transition duration-300 ease-in-out hover:bg-gray-800"
				>
					<Icon
						name="phone"
						className="wiggle-hover mb-[-1px] mr-2 inline-block h-6 w-6"
						ref={phoneIconRef}
					/>
					<div className="mt-[-0px]">{phone.formatted}</div>
				</a>
			</div>
		</div>
	)
})
