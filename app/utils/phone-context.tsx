import { Link } from '@remix-run/react'
import { createContext, memo, useContext } from 'react'
import { PHONE, PHONE_RAW } from './locations'

export type PhoneInfo = { formatted: string; raw: string }

const PhoneContext = createContext<PhoneInfo>({
	formatted: PHONE,
	raw: PHONE_RAW,
})

/**
 * PhoneProvider — provides the phone number via context.
 * Always uses the Bearden (primary) number. CallRail handles dynamic swapping.
 */
export function PhoneProvider({ children }: { children: React.ReactNode }) {
	return (
		<PhoneContext.Provider value={{ formatted: PHONE, raw: PHONE_RAW }}>
			{children}
		</PhoneContext.Provider>
	)
}

/**
 * Hook to get the phone number.
 * Returns { formatted: "(865) 489-8008", raw: "8654898008" }
 */
export function usePhone(): PhoneInfo {
	return useContext(PhoneContext)
}

/**
 * Memoized phone link component.
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
 * Memoized plain-text phone display.
 */
export const PhoneText = memo(function PhoneText({
	className,
}: {
	className?: string
}) {
	const phone = usePhone()
	return <span className={className}>{phone.formatted}</span>
})
