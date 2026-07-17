/**
 * Review links — one page with every review link in the business, built for
 * Sarah: direct "leave a review" Google links per listing, and the per-
 * provider QR landing links for each brand (with scannable QR codes).
 */
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	generateReviewQrDataUrl,
	listProviders,
} from '#app/utils/review-link.server.ts'

export interface Route {
	LoaderArgs: { request: Request }
}

// Google write-review links per listing (place IDs from the GBP account).
const LISTING_LINKS = [
	{ brand: 'Sarah Hitchcox Aesthetics', label: 'Bearden (Suite 15)', placeId: 'ChIJT25n7649XIgRyzkQqbTa0DY' },
	{ brand: 'Sarah Hitchcox Aesthetics', label: 'Farragut (Suite 8)', placeId: 'ChIJnRT1vOsvXIgRBKvfYNUGpUI' },
	{ brand: 'Sarah Hitchcox Aesthetics', label: 'West Hills', placeId: 'ChIJM5BJLf8lXIgRMi0A2rFo_UM' },
	{ brand: 'Sarah Hitchcox Aesthetics', label: 'Cedar Bluff', placeId: 'ChIJUf4iYQ4lXIgRgbDLZ6xVz98' },
	{ brand: 'Botox Knox Med Spa', label: 'Bearden (Suite 15b)', placeId: 'ChIJd1SN2ZQ9XIgRB5F_naTr2pM' },
	{ brand: 'Botox Knox Med Spa', label: 'Farragut (Suite 8b)', placeId: 'ChIJ6_7_utMvXIgRpP1LXfKVvn4' },
	{ brand: 'Knoxville Weight Loss Clinic', label: 'Bearden (Suite 15c)', placeId: 'ChIJkWEu2yk9XIgR0d0tkwaQ2ac' },
	{ brand: 'Knoxville Weight Loss Clinic', label: 'Farragut (Suite 8c) — NEW, seed this one', placeId: 'ChIJn1HGW2YvXIgRoEaM1pxtrjg' },
].map(listing => ({
	...listing,
	url: `https://search.google.com/local/writereview?placeid=${listing.placeId}`,
}))

// QR landing pages per brand: /r/<provider> shows a fresh sample review and
// the right listing buttons. The SHA link auto-routes tox and weight-loss
// appointments to the brand sites.
const BRAND_LANDINGS = [
	{ brand: 'Sarah Hitchcox Aesthetics (auto-routes by service)', base: 'https://hitchcoxaesthetics.com/r' },
	{ brand: 'Botox Knox Med Spa', base: 'https://botoxknoxvilletn.com/r' },
	{ brand: 'Knoxville Weight Loss Clinic', base: 'https://weightlossknoxvilletn.com/r' },
]

export async function loader({ request }: { request: Request }) {
	await requireUserWithRole(request, 'admin')
	const providers = await listProviders()
	const providerLinks = await Promise.all(
		providers.map(async provider => ({
			name: provider.name,
			landings: await Promise.all(
				BRAND_LANDINGS.map(async landing => {
					const url = `${landing.base}/${provider.uuid}`
					return {
						brand: landing.brand,
						url,
						qr: await generateReviewQrDataUrl(url),
					}
				}),
			),
		})),
	)
	return json({ providerLinks, listingLinks: LISTING_LINKS })
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false)
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() => {
				void navigator.clipboard?.writeText(text)
				setCopied(true)
				setTimeout(() => setCopied(false), 1500)
			}}
		>
			{copied ? 'Copied ✓' : 'Copy link'}
		</Button>
	)
}

export default function ReviewLinks() {
	const { providerLinks, listingLinks } = useLoaderData<typeof loader>()
	const brands = [...new Set(listingLinks.map(l => l.brand))]

	return (
		<div className="flex flex-col gap-10">
			<section>
				<h2 className="mb-1 text-2xl font-bold">Leave-a-review links by listing</h2>
				<p className="mb-4 text-muted-foreground">
					These open Google's review box for that exact listing. Text one to a
					client and they land straight on the stars.
				</p>
				{brands.map(brand => (
					<div key={brand} className="mb-4">
						<h3 className="mb-2 text-lg font-semibold">{brand}</h3>
						<div className="flex flex-col gap-2">
							{listingLinks
								.filter(l => l.brand === brand)
								.map(l => (
									<div
										key={l.placeId}
										className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3"
									>
										<span className="min-w-52 font-medium">{l.label}</span>
										<a
											href={l.url}
											target="_blank"
											rel="noreferrer"
											className="truncate text-sm text-muted-foreground underline"
											style={{ maxWidth: 340 }}
										>
											{l.url}
										</a>
										<CopyButton text={l.url} />
									</div>
								))}
						</div>
					</div>
				))}
			</section>

			<section>
				<h2 className="mb-1 text-2xl font-bold">Provider QR links</h2>
				<p className="mb-4 text-muted-foreground">
					The links behind the printed QR codes. Each shows the client a fresh,
					never-repeated sample review, then routes them to the right listing.
					The SHA link automatically sends tox clients to Botox Knox and
					weight-loss clients to the weight loss clinic pages.
				</p>
				<div className="flex flex-col gap-6">
					{providerLinks.map(provider => (
						<div key={provider.name} className="rounded-lg border bg-card p-4">
							<h3 className="mb-3 text-lg font-semibold">{provider.name}</h3>
							<div className="grid gap-4 md:grid-cols-3">
								{provider.landings.map(landing => (
									<div
										key={landing.url}
										className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center"
									>
										<div className="text-sm font-medium">{landing.brand}</div>
										<img
											src={landing.qr}
											alt={`QR for ${landing.url}`}
											className="h-36 w-36"
										/>
										<a
											href={landing.url}
											target="_blank"
											rel="noreferrer"
											className="break-all text-xs text-muted-foreground underline"
										>
											{landing.url}
										</a>
										<CopyButton text={landing.url} />
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</section>
		</div>
	)
}
