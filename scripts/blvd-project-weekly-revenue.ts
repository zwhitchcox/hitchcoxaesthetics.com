import 'dotenv/config'

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

import {
	boulevardAdminFetch,
	listBlvdAdminLocations,
	type BlvdAdminLocation,
} from '#app/utils/blvd-admin.server.ts'
import { getProjectedRevenueForBlvdService } from '#app/utils/service-pricing.ts'

const BUSINESS_TIMEZONE = 'America/New_York'
const APPOINTMENT_PAGE_SIZE = 100
const ORDER_PAGE_SIZE = 100
const MAX_APPOINTMENT_PAGES_PER_LOCATION = 100
const MAX_ORDER_PAGES_PER_LOCATION = 100
const DEFAULT_HISTORY_DAYS = 365
const DEFAULT_MIN_SAMPLE_SIZE = 3

type AppointmentServiceSegment = {
	appointmentId: string
	bookedAt: Date | null
	cancelled: boolean
	clientName: string
	durationMinutes: number | null
	locationId: string
	locationName: string
	serviceId: string | null
	serviceName: string
	startAt: Date
	state: string | null
}

type AppointmentNode = {
	appointmentServices?: Array<{
		duration?: number | null
		endAt?: string | null
		id?: string | null
		service?: {
			id?: string | null
			name?: string | null
		} | null
		startAt?: string | null
	}> | null
	bookedAt?: string | null
	cancelled?: boolean | null
	client?: {
		firstName?: string | null
		lastName?: string | null
		name?: string | null
	} | null
	createdAt?: string | null
	endAt?: string | null
	id?: string | null
	startAt?: string | null
	state?: string | null
}

type AppointmentsResponse = {
	appointments?: {
		edges?: Array<{ node?: AppointmentNode | null }> | null
		pageInfo?: {
			endCursor?: string | null
			hasNextPage?: boolean | null
		} | null
	} | null
}

type OrderLine = {
	__typename?: string | null
	currentPrice?: number | null
	currentSubtotal?: number | null
	id?: string | null
	initialPrice?: number | null
	initialSubtotal?: number | null
	name?: string | null
	serviceId?: string | null
}

type OrderLineGroup = {
	__typename?: string | null
	id?: string | null
	lines?: OrderLine[] | null
}

type OrderNode = {
	closedAt?: string | null
	createdAt?: string | null
	id?: string | null
	lineGroups?: OrderLineGroup[] | null
	updatedAt?: string | null
}

type OrdersResponse = {
	orders?: {
		edges?: Array<{ node?: OrderNode | null }> | null
		pageInfo?: {
			endCursor?: string | null
			hasNextPage?: boolean | null
		} | null
	} | null
}

type RevenueSample = {
	amountUsd: number
	occurredAt: Date
	serviceId: string | null
	serviceName: string
}

type ServiceAverage = {
	averageUsd: number
	normalizedServiceName: string
	sampleSize: number
	serviceName: string
	totalUsd: number
}

type ProjectionRow = AppointmentServiceSegment & {
	averageUsd: number | null
	fallbackUsd: number
	projectedUsd: number
	sampleSize: number
	source:
		| 'historical_average'
		| 'composite_historical_average'
		| 'configured_fallback'
}

type CliOptions = {
	fromDate: string | null
	historyDays: number
	includeCancelled: boolean
	includeFill: boolean
	json: boolean
	locationQuery: string | null
	minSampleSize: number
	toDate: string | null
	weekDate: string | null
}

const options = parseArgs(process.argv.slice(2))

void main(options).catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})

