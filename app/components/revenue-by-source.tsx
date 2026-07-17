/**
 * Revenue by source — the window-controlled slice of the Revenue report:
 * paid + projected revenue by service type, booking source, and day, with a
 * per-appointment drill-down (Boulevard + PostHog links) and a manual sync
 * refresh. Data comes from loadRevenueBySource (revenue-by-source.server.ts).
 */
import { Form, useFetcher, useSubmit } from '@remix-run/react'
import { BarChart, SERIES, StatTile, usd } from '#app/components/report-ui'
import { type RevenueBySourceData } from '#app/utils/revenue-by-source.server.ts'

export const WINDOWS = {
	today: { label: 'Today', days: 1 },
	'7d': { label: 'Last 7 days', days: 7 },
	'30d': { label: 'Last 30 days', days: 30 },
	'90d': { label: 'Last 90 days', days: 90 },
	all: { label: 'All data', days: 3650 },
	custom: { label: 'Custom range', days: 0 },
} as const
export type WindowKey = keyof typeof WINDOWS

export const GRANULARITIES = ['day', 'week', 'month'] as const
export type Granularity = (typeof GRANULARITIES)[number]

// Every listing's utm_content slug — these columns always render, even at $0,
// so each GBP's contribution (or lack of one) is visible at a glance.
export const GBP_LISTING_SLUGS = [
	'bearden',
	'farragut',
	'west-hills',
	'cedar-bluff',
	'botox-knox-bearden',
	'botox-knox-farragut',
	'kwlc-bearden',
	'kwlc-farragut',
]

export interface Agg {
	usd: number
	appts: Set<string>
	items: number
}
export function makeAgg(): Agg {
	return { usd: 0, appts: new Set(), items: 0 }
}
export function addTo(a: Agg, row: { usd: number; appt?: string | null }) {
	a.usd += row.usd
	a.items++
	if (row.appt) a.appts.add(row.appt)
}

export function isUnattributedSource(source: string) {
	return (
		source.startsWith('Untracked') ||
		source.startsWith('Rebook') ||
		source.startsWith('Online (unattributed)')
	)
}

export const ET_STAMP: Intl.DateTimeFormatOptions = {
	timeZone: 'America/New_York',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
}

export function WindowControls({
	windowKey,
	from,
	to,
	granularity,
}: {
	windowKey: WindowKey
	from: string
	to: string
	granularity: Granularity
}) {
	const submit = useSubmit()
	function handleControlsChange(e: React.FormEvent<HTMLFormElement>) {
		const form = e.currentTarget
		const target = e.target as HTMLInputElement
		const windowSelect = form.elements.namedItem('window') as HTMLSelectElement
		// Picking a date switches to a custom range; picking a preset re-derives
		// the dates server-side.
		if (target.type === 'date') windowSelect.value = 'custom'
		submit(form)
	}
	return (
		<Form
			method="get"
			className="controls"
			key={`${windowKey}-${from}-${to}`}
			onChange={handleControlsChange}
		>
			<label htmlFor="window">Window</label>
			<select id="window" name="window" defaultValue={windowKey}>
				{Object.entries(WINDOWS).map(([k, w]) => (
					<option key={k} value={k}>
						{w.label}
					</option>
				))}
			</select>
			<label htmlFor="from">From</label>
			<input id="from" name="from" type="date" defaultValue={from} />
			<label htmlFor="to">To</label>
			<input id="to" name="to" type="date" defaultValue={to} />
			<label htmlFor="granularity">Group by</label>
			<select id="granularity" name="granularity" defaultValue={granularity}>
				<option value="day">Day</option>
				<option value="week">Week</option>
				<option value="month">Month</option>
			</select>
		</Form>
	)
}

