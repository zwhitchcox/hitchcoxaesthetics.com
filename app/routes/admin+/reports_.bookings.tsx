/**
 * Bookings funnel — every booking MADE in the window, keyed by when it was
 * booked (not when the appointment happens): counts, expected value, and the
 * source that produced each booking. Revenue by appointment date lives on the
 * Revenue report.
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { ReportPage, StatTile, usd } from '#app/components/report-ui'
import {
	addTo,
	ET_STAMP,
	GBP_LISTING_SLUGS,
	isUnattributedSource,
	makeAgg,
	WindowControls,
	type Agg,
} from '#app/components/revenue-by-source.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { loadBookingFunnel } from '#app/utils/revenue-by-source.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	return json(await loadBookingFunnel(request))
}

export default function BookingsFunnel() {
	const { rows, windowKey, granularity, from, to, adsSpendUsd } =
		useLoaderData<typeof loader>()

	const bySource = new Map<string, Agg & { n: number }>()
	const byBucketSource = new Map<string, { n: number; usd: number }>()
	const byBucket = new Map<string, { n: number; usd: number }>()
	let totalExpected = 0
	for (const r of rows) {
		totalExpected += r.expectedUsd
		if (!bySource.has(r.source)) bySource.set(r.source, { ...makeAgg(), n: 0 })
		const s = bySource.get(r.source)!
		addTo(s, { usd: r.expectedUsd })
		s.n++
		const bk = `${r.bucket}|${r.source}`
		if (!byBucketSource.has(bk)) byBucketSource.set(bk, { n: 0, usd: 0 })
		const b = byBucketSource.get(bk)!
		b.n++
		b.usd += r.expectedUsd
		if (!byBucket.has(r.bucket)) byBucket.set(r.bucket, { n: 0, usd: 0 })
		const t = byBucket.get(r.bucket)!
		t.n++
		t.usd += r.expectedUsd
	}
	for (const slug of GBP_LISTING_SLUGS) {
		const label = `GBP · ${slug}`
		if (!bySource.has(label)) bySource.set(label, { ...makeAgg(), n: 0 })
	}
	const sources = [...bySource.entries()].sort((a, b) => b[1].usd - a[1].usd)
	const buckets = [...byBucket.keys()].sort().reverse()
	const trackedCount = rows.filter(r => !isUnattributedSource(r.source)).length
	const adsBookings = bySource.get('Google Ads')?.n ?? 0

	return (
		<ReportPage
			title="Bookings funnel"
			subtitle="Every booking made in the window, by booking time — tracked website/phone-agent bookings in real time, staff bookings live from Boulevard. Revenue by appointment date is on the Revenue report."
		>
			<WindowControls windowKey={windowKey} from={from} to={to} granularity={granularity} />

			<div className="tiles">
				<StatTile
					label="Bookings made"
					value={String(rows.length)}
					whisper={`${usd(totalExpected)} expected value · ${
						rows.length ? Math.round((100 * trackedCount) / rows.length) : 0
					}% with a known source`}
				/>
				<StatTile
					label="Google Ads spend"
					value={adsSpendUsd != null ? usd(adsSpendUsd) : '—'}
					whisper={
						adsSpendUsd && adsBookings
							? `${adsBookings} ads bookings · ${usd(adsSpendUsd / adsBookings)} per booking`
							: 'same date window, live from the Ads API'
					}
				/>
			</div>

			<section>
				<h2>By source <span className="mini">bookings (expected value)</span></h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Source</th>
								<th className="num">Bookings</th>
								<th className="num">Expected value</th>
								<th className="num">Share</th>
							</tr>
						</thead>
						<tbody>
							{sources.map(([s, a]) => (
								<tr key={s}>
									<td>{s}</td>
									<td className="num">{a.n}</td>
									<td className="num">{usd(a.usd)}</td>
									<td className="num">
										{rows.length ? Math.round((100 * a.n) / rows.length) : 0}%
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>
					By {granularity} × source <span className="mini">bookings (expected value)</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>{granularity === 'week' ? 'Week of' : granularity === 'month' ? 'Month' : 'Date'}</th>
								{sources.map(([s]) => (
									<th key={s} className="num">
										{s.startsWith('Untracked') ? 'Untracked' : s}
									</th>
								))}
								<th className="num">Total</th>
							</tr>
						</thead>
						<tbody>
							{buckets.map(b => {
								const bt = byBucket.get(b)!
								return (
									<tr key={b}>
										<td>{b}</td>
										{sources.map(([s]) => {
											const a = byBucketSource.get(`${b}|${s}`)
											return (
												<td key={s} className="num">
													{a ? `${a.n} (${usd(a.usd)})` : '—'}
												</td>
											)
										})}
										<td className="num">{`${bt.n} (${usd(bt.usd)})`}</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>
					Bookings <span className="mini">newest first · max 200</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Booked at</th>
								<th>Appt date</th>
								<th>Client</th>
								<th>Service</th>
								<th>Location</th>
								<th>Source</th>
								<th className="num">Est. value</th>
								<th>Links</th>
							</tr>
						</thead>
						<tbody>
							{rows.slice(0, 200).map((b, i) => (
								<tr key={i}>
									<td>{new Date(b.bookedAt).toLocaleString('en-US', ET_STAMP)}</td>
									<td>
										{b.apptAt ? new Date(b.apptAt).toLocaleString('en-US', ET_STAMP) : '—'}
									</td>
									<td>{b.clientName ?? '—'}</td>
									<td>{b.service}</td>
									<td>{b.location ?? '—'}</td>
									<td>{b.source}</td>
									<td className="num">{usd(b.expectedUsd)}</td>
									<td>
										{b.blvdUrl ? (
											<a href={b.blvdUrl} target="_blank" rel="noreferrer">
												Boulevard
											</a>
										) : null}
										{b.blvdUrl && b.posthogUrl ? ' · ' : null}
										{b.posthogUrl ? (
											<a href={b.posthogUrl} target="_blank" rel="noreferrer">
												PostHog
											</a>
										) : null}
										{!b.blvdUrl && !b.posthogUrl ? '—' : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					Cancelled and no-showed bookings are excluded. Expected value uses the
					booked price where Boulevard has one, otherwise the service's average
					paid ticket over the last 90 days.
				</p>
			</section>
		</ReportPage>
	)
}
