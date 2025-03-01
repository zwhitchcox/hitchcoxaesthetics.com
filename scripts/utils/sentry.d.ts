// This file is no longer used. Type declarations have been moved to app/types/sentry.d.ts

// Type declarations for missing modules

declare module '@prisma/instrumentation' {
	export class PrismaInstrumentation {
		constructor()
	}
	const _default: {
		PrismaInstrumentation: typeof PrismaInstrumentation
	}
	export default _default
}

declare module '@sentry/node' {
	export function init(options: any): void
	export function httpIntegration(): any
	// Add other functions that you use from Sentry
}

declare module '@sentry/profiling-node' {
	export function nodeProfilingIntegration(): any
}

declare module '@sentry/types' {
	export interface SamplingContext {
		request?: {
			url?: string
			[key: string]: any
		}
		[key: string]: any
	}

	export interface Event {
		[key: string]: any
	}

	export interface TransactionEvent extends Event {
		request?: {
			headers?: {
				[key: string]: string
			}
			[key: string]: any
		}
		[key: string]: any
	}
}
