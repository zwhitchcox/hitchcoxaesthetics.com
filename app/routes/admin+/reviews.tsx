import {
	type GoogleReview,
	type GoogleLocation,
	type ReviewStats as DbReviewStats,
} from '@prisma/client'
import { json } from '@remix-run/node'
import {
	useLoaderData,
	useRouteError,
	isRouteErrorResponse,
} from '@remix-run/react'
import * as d3 from 'd3'
import { format } from 'date-fns'
import { useEffect, useRef } from 'react'

import { Button } from '#app/components/ui/button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

// Define the Route type for this file
export interface Route {
	LoaderArgs: { request: Request }
}

// Review interface based on Google Business API
interface Review {
	name: string
	reviewId: string
	reviewer: {
		profilePhotoUrl: string
		displayName: string
	}
	starRating: string | number
	comment: string
	createTime: string
	updateTime: string
	reviewReply?: {
		comment: string
		updateTime: string
	}
}

// Statistics summary interface
interface AppReviewStats {
	totalReviews: number
	averageRating: number
	ratingDistribution: {
		[key: number]: number // 1-5 stars -> count
	}
	repliedCount: number
	unrepliedCount: number
	monthlyReviews: {
		[key: string]: {
			count: number
			avgRating: number
		}
	}
	latestReviews: Review[]
}

interface LoaderData {
	reviewStats: AppReviewStats | null
	error: string | null
	lastUpdated: string | null
}

type LocationWithReviewStats = GoogleLocation & {
	reviewStats: DbReviewStats | null
}

