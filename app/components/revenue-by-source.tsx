/**
 * Shared window/date controls and aggregation helpers for the report pages.
 * The old RevenueBySource tables were retired; the Revenue report now renders
 * one configurable chart fed by loadRevenueChartCells
 * (revenue-by-source.server.ts).
 */
import { Form, useSubmit } from '@remix-run/react'

// The standard date presets (Google Ads style) used by every report page.
// Trailing presets carry `days`; calendar presets are resolved in
// parseReportWindow (revenue-by-source.server.ts).
export const WINDOWS = {
	today: { label: 'Today', days: 1 },
	yesterday: { label: 'Yesterday', days: 0 },
	'7d': { label: 'Last 7 days', days: 7 },
	'14d': { label: 'Last 14 days', days: 14 },
	'30d': { label: 'Last 30 days', days: 30 },
	'90d': { label: 'Last 90 days', days: 90 },
	thisWeek: { label: 'This week (Mon–Sun)', days: 0 },
	lastWeek: { label: 'Last week', days: 0 },
	thisMonth: { label: 'This month', days: 0 },
	lastMonth: { label: 'Last month', days: 0 },
	thisYear: { label: 'This year', days: 0 },
	all: { label: 'All data', days: 3650 },
	custom: { label: 'Custom range', days: 0 },
} as const
export type WindowKey = keyof typeof WINDOWS

export const GRANULARITIES = ['day', 'week', 'month'] as const
export type Granularity = (typeof GRANULARITIES)[number]

// Every listing's utm_content slug, these columns always render, even at $0,
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
	showGranularity = true,
	children,
}: {
	windowKey: WindowKey
	from: string
	to: string
	granularity?: Granularity
	/** Hide the group-by select on pages where grouping doesn't apply. */
	showGranularity?: boolean
	/** Extra page-specific filters rendered inside the same form. */
	children?: React.ReactNode
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
			{showGranularity ? (
				<>
					<label htmlFor="granularity">Group by</label>
					<select id="granularity" name="granularity" defaultValue={granularity ?? 'day'}>
						<option value="day">Day</option>
						<option value="week">Week</option>
						<option value="month">Month</option>
					</select>
				</>
			) : null}
			{children}
		</Form>
	)
}
