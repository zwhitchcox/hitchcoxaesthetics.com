import { prisma } from '#app/utils/db.server.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'

const STAR_TO_NUM: Record<string, number> = {
	ONE: 1,
	TWO: 2,
	THREE: 3,
	FOUR: 4,
	FIVE: 5,
}

/**
 * Pushes every Google review (from the GoogleReview table, populated by the
 * daily reviews-fetch job) into PostHog as a `google_review` event stamped at
 * the review's real createTime, so review volume/rating shows up on the same
 * timeline as calls and bookings.
 *
 * Idempotent: PostHog dedups on `$insert_id`, and we key it on the reviewId, so
 * re-running (daily, or a manual backfill) never double-counts.
 */
export async function syncGoogleReviewsToPostHog(): Promise<{
	ok: boolean
	total: number
	sent: number
	skipped: number
	error?: string
}> {
	try {
		const reviews = await prisma.googleReview.findMany({
			include: { location: true },
			orderBy: { createTime: 'asc' },
		})
		let sent = 0
		let skipped = 0
		for (const r of reviews) {
			const locationName =
				r.location?.name ?? r.location?.formattedAddress ?? r.locationId
			const result = await captureServerPostHogEvent({
				distinctId: `google_location:${r.locationId}`,
				event: 'google_review',
				insertId: `google_review:${r.reviewId}`,
				timestamp: r.createTime.toISOString(),
				properties: {
					review_id: r.reviewId,
					location_id: r.locationId,
					location_name: locationName,
					location_city: r.location?.city ?? undefined,
					star_rating: r.starRating,
					rating: STAR_TO_NUM[r.starRating] ?? null,
					reviewer_name: r.reviewerName,
					has_comment: Boolean(r.comment && r.comment.trim()),
					comment: r.comment ?? undefined,
					has_reply: r.hasReply,
					reply_time: r.replyTime?.toISOString(),
					review_create_time: r.createTime.toISOString(),
					review_update_time: r.updateTime.toISOString(),
				},
			})
			const wasSkipped = (result as { skipped?: boolean }).skipped === true
			if (wasSkipped) skipped++
			else if (result.ok) sent++
			else skipped++
		}
		return { ok: true, total: reviews.length, sent, skipped }
	} catch (error) {
		return {
			ok: false,
			total: 0,
			sent: 0,
			skipped: 0,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}