async function main(options: CliOptions) {
	const { start, end } = getReportWindow(options)
	const now = new Date()
	const historyEnd = start < now ? start : now
	const historyStart = new Date(
		historyEnd.getTime() - options.historyDays * 24 * 60 * 60 * 1000,
	)
	const locations = filterLocations(
		await listBlvdAdminLocations(),
		options.locationQuery,
	)

	if (locations.length === 0) {
		throw new Error(`No Boulevard locations matched ${options.locationQuery}`)
	}

	// One appointment pass covers both the target week and all history (Boulevard
	// has no date filter on the query and our data only spans ~3 months anyway).
	const [appointmentSegments, revenueSamples] = await Promise.all([
		listAppointmentServiceSegments({ from: historyStart, locations, to: end }),
		listHistoricalRevenueSamples({
			end: historyEnd,
			locations,
			start: historyStart,
		}),
	])
	const serviceAverages = buildServiceAverages(revenueSamples)
	const targetSegments = appointmentSegments.filter(
		segment => segment.startAt >= start && segment.startAt < end,
	)
	const historySegments = appointmentSegments.filter(
		segment => segment.startAt < historyEnd,
	)
	const rows = targetSegments
		.filter(segment => options.includeCancelled || !segment.cancelled)
		.map(segment =>
			buildProjectionRow({
				minSampleSize: options.minSampleSize,
				segment,
				serviceAverages,
			}),
		)
		.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

	const totalProjectedUsd = rows.reduce((sum, row) => sum + row.projectedUsd, 0)
	const expectedFill = options.includeFill
		? buildArrivalForecast({
				end,
				historyEnd,
				historySegments,
				minSampleSize: options.minSampleSize,
				now,
				rows,
				serviceAverages,
				start,
			})
		: null
	const result = {
		expected_fill: expectedFill
			? {
					history_observed_start: expectedFill.observedStart.toISOString(),
					history_observed_end: expectedFill.observedEnd.toISOString(),
					history_appointment_count: expectedFill.historyAppointmentCount,
					median_lead_days: expectedFill.medianLeadDays,
					same_day_share: expectedFill.sameDayShare,
					days: expectedFill.days,
					top_services: expectedFill.topServices,
					total_booked_usd: expectedFill.totalBookedUsd,
					total_fill_usd: expectedFill.totalFillUsd,
					total_expected_usd: expectedFill.totalExpectedUsd,
				}
			: null,
		history: {
			end: historyEnd.toISOString(),
			revenue_sample_count: revenueSamples.length,
			start: historyStart.toISOString(),
		},
		locations: locations.map(location => ({
			id: location.id,
			name: location.name,
		})),
		rows: rows.map(row => serializeProjectionRow(row)),
		summary: {
			active_appointment_service_segments: rows.filter(row => !row.cancelled)
				.length,
			cancelled_appointment_service_segments: rows.filter(row => row.cancelled)
				.length,
			total_projected_revenue_usd: roundCurrency(totalProjectedUsd),
			expected_total_revenue_usd: expectedFill
				? expectedFill.totalExpectedUsd
				: roundCurrency(totalProjectedUsd),
		},
		window: {
			end: end.toISOString(),
			end_local: formatLocalDateTime(end),
			start: start.toISOString(),
			start_local: formatLocalDateTime(start),
		},
	}

	if (options.json) {
		console.log(JSON.stringify(result, null, 2))
		return
	}

	printReport(rows, result, expectedFill)
}

/**
 * Values one appointment of a given service at its historical average sale,
 * falling back to a composite (tox+filler) average or the configured price.
 * Shared by the booked-appointment rows and the expected-fill arrival model so
 * both value a service identically.
 */
function valueForService({
	minSampleSize,
	serviceAverages,
	serviceId,
	serviceName,
}: {
	minSampleSize: number
	serviceAverages: Map<string, ServiceAverage>
	serviceId: string | null
	serviceName: string
}) {
	const average = getServiceAverage(serviceAverages, serviceId, serviceName)
	const fallbackUsd = getProjectedRevenueForBlvdService(serviceName)
	const hasEnoughHistory = Boolean(
		average && average.sampleSize >= minSampleSize,
	)
	const compositeAverage = hasEnoughHistory
		? null
		: getCompositeServiceAverage(serviceName, serviceAverages, minSampleSize)
	const projectedUsd = hasEnoughHistory
		? average!.averageUsd
		: compositeAverage
			? compositeAverage.averageUsd
			: fallbackUsd

	return {
		averageUsd: average?.averageUsd ?? compositeAverage?.averageUsd ?? null,
		fallbackUsd,
		projectedUsd,
		sampleSize: average?.sampleSize ?? compositeAverage?.sampleSize ?? 0,
		source: (hasEnoughHistory
			? 'historical_average'
			: compositeAverage
				? 'composite_historical_average'
				: 'configured_fallback') as ProjectionRow['source'],
	}
}

function buildProjectionRow({
	minSampleSize,
	segment,
	serviceAverages,
}: {
	minSampleSize: number
	segment: AppointmentServiceSegment
	serviceAverages: Map<string, ServiceAverage>
}): ProjectionRow {
	const valuation = valueForService({
		minSampleSize,
		serviceAverages,
		serviceId: segment.serviceId,
		serviceName: segment.serviceName,
	})
	return { ...segment, ...valuation }
}

function getCompositeServiceAverage(
	serviceName: string,
	serviceAverages: Map<string, ServiceAverage>,
	minSampleSize: number,
) {
	const normalizedName = normalizeServiceName(serviceName)
	if (!(normalizedName.includes('tox') && normalizedName.includes('filler'))) {
		return null
	}

	const toxAverage = findServiceAverage(
		serviceAverages,
		averageServiceName =>
			averageServiceName.includes('tox') &&
			!averageServiceName.includes('filler'),
		minSampleSize,
	)
	const fillerAverage = findServiceAverage(
		serviceAverages,
		averageServiceName =>
			averageServiceName.includes('filler') &&
			!averageServiceName.includes('tox'),
		minSampleSize,
	)

	if (!toxAverage || !fillerAverage) return null

	return {
		averageUsd: roundCurrency(toxAverage.averageUsd + fillerAverage.averageUsd),
		sampleSize: Math.min(toxAverage.sampleSize, fillerAverage.sampleSize),
		totalUsd: roundCurrency(toxAverage.totalUsd + fillerAverage.totalUsd),
	}
}

