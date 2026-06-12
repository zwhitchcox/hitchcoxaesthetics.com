import { prisma } from '#app/utils/db.server.ts'

export type FeaturedReview = {
	comment: string
	id: string
	reviewerName: string
}

export type ReviewSummary = {
	averageRating: number
	totalReviews: number
}

const CACHE_TTL_MS = 10 * 60 * 1000
const POOL_SIZE = 100
const MIN_COMMENT_LENGTH = 60
const MAX_COMMENT_LENGTH = 420

let cache: {
	fetchedAt: number
	pool: FeaturedReview[]
	summary: ReviewSummary
} | null = null

/**
 * Combined Google review stats (both locations) plus a random sample of
 * substantive five-star reviews. The pool refreshes from the database the
 * daily review-sync background job keeps updated; the sample is re-rolled on
 * every call so pages show different reviews.
 */
export async function getReviewHighlights(count = 3): Promise<{
	reviews: FeaturedReview[]
	summary: ReviewSummary
}> {
	if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
		const [stats, recentFiveStar] = await Promise.all([
			prisma.reviewStats.findMany({
				select: { averageRating: true, totalReviews: true },
			}),
			prisma.googleReview.findMany({
				where: { starRating: 'FIVE', comment: { not: null } },
				orderBy: { createTime: 'desc' },
				take: POOL_SIZE,
				select: { comment: true, id: true, reviewerName: true },
			}),
		])

		const totalReviews = stats.reduce(
			(total, row) => total + row.totalReviews,
			0,
		)
		const averageRating = totalReviews
			? stats.reduce(
					(total, row) => total + row.averageRating * row.totalReviews,
					0,
				) / totalReviews
			: 0

		cache = {
			fetchedAt: Date.now(),
			pool: recentFiveStar.filter(
				(review): review is FeaturedReview =>
					typeof review.comment === 'string' &&
					review.comment.length >= MIN_COMMENT_LENGTH &&
					review.comment.length <= MAX_COMMENT_LENGTH,
			),
			summary: { averageRating, totalReviews },
		}
	}

	const shuffled = [...cache.pool]
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
	}

	return {
		reviews: shuffled.slice(0, count),
		summary: cache.summary,
	}
}
