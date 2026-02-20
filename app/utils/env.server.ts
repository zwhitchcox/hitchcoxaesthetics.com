import { z } from 'zod'

const schema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	DATABASE_PATH: z.string(),
	DATABASE_URL: z.string(),
	SESSION_SECRET: z.string(),
	INTERNAL_COMMAND_TOKEN: z.string(),
	HONEYPOT_SECRET: z.string(),
	CACHE_DATABASE_PATH: z.string(),
	// SENTRY_DSN: z.string(),
	RESEND_API_KEY: z.string(),
	TWILIO_AUTH_TOKEN: z.string(),
	TWILIO_ACCOUNT_SID: z.string(),
	TWILIO_PHONE_NUMBER: z.string(),
	GA_TRACKING_ID: z.string().optional(),
	GTM_ID: z.string().optional(),
	DEFAULT_PROVIDER: z.string(),
	GA_PHONE_NUMBER: z.string(),
	GA_CONVERSION_ID: z.string(),
	GA_CONVERSION_LABEL: z.string(),
	REACT_APP_PUBLIC_POSTHOG_KEY: z.string().optional(),
	REACT_APP_PUBLIC_POSTHOG_HOST: z.string().optional(),
})

declare global {
	namespace NodeJS {
		interface ProcessEnv extends z.infer<typeof schema> {}
	}
}

export function init() {
	const parsed = schema.safeParse(process.env)

	if (parsed.success === false) {
		console.error('❌ Invalid environment variables:')
		for (const error of parsed.error.errors) {
			console.error(`path: ${error.path.map(p => p.toString()).join('.')}`)
			console.error(`code: ${error.code}`)
			console.error(`message: ${error.message}`)
		}

		throw new Error('Invalid environment variables')
	}
}

/**
 * This is used in both `entry.server.ts` and `root.tsx` to ensure that
 * the environment variables are set and globally available before the app is
 * started.
 *
 * NOTE: Do *not* add any environment variables in here that you do not wish to
 * be included in the client.
 * @returns all public ENV variables
 */
export function getEnv() {
	return {
		MODE: process.env.NODE_ENV,
		SENTRY_DSN: process.env.SENTRY_DSN,
		DEFAULT_PROVIDER: process.env.DEFAULT_PROVIDER,
		GA_TRACKING_ID: process.env.GA_TRACKING_ID,
		GTM_ID: process.env.GTM_ID,
		GA_PHONE_NUMBER: process.env.GA_PHONE_NUMBER,
		GA_CONVERSION_ID: process.env.GA_CONVERSION_ID,
		GA_CONVERSION_LABEL: process.env.GA_CONVERSION_LABEL,
		REACT_APP_PUBLIC_POSTHOG_KEY: process.env.REACT_APP_PUBLIC_POSTHOG_KEY,
		REACT_APP_PUBLIC_POSTHOG_HOST: process.env.REACT_APP_PUBLIC_POSTHOG_HOST,
	}
}

type ENV = ReturnType<typeof getEnv>

declare global {
	var ENV: ENV
	interface Window {
		ENV: ENV
	}
}
