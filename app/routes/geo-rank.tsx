/**
 * LocalFalcon-style geo-grid rank explorer, reading the reports Postgres
 * (raw_dataforseo_region + geo_my_listing + geo_grid_homes, written by the
 * sha-reports weekly capture). Green = top 3, yellow = 4-10, red = 11+,
 * hollow gray = not in the top 20 at that point.
 *
 * Requires REPORTS_DATABASE_URL; renders a friendly notice without it.
 */
import { json, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { useFetcher, useLoaderData, useSubmit } from '@remix-run/react'
import { useEffect, useMemo, useRef } from 'react'
import { useNonce } from '#/app/utils/nonce-provider.ts'
import { LineChart, ReportPage, StatTile, usd } from '#app/components/report-ui'
import {
	weeklyGmbWeightLossByListing,
	weeklyGmbWeightLossPhone,
} from '#app/utils/gmb-bookings.server'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Geo Rank Explorer' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const ALL_BUSINESSES = 'All businesses'
const BRANDS = [
	ALL_BUSINESSES,
	'Sarah Hitchcox Aesthetics',
	'Botox Knox',
	'Weight Loss Knox',
] as const
const BRAND_CASE = `CASE WHEN m.listing LIKE 'SHA%' THEN 'Sarah Hitchcox Aesthetics'
	WHEN m.listing LIKE 'Botox Knox%' THEN 'Botox Knox'
	WHEN m.listing LIKE 'KWLC%' THEN 'Weight Loss Knox' END`

/**
 * Manual "Refresh reach", starts a forced geoRankCapture on the sha-reports
 * Temporal worker (task queue "reports"). Force captures an ADDITIONAL
 * snapshot keyed to today's date (~$4.50 of DataForSEO tasks, ~1-2h); it
 * never deletes or replaces existing captures.
 */
export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const address = process.env.TEMPORAL_ADDRESS?.trim()
	if (!address) return json({ ok: false as const, message: 'TEMPORAL_ADDRESS is not configured' })
	const { Client, Connection } = await import('@temporalio/client')
	const connection = await Connection.connect({ address })
	try {
		const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'hitchcox' })
		const handle = await client.workflow.start('geoRankCapture', {
			args: [true], // force: additional snapshot keyed to today (never replaces)
			taskQueue: 'reports',
			workflowId: `geo-rank-manual-${Date.now()}`,
		})
		return json({ ok: true as const, message: `Refresh queued (${handle.workflowId}). Fresh ranks land in ~1-2 hours.` })
	} catch (error) {
		return json({ ok: false as const, message: error instanceof Error ? error.message : String(error) })
	} finally {
		await connection.close().catch(() => {})
	}
}