export async function loader({ request }: Route['LoaderArgs']) {
	// Require admin role to access reviews page
	await requireUserWithRole(request, 'admin')

	// Force clear any potentially cached data

	try {
		// Get all locations
		console.log('Fetching all Google Locations from database...')
		const locations = (await prisma.googleLocation.findMany({
			include: {
				reviewStats: true,
			},
		})) as LocationWithReviewStats[]

		console.log(`Found ${locations.length} total locations`)
		locations.forEach(loc => {
			console.log(`- Location: ${loc.id}, Name: ${loc.name || 'unnamed'}`)
		})

		if (locations.length === 0) {
			return json({
				reviewStats: null,
				error:
					"No locations found. You need to run 'npm run fetch-reviews' first.",
				lastUpdated: null,
			})
		}

		// Get all reviews from all locations
		console.log(`Fetching reviews for all locations...`)
		const allReviews = await prisma.googleReview.findMany({
			orderBy: {
				createTime: 'desc',
			},
		})

		console.log(`Found ${allReviews.length} total reviews across all locations`)
		if (allReviews.length > 0) {
			console.log('Reviews grouped by location:')
			// Group reviews by location for logging
			const reviewsByLocation = allReviews.reduce(
				(acc, review) => {
					acc[review.locationId] = (acc[review.locationId] || 0) + 1
					return acc
				},
				{} as Record<string, number>,
			)

			Object.entries(reviewsByLocation).forEach(([locId, count]) => {
				const location = locations.find(l => l.id === locId)
				console.log(
					`- Location ${locId} (${location?.name || 'unnamed'}): ${count} reviews`,
				)
			})
		}

		// If no reviews were found
		if (allReviews.length === 0) {
			return json({
				reviewStats: null,
				error:
					"No reviews found. You need to run 'npm run fetch-reviews' first.",
				lastUpdated: null,
			})
		}

		// Get the 10 most recent reviews across all locations
		const recentReviews = allReviews.slice(0, 10)

		console.log('Recent reviews:')
		recentReviews.forEach((review, i) => {
			const location = locations.find(l => l.id === review.locationId)
			console.log(
				`${i + 1}. ID: ${review.id}, Name: ${review.reviewerName}, Location: ${location?.name || review.locationId}, Comment: ${review.comment?.substring(0, 50)}...`,
			)
		})

		// Convert database reviews to the Review interface format
		const formattedReviews: Review[] = recentReviews.map(
			(dbReview: GoogleReview) => ({
				name: dbReview.id,
				reviewId: dbReview.reviewId,
				reviewer: {
					profilePhotoUrl: dbReview.profilePhotoUrl || '',
					displayName: dbReview.reviewerName,
				},
				starRating: dbReview.starRating,
				comment: dbReview.comment || '',
				createTime: dbReview.createTime.toISOString(),
				updateTime: dbReview.updateTime.toISOString(),
				...(dbReview.hasReply
					? {
							reviewReply: {
								comment: dbReview.replyComment || '',
								updateTime: dbReview.replyTime?.toISOString() || '',
							},
						}
					: {}),
			}),
		)

		// Calculate aggregated statistics from all locations
		let totalReviews = 0
		let ratingSum = 0
		const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
		let repliedCount = 0
		let unrepliedCount = 0
		let lastUpdated = new Date(0) // Start with oldest possible date

		// Aggregate monthly review data
		const monthlyReviews: {
			[key: string]: { count: number; avgRating: number; ratingSum: number }
		} = {}

		// Process all reviews to calculate statistics
		allReviews.forEach(review => {
			totalReviews++

			// Count by rating
			const numericRating = convertRatingToNumber(review.starRating)
			ratingSum += numericRating

			// Update rating distribution
			if (numericRating >= 1 && numericRating <= 5) {
				ratingDistribution[numericRating as 1 | 2 | 3 | 4 | 5]++
			}

			// Count replied/unreplied
			if (review.hasReply) {
				repliedCount++
			} else {
				unrepliedCount++
			}

			// Group by month for monthly stats
			const reviewDate = review.createTime
			const monthKey = `${reviewDate.getFullYear()}-${String(reviewDate.getMonth() + 1).padStart(2, '0')}`

			if (!monthlyReviews[monthKey]) {
				monthlyReviews[monthKey] = {
					count: 0,
					avgRating: 0,
					ratingSum: 0,
				}
			}

			monthlyReviews[monthKey].count++
			monthlyReviews[monthKey].ratingSum += numericRating
		})

		// Calculate average rating for each month
		Object.keys(monthlyReviews).forEach(month => {
			monthlyReviews[month].avgRating =
				monthlyReviews[month].ratingSum / monthlyReviews[month].count

			// Remove the sum as we don't need it in the final data
			// Using type assertion to avoid TypeScript error on delete operator
			const monthData = monthlyReviews[month] as { ratingSum?: number }
			delete monthData.ratingSum
		})

		// Find the most recent lastUpdated date from all locations with stats
		locations.forEach(location => {
			if (
				location.reviewStats &&
				location.reviewStats.lastUpdated > lastUpdated
			) {
				lastUpdated = location.reviewStats.lastUpdated
			}
		})

		// Calculate average rating
		const averageRating = totalReviews > 0 ? ratingSum / totalReviews : 0

		// Create the final review stats object
		const reviewStats: AppReviewStats = {
			totalReviews,
			averageRating,
			ratingDistribution,
			repliedCount,
			unrepliedCount,
			monthlyReviews,
			latestReviews: formattedReviews,
		}

		return json({
			reviewStats,
			error: null,
			lastUpdated: lastUpdated.toISOString(),
		})
	} catch (error) {
		console.error('Error loading reviews:', error)
		return json({
			reviewStats: null,
			error: `Error loading reviews: ${error instanceof Error ? error.message : String(error)}`,
			lastUpdated: null,
		})
	}
}

