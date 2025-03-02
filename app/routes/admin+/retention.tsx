import { json } from '@remix-run/node'
import {
	useLoaderData,
	useNavigate,
	useRouteError,
	isRouteErrorResponse,
} from '@remix-run/react'
import * as d3 from 'd3'
import {
	addMonths,
	parseISO,
	format,
	subMonths,
	differenceInMonths,
} from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
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

// Time zone constant
const TIME_ZONE = 'America/New_York'

// Define the Route type for this file
export interface Route {
	LoaderArgs: { request: Request }
}

// Types for retention data
interface RetentionData {
	overallRetention: {
		customers: number
		returningCustomers: number
		retentionRate: number
		averageVisitsPerCustomer: number
		totalInvoiceItems: number
		repeatedCategories: {
			[category: string]: number
		}
	}
	categoryRetention: {
		[category: string]: {
			customers: number
			returningCustomers: number
			retentionRate: number
			averageVisitsPerCustomer: number
		}
	}
	visitCountRetention: {
		[visitCount: number]: {
			customers: number
			returnedCustomers: number
			retentionRate: number
		}
	}
	timeBasedRetention: {
		[months: string]: {
			customers: number
			returnedCustomers: number
			retentionRate: number
		}
	}
	customerLifetimeValue: {
		overall: number
		byCategory: {
			[category: string]: number
		}
	}
	customerCohorts: {
		[cohort: string]: {
			customers: number
			retentionByMonth: {
				[month: number]: {
					active: number
					rate: number
				}
			}
		}
	}
	lastUpdated: string
}

interface RetentionChartPoint {
	label: string
	value: number
	category?: string
}

// Define loader data type
type LoaderData = {
	retentionData: RetentionData | null
	error: string | null
}

