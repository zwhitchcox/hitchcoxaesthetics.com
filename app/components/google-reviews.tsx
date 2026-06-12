import { cn } from '#app/utils/misc.tsx'
import { type FeaturedReview, type ReviewSummary } from '#app/utils/reviews.server.ts'

const GOOGLE_REVIEWS_URL =
	'https://www.google.com/maps/search/Sarah+Hitchcox+Aesthetics+Knoxville+TN'

function Stars({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={cn('tracking-tight text-amber-500', className)}
		>
			★★★★★
		</span>
	)
}

export function GoogleRatingBadge({
	summary,
	className,
	dark = false,
}: {
	summary: ReviewSummary
	className?: string
	dark?: boolean
}) {
	if (!summary.totalReviews) return null
	const rounded =
		Math.round(summary.averageRating * 10) % 10 === 0
			? summary.averageRating.toFixed(1)
			: summary.averageRating.toFixed(1)
	return (
		<a
			href={GOOGLE_REVIEWS_URL}
			target="_blank"
			rel="noreferrer"
			className={cn(
				'inline-flex items-center gap-2 text-sm font-medium',
				dark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900',
				className,
			)}
			aria-label={`Rated ${rounded} stars from ${summary.totalReviews} Google reviews`}
		>
			<Stars />
			<span>
				{rounded} · {summary.totalReviews}+ Google reviews
			</span>
		</a>
	)
}

export function ReviewQuotes({
	reviews,
	summary,
	className,
}: {
	reviews: FeaturedReview[]
	summary?: ReviewSummary
	className?: string
}) {
	if (reviews.length === 0) return null
	return (
		<div className={cn('space-y-6', className)}>
			<div className="flex flex-col items-center gap-1 text-center">
				<h2 className="text-2xl font-semibold text-gray-900">
					Five-Star Google Reviews
				</h2>
				{summary ? <GoogleRatingBadge summary={summary} /> : null}
			</div>
			<div className="grid gap-6 md:grid-cols-3">
				{reviews.map(review => (
					<figure
						key={review.id}
						className="flex h-full flex-col rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
					>
						<Stars className="mb-3" />
						<blockquote className="flex-1 text-gray-600">
							“{truncate(review.comment, 240)}”
						</blockquote>
						<figcaption className="mt-4 font-semibold text-gray-900">
							{review.reviewerName}
						</figcaption>
					</figure>
				))}
			</div>
		</div>
	)
}

function truncate(value: string, max: number) {
	if (value.length <= max) return value
	return `${value.slice(0, value.lastIndexOf(' ', max))}…`
}
