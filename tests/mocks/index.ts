import closeWithGrace from 'close-with-grace'
import { setupServer } from 'msw/node'
import { handlers as resendHandlers } from '#/tests/mocks/resend.ts'

export const server = setupServer(...resendHandlers)

server.listen({
	onUnhandledRequest(request, print) {
		// Do not print warnings on unhandled requests to PostHog ingestion.
		if (request.url.includes('posthog.com')) {
			return
		}

		// Print the regular MSW unhandled request warning otherwise.
		print.warning()
	},
})

if (process.env.NODE_ENV !== 'test') {
	console.info('🔶 Mock server installed')

	closeWithGrace(() => {
		server.close()
	})
}