function findServiceAverage(
	serviceAverages: Map<string, ServiceAverage>,
	predicate: (normalizedServiceName: string) => boolean,
	minSampleSize: number,
) {
	const matches = [...serviceAverages]
		.filter(([, average]) => {
			return (
				average.sampleSize >= minSampleSize &&
				predicate(average.normalizedServiceName)
			)
		})
		.map(([, average]) => average)

	if (matches.length === 0) return null

	return matches.sort((a, b) => b.sampleSize - a.sampleSize)[0] ?? null
}

function buildServiceAverages(samples: RevenueSample[]) {
	const grouped = new Map<
		string,
		{
			amounts: number[]
			normalizedServiceName: string
			serviceName: string
		}
	>()

	for (const sample of samples) {
		const key = getServiceAverageKey(sample.serviceId, sample.serviceName)
		const group = grouped.get(key) ?? {
			amounts: [],
			normalizedServiceName: normalizeServiceName(sample.serviceName),
			serviceName: sample.serviceName,
		}
		group.amounts.push(sample.amountUsd)
		grouped.set(key, group)
	}

	return new Map(
		[...grouped].map(([key, group]) => {
			const totalUsd = group.amounts.reduce((sum, amount) => sum + amount, 0)
			return [
				key,
				{
					averageUsd: roundCurrency(totalUsd / group.amounts.length),
					normalizedServiceName: group.normalizedServiceName,
					sampleSize: group.amounts.length,
					serviceName: group.serviceName,
					totalUsd: roundCurrency(totalUsd),
				},
			]
		}),
	)
}

function getServiceAverage(
	serviceAverages: Map<string, ServiceAverage>,
	serviceId: string | null,
	serviceName: string,
) {
	return (
		(serviceId
			? serviceAverages.get(getServiceAverageKey(serviceId, serviceName))
			: null) ??
		serviceAverages.get(getServiceAverageKey(null, serviceName)) ??
		null
	)
}

async function listAppointmentServiceSegments({
	from,
	locations,
	to,
}: {
	from: Date
	locations: BlvdAdminLocation[]
	to: Date
}) {
	const segments: AppointmentServiceSegment[] = []

	for (const location of locations) {
		let after: string | null = null

		for (let page = 0; page < MAX_APPOINTMENT_PAGES_PER_LOCATION; page += 1) {
			const response = await boulevardAdminFetch<AppointmentsResponse>(
				`query Appointments($after: String, $locationId: ID!) {
					appointments(first: ${APPOINTMENT_PAGE_SIZE}, after: $after, locationId: $locationId) {
						pageInfo {
							endCursor
							hasNextPage
						}
						edges {
							node {
								id
								cancelled
								createdAt
								startAt
								endAt
								state
								client {
									firstName
									lastName
									name
								}
								appointmentServices {
									id
									duration
									startAt
									endAt
									service {
										id
										name
									}
								}
							}
						}
					}
				}`,
				{ after, locationId: location.id },
			)
			const appointments =
				response.appointments?.edges
					?.map(edge => edge.node)
					.filter((appointment): appointment is AppointmentNode =>
						Boolean(appointment?.id),
					) ?? []

			if (appointments.length === 0) break

			let latestAppointmentStart = -Infinity
			for (const appointment of appointments) {
				const appointmentStart = parseDate(appointment.startAt)
				if (!appointmentStart) continue
				latestAppointmentStart = Math.max(
					latestAppointmentStart,
					appointmentStart.getTime(),
				)
				if (appointmentStart < from || appointmentStart >= to) continue

				const bookedAt =
					parseDate(appointment.bookedAt) ?? parseDate(appointment.createdAt)
				for (const service of appointment.appointmentServices ?? []) {
					segments.push({
						appointmentId: appointment.id ?? '',
						bookedAt,
						cancelled: appointment.cancelled === true,
						clientName: getClientName(appointment.client),
						durationMinutes: service.duration ?? null,
						locationId: location.id,
						locationName: location.name ?? location.id,
						serviceId: service.service?.id ?? null,
						serviceName: service.service?.name ?? 'Unknown service',
						startAt: parseDate(service.startAt) ?? appointmentStart,
						state: appointment.state ?? null,
					})
				}
			}

			if (latestAppointmentStart >= to.getTime()) break

			const pageInfo = response.appointments?.pageInfo
			if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break
			after = pageInfo.endCursor
		}
	}

	return segments
}

