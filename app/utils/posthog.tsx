import posthog from 'posthog-js'
import React, { createContext, useContext, useEffect, useState } from 'react'

type PostHogType = typeof posthog | undefined

const PostHogContext = createContext<PostHogType>(undefined)

interface PostHogProviderProps {
	children: React.ReactNode
	options?: any
	apiKey?: string
}

const PostHogProvider: React.FC<PostHogProviderProps> = ({
	children,
	options,
	apiKey,
}) => {
	const [posthogInstance, setPosthogInstance] = useState<
		PostHogType | undefined
	>(undefined)

	useEffect(() => {
		if (apiKey) {
			const instance = posthog.init(apiKey, options)
			setPosthogInstance(instance)
		} else {
			setPosthogInstance(undefined)
		}
	}, [apiKey, options])

	useEffect(() => {
		if (!posthogInstance) return
		if (typeof window === 'undefined') return
		const instance = posthogInstance

		function isBookingPath() {
			return (
				window.location.pathname === '/book' ||
				window.location.pathname.startsWith('/book/')
			)
		}

		function captureRuntimeBookingError({
			action,
			column,
			error,
			filename,
			line,
		}: {
			action: 'runtime_error' | 'unhandled_rejection'
			column?: number
			error: unknown
			filename?: string
			line?: number
		}) {
			if (!isBookingPath()) return

			instance.capture('booking_error', {
				booking_error_action: action,
				booking_error_area: 'runtime',
				booking_error_column: column,
				booking_error_filename: filename,
				booking_error_line: line,
				booking_error_message: redactClientErrorText(
					getClientErrorMessage(error),
				),
				booking_error_name: getClientErrorName(error),
				booking_error_source: 'client_global',
				booking_error_stack: redactClientErrorText(getClientErrorStack(error)),
				booking_error_url: window.location.href,
				booking_step: 'unknown',
			})
		}

		function handleError(event: ErrorEvent) {
			captureRuntimeBookingError({
				action: 'runtime_error',
				column: event.colno,
				error: event.error ?? event.message,
				filename: event.filename,
				line: event.lineno,
			})
		}

		function handleUnhandledRejection(event: PromiseRejectionEvent) {
			captureRuntimeBookingError({
				action: 'unhandled_rejection',
				error: event.reason,
			})
		}

		window.addEventListener('error', handleError)
		window.addEventListener('unhandledrejection', handleUnhandledRejection)

		return () => {
			window.removeEventListener('error', handleError)
			window.removeEventListener('unhandledrejection', handleUnhandledRejection)
		}
	}, [posthogInstance])

	return (
		<PostHogContext.Provider value={posthogInstance}>
			{children}
		</PostHogContext.Provider>
	)
}

const usePostHog = () => useContext(PostHogContext)

function getClientErrorMessage(error: unknown) {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	try {
		return JSON.stringify(error)
	} catch {
		return 'Unknown browser error'
	}
}

function getClientErrorName(error: unknown) {
	if (error instanceof Error) return error.name
	return undefined
}

function getClientErrorStack(error: unknown) {
	if (error instanceof Error) return error.stack ?? ''
	return ''
}

function redactClientErrorText(value: string) {
	return value
		.replace(/\+?1?\d[\d\s().-]{8,}\d/g, '[phone]')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
		.replace(/\s+/g, ' ')
		.slice(0, 1000)
}

export { PostHogProvider, usePostHog }