// Background stale-while-revalidate for geo_point_week_mv. Staleness is
// data-driven (a capture week the view has not seen), so the view refreshes
// exactly once per new capture, ~8s in the background, never in a request.
let geoRefreshInFlight = false
function maybeRefreshGeoView() {
	if (geoRefreshInFlight) return
	geoRefreshInFlight = true
	void (async () => {
		try {
			const stale = (
				await reportsQuery<{ stale: boolean }>(
					`SELECT coalesce((SELECT max(week) FROM geo_point_week_mv)
					   < (SELECT max(week) FROM raw_dataforseo_region), true) AS stale`,
				)
			)[0]?.stale
			if (stale) {
				await reportsQuery(
					'REFRESH MATERIALIZED VIEW CONCURRENTLY geo_point_week_mv',
				)
			}
		} catch (error) {
			console.error('[geo-rank] view refresh failed:', error)
		} finally {
			geoRefreshInFlight = false
		}
	})()
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })

	const params = new URL(request.url).searchParams
	// All heavy aggregates read geo_point_week_mv (one row per grid point per
	// week, ~46k rows instead of ~900k raw results). Refresh in the
	// BACKGROUND when a new capture has landed: the inline version made the
	// first page view after a capture wait ~17s (measured 2026-08-03).
	// CONCURRENTLY (enabled by the unique index on week/keyword/row/col)
	// keeps the view readable during the refresh, so this request and every
	// concurrent one serve the previous capture until the new one is in.
	maybeRefreshGeoView()
	const client = {
		query: async <T extends Record<string, any> = any>(sql: string, params?: unknown[]) => ({
			rows: await reportsQuery<T>(sql, params ?? []),
		}),
	}
	{
		// Weeks and keywords come from the 46k-row materialized view, not the
		// ~900k-row raw table (the raw DISTINCT took ~700ms). During the
		// short background refresh after a capture, the newest week appears
		// one page load later, consistent with everything else on this page.
		const [weeksResult, keywordsResult] = await Promise.all([
			client.query<{ week: string }>(
				`SELECT DISTINCT to_char(week, 'YYYY-MM-DD') AS week FROM geo_point_week_mv ORDER BY 1 DESC`,
			),
			client.query<{ keyword: string }>(
				`SELECT DISTINCT keyword FROM geo_point_week_mv WHERE week = (SELECT max(week) FROM geo_point_week_mv) ORDER BY 1`,
			),
		])
		const weeks = weeksResult.rows.map(r => r.week)
		const keywords = keywordsResult.rows.map(r => r.keyword)

		const week = weeks.includes(params.get('week') ?? '') ? params.get('week')! : weeks[0]
		const keyword = keywords.includes(params.get('keyword') ?? '')
			? params.get('keyword')!
			: (keywords.find(k => k === 'med spa near me') ?? keywords[0])
		const brand = (BRANDS as readonly string[]).includes(params.get('brand') ?? '')
			? params.get('brand')!
			: BRANDS[0] // default: All businesses, best rank across every listing
		// "All businesses": any of our listings counts, best rank at each point.
		const isAll = brand === ALL_BUSINESSES
		const hitCol = isAll
			? 'hit_all'
			: brand === 'Sarah Hitchcox Aesthetics'
				? 'hit_sha'
				: brand === 'Botox Knox'
					? 'hit_bk'
					: 'hit_wlk'

		// Viewing a competitor: the map shows THEIR best rank per grid point
		// instead of ours. Chosen by clicking a row in the leaderboard.
		const competitor = params.get('competitor')?.trim() || null

		const gridPromise = client.query(
			competitor
				? `SELECT g.grid_lat AS lat, g.grid_lng AS lng, g."gridRow" AS row, g."gridCol" AS col, r.rank
				 FROM (SELECT DISTINCT "gridRow", "gridCol", "gridLat" AS grid_lat, "gridLng" AS grid_lng
				       FROM raw_dataforseo_region WHERE week = $1::date AND keyword = $2) g
				 LEFT JOIN (SELECT "gridRow", "gridCol", min("rankAbsolute") AS rank
				            FROM raw_dataforseo_region
				            WHERE week = $1::date AND keyword = $2 AND title = $3
				            GROUP BY 1, 2) r USING ("gridRow", "gridCol")`
				: `SELECT g.grid_lat AS lat, g.grid_lng AS lng, g."gridRow" AS row, g."gridCol" AS col, r.rank
				 FROM (SELECT DISTINCT "gridRow", "gridCol", "gridLat" AS grid_lat, "gridLng" AS grid_lng
				       FROM raw_dataforseo_region WHERE week = $1::date AND keyword = $2) g
				 LEFT JOIN (SELECT "gridRow", "gridCol", min("rankAbsolute") AS rank
				            FROM raw_dataforseo_region r JOIN geo_my_listing m ON m.place_id = r."placeId"
				            WHERE week = $1::date AND keyword = $2${isAll ? '' : ` AND ${BRAND_CASE} = $3`}
				            GROUP BY 1, 2) r USING ("gridRow", "gridCol")`,
			competitor
				? [week, keyword, competitor]
				: isAll
					? [week, keyword]
					: [week, keyword, brand],
		)

		// Competitor reach over time for the selected keyword: share of grid
		// points with them in the top 3, per capture week. Point-share, not
		// homes-weighted (the homes-weighted mv only precomputes OUR brands).
		const competitorTrendPromise = competitor
			? client.query<{ week: string; pct: string | null }>(
					`SELECT to_char(week, 'YYYY-MM-DD') AS week,
					   round(100.0 * count(DISTINCT ("gridRow","gridCol")) FILTER (WHERE title = $2 AND "rankAbsolute" <= 3)
					     / nullif(count(DISTINCT ("gridRow","gridCol")), 0), 1) AS pct
					 FROM raw_dataforseo_region WHERE keyword = $1
					 GROUP BY week ORDER BY week`,
					[keyword, competitor],
				)
			: null

		const rangesPromise = client.query(
				`SELECT r.keyword, ${isAll ? `'(all businesses combined)' AS listing` : 'm.listing'},
				   count(DISTINCT (r."gridRow", r."gridCol")) AS points,
				   round(100.0 * count(DISTINCT (r."gridRow", r."gridCol"))
				     / (SELECT count(DISTINCT ("gridRow", "gridCol")) FROM raw_dataforseo_region t
				        WHERE t.week = $1::date AND t.keyword = r.keyword), 1) AS metro_pct,
				   count(DISTINCT (r."gridRow", r."gridCol")) FILTER (WHERE r."rankAbsolute" <= 3) AS top3,
				   count(DISTINCT (r."gridRow", r."gridCol")) FILTER (WHERE r."rankAbsolute" BETWEEN 4 AND 10) AS mid,
				   min(r."rankAbsolute") AS best,
				   percentile_cont(0.5) WITHIN GROUP (ORDER BY r."rankAbsolute") AS median
				 FROM raw_dataforseo_region r JOIN geo_my_listing m ON m.place_id = r."placeId"
				 WHERE r.week = $1::date${isAll ? '' : ` AND ${BRAND_CASE} = $2`}
				 GROUP BY 1${isAll ? '' : ', 2'} ORDER BY metro_pct DESC, r.keyword`,
				isAll ? [week] : [week, brand],
			)

		// Trend: per week per keyword, share of metro households whose top-3
		// local pack includes the brand (falls back to point share while
		// geo_grid_homes is empty, matching report_geo_reach semantics).
		const trendsPromise = client.query(
				`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword,
				   round(100.0 * sum(COALESCE(homes, 1)) FILTER (WHERE ${hitCol})
				     / nullif(sum(COALESCE(homes, 1)), 0), 2) AS reach_pct
				 FROM geo_point_week_mv
				 GROUP BY week, keyword ORDER BY keyword, week`,
			)

		// Competitor leaderboard for the selected keyword+week, who owns the
		// map pack across the metro (replaces the Metabase geo-rank dashboard).
		const leaderboardPromise = client.query(
				`SELECT r.title,
					count(DISTINCT (r."gridRow", r."gridCol")) FILTER (WHERE r."rankAbsolute" <= 3) AS top3,
					count(DISTINCT (r."gridRow", r."gridCol")) FILTER (WHERE r."rankAbsolute" BETWEEN 4 AND 10) AS mid,
					min(r."rankAbsolute") AS best,
					max(r.rating) AS rating,
					max(r."ratingVotes") AS votes,
					bool_or(m.place_id IS NOT NULL) AS is_mine
				 FROM raw_dataforseo_region r
				 LEFT JOIN geo_my_listing m ON m.place_id = r."placeId"
				 WHERE r.week = $1::date AND r.keyword = $2
				 GROUP BY r.title ORDER BY top3 DESC, mid DESC LIMIT 15`,
				[week, keyword],
			)
		const totalPointsPromise = client.query(
			`SELECT count(DISTINCT ("gridRow","gridCol")) AS n
			 FROM raw_dataforseo_region WHERE week = $1::date AND keyword = $2`,
			[week, keyword],
		)

		// Census-weighted household reach per keyword per week (brand-scoped).
		const reachRowsPromise = client.query(
				`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword,
					 COALESCE(sum(COALESCE(homes, 0)) FILTER (WHERE ${hitCol}), 0) AS reached,
					 sum(COALESCE(homes, 0)) AS metro
				 FROM geo_point_week_mv
				 GROUP BY 1, 2 ORDER BY 1, 2`,
			)

		// Reach → $ inputs (brand-independent: all our listings combined).
		const rankHomesPromise = client.query(
				`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword, best_rank,
					 sum(COALESCE(homes, 0)) AS homes
				 FROM geo_point_week_mv
				 WHERE best_rank IS NOT NULL
				 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
			)
		const totalsRvPromise = client.query(
				`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword,
					 sum(COALESCE(homes, 0)) AS total_homes
				 FROM geo_point_week_mv
				 GROUP BY 1, 2`,
			)
		const clientValuesPromise = client.query(
				`SELECT category, expected_value_per_conversion AS value
				 FROM client_value WHERE horizon_months = 12`,
			)

		// One parallel batch: the serial version stacked ten DB round trips.
		const [
			gridResult, rangesResult, trendsResult, leaderboardResult,
			totalPointsResult, reachRowsResult, rankHomesResult, totalsRvResult,
			clientValuesResult, competitorTrendResult, actualWeb, actualPhone,
		] = await Promise.all([
			gridPromise, rangesPromise, trendsPromise, leaderboardPromise,
			totalPointsPromise, reachRowsPromise, rankHomesPromise, totalsRvPromise,
			clientValuesPromise, competitorTrendPromise,
			weeklyGmbWeightLossByListing().catch(() => [] as Array<[string, string, number]>),
			weeklyGmbWeightLossPhone().catch(() => [] as Array<[string, number]>),
		])
		const grid = gridResult.rows as Array<{ lat: number; lng: number; row: number; col: number; rank: number | null }>
		const ranges = rangesResult.rows
		const trends = trendsResult.rows as Array<{ week: string; keyword: string; reach_pct: number | null }>
		const leaderboard = leaderboardResult.rows as Array<{ title: string; top3: string; mid: string; best: number; rating: number | null; votes: number | null; is_mine: boolean }>
		const totalPoints = Number(totalPointsResult.rows[0]?.n ?? 0)
		const reachRows = reachRowsResult.rows as Array<{ week: string; keyword: string; reached: string; metro: string }>
		const rankHomes = rankHomesResult.rows as Array<{ week: string; keyword: string; best_rank: number; homes: string }>
		const totalsRv = totalsRvResult.rows as Array<{ week: string; keyword: string; total_homes: string }>
		const clientValues = clientValuesResult.rows as Array<{ category: string; value: string }>
		const competitorTrend = competitorTrendResult
			? competitorTrendResult.rows.map(r => ({ week: r.week, pct: r.pct == null ? null : Number(r.pct) }))
			: null

		return json({
			configured: true as const,
			weeks, keywords, week, keyword, brand, brands: BRANDS,
			competitor, competitorTrend,
			grid, ranges, trends,
			leaderboard, totalPoints, reachRows,
			rankHomes, totalsRv,
			valueByCategory: Object.fromEntries(clientValues.map(r => [r.category, Number(r.value)])),
			actualWeb, actualPhone,
		})
	}
}

// --- Reach → $ model (from the retired reach-value report) -----------------
// Ads API metro-county avg monthly searches, pulled 2026-07-13.
const RV_KEYWORDS: Record<string, { volume: number; cluster: string; category: string }> = {
	'botox near me': { volume: 400, cluster: 'botox (390, trademark proxy) + tox near me (10)', category: 'Tox' },
	'filler near me': { volume: 280, cluster: 'filler near me (20) + lip filler near me (260)', category: 'Filler' },
	'med spa near me': { volume: 260, cluster: 'med spa near me (260)', category: 'ALL' },
	'weight loss near me': { volume: 860, cluster: 'weight loss near me (140) + weight loss clinic near me (720)', category: 'Weight Loss' },
	'medical weight loss near me': { volume: 10, cluster: 'medical weight loss near me (10)', category: 'Weight Loss' },
	'semaglutide near me': { volume: 220, cluster: 'semaglutide near me (50) + tirzepatide near me (170)', category: 'Weight Loss' },
}
// Share of searchers who become a booked client when we hold pack rank 1/2/3:
// engagement (20/12/8%) × lead→booked (25%).
const CLIENT_RATE: Record<number, number> = { 1: 0.05, 2: 0.03, 3: 0.02 }
const WEEKS_PER_MONTH = 4.345

const COLORS = { top3: '#16a34a', mid: '#eab308', low: '#dc2626', none: '#9ca3af' }

function bucket(rank: number | null) {
	if (rank == null || rank > 20) return 'none'
	if (rank <= 3) return 'top3'
	if (rank <= 10) return 'mid'
	return 'low'
}

/**
 * Leaflet must initialize AFTER React hydration: the map div is empty in the
 * JSX, so hydration reconciles away any panes an early inline script built
 * (the map "flashed" then went blank). An effect runs post-hydration only.
 */
type GeoMarker = {
	lat: number
	lng: number
	row: number
	col: number
	rank: number | null
	c: string
	b: string
}
type MapCtx = { week: string; keyword: string }

const escapeHtml = (v: string) =>
	v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Click a dot → fetch and show the full local pack at that grid point. */
async function pointPopupHtml(ctx: MapCtx, m: GeoMarker): Promise<string> {
	const qs = new URLSearchParams({
		week: ctx.week,
		keyword: ctx.keyword,
		row: String(m.row),
		col: String(m.col),
	})
	const res = await fetch(`/resources/geo-rank-point?${qs}`)
	const data = (await res.json()) as {
		results: Array<{
			rank: number | null
			title: string | null
			rating: string | null
			votes: number | null
			is_mine: boolean
		}>
	}
	if (!data.results.length) return '<em>No results captured at this point.</em>'
	const rows = data.results
		.map(
			r =>
				`<tr${r.is_mine ? ' style="font-weight:700;background:#fdf2f8"' : ''}>
					<td style="padding:1px 6px;text-align:right">${r.rank ?? '-'}</td>
					<td style="padding:1px 6px">${escapeHtml(r.title ?? '?')}</td>
					<td style="padding:1px 6px;white-space:nowrap">${r.rating ?? '-'}★ (${r.votes ?? 0})</td>
				</tr>`,
		)
		.join('')
	return `<div style="max-height:260px;overflow-y:auto">
		<div style="font-weight:700;margin-bottom:4px">${escapeHtml(ctx.keyword)}, ${escapeHtml(ctx.week)}</div>
		<table style="font-size:12px;border-collapse:collapse">${rows}</table></div>`
}

function drawMarkers(L: any, layer: any, markers: GeoMarker[], ctx: MapCtx) {
	layer.clearLayers()
	for (const p of markers) {
		const marker = L.circleMarker([p.lat, p.lng], {
			radius: p.b === 'none' ? 3 : 7,
			color: p.c,
			weight: 1,
			fillColor: p.c,
			fillOpacity: p.b === 'none' ? 0.15 : 0.85,
			opacity: p.b === 'none' ? 0.3 : 1,
		})
			.addTo(layer)
			.bindTooltip(p.rank == null ? 'not in top 20' : `rank #${p.rank}, click for full listing`)
		marker.on('click', async () => {
			marker.bindPopup('<em>Loading…</em>', { maxWidth: 340 }).openPopup()
			try {
				marker.setPopupContent(await pointPopupHtml(ctx, p))
			} catch {
				marker.setPopupContent('<em>Failed to load listing.</em>')
			}
		})
	}
}

