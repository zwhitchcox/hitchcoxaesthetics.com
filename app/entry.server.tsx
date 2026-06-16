import { createHash } from 'node:crypto'
import { PassThrough } from 'stream'
import {
	type ActionFunctionArgs,
	createReadableStreamFromReadable,
	type HandleDocumentRequestFunction,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { RemixServer } from '@remix-run/react'
import chalk from 'chalk'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'

import { getEnv, init } from '#/app/utils/env.server.ts'
import { getInstanceInfo } from '#/app/utils/litefs.server.ts'
import { NonceProvider } from '#/app/utils/nonce-provider.ts'
import { makeTimings } from '#/app/utils/timing.server.ts'
import { initializeBackgroundJobs } from '#app/utils/background-jobs.server'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'

const ABORT_DELAY = 5000

init()
global.ENV = getEnv()

type DocRequestArgs = Parameters<HandleDocumentRequestFunction>

export default async function handleRequest(...args: DocRequestArgs) {
	const [
		request,
		responseStatusCode,
		responseHeaders,
		remixContext,
		loadContext,
	] = args
	const { currentInstance, primaryInstance } = await getInstanceInfo()
	responseHeaders.set('fly-region', process.env.FLY_REGION ?? 'unknown')
	responseHeaders.set('fly-app', process.env.FLY_APP_NAME ?? 'unknown')
	responseHeaders.set('fly-primary-instance', primaryInstance)
	responseHeaders.set('fly-instance', currentInstance)

	const callbackName = isbot(request.headers.get('user-agent'))
		? 'onAllReady'
		: 'onShellReady'

	const nonce = String(loadContext.cspNonce ?? '')
	return new Promise(async (resolve, reject) => {
		let didError = false
		// NOTE: this timing will only include things that are rendered in the shell
		// and will not include suspended components and deferred loaders
		const timings = makeTimings('render', 'renderToPipeableStream')

		const { pipe, abort } = renderToPipeableStream(
			<NonceProvider value={nonce}>
				<RemixServer context={remixContext} url={request.url} />
			</NonceProvider>,
			{
				[callbackName]: () => {
					const body = new PassThrough()
					responseHeaders.set('Content-Type', 'text/html')
					responseHeaders.append('Server-Timing', timings.toString())
					resolve(
						new Response(createReadableStreamFromReadable(body), {
							headers: responseHeaders,
							status: didError ? 500 : responseStatusCode,
						}),
					)
					pipe(body)
				},
				onShellError: (err: unknown) => {
					reject(err)
				},
				onError: () => {
					didError = true
				},
				nonce,
			},
		)

		setTimeout(abort, ABORT_DELAY)
	})
}

export async function handleDataRequest(response: Response) {
	const { currentInstance, primaryInstance } = await getInstanceInfo()
	response.headers.set('fly-region', process.env.FLY_REGION ?? 'unknown')
	response.headers.set('fly-app', process.env.FLY_APP_NAME ?? 'unknown')
	response.headers.set('fly-primary-instance', primaryInstance)
	response.headers.set('fly-instance', currentInstance)

	return response
}

export function handleError(
	error: unknown,
	{ request }: LoaderFunctionArgs | ActionFunctionArgs,
): void {
	if (error instanceof Error) {
		console.error(chalk.red(error.stack))
	}

	// PostHog error tracking: send every server route error as an $exception.
	void captureServerPostHogEvent({
		distinctId: `server-error:${hashValue(
			request.headers.get('x-request-id') ?? request.url,
		)}`,
		event: '$exception',
		insertId: `server-exception:${Date.now()}:${Math.random()
			.toString(36)
			.slice(2)}`,
		properties: {
			$exception_list: [
				{
					type: error instanceof Error ? error.name : 'Error',
					value: redactServerErrorText(getServerErrorMessage(error)),
					stacktrace:
						error instanceof Error && error.stack
							? { type: 'raw', frames: [], raw: error.stack }
							: undefined,
					mechanism: { handled: false, synthetic: false },
				},
			],
			$exception_message: redactServerErrorText(getServerErrorMessage(error)),
			$exception_type: error instanceof Error ? error.name : 'Error',
			request_url: redactServerErrorText(request.url),
			request_method: request.method,
		},
	})

	if (isBookingErrorRequest(request)) {
		void captureServerPostHogEvent({
			distinctId: `booking-server-error:${hashValue(
				request.headers.get('x-request-id') ?? request.url,
			)}`,
			event: 'booking_error',
			insertId: `booking-server-error:${Date.now()}:${Math.random()
				.toString(36)
				.slice(2)}`,
			properties: {
				booking_error_action: 'server_route_error',
				booking_error_area: 'runtime',
				booking_error_message: redactServerErrorText(
					getServerErrorMessage(error),
				),
				booking_error_name: error instanceof Error ? error.name : undefined,
				booking_error_source: 'server_global',
				booking_error_url: redactServerErrorText(request.url),
				booking_request_method: request.method,
				booking_step: 'unknown',
			},
		})
	}
}

// Initialize background jobs after server has started
initializeBackgroundJobs()

function isBookingErrorRequest(request: Request) {
	const url = new URL(request.url)
	return (
		url.pathname === '/book' ||
		url.pathname.startsWith('/book/') ||
		url.pathname.startsWith('/resources/booking-') ||
		url.pathname.startsWith('/resources/blvd-booking')
	)
}

function getServerErrorMessage(error: unknown) {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	try {
		return JSON.stringify(error)
	} catch {
		return 'Unknown server error'
	}
}

function redactServerErrorText(value: string) {
	return value
		.replace(/\+?1?\d[\d\s().-]{8,}\d/g, '[phone]')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
		.replace(/\s+/g, ' ')
		.slice(0, 1000)
}

function hashValue(value: string) {
	return createHash('sha256').update(value).digest('hex').slice(0, 16)
}
