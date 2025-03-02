import fs from 'node:fs'
import path from 'node:path'
import { json } from '@remix-run/node'
import {
	useLoaderData,
	useRouteError,
	isRouteErrorResponse,
	useSearchParams,
	useNavigate,
} from '@remix-run/react'
import { parse } from 'csv-parse/sync'
import { subDays } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { useState, useMemo } from 'react'

import { Spacer } from '#app/components/spacer.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server'

// Define the Route type for this file
export interface Route {
	LoaderArgs: { request: Request }
}

// Define the time zone for all date operations
const TIME_ZONE = 'America/New_York' // Eastern Time

/**
 * Format a date for display in ET timezone
 */
function formatDateET(date: Date | string): string {
	const dateObj = typeof date === 'string' ? new Date(date) : date
	return formatInTimeZone(dateObj, TIME_ZONE, 'MMM d, yyyy')
}

/**
 * Format a date and time for display in ET timezone
 */
function formatDateTimeET(date: Date | string): string {
	const dateObj = typeof date === 'string' ? new Date(date) : date
	return formatInTimeZone(dateObj, TIME_ZONE, 'MMM d, yyyy h:mm a')
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
	return toZonedTime(new Date(dateString), TIME_ZONE)
}

/**
 * Format a date as YYYY-MM-DD in ET timezone for input fields
 */
function formatETDateForInput(date: Date): string {
	return formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd')
}

/**
 * Calculate profit based on the item type and total amount
 *
 * @param {string} item The service/product item
 * @param {number} total The total amount charged
 * @returns {number} The calculated profit
 */
function calculateProfit(item: string, total: number) {
	// Implement the profit calculation logic
	if (item.match(/Laser|Touch Up Laser|Pigmented Lesion/i)) {
		return total // 100% of total
	} else if (item.match(/Botox|Lip Flip|Tox/i)) {
		return total * 0.5 // 50% of total
	} else if (item.match(/Microneedling/i)) {
		// Ensure profit is not negative, minimum profit is $0
		return Math.max(total - 35, 0)
	} else if (item.match(/Skin|Juvederm|Filler/i)) {
		return total * 0.5 // 50% of total
	} else if (item.match(/Tirzepatide|Semaglutide/i)) {
		return total * 0.9 // 90% of total
	} else {
		return total * 0.5 // Default: 50% of total
	}
}

// Appointment interface for display
interface Appointment {
	id: string
	date: Date
	item: string
	total: number
	profit: number
	profitMargin: number
	status: string
	category: string
}

// Define loader data type
type LoaderData = {
	appointments: Appointment[] | null
	error: string | null
	dateRange: {
		startDate: string
		endDate: string
	}
}

function getServiceCategory(item: string): string {
	if (item.match(/Laser|Touch Up Laser|Pigmented Lesion/i)) {
		return 'laser'
	} else if (item.match(/Botox|Lip Flip|Tox/i)) {
		return 'botox'
	} else if (item.match(/Juvederm|Filler/i)) {
		return 'filler'
	} else if (item.match(/Skin/i)) {
		return 'skin'
	} else if (item.match(/Tirzepatide|Semaglutide/i)) {
		return 'weight'
	} else if (item.match(/Microneedling/i)) {
		return 'microneedling'
	} else {
		return 'other'
	}
}

