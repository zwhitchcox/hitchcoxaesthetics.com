import { expect, test } from 'vitest'
import { buildArrivalForecast } from '../../scripts/blvd-project-weekly-revenue.ts'

type Input = Parameters<typeof buildArrivalForecast>[0]
type Segment = Input['historySegments'][number]

const DAY = 24 * 60 * 60 * 1000

function segment(
	appointmentId: string,
	serviceName: string,
	startAt: Date,
): Segment {
	return {
		appointmentId,
		bookedAt: new Date(startAt.getTime() - 2 * DAY),
		cancelled: false,
		clientId: `client-${appointmentId}`,
		clientName: 'Test Client',
		durationMinutes: 30,
		locationId: 'loc',
		locationName: 'Bearden',
		serviceId: null,
		serviceName,
		startAt,
		state: 'FINAL',
	}
}

function booked(seg: Segment): Input['rows'][number] {
	return {
		...seg,
		averageUsd: 100,
		fallbackUsd: 100,
		projectedUsd: 100,
		projectedUsdV2: 100,
		projectedUsdV4: 100,
		sampleSize: 3,
		source: 'historical_average',
	}
}

test('the forecast counts visits once, net of cancellations', () => {
	// Wednesday 2026-11-04; the forecast covers the week of Monday 2026-11-09.
	const now = new Date('2026-11-04T16:00:00Z')
	// Ten past Mondays, each with one kept visit that has two services.
	const history = Array.from({ length: 10 }, (_, i) => {
		const day = new Date(Date.UTC(2026, 10, 2, 16) - i * 7 * DAY)
		return [
			segment(`past-${i}`, 'Botox', day),
			segment(`past-${i}`, 'Filler', day),
		]
	}).flat()
	const monday = new Date('2026-11-09T15:00:00Z')
	const tuesday = new Date('2026-11-10T15:00:00Z')
	const forecast = buildArrivalForecast({
		end: new Date('2026-11-16T05:00:00Z'),
		historyEnd: now,
		historySegments: history,
		// Half of the visits booked this far ahead get cancelled.
		keptProbability: () => 0.5,
		minSampleSize: 3,
		now,
		perVisitValueUsd: () => null,
		retailUpliftRatio: 0,
		rows: [
			booked(segment('next-monday', 'Botox', monday)),
			booked(segment('next-monday', 'Filler', monday)),
			booked(segment('next-tuesday', 'Botox', tuesday)),
		],
		serviceAverages: new Map(),
		serviceValuesV4: { lookup: () => 100 },
		start: new Date('2026-11-09T05:00:00Z'),
		wlInjPerVisitUsd: 0,
		wlValuesV4: { lookup: () => 100 },
	})
	const [mon, tue, wed] = forecast.days

	// Monday: the booked visit (two services) counts once at its chance of
	// being kept, plus the visits still to book. Each history visit has two
	// services, so it is half the service-line count.
	expect(mon!.bookedCount).toBe(2)
	expect(mon!.expectedVisitsV4).toBeCloseTo(0.5 + mon!.expectedNewCount / 2, 1)
	// Tuesday has no history, so only the booked visit, at half.
	expect(tue!.expectedVisitsV4).toBe(0.5)
	// Wednesday has nothing booked and no history.
	expect(wed!.expectedVisitsV4).toBe(0)
})