function useLeafletMap(markers: GeoMarker[], ctx: MapCtx) {
	const mapRef = useRef<HTMLDivElement>(null)
	const mapInstance = useRef<any>(null)
	const layerRef = useRef<any>(null)
	const fitted = useRef(false)
	const markersRef = useRef(markers)
	markersRef.current = markers
	const ctxRef = useRef(ctx)
	ctxRef.current = ctx

	// Create the map ONCE; selector changes must never reset zoom/pan.
	useEffect(() => {
		let cancelled = false
		let ro: ResizeObserver | null = null
		function init() {
			const el = mapRef.current
			const L = (window as any).L
			if (cancelled) return
			// Wait for the CDN script AND a real container size (hub pane
			// iframes lay out late, a 0-height init renders a blank map).
			if (!L || !el || el.clientHeight < 40) return void setTimeout(init, 60)
			const map = L.map(el)
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap contributors',
				maxZoom: 18,
			}).addTo(map)
			mapInstance.current = map
			layerRef.current = L.layerGroup().addTo(map)
			drawMarkers(L, layerRef.current, markersRef.current, ctxRef.current)
			const bounds = markersRef.current.map(p => [p.lat, p.lng] as [number, number])
			if (bounds.length) {
				map.fitBounds(bounds, { padding: [20, 20] })
				fitted.current = true
			}
			// Re-measure (not re-fit, that would steal zoom/pan) on pane resize.
			if (window.ResizeObserver) {
				ro = new ResizeObserver(() => map?.invalidateSize())
				ro.observe(el)
			}
		}
		init()
		return () => {
			cancelled = true
			ro?.disconnect()
			mapInstance.current?.remove()
			mapInstance.current = null
			layerRef.current = null
			fitted.current = false
		}
	}, [])

	// Data changed (keyword/brand/week): redraw dots in place, keep the view.
	useEffect(() => {
		const L = (window as any).L
		if (!L || !layerRef.current) return
		drawMarkers(L, layerRef.current, markers, ctxRef.current)
		if (!fitted.current && markers.length && mapInstance.current) {
			mapInstance.current.fitBounds(
				markers.map(p => [p.lat, p.lng] as [number, number]),
				{ padding: [20, 20] },
			)
			fitted.current = true
		}
	}, [markers])
	return mapRef
}

