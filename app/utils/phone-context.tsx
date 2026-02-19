import { Link, useLocation } from '@remix-run/react'
import { createContext, memo, useContext, useRef, useState } from 'react'
import { DEFAULT_PHONE, DEFAULT_PHONE_RAW, getPhoneForPath } from './locations'

export type PhoneInfo = { formatted: string; raw: string }

const PhoneContext = createContext<PhoneInfo>({
	formatted: DEFAULT_PHONE,
	raw: DEFAULT_PHONE_RAW,
})

/**
 * PhoneProvider detects the location from the current URL and provides the
 * appropriate phone number via context. It only updates state when the resolved
 * phone number actually changes (i.e., the user navigates between location
 * contexts like knoxville <-> farragut <-> main). This prevents unnecessary
 * re-renders that would cause GTM to have to re-replace the phone number in
 * the DOM on every client-side navigation.
 */
export function PhoneProvider({ children }: { children: React.ReactNode }) {
	const location = useLocation()
	const resolved = getPhoneForPath(location.pathname)

	// Use a ref to track the current phone so we can compare without triggering
	// re-renders. Only call setState when the phone actually changes.
	const currentRef = useRef(resolved)
	const [phone, setPhone] = useState(resolved)

	if (currentRef.current.raw !== resolved.raw) {
		currentRef.current = resolved
		setPhone(resolved)
	}

	return <PhoneContext.Provider value={phone}>{children}</PhoneContext.Provider>
}

/**
 * Hook to get the current location-specific phone number.
 * Returns { formatted: "(865) 489-8008", raw: "8654898008" }
 */
export function usePhone(): PhoneInfo {
	return useContext(PhoneContext)
}

/**
 * Memoized phone link component. Only re-renders when the phone number
 * actually changes, preserving GTM's DOM modifications during client-side
 * navigation.
 */
export const PhoneLink = memo(function PhoneLink({
	className,
}: {
	className?: string
}) {
	const phone = usePhone()
	return (
		<Link to={`tel:${phone.raw}`} reloadDocument className={className}>
			{phone.formatted}
		</Link>
	)
})

/**
 * Memoized plain-text phone display. Only re-renders when the phone number
 * actually changes.
 */
export const PhoneText = memo(function PhoneText({
	className,
}: {
	className?: string
}) {
	const phone = usePhone()
	return <span className={className}>{phone.formatted}</span>
})
