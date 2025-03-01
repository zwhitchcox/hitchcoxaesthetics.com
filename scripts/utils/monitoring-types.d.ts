// Type declarations for modules needed for monitoring.ts

declare module '@prisma/instrumentation' {
	export class PrismaInstrumentation {
		constructor()
	}
	const _default: {
		PrismaInstrumentation: typeof PrismaInstrumentation
	}
	export default _default
}

// Add declarations for the Sentry packages we're using
declare module '@sentry/core' {
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

// Any additional Sentry node types needed
declare module '@sentry/node' {
	export function init(options: any): void
}

// If we need to add additional declarations for @sentry/node or @sentry/profiling-node, we can do so here
