import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'
import {
	getReviewLocations,
	matchLocationToAppointment,
	readAppointmentSnapshot,
	resolveCurrentAppointment,
	REVIEW_EVENTS,
	reviewDistinctId,
	toStaffUrn,
	writeReviewUrl,
} from '#app/utils/review-link.server.ts'

/**
 * Records which Google Business Profile a client chose, then redirects them to
 * that location's write-a-review page. Kept off the `/r/:providerId` tree so
 * the scan page's loader (and its review generation) does not re-run here.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const providerId = url.searchParams.get('provider') ?? ''
	const placeId = url.searchParams.get('place')
	const appointmentId = url.searchParams.get('appt')

	const locations = await getReviewLocations()
	// Only redirect to a place we actually own (no open redirect).
	const chosen = locations.find(l => l.placeId === placeId)
	if (!chosen) {
		return redirect(providerId ? `/r/${providerId}` : '/')
	}

	const snapshot = await readAppointmentSnapshot()
	const appt = resolveCurrentAppointment(snapshot, toStaffUrn(providerId))
	const matchedPlaceId = matchLocationToAppointment(locations, appt?.locationName)

	await captureServerPostHogEvent({
		distinctId: reviewDistinctId(appointmentId, providerId),
		event: REVIEW_EVENTS.locationSelected,
		insertId: `review-location:${appointmentId ?? providerId}:${chosen.placeId}:${Date.now()}`,
		properties: {
			appointment_id: appointmentId,
			provider_id: providerId,
			place_id: chosen.placeId,
			place_label: chosen.label,
			chose_visited_location: matchedPlaceId === chosen.placeId,
		},
	})

	return redirect(writeReviewUrl(chosen.placeId))
}
