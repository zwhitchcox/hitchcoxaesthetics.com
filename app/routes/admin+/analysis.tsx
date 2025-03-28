import { json } from '@remix-run/node'
import {
	useLoaderData,
	useNavigate,
	useSearchParams,
	useRouteError,
	isRouteErrorResponse,
} from '@remix-run/react'
import * as d3 from 'd3'
import { parseISO, subDays, startOfWeek } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import * as React from 'react'
import { useState, useRef, useMemo, useEffect } from 'react'
import { Spacer } from '#app/components/spacer.tsx'
import { Button } from '#app/components/ui/button'
import { Icon } from '#app/components/ui/icon'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { prisma } from '#app/utils/db.server'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { calculateProfitMargin } from '#app/utils/profit-calculations'

// Time zone constant
const TIME_ZONE = 'America/New_York'

// Define the Route type for this file
export interface Route {
	LoaderArgs: { request: Request }
}

// Types for analysis data
interface DateRange {
	startDate: string
	endDate: string
}

interface Summary {
	totalRevenue: number
	totalProfit: number
	totalProfitMargin: number
	totalOverhead: number
	profitAfterOverhead: number
	profitMarginAfterOverhead: number
	totalAppointments: number
	averageTransactionValue: number
	averageProfitPerTransaction: number
	dailyOverhead: number
	uniqueDays: number
}

interface CategoryStat {
	count: number
	revenue: number
	profit: number
}

interface CategoryStats {
	laser: CategoryStat
	botox: CategoryStat
	filler: CategoryStat
	skin: CategoryStat
	weight: CategoryStat
	microneedling: CategoryStat
	consultation: CategoryStat
	retail: CategoryStat
	cancelled: CategoryStat
	other: CategoryStat
}

interface DailyStats {
	[date: string]: {
		revenue: number
		profit: number
		count: number
		overhead: number
	}
}

interface AnalysisResults {
	dateRange: DateRange
	summary: Summary
	categoryStats: CategoryStats
	dailyStats: DailyStats
	lastUpdated: string
}

interface _ProfitDetail {
	item: string
	total: number
	calculatedProfit: number
	status: string
	date: Date
}

/**
 * Calculate profit for a given item and revenue
 */
function calculateProfit(item: string, revenue: number): number {
	let profitMargin = 0.45 // Default 45% profit margin

	// Apply different profit margins based on service type
	item = item?.toLowerCase() || ''

	if (
		item.includes('laser') ||
		item.includes('cold sculpting') ||
		item.includes('vascular')
	) {
		profitMargin = 0.95 // 95% profit margin
	} else if (
		item.includes('botox') ||
		item.includes('dysport') ||
		item.includes('xeomin')
	) {
		profitMargin = 0.45
	} else if (
		item.includes('dermal filler') ||
		item.includes('juvederm') ||
		item.includes('radiesse') ||
		item.includes('restylane')
	) {
		profitMargin = 0.45 // 45% profit margin
	} else if (item.includes('skin') || item.includes('facial')) {
		profitMargin = 0.65 // 65% profit margin
	} else if (
		item.includes('tirzepatide') ||
		item.includes('semaglutide') ||
		item.includes('ozempic') ||
		item.includes('wegovy') ||
		item.includes('mounjaro')
	) {
		profitMargin = 0.9 // 40% profit margin
	} else if (item.includes('microneedling')) {
		profitMargin = 0.91 // 91% profit margin
	}

	return revenue * profitMargin
}

/**
 * Format a date for display in ET timezone
 */
function formatDateET(date: Date | string): string {
	const dateObj = typeof date === 'string' ? new Date(date) : date
	return formatInTimeZone(dateObj, TIME_ZONE, 'MMM d, yyyy')
}

/**
 * Get the current date in ET timezone
 */
function getNowInET(): Date {
	return toZonedTime(new Date(), TIME_ZONE)
}

/**
 * Convert a date string from CSV to a Date object in ET
 */
function parseETDate(dateString: string): Date {
	// Parse the date string and convert to ET timezone
	// Use parseISO to properly parse the date and account for timezone
	return toZonedTime(parseISO(dateString), TIME_ZONE)
}

/**
 * Format a date as YYYY-MM-DD in ET timezone for input fields
 */
function formatETDateForInput(date: Date): string {
	return formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd')
}

/**
 * Generate an array of all dates between start and end dates, inclusive
 */
function getAllDatesBetween(startDate: Date, endDate: Date): string[] {
	const dates = []
	// Make sure we're working with dates in ET timezone
	const start = toZonedTime(new Date(startDate), TIME_ZONE)
	const end = toZonedTime(new Date(endDate), TIME_ZONE)

	// Clone the start date to avoid modifying the original
	const currentDate = new Date(start)

	// Add one day at a time until we reach the end date
	while (currentDate <= end) {
		// Format the date in ET timezone to ensure consistency
		dates.push(formatInTimeZone(currentDate, TIME_ZONE, 'yyyy-MM-dd'))
		// Add one day
		currentDate.setDate(currentDate.getDate() + 1)
	}

	return dates
}

// Define loader data type
type LoaderData = {
	analysisResults: AnalysisResults | null
	error: string | null
}