export default function ReviewsPage() {
	const { reviewStats, error, lastUpdated } = useLoaderData<LoaderData>()

	return (
		<div className="container py-10">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-3xl font-semibold tracking-tight">
					Google Reviews Dashboard
				</h1>
				<div className="text-sm text-muted-foreground">
					{lastUpdated
						? `Last updated: ${format(new Date(lastUpdated), 'MMMM d, yyyy')}`
						: 'No data available'}
				</div>
			</div>

			{error ? (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-destructive">
					<h2 className="mb-4 text-xl font-bold">Error</h2>
					<p>{error}</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => (window.location.href = '/admin/bg')}
					>
						Go to Background Jobs
					</Button>
				</div>
			) : reviewStats ? (
				<>
					{/* Summary Cards */}
					<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
						<div className="rounded-lg border bg-card p-4 shadow">
							<h3 className="mb-2 text-sm font-medium text-muted-foreground">
								Total Reviews
							</h3>
							<p className="text-3xl font-bold">
								{reviewStats?.totalReviews ?? 0}
							</p>
						</div>

						<div className="rounded-lg border bg-card p-4 shadow">
							<h3 className="mb-2 text-sm font-medium text-muted-foreground">
								Average Rating
							</h3>
							<div className="flex items-baseline">
								<p className="text-3xl font-bold">
									{reviewStats && typeof reviewStats.averageRating === 'number'
										? reviewStats.averageRating.toFixed(1)
										: 'N/A'}
								</p>
								<div className="ml-2 flex">
									{[1, 2, 3, 4, 5].map(star => (
										<svg
											key={star}
											className={`h-4 w-4 ${
												reviewStats &&
												typeof reviewStats.averageRating === 'number' &&
												star <= Math.round(reviewStats.averageRating)
													? 'text-yellow-400'
													: 'text-gray-300 dark:text-gray-500'
											}`}
											fill="currentColor"
											viewBox="0 0 20 20"
										>
											<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
										</svg>
									))}
								</div>
							</div>
						</div>

						<div className="rounded-lg border bg-card p-4 shadow">
							<h3 className="mb-2 text-sm font-medium text-muted-foreground">
								Replied Reviews
							</h3>
							<p className="text-3xl font-bold">
								{reviewStats?.repliedCount ?? 0}
							</p>
							<p className="text-sm text-muted-foreground">
								{reviewStats && reviewStats.totalReviews > 0
									? `${Math.round((reviewStats.repliedCount / reviewStats.totalReviews) * 100)}% response rate`
									: '0% response rate'}
							</p>
						</div>

						<div className="rounded-lg border bg-card p-4 shadow">
							<h3 className="mb-2 text-sm font-medium text-muted-foreground">
								Awaiting Reply
							</h3>
							<p className="text-3xl font-bold">
								{reviewStats?.unrepliedCount ?? 0}
							</p>
							{reviewStats && reviewStats.unrepliedCount > 0 && (
								<p className="text-sm text-amber-600">Needs attention</p>
							)}
						</div>
					</div>

					{/* Charts Row */}
					<div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
						<div className="rounded-lg border bg-card p-6 shadow">
							<h2 className="mb-4 text-xl font-medium">Rating Distribution</h2>
							{reviewStats && reviewStats.ratingDistribution ? (
								<RatingDistributionChart
									distribution={reviewStats.ratingDistribution}
								/>
							) : (
								<p className="text-muted-foreground">
									No rating data available
								</p>
							)}
						</div>

						<div className="rounded-lg border bg-card p-6 shadow">
							<h2 className="mb-4 text-xl font-medium">Monthly Reviews</h2>
							{reviewStats &&
							reviewStats.monthlyReviews &&
							Object.keys(reviewStats.monthlyReviews).length > 0 ? (
								<MonthlyReviewsChart monthlyData={reviewStats.monthlyReviews} />
							) : (
								<p className="text-muted-foreground">
									No monthly data available
								</p>
							)}
						</div>
					</div>

					{/* Recent Reviews */}
					<div className="mb-8 rounded-lg border bg-card p-6 shadow">
						<h2 className="mb-4 text-xl font-medium">Recent Reviews</h2>
						{reviewStats &&
						reviewStats.latestReviews &&
						reviewStats.latestReviews.length > 0 ? (
							<div className="space-y-4">
								{reviewStats.latestReviews.map(review => (
									<ReviewCard key={review.reviewId} review={review} />
								))}
							</div>
						) : (
							<p className="text-muted-foreground">No reviews available</p>
						)}
					</div>

					{/* Action buttons */}
					<div className="mt-8 flex justify-end">
						<Button
							className="mr-2"
							onClick={() =>
								window.open('https://business.google.com/', '_blank')
							}
						>
							Google Business Profile
						</Button>
						<Button
							variant="outline"
							onClick={() => (window.location.href = '/admin/bg')}
						>
							Manage Background Jobs
						</Button>
					</div>
				</>
			) : (
				<div className="rounded-md border bg-muted p-6">
					<h2 className="mb-4 text-xl font-bold">No Review Data</h2>
					<p>
						No review data is available. Please run the fetch-reviews job to
						collect Google Business reviews.
					</p>
					<Button
						className="mt-4"
						onClick={() => (window.location.href = '/admin/bg')}
					>
						Go to Background Jobs
					</Button>
				</div>
			)}
		</div>
	)
}

