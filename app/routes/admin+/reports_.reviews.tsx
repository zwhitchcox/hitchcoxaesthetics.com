/**
 * Reviews — Google review counts across every listing (all three brands),
 * with new-reviews-over-time at day / week / month granularity. Reads the
 * google_reviews table in the reports Postgres (written by the sha-reports
 * review fetcher, which covers all GBP listings).
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Form, useLoaderData, useSubmit } from '@remix-run/react'
import {
	BarChart,
	ReportPage,
	SERIES,
	StatTile,
} from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

// All bucketing happens in local (Knoxville) days — a 9pm review must not
// show up under tomorrow's UTC date. windowStartSql is the first bucket to
// render; buckets are generated through today so empty days show as zero.
const LOCAL_NOW = `(now() AT TIME ZONE 'America/New_York')`
const GRAINS = {
	day: {
		label: 'By day',
		trunc: 'day',
		fmt: 'MM-DD',
		windowStartSql: `date_trunc('day', ${LOCAL_NOW}) - interval '59 days'`,
	},
	week: {
		label: 'By week',
		trunc: 'week',
		fmt: 'YYYY-MM-DD',
		windowStartSql: `date_trunc('week', ${LOCAL_NOW}) - interval '25 weeks'`,
	},
	month: {
		label: 'By month',
		trunc: 'month',
		fmt: 'YYYY-MM',
		windowStartSql: `coalesce((SELECT date_trunc('month', min(create_time AT TIME ZONE 'America/New_York')) FROM google_reviews), date_trunc('month', ${LOCAL_NOW}))`,
	},
} as const
type Grain = keyof typeof GRAINS

const brandOf = (listing: string) =>
	listing.startsWith('SHA')
		? 'SHA'
		: listing.startsWith('Botox Knox')
			? 'Botox Knox'
			: 'Weight Loss Knox'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })
	const url = new URL(request.url)
	const grain: Grain = (Object.keys(GRAINS) as Grain[]).includes(
		url.searchParams.get('grain') as Grain,
	)
		? (url.searchParams.get('grain') as Grain)
		: 'week'
	const g = GRAINS[grain]

	// Optional custom window (?from=YYYY-MM-DD&to=YYYY-MM-DD) — validated
	// here and passed as SQL params, never interpolated.
	const dateRe = /^\d{4}-\d{2}-\d{2}$/
	const fromParam = dateRe.test(url.searchParams.get('from') ?? '')
		? url.searchParams.get('from')!
		: null
	const toParam = dateRe.test(url.searchParams.get('to') ?? '')
		? url.searchParams.get('to')!
		: null
	const custom = fromParam && toParam && fromParam <= toParam

	const seriesStart = custom ? `date_trunc('${g.trunc}', $1::date)` : g.windowStartSql
	const seriesEnd = custom
		? `date_trunc('${g.trunc}', $2::date)`
		: `date_trunc('${g.trunc}', ${LOCAL_NOW})`
	const seriesParams = custom ? [fromParam, toParam] : []
	const funnelWhere = custom
		? `day >= $1::date AND day <= $2::date`
		: `day >= ${LOCAL_NOW}::date - 29`

	const [series, allBuckets, perListing, funnel, reviewHours, placeClicks] = await Promise.all([
		reportsQuery<{ bucket: string; listing: string; n: string }>(
			`SELECT to_char(date_trunc('${g.trunc}', create_time AT TIME ZONE 'America/New_York'), '${g.fmt}') AS bucket,
				listing, count(*) AS n
			 FROM google_reviews
			 WHERE (create_time AT TIME ZONE 'America/New_York') >= ${seriesStart}
				 AND date_trunc('${g.trunc}', create_time AT TIME ZONE 'America/New_York') <= ${seriesEnd}
			 GROUP BY 1, listing`,
			seriesParams,
		),
		// Every bucket from the window start through today, so quiet periods
		// (including today) render as zero instead of vanishing.
		reportsQuery<{ bucket: string }>(
			`SELECT to_char(d, '${g.fmt}') AS bucket
			 FROM generate_series(${seriesStart}, ${seriesEnd}, interval '1 ${g.trunc}') d
			 ORDER BY d`,
			seriesParams,
		),
		reportsQuery<{
			listing: string
			total: string
			avg_star: string | null
			last30: string
			last7: string
			latest: string | null
		}>(
			`SELECT m.listing,
				count(r.review_id) AS total,
				round(avg(r.star), 2) AS avg_star,
				count(r.review_id) FILTER (WHERE r.create_time >= now() - interval '30 days') AS last30,
				count(r.review_id) FILTER (WHERE r.create_time >= now() - interval '7 days') AS last7,
				to_char(max(r.create_time), 'YYYY-MM-DD') AS latest
			 FROM geo_my_listing m
			 LEFT JOIN google_reviews r ON r.listing = m.listing
			 GROUP BY m.listing ORDER BY total DESC, m.listing`,
		),
		// QR / review-page funnel from PostHog (15-min sync). The uuid filter
		// drops test hits on non-provider slugs.
		reportsQuery<{ day: string; brand: string; event: string; n: string }>(
			`SELECT to_char(day, 'YYYY-MM-DD') AS day, brand, event, sum(n) AS n
			 FROM review_funnel_daily
			 WHERE ${funnelWhere}
				 AND provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-'
			 GROUP BY 1, 2, 3 ORDER BY 1`,
			custom ? [fromParam, toParam] : [],
		).catch(() => [] as Array<{ day: string; brand: string; event: string; n: string }>),
		// Review times: hour-of-day histogram (local) over the window —
		// single-day selections show that day's actual review times.
		reportsQuery<{ hour: string; listing: string; n: string }>(
			custom
				? `SELECT extract(hour FROM create_time AT TIME ZONE 'America/New_York')::int AS hour,
						listing, count(*) AS n
					 FROM google_reviews
					 WHERE (create_time AT TIME ZONE 'America/New_York')::date BETWEEN $1::date AND $2::date
					 GROUP BY 1, 2 ORDER BY 1`
				: `SELECT extract(hour FROM create_time AT TIME ZONE 'America/New_York')::int AS hour,
						listing, count(*) AS n
					 FROM google_reviews
					 WHERE create_time >= now() - interval '30 days'
					 GROUP BY 1, 2 ORDER BY 1`,
			custom ? [fromParam, toParam] : [],
		),
		// Which Google listing each review click chose, per day (place_label
		// lands with the next worker sync; empty until then).
		reportsQuery<{ day: string; place: string; n: string }>(
			`SELECT to_char(day, 'YYYY-MM-DD') AS day, place_label AS place, sum(n) AS n
			 FROM review_funnel_daily
			 WHERE ${funnelWhere}
				 AND event = 'review_location_selected' AND place_label <> ''
			 GROUP BY 1, 2 ORDER BY 1 DESC, 2`,
			custom ? [fromParam, toParam] : [],
		).catch(() => [] as Array<{ day: string; place: string; n: string }>),
	])
	const buckets = allBuckets.map(b => b.bucket)
	// Last 30 local days through today, so a zero-scan day (like today before
	// the first scan) shows as an explicit zero instead of disappearing.
	const funnelDays = (
		await reportsQuery<{ day: string }>(
			custom
				? `SELECT to_char(d, 'YYYY-MM-DD') AS day
					 FROM generate_series($1::date, $2::date, interval '1 day') d ORDER BY d`
				: `SELECT to_char(d, 'YYYY-MM-DD') AS day
					 FROM generate_series(${LOCAL_NOW}::date - 29, ${LOCAL_NOW}::date, interval '1 day') d ORDER BY d`,
			custom ? [fromParam, toParam] : [],
		).catch(() => [] as Array<{ day: string }>)
	).map(d => d.day)
	// Single-day selection: every review that day with its exact local time.
	const singleDay = custom && fromParam === toParam
	const dayReviews = singleDay
		? await reportsQuery<{ t: string; listing: string; reviewer: string | null; star: string | null }>(
				`SELECT to_char(create_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') AS t,
					listing, reviewer, star::text AS star
				 FROM google_reviews
				 WHERE (create_time AT TIME ZONE 'America/New_York')::date = $1::date
				 ORDER BY create_time`,
				[fromParam],
			)
		: []
	return json({
		configured: true as const,
		grain,
		series,
		buckets,
		perListing,
		funnel,
		funnelDays,
		reviewHours,
		dayReviews,
		placeClicks,
		from: custom ? fromParam : null,
		to: custom ? toParam : null,
	})
}

export default function Reviews() {
	const data = useLoaderData<typeof loader>()
	const submit = useSubmit()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const {
		grain,
		series,
		buckets,
		perListing,
		funnel,
		funnelDays,
		reviewHours,
		dayReviews,
		placeClicks,
		from,
		to,
	} = data

	// Hour-of-day histogram, stacked by brand.
	const hourLabels = Array.from({ length: 24 }, (_, h) => {
		const ampm = h < 12 ? 'AM' : 'PM'
		const display = h % 12 === 0 ? 12 : h % 12
		return `${display}${ampm.toLowerCase()}`
	})
	const hoursByBrand = new Map<string, number[]>()
	for (const r of reviewHours) {
		const b = brandOf(r.listing)
		if (!hoursByBrand.has(b)) hoursByBrand.set(b, Array.from({ length: 24 }, () => 0))
		hoursByBrand.get(b)![Number(r.hour)] = (hoursByBrand.get(b)![Number(r.hour)] ?? 0) + Number(r.n)
	}

	// Funnel: scans / copies / location clicks per day (all brands), plus a
	// last-30d per-brand breakdown table.
	const funnelEvents = [...new Set(funnel.map(f => f.event))].sort()
	const funnelByDayEvent = new Map<string, number>()
	const funnelByBrandEvent = new Map<string, number>()
	for (const f of funnel) {
		const de = `${f.day}|${f.event}`
		funnelByDayEvent.set(de, (funnelByDayEvent.get(de) ?? 0) + Number(f.n))
		const be = `${f.brand}|${f.event}`
		funnelByBrandEvent.set(be, (funnelByBrandEvent.get(be) ?? 0) + Number(f.n))
	}
	const funnelBrands = [...new Set(funnel.map(f => f.brand))].sort()

	const brands = ['SHA', 'Botox Knox', 'Weight Loss Knox']
	const byBrandBucket = new Map<string, Map<string, number>>()
	for (const s of series) {
		const b = brandOf(s.listing)
		if (!byBrandBucket.has(b)) byBrandBucket.set(b, new Map())
		const m = byBrandBucket.get(b)!
		m.set(s.bucket, (m.get(s.bucket) ?? 0) + Number(s.n))
	}

	const totals = perListing.reduce(
		(acc, l) => ({
			total: acc.total + Number(l.total),
			last30: acc.last30 + Number(l.last30),
			last7: acc.last7 + Number(l.last7),
		}),
		{ total: 0, last30: 0, last7: 0 },
	)

	return (
		<ReportPage
			title="Reviews — all businesses"
			subtitle="Google reviews across every listing (SHA, Botox Knox, Weight Loss Knox), from the weekly GBP review fetch"
		>
			<Form method="get" className="controls" onChange={e => submit(e.currentTarget)}>
				<label htmlFor="grain">Granularity</label>
				<select id="grain" name="grain" defaultValue={grain}>
					{Object.entries(GRAINS).map(([k, v]) => (
						<option key={k} value={k}>
							{v.label}
						</option>
					))}
				</select>
				<label htmlFor="from">From</label>
				<input id="from" type="date" name="from" defaultValue={from ?? ''} />
				<label htmlFor="to">to</label>
				<input id="to" type="date" name="to" defaultValue={to ?? ''} />
			</Form>

			<div className="tiles">
				<StatTile
					label="Total reviews"
					value={String(totals.total)}
					whisper={`+${totals.last30} last 30 days · +${totals.last7} last 7 days`}
				/>
			</div>

			<section>
				<h2>
					New reviews {GRAINS[grain].label.toLowerCase()}{' '}
					<span className="mini">stacked by brand</span>
				</h2>
				<BarChart
					labels={buckets}
					series={brands
						.filter(b => byBrandBucket.has(b))
						.map((b, i) => ({
							name: b,
							color: SERIES[i]!,
							values: buckets.map(k => byBrandBucket.get(b)!.get(k) ?? 0),
						}))}
					stacked
					height={200}
					format={n => String(Math.round(n))}
				/>
			</section>

			<section>
				<h2>
					Review times{' '}
					<span className="mini">
						{from && to
							? from === to
								? `each review's local time on ${from}`
								: `accumulated by hour of day, ${from} to ${to}`
							: 'accumulated by hour of day, last 30 days'}
					</span>
				</h2>
				<BarChart
					labels={hourLabels}
					series={brands
						.filter(b => hoursByBrand.has(b))
						.map((b, i) => ({
							name: b,
							color: SERIES[i]!,
							values: hoursByBrand.get(b)!,
						}))}
					stacked
					height={180}
					format={n => String(Math.round(n))}
					tickEvery={3}
				/>
				{dayReviews.length ? (
					<div className="rtable-wrap" style={{ marginTop: 10 }}>
						<table className="rtable">
							<thead>
								<tr>
									<th>Time</th>
									<th>Listing</th>
									<th>Reviewer</th>
									<th className="num">★</th>
								</tr>
							</thead>
							<tbody>
								{dayReviews.map((r, i) => (
									<tr key={i}>
										<td>{r.t}</td>
										<td>{r.listing}</td>
										<td>{r.reviewer ?? '—'}</td>
										<td className="num">{r.star ?? '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</section>

			<section>
				<h2>By listing</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Listing</th>
								<th>Brand</th>
								<th className="num">Total</th>
								<th className="num">Avg ★</th>
								<th className="num">Last 30d</th>
								<th className="num">Last 7d</th>
								<th className="num">Latest review</th>
							</tr>
						</thead>
						<tbody>
							{perListing.map(l => (
								<tr key={l.listing}>
									<td>{l.listing}</td>
									<td>{brandOf(l.listing)}</td>
									<td className="num">{l.total}</td>
									<td className="num">{l.avg_star ?? '—'}</td>
									<td className={`num ${Number(l.last30) > 0 ? 'good' : ''}`}>{l.last30}</td>
									<td className="num">{l.last7}</td>
									<td className="num">{l.latest ?? '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					Listings with zero reviews are shown so the gaps stay visible — the sibling
					listings only earn reviews once their review-QR funnels start landing.
				</p>
			</section>

			{funnel.length ? (
				<section>
					<h2>
						QR scans &amp; review funnel{' '}
						<span className="mini">
							{from && to ? `${from} to ${to}` : 'last 30 days'} · refreshed every 15 min from
							PostHog
						</span>
					</h2>
					<BarChart
						labels={funnelDays.map(d => d.slice(5))}
						series={funnelEvents.map((ev, i) => ({
							name: ev.replace(/^review_/, '').replace(/_/g, ' '),
							color: SERIES[i]!,
							values: funnelDays.map(d => funnelByDayEvent.get(`${d}|${ev}`) ?? 0),
						}))}
						height={200}
						format={n => String(Math.round(n))}
						tickEvery={2}
						showTotal={false}
					/>
					{placeClicks.length ? (
						<>
							<h2 style={{ marginTop: 18 }}>
								Listings clicked, by day{' '}
								<span className="mini">which Google listing each review click chose</span>
							</h2>
							<div className="rtable-wrap">
								<table className="rtable">
									<thead>
										<tr>
											<th>Day</th>
											{[...new Set(placeClicks.map(c => c.place))].sort().map(pl => (
												<th key={pl} className="num">
													{pl}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{[...new Set(placeClicks.map(c => c.day))].map(day => (
											<tr key={day}>
												<td>{day}</td>
												{[...new Set(placeClicks.map(c => c.place))].sort().map(pl => {
													const n = placeClicks.find(c => c.day === day && c.place === pl)?.n
													return (
														<td key={pl} className={`num ${n ? 'good' : ''}`}>
															{n ?? ''}
														</td>
													)
												})}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</>
					) : null}
					<div className="rtable-wrap" style={{ marginTop: 10 }}>
						<table className="rtable">
							<thead>
								<tr>
									<th>Brand</th>
									{funnelEvents.map(ev => (
										<th key={ev} className="num">
											{ev.replace(/^review_/, '').replace(/_/g, ' ')}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{funnelBrands.map(b => (
									<tr key={b}>
										<td>{b}</td>
										{funnelEvents.map(ev => (
											<td key={ev} className="num">
												{funnelByBrandEvent.get(`${b}|${ev}`) ?? 0}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			) : null}
		</ReportPage>
	)
}