async function listHistoricalRevenueSamples({
	end,
	locations,
	start,
}: {
	end: Date
	locations: BlvdAdminLocation[]
	start: Date
}) {
	const samples: RevenueSample[] = []

	for (const location of locations) {
		let after: string | null = null

		for (let page = 0; page < MAX_ORDER_PAGES_PER_LOCATION; page += 1) {
			const response = await boulevardAdminFetch<OrdersResponse>(
				`query Orders($after: String, $locationId: ID!) {
					orders(first: ${ORDER_PAGE_SIZE}, after: $after, locationId: $locationId) {
						pageInfo {
							endCursor
							hasNextPage
						}
						edges {
							node {
								id
								closedAt
								createdAt
								updatedAt
								lineGroups {
									__typename
									id
									lines {
										__typename
										id
										currentPrice
										currentSubtotal
										initialPrice
										initialSubtotal
										... on OrderServiceLine {
											name
											serviceId
										}
										... on OrderProductLine {
											name
										}
									}
								}
							}
						}
					}
				}`,
				{ after, locationId: location.id },
			)
			const orders =
				response.orders?.edges
					?.map(edge => edge.node)
					.filter((order): order is OrderNode => Boolean(order?.id)) ?? []

			if (orders.length === 0) break

			let oldestOrderClosedAt: Date | null = null
			for (const order of orders) {
				const occurredAt = parseDate(order.closedAt)
				if (!occurredAt) continue
				if (!oldestOrderClosedAt || occurredAt < oldestOrderClosedAt) {
					oldestOrderClosedAt = occurredAt
				}
				if (occurredAt < start || occurredAt >= end) continue
				samples.push(...buildRevenueSamplesForOrder(order, occurredAt))
			}

			if (oldestOrderClosedAt && oldestOrderClosedAt < start) break

			const pageInfo = response.orders?.pageInfo
			if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break
			after = pageInfo.endCursor
		}
	}

	return samples
}

function buildRevenueSamplesForOrder(order: OrderNode, occurredAt: Date) {
	const samples: RevenueSample[] = []

	for (const group of order.lineGroups ?? []) {
		if (group.__typename !== 'OrderAppointmentLineGroup') continue
		const lines = group.lines ?? []
		const serviceLines = lines.filter(line => isServiceLine(line) && line.name)
		if (serviceLines.length === 0) continue

		const groupTotalUsd = roundCurrency(
			lines.reduce(
				(sum, line) => sum + centsToUsd(getLineAmountCents(line)),
				0,
			),
		)
		if (groupTotalUsd <= 0) {
			for (const serviceLine of serviceLines) {
				if (!isPackageLikeServiceName(serviceLine.name ?? '')) continue
				samples.push({
					amountUsd: 0,
					occurredAt,
					serviceId: serviceLine.serviceId ?? null,
					serviceName: serviceLine.name ?? 'Unknown service',
				})
			}
			continue
		}

		if (serviceLines.length === 1) {
			samples.push({
				amountUsd: groupTotalUsd,
				occurredAt,
				serviceId: serviceLines[0]?.serviceId ?? null,
				serviceName: serviceLines[0]?.name ?? 'Unknown service',
			})
			continue
		}

		const serviceLineTotalUsd = serviceLines.reduce(
			(sum, line) => sum + centsToUsd(getLineAmountCents(line)),
			0,
		)
		for (const serviceLine of serviceLines) {
			const serviceLineAmountUsd = centsToUsd(getLineAmountCents(serviceLine))
			const amountUsd =
				serviceLineTotalUsd > 0
					? (groupTotalUsd * serviceLineAmountUsd) / serviceLineTotalUsd
					: groupTotalUsd / serviceLines.length
			samples.push({
				amountUsd: roundCurrency(amountUsd),
				occurredAt,
				serviceId: serviceLine.serviceId ?? null,
				serviceName: serviceLine.name ?? 'Unknown service',
			})
		}
	}

	return samples
}

function getReportWindow(options: CliOptions) {
	if (options.fromDate || options.toDate) {
		if (!options.fromDate || !options.toDate) {
			throw new Error('Use both --from and --to, or neither.')
		}
		return {
			end: fromZonedTime(`${options.toDate} 00:00:00`, BUSINESS_TIMEZONE),
			start: fromZonedTime(`${options.fromDate} 00:00:00`, BUSINESS_TIMEZONE),
		}
	}

	const anchor = parseLocalDate(options.weekDate) ?? new Date()
	const anchorDay = Number(formatInTimeZone(anchor, BUSINESS_TIMEZONE, 'i'))
	const monday = new Date(anchor)
	monday.setUTCDate(anchor.getUTCDate() - (anchorDay - 1))
	const mondayDateKey = formatInTimeZone(
		monday,
		BUSINESS_TIMEZONE,
		'yyyy-MM-dd',
	)
	const start = fromZonedTime(`${mondayDateKey} 00:00:00`, BUSINESS_TIMEZONE)
	const end = new Date(start)
	end.setUTCDate(start.getUTCDate() + 7)
	return { end, start }
}

type ForecastDay = {
	dateLabel: string
	weekday: string
	daysOut: number
	bookedUsd: number
	bookedCount: number
	expectedNewCount: number
	fillUsd: number
	expectedUsd: number
}