// Displays a single review in the list
function ReviewCard({ review }: { review: Review }) {
	const starCount =
		typeof review.starRating === 'number'
			? review.starRating
			: convertRatingToNumber(review.starRating)

	return (
		<div className="rounded-lg border p-4 shadow">
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center">
					{review.reviewer.profilePhotoUrl ? (
						<img
							src={review.reviewer.profilePhotoUrl}
							alt={review.reviewer.displayName}
							className="mr-2 h-8 w-8 rounded-full"
						/>
					) : (
						<div className="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
							{review.reviewer.displayName.charAt(0)}
						</div>
					)}
					<span className="font-medium">{review.reviewer.displayName}</span>
				</div>
				<div className="flex">
					{[1, 2, 3, 4, 5].map(star => (
						<svg
							key={star}
							className={`h-4 w-4 ${
								star <= starCount
									? 'text-yellow-400'
									: 'text-gray-300 dark:text-gray-500'
							}`}
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
						</svg>
					))}
				</div>
			</div>

			<div className="mb-2">
				<p
					className="whitespace-pre-line text-sm"
					style={{
						display: '-webkit-box',
						WebkitLineClamp: 3,
						WebkitBoxOrient: 'vertical',
						overflow: 'hidden',
					}}
				>
					{review.comment}
				</p>
			</div>

			<div className="text-xs text-muted-foreground">
				{format(new Date(review.createTime), 'MMMM d, yyyy')}
			</div>

			{review.reviewReply && (
				<div className="mt-3 rounded-md bg-muted p-3">
					<p className="mb-1 text-xs font-medium">Your reply:</p>
					<p
						className="whitespace-pre-line text-xs"
						style={{
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{review.reviewReply.comment}
					</p>
					<div className="mt-1 text-xs text-muted-foreground">
						{format(new Date(review.reviewReply.updateTime), 'MMMM d, yyyy')}
					</div>
				</div>
			)}
		</div>
	)
}

// Make sure convertRatingToNumber is available at the component level
function convertRatingToNumber(rating: string | number): number {
	if (typeof rating === 'number') return rating

	switch (rating) {
		case 'ONE':
			return 1
		case 'TWO':
			return 2
		case 'THREE':
			return 3
		case 'FOUR':
			return 4
		case 'FIVE':
			return 5
		default:
			return 0 // Default case for unknown ratings
	}
}

interface RatingChartProps {
	distribution: {
		[key: number]: number
	}
}

function RatingDistributionChart({ distribution }: RatingChartProps) {
	const chartRef = useRef<SVGSVGElement | null>(null)

	useEffect(() => {
		if (!chartRef.current) return

		// Clear previous chart
		d3.select(chartRef.current).selectAll('*').remove()

		// Setup dimensions
		const width = 500
		const height = 300
		const margin = { top: 20, right: 30, bottom: 30, left: 40 }
		const innerWidth = width - margin.left - margin.right
		const innerHeight = height - margin.top - margin.bottom

		// Create SVG
		const svg = d3
			.select(chartRef.current)
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`)

		// Convert data to array format
		const data = Object.entries(distribution).map(([rating, count]) => ({
			rating: Number(rating),
			count,
		}))

		// Create scales
		const xScale = d3
			.scaleBand()
			.domain(data.map(d => d.rating.toString()))
			.range([0, innerWidth])
			.padding(0.2)

		const yScale = d3
			.scaleLinear()
			.domain([0, d3.max(data, d => d.count) || 0])
			.nice()
			.range([innerHeight, 0])

		// Create color scale based on ratings (1 star = red, 5 stars = green)
		const colorScale = d3
			.scaleLinear<string>()
			.domain([1, 3, 5])
			.range(['#f87171', '#facc15', '#4ade80'])
			.interpolate(d3.interpolateRgb)

		// Draw bars
		svg
			.selectAll('.bar')
			.data(data)
			.enter()
			.append('rect')
			.attr('class', 'bar')
			.attr('x', d => xScale(d.rating.toString()) || 0)
			.attr('y', d => yScale(d.count))
			.attr('width', xScale.bandwidth())
			.attr('height', d => innerHeight - yScale(d.count))
			.attr('fill', d => colorScale(d.rating))
			.attr('rx', 4)

		// Add value labels
		svg
			.selectAll('.label')
			.data(data)
			.enter()
			.append('text')
			.attr('class', 'label')
			.attr(
				'x',
				d => (xScale(d.rating.toString()) || 0) + xScale.bandwidth() / 2,
			)
			.attr('y', d => yScale(d.count) - 5)
			.attr('text-anchor', 'middle')
			.text(d => d.count)
			.attr('fill', 'currentColor')
			.attr('font-size', '12px')

		// Add x-axis
		svg
			.append('g')
			.attr('transform', `translate(0,${innerHeight})`)
			.call(d3.axisBottom(xScale))
			.append('text')
			.attr('x', innerWidth / 2)
			.attr('y', margin.bottom)
			.attr('text-anchor', 'middle')
			.attr('fill', 'currentColor')
			.text('Star Rating')

		// Add y-axis
		svg
			.append('g')
			.call(d3.axisLeft(yScale).ticks(5))
			.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('y', -margin.left + 10)
			.attr('x', -innerHeight / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', 'currentColor')
			.text('Number of Reviews')
	}, [distribution])

	return <svg ref={chartRef} className="h-auto max-w-full"></svg>
}

interface MonthlyChartProps {
	monthlyData: {
		[key: string]: {
			count: number
			avgRating: number
		}
	}
}

function MonthlyReviewsChart({ monthlyData }: MonthlyChartProps) {
	const chartRef = useRef<SVGSVGElement | null>(null)

	useEffect(() => {
		if (!chartRef.current || Object.keys(monthlyData).length === 0) return

		// Clear previous chart
		d3.select(chartRef.current).selectAll('*').remove()

		// Setup dimensions
		const width = 700
		const height = 380
		const margin = { top: 20, right: 80, bottom: 100, left: 40 } // Further increased bottom margin
		const innerWidth = width - margin.left - margin.right
		const innerHeight = height - margin.top - margin.bottom

		// Create SVG
		const svg = d3
			.select(chartRef.current)
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`)

		// Convert data to array and sort by date
		const data = Object.entries(monthlyData)
			.map(([month, stats]) => ({
				month,
				count: stats.count,
				avgRating: stats.avgRating,
			}))
			.sort((a, b) => a.month.localeCompare(b.month))

		// Only use last 12 months if we have more data
		const displayData = data.length > 12 ? data.slice(-12) : data

		// COMPLETELY REDONE: Format month labels in the simplest possible way
		function getShortMonthLabel(dateStr: string): string {
			try {
				const [year, monthStr] = dateStr.split('-')
				// Just return the month number and last 2 digits of year
				const monthNum = parseInt(monthStr)
				const shortYear = year.slice(2)
				return `${monthNum}/${shortYear}`
			} catch (e) {
				console.error('Error formatting month:', dateStr, e)
				return dateStr // Return original if there's an error
			}
		}

		// Create scales
		const xScale = d3
			.scaleBand()
			.domain(displayData.map(d => d.month))
			.range([0, innerWidth])
			.padding(0.3)

		const yScaleCount = d3
			.scaleLinear()
			.domain([0, d3.max(displayData, d => d.count) || 0])
			.nice()
			.range([innerHeight, 0])

		const yScaleRating = d3
			.scaleLinear()
			.domain([0, 5]) // Ratings are from 0-5
			.nice()
			.range([innerHeight, 0])

		// Create color scales
		const barColor = '#3b82f6' // Blue
		const lineColor = '#f97316' // Orange

		// Draw bars for review count
		svg
			.selectAll('.bar')
			.data(displayData)
			.enter()
			.append('rect')
			.attr('class', 'bar')
			.attr('x', d => xScale(d.month) || 0)
			.attr('y', d => yScaleCount(d.count))
			.attr('width', xScale.bandwidth())
			.attr('height', d => innerHeight - yScaleCount(d.count))
			.attr('fill', barColor)
			.attr('rx', 4)

		// Create line generator for average rating
		const line = d3
			.line<(typeof displayData)[0]>()
			.x(d => (xScale(d.month) || 0) + xScale.bandwidth() / 2)
			.y(d => yScaleRating(d.avgRating))

		// Draw line for average rating
		svg
			.append('path')
			.datum(displayData)
			.attr('fill', 'none')
			.attr('stroke', lineColor)
			.attr('stroke-width', 3)
			.attr('d', line)

		// Add circles for each rating point
		svg
			.selectAll('.rating-point')
			.data(displayData)
			.enter()
			.append('circle')
			.attr('class', 'rating-point')
			.attr('cx', d => (xScale(d.month) || 0) + xScale.bandwidth() / 2)
			.attr('cy', d => yScaleRating(d.avgRating))
			.attr('r', 5)
			.attr('fill', lineColor)

		// Add bar value labels
		svg
			.selectAll('.count-label')
			.data(displayData)
			.enter()
			.append('text')
			.attr('class', 'count-label')
			.attr('x', d => (xScale(d.month) || 0) + xScale.bandwidth() / 2)
			.attr('y', d => yScaleCount(d.count) - 5)
			.attr('text-anchor', 'middle')
			.attr('fill', 'currentColor')
			.attr('font-size', '10px')
			.text(d => d.count)

		// Draw horizontal axis line
		svg
			.append('line')
			.attr('x1', 0)
			.attr('y1', innerHeight)
			.attr('x2', innerWidth)
			.attr('y2', innerHeight)
			.attr('stroke', 'currentColor')

		// COMPLETELY REDONE: Create custom month labels with absolutely no D3 axis involvement
		svg.append('g').attr('class', 'custom-x-axis-labels')

		// Log all the months for debugging
		console.log(
			'All months to format:',
			displayData.map(d => d.month),
		)

		// Add each month label manually
		displayData.forEach(d => {
			const xPos = (xScale(d.month) || 0) + xScale.bandwidth() / 2
			const shortMonthLabel = getShortMonthLabel(d.month)

			// Log each formatting for debugging
			console.log(`Month ${d.month} formatted as: ${shortMonthLabel}`)

			// Draw tick mark
			svg
				.append('line')
				.attr('class', 'x-axis-tick')
				.attr('x1', xPos)
				.attr('y1', innerHeight)
				.attr('x2', xPos)
				.attr('y2', innerHeight + 5)
				.attr('stroke', 'currentColor')

			// Add month label with explicit styling
			svg
				.append('text')
				.attr('class', 'month-label')
				.attr('x', xPos)
				.attr('y', innerHeight + 25)
				.attr('fill', 'currentColor')
				.attr('font-size', '12px')
				.attr('font-weight', 'normal')
				.attr('text-anchor', 'middle')
				.attr('transform', `rotate(-30, ${xPos}, ${innerHeight + 25})`)
				.style('dominant-baseline', 'middle')
				.text(shortMonthLabel)
		})

		// Add left y-axis for review count
		svg
			.append('g')
			.call(d3.axisLeft(yScaleCount).ticks(5))
			.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('y', -margin.left + 10)
			.attr('x', -innerHeight / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', 'currentColor')
			.text('Number of Reviews')

		// Add right y-axis for average rating
		svg
			.append('g')
			.attr('transform', `translate(${innerWidth}, 0)`)
			.call(d3.axisRight(yScaleRating).ticks(5))
			.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('y', margin.right - 10)
			.attr('x', -innerHeight / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', 'currentColor')
			.text('Average Rating')

		// Add a title for the x-axis
		svg
			.append('text')
			.attr('x', innerWidth / 2)
			.attr('y', innerHeight + 80) // Moved even lower to avoid overlap with legend
			.attr('text-anchor', 'middle')
			.attr('font-size', '13px')
			.attr('fill', 'currentColor')
			.text('Month')

		// Add legend - positioned higher to avoid overlap
		const legend = svg
			.append('g')
			.attr('transform', `translate(${innerWidth / 2}, ${innerHeight + 40})`) // Moved down a bit more

		// Review count legend
		legend
			.append('rect')
			.attr('x', -100)
			.attr('y', 0)
			.attr('width', 15)
			.attr('height', 15)
			.attr('fill', barColor)

		legend
			.append('text')
			.attr('x', -80)
			.attr('y', 12.5)
			.attr('text-anchor', 'start')
			.attr('fill', 'currentColor')
			.attr('font-size', '12px')
			.text('# Reviews') // Changed from "Number of Reviews" to "# Reviews"

		// Average rating legend
		legend
			.append('circle')
			.attr('cx', 80)
			.attr('cy', 7.5)
			.attr('r', 5)
			.attr('fill', lineColor)

		legend
			.append('text')
			.attr('x', 90)
			.attr('y', 12.5)
			.attr('text-anchor', 'start')
			.attr('fill', 'currentColor')
			.attr('font-size', '12px')
			.text('Average Rating')

		// Final check to ensure any D3 labels are overridden
		setTimeout(() => {
			// Force all axis text to our format
			d3.select(chartRef.current)
				.selectAll('.tick text')
				.each(function (d: any) {
					if (typeof d === 'string' && d.includes('-')) {
						const shortLabel = getShortMonthLabel(d)
						d3.select(this).text(shortLabel)
					}
				})
		}, 100)
	}, [monthlyData])

	return (
		<div className="w-full overflow-x-auto">
			<svg ref={chartRef} className="h-auto min-w-[700px] max-w-full"></svg>
		</div>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (isRouteErrorResponse(error) && error.status === 403) {
		return (
			<div className="container py-10">
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-destructive">
					<h1 className="mb-4 text-xl font-bold">Access Denied</h1>
					<p>You don't have permission to access this page.</p>
					<p className="mt-2">Required role: admin</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => (window.location.href = '/')}
					>
						Return to Home
					</Button>
				</div>
			</div>
		)
	}

	// For any other type of error
	return (
		<div className="container py-10">
			<div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-destructive">
				<h1 className="mb-4 text-xl font-bold">Error</h1>
				<p>An unexpected error occurred. Please try again later.</p>
				<Button
					variant="outline"
					className="mt-4"
					onClick={() => (window.location.href = '/')}
				>
					Return to Home
				</Button>
			</div>
		</div>
	)
}
