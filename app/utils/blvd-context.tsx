import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useHydrated } from 'remix-utils/use-hydrated'

import { buildBlvdUrl, replaceBlvdBookingUrls } from '#app/utils/blvd.ts'
import { addGTM, gtag } from '#app/utils/misc.tsx'

type BlvdContextValue = {
	blvdUrl: string
	clientId: null | string
	hasTrackingParams: boolean
	sessionId: null | string
}

const BlvdContext = createContext<BlvdContextValue>({
	blvdUrl: buildBlvdUrl(),
	clientId: null,
	hasTrackingParams: false,
	sessionId: null,
})

export function BlvdProvider({
	children,
	gaMeasurementId,
	gtmId,
}: {
	children: React.ReactNode
	gaMeasurementId?: string
	gtmId?: string
}) {
	const isHydrated = useHydrated()
	const [clientId, setClientId] = useState<null | string>(null)
	const [sessionId, setSessionId] = useState<null | string>(null)

	useEffect(() => {
		if (typeof window === 'undefined' || !isHydrated) {
			return
		}

		window.gtag = gtag

		if (gtmId) {
			addGTM(gtmId)
		}
	}, [gtmId, isHydrated])

	useEffect(() => {
		if (!gaMeasurementId || typeof window === 'undefined' || !isHydrated) {
			return
		}

		let cancelled = false

		window.gtag = gtag

		window.gtag('get', gaMeasurementId, 'client_id', (value: unknown) => {
			if (cancelled || typeof value !== 'string' || value.length === 0) {
				return
			}

			setClientId(value)
		})

		window.gtag('get', gaMeasurementId, 'session_id', (value: unknown) => {
			if (cancelled || typeof value !== 'string' || value.length === 0) {
				return
			}

			setSessionId(value)
		})

		return () => {
			cancelled = true
		}
	}, [gaMeasurementId, isHydrated])

	const value = useMemo<BlvdContextValue>(
		() => ({
			blvdUrl: buildBlvdUrl(),
			clientId,
			hasTrackingParams: Boolean(clientId && sessionId),
			sessionId,
		}),
		[clientId, sessionId],
	)

	return <BlvdContext.Provider value={value}>{children}</BlvdContext.Provider>
}

export function useBlvdUrl() {
	return useMemo(() => buildBlvdUrl(), [])
}

export function useBlvdHtml(html: string) {
	const blvdUrl = useBlvdUrl()
	return useMemo(() => replaceBlvdBookingUrls(html, blvdUrl), [blvdUrl, html])
}

export function useBlvdTracking() {
	return useContext(BlvdContext)
}