export async function loader({ request }: Route['LoaderArgs']) {
	// Require admin role before proceeding
	await requireUserWithRole(request, 'admin')

	try {
		// Fetch all invoice items with patient relations
		const invoiceItems = await prisma.invoiceItem.findMany({
			where: {
				patientId: {
					not: null,
				},
			},
			include: {
				patient: true,
			},
			orderBy: {
				date: 'asc',
			},
		})

		if (invoiceItems.length === 0) {
			console.log('No invoice data found in database')
			return json<LoaderData>({
				retentionData: null,
				error: 'No invoice data found. Please import invoices first.',
			})
		}

		console.log(
			`Found ${invoiceItems.length} invoice items for retention analysis`,
		)

		// Group invoices by patient ID
		const patientInvoices: { [patientId: string]: any[] } = {}

		// Group by categories as well
		const patientCategoriesVisited: { [patientId: string]: Set<string> } = {}

		// Track first visit date for cohort analysis
		const patientFirstVisit: { [patientId: string]: Date } = {}

		// Track all dates per patient
		const patientVisitDates: { [patientId: string]: Date[] } = {}

		for (const invoice of invoiceItems) {
			if (!invoice.patientId) continue

			// Initialize arrays if needed
			if (!patientInvoices[invoice.patientId]) {
				patientInvoices[invoice.patientId] = []
			}
			if (!patientCategoriesVisited[invoice.patientId]) {
				patientCategoriesVisited[invoice.patientId] = new Set()
			}
			if (!patientVisitDates[invoice.patientId]) {
				patientVisitDates[invoice.patientId] = []
			}

			// Add to arrays
			patientInvoices[invoice.patientId].push(invoice)
			patientCategoriesVisited[invoice.patientId].add(invoice.category)
			patientVisitDates[invoice.patientId].push(invoice.date)

			// Track first visit (earliest date)
			if (
				!patientFirstVisit[invoice.patientId] ||
				invoice.date < patientFirstVisit[invoice.patientId]
			) {
				patientFirstVisit[invoice.patientId] = invoice.date
			}
		}

		// Calculate overall retention metrics
		const totalPatients = Object.keys(patientInvoices).length
		const returningCustomers = Object.values(patientInvoices).filter(
			invoices => invoices.length > 1,
		).length
		const retentionRate =
			totalPatients > 0 ? (returningCustomers / totalPatients) * 100 : 0

		// Calculate average visits per customer
		const totalVisits = Object.values(patientInvoices).reduce(
			(sum, invoices) => {
				// Count unique dates as visits (could have multiple invoices on same day)
				const uniqueDates = new Set(
					invoices.map(inv => format(inv.date, 'yyyy-MM-dd')),
				)
				return sum + uniqueDates.size
			},
			0,
		)
		const averageVisitsPerCustomer =
			totalPatients > 0 ? totalVisits / totalPatients : 0

		// Calculate repeated categories
		const repeatedCategories: { [category: string]: number } = {}
		Object.values(patientCategoriesVisited).forEach(categories => {
			categories.forEach(category => {
				repeatedCategories[category] = (repeatedCategories[category] || 0) + 1
			})
		})

		// Calculate retention by category
		const categoryCustomers: { [category: string]: Set<string> } = {}
		const categoryReturningCustomers: { [category: string]: Set<string> } = {}

		// Identify customers who've had each category and calculate if they returned for same category
		invoiceItems.forEach(invoice => {
			if (!invoice.patientId) return

			const category = invoice.category

			// Initialize sets if needed
			if (!categoryCustomers[category]) {
				categoryCustomers[category] = new Set()
			}

			// Add patient to category customers
			categoryCustomers[category].add(invoice.patientId)

			// Check if patient has multiple invoices with this category
			const patientCategoryInvoices = patientInvoices[invoice.patientId].filter(
				inv => inv.category === category,
			)

			if (patientCategoryInvoices.length > 1) {
				if (!categoryReturningCustomers[category]) {
					categoryReturningCustomers[category] = new Set()
				}
				categoryReturningCustomers[category].add(invoice.patientId)
			}
		})

		// Format category retention data
		const categoryRetention: RetentionData['categoryRetention'] = {}

		Object.keys(categoryCustomers).forEach(category => {
			const customers = categoryCustomers[category].size
			const returningCustomers = categoryReturningCustomers[category]?.size || 0
			const retentionRate =
				customers > 0 ? (returningCustomers / customers) * 100 : 0

			// Calculate average visits for this category per customer
			let totalCategoryVisits = 0
			categoryCustomers[category].forEach(patientId => {
				const uniqueDates = new Set(
					patientInvoices[patientId]
						.filter(inv => inv.category === category)
						.map(inv => format(inv.date, 'yyyy-MM-dd')),
				)
				totalCategoryVisits += uniqueDates.size
			})
			const averageVisitsPerCustomer =
				customers > 0 ? totalCategoryVisits / customers : 0

			categoryRetention[category] = {
				customers,
				returningCustomers,
				retentionRate,
				averageVisitsPerCustomer,
			}
		})

		// Calculate retention by visit count
		const visitCountRetention: RetentionData['visitCountRetention'] = {}

		// Loop through 1-5 visits
		for (let i = 1; i <= 5; i++) {
			// Customers with at least i visits
			const customersWithVisits = Object.values(patientVisitDates).filter(
				dates => {
					const uniqueDates = new Set(
						dates.map(date => format(date, 'yyyy-MM-dd')),
					)
					return uniqueDates.size >= i
				},
			).length

			// Customers with at least i+1 visits (returned after visit i)
			const returnedCustomers = Object.values(patientVisitDates).filter(
				dates => {
					const uniqueDates = new Set(
						dates.map(date => format(date, 'yyyy-MM-dd')),
					)
					return uniqueDates.size >= i + 1
				},
			).length

			const retentionRate =
				customersWithVisits > 0
					? (returnedCustomers / customersWithVisits) * 100
					: 0

			visitCountRetention[i] = {
				customers: customersWithVisits,
				returnedCustomers,
				retentionRate,
			}
		}

		// Calculate time-based retention (3, 6, 12 months)
		const timeBasedRetention: RetentionData['timeBasedRetention'] = {}

		// Monthly periods to analyze
		const periods = [3, 6, 12]

		periods.forEach(months => {
			// Count customers who had opportunity to return in this period (first visit was at least 'months' ago)
			const cutoffDate = subMonths(new Date(), months)
			const eligiblePatients = Object.entries(patientFirstVisit).filter(
				([_, firstDate]) => firstDate <= cutoffDate,
			)

			// Count customers who did return within the period
			let returnedCustomers = 0

			eligiblePatients.forEach(([patientId, firstDate]) => {
				// Look for visits after first date + gap period
				const cutoffForPatient = addMonths(firstDate, months)

				// Check if there was a visit after the cutoff
				const hasReturnedAfterPeriod = patientVisitDates[patientId].some(
					date => date > cutoffForPatient,
				)

				if (hasReturnedAfterPeriod) {
					returnedCustomers++
				}
			})

			const eligibleCount = eligiblePatients.length
			const retentionRate =
				eligibleCount > 0 ? (returnedCustomers / eligibleCount) * 100 : 0

			timeBasedRetention[`${months}m`] = {
				customers: eligibleCount,
				returnedCustomers,
				retentionRate,
			}
		})

		// Calculate customer lifetime value
		const totalRevenue = invoiceItems.reduce(
			(sum, invoice) => sum + invoice.collected,
			0,
		)
		const customerLifetimeValue =
			totalPatients > 0 ? totalRevenue / totalPatients : 0

		// Calculate customer lifetime value by category
		const categoryRevenue: { [category: string]: number } = {}

		invoiceItems.forEach(invoice => {
			const category = invoice.category
			categoryRevenue[category] =
				(categoryRevenue[category] || 0) + invoice.collected
		})

		const categoryLifetimeValue: { [category: string]: number } = {}

		Object.keys(categoryRevenue).forEach(category => {
			const customers = categoryCustomers[category]?.size || 0
			categoryLifetimeValue[category] =
				customers > 0 ? categoryRevenue[category] / customers : 0
		})

		// Calculate cohort analysis (group by first visit month)
		const customerCohorts: RetentionData['customerCohorts'] = {}

		// Group patients by cohort (first visit month)
		Object.entries(patientFirstVisit).forEach(([patientId, firstDate]) => {
			const cohort = format(firstDate, 'yyyy-MM')

			if (!customerCohorts[cohort]) {
				customerCohorts[cohort] = {
					customers: 0,
					retentionByMonth: {},
				}
			}

			customerCohorts[cohort].customers++

			// Calculate retention for each subsequent month
			const visitDates = patientVisitDates[patientId].map(date =>
				format(date, 'yyyy-MM'),
			)

			// Get unique months where this patient had visits
			const uniqueVisitMonths = Array.from(new Set(visitDates))

			uniqueVisitMonths.forEach(visitMonth => {
				if (visitMonth === cohort) return // Skip first month (100% by definition)

				// Calculate months since first visit
				const cohortDate = parseISO(`${cohort}-01`)
				const visitDate = parseISO(`${visitMonth}-01`)
				const monthDiff = differenceInMonths(visitDate, cohortDate)

				if (monthDiff <= 0) return // Only consider future months

				// Initialize month retention if needed
				if (!customerCohorts[cohort].retentionByMonth[monthDiff]) {
					customerCohorts[cohort].retentionByMonth[monthDiff] = {
						active: 0,
						rate: 0,
					}
				}

				// Count customer as active in this month
				customerCohorts[cohort].retentionByMonth[monthDiff].active++
			})
		})

		// Calculate retention rates for cohorts
		Object.keys(customerCohorts).forEach(cohort => {
			const totalCohortCustomers = customerCohorts[cohort].customers

			Object.keys(customerCohorts[cohort].retentionByMonth).forEach(
				monthDiff => {
					const numMonthDiff = Number(monthDiff)
					const activeCohortCustomers =
						customerCohorts[cohort].retentionByMonth[numMonthDiff].active
					const retentionRate =
						totalCohortCustomers > 0
							? (activeCohortCustomers / totalCohortCustomers) * 100
							: 0

					customerCohorts[cohort].retentionByMonth[numMonthDiff].rate =
						retentionRate
				},
			)
		})

		// Combine all retention metrics
		const retentionData: RetentionData = {
			overallRetention: {
				customers: totalPatients,
				returningCustomers,
				retentionRate,
				averageVisitsPerCustomer,
				totalInvoiceItems: invoiceItems.length,
				repeatedCategories,
			},
			categoryRetention,
			visitCountRetention,
			timeBasedRetention,
			customerLifetimeValue: {
				overall: customerLifetimeValue,
				byCategory: categoryLifetimeValue,
			},
			customerCohorts,
			lastUpdated: new Date().toISOString(),
		}

		return json<LoaderData>({
			retentionData,
			error: null,
		})
	} catch (error) {
		console.error('Error performing analysis:', error)
		return json<LoaderData>({
			retentionData: null,
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

function formatDate(date: string) {
	return format(new Date(date), 'MMM yyyy')
}

// Get trend icon based on trend direction
function TrendIndicator({
	trend,
	isHigherBetter = true,
}: {
	trend: 'positive' | 'negative' | 'neutral'
	isHigherBetter?: boolean
}) {
	// Determine if the trend is good or bad based on context
	const isPositive = isHigherBetter
		? trend === 'positive'
		: trend === 'negative'

	const isNegative = isHigherBetter
		? trend === 'negative'
		: trend === 'positive'

	if (isPositive) {
		return (
			<div className="flex items-center text-green-500">
				<Icon name="check" className="h-4 w-4" />
				<span className="ml-1">Good</span>
			</div>
		)
	} else if (isNegative) {
		return (
			<div className="flex items-center text-red-500">
				<Icon name="cross-1" className="h-4 w-4" />
				<span className="ml-1">Needs improvement</span>
			</div>
		)
	}
	return (
		<div className="flex items-center text-gray-500">
			<Icon name="update" className="h-4 w-4" />
			<span className="ml-1">Neutral</span>
		</div>
	)
}

// D3 chart for retention visualization
function createD3BarChart(
	svgRef: React.RefObject<SVGSVGElement | null>,
	data: RetentionChartPoint[],
	width: number,
	height: number,
	valueFormatter: (value: number) => string = value => value.toString(),
) {
	if (!svgRef.current || data.length === 0) return

	// Clear previous chart
	d3.select(svgRef.current).selectAll('*').remove()

	const margin = { top: 20, right: 30, bottom: 70, left: 60 }
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
		.domain([0, d3.max(data, d => d.value) || 0])
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
				return valueFormatter(d as number)
			}),
		)
		.attr('font-size', '10px')

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

	// Add the bars with hover effects
	g.selectAll('.bar')
		.data(data)
		.enter()
		.append('rect')
		.attr('class', 'bar')
		.attr('x', d => xScale(d.label) || 0)
		.attr('y', d => yScale(d.value))
		.attr('width', xScale.bandwidth())
		.attr('height', d => innerHeight - yScale(d.value))
		.attr('fill', d => {
			// Different colors for categories if provided
			if (d.category) {
				const categoryColors: { [key: string]: string } = {
					laser: 'rgba(59, 130, 246, 0.8)',
					botox: 'rgba(16, 185, 129, 0.8)',
					filler: 'rgba(249, 115, 22, 0.8)',
					skin: 'rgba(139, 92, 246, 0.8)',
					weight: 'rgba(236, 72, 153, 0.8)',
					microneedling: 'rgba(245, 158, 11, 0.8)',
					consultation: 'rgba(107, 114, 128, 0.8)',
					retail: 'rgba(6, 182, 212, 0.8)',
					cancelled: 'rgba(220, 38, 38, 0.8)',
					other: 'rgba(75, 85, 99, 0.8)',
				}
				return categoryColors[d.category] || 'rgba(59, 130, 246, 0.8)'
			}
			return 'rgba(59, 130, 246, 0.8)'
		})
		.on('mouseover', function (_ignored, d) {
			d3.select(this).attr('opacity', 0.7)
			tooltip.style('visibility', 'visible')
				.html(`<strong>${d.label}</strong><br/>
					Value: ${valueFormatter(d.value)}
					${d.category ? `<br/>Category: ${d.category}` : ''}`)
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

	// Add data labels on bars
	g.selectAll('.bar-label')
		.data(data)
		.enter()
		.append('text')
		.attr('class', 'bar-label')
		.attr('text-anchor', 'middle')
		.attr('x', d => (xScale(d.label) || 0) + xScale.bandwidth() / 2)
		.attr('y', d => yScale(d.value) - 5)
		.attr('font-size', '10px')
		.attr('fill', 'currentColor')
		.text(d => valueFormatter(d.value))
}

// Create a heatmap for cohort retention
function createCohortHeatmap(
	svgRef: React.RefObject<SVGSVGElement | null>,
	cohorts: RetentionData['customerCohorts'],
	width: number,
	height: number,
) {
	if (!svgRef.current || Object.keys(cohorts).length === 0) return

	// Clear previous chart
	d3.select(svgRef.current).selectAll('*').remove()

	const margin = { top: 40, right: 30, bottom: 70, left: 100 }
	const innerWidth = width - margin.left - margin.right
	const innerHeight = height - margin.top - margin.bottom

	const svg = d3
		.select(svgRef.current)
		.attr('width', width)
		.attr('height', height)

	const g = svg
		.append('g')
		.attr('transform', `translate(${margin.left},${margin.top})`)

	// Process data for heatmap
	const cohortKeys = Object.keys(cohorts).sort()

	// Get all possible months (1-12)
	const monthsKeys = Array.from(
		new Set(
			cohortKeys.flatMap(cohort =>
				Object.keys(cohorts[cohort].retentionByMonth),
			),
		),
	)
		.map(Number)
		.sort((a, b) => a - b)

	// Create a matrix for the heatmap
	const heatmapData: { cohort: string; month: number; value: number }[] = []

	cohortKeys.forEach(cohort => {
		monthsKeys.forEach(month => {
			const retention = cohorts[cohort].retentionByMonth[month]?.rate || 0
			heatmapData.push({
				cohort,
				month,
				value: retention,
			})
		})
	})

	// Set up scales
	const xScale = d3
		.scaleBand()
		.domain(monthsKeys.map(String))
		.range([0, innerWidth])
		.padding(0.05)

	const yScale = d3
		.scaleBand()
		.domain(cohortKeys)
		.range([0, innerHeight])
		.padding(0.05)

	// Color scale for the heatmap
	const colorScale = d3
		.scaleSequential()
		.interpolator(d3.interpolateBlues)
		.domain([0, 100])

	// Add x axis
	g.append('g')
		.attr('transform', `translate(0,${innerHeight})`)
		.call(d3.axisBottom(xScale))
		.selectAll('text')
		.attr('transform', 'rotate(-35)')
		.attr('text-anchor', 'end')
		.attr('dx', '-.8em')
		.attr('dy', '.15em')
		.attr('font-size', '10px')

	// Add x axis label
	g.append('text')
		.attr('text-anchor', 'middle')
		.attr('x', innerWidth / 2)
		.attr('y', innerHeight + margin.bottom - 10)
		.attr('font-size', '12px')
		.text('Months Since First Visit')

	// Add y axis with better labels
	g.append('g')
		.call(d3.axisLeft(yScale).tickFormat(d => formatDate(d as string)))
		.attr('font-size', '10px')

	// Add y axis label
	g.append('text')
		.attr('text-anchor', 'middle')
		.attr('transform', 'rotate(-90)')
		.attr('x', -innerHeight / 2)
		.attr('y', -margin.left + 30)
		.attr('font-size', '12px')
		.text('Customer Cohort')

	// Add title
	g.append('text')
		.attr('x', innerWidth / 2)
		.attr('y', -margin.top / 2)
		.attr('text-anchor', 'middle')
		.attr('font-size', '14px')
		.attr('font-weight', 'bold')
		.text('Cohort Retention Rates (%)')

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

	// Add heatmap cells
	g.selectAll('rect')
		.data(heatmapData)
		.enter()
		.append('rect')
		.attr('x', d => xScale(String(d.month)) || 0)
		.attr('y', d => yScale(d.cohort) || 0)
		.attr('width', xScale.bandwidth())
		.attr('height', yScale.bandwidth())
		.attr('fill', d => (d.value > 0 ? colorScale(d.value) : '#eeeeee'))
		.on('mouseover', function (event, d) {
			d3.select(this).attr('stroke', 'black').attr('stroke-width', 2)
			tooltip.style('visibility', 'visible')
				.html(`<strong>Cohort:</strong> ${formatDate(d.cohort)}<br/>
					<strong>Month:</strong> ${d.month}<br/>
					<strong>Retention:</strong> ${formatPercent(d.value)}<br/>
					<strong>Active:</strong> ${cohorts[d.cohort].retentionByMonth[d.month]?.active || 0} / ${cohorts[d.cohort].customers} customers`)
		})
		.on('mousemove', function (event) {
			tooltip
				.style('top', event.pageY - 10 + 'px')
				.style('left', event.pageX + 10 + 'px')
		})
		.on('mouseout', function () {
			d3.select(this).attr('stroke', 'none')
			tooltip.style('visibility', 'hidden')
		})

	// Add legend
	const legendWidth = 20
	const legendHeight = 200
	const legend = svg
		.append('g')
		.attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`)

	// Create a gradient for the legend
	const defs = svg.append('defs')
	const gradient = defs
		.append('linearGradient')
		.attr('id', 'heat-gradient')
		.attr('x1', '0%')
		.attr('y1', '100%')
		.attr('x2', '0%')
		.attr('y2', '0%')

	// Add color stops
	gradient.append('stop').attr('offset', '0%').attr('stop-color', colorScale(0))
	gradient
		.append('stop')
		.attr('offset', '100%')
		.attr('stop-color', colorScale(100))

	// Draw the legend rectangle
	legend
		.append('rect')
		.attr('width', legendWidth)
		.attr('height', legendHeight)
		.style('fill', 'url(#heat-gradient)')

	// Add legend axis
	const legendScale = d3.scaleLinear().domain([0, 100]).range([legendHeight, 0])

	legend
		.append('g')
		.attr('transform', `translate(${legendWidth}, 0)`)
		.call(
			d3
				.axisRight(legendScale)
				.tickFormat(d => `${d}%`)
				.ticks(5),
		)

	// Add legend title
	legend
		.append('text')
		.attr('text-anchor', 'middle')
		.attr('transform', 'rotate(90)')
		.attr('x', legendHeight / 2)
		.attr('y', -legendWidth - 10)
		.attr('font-size', '10px')
		.text('Retention Rate')
}

export default function RetentionDashboard() {
	const { retentionData, error } = useLoaderData<typeof loader>()
	const navigate = useNavigate()

	// Chart refs and dimensions
	const categoryChartRef = useRef<SVGSVGElement | null>(null)
	const visitCountChartRef = useRef<SVGSVGElement | null>(null)
	const timeChartRef = useRef<SVGSVGElement | null>(null)
	const clvChartRef = useRef<SVGSVGElement | null>(null)
	const cohortChartRef = useRef<SVGSVGElement | null>(null)

	const [chartWidth, setChartWidth] = useState(800)
	const [chartHeight, setChartHeight] = useState(400)
	const chartContainerRef = useRef<HTMLDivElement>(null)

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

	// Render charts when data is available
	useEffect(() => {
		if (!retentionData) return

		// Prepare category retention chart data
		const categoryData = Object.entries(retentionData.categoryRetention)
			.filter(([_, stats]) => stats.customers > 0)
			.map(([category, stats]) => ({
				label: category,
				value: stats.retentionRate,
				category,
			}))

		// Prepare visit count retention chart data
		const visitCountData = Object.entries(
			retentionData.visitCountRetention,
		).map(([visits, stats]) => ({
			label: `${visits} visit${Number(visits) > 1 ? 's' : ''}`,
			value: stats.retentionRate,
		}))

		// Prepare time-based retention chart data
		const timeData = Object.entries(retentionData.timeBasedRetention).map(
			([period, stats]) => ({
				label: period,
				value: stats.retentionRate,
			}),
		)

		// Prepare CLV chart data
		const clvData = Object.entries(
			retentionData.customerLifetimeValue.byCategory,
		)
			.filter(([_, value]) => value > 0)
			.map(([category, value]) => ({
				label: category,
				value,
				category,
			}))

		// Create the charts
		createD3BarChart(
			categoryChartRef,
			categoryData,
			chartWidth,
			chartHeight,
			value => `${value.toFixed(1)}%`,
		)

		createD3BarChart(
			visitCountChartRef,
			visitCountData,
			chartWidth,
			chartHeight,
			value => `${value.toFixed(1)}%`,
		)

		createD3BarChart(
			timeChartRef,
			timeData,
			chartWidth,
			chartHeight,
			value => `${value.toFixed(1)}%`,
		)

		createD3BarChart(clvChartRef, clvData, chartWidth, chartHeight, value =>
			formatCurrency(value),
		)

		// Create cohort heatmap if we have that data
		if (Object.keys(retentionData.customerCohorts).length > 0) {
			createCohortHeatmap(
				cohortChartRef,
				retentionData.customerCohorts,
				chartWidth,
				chartHeight + 100, // Heatmap needs more height
			)
		}

		// Clean up tooltip on unmount
		return () => {
			d3.select('body').selectAll('.tooltip').remove()
		}
	}, [retentionData, chartWidth, chartHeight])

	if (error) {
		return (
			<div className="container py-10">
				<h1 className="mb-6 text-3xl font-semibold tracking-tight">
					Customer Retention Analysis
				</h1>
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
					{error}
				</div>
			</div>
		)
	}

	if (!retentionData) {
		return (
			<div className="container py-10">
				<h1 className="mb-6 text-3xl font-semibold tracking-tight">
					Customer Retention Analysis
				</h1>
				<div className="rounded-md border p-4">
					No retention data available. Make sure you have invoice data with
					patient information.
				</div>
			</div>
		)
	}

	// Format data for display
	const lastUpdated = formatInTimeZone(
		new Date(retentionData.lastUpdated),
		TIME_ZONE,
		'MMM d, yyyy h:mm a',
	)

	// Sort categories by retention rate for the category cards
	const sortedCategories = Object.entries(retentionData.categoryRetention)
		.filter(([_, stats]) => stats.customers >= 3) // Only consider categories with at least 3 customers
		.sort((a, b) => b[1].retentionRate - a[1].retentionRate)

	const topCategory = sortedCategories.length > 0 ? sortedCategories[0] : null
	const bottomCategory =
		sortedCategories.length > 0
			? sortedCategories[sortedCategories.length - 1]
			: null

	return (
		<div className="container py-10">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="text-3xl font-semibold tracking-tight">
					Customer Retention Analysis
				</h1>
				<div className="text-sm text-muted-foreground">
					Last updated: {lastUpdated}
				</div>
			</div>

			{/* KPI summary cards */}
			<div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="flex items-start justify-between">
						<div>
							<p className="text-sm font-medium text-muted-foreground">
								Overall Retention Rate
							</p>
							<h3 className="text-2xl font-bold">
								{formatPercent(retentionData.overallRetention.retentionRate)}
							</h3>
						</div>
						<TrendIndicator
							trend={
								retentionData.overallRetention.retentionRate >= 50
									? 'positive'
									: retentionData.overallRetention.retentionRate >= 30
										? 'neutral'
										: 'negative'
							}
						/>
					</div>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="avatar" className="mr-1 h-4 w-4" />
									{retentionData.overallRetention.returningCustomers} /{' '}
									{retentionData.overallRetention.customers} customers returned
								</p>
							</TooltipTrigger>
							<TooltipContent>
								Percentage of customers who made at least one repeat visit
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">
						Average Visits per Customer
					</p>
					<h3 className="text-2xl font-bold">
						{retentionData.overallRetention.averageVisitsPerCustomer.toFixed(1)}
					</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="calendar" className="mr-1 h-4 w-4" />
									{retentionData.overallRetention.customers} customers,{' '}
									{retentionData.overallRetention.totalInvoiceItems} invoices
								</p>
							</TooltipTrigger>
							<TooltipContent>
								Average number of visits per unique customer
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">
						Customer Lifetime Value
					</p>
					<h3 className="text-2xl font-bold">
						{formatCurrency(retentionData.customerLifetimeValue.overall)}
					</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="update" className="mr-1 h-4 w-4" />
									Average revenue per customer
								</p>
							</TooltipTrigger>
							<TooltipContent>
								Total revenue divided by number of unique customers
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium text-muted-foreground">
						12-Month Retention Rate
					</p>
					<h3 className="text-2xl font-bold">
						{formatPercent(
							retentionData.timeBasedRetention['12m']?.retentionRate || 0,
						)}
					</h3>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<Icon name="calendar" className="mr-1 h-4 w-4" />
									{retentionData.timeBasedRetention['12m']?.returnedCustomers ||
										0}{' '}
									/ {retentionData.timeBasedRetention['12m']?.customers || 0}{' '}
									customers
								</p>
							</TooltipTrigger>
							<TooltipContent>
								Percentage of customers who returned after 12 months
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{/* Time-based retention chart */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="calendar" className="mr-3 inline-block h-5 w-5" />
					Time-Based Retention
				</h2>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<p className="text-sm text-muted-foreground">
							Percentage of customers who returned after specific time periods
						</p>
					</div>

					<div ref={chartContainerRef} className="h-[400px] w-full">
						<svg
							ref={timeChartRef}
							className="h-full w-full"
							style={{ overflow: 'visible' }}
						/>
					</div>

					{/* Stats below chart */}
					<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
						{Object.entries(retentionData.timeBasedRetention).map(
							([period, stats]) => (
								<div key={period} className="rounded-md bg-muted/50 p-3">
									<h4 className="text-md font-medium">{period} Period</h4>
									<p className="mt-1 text-2xl font-bold">
										{formatPercent(stats.retentionRate)}
									</p>
									<p className="text-xs text-muted-foreground">
										{stats.returnedCustomers} out of {stats.customers} eligible
										customers returned
									</p>
								</div>
							),
						)}
					</div>
				</div>
			</div>

			{/* Category retention chart */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="file-text" className="mr-3 inline-block h-5 w-5" />
					Retention by Service Category
				</h2>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<p className="text-sm text-muted-foreground">
							Percentage of customers who returned for the same service category
						</p>
					</div>

					<div className="h-[400px] w-full">
						<svg
							ref={categoryChartRef}
							className="h-full w-full"
							style={{ overflow: 'visible' }}
						/>
					</div>

					{/* Category insights */}
					<div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
						{topCategory && (
							<div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-900/20">
								<h4 className="font-medium capitalize">
									<Icon
										name="check"
										className="mr-1 inline h-4 w-4 text-green-500"
									/>
									Highest Retention: {topCategory[0]}
								</h4>
								<p className="mt-2 text-sm">
									{formatPercent(topCategory[1].retentionRate)} of customers
									returned for this service. On average, customers get{' '}
									{topCategory[1].averageVisitsPerCustomer.toFixed(1)}{' '}
									{topCategory[0]} services.
								</p>
								<p className="mt-2 text-sm font-medium text-green-700 dark:text-green-400">
									This is your most "sticky" service with the highest customer
									loyalty.
								</p>
							</div>
						)}

						{bottomCategory && bottomCategory[0] !== topCategory?.[0] && (
							<div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20">
								<h4 className="font-medium capitalize">
									<Icon
										name="cross-1"
										className="mr-1 inline h-4 w-4 text-amber-500"
									/>
									Improvement Opportunity: {bottomCategory[0]}
								</h4>
								<p className="mt-2 text-sm">
									Only {formatPercent(bottomCategory[1].retentionRate)} of
									customers return for this service. Consider outreach to these
									customers to improve retention.
								</p>
								<p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
									Focus on customer experience for {bottomCategory[0]} services
									to increase repeat business.
								</p>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Visit count retention chart */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="update" className="mr-3 inline-block h-5 w-5" />
					Retention by Visit Count
				</h2>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<p className="text-sm text-muted-foreground">
							Likelihood of customers to return after N visits
						</p>
					</div>

					<div className="h-[400px] w-full">
						<svg
							ref={visitCountChartRef}
							className="h-full w-full"
							style={{ overflow: 'visible' }}
						/>
					</div>

					{/* Additional insights */}
					<div className="mt-6">
						<h4 className="mb-2 font-medium">Key Insights:</h4>
						<ul className="space-y-2 text-sm">
							{Object.entries(retentionData.visitCountRetention).map(
								([visits, stats]) => (
									<li key={visits} className="flex items-start">
										<span className="mr-2 text-primary">•</span>
										{Number(visits) === 1 ? (
											<span>
												After their first visit,{' '}
												{formatPercent(stats.retentionRate)} of customers return
												for a second visit.
												{stats.retentionRate < 50
													? ' This indicates a potential issue with first-time customer experience.'
													: ''}
											</span>
										) : (
											<span>
												{formatPercent(stats.retentionRate)} of customers with{' '}
												{visits} visits return for another visit.
												{stats.retentionRate >
												(retentionData.visitCountRetention[Number(visits) - 1]
													?.retentionRate || 0)
													? ' Customer loyalty increases with each visit.'
													: ''}
											</span>
										)}
									</li>
								),
							)}

							<li className="flex items-start pt-2">
								<span className="mr-2 font-bold text-primary">→</span>
								{retentionData.visitCountRetention[1]?.retentionRate < 50 ? (
									<span className="font-medium">
										Focus on improving the first-time customer experience to
										increase overall retention.
									</span>
								) : (
									<span className="font-medium">
										Your retention improves with visit count, showing your
										service builds customer loyalty over time.
									</span>
								)}
							</li>
						</ul>
					</div>
				</div>
			</div>

			{/* Customer lifetime value chart */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="update" className="mr-3 inline-block h-5 w-5" />
					Customer Lifetime Value by Category
				</h2>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<p className="text-sm text-muted-foreground">
							Average revenue per customer by service category
						</p>
					</div>

					<div className="h-[400px] w-full">
						<svg
							ref={clvChartRef}
							className="h-full w-full"
							style={{ overflow: 'visible' }}
						/>
					</div>

					{/* CLV insights */}
					<div className="mt-6">
						<h4 className="mb-2 font-medium">Lifetime Value Analysis:</h4>
						<p className="text-sm">
							Overall customer lifetime value:{' '}
							<span className="font-bold">
								{formatCurrency(retentionData.customerLifetimeValue.overall)}
							</span>
						</p>
						<p className="mt-2 text-sm">Top value categories:</p>
						<ul className="mt-1 space-y-1 text-sm">
							{Object.entries(retentionData.customerLifetimeValue.byCategory)
								.sort((a, b) => b[1] - a[1])
								.slice(0, 3)
								.map(([category, value]) => (
									<li key={category} className="flex items-start">
										<span className="mr-2 text-primary">•</span>
										<span className="capitalize">{category}</span>:{' '}
										<span className="ml-1 font-medium">
											{formatCurrency(value)}
										</span>
									</li>
								))}
						</ul>
						<p className="mt-4 text-sm font-medium">
							Recommendation: Focus marketing efforts on acquiring new customers
							for{' '}
							{Object.entries(retentionData.customerLifetimeValue.byCategory)
								.sort((a, b) => b[1] - a[1])
								.slice(0, 1)
								.map(([category]) => category)[0] || ''}{' '}
							services, which generate the highest customer lifetime value.
						</p>
					</div>
				</div>
			</div>

			{/* Cohort analysis */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="calendar" className="mr-3 inline-block h-5 w-5" />
					Cohort Retention Analysis
				</h2>

				<div className="rounded-lg border bg-card p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<p className="text-sm text-muted-foreground">
							Customer retention by cohort (acquisition month) over time
						</p>
					</div>

					<div className="h-[500px] w-full">
						<svg
							ref={cohortChartRef}
							className="h-full w-full"
							style={{ overflow: 'visible' }}
						/>
					</div>

					{/* Cohort insights */}
					<div className="mt-6">
						<h4 className="mb-2 font-medium">Cohort Analysis Insights:</h4>
						<p className="text-sm">
							The heatmap above shows retention rates for each customer cohort
							(grouped by first visit month) over time. Darker blue indicates
							higher retention in the given month after first visit.
						</p>
						<ul className="mt-2 space-y-2 text-sm">
							<li className="flex items-start">
								<span className="mr-2 text-primary">•</span>
								<span>
									Vertical patterns show how specific cohorts perform over time.
								</span>
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-primary">•</span>
								<span>
									Horizontal patterns show retention trends at specific
									lifecycle stages.
								</span>
							</li>
							{Object.entries(retentionData.customerCohorts)
								.filter(([_, cohort]) => cohort.customers >= 5)
								.sort((a, b) => {
									// Sort by average retention rate across months
									const getAvgRetention = (
										cohort: (typeof retentionData.customerCohorts)[string],
									) => {
										const rates = Object.values(cohort.retentionByMonth).map(
											m => m.rate,
										)
										return rates.length > 0
											? rates.reduce((sum, rate) => sum + rate, 0) /
													rates.length
											: 0
									}
									return getAvgRetention(b[1]) - getAvgRetention(a[1])
								})
								.slice(0, 1)
								.map(([cohortDate, cohort]) => (
									<li key={cohortDate} className="flex items-start pt-2">
										<span className="mr-2 font-bold text-green-500">→</span>
										<span>
											Best performing cohort:{' '}
											<strong>{formatDate(cohortDate)}</strong> with{' '}
											{cohort.customers} customers and strong retention in
											months{' '}
											{Object.entries(cohort.retentionByMonth)
												.filter(([_, month]) => month.rate >= 40)
												.map(([month]) => month)
												.join(', ')}
											.
										</span>
									</li>
								))}
						</ul>
					</div>
				</div>
			</div>

			{/* Strategic recommendations */}
			<div className="mb-10">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					<Icon name="check" className="mr-3 inline-block h-5 w-5" />
					Retention Strategy Recommendations
				</h2>

				<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					{/* First visit experience */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-2 flex items-center font-medium">
							<Icon name="avatar" className="mr-2 h-5 w-5 text-blue-500" />
							First Visit Experience
						</h3>
						<ul className="space-y-2 text-sm">
							<li className="flex items-start">
								<span className="mr-2 text-blue-500">•</span>
								<span>
									{formatPercent(
										retentionData.visitCountRetention[1]?.retentionRate || 0,
									)}{' '}
									of first-time customers return.
									{retentionData.visitCountRetention[1]?.retentionRate < 50
										? ' Focus on improving this key metric.'
										: ' Continue your strong first impression strategy.'}
								</span>
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-blue-500">•</span>
								<span>
									Implement a post-first-visit follow-up program to increase
									second-visit likelihood.
								</span>
							</li>
						</ul>
					</div>

					{/* Service-specific retention */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-2 flex items-center font-medium">
							<Icon name="update" className="mr-2 h-5 w-5 text-green-500" />
							Service-Specific Retention
						</h3>
						<ul className="space-y-2 text-sm">
							{topCategory && (
								<li className="flex items-start">
									<span className="mr-2 text-green-500">•</span>
									<span>
										<span className="capitalize">{topCategory[0]}</span> has
										your highest retention at{' '}
										{formatPercent(topCategory[1].retentionRate)}. Analyze what
										makes this service so "sticky" and apply to other offerings.
									</span>
								</li>
							)}
							{bottomCategory && bottomCategory[0] !== topCategory?.[0] && (
								<li className="flex items-start">
									<span className="mr-2 text-green-500">•</span>
									<span>
										Improve{' '}
										<span className="capitalize">{bottomCategory[0]}</span>{' '}
										retention from{' '}
										{formatPercent(bottomCategory[1].retentionRate)} with
										targeted follow-up communications and reminders about
										benefits of continuing treatment.
									</span>
								</li>
							)}
						</ul>
					</div>

					{/* Lifetime value maximization */}
					<div className="rounded-lg border bg-card p-5 shadow-sm">
						<h3 className="mb-2 flex items-center font-medium">
							<Icon name="update" className="mr-2 h-5 w-5 text-amber-500" />
							Lifetime Value Maximization
						</h3>
						<ul className="space-y-2 text-sm">
							<li className="flex items-start">
								<span className="mr-2 text-amber-500">•</span>
								<span>
									Current average lifetime value:{' '}
									{formatCurrency(retentionData.customerLifetimeValue.overall)}.
									Increase this by improving retention and encouraging
									cross-category purchases.
								</span>
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-amber-500">•</span>
								<span>
									After {Object.keys(retentionData.visitCountRetention).length}{' '}
									visits, approximately{' '}
									{formatPercent(
										Object.values(retentionData.visitCountRetention).reduce(
											(acc, curr) => Math.min(acc, curr.retentionRate),
											100,
										),
									)}{' '}
									of customers continue to return. Consider a loyalty program
									for customers with 3+ visits.
								</span>
							</li>
						</ul>
					</div>
				</div>
			</div>

			{/* Detailed stats section */}
			<div className="mb-8">
				<h2 className="mb-4 text-xl font-medium tracking-tight">
					Detailed Category Statistics
				</h2>
				<div className="overflow-x-auto rounded-lg border shadow-sm">
					<table className="w-full">
						<thead className="bg-muted/50">
							<tr>
								<th className="p-3 text-left font-medium">Category</th>
								<th className="p-3 text-left font-medium">Customers</th>
								<th className="p-3 text-left font-medium">Retention Rate</th>
								<th className="p-3 text-left font-medium">Avg. Visits</th>
								<th className="p-3 text-left font-medium">Lifetime Value</th>
							</tr>
						</thead>
						<tbody>
							{Object.entries(retentionData.categoryRetention)
								.sort((a, b) => b[1].retentionRate - a[1].retentionRate)
								.map(([category, stats]) => (
									<tr key={category} className="border-t">
										<td className="p-3 capitalize">{category}</td>
										<td className="p-3">{stats.customers}</td>
										<td className="p-3">
											<div className="flex items-center">
												{formatPercent(stats.retentionRate)}
												<StatusButton
													status={
														stats.retentionRate > 60
															? 'success'
															: stats.retentionRate > 40
																? 'pending'
																: stats.retentionRate > 20
																	? 'idle'
																	: 'error'
													}
													className="ml-2 h-6 px-2 py-0 text-xs"
												>
													{stats.retentionRate > 60
														? 'High'
														: stats.retentionRate > 40
															? 'Medium'
															: stats.retentionRate > 20
																? 'Low'
																: 'Poor'}
												</StatusButton>
											</div>
										</td>
										<td className="p-3">
											{stats.averageVisitsPerCustomer.toFixed(1)}
										</td>
										<td className="p-3">
											{formatCurrency(
												retentionData.customerLifetimeValue.byCategory[
													category
												] || 0,
											)}
										</td>
									</tr>
								))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="text-center text-sm text-muted-foreground">
				<Spacer size="2xs" />
				<p>Retention data is automatically analyzed on page load.</p>
				<Spacer size="2xs" />
				<Button
					variant="outline"
					size="sm"
					onClick={() => navigate('', { replace: true })}
				>
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
				<p>
					An unexpected error occurred while analyzing retention data. Please
					try again later.
				</p>
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
