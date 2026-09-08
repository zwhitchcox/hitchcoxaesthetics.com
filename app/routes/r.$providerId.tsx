import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'
import {
	takeUniqueSamplesPerDestination,
	getReviewLocations,
	getReviewPlatforms,
	getServiceProfile,
	matchLocationToAppointment,
	readAppointmentSnapshot,
	resolveCurrentAppointment,
	REVIEW_EVENTS,
	reviewDistinctId,
	toStaffUrn,
} from '#app/utils/review-link.server.ts'

export const meta: MetaFunction = () => [
	{ title: 'Leave us a review · Sarah Hitchcox Aesthetics' },
	{ name: 'robots', content: 'noindex' },
]

/** How the client reached the page: printed QR (the default, so codes already
 * in the wild keep working) or a tapped NFC chip. */
function readVia(request: Request) {
	const via = new URL(request.url).searchParams.get('via')?.toLowerCase()
	return via === 'nfc' || via === 'link' ? via : 'qr'
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	// The sample-uniqueness ledger writes to SQLite, pin to the primary.
	await ensurePrimary()
	const providerId = params.providerId!
	const via = readVia(request)
	const staffUrn = toStaffUrn(providerId)
	const [snapshot, locations] = await Promise.all([
		readAppointmentSnapshot(),
		getReviewLocations(),
	])
	const appt = resolveCurrentAppointment(snapshot, staffUrn)

	// Provider name from any recent appointment, even outside the live window.
	const providerName =
		appt?.staffName ||
		snapshot?.appointments.find(a => a.staffId === staffUrn)?.staffName ||
		'your provider'
	const providerFirstName = providerName.split(' ')[0] || 'your provider'

	const serviceName = appt?.serviceName ?? 'your visit'
	const profile = getServiceProfile(serviceName)

	// Temporary review routing while seeding the microsite listings
	// (2026-07-21: ALL reviews leave SHA, weight loss goes to Weight Loss
	// Knox and EVERYTHING else, laser included, seeds Botox Knox; both
	// microsites currently point every button at their Farragut listing).
	// Toggle without a deploy: fly secrets set REVIEW_MICROSITE_REDIRECTS=1
	// (on) / unset (off).
	// Category names come from getServiceProfile in review-link.server.ts.
	// 2026-08-05 (Zane): weight loss now ALSO seeds Botox Knox. KWLC owns its
	// keywords with ~12 reviews (name+thin field; reviews are ~weightless on
	// WL terms), while botox is the review-hungry battlefield — so the whole
	// review firehose feeds BK until its listings are seasoned. The svc hint
	// keeps the sample text honest about what the customer actually had.
	const micrositeHostFor = (_category: string) => 'https://botoxknoxvilletn.com'
	const micrositeHost =
		process.env.REVIEW_MICROSITE_REDIRECTS === '1' ||
		process.env.REVIEW_MICROSITE_REDIRECTS === 'true'
			? micrositeHostFor(profile.category)
			: undefined
	if (micrositeHost) {
		// The microsite fires its own review_link_scanned on landing, so this
		// hop must NOT use the scanned event or every redirected scan counts
		// twice (once as sha, once as the brand).
		await captureServerPostHogEvent({
			distinctId: reviewDistinctId(appt?.id ?? null, providerId),
			event: 'review_link_redirected',
			insertId: `review-redirected:${appt?.id ?? providerId}:${Date.now()}`,
			properties: {
				appointment_id: appt?.id ?? null,
				provider_id: providerId,
				provider_name: providerName,
				service_name: serviceName,
				service_category: profile.category,
				has_appointment: Boolean(appt),
				redirected_to: micrositeHost,
				via,
			},
		})
		// Carry the QR-vs-NFC marker across the hop so the brand page's own
		// scanned event keeps the attribution.
		const svcSlug = profile.category.toLowerCase().replace(/[^a-z]+/g, '-')
		throw redirect(`${micrositeHost}/r/${providerId}?via=${via}&svc=${svcSlug}`)
	}

	// Every sample goes through the served-hash ledger so no two customers can
	// ever copy identical text (duplicate reviews get listings flagged), and
	// each DESTINATION gets its own text so one client posting to two places
	// never pastes the same words twice.
	const matchedPlaceIdEarly = matchLocationToAppointment(locations, appt?.locationName)
	const orderedForSamples = [...locations].sort((a, b) => {
		if (a.placeId === matchedPlaceIdEarly) return -1
		if (b.placeId === matchedPlaceIdEarly) return 1
		return a.label.localeCompare(b.label)
	})
	const samplesByPlace = await takeUniqueSamplesPerDestination(
		orderedForSamples.map(l => `Google - ${l.label}`),
		{
			serviceName: appt ? serviceName : 'visit',
			providerFirstName,
			keywords: profile.keywords,
		},
	)
	const genericFallback = `${providerFirstName} and the team took wonderful care of me, sharing a couple of details about your visit helps others in Knoxville find us.`
	const review =
		samplesByPlace.get(`Google - ${orderedForSamples[0]?.label}`) ?? genericFallback

	const matchedPlaceId = matchLocationToAppointment(locations, appt?.locationName)
	// Float the location they visited to the top.
	const orderedLocations = [...locations].sort((a, b) => {
		if (a.placeId === matchedPlaceId) return -1
		if (b.placeId === matchedPlaceId) return 1
		return a.label.localeCompare(b.label)
	})

	await captureServerPostHogEvent({
		distinctId: reviewDistinctId(appt?.id ?? null, providerId),
		event: REVIEW_EVENTS.scanned,
		insertId: `review-scanned:${appt?.id ?? providerId}:${Date.now()}`,
		properties: {
			appointment_id: appt?.id ?? null,
			provider_id: providerId,
			provider_name: providerName,
			service_name: serviceName,
			service_category: profile.category,
			matched_location: appt?.locationName ?? null,
			has_appointment: Boolean(appt),
			client_first_name: appt?.clientFirstName ?? null,
			brand: 'sha',
			via,
		},
	})

	return json({
		via,
		providerId,
		providerFirstName,
		appointmentId: appt?.id ?? null,
		serviceCategory: profile.category,
		review,
		locations: orderedLocations.map(l => ({
			placeId: l.placeId,
			label: l.label,
			address: l.address,
			business: l.business,
			// Each destination carries its own text, so posting to a second
			// place never reuses the first one's words.
			sample: samplesByPlace.get(`Google - ${l.label}`) ?? genericFallback,
			// Yelp first (owner priority 2026-07-31), then Google, then anything
			// else we've claimed for this location that actually accepts reviews.
			platforms: [
				...getReviewPlatforms(l.label)
					.filter(p => p.id === 'yelp')
					.map(p => ({ id: p.id, label: p.label })),
				{ id: 'google', label: 'Google' },
				...getReviewPlatforms(l.label)
					.filter(p => p.id !== 'yelp')
					.map(p => ({ id: p.id, label: p.label })),
			],
		})),
		matchedPlaceId,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const providerId = params.providerId!
	const form = await request.formData()
	if (form.get('intent') === 'copied') {
		const appointmentId = (form.get('appointmentId') as string) || null
		await captureServerPostHogEvent({
			distinctId: reviewDistinctId(appointmentId, providerId),
			event: REVIEW_EVENTS.copied,
			insertId: `review-copied:${appointmentId ?? providerId}:${Date.now()}`,
			properties: {
				appointment_id: appointmentId,
				provider_id: providerId,
				service_category: (form.get('serviceCategory') as string) || null,
			},
		})
	}
	return json({ ok: true })
}

type PageLocation = {
	placeId: string
	label: string
	address: string
	business: string
	sample: string
	platforms: Array<{ id: string; label: string }>
}

/** Locations sharing a label (same physical spot, multiple brand listings)
 * render as one card with a chip row per business. Preserves loader order,
 * so the visited location's group stays first. */
function groupByLabel(locations: PageLocation[]) {
	const groups: Array<{ label: string; items: PageLocation[] }> = []
	for (const loc of locations) {
		const group = groups.find(g => g.label === loc.label)
		if (group) group.items.push(loc)
		else groups.push({ label: loc.label, items: [loc] })
	}
	return groups
}

/** Small brand marks for the review chips. Anything unknown gets a dot. */
function PlatformIcon({ id }: { id: string }) {
	if (id === 'google') {
		return (
			<svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
				<path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.6z"/>
				<path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.1 0-5.8-2.1-6.7-5l-3.9 3C3.3 21.3 7.3 24 12 24z"/>
				<path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l3.9-3z"/>
				<path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.9 3c.9-2.9 3.6-5 6.7-5z"/>
			</svg>
		)
	}
	if (id === 'yelp') {
		return (
			<svg viewBox="0 0 24 24" className="h-4 w-4" fill="#d32323" aria-hidden>
				<path d="M12.9 0c-.8 0-1.5.5-1.7 1.3L9.3 9.7c-.2.9.5 1.8 1.4 1.8h.3l7.5-2.1c.8-.2 1.3-1 1.2-1.8C19.2 4 16.5 1 12.9 0zM8.6 13.1l-6.1 1.7c-.8.2-1.3 1.1-1 1.9.9 2.4 2.7 4.4 5 5.5.8.4 1.7 0 2-.8l2.1-6c.3-1-.6-2-1.6-1.9l-.4-.4zm4.5 2.1c-.9-.3-1.9.4-1.9 1.4l.1 6.3c0 .9.8 1.5 1.7 1.4 2.6-.4 4.9-1.8 6.4-3.9.5-.7.3-1.7-.5-2.1l-5.5-3-.3-.1z"/>
			</svg>
		)
	}
	if (id === 'nextdoor') {
		return (
			<svg viewBox="0 0 24 24" className="h-4 w-4" fill="#8ed500" aria-hidden>
				<path d="M12 2 1 11h3v11h7v-7h2v7h7V11h3L12 2z"/>
			</svg>
		)
	}
	if (id === 'trustpilot') {
		return (
			<svg viewBox="0 0 24 24" className="h-4 w-4" fill="#00b67a" aria-hidden>
				<path d="M12 1.7 14.9 8l6.9.6-5.2 4.6 1.6 6.8L12 16.4 5.8 20l1.6-6.8L2.2 8.6 9.1 8 12 1.7z"/>
			</svg>
		)
	}
	if (id === 'healthgrades') {
		return <span className="h-2.5 w-2.5 rounded-full bg-[#0071bc]" aria-hidden />
	}
	if (id === 'zocdoc') {
		return <span className="h-2.5 w-2.5 rounded-full bg-[#ffc107]" aria-hidden />
	}
	return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" aria-hidden />
}

export default function ReviewLinkPage() {
	const data = useLoaderData<typeof loader>()
	const fetcher = useFetcher()
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [copied, setCopied] = useState(false)
	// Which destination's sample is currently in the box. Picking a different
	// place swaps in that place's own text so no two get the same words.
	const [placeId, setPlaceId] = useState(data.locations[0]?.placeId ?? '')
	const activeSample =
		data.locations.find(l => l.placeId === placeId)?.sample ?? data.review

	function handleCopy() {
		const text = textareaRef.current?.value ?? activeSample
		void navigator.clipboard?.writeText(text)
		setCopied(true)
		fetcher.submit(
			{
				intent: 'copied',
				appointmentId: data.appointmentId ?? '',
				serviceCategory: data.serviceCategory,
			},
			{ method: 'post' },
		)
	}

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
			<header className="text-center">
				<h1 className="text-2xl font-semibold">Thank you for visiting!</h1>
				<p className="mt-2 text-muted-foreground">
					We'd love a quick review. Here's one to get you started, edit it
					however you like, then pick where to post it.
				</p>
			</header>

			<section className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm">
				<Textarea
					key={placeId}
					ref={textareaRef}
					defaultValue={activeSample}
					rows={6}
					className="resize-none text-base"
					aria-label="Sample review"
				/>
				<Button type="button" variant="outline" onClick={handleCopy}>
					{copied ? 'Copied ✓' : 'Copy sample review'}
				</Button>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-center text-lg font-medium">
					Where would you like to leave it?
				</h2>
				{/* Grouped by location, then by business: microsite listings share
				    an address with the SHA listing there, so each location card
				    holds one chip row per business. Tapping a chip on an
				    unselected listing selects it first (swapping in its own
				    sample text); tapping again opens the review site. */}
				{groupByLabel(data.locations).map(group => {
					const recommended = group.items.some(
						l => l.placeId === data.matchedPlaceId,
					)
					return (
						<div
							key={group.label}
							className={cn(
								'flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition',
								recommended && 'border-primary ring-1 ring-primary',
							)}
						>
							<div className="flex items-baseline justify-between gap-2">
								<span className="text-lg font-semibold">{group.label}</span>
								{recommended ? (
									<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
										You visited here
									</span>
								) : null}
							</div>
							<span className="text-sm text-muted-foreground">
								{group.items[0]?.address}
							</span>
							<div className="mt-3 flex flex-col gap-3">
								{group.items.map(loc => {
									const selected = loc.placeId === placeId
									const href = `/resources/review-go?provider=${encodeURIComponent(
										data.providerId,
									)}&place=${encodeURIComponent(loc.placeId)}${
										data.appointmentId
											? `&appt=${encodeURIComponent(data.appointmentId)}`
											: ''
									}&via=${encodeURIComponent(data.via)}`
									return (
										<div key={loc.placeId}>
											{group.items.length > 1 ? (
												<div
													className={cn(
														'mb-1.5 text-xs font-semibold uppercase tracking-wide',
														selected ? 'text-primary' : 'text-muted-foreground',
													)}
												>
													{loc.business}
												</div>
											) : null}
											<div className="flex flex-wrap gap-2">
												{loc.platforms.map(platform => (
													<a
														key={platform.id}
														href={`${href}&platform=${encodeURIComponent(platform.id)}`}
														onClick={event => {
															if (!selected) {
																event.preventDefault()
																setPlaceId(loc.placeId)
																setCopied(false)
															}
														}}
														className={cn(
															'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
															platform.id === 'google'
																? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-700'
																: 'border-border bg-card text-foreground hover:border-gray-500',
															!selected && 'opacity-70',
														)}
													>
														<PlatformIcon id={platform.id} />
														{platform.id === 'google'
															? 'Google Reviews'
															: platform.label}
													</a>
												))}
											</div>
										</div>
									)
								})}
							</div>
						</div>
					)
				})}
			</section>

			<p className="text-center text-xs text-muted-foreground">
				Reviews are always your own words and honest opinion.
			</p>
		</div>
	)
}