type ServiceArrival = {
	serviceName: string
	expectedNewCount: number
	expectedNewUsd: number
}

type ArrivalForecast = {
	days: ForecastDay[]
	topServices: ServiceArrival[]
	observedStart: Date
	observedEnd: Date
	historyAppointmentCount: number
	medianLeadDays: number
	sameDayShare: number
	totalBookedUsd: number
	totalFillUsd: number
	totalExpectedUsd: number
}

const DAY_MS = 24 * 60 * 60 * 1000
// Below this many historical bookings for a service, its lead-time curve is too
// noisy, so we borrow the pooled all-service curve instead.
const MIN_LEADS_FOR_OWN_CURVE = 8

type TypeStats = {
	serviceId: string | null
	serviceName: string
	leads: number[]
	weekdayCounts: Map<string, number>
}

/**
 * Forecasts revenue still to be booked this week from each service's own
 * historical behavior: how often that service runs on each weekday, and how
 * far ahead it is typically booked (its lead-time curve). For a target day
 * `d` days out, the bookings still to come are the share of that service's
 * weekly volume that historically books with less than `d` days of lead time.
 * Each expected new booking is valued at that service's average sale, then
 * added on top of what is already on the calendar.
 */
function buildArrivalForecast({
	end,
	historyEnd,
	historySegments,
	minSampleSize,
	now,
	rows,
	serviceAverages,
	start,
}: {
	end: Date
	historyEnd: Date
	historySegments: AppointmentServiceSegment[]
	minSampleSize: number
	now: Date
	rows: ProjectionRow[]
	serviceAverages: Map<string, ServiceAverage>
	start: Date
}): ArrivalForecast {
	const completed = historySegments.filter(
		segment => !segment.cancelled && segment.startAt < historyEnd,
	)

	// Per-service weekday volume and lead-time samples.
	const typeStats = new Map<string, TypeStats>()
	const pooledLeads: number[] = []
	let observedStartMs = Infinity
	for (const segment of completed) {
		observedStartMs = Math.min(observedStartMs, segment.startAt.getTime())
		const key = getServiceAverageKey(segment.serviceId, segment.serviceName)
		const stats =
			typeStats.get(key) ??
			({
				serviceId: segment.serviceId,
				serviceName: segment.serviceName,
				leads: [],
				weekdayCounts: new Map<string, number>(),
			} satisfies TypeStats)
		const weekday = localWeekday(segment.startAt)
		stats.weekdayCounts.set(
			weekday,
			(stats.weekdayCounts.get(weekday) ?? 0) + 1,
		)
		if (segment.bookedAt) {
			const leadMs = segment.startAt.getTime() - segment.bookedAt.getTime()
			// Drop appointments "created" after they occurred: those are Jane ->
			// Boulevard migration imports (import-date createdAt), not real
			// bookings, and would otherwise collapse the lead-time curve to
			// same-day.
			if (leadMs >= -12 * 60 * 60 * 1000) {
				const leadDays = Math.max(0, Math.round(leadMs / DAY_MS))
				stats.leads.push(leadDays)
				pooledLeads.push(leadDays)
			}
		}
		typeStats.set(key, stats)
	}

	const observedStart = new Date(
		Number.isFinite(observedStartMs) ? observedStartMs : historyEnd.getTime(),
	)

	// How many of each weekday occurred in the observed history span; this is
	// the denominator that turns counts into "appointments per Monday", etc.
	const weekdayOccurrences = new Map<string, number>()
	for (
		let cursor = observedStart.getTime() + DAY_MS / 2;
		cursor < historyEnd.getTime();
		cursor += DAY_MS
	) {
		const weekday = localWeekday(new Date(cursor))
		weekdayOccurrences.set(weekday, (weekdayOccurrences.get(weekday) ?? 0) + 1)
	}

	// Fraction of bookings made with strictly less than `d` days of lead time
	// (i.e. not yet booked when a day is `d` days away).
	const shareBookedWithin = (leads: number[], d: number) => {
		const sample = leads.length >= MIN_LEADS_FOR_OWN_CURVE ? leads : pooledLeads
		if (sample.length === 0) return 0
		const within = sample.filter(lead => lead < d).length
		return within / sample.length
	}

	const bookedByDate = new Map<string, { usd: number; count: number }>()
	for (const row of rows) {
		if (row.cancelled) continue
		const key = localDateKey(row.startAt)
		const entry = bookedByDate.get(key) ?? { usd: 0, count: 0 }
		entry.usd += row.projectedUsd
		entry.count += 1
		bookedByDate.set(key, entry)
	}

	const todayStartMs = startOfLocalDay(now)
	const serviceArrivals = new Map<string, ServiceArrival>()
	const days: ForecastDay[] = []
	for (
		let cursor = start.getTime() + DAY_MS / 2;
		cursor < end.getTime();
		cursor += DAY_MS
	) {
		const instant = new Date(cursor)
		const key = localDateKey(instant)
		const weekday = localWeekday(instant)
		const daysOut = Math.round(
			(startOfLocalDay(instant) - todayStartMs) / DAY_MS,
		)
		const booked = bookedByDate.get(key) ?? { usd: 0, count: 0 }

		let fillUsd = 0
		let expectedNewCount = 0
		if (daysOut > 0) {
			for (const stats of typeStats.values()) {
				const weekdayCount = stats.weekdayCounts.get(weekday) ?? 0
				if (weekdayCount === 0) continue
				const occurrences = weekdayOccurrences.get(weekday) ?? 0
				if (occurrences === 0) continue
				const ratePerWeekday = weekdayCount / occurrences
				const stillToCome =
					ratePerWeekday * shareBookedWithin(stats.leads, daysOut)
				if (stillToCome <= 0) continue
				const value = valueForService({
					minSampleSize,
					serviceAverages,
					serviceId: stats.serviceId,
					serviceName: stats.serviceName,
				}).projectedUsd
				const usd = stillToCome * value
				fillUsd += usd
				expectedNewCount += stillToCome
				const arrival = serviceArrivals.get(stats.serviceName) ?? {
					serviceName: stats.serviceName,
					expectedNewCount: 0,
					expectedNewUsd: 0,
				}
				arrival.expectedNewCount += stillToCome
				arrival.expectedNewUsd += usd
				serviceArrivals.set(stats.serviceName, arrival)
			}
		}

		days.push({
			dateLabel: formatInTimeZone(instant, BUSINESS_TIMEZONE, 'EEE, MMM d'),
			weekday,
			daysOut,
			bookedUsd: roundCurrency(booked.usd),
			bookedCount: booked.count,
			expectedNewCount: roundTo(expectedNewCount, 1),
			fillUsd: roundCurrency(fillUsd),
			expectedUsd: roundCurrency(booked.usd + fillUsd),
		})
	}

	const sortedLeads = [...pooledLeads].sort((a, b) => a - b)
	const medianLeadDays =
		sortedLeads.length > 0
			? (sortedLeads[Math.floor((sortedLeads.length - 1) / 2)] ?? 0)
			: 0
	const sameDayShare =
		sortedLeads.length > 0
			? sortedLeads.filter(lead => lead === 0).length / sortedLeads.length
			: 0

	const totalBookedUsd = days.reduce((sum, day) => sum + day.bookedUsd, 0)
	const totalFillUsd = days.reduce((sum, day) => sum + day.fillUsd, 0)
	return {
		days,
		topServices: [...serviceArrivals.values()]
			.map(arrival => ({
				serviceName: arrival.serviceName,
				expectedNewCount: roundTo(arrival.expectedNewCount, 1),
				expectedNewUsd: roundCurrency(arrival.expectedNewUsd),
			}))
			.filter(arrival => arrival.expectedNewUsd > 0)
			.sort((a, b) => b.expectedNewUsd - a.expectedNewUsd),
		observedStart,
		observedEnd: historyEnd,
		historyAppointmentCount: completed.length,
		medianLeadDays,
		sameDayShare: roundTo(sameDayShare, 3),
		totalBookedUsd: roundCurrency(totalBookedUsd),
		totalFillUsd: roundCurrency(totalFillUsd),
		totalExpectedUsd: roundCurrency(totalBookedUsd + totalFillUsd),
	}
}