export async function loader({ request }: Route['LoaderArgs']) {
	// Require admin role before proceeding
	await requireUserWithRole(request, 'admin')

	try {
		// Parse URL search parameters to get timeframe
		const url = new URL(request.url)
		const timeframe = url.searchParams.get('timeframe')
		const startParam = url.searchParams.get('start')
		const endParam = url.searchParams.get('end')

		// Determine the date range based on the timeframe
		let startDate = startParam ? parseETDate(startParam) : getNowInET()
		let endDate = endParam ? parseETDate(endParam) : getNowInET()

		// Apply timeframe if specified (and no explicit start/end provided)
		if (!startParam) {
			startDate = getNowInET()
			if (timeframe === '7d') {
				startDate.setDate(startDate.getDate() - 7)
			} else if (timeframe === '30d' || !timeframe) {
				startDate.setDate(startDate.getDate() - 30)
			} else if (timeframe === '3m') {
				startDate.setDate(startDate.getDate() - 90) // 3 months ~= 90 days
			} else if (timeframe === '6m') {
				startDate.setDate(startDate.getDate() - 180) // 6 months ~= 180 days
			} else if (timeframe === '1y') {
				startDate.setDate(startDate.getDate() - 365) // 1 year ~= 365 days
			} else if (timeframe === 'ytd') {
				// Year to date - start from January 1st of current year
				startDate = new Date(startDate.getFullYear(), 0, 1)
				startDate = toZonedTime(startDate, TIME_ZONE)
			} else if (timeframe === 'all') {
				// For "all" time, use a much older start date
				startDate = toZonedTime(new Date('2020-01-01'), TIME_ZONE)
			}
		}

		const dailyOverhead = 200 // Default $200 per day overhead

		// Format dates for querying the database
		const startDateStr = formatETDateForInput(startDate)
		const endDateStr = formatETDateForInput(endDate)

		console.log(
			`Calculating analysis data for period ${startDateStr} to ${endDateStr}, timeframe: ${timeframe}`,
		)

		// Query invoices from the database for the selected time period
		const invoiceItems = await prisma.invoiceItem.findMany({
			where: {
				date: {
					gte: startDate,
					lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000), // Include full end date
				},
			},
			orderBy: {
				date: 'asc',
			},
		})

		if (invoiceItems.length === 0) {
			// No invoice data found for this time range
			console.log('No invoice data found in database for the requested period')
			return json<LoaderData>({
				analysisResults: null,
				error:
					'No invoice data found for the selected time period. Please import invoices first by running npm run update-invoices.',
			})
		}

		console.log(`Found ${invoiceItems.length} invoice items for analysis`)

		// Get all days in the date range
		const allDatesInRange = getAllDatesBetween(startDate, endDate)
		const uniqueDays = allDatesInRange.length

		// Initialize analysis stats
		let totalRevenue = 0
		let totalProfit = 0
		let totalAppointments = 0

		// Initialize daily stats with overhead
		const dailyStats: DailyStats = {}
		allDatesInRange.forEach(dateStr => {
			dailyStats[dateStr] = {
				revenue: 0,
				profit: 0,
				count: 0,
				overhead: dailyOverhead,
			}
		})

		// Initialize category stats
		const categoryStats: CategoryStats = {
			laser: { count: 0, revenue: 0, profit: 0 },
			botox: { count: 0, revenue: 0, profit: 0 },
			filler: { count: 0, revenue: 0, profit: 0 },
			skin: { count: 0, revenue: 0, profit: 0 },
			weight: { count: 0, revenue: 0, profit: 0 },
			microneedling: { count: 0, revenue: 0, profit: 0 },
			consultation: { count: 0, revenue: 0, profit: 0 },
			retail: { count: 0, revenue: 0, profit: 0 },
			cancelled: { count: 0, revenue: 0, profit: 0 },
			other: { count: 0, revenue: 0, profit: 0 },
		}

		// Process invoice items
		invoiceItems.forEach(
			(item: {
				date: Date
				collected: number
				item: string
				category: string
			}) => {
				// Fix date handling to ensure proper timezone conversion
				const itemDate = toZonedTime(item.date, TIME_ZONE)
				const dateStr = formatInTimeZone(itemDate, TIME_ZONE, 'yyyy-MM-dd')
				const revenue = item.collected
				const profit = calculateProfit(item.item, revenue)
				const category = item.category as keyof CategoryStats

				// Skip if date is outside our range (shouldn't happen with our query, but just in case)
				if (!dailyStats[dateStr]) return

				// Update daily stats
				dailyStats[dateStr].revenue += revenue
				dailyStats[dateStr].profit += profit
				dailyStats[dateStr].count += 1

				// Update totals
				totalRevenue += revenue
				totalProfit += profit
				totalAppointments += 1

				// Update category stats
				if (category in categoryStats) {
					categoryStats[category].revenue += revenue
					categoryStats[category].profit += profit
					categoryStats[category].count += 1
				} else {
					// Fallback to "other" for any unknown category
					categoryStats.other.revenue += revenue
					categoryStats.other.profit += profit
					categoryStats.other.count += 1
				}
			},
		)

		// Calculate derived metrics
		const totalOverhead = uniqueDays * dailyOverhead
		const profitAfterOverhead = totalProfit - totalOverhead
		const totalProfitMargin = calculateProfitMargin(totalProfit, totalRevenue)
		const profitMarginAfterOverhead = calculateProfitMargin(
			profitAfterOverhead,
			totalRevenue,
		)
		const averageTransactionValue = totalRevenue / totalAppointments || 0
		const averageProfitPerTransaction = totalProfit / totalAppointments || 0

		// Create the analysis results in the format expected by the UI
		const analysisResults: AnalysisResults = {
			dateRange: {
				startDate: startDate.toISOString(),
				endDate: endDate.toISOString(),
			},
			summary: {
				totalRevenue,
				totalProfit,
				totalProfitMargin,
				totalOverhead,
				profitAfterOverhead,
				profitMarginAfterOverhead,
				totalAppointments,
				averageTransactionValue,
				averageProfitPerTransaction,
				dailyOverhead,
				uniqueDays,
			},
			categoryStats,
			dailyStats,
			lastUpdated: new Date().toISOString(),
		}

		return json<LoaderData>({
			analysisResults,
			error: null,
		})
	} catch (error) {
		console.error('Error performing analysis:', error)
		return json<LoaderData>({
			analysisResults: null,
			error: `Error performing analysis: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(amount)
}

function formatPercent(value: number) {
	return new Intl.NumberFormat('en-US', {
		style: 'percent',
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(value / 100)
}

// Calculate trend (positive, negative, neutral)
function calculateTrend(
	value: number,
	threshold = 0,
): 'positive' | 'negative' | 'neutral' {
	if (value > threshold) return 'positive'
	if (value < threshold) return 'negative'
	return 'neutral'
}

// Get trend icon based on trend direction
function TrendIndicator({
	trend,
}: {
	trend: 'positive' | 'negative' | 'neutral'
}) {
	if (trend === 'positive') {
		return (
			<div className="flex items-center text-green-500">
				<Icon name="check" className="h-4 w-4" />
				<span className="ml-1">Trending up</span>
			</div>
		)
	} else if (trend === 'negative') {
		return (
			<div className="flex items-center text-red-500">
				<Icon name="cross-1" className="h-4 w-4" />
				<span className="ml-1">Trending down</span>
			</div>
		)
	}
	return (
		<div className="flex items-center text-gray-500">
			<Icon name="update" className="h-4 w-4" />
			<span className="ml-1">Stable</span>
		</div>
	)
}

// Add these D3 chart utilities
interface GraphDataPoint {
	date: string
	label: string
	revenue: number
	profit: number
}

function createD3Chart(
	svgRef: React.RefObject<SVGSVGElement | null>,
	data: GraphDataPoint[],
	width: number,
	height: number,
) {
	if (!svgRef.current || data.length === 0) return

	// Clear previous chart
	d3.select(svgRef.current).selectAll('*').remove()

	const margin = { top: 20, right: 30, bottom: 40, left: 60 }
	const innerWidth = width - margin.left - margin.right
	const innerHeight = height - margin.top - margin.bottom

	const svg = d3
		.select(svgRef.current)
		.attr('width', width)
		.attr('height', height)

	const g = svg
		.append('g')
		.attr('transform', `translate(${margin.left},${margin.top})`)

	// Set up scales
	const xScale = d3
		.scaleBand()
		.domain(data.map(d => d.label))
		.range([0, innerWidth])
		.padding(0.2)

	const yScale = d3
		.scaleLinear()
		.domain([0, d3.max(data, d => Math.max(d.revenue, d.profit)) || 0])
		.nice()
		.range([innerHeight, 0])

	// Add axes
	g.append('g')
		.attr('transform', `translate(0,${innerHeight})`)
		.call(d3.axisBottom(xScale))
		.selectAll('text')
		.attr('transform', 'rotate(-35)')
		.attr('text-anchor', 'end')
		.attr('dx', '-.8em')
		.attr('dy', '.15em')
		.attr('font-size', '10px')

	g.append('g')
		.call(
			d3.axisLeft(yScale).tickFormat(d => {
				return formatCurrency(d as number).replace('.00', '')
			}),
		)
		.attr('font-size', '10px')

	// Add y-axis label
	g.append('text')
		.attr('transform', 'rotate(-90)')
		.attr('y', 0 - margin.left)
		.attr('x', 0 - innerHeight / 2)
		.attr('dy', '1em')
		.attr('fill', 'currentColor')
		.attr('text-anchor', 'middle')
		.attr('font-size', '12px')
		.attr('opacity', 0.7)
		.text('Amount ($)')

	// Add grid lines
	g.append('g')
		.attr('class', 'grid')
		.call(
			d3
				.axisLeft(yScale)
				.tickSize(-innerWidth)
				.tickFormat(() => ''),
		)
		.attr('stroke-opacity', 0.1)
		.selectAll('line')
		.attr('stroke-dasharray', '2,2')

	// Create a tooltip
	const tooltip = d3
		.select('body')
		.append('div')
		.attr('class', 'tooltip')
		.style('position', 'absolute')
		.style('visibility', 'hidden')
		.style('background-color', 'rgba(0, 0, 0, 0.8)')
		.style('color', 'white')
		.style('padding', '8px')
		.style('border-radius', '4px')
		.style('font-size', '12px')
		.style('pointer-events', 'none')
		.style('z-index', '10')

	// Add the revenue bars
	g.selectAll('.revenue-bar')
		.data(data)
		.enter()
		.append('rect')
		.attr('class', 'revenue-bar')
		.attr('x', d => xScale(d.label) || 0)
		.attr('y', d => yScale(d.revenue))
		.attr('width', xScale.bandwidth())
		.attr('height', d => innerHeight - yScale(d.revenue))
		.attr('fill', 'rgba(59, 130, 246, 0.8)') // Blue for revenue
		.on('mouseover', function (_ignored, d) {
			d3.select(this).attr('opacity', 0.7)
			tooltip.style('visibility', 'visible')
				.html(`<strong>${d.label}</strong><br/>
					Revenue: ${formatCurrency(d.revenue)}<br/>
					Profit: ${formatCurrency(d.profit)}`)
		})
		.on('mousemove', function (event) {
			tooltip
				.style('top', event.pageY - 10 + 'px')
				.style('left', event.pageX + 10 + 'px')
		})
		.on('mouseout', function () {
			d3.select(this).attr('opacity', 1)
			tooltip.style('visibility', 'hidden')
		})

	// Add the profit bars
	g.selectAll('.profit-bar')
		.data(data)
		.enter()
		.append('rect')
		.attr('class', 'profit-bar')
		.attr('x', d => (xScale(d.label) || 0) + xScale.bandwidth() / 3)
		.attr('y', d => yScale(d.profit))
		.attr('width', xScale.bandwidth() / 3)
		.attr('height', d => innerHeight - yScale(d.profit))
		.attr('fill', 'rgba(34, 197, 94, 0.8)') // Green for profit
		.on('mouseover', function (_ignored, d) {
			d3.select(this).attr('opacity', 0.7)
			tooltip.style('visibility', 'visible')
				.html(`<strong>${d.label}</strong><br/>
					Revenue: ${formatCurrency(d.revenue)}<br/>
					Profit: ${formatCurrency(d.profit)}`)
		})
		.on('mousemove', function (event) {
			tooltip
				.style('top', event.pageY - 10 + 'px')
				.style('left', event.pageX + 10 + 'px')
		})
		.on('mouseout', function () {
			d3.select(this).attr('opacity', 1)
			tooltip.style('visibility', 'hidden')
		})

	// Add legend
	const legend = svg
		.append('g')
		.attr('font-family', 'sans-serif')
		.attr('font-size', 10)
		.attr('text-anchor', 'end')
		.selectAll('g')
		.data(['Revenue', 'Profit'])
		.enter()
		.append('g')
		.attr('transform', (_d, i) => `translate(${width - 20}, ${i * 20 + 20})`)

	legend
		.append('rect')
		.attr('x', -17)
		.attr('width', 15)
		.attr('height', 15)
		.attr('fill', (d, i) =>
			i === 0 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(34, 197, 94, 0.8)',
		)

	legend
		.append('text')
		.attr('x', -20)
		.attr('y', 9.5)
		.attr('dy', '0.32em')
		.text(d => d)
}

export default function AnalysisDashboard() {
	const { analysisResults, error } = useLoaderData<typeof loader>()

	// Get search params using Remix's useSearchParams
	const [searchParams, setSearchParams] = useSearchParams()
	const navigate = useNavigate()

	const timeframe = searchParams.get('timeframe') || '30d'
	const startDate =
		searchParams.get('start') || formatETDateForInput(subDays(getNowInET(), 30))
	const endDate = searchParams.get('end') || formatETDateForInput(getNowInET())

	// Use search param for graph view instead of local state
	const graphView = searchParams.get('view') || 'daily'

	const chartRef = useRef<SVGSVGElement | null>(null)
	const [chartWidth, setChartWidth] = useState(800)
	const [chartHeight, setChartHeight] = useState(400)
	const chartContainerRef = useRef<HTMLDivElement>(null)

	// Date range for custom filtering - use useMemo to prevent recreating on every render
	const now = useMemo(() => getNowInET(), [])

	// Function to update URL parameters and navigate
	const updateDateFilter = (
		newTimeframe: string,
		newStart?: string,
		newEnd?: string,
	) => {
		const params = new URLSearchParams(searchParams)

		// Update timeframe parameter
		params.set('timeframe', newTimeframe)

		// Handle start and end dates
		if (newStart) params.set('start', newStart)
		else if (params.has('start')) params.delete('start')

		if (newEnd) params.set('end', newEnd)
		else if (params.has('end')) params.delete('end')

		// Use setSearchParams instead of navigate
		setSearchParams(params)
	}

	// Handle timeframe button clicks
	const handleTimeframeChange = (
		newTimeframe: '7d' | '30d' | '3m' | '6m' | '1y' | 'ytd' | 'all' | 'custom',
	) => {
		if (newTimeframe === '7d') {
			updateDateFilter(
				newTimeframe,
				formatETDateForInput(subDays(now, 7)),
				formatETDateForInput(now),
			)
		} else if (newTimeframe === '30d') {
			updateDateFilter(
				newTimeframe,
				formatETDateForInput(subDays(now, 30)),
				formatETDateForInput(now),
			)
		} else if (newTimeframe === '3m') {
			updateDateFilter(
				newTimeframe,
				formatETDateForInput(subDays(now, 90)),
				formatETDateForInput(now),
			)
		} else if (newTimeframe === '6m') {
			updateDateFilter(
				newTimeframe,
				formatETDateForInput(subDays(now, 180)),
				formatETDateForInput(now),
			)
		} else if (newTimeframe === '1y') {
			updateDateFilter(
				newTimeframe,
				formatETDateForInput(subDays(now, 365)),
				formatETDateForInput(now),
			)
		} else if (newTimeframe === 'ytd') {
			// Year to date: from January 1st of the current year until today
			const startOfYear = new Date(now.getFullYear(), 0, 1) // January 1st of current year
			updateDateFilter(
				newTimeframe,
				formatETDateForInput(toZonedTime(startOfYear, TIME_ZONE)),
				formatETDateForInput(now),
			)
		} else if (newTimeframe === 'all') {
			updateDateFilter(newTimeframe)
		} else if (newTimeframe === 'custom') {
			updateDateFilter(newTimeframe, startDate, endDate)
		}
	}

	// Handle custom date changes
	const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const params = new URLSearchParams(searchParams)
		params.set('start', e.target.value)
		params.set('timeframe', 'custom')
		setSearchParams(params)
	}

	const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const params = new URLSearchParams(searchParams)
		params.set('end', e.target.value)
		params.set('timeframe', 'custom')
		setSearchParams(params)
	}

	// Apply button for custom date range
	const handleApplyDateRange = () => {
		// Force reload with current params to get new data
		navigate(`?${searchParams.toString()}`, { replace: true })
	}

	// Update view type via search params
	const handleViewChange = (view: 'daily' | 'weekly' | 'monthly') => {
		const params = new URLSearchParams(searchParams)
		params.set('view', view)
		setSearchParams(params)
	}

	// Responsive chart sizing
	useEffect(() => {
		function handleResize() {
			if (chartContainerRef.current) {
				const { width } = chartContainerRef.current.getBoundingClientRect()
				setChartWidth(width)
				setChartHeight(Math.min(400, width * 0.6)) // Maintain aspect ratio
			}
		}

		handleResize() // Initial size

		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	// Initialize empty values for when analysis results aren't available yet
	const _initialDailyStats: DailyStats = {}
	const initialGraphData: GraphDataPoint[] = []

	// Prepare data regardless of whether we have results yet
	let filteredDates: string[] = []
	let graphData: GraphDataPoint[] = initialGraphData
	let filteredStats = { revenue: 0, profit: 0, appointments: 0, overhead: 0 }
	let _filteredProfitMargin = 0
	let filteredProfitAfterOverhead = 0
	let filteredProfitMarginAfterOverhead = 0
	let lastUpdated = ''

	// Extract data from analysis results if they exist
	if (analysisResults) {
		const {
			dateRange: _dateRange,
			summary: _summary,
			categoryStats: _categoryStats,
			dailyStats,
		} = analysisResults

		lastUpdated = formatDateET(analysisResults.lastUpdated)

		// Simply use all dates from the dailyStats object - server has already filtered them
		filteredDates = Object.keys(dailyStats || {}).sort()

		// Calculate filtered sums and metrics
		filteredStats = filteredDates.reduce(
			(acc, dateStr) => {
				const dayStats = dailyStats[dateStr] || {
					revenue: 0,
					profit: 0,
					count: 0,
					overhead: 0,
				}
				acc.revenue += dayStats.revenue || 0
				acc.profit += dayStats.profit || 0
				acc.appointments += dayStats.count || 0
				acc.overhead += dayStats.overhead || 0
				return acc
			},
			{ revenue: 0, profit: 0, appointments: 0, overhead: 0 },
		)

		_filteredProfitMargin = calculateProfitMargin(
			filteredStats.profit,
			filteredStats.revenue,
		)

		filteredProfitAfterOverhead = filteredStats.profit - filteredStats.overhead
		filteredProfitMarginAfterOverhead = calculateProfitMargin(
			filteredProfitAfterOverhead,
			filteredStats.revenue,
		)

		// Prepare chart data
		const prepareGraphData = (): GraphDataPoint[] => {
			if (graphView === 'daily') {
				// Daily view - use filtered dates directly
				return filteredDates.map(dateStr => {
					// Make sure to parse the date in ET timezone
					const date = toZonedTime(parseISO(dateStr), TIME_ZONE)
					const dayStats = dailyStats[dateStr] || {
						revenue: 0,
						profit: 0,
						count: 0,
						overhead: 0,
					}
					return {
						date: dateStr,
						label: formatInTimeZone(date, TIME_ZONE, 'MMM d'),
						revenue: dayStats.revenue || 0,
						profit: (dayStats.profit || 0) - (dayStats.overhead || 0),
					}
				})
			} else if (graphView === 'weekly') {
				// Weekly view - group by week
				const weeklyData: Record<
					string,
					{
						date: string
						revenue: number
						profit: number
						count: number
						label: string
					}
				> = {}

				filteredDates.forEach(dateStr => {
					const date = toZonedTime(parseISO(dateStr), TIME_ZONE)
					const weekStart = startOfWeek(date, { weekStartsOn: 1 }) // Week starts on Monday
					const weekKey = formatInTimeZone(weekStart, TIME_ZONE, 'yyyy-MM-dd')

					if (!weeklyData[weekKey]) {
						weeklyData[weekKey] = {
							date: weekKey,
							revenue: 0,
							profit: 0,
							count: 0,
							label: `Week of ${formatInTimeZone(weekStart, TIME_ZONE, 'MMM d')}`,
						}
					}

					const stats = dailyStats[dateStr] || {
						revenue: 0,
						profit: 0,
						count: 0,
						overhead: 0,
					}
					weeklyData[weekKey].revenue += stats.revenue || 0
					weeklyData[weekKey].profit +=
						(stats.profit || 0) - (stats.overhead || 0)
					weeklyData[weekKey].count++
				})

				return Object.entries(weeklyData)
					.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
					.map(([_, data]) => data)
			} else {
				// Monthly view - group by month
				const monthlyData: Record<
					string,
					{
						date: string
						revenue: number
						profit: number
						count: number
						label: string
					}
				> = {}

				filteredDates.forEach(dateStr => {
					const date = toZonedTime(parseISO(dateStr), TIME_ZONE)
					const monthKey = formatInTimeZone(date, TIME_ZONE, 'yyyy-MM')

					if (!monthlyData[monthKey]) {
						monthlyData[monthKey] = {
							date: monthKey,
							revenue: 0,
							profit: 0,
							count: 0,
							label: formatInTimeZone(date, TIME_ZONE, 'MMM yyyy'),
						}
					}

					const stats = dailyStats[dateStr] || {
						revenue: 0,
						profit: 0,
						count: 0,
						overhead: 0,
					}
					monthlyData[monthKey].revenue += stats.revenue || 0
					monthlyData[monthKey].profit +=
						(stats.profit || 0) - (stats.overhead || 0)
					monthlyData[monthKey].count++
				})

				return Object.entries(monthlyData)
					.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
					.map(([_, data]) => data)
			}
		}

		graphData = prepareGraphData()
	}

	// D3 chart rendering - this is now at a fixed position in the component
	useEffect(() => {
		// Only render if we have a chart ref and data
		if (chartRef.current && graphData.length > 0) {
			createD3Chart(chartRef, graphData, chartWidth, chartHeight)
		}

		// Clean up function to remove tooltip when component unmounts
		return () => {
			d3.select('body').selectAll('.tooltip').remove()
		}
	}, [graphData, chartWidth, chartHeight, graphView, timeframe])

	if (error) {
		return (
			<div className="container py-10">
				<h1 className="mb-6 text-3xl font-semibold tracking-tight">
					Business Analysis
				</h1>
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
					{error}
				</div>
			</div>
		)
	}

	if (!analysisResults) {
		return (
			<div className="container py-10">
				<h1 className="mb-6 text-3xl font-semibold tracking-tight">
					Business Analysis
				</h1>
				<div className="rounded-md border p-4">
					No analysis data available. Make sure the CSV data file exists at
					'downloads/table-extract.csv'. The analysis is performed automatically
					when this page loads.
				</div>
			</div>
		)
	}

	// Calculate category percentages for the filtered data
	const totalRevenue = filteredStats.revenue
	const categoryRevenuePercentages = Object.entries(
		analysisResults.categoryStats,
	).reduce(
		(acc, [key, value]) => {
			acc[key] = totalRevenue > 0 ? (value.revenue / totalRevenue) * 100 : 0
			return acc
		},
		{} as Record<string, number>,
	)

	// Find top performer and underperformer categories
	const sortedCategories = Object.entries(analysisResults.categoryStats)
		.filter(([_, stats]) => stats.count > 0)
		.sort((a, b) => {
			// Sort by profit margin
			const marginA = a[1].revenue > 0 ? a[1].profit / a[1].revenue : 0
			const marginB = b[1].revenue > 0 ? b[1].profit / b[1].revenue : 0
			return marginB - marginA
		})

	const topPerformer =
		sortedCategories.length > 0 ? sortedCategories[0] : undefined
	const underperformer =
		sortedCategories.length > 0
			? sortedCategories[sortedCategories.length - 1]
			: undefined

	// Calculate average daily revenue
	const avgDailyRevenue =
		filteredDates.length > 0 ? filteredStats.revenue / filteredDates.length : 0

	// Calculate daily revenue trend line (last 7 days)
	const dailyStats = analysisResults.dailyStats
	const last7Days = filteredDates.slice(-7)
	const revenueData = last7Days.map(date => dailyStats[date]?.revenue || 0)

	// Check if revenue is trending up by comparing first and last half of period
	const halfwayPoint = Math.floor(revenueData.length / 2)
	const firstHalfAvg =
		revenueData.slice(0, halfwayPoint).reduce((sum, val) => sum + val, 0) /
			Math.max(1, halfwayPoint) || 0
	const secondHalfAvg =
		revenueData.slice(halfwayPoint).reduce((sum, val) => sum + val, 0) /
			Math.max(1, revenueData.length - halfwayPoint) || 0
	const revenueTrend = calculateTrend(secondHalfAvg - firstHalfAvg)

	return (
		<div className="container py-10">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="text-3xl font-semibold tracking-tight">
					Business Analytics Dashboard
				</h1>
				<div className="text-sm text-muted-foreground">
					Last updated: {lastUpdated}
				</div>
			</div>

			{/* Time range selector */}
			<div className="mb-10">
				<div className="mb-4 flex flex-col space-y-4 sm:flex-row sm:items-end sm:space-x-4 sm:space-y-0">
					<div>
						<div className="mb-2">
							<label
								htmlFor="timeframe-select"
								className="mb-1 block pl-1 text-sm font-medium text-foreground"
							>
								Time Frame
							</label>
							<select
								id="timeframe-select"
								className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm"
								value={timeframe}
								onChange={e => handleTimeframeChange(e.target.value as any)}
							>
								<option value="7d">Last 7 days</option>
								<option value="30d">Last 30 days</option>
								<option value="3m">Last 3 months</option>
								<option value="6m">Last 6 months</option>
								<option value="1y">Last year</option>
								<option value="ytd">Year to date</option>
								<option value="all">All time</option>
								<option value="custom">Custom range</option>
							</select>
						</div>

						{timeframe === 'custom' && (
							<div className="mt-2 flex items-end space-x-2">
								<div className="flex flex-col">
									<label
										htmlFor="start-date"
										className="mb-1 text-xs font-medium text-muted-foreground"
									>
										Start Date
									</label>
									<input
										id="start-date"
										type="date"
										className="rounded-md border border-input bg-background px-3 py-1 text-sm"
										value={startDate}
										onChange={handleStartDateChange}
										max={endDate}
									/>
								</div>
								<div className="flex flex-col">
									<label
										htmlFor="end-date"
										className="mb-1 text-xs font-medium text-muted-foreground"
									>
										End Date
									</label>
									<input
										id="end-date"
										type="date"
										className="rounded-md border border-input bg-background px-3 py-1 text-sm"
										value={endDate}
										onChange={handleEndDateChange}
										min={startDate}
										max={formatETDateForInput(getNowInET())}
									/>
								</div>
								<Button
									size="sm"
									variant="outline"
									onClick={handleApplyDateRange}
								>
									Apply
								</Button>
							</div>
						)}
					</div>

					<div className="ml-auto flex flex-col">
						<label
							htmlFor="graph-view"
							className="mb-1 block pl-1 text-sm font-medium text-foreground"
						>
							Graph View
						</label>
						<div className="flex space-x-2">
							<Button
								id="graph-view"
								variant={graphView === 'daily' ? 'default' : 'outline'}
								onClick={() => handleViewChange('daily')}
								size="sm"
							>
								Daily
							</Button>
							<Button
								variant={graphView === 'weekly' ? 'default' : 'outline'}
								onClick={() => handleViewChange('weekly')}
								size="sm"
							>
								Weekly
							</Button>
							<Button
								variant={graphView === 'monthly' ? 'default' : 'outline'}
								onClick={() => handleViewChange('monthly')}
								size="sm"
							>
								Monthly
							</Button>
						</div>
					</div>
				</div>

				<div className="text-sm text-muted-foreground">
					Showing data from{' '}
					{filteredDates.length > 0
						? `${formatDateET(filteredDates[0] || '')} to ${formatDateET(filteredDates[filteredDates.length - 1] || '')}`
						: 'no dates available'}
				</div>
			</div>

			{/* Revenue & Profit Graph with D3 */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="update" className="mr-3 inline-block h-5 w-5" />
					Revenue & Profit Trends
				</h2>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<div className="flex items-center space-x-4">
							<div className="flex items-center">
								<div className="mr-1 h-3 w-3 rounded-full bg-blue-500"></div>
								<span className="text-sm text-muted-foreground">Revenue</span>
							</div>
							<div className="flex items-center">
								<div className="mr-1 h-3 w-3 rounded-full bg-green-500"></div>
								<span className="text-sm text-muted-foreground">
									Net Profit
								</span>
							</div>
						</div>
						<div className="text-xs text-muted-foreground">
							{graphView === 'daily'
								? 'Daily view'
								: graphView === 'weekly'
									? 'Weekly view'
									: 'Monthly view'}
						</div>
					</div>

					{/* D3 Chart Container */}
					<div
						ref={chartContainerRef}
						className="relative h-[400px] w-full overflow-hidden"
					>
						{graphData.length > 0 ? (
							<svg
								ref={chartRef}
								className="h-full w-full"
								style={{ overflow: 'visible' }}
							/>
						) : (
							<div className="flex h-full items-center justify-center">
								<p className="text-muted-foreground">
									No data available for this date range
								</p>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Summary Cards */}
			<div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">Revenue</p>
					<div className="flex items-end">
						<div>
							<h3 className="text-2xl font-bold">
								{formatCurrency(filteredStats.revenue)}
							</h3>
						</div>
						<TrendIndicator trend={revenueTrend} />
					</div>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="update" className="mr-1 h-4 w-4" />
									Avg. {formatCurrency(avgDailyRevenue)}/day
								</p>
							</TooltipTrigger>
							<TooltipContent>Average daily revenue</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">
						Profit (Before Overhead)
					</p>
					<h3 className="text-2xl font-bold">
						{formatCurrency(filteredStats.profit)}
					</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="update" className="mr-1 h-4 w-4" />
									Margin:{' '}
									{formatPercent(filteredStats.profit / filteredStats.revenue)}
								</p>
							</TooltipTrigger>
							<TooltipContent>
								Profit margin before applying overhead costs
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">
						Net Profit (After Overhead)
					</p>
					<h3 className="text-2xl font-bold">
						{formatCurrency(filteredProfitAfterOverhead)}
					</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="update" className="mr-1 h-4 w-4" />
									Margin: {formatPercent(filteredProfitMarginAfterOverhead)}
								</p>
							</TooltipTrigger>
							<TooltipContent>
								Profit margin after overhead costs
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">
						Appointments
					</p>
					<h3 className="text-2xl font-bold">{filteredStats.appointments}</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="update" className="mr-1 h-4 w-4" />
									Avg. value:{' '}
									{formatCurrency(
										filteredStats.revenue / (filteredStats.appointments || 1),
									)}
								</p>
							</TooltipTrigger>
							<TooltipContent>Average revenue per appointment</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">
						Calendar Days
					</p>
					<h3 className="text-2xl font-bold">{filteredDates.length}</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="update" className="mr-1 h-4 w-4" />
									Overhead: {formatCurrency(filteredStats.overhead)}
								</p>
							</TooltipTrigger>
							<TooltipContent>
								Overhead costs applied to every calendar day
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{/* Service Category Analysis */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="file-text" className="mr-3 inline-block h-5 w-5" />
					Service Category Analysis
				</h2>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					{/* Service breakdown */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-4 text-lg font-medium">
							<Icon name="update" className="mr-2 inline-block h-5 w-5" />
							Revenue by Service Type
						</h3>
						<div className="space-y-4">
							{Object.entries(analysisResults.categoryStats)
								.sort((a, b) => b[1].revenue - a[1].revenue)
								.map(([category, stats]) => {
									const percentage = categoryRevenuePercentages[category] || 0
									if (percentage === 0) return null

									return (
										<div key={category}>
											<div className="mb-1 flex justify-between">
												<span className="font-medium capitalize">
													{category}
												</span>
												<span className="text-sm text-muted-foreground">
													{formatCurrency(stats.revenue)} (
													{formatPercent(percentage)})
												</span>
											</div>
											<div className="h-2.5 w-full rounded-full bg-muted">
												<div
													className="h-2.5 rounded-full bg-primary"
													style={{ width: `${Math.min(percentage, 100)}%` }}
												></div>
											</div>
											<div className="mt-1 text-xs text-muted-foreground">
												{stats.count} appointments •{' '}
												{formatCurrency(stats.revenue / (stats.count || 1))} avg
											</div>
										</div>
									)
								})}
						</div>
					</div>

					{/* Insights panel */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-4 text-lg font-medium">
							<Icon name="check" className="mr-2 inline-block h-5 w-5" />
							Key Insights
						</h3>

						<div className="space-y-4">
							{topPerformer ? (
								<div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-900/20">
									<div className="font-medium">
										<Icon
											name="check"
											className="mr-1 inline-block h-4 w-4 text-green-500"
										/>
										Top Performing Service:{' '}
										<span className="capitalize">{topPerformer[0]}</span>
									</div>
									<p className="mt-1 text-sm">
										Highest profit margin at{' '}
										{formatPercent(
											((topPerformer[1].profit || 0) /
												Math.max(1, topPerformer[1].revenue)) *
												100,
										)}
										. Contributes {formatCurrency(topPerformer[1].profit || 0)}{' '}
										in profits from {topPerformer[1].count || 0} appointments.
									</p>
									<p className="mt-2 text-sm font-medium text-green-700 dark:text-green-400">
										Recommendation: Increase marketing for this high-margin
										service to boost overall profitability.
									</p>
								</div>
							) : null}

							{underperformer &&
								topPerformer &&
								underperformer[0] !== topPerformer[0] && (
									<div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-900/20">
										<div className="font-medium">
											<Icon
												name="cross-1"
												className="mr-1 inline-block h-4 w-4 text-amber-500"
											/>
											Opportunity Area:{' '}
											<span className="capitalize">{underperformer[0]}</span>
										</div>
										<p className="mt-1 text-sm">
											Lower profit margin at{' '}
											{formatPercent(
												((underperformer[1].profit || 0) /
													Math.max(1, underperformer[1].revenue)) *
													100,
											)}
											. Contributes{' '}
											{formatCurrency(underperformer[1].profit || 0)} in profits
											from {underperformer[1].count || 0} appointments.
										</p>
										<p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
											Recommendation: Consider pricing adjustments or cost
											optimization to improve margins.
										</p>
									</div>
								)}

							{/* Overall business health */}
							<div
								className={`p-3 ${
									filteredProfitMarginAfterOverhead > 20
										? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
										: filteredProfitMarginAfterOverhead > 10
											? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20'
											: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20'
								} rounded-md border`}
							>
								<div className="font-medium">
									<Icon name="update" className="mr-1 inline-block h-4 w-4" />
									Business Health Assessment
								</div>
								<p className="mt-1 text-sm">
									Overall profit margin after overhead:{' '}
									{formatPercent(filteredProfitMarginAfterOverhead)}.
									{filteredProfitMarginAfterOverhead > 20
										? ' Your business is performing well above industry average.'
										: filteredProfitMarginAfterOverhead > 10
											? ' Your business is performing around industry average.'
											: ' Your business profit margin is below industry average.'}
								</p>
								<p className="mt-2 text-sm font-medium">
									Average transaction value:{' '}
									{formatCurrency(
										filteredStats.revenue / (filteredStats.appointments || 1),
									)}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Daily Performance */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="clock" className="mr-3 inline-block h-5 w-5" />
					Daily Performance
				</h2>

				<div className="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="bg-muted/50">
									<th className="p-4 text-left font-medium">Date</th>
									<th className="p-4 text-left font-medium">Appointments</th>
									<th className="p-4 text-left font-medium">Revenue</th>
									<th className="p-4 text-left font-medium">Profit (Before)</th>
									<th className="p-4 text-left font-medium">Profit (After)</th>
									<th className="p-4 text-left font-medium">Margin</th>
								</tr>
							</thead>
							<tbody>
								{filteredDates
									.slice(-10)
									.reverse()
									.map(dateStr => {
										const stats = dailyStats[dateStr] || {
											revenue: 0,
											profit: 0,
											count: 0,
											overhead: 0,
										}
										const marginBeforeOverhead =
											stats.revenue > 0
												? (stats.profit / stats.revenue) * 100
												: 0
										const profitAfterOverhead = stats.profit - stats.overhead
										const marginAfterOverhead = calculateProfitMargin(
											profitAfterOverhead,
											stats.revenue,
										)

										return (
											<tr key={dateStr} className="border-t">
												<td className="p-4">{formatDateET(dateStr)}</td>
												<td className="p-4">{stats.count}</td>
												<td className="p-4">{formatCurrency(stats.revenue)}</td>
												<td className="p-4">
													{formatCurrency(stats.profit)}
													<span className="ml-1 text-xs text-muted-foreground">
														({formatPercent(marginBeforeOverhead)} margin)
													</span>
												</td>
												<td className="p-4">
													{formatCurrency(profitAfterOverhead)}
													<span
														className={`ml-1 text-xs ${profitAfterOverhead >= 0 ? 'text-green-500' : 'text-red-500'}`}
													>
														({profitAfterOverhead >= 0 ? '+' : ''}
														{formatCurrency(profitAfterOverhead)})
													</span>
												</td>
												<td className="p-4">
													<div className="flex items-center">
														{formatPercent(marginAfterOverhead)}
														<StatusButton
															status={
																marginAfterOverhead > 30
																	? 'success'
																	: marginAfterOverhead > 15
																		? 'pending'
																		: marginAfterOverhead > 0
																			? 'idle'
																			: 'error'
															}
															className="ml-2 h-6 px-2 py-0 text-xs"
														>
															{marginAfterOverhead > 30
																? 'Great'
																: marginAfterOverhead > 15
																	? 'Good'
																	: marginAfterOverhead > 0
																		? 'Fair'
																		: 'Poor'}
														</StatusButton>
													</div>
												</td>
											</tr>
										)
									})}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* Action Recommendations */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="update" className="mr-3 inline-block h-5 w-5" />
					Strategic Recommendations
				</h2>

				<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					{/* Revenue optimization */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-2 flex items-center font-medium">
							<Icon name="check" className="mr-2 h-5 w-5 text-green-500" />
							Revenue Optimization
						</h3>
						<ul className="space-y-2 text-sm">
							<li className="flex items-start">
								<span className="mr-2 text-green-500">•</span>
								<span>
									{avgDailyRevenue > 1000
										? `Strong daily average of ${formatCurrency(avgDailyRevenue)}. Consider adding premium service tiers.`
										: `Work to increase daily average from ${formatCurrency(avgDailyRevenue)}. Consider bundle offers or loyalty programs.`}
								</span>
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-green-500">•</span>
								<span>
									Focus marketing on{' '}
									{topPerformer ? topPerformer[0] : 'high-margin services'} to
									maximize profitability.
								</span>
							</li>
						</ul>
					</div>

					{/* Profit enhancement */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-2 flex items-center font-medium">
							<Icon name="update" className="mr-2 h-5 w-5 text-amber-500" />
							Profit Enhancement
						</h3>
						<ul className="space-y-2 text-sm">
							<li className="flex items-start">
								<span className="mr-2 text-amber-500">•</span>
								<span>
									{Number(filteredProfitMarginAfterOverhead) < 20
										? `Improve overall margin of ${formatPercent(filteredProfitMarginAfterOverhead)} by reducing overhead costs or increasing prices.`
										: `Maintain strong profit margin of ${formatPercent(filteredProfitMarginAfterOverhead)} by continuing cost controls.`}
								</span>
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-amber-500">•</span>
								<span>
									{underperformer &&
									topPerformer &&
									underperformer[0] !== topPerformer[0]
										? `Review pricing strategy for ${underperformer[0]} services to improve their contribution.`
										: 'Review pricing across all service categories to ensure optimal profitability.'}
								</span>
							</li>
						</ul>
					</div>

					{/* Operational insights */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-2 flex items-center font-medium">
							<Icon name="update" className="mr-2 h-5 w-5 text-blue-500" />
							Operational Insights
						</h3>
						<ul className="space-y-2 text-sm">
							<li className="flex items-start">
								<span className="mr-2 text-blue-500">•</span>
								<span>
									{filteredDates.length > 0 &&
									filteredStats.appointments / filteredDates.length > 5
										? `Strong appointment volume of ${(filteredStats.appointments / Math.max(1, filteredDates.length)).toFixed(1)} per day. Ensure proper staffing.`
										: `Consider strategies to increase daily appointments from current ${(filteredStats.appointments / Math.max(1, filteredDates.length)).toFixed(1)} average.`}
								</span>
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-blue-500">•</span>
								<span>
									{filteredStats.revenue / (filteredStats.appointments || 1) >
									200
										? `Excellent transaction value of ${formatCurrency(filteredStats.revenue / (filteredStats.appointments || 1))}. Continue upselling strategies.`
										: `Work to increase average transaction value from ${formatCurrency(filteredStats.revenue / (filteredStats.appointments || 1))}.`}
								</span>
							</li>
						</ul>
					</div>
				</div>
			</div>

			{/* Category Statistics section */}
			<div className="mb-8 space-y-6">
				<h2 className="text-xl font-medium tracking-tight">
					Category Performance
				</h2>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{/* Render each category card */}
					{[
						'laser',
						'botox',
						'filler',
						'skin',
						'weight',
						'microneedling',
						'consultation',
						'retail',
						'cancelled',
						'other',
					].map(category => {
						const stats =
							analysisResults.categoryStats[category as keyof CategoryStats]
						return (
							<div
								key={category}
								className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
							>
								<div className="mb-2 flex items-center justify-between">
									<h3 className="text-lg font-medium capitalize">{category}</h3>
									<div className="text-sm text-muted-foreground">
										{stats.count} {stats.count === 1 ? 'service' : 'services'}
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<div className="text-sm text-muted-foreground">Revenue</div>
										<div className="text-2xl font-bold">
											{formatCurrency(stats.revenue)}
										</div>
									</div>
									<div>
										<div className="text-sm text-muted-foreground">Profit</div>
										<div className="text-2xl font-bold">
											{formatCurrency(stats.profit)}
										</div>
										<div className="text-xs text-muted-foreground">
											{stats.revenue > 0
												? `${((stats.profit / stats.revenue) * 100).toFixed(1)}% margin`
												: '0% margin'}
										</div>
									</div>
								</div>
							</div>
						)
					})}
				</div>
			</div>

			<div className="text-center text-sm text-muted-foreground">
				<Spacer size="2xs" />
				<p>Data is automatically analyzed on page load.</p>
				<Spacer size="2xs" />
				<Button variant="outline" size="sm" onClick={handleApplyDateRange}>
					<Icon name="update" className="mr-2 h-4 w-4" />
					Refresh Analysis
				</Button>
				<Spacer size="md" />
			</div>
		</div>
	)
}

// Add an error boundary component to handle permission errors
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