export function RevenueBySource({ data }: { data: RevenueBySourceData }) {
	const { rows, windowKey, granularity, from, to, drillType, lastSyncedAt, adsSpendUsd } =
		data
	const refresher = useFetcher()
	const refreshing = refresher.state !== 'idle'
	const baseQuery = `window=${windowKey}&from=${from}&to=${to}&granularity=${granularity}`

	const total = makeAgg()
	const paid = makeAgg()
	const projected = makeAgg()
	const byType = new Map<string, Agg>()
	const bySource = new Map<string, Agg>()
	const byMonthType = new Map<string, Map<string, number>>()
	const byBucket = new Map<string, Agg>()
	const byBucketSource = new Map<string, Agg>()
	for (const r of rows) {
		addTo(total, r)
		addTo(r.kind === 'projected' ? projected : paid, r)
		if (!byType.has(r.type)) byType.set(r.type, makeAgg())
		addTo(byType.get(r.type)!, r)
		if (!bySource.has(r.source)) bySource.set(r.source, makeAgg())
		addTo(bySource.get(r.source)!, r)
		if (!byMonthType.has(r.month)) byMonthType.set(r.month, new Map())
		const mt = byMonthType.get(r.month)!
		mt.set(r.type, (mt.get(r.type) ?? 0) + r.usd)
		if (!byBucket.has(r.bucket)) byBucket.set(r.bucket, makeAgg())
		addTo(byBucket.get(r.bucket)!, r)
		const bk = `${r.bucket}|${r.source}`
		if (!byBucketSource.has(bk)) byBucketSource.set(bk, makeAgg())
		addTo(byBucketSource.get(bk)!, r)
	}
	for (const slug of GBP_LISTING_SLUGS) {
		const label = `GBP · ${slug}`
		if (!bySource.has(label)) bySource.set(label, makeAgg())
	}
	const buckets = [...byBucket.keys()].sort().reverse()
	const types = [...byType.entries()].sort((a, b) => b[1].usd - a[1].usd)
	const sources = [...bySource.entries()].sort((a, b) => b[1].usd - a[1].usd)
	const months = [...byMonthType.keys()].sort()
	const tracked = rows.filter(r => !isUnattributedSource(r.source))
	const trackedPct = total.usd
		? Math.round((100 * tracked.reduce((s, r) => s + r.usd, 0)) / total.usd)
		: 0
	const adsRevenue = bySource.get('Google Ads')?.usd ?? 0
	const drillRows = drillType
		? rows
				.filter(r => r.type === drillType)
				.sort((a, b) => b.at.localeCompare(a.at))
				.slice(0, 200)
		: null

	return (
		<>
			<section>
				<h2>
					Revenue by source{' '}
					<span className="mini">paid + projected for booked, unpaid appointments</span>
				</h2>
				<WindowControls windowKey={windowKey} from={from} to={to} granularity={granularity} />
				<refresher.Form method="post" className="controls">
					<button type="submit" name="intent" value="refresh" disabled={refreshing}>
						{refreshing ? 'Refreshing…' : 'Refresh now'}
					</button>
					<span className="mini">
						Orders last synced{' '}
						{lastSyncedAt
							? new Date(lastSyncedAt).toLocaleString('en-US', ET_STAMP) + ' ET'
							: 'never'}{' '}
						· auto-syncs every 15 min · revenue appears once an order is closed at
						checkout
					</span>
				</refresher.Form>

				<div className="tiles">
					<StatTile
						label="Expected revenue"
						value={usd(total.usd)}
						whisper={`${usd(paid.usd)} paid (${paid.appts.size} appts) · ${usd(projected.usd)} projected (${projected.appts.size} booked, unpaid) · ${trackedPct}% has a known source`}
					/>
					<StatTile
						label="Google Ads spend"
						value={adsSpendUsd != null ? usd(adsSpendUsd) : '—'}
						whisper={
							adsSpendUsd
								? `${usd(adsRevenue)} attributed revenue · ${(adsRevenue / adsSpendUsd).toFixed(1)}x ROAS (website-attributed only)`
								: 'same date window, live from the Ads API'
						}
					/>
				</div>
			</section>

			<section>
				<h2>By service type <span className="mini">click a type for the appointments</span></h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Type</th>
								<th className="num">Appointments</th>
								<th className="num">Revenue</th>
								<th className="num">Avg / appt</th>
								<th className="num">Share</th>
							</tr>
						</thead>
						<tbody>
							{types.map(([t, a]) => (
								<tr key={t}>
									<td>
										<a href={`?${baseQuery}&type=${encodeURIComponent(t)}#type-detail`}>{t}</a>
									</td>
									<td className="num">{a.appts.size}</td>
									<td className="num">{usd(a.usd)}</td>
									<td className="num">{usd(a.appts.size ? a.usd / a.appts.size : 0)}</td>
									<td className="num">{total.usd ? Math.round((100 * a.usd) / total.usd) : 0}%</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{drillType && drillRows ? (
				<section id="type-detail">
					<h2>
						Appointments — {drillType}{' '}
						<span className="mini">
							{drillRows.length} line item{drillRows.length === 1 ? '' : 's'} in window
							{drillRows.length === 200 ? ' (showing latest 200)' : ''} ·{' '}
							<a href={`?${baseQuery}`}>clear</a>
						</span>
					</h2>
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>When</th>
									<th>Client</th>
									<th>Service</th>
									<th className="num">Value</th>
									<th>Status</th>
									<th>Source</th>
									<th>Links</th>
								</tr>
							</thead>
							<tbody>
								{drillRows.map((r, i) => (
									<tr key={i}>
										<td>{new Date(r.at).toLocaleString('en-US', ET_STAMP)}</td>
										<td>{r.clientName ?? '—'}</td>
										<td>{r.service}</td>
										<td className="num">{usd(r.usd)}</td>
										<td>{r.kind === 'projected' ? 'Booked (unpaid)' : 'Paid'}</td>
										<td>{r.source}</td>
										<td>
											{r.blvdUrl ? (
												<a href={r.blvdUrl} target="_blank" rel="noreferrer">
													Boulevard
												</a>
											) : null}
											{r.blvdUrl && r.posthogUrl ? ' · ' : null}
											{r.posthogUrl ? (
												<a href={r.posthogUrl} target="_blank" rel="noreferrer">
													PostHog session
												</a>
											) : null}
											{!r.blvdUrl && !r.posthogUrl ? '—' : null}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			<section>
				<h2>By source</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Source</th>
								<th className="num">Appointments</th>
								<th className="num">Revenue</th>
								<th className="num">Share</th>
							</tr>
						</thead>
						<tbody>
							{sources.map(([s, a]) => (
								<tr key={s}>
									<td>{s}</td>
									<td className="num">{a.appts.size}</td>
									<td className="num">{usd(a.usd)}</td>
									<td className="num">{total.usd ? Math.round((100 * a.usd) / total.usd) : 0}%</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					Channel sources come from website booking attribution (live since Jun 1).
					"Rebook (staff-booked)" = booked by staff in Boulevard, usually at checkout
					for a returning client. "Online (unattributed)" = booked online outside our
					tracked flow. Booked-by labels cover the last 120 days.
				</p>
			</section>

			<section>
				<h2>
					By {granularity} × source <span className="mini">revenue (appointments)</span>
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
													{a ? `${usd(a.usd)} (${a.appts.size})` : '—'}
												</td>
											)
										})}
										<td className="num">{`${usd(bt.usd)} (${bt.appts.size})`}</td>
									</tr>
								)
							})}
							<tr style={{ fontWeight: 600 }}>
								<td>Total</td>
								{sources.map(([s, a]) => (
									<td key={s} className="num">
										{a.items ? `${usd(a.usd)} (${a.appts.size})` : '—'}
									</td>
								))}
								<td className="num">{`${usd(total.usd)} (${total.appts.size})`}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			{months.length > 1 ? (
				<section>
					<h2>Monthly revenue by type</h2>
					<BarChart
						labels={months}
						series={types.slice(0, 7).map(([t], i) => ({
							name: t,
							color: SERIES[i]!,
							values: months.map(m => byMonthType.get(m)?.get(t) ?? 0),
						}))}
						stacked
						height={220}
						tickEvery={1}
					/>
				</section>
			) : null}
		</>
	)
}
