import fs from 'node:fs'
import path from 'node:path'
import { json } from '@remix-run/node'
import {
	useLoaderData,
	useRouteError,
	isRouteErrorResponse,
} from '@remix-run/react'
import * as d3 from 'd3'
import {
	// addDays, // Unused import
	format,
	parseISO,
	subDays,
	startOfWeek,
	// endOfWeek, // Unused import
} from 'date-fns'
import { useState, useEffect, useRef, useMemo } from 'react'

import { Spacer } from '#app/components/spacer.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server'

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

// Define loader data type
type LoaderData = {
	analysisResults: AnalysisResults | null
	error: string | null
}

export async function loader({ request }: Route['LoaderArgs']) {
	// First require admin role before proceeding
	await requireUserWithRole(request, 'admin')

	try {
		// Read the analysis results from the JSON file
		const analysisFilePath = path.join(
			process.cwd(),
			'data',
			'analysis-results.json',
		)

		if (!fs.existsSync(analysisFilePath)) {
			// Return empty data if the file doesn't exist yet
			return json<LoaderData>({
				analysisResults: null,
				error: 'Analysis data not found. Please run the analysis job first.',
			})
		}

		const analysisResults = JSON.parse(
			fs.readFileSync(analysisFilePath, 'utf-8'),
		) as AnalysisResults

		return json<LoaderData>({
			analysisResults,
			error: null,
		})
	} catch (error) {
		console.error('Error loading analysis data:', error)
		return json<LoaderData>({
			analysisResults: null,
			error:
				'Failed to load analysis data: ' +
				(error instanceof Error ? error.message : String(error)),
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
		maximumFractionDigits: 1,
	}).format(value / 100)
}

function formatDate(dateString: string) {
	try {
		return format(parseISO(dateString), 'MMM d, yyyy')
	} catch (e) {
		return dateString
	}
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
		.on('mouseover', function (event, d) {
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
		.on('mouseover', function (event, d) {
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
		.attr('transform', (d, i) => `translate(${width - 20}, ${i * 20 + 20})`)

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

	const [timeframe, setTimeframe] = useState<'7d' | '30d' | 'all' | 'custom'>(
		'30d',
	)
	const [graphView, setGraphView] = useState<'daily' | 'weekly'>('daily')
	const chartRef = useRef<SVGSVGElement | null>(null)
	const [chartWidth, setChartWidth] = useState(800)
	const [chartHeight, setChartHeight] = useState(400)
	const chartContainerRef = useRef<HTMLDivElement>(null)

	// Date range for custom filtering - use useMemo to prevent recreating on every render
	const now = useMemo(() => new Date(), [])
	const defaultStartDate = format(subDays(now, 30), 'yyyy-MM-dd')
	const defaultEndDate = format(now, 'yyyy-MM-dd')

	const [startDate, setStartDate] = useState(defaultStartDate)
	const [endDate, setEndDate] = useState(defaultEndDate)

	// Update the date range when timeframe changes
	useEffect(() => {
		if (timeframe === '7d') {
			setStartDate(format(subDays(now, 7), 'yyyy-MM-dd'))
			setEndDate(format(now, 'yyyy-MM-dd'))
		} else if (timeframe === '30d') {
			setStartDate(format(subDays(now, 30), 'yyyy-MM-dd'))
			setEndDate(format(now, 'yyyy-MM-dd'))
		} else if (timeframe === 'all') {
			// Don't change the dates for "all" - we'll ignore them anyway
		}
	}, [timeframe, now])

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

		lastUpdated = formatDate(analysisResults.lastUpdated)

		// Filter daily stats by timeframe or custom date range
		filteredDates = Object.keys(dailyStats || {})
			.filter(dateStr => {
				if (timeframe === 'all') return true

				const date = parseISO(dateStr)

				if (timeframe === 'custom') {
					const customStart = parseISO(startDate)
					const customEnd = parseISO(endDate)
					return date >= customStart && date <= customEnd
				}

				const daysAgo = timeframe === '7d' ? 7 : 30
				const cutoff = subDays(now, daysAgo)

				return date >= cutoff
			})
			.sort()

		// Calculate filtered sums and metrics
		filteredStats = filteredDates.reduce(
			(acc, dateStr) => {
				const dayStats = dailyStats[dateStr] || {
					revenue: 0,
					profit: 0,
					count: 0,
					overhead: 0,
				}
				acc.revenue += dayStats.revenue
				acc.profit += dayStats.profit
				acc.appointments += dayStats.count
				acc.overhead += dayStats.overhead
				return acc
			},
			{ revenue: 0, profit: 0, appointments: 0, overhead: 0 },
		)

		_filteredProfitMargin =
			filteredStats.revenue > 0
				? (filteredStats.profit / filteredStats.revenue) * 100
				: 0

		filteredProfitAfterOverhead = filteredStats.profit - filteredStats.overhead
		filteredProfitMarginAfterOverhead =
			filteredStats.revenue > 0
				? (filteredProfitAfterOverhead / filteredStats.revenue) * 100
				: 0

		// Prepare chart data
		const prepareGraphData = (): GraphDataPoint[] => {
			if (graphView === 'daily') {
				// Daily view - use filtered dates directly
				return filteredDates.map(dateStr => ({
					date: dateStr,
					label: format(parseISO(dateStr), 'MMM d'),
					revenue: dailyStats[dateStr]?.revenue || 0,
					profit:
						(dailyStats[dateStr]?.profit || 0) -
						(dailyStats[dateStr]?.overhead || 0),
				}))
			} else {
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
					const date = parseISO(dateStr)
					const weekStart = startOfWeek(date, { weekStartsOn: 1 }) // Week starts on Monday
					const weekKey = format(weekStart, 'yyyy-MM-dd')

					if (!weeklyData[weekKey]) {
						weeklyData[weekKey] = {
							date: weekKey,
							revenue: 0,
							profit: 0,
							count: 0,
							label: `Week of ${format(weekStart, 'MMM d')}`,
						}
					}

					const stats = dailyStats[dateStr]
					weeklyData[weekKey].revenue += stats?.revenue || 0
					weeklyData[weekKey].profit +=
						(stats?.profit || 0) - (stats?.overhead || 0)
					weeklyData[weekKey].count++
				})

				return Object.entries(weeklyData)
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
					No analysis data available. Please run the analysis job to generate
					data.
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
						<div className="mb-2 flex space-x-2">
							<Button
								variant={timeframe === '7d' ? 'default' : 'outline'}
								onClick={() => setTimeframe('7d')}
								size="sm"
							>
								<Icon name="clock" className="mr-1 h-4 w-4" />
								Last 7 days
							</Button>
							<Button
								variant={timeframe === '30d' ? 'default' : 'outline'}
								onClick={() => setTimeframe('30d')}
								size="sm"
							>
								<Icon name="clock" className="mr-1 h-4 w-4" />
								Last 30 days
							</Button>
							<Button
								variant={timeframe === 'all' ? 'default' : 'outline'}
								onClick={() => setTimeframe('all')}
								size="sm"
							>
								<Icon name="clock" className="mr-1 h-4 w-4" />
								All time
							</Button>
							<Button
								variant={timeframe === 'custom' ? 'default' : 'outline'}
								onClick={() => setTimeframe('custom')}
								size="sm"
							>
								<Icon name="clock" className="mr-1 h-4 w-4" />
								Custom
							</Button>
						</div>

						{timeframe === 'custom' && (
							<div className="mt-2 flex items-center space-x-2">
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
										onChange={e => setStartDate(e.target.value)}
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
										onChange={e => setEndDate(e.target.value)}
										min={startDate}
										max={format(now, 'yyyy-MM-dd')}
									/>
								</div>
								<Button
									size="sm"
									className="mt-5"
									variant="outline"
									onClick={() => {
										// Force refresh calculations
										const temp = timeframe
										setTimeframe('all')
										setTimeout(() => setTimeframe(temp), 10)
									}}
								>
									Apply
								</Button>
							</div>
						)}
					</div>

					<div className="ml-auto flex items-center space-x-2">
						<span className="text-sm font-medium text-muted-foreground">
							Graph view:
						</span>
						<Button
							variant={graphView === 'daily' ? 'default' : 'outline'}
							onClick={() => setGraphView('daily')}
							size="sm"
						>
							Daily
						</Button>
						<Button
							variant={graphView === 'weekly' ? 'default' : 'outline'}
							onClick={() => setGraphView('weekly')}
							size="sm"
						>
							Weekly
						</Button>
					</div>
				</div>

				<div className="text-sm text-muted-foreground">
					Showing data from{' '}
					{filteredDates.length > 0
						? `${formatDate(filteredDates[0] || '')} to ${formatDate(filteredDates[filteredDates.length - 1] || '')}`
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
							{graphView === 'daily' ? 'Daily view' : 'Weekly view'}
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

			{/* KPI summary cards */}
			<div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="flex items-start justify-between">
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Total Revenue
							</p>
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
						Net Profit
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
						Total Appointments
					</p>
					<h3 className="text-2xl font-bold">{filteredStats.appointments}</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="avatar" className="mr-1 h-4 w-4" />
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
						Operating Days
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
							<TooltipContent>Total overhead costs for period</TooltipContent>
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
													style={{ width: `${percentage}%` }}
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
									<th className="p-4 text-left font-medium">Profit</th>
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
										const _margin =
											stats.revenue > 0
												? (stats.profit / stats.revenue) * 100
												: 0
										const profitAfterOverhead = stats.profit - stats.overhead
										const marginAfterOverhead =
											stats.revenue > 0
												? (profitAfterOverhead / stats.revenue) * 100
												: 0

										return (
											<tr key={dateStr} className="border-t">
												<td className="p-4">{formatDate(dateStr)}</td>
												<td className="p-4">{stats.count}</td>
												<td className="p-4">{formatCurrency(stats.revenue)}</td>
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
																? 'High'
																: marginAfterOverhead > 15
																	? 'Medium'
																	: marginAfterOverhead > 0
																		? 'Low'
																		: 'Loss'}
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

			<div className="text-center text-sm text-muted-foreground">
				<Spacer size="2xs" />
				<p>Run the analysis job to refresh this data.</p>
				<Spacer size="2xs" />
				<Button
					variant="outline"
					size="sm"
					onClick={() => (window.location.href = '/admin/bg')}
				>
					<Icon name="update" className="mr-2 h-4 w-4" />
					Go to Background Jobs
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