function startOfLocalDay(date: Date) {
	const key = formatInTimeZone(date, BUSINESS_TIMEZONE, 'yyyy-MM-dd')
	return fromZonedTime(`${key}T00:00:00`, BUSINESS_TIMEZONE).getTime()
}

function roundTo(value: number, digits: number) {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

function localDateKey(date: Date) {
	return formatInTimeZone(date, BUSINESS_TIMEZONE, 'yyyy-MM-dd')
}

function localWeekday(date: Date) {
	return formatInTimeZone(date, BUSINESS_TIMEZONE, 'EEEE')
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		fromDate: null,
		historyDays: DEFAULT_HISTORY_DAYS,
		includeCancelled: false,
		includeFill: true,
		json: false,
		locationQuery: null,
		minSampleSize: DEFAULT_MIN_SAMPLE_SIZE,
		toDate: null,
		weekDate: null,
	}

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]
		const next = args[index + 1]
		if (arg === '--') {
			continue
		} else if (arg === '--help' || arg === '-h') {
			printHelp()
			process.exit(0)
		} else if (arg === '--from') {
			options.fromDate = requireNextValue(arg, next)
			index += 1
		} else if (arg === '--history-days') {
			options.historyDays = Number(requireNextValue(arg, next))
			index += 1
		} else if (arg === '--include-cancelled') {
			options.includeCancelled = true
		} else if (arg === '--no-fill') {
			options.includeFill = false
		} else if (arg === '--json') {
			options.json = true
		} else if (arg === '--location') {
			options.locationQuery = requireNextValue(arg, next)
			index += 1
		} else if (arg === '--min-sample-size') {
			options.minSampleSize = Number(requireNextValue(arg, next))
			index += 1
		} else if (arg === '--to') {
			options.toDate = requireNextValue(arg, next)
			index += 1
		} else if (arg === '--week') {
			options.weekDate = requireNextValue(arg, next)
			index += 1
		} else {
			throw new Error(`Unknown argument: ${arg}`)
		}
	}

	if (!Number.isFinite(options.historyDays) || options.historyDays <= 0) {
		throw new Error('--history-days must be a positive number.')
	}
	if (!Number.isFinite(options.minSampleSize) || options.minSampleSize < 1) {
		throw new Error('--min-sample-size must be at least 1.')
	}

	return options
}