export async function loader({ request }: Route['LoaderArgs']) {
	// First require admin role before proceeding
	await requireUserWithRole(request, 'admin')

	try {
		// Get URL params for date filtering
		const url = new URL(request.url)
		const timeframe = url.searchParams.get('timeframe') || '30d'
		const startParam = url.searchParams.get('start')
		const endParam = url.searchParams.get('end')
		const category = url.searchParams.get('category') || 'all'
		const sortBy = url.searchParams.get('sortBy') || 'date'
		const sortOrder = url.searchParams.get('sortOrder') || 'desc'

		// Set date range based on parameters - using ET timezone
		const endDate = endParam
			? toZonedTime(new Date(endParam), TIME_ZONE)
			: getNowInET()
		let startDate: Date

		if (startParam) {
			startDate = toZonedTime(new Date(startParam), TIME_ZONE)
		} else {
			startDate = getNowInET()
			if (timeframe === '7d') {
				startDate.setDate(startDate.getDate() - 7)
			} else if (timeframe === '30d' || !timeframe) {
				startDate.setDate(startDate.getDate() - 30)
			} else if (timeframe === 'all') {
				// For "all" time, use a very old start date
				startDate = toZonedTime(new Date('2020-01-01'), TIME_ZONE)
			}
		}

		// Path to the CSV file
		const csvFilePath = path.join(
			process.cwd(),
			'downloads',
			'table-extract.csv',
		)

		if (!fs.existsSync(csvFilePath)) {
			// Return empty data if the file doesn't exist
			return json<LoaderData>({
				appointments: null,
				error:
					'Appointments data file not found. Please make sure table-extract.csv exists in the downloads directory.',
				dateRange: {
					startDate: startDate.toISOString(),
					endDate: endDate.toISOString(),
				},
			})
		}

		// Read and parse the CSV file
		const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' })
		const records = parse(fileContent, {
			columns: true,
			skip_empty_lines: true,
			trim: true,
			relaxColumnCount: true,
		})

		// Process appointments
		const appointments: Appointment[] = []
		let counter = 0

		records.forEach((record: any) => {
			// Parse date and convert to ET timezone
			const purchaseDate = parseETDate(record['Purchase Date'])

			// Skip records outside the date range
			if (purchaseDate < startDate || purchaseDate > endDate) {
				return
			}

			const total = parseFloat(record.Total)
			const item = record.Item
			const status = record.Status

			if (isNaN(total) || total === 0) {
				return
			}

			// Apply category filter if specified
			const appointmentCategory = getServiceCategory(item)
			if (category !== 'all' && appointmentCategory !== category) {
				return
			}

			const profit = calculateProfit(item, total)
			const profitMargin = (profit / total) * 100

			appointments.push({
				id: String(++counter), // Generate a unique ID
				date: purchaseDate,
				item,
				total,
				profit,
				profitMargin,
				status: status || 'N/A',
				category: appointmentCategory,
			})
		})

		// Sort appointments
		if (sortBy && sortOrder) {
			appointments.sort((a, b) => {
				let comparison = 0

				if (sortBy === 'date') {
					comparison = a.date.getTime() - b.date.getTime()
				} else if (sortBy === 'total') {
					comparison = a.total - b.total
				} else if (sortBy === 'profit') {
					comparison = a.profit - b.profit
				} else if (sortBy === 'profitMargin') {
					comparison = a.profitMargin - b.profitMargin
				} else if (sortBy === 'item') {
					comparison = a.item.localeCompare(b.item)
				} else if (sortBy === 'category') {
					comparison = a.category.localeCompare(b.category)
				}

				return sortOrder === 'asc' ? comparison : -comparison
			})
		}

		return json<LoaderData>({
			appointments,
			error: null,
			dateRange: {
				startDate: startDate.toISOString(),
				endDate: endDate.toISOString(),
			},
		})
	} catch (error) {
		console.error('Error loading appointments:', error)
		return json<LoaderData>({
			appointments: null,
			error:
				'Failed to load appointments: ' +
				(error instanceof Error ? error.message : String(error)),
			dateRange: {
				startDate: new Date().toISOString(),
				endDate: new Date().toISOString(),
			},
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

export default function AppointmentsPage() {
	const { appointments, error, dateRange } = useLoaderData<typeof loader>()

	// Get search params using Remix's useSearchParams
	const [searchParams, setSearchParams] = useSearchParams()
	const navigate = useNavigate()

	const timeframe = searchParams.get('timeframe') || '30d'
	const startDate =
		searchParams.get('start') || formatETDateForInput(subDays(getNowInET(), 30))
	const endDate = searchParams.get('end') || formatETDateForInput(getNowInET())
	const category = searchParams.get('category') || 'all'
	const sortBy = searchParams.get('sortBy') || 'date'
	const sortOrder = searchParams.get('sortOrder') || 'desc'

	// For filtering by appointment name/service
	const [searchTerm, setSearchTerm] = useState('')

	// Date range for custom filtering - use useMemo to prevent recreating on every render
	const now = useMemo(() => getNowInET(), [])

	// Function to update URL parameters and navigate
	const updateFilter = (params: Record<string, string>) => {
		const newParams = new URLSearchParams(searchParams)

		// Update parameters
		Object.entries(params).forEach(([key, value]) => {
			if (value) {
				newParams.set(key, value)
			} else {
				newParams.delete(key)
			}
		})

		// Use Remix navigate to update URL and reload the page
		navigate(`?${newParams.toString()}`, { replace: true })
	}

	// Handle timeframe button clicks
	const handleTimeframeChange = (
		newTimeframe: '7d' | '30d' | 'all' | 'custom',
	) => {
		if (newTimeframe === '7d') {
			updateFilter({
				timeframe: newTimeframe,
				start: formatETDateForInput(subDays(now, 7)),
				end: formatETDateForInput(now),
			})
		} else if (newTimeframe === '30d') {
			updateFilter({
				timeframe: newTimeframe,
				start: formatETDateForInput(subDays(now, 30)),
				end: formatETDateForInput(now),
			})
		} else if (newTimeframe === 'all') {
			updateFilter({
				timeframe: newTimeframe,
				start: '',
				end: '',
			})
		} else if (newTimeframe === 'custom') {
			updateFilter({
				timeframe: newTimeframe,
				start: startDate,
				end: endDate,
			})
		}
	}

	// Handle custom date changes - these don't trigger page reload
	const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newStart = e.target.value
		const params = new URLSearchParams(searchParams)
		params.set('start', newStart)
		params.set('timeframe', 'custom')
		setSearchParams(params)
	}

	const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newEnd = e.target.value
		const params = new URLSearchParams(searchParams)
		params.set('end', newEnd)
		params.set('timeframe', 'custom')
		setSearchParams(params)
	}

	// Apply button for custom date range
	const handleApplyDateRange = () => {
		// Force reload with current params
		navigate(`?${searchParams.toString()}`, { replace: true })
	}

	// Filter appointments by search term
	const filteredAppointments = appointments
		? appointments.filter(
				appointment =>
					appointment.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
					appointment.status.toLowerCase().includes(searchTerm.toLowerCase()),
			)
		: []

	// Calculate summary statistics
	const totalRevenue = filteredAppointments.reduce(
		(sum, apt) => sum + apt.total,
		0,
	)
	const totalProfit = filteredAppointments.reduce(
		(sum, apt) => sum + apt.profit,
		0,
	)
	const avgProfitMargin =
		totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

	if (error) {
		return (
			<div className="container py-10">
				<h1 className="mb-6 text-3xl font-semibold tracking-tight">
					Appointment Viewer
				</h1>
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
					{error}
				</div>
			</div>
		)
	}

	return (
		<div className="container py-10">
			<div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
				<h1 className="text-3xl font-semibold tracking-tight">
					Appointment Viewer
				</h1>
				<div className="mt-4 text-sm text-muted-foreground md:mt-0">
					Showing data from {formatDateET(dateRange.startDate)} to{' '}
					{formatDateET(dateRange.endDate)}
				</div>
			</div>

			{/* Time range selector */}
			<div className="mb-6">
				<div className="mb-4 flex flex-col space-y-4 sm:flex-row sm:items-end sm:space-x-4 sm:space-y-0">
					<div>
						<div className="mb-2 flex space-x-2">
							<Button
								variant={timeframe === '7d' ? 'default' : 'outline'}
								onClick={() => handleTimeframeChange('7d')}
								size="sm"
							>
								<Icon name="clock" className="mr-1 h-4 w-4" />
								Last 7 days
							</Button>
							<Button
								variant={timeframe === '30d' ? 'default' : 'outline'}
								onClick={() => handleTimeframeChange('30d')}
								size="sm"
							>
								<Icon name="clock" className="mr-1 h-4 w-4" />
								Last 30 days
							</Button>
							<Button
								variant={timeframe === 'all' ? 'default' : 'outline'}
								onClick={() => handleTimeframeChange('all')}
								size="sm"
							>
								<Icon name="clock" className="mr-1 h-4 w-4" />
								All time
							</Button>
							<Button
								variant={timeframe === 'custom' ? 'default' : 'outline'}
								onClick={() => handleTimeframeChange('custom')}
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
									className="mt-5"
									variant="outline"
									onClick={handleApplyDateRange}
								>
									Apply
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Filtering and search options */}
			<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
				<div>
					<Label htmlFor="search" className="mb-2 block text-sm font-medium">
						Search by Service or Status
					</Label>
					<Input
						id="search"
						type="text"
						placeholder="Search appointments..."
						value={searchTerm}
						onChange={e => setSearchTerm(e.target.value)}
						className="w-full"
					/>
				</div>

				<div>
					<Label htmlFor="category" className="mb-2 block text-sm font-medium">
						Filter by Category
					</Label>
					<select
						id="category"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						value={category}
						onChange={e => updateFilter({ category: e.target.value })}
					>
						<option value="all">All Categories</option>
						<option value="laser">Laser</option>
						<option value="botox">Botox</option>
						<option value="filler">Filler</option>
						<option value="skin">Skin</option>
						<option value="weight">Weight Loss</option>
						<option value="microneedling">Microneedling</option>
						<option value="other">Other</option>
					</select>
				</div>

				<div>
					<Label htmlFor="sort" className="mb-2 block text-sm font-medium">
						Sort By
					</Label>
					<div className="flex space-x-2">
						<select
							id="sort"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							value={sortBy}
							onChange={e => updateFilter({ sortBy: e.target.value })}
						>
							<option value="date">Date</option>
							<option value="total">Total</option>
							<option value="profit">Profit</option>
							<option value="profitMargin">Profit Margin</option>
							<option value="item">Service</option>
							<option value="category">Category</option>
						</select>

						<Button
							variant="outline"
							size="icon"
							onClick={() =>
								updateFilter({
									sortOrder: sortOrder === 'asc' ? 'desc' : 'asc',
								})
							}
							title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
						>
							<Icon name="update" className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>

			{/* Summary cards */}
			<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
				<div className="rounded-lg border bg-card p-4 shadow-sm">
					<div className="text-sm font-medium text-muted-foreground">
						Total Appointments
					</div>
					<div className="mt-1 text-2xl font-bold">
						{filteredAppointments.length}
					</div>
				</div>

				<div className="rounded-lg border bg-card p-4 shadow-sm">
					<div className="text-sm font-medium text-muted-foreground">
						Total Revenue
					</div>
					<div className="mt-1 text-2xl font-bold">
						{formatCurrency(totalRevenue)}
					</div>
				</div>

				<div className="rounded-lg border bg-card p-4 shadow-sm">
					<div className="text-sm font-medium text-muted-foreground">
						Total Profit
					</div>
					<div className="mt-1 text-2xl font-bold">
						{formatCurrency(totalProfit)}
						<span className="ml-1 text-sm font-normal text-muted-foreground">
							({formatPercent(avgProfitMargin)})
						</span>
					</div>
				</div>
			</div>

			{/* Appointments table */}
			<div className="rounded-lg border shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="bg-muted/50">
								<th className="whitespace-nowrap p-3 text-left font-medium">
									Date
								</th>
								<th className="whitespace-nowrap p-3 text-left font-medium">
									Service
								</th>
								<th className="whitespace-nowrap p-3 text-left font-medium">
									Category
								</th>
								<th className="whitespace-nowrap p-3 text-left font-medium">
									Status
								</th>
								<th className="whitespace-nowrap p-3 text-left font-medium">
									Total
								</th>
								<th className="whitespace-nowrap p-3 text-left font-medium">
									Profit
								</th>
								<th className="whitespace-nowrap p-3 text-left font-medium">
									Margin
								</th>
							</tr>
						</thead>
						<tbody>
							{filteredAppointments.length > 0 ? (
								filteredAppointments.map(appointment => (
									<tr key={appointment.id} className="border-t">
										<td className="whitespace-nowrap p-3">
											{formatDateTimeET(appointment.date)}
										</td>
										<td className="max-w-xs truncate p-3">
											{appointment.item}
										</td>
										<td className="p-3 capitalize">{appointment.category}</td>
										<td className="p-3">
											<StatusButton
												status={
													appointment.status.toLowerCase() === 'no_charge'
														? 'error'
														: 'success'
												}
												className="px-2 py-0 text-xs"
											>
												{appointment.status === 'no_charge'
													? 'No Charge'
													: appointment.status}
											</StatusButton>
										</td>
										<td className="whitespace-nowrap p-3">
											{formatCurrency(appointment.total)}
										</td>
										<td className="whitespace-nowrap p-3">
											{formatCurrency(appointment.profit)}
										</td>
										<td className="whitespace-nowrap p-3">
											<div className="flex items-center">
												{formatPercent(appointment.profitMargin)}
												<StatusButton
													status={
														appointment.profitMargin > 80
															? 'success'
															: appointment.profitMargin > 50
																? 'pending'
																: appointment.profitMargin > 20
																	? 'idle'
																	: 'error'
													}
													className="ml-2 h-6 px-2 py-0 text-xs"
												>
													{appointment.profitMargin > 80
														? 'High'
														: appointment.profitMargin > 50
															? 'Good'
															: appointment.profitMargin > 20
																? 'Fair'
																: 'Low'}
												</StatusButton>
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={7} className="p-4 text-center">
										{appointments && appointments.length > 0
											? 'No appointments found matching your search criteria.'
											: 'No appointments found for the selected time period.'}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{filteredAppointments.length > 20 && (
				<div className="mt-4 text-center text-sm text-muted-foreground">
					Showing {filteredAppointments.length} appointments
				</div>
			)}

			<div className="mt-8 text-center text-sm text-muted-foreground">
				<Spacer size="2xs" />
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						navigate(`?${searchParams.toString()}`, { replace: true })
					}
				>
					<Icon name="update" className="mr-2 h-4 w-4" />
					Refresh Data
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