export default function GeoRank() {
	const data = useLoaderData<typeof loader>()
	const nonce = useNonce()
	const submit = useSubmit()
	const refresher = useFetcher<{ ok: boolean; message: string }>()
	const markers = useMemo(
		() =>
			data.configured
				? data.grid.map(p => ({ ...p, c: COLORS[bucket(p.rank)], b: bucket(p.rank) }))
				: [],
		[data],
	)
	const mapRef = useLeafletMap(markers, {
		week: data.configured ? data.week : '',
		keyword: data.configured ? data.keyword : '',
	})
	if (!data.configured) {
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	}
	const { ranges, trends, weeks, keywords, week, keyword, brand, brands } = data
	const trendByKeyword = new Map<string, Array<{ week: string; v: number }>>()
	for (const t of trends) {
		if (!trendByKeyword.has(t.keyword)) trendByKeyword.set(t.keyword, [])
		trendByKeyword.get(t.keyword)!.push({ week: t.week, v: Number(t.reach_pct ?? 0) })
	}

	// Theme tokens only (bg-background / text-foreground / border-input) so a
	// dark page can never pair the UA's white select with white text again.
	const selectCls =
		'rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground'
	return (
		<div className="bg-background text-foreground" style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
			<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
			<form method="get" className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
				<strong>Geo Rank</strong>
				{[
					{ name: 'brand', value: brand, options: brands as readonly string[] },
					{ name: 'keyword', value: keyword, options: keywords },
					{ name: 'week', value: week, options: weeks },
				].map(sel => (
					<select key={sel.name} name={sel.name} value={sel.value}
						onChange={e => submit(e.currentTarget.form)}
						className={selectCls}>
						{sel.options.map(o => <option key={o} value={o}>{o}</option>)}
					</select>
				))}
				{/* Competitor view: options are this keyword+week's leaderboard. */}
				<select name="competitor" value={data.competitor ?? ''}
					onChange={e => submit(e.currentTarget.form)}
					className={
						data.competitor
							? 'rounded-md border border-amber-500 bg-amber-100 px-2 py-1.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200'
							: selectCls
					}>
					<option value="">Compare: competitor…</option>
					{data.leaderboard.filter(r => !r.is_mine).map(r => (
						<option key={r.title} value={r.title}>{r.title}</option>
					))}
				</select>
				{data.competitor ? (
					<span className="inline-flex items-center gap-2 rounded-full border border-amber-500 bg-amber-100 px-3 py-1 text-[13px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
						Viewing competitor: <strong>{data.competitor}</strong>
						<a href={`?brand=${encodeURIComponent(brand)}&keyword=${encodeURIComponent(keyword)}&week=${encodeURIComponent(week)}`}
							className="font-bold text-amber-700 no-underline dark:text-amber-300">✕ back to us</a>
					</span>
				) : null}
				<button type="button" disabled={refresher.state !== 'idle'}
					onClick={() => {
						if (confirm('Capture a fresh reach snapshot now? (~$4.50 of DataForSEO tasks; fresh ranks land in ~1-2h as a NEW date in the date dropdown, existing data is never touched.)'))
							refresher.submit({}, { method: 'post' })
					}}
					className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:bg-blue-400">
					{refresher.state !== 'idle' ? 'Queuing…' : 'Refresh reach'}
				</button>
				{refresher.data ? (
					<span className={`text-xs ${refresher.data.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{refresher.data.message}</span>
				) : null}
				<span className="ml-auto flex gap-3.5 text-[13px]">
					<span><i style={{ background: COLORS.top3, display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 4 }} />top 3</span>
					<span><i style={{ background: COLORS.mid, display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 4 }} />4–10</span>
					<span><i style={{ background: COLORS.low, display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 4 }} />11–20</span>
					<span><i style={{ background: COLORS.none, display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 4, opacity: 0.4 }} />not ranked</span>
				</span>
			</form>
			<div id="geo-map" ref={mapRef} style={{ height: 'calc(100vh - 54px)', width: '100%' }} />

			<section className="mx-auto max-w-[1100px] p-4">
				<h2 className="text-lg">Ranges, {brand} ({week})</h2>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse [font-variant-numeric:tabular-nums]">
						<thead><tr>{['keyword', 'listing', 'points', '% of metro', 'top-3 pts', '4–10 pts', 'best', 'median'].map(h => (
							<th key={h} className="border-b-2 border-foreground px-2.5 py-1.5 text-left text-[13px]">{h}</th>
						))}</tr></thead>
						<tbody>{ranges.map((r: any, i: number) => (
							<tr key={i}>
								<td className="border-b border-border px-2.5 py-1">{r.keyword}</td>
								<td className="border-b border-border px-2.5 py-1">{r.listing}</td>
								<td className="border-b border-border px-2.5 py-1">{r.points}</td>
								<td className="border-b border-border px-2.5 py-1">{r.metro_pct}%</td>
								<td className="border-b border-border px-2.5 py-1" style={{ color: COLORS.top3 }}>{r.top3}</td>
								<td className="border-b border-border px-2.5 py-1 text-amber-700 dark:text-amber-400">{r.mid}</td>
								<td className="border-b border-border px-2.5 py-1">{r.best}</td>
								<td className="border-b border-border px-2.5 py-1">{r.median}</td>
							</tr>
						))}</tbody>
					</table>
				</div>

				<h2 className="mt-7 text-lg">Reach trends, {brand} (top-3 household reach %)</h2>
				<div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
					{[...trendByKeyword.entries()].map(([kw, pts]) => {
						const max = Math.max(1, ...pts.map(p => p.v))
						const W = 300, H = 90, PAD = 8
						const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, pts.length - 1)
						const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD)
						return (
							<div key={kw} className="rounded-lg border border-border p-3">
								<div className="mb-1 text-[13px] font-semibold">{kw}</div>
								<svg width={W} height={H} role="img" aria-label={`Reach trend for ${kw}`}>
									<polyline fill="none" stroke="#2563eb" strokeWidth="2"
										points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} />
									{pts.map((p, i) => (
										<g key={p.week}>
											<circle cx={x(i)} cy={y(p.v)} r={3} fill="#2563eb" />
											<text x={x(i)} y={y(p.v) - 6} fontSize="10" textAnchor="middle" fill="currentColor">{p.v}%</text>
											<text x={x(i)} y={H - 1} fontSize="9" textAnchor="middle" fill="currentColor" opacity={0.55}>{p.week.slice(5)}</text>
										</g>
									))}
								</svg>
							</div>
						)
					})}
				</div>
			</section>

			<ConsolidatedSections data={data} />

			<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" nonce={nonce} />
		</div>
	)
}

/**
 * Everything that used to live in the Metabase geo-rank dashboard and the
 * Reach / Reach value / GMB clients reports, consolidated under the map.
 */
function ConsolidatedSections({
	data,
}: {
	data: Extract<ReturnType<typeof useLoaderData<typeof loader>>, { configured: true }>
}) {
	const {
		week, keyword, brand,
		leaderboard, totalPoints, reachRows,
		rankHomes, totalsRv, valueByCategory, actualWeb, actualPhone,
		competitor, competitorTrend,
	} = data
	const viewHref = (title: string) =>
		`?brand=${encodeURIComponent(brand)}&keyword=${encodeURIComponent(keyword)}&week=${encodeURIComponent(week)}&competitor=${encodeURIComponent(title)}`

	// Household reach, latest week vs prior, per keyword (brand-scoped).
	const reachWeeks = [...new Set(reachRows.map(r => r.week))].sort()
	const latestWeek = reachWeeks.at(-1)
	const priorWeek = reachWeeks.at(-2)
	const reachCell = (w: string | undefined, kw: string) =>
		w ? reachRows.find(r => r.week === w && r.keyword === kw) : undefined
	const reachKeywords = [...new Set(reachRows.map(r => r.keyword))].sort()
	const reachLatest = reachKeywords
		.map(kw => {
			const cur = reachCell(latestWeek, kw)
			const prev = reachCell(priorWeek, kw)
			return {
				keyword: kw,
				reached: Number(cur?.reached ?? 0),
				metro: Number(cur?.metro ?? 0),
				delta: prev ? Number(cur?.reached ?? 0) - Number(prev.reached) : null,
			}
		})
		.sort((a, b) => b.reached - a.reached)

	// Reach → $ (all listings combined).
	const rvWeeks = [...new Set(totalsRv.map(t => t.week))].sort()
	const rvKeywords = Object.keys(RV_KEYWORDS).filter(kw => totalsRv.some(t => t.keyword === kw))
	const totalHomes = (w: string, kw: string) =>
		Number(totalsRv.find(t => t.week === w && t.keyword === kw)?.total_homes ?? 0)
	const homesAtRank = (w: string, kw: string, rank: number) =>
		Number(rankHomes.find(r => r.week === w && r.keyword === kw && r.best_rank === rank)?.homes ?? 0)
	const clientValue = (kw: string) =>
		valueByCategory[RV_KEYWORDS[kw]!.category] ?? valueByCategory['ALL'] ?? 800
	const clientsPerMonth = (w: string, kw: string) => {
		const total = totalHomes(w, kw)
		if (!total) return 0
		let shareRate = 0
		for (const rank of [1, 2, 3]) shareRate += (homesAtRank(w, kw, rank) / total) * CLIENT_RATE[rank]!
		return RV_KEYWORDS[kw]!.volume * shareRate
	}
	const dollarsPerMonth = (w: string, kw: string) => clientsPerMonth(w, kw) * clientValue(kw)
	const rvLatest = rvWeeks.at(-1)
	const rvPrior = rvWeeks.at(-2)
	const rvRows = rvLatest
		? rvKeywords.map(kw => {
				const clients = clientsPerMonth(rvLatest, kw)
				const dollars = dollarsPerMonth(rvLatest, kw)
				return {
					kw,
					volume: RV_KEYWORDS[kw]!.volume,
					cluster: RV_KEYWORDS[kw]!.cluster,
					clients,
					dollars,
					delta: rvPrior ? dollars - dollarsPerMonth(rvPrior, kw) : 0,
				}
			})
		: []
	const totalClients = rvRows.reduce((a, r) => a + r.clients, 0)
	const totalDollars = rvRows.reduce((a, r) => a + r.dollars, 0)
	const gained = rvRows.filter(r => r.delta > 0).reduce((a, r) => a + r.delta, 0)
	const lost = rvRows.filter(r => r.delta < 0).reduce((a, r) => a + r.delta, 0)

	// GMB weight-loss clients per listing, weekly (web + phone).
	const gmbWeeks = [...new Set([...actualWeb.map(r => r[0]), ...actualPhone.map(r => r[0])])].sort()
	const gmbListings = [...new Set(actualWeb.map(r => r[1]))].sort()
	const GMB_COLORS = ['#e8823a', '#2f855a', '#4a6fa5', '#7b5ea7', '#c05555', '#b98c2c']
	const gmbSeries = [
		...gmbListings.map((listing, i) => ({
			name: `${listing} (web)`,
			color: GMB_COLORS[i % GMB_COLORS.length]!,
			values: gmbWeeks.map(w => actualWeb.find(r => r[0] === w && r[1] === listing)?.[2] ?? 0),
		})),
		{
			name: 'GMB phone (all listings)',
			color: '#555',
			values: gmbWeeks.map(w => actualPhone.find(r => r[0] === w)?.[1] ?? 0),
		},
	]

	// Estimated vs actual weight-loss clients per week.
	const actualWlByWeek: Record<string, number> = {}
	for (const [w, , n] of actualWeb) actualWlByWeek[w] = (actualWlByWeek[w] ?? 0) + Number(n)
	for (const [w, n] of actualPhone) actualWlByWeek[w] = (actualWlByWeek[w] ?? 0) + Number(n)
	const evaWeeks = [...new Set([...rvWeeks, ...Object.keys(actualWlByWeek)])].sort()
	const estimated = evaWeeks.map(w =>
		rvWeeks.includes(w)
			? Math.round(
					(rvKeywords
						.filter(kw => RV_KEYWORDS[kw]!.category === 'Weight Loss')
						.reduce((a, kw) => a + clientsPerMonth(w, kw), 0) /
						WEEKS_PER_MONTH) * 10,
				) / 10
			: null,
	)
	const actualWl = evaWeeks.map(w => actualWlByWeek[w] ?? 0)
	const n1 = (n: number) => (Math.round(n * 10) / 10).toString()

	return (
		<ReportPage
			title="Reach, value & competitors"
			subtitle="Everything below reads the same weekly Monday capture as the map above"
		>
			<section>
				<h2>
					Competitor leaderboard <span className="mini">{keyword} · {week} · {totalPoints} grid points</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Business</th>
								<th className="num">Top-3 points</th>
								<th className="num">Coverage</th>
								<th className="num">4–10 points</th>
								<th className="num">Best</th>
								<th className="num">Rating</th>
								<th className="num">Reviews</th>
							</tr>
						</thead>
						<tbody>
							{leaderboard.map(r => (
								<tr key={r.title} style={r.is_mine ? { fontWeight: 700 } : undefined}>
									<td>
										{r.is_mine ? (
											<>{r.title} ★</>
										) : (
											<a href={viewHref(r.title)} title="View this business on the map" style={{ textDecoration: 'none' }}>
												{r.title} <span className="mini">map ↗</span>
											</a>
										)}
										{competitor === r.title ? <span className="mini"> (viewing)</span> : null}
									</td>
									<td className="num">{r.top3}</td>
									<td className="num">
										{totalPoints ? `${((100 * Number(r.top3)) / totalPoints).toFixed(1)}%` : '-'}
									</td>
									<td className="num">{r.mid}</td>
									<td className="num">{r.best}</td>
									<td className="num">{r.rating ?? '-'}</td>
									<td className="num">{r.votes ?? '-'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{competitor && competitorTrend?.length ? (
					<div style={{ marginTop: 12 }}>
						<h3 style={{ fontSize: 14 }}>
							{competitor}, share of grid points in the top 3 for "{keyword}" over time
						</h3>
						<div className="rtable-wrap">
							<table className="rtable">
								<thead><tr>{competitorTrend.map(t => <th key={t.week} className="num">{t.week.slice(5)}</th>)}</tr></thead>
								<tbody><tr>{competitorTrend.map(t => <td key={t.week} className="num">{t.pct == null ? '-' : `${t.pct}%`}</td>)}</tr></tbody>
							</table>
						</div>
					</div>
				) : null}
			</section>

			<section>
				<h2>
					Household reach, {brand} <span className="mini">{latestWeek}{priorWeek ? ` vs ${priorWeek}` : ''} · census households in top-3 cells</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Keyword</th>
								<th className="num">Households reached</th>
								<th className="num">Reach</th>
								<th className="num">vs prior week</th>
							</tr>
						</thead>
						<tbody>
							{reachLatest.map(k => (
								<tr key={k.keyword}>
									<td>{k.keyword}</td>
									<td className="num">{k.reached.toLocaleString('en-US')}</td>
									<td className="num">{k.metro ? `${((100 * k.reached) / k.metro).toFixed(1)}%` : '-'}</td>
									<td className={`num ${k.delta == null ? '' : k.delta < 0 ? 'bad' : 'good'}`}>
										{k.delta == null
											? '-'
											: `${k.delta >= 0 ? '+' : '−'}${Math.abs(k.delta).toLocaleString('en-US')}`}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{rvLatest ? (
				<section>
					<h2>
						Reach → revenue <span className="mini">search volume × rank-weighted client rate × 12-month client value · all listings combined · {rvLatest}{rvPrior ? ` vs ${rvPrior}` : ''}</span>
					</h2>
					<div className="tiles">
						<StatTile
							label="Expected from reach / mo"
							value={usd(totalDollars)}
							whisper={`${n1(totalClients)} clients per month`}
						/>
						<StatTile
							label="Δ this week"
							value={`${usd(gained)} / ${usd(lost)}`}
							whisper="run-rate gained / lost vs prior capture"
						/>
					</div>
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Keyword</th>
									<th className="num">Searches/mo</th>
									<th className="num">Clients/mo</th>
									<th className="num">Revenue/mo</th>
									<th className="num">Δ revenue</th>
									<th className="num">$/client (12 mo)</th>
								</tr>
							</thead>
							<tbody>
								{rvRows.map(r => (
									<tr key={r.kw} title={r.cluster}>
										<td>{r.kw.replace(' near me', '')}</td>
										<td className="num">{r.volume.toLocaleString()}</td>
										<td className="num">{n1(r.clients)}</td>
										<td className="num">{usd(r.dollars)}</td>
										<td className={`num ${r.delta < 0 ? 'bad' : r.delta > 0 ? 'good' : ''}`}>
											{r.delta > 0 ? '+' : ''}{usd(r.delta)}
										</td>
										<td className="num">{usd(clientValue(r.kw))}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="note">
						Hover a row for which sibling queries fold into its search volume.
						Actual bookings lag reach changes by 2-6 weeks.
					</p>
				</section>
			) : null}

			{gmbWeeks.length ? (
				<section>
					<h2>
						GMB weight-loss clients <span className="mini">weekly bookings per listing (web via utm links, phone via CallRail GMB trackers)</span>
					</h2>
					<LineChart
						labels={gmbWeeks}
						series={gmbSeries}
						height={240}
						format={n => String(Math.round(n))}
						tickEvery={2}
					/>
					<h2 style={{ marginTop: 18 }}>
						Estimated vs actual <span className="mini">weight-loss clients per week</span>
					</h2>
					<LineChart
						labels={evaWeeks}
						series={[
							{ name: 'estimated clients/wk (from reach)', color: '#4a6fa5', values: estimated },
							{ name: 'actual GMB WL bookings/wk', color: '#2f855a', values: actualWl },
						]}
						height={200}
						format={n => String(Math.round(n * 10) / 10)}
					/>
					<p className="note">
						The estimate is what this week's map-pack reach should produce at
						steady state. A persistent gap after ~6 weeks means the funnel
						assumptions (5%/3%/2% by pack rank) need tuning.
					</p>
				</section>
			) : null}
		</ReportPage>
	)
}
