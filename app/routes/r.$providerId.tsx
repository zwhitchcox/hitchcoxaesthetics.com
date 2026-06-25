import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { cn } from '#app/utils/misc.tsx'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'
import {
	fallbackReview,
	generateSampleReview,
	getReviewLocations,
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

export async function loader({ params }: LoaderFunctionArgs) {
	const providerId = params.providerId!
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
	const review = appt
		? (await generateSampleReview({
				serviceName,
				providerFirstName,
				keywords: profile.keywords,
			})) ?? fallbackReview(serviceName, providerFirstName, profile.keywords)
		: fallbackReview('visit', providerFirstName, profile.keywords)

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
		},
	})

	return json({
		providerId,
		providerFirstName,
		appointmentId: appt?.id ?? null,
		serviceCategory: profile.category,
		review,
		locations: orderedLocations.map(l => ({
			placeId: l.placeId,
			label: l.label,
			address: l.address,
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

	function handleCopy() {
		const text = textareaRef.current?.value ?? data.review
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
					ref={textareaRef}
					defaultValue={data.review}
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
					}`
					return (
						<a
							key={loc.placeId}
							href={href}
							className={cn(
								'flex flex-col items-center rounded-xl border bg-white p-4 text-center shadow-sm transition hover:border-primary',
								recommended && 'border-primary ring-1 ring-primary',
							)}
						>
							{recommended ? (
								<span className="mb-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
									You visited here
								</span>
							) : null}
							<span className="text-lg font-semibold">{loc.label}</span>
							<span className="text-sm text-muted-foreground">{loc.address}</span>
						</a>
					)
				})}
			</section>

			<p className="text-center text-xs text-muted-foreground">
				Reviews are always your own words and honest opinion.
			</p>
		</div>
	)
}
