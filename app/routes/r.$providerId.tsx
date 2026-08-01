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
	const micrositeHostFor = (category: string) => {
		if (category === 'Weight Loss') return 'https://weightlossknoxvilletn.com'
		return 'https://botoxknoxvilletn.com'
	}
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
		throw redirect(`${micrositeHost}/r/${providerId}?via=${via}`)
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

			<section className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm">
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

			<section className="flex flex-col gap-3">
				<h2 className="text-center text-lg font-medium">
					Where would you like to leave it?
				</h2>
				{data.locations.map(loc => {
					const recommended = loc.placeId === data.matchedPlaceId
					const href = `/resources/review-go?provider=${encodeURIComponent(
						data.providerId,
					)}&place=${encodeURIComponent(loc.placeId)}${
						data.appointmentId
							? `&appt=${encodeURIComponent(data.appointmentId)}`
							: ''
					}&via=${encodeURIComponent(data.via)}`
					const selected = loc.placeId === placeId
					return (
						<div
							key={loc.placeId}
							className={cn(
								'flex flex-col items-center rounded-xl border bg-white p-4 text-center shadow-sm transition',
								(recommended || selected) && 'border-primary ring-1 ring-primary',
							)}
						>
							{recommended ? (
								<span className="mb-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
									You visited here
								</span>
							) : null}
							<span className="text-lg font-semibold">{loc.label}</span>
							<span className="text-sm text-muted-foreground">{loc.address}</span>
							{/* One button per site that actually takes reviews. Choosing a
							    location first swaps in that location's own sample text. */}
							<div className="mt-3 flex w-full flex-wrap justify-center gap-2">
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
										className="rounded-lg border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/5"
									>
										{selected ? platform.label : `Use ${platform.label} text`}
									</a>
								))}
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
