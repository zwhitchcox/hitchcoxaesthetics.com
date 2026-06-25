import {
	json,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import {
	generateReviewQrDataUrl,
	getProviderName,
} from '#app/utils/review-link.server.ts'

export const meta: MetaFunction = () => [
	{ title: 'Review QR code · Sarah Hitchcox Aesthetics' },
	{ name: 'robots', content: 'noindex' },
]

export async function loader({ params, request }: LoaderFunctionArgs) {
	const providerId = params.providerId!
	const base = (
		process.env.REVIEW_SITE_URL || new URL(request.url).origin
	).replace(/\/$/, '')
	const reviewUrl = `${base}/r/${providerId}`
	const [qrDataUrl, providerName] = await Promise.all([
		generateReviewQrDataUrl(reviewUrl),
		getProviderName(providerId),
	])
	return json({ reviewUrl, qrDataUrl, providerName })
}

export default function ReviewQrPage() {
	const { reviewUrl, qrDataUrl, providerName } = useLoaderData<typeof loader>()
	return (
		<div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 py-10 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					Sarah Hitchcox Aesthetics
				</p>
				<h1 className="text-3xl font-semibold">Loved your visit?</h1>
				<p className="text-lg text-muted-foreground">
					Scan to leave us a quick review
					{providerName ? ` with ${providerName}` : ''}
				</p>
			</div>

			<img
				src={qrDataUrl}
				alt="Scan to leave a review"
				className="h-72 w-72 sm:h-80 sm:w-80"
			/>

			<p className="break-all text-sm text-muted-foreground">{reviewUrl}</p>

			<Button
				type="button"
				className="print:hidden"
				onClick={() => window.print()}
			>
				Print this page
			</Button>
		</div>
	)
}