function printReport(
	rows: ProjectionRow[],
	result: {
		history: {
			end: string
			revenue_sample_count: number
			start: string
		}
		summary: {
			active_appointment_service_segments: number
			cancelled_appointment_service_segments: number
			total_projected_revenue_usd: number
		}
		window: {
			end_local: string
			start_local: string
		}
	},
	expectedFill: ArrivalForecast | null,
) {
	console.log(
		`Projected Boulevard revenue: ${result.window.start_local} through ${result.window.end_local}`,
	)
	console.log(
		`Historical revenue samples: ${result.history.revenue_sample_count}`,
	)
	console.log(
		`Active service segments: ${result.summary.active_appointment_service_segments}`,
	)
	if (result.summary.cancelled_appointment_service_segments > 0) {
		console.log(
			`Cancelled service segments included: ${result.summary.cancelled_appointment_service_segments}`,
		)
	}
	console.log(
		`Projected total: ${formatUsd(result.summary.total_projected_revenue_usd)}`,
	)
	console.log('')

	for (const row of rows) {
		const sampleInfo =
			row.source === 'historical_average'
				? `avg ${formatUsd(row.projectedUsd)} from ${row.sampleSize} historical`
				: row.source === 'composite_historical_average'
					? `composite avg ${formatUsd(row.projectedUsd)} from historical`
					: `fallback ${formatUsd(row.projectedUsd)}`
		const cancelled = row.cancelled ? ' CANCELLED' : ''
		console.log(
			[
				formatLocalDateTime(row.startAt),
				row.locationName,
				row.clientName,
				row.serviceName,
				sampleInfo,
				formatUsd(row.projectedUsd),
			].join(' | ') + cancelled,
		)
	}

	const byService = summarizeRows(rows, row => row.serviceName)
	const byLocation = summarizeRows(rows, row => row.locationName)
	const byDay = summarizeRows(rows, row =>
		formatInTimeZone(row.startAt, BUSINESS_TIMEZONE, 'EEE, MMM d'),
	)

	printSummary('By day', byDay)
	printSummary('By location', byLocation)
	printSummary('By service', byService)

	if (expectedFill) {
		printExpectedFill(expectedFill)
	}
}

function printExpectedFill(fill: ArrivalForecast) {
	const spanDays = Math.max(
		1,
		Math.round(
			(fill.observedEnd.getTime() - fill.observedStart.getTime()) / DAY_MS,
		),
	)
	console.log('')
	console.log(
		`Expected still-to-book this week (per-service lead times from ${fill.historyAppointmentCount} appts over ${spanDays} days; median lead ${fill.medianLeadDays}d, ${Math.round(fill.sameDayShare * 100)}% same-day)`,
	)
	for (const day of fill.days) {
		const tail =
			day.daysOut <= 0
				? 'already here'
				: `+${day.expectedNewCount} appts ${formatUsd(day.fillUsd)} → ${formatUsd(day.expectedUsd)}`
		console.log(
			[
				day.dateLabel,
				`${day.bookedCount} booked ${formatUsd(day.bookedUsd)}`,
				tail,
			].join(' | '),
		)
	}
	if (fill.topServices.length > 0) {
		console.log('')
		console.log('Expected new bookings by service')
		for (const service of fill.topServices.slice(0, 10)) {
			console.log(
				`${service.serviceName}: ${service.expectedNewCount} | ${formatUsd(service.expectedNewUsd)}`,
			)
		}
	}
	console.log('')
	console.log(`Already booked: ${formatUsd(fill.totalBookedUsd)}`)
	console.log(`Expected still to book: ${formatUsd(fill.totalFillUsd)}`)
	console.log(`Expected total: ${formatUsd(fill.totalExpectedUsd)}`)
}

function printSummary(
	title: string,
	rows: Array<{ count: number; key: string; totalUsd: number }>,
) {
	console.log('')
	console.log(title)
	for (const row of rows) {
		console.log(`${row.key}: ${row.count} | ${formatUsd(row.totalUsd)}`)
	}
}

