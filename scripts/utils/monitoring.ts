import { type SamplingContext, type TransactionEvent } from '@sentry/core'
import * as Sentry from '@sentry/node'

/**
 * Initialize Sentry monitoring
 */
export function init() {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.NODE_ENV,
		tracesSampleRate: process.env.NODE_ENV === 'production' ? 1 : 0,
		denyUrls: [
			/\/resources\/healthcheck/,
			// TODO: be smarter about the public assets...
			/\/build\//,
			/\/favicons\//,
			/\/img\//,
			/\/fonts\//,
			/\/favicon.ico/,
			/\/site\.webmanifest/,
		],
		// Removed problematic integrations
		tracesSampler(samplingContext: SamplingContext) {
			// ignore healthcheck transactions by other services (consul, etc.)
			if (samplingContext.request?.url?.includes('/resources/healthcheck')) {
				return 0
			}
			return 1
		},
		beforeSendTransaction(event: TransactionEvent) {
			// ignore all healthcheck related transactions
			//  note that name of header here is case-sensitive
			if (event.request?.headers?.['x-healthcheck'] === 'true') {
				return null
			}

			return event
		},
	})
}
