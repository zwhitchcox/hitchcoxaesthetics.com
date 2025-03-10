import { PassThrough } from 'stream'
import {
	type ActionFunctionArgs,
	createReadableStreamFromReadable,
	type HandleDocumentRequestFunction,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { RemixServer } from '@remix-run/react'
import * as Sentry from '@sentry/remix'
import chalk from 'chalk'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'

import { getEnv, init } from '#/app/utils/env.server.ts'
import { getInstanceInfo } from '#/app/utils/litefs.server.ts'
import { NonceProvider } from '#/app/utils/nonce-provider.ts'
import { makeTimings } from '#/app/utils/timing.server.ts'
import { initializeBackgroundJobs } from '#app/utils/background-jobs.server'

const ABORT_DELAY = 5000

init()
global.ENV = getEnv()

if (ENV.MODE === 'production' && ENV.SENTRY_DSN) {
	import('./utils/monitoring.server.ts').then(({ init }) => init())
}

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

	const nonce = String(loadContext.cspNonce) ?? undefined
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
		Sentry.captureRemixServerException(error, 'remix.server', request)
	} else {
		Sentry.captureException(error)
	}
}

// Initialize background jobs after server has started
initializeBackgroundJobs()