function serializeProjectionRow(row: ProjectionRow) {
	return {
		appointment_id: row.appointmentId,
		average_usd: row.averageUsd,
		cancelled: row.cancelled,
		client_name: row.clientName,
		configured_fallback_usd: row.fallbackUsd,
		duration_minutes: row.durationMinutes,
		location_id: row.locationId,
		location_name: row.locationName,
		projected_usd: roundCurrency(row.projectedUsd),
		projection_source: row.source,
		service_id: row.serviceId,
		service_name: row.serviceName,
		start_at: row.startAt.toISOString(),
		start_local: formatLocalDateTime(row.startAt),
		state: row.state,
		historical_sample_size: row.sampleSize,
	}
}

function summarizeRows(
	rows: ProjectionRow[],
	keyFn: (row: ProjectionRow) => string,
) {
	const grouped = new Map<string, { count: number; totalUsd: number }>()
	for (const row of rows) {
		const key = keyFn(row)
		const existing = grouped.get(key) ?? { count: 0, totalUsd: 0 }
		existing.count += 1
		existing.totalUsd += row.projectedUsd
		grouped.set(key, existing)
	}
	return [...grouped]
		.map(([key, value]) => ({
			key,
			count: value.count,
			totalUsd: roundCurrency(value.totalUsd),
		}))
		.sort((a, b) => b.totalUsd - a.totalUsd || a.key.localeCompare(b.key))
}

function filterLocations(
	locations: BlvdAdminLocation[],
	locationQuery: string | null,
) {
	if (!locationQuery) return locations
	const normalizedQuery = locationQuery.toLowerCase().trim()
	return locations.filter(location => {
		const name = location.name?.toLowerCase() ?? ''
		const id = location.id.toLowerCase()
		if (normalizedQuery === 'bearden') return name.includes('knoxville')
		return name.includes(normalizedQuery) || id.includes(normalizedQuery)
	})
}

function getClientName(client: AppointmentNode['client']) {
	return (
		client?.name ??
		[client?.firstName, client?.lastName].filter(Boolean).join(' ') ??
		'Unknown client'
	)
}

function getLineAmountCents(line: OrderLine) {
	return (
		line.currentSubtotal ??
		line.currentPrice ??
		line.initialSubtotal ??
		line.initialPrice ??
		0
	)
}

function isServiceLine(line: OrderLine) {
	return line.__typename === 'OrderServiceLine' || Boolean(line.serviceId)
}

function isPackageLikeServiceName(value: string) {
	const normalized = normalizeServiceName(value)
	if (normalized.includes('everesse')) return true
	return (
		normalized.includes('laser hair reduction') &&
		!normalized.includes('touch up')
	)
}

function centsToUsd(value: number | null | undefined) {
	return (value ?? 0) / 100
}

function parseDate(value?: string | null) {
	if (!value) return null
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function parseLocalDate(value?: string | null) {
	if (!value) return null
	return fromZonedTime(`${value} 12:00:00`, BUSINESS_TIMEZONE)
}

function formatLocalDateTime(date: Date) {
	return formatInTimeZone(date, BUSINESS_TIMEZONE, 'EEE, MMM d, yyyy h:mm a')
}

function formatUsd(value: number) {
	return new Intl.NumberFormat('en-US', {
		currency: 'USD',
		maximumFractionDigits: 0,
		style: 'currency',
	}).format(value)
}

function normalizeServiceName(value: string) {
	return value
		.toLowerCase()
		.replace(/®/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

function getServiceAverageKey(
	serviceId: string | null | undefined,
	serviceName: string,
) {
	return serviceId
		? `service:${serviceId}`
		: `name:${normalizeServiceName(serviceName)}`
}

function roundCurrency(value: number) {
	return Math.round(value * 100) / 100
}

function requireNextValue(arg: string, value?: string) {
	if (!value || value.startsWith('--')) {
		throw new Error(`${arg} requires a value.`)
	}
	return value
}

function printHelp() {
	console.log(`Usage: pnpm blvd:project-revenue [options]

Options:
  --week YYYY-MM-DD          Project the Monday-Sunday week containing this date.
  --from YYYY-MM-DD          Inclusive Eastern start date. Requires --to.
  --to YYYY-MM-DD            Exclusive Eastern end date. Requires --from.
  --location NAME            Limit appointments and history to a location. "bearden" maps to Knoxville.
  --history-days N           Historical closed-order lookback. Default: ${DEFAULT_HISTORY_DAYS}.
  --min-sample-size N        Use historical average only after N samples. Default: ${DEFAULT_MIN_SAMPLE_SIZE}.
  --no-fill                  Only count appointments already on the books; skip the expected still-to-book estimate.
  --include-cancelled        Include cancelled appointment service segments.
  --json                     Print JSON.

Historical averages use exact Boulevard service IDs when possible. Laser hair reduction and EVERESSE include $0 package follow-up visits, so package revenue is amortized instead of projected again for every prepaid follow-up.
`)
}
