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

	return (
		<PostHogContext.Provider value={posthogInstance}>
			{children}
		</PostHogContext.Provider>
	)
}

const usePostHog = () => useContext(PostHogContext)

export { PostHogProvider, usePostHog }
