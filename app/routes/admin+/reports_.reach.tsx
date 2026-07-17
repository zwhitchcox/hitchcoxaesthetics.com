/**
 * Reach over time — for each tracked keyword: how many people are inside our
 * top-3 map-pack zone (homes-weighted across the 1,222-cell metro grid) and
 * what that reach is worth per month.
 *
 * Revenue model, every factor from real data where we have it:
 *   monthly searches (Google Ads, Knoxville DMA, keyword_search_volume)
 *   × reach share (share of metro households where we rank top-3)
 *   × pack click share (assumed: of searchers who see us top-3, 15% click us)
 *   × click → new client (assumed 20%)
 *   × 6-month expected value per new client (client_value, real Boulevard cohorts)
 */
import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { LineChart, ReportPage, SERIES, StatTile, usd } from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Reach over time' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

// Knox County average household size (US Census).
const PERSONS_PER_HOUSEHOLD = 2.4
// Of searchers whose local pack shows us top-3, the share who click our listing.
const PACK_CLICK_SHARE = 0.15
// Of those clicks, the share who become a booked new client.
const CLICK_TO_CLIENT = 0.2

// Which client-value cohort each keyword's searchers convert into.
const KEYWORD_CATEGORY: Record<string, string> = {
	'med spa near me': 'ALL',
	'botox near me': 'Tox',
	'filler near me': 'Filler',
	'weight loss near me': 'Weight Loss',
	'medical weight loss near me': 'Weight Loss',
	'semaglutide near me': 'Weight Loss',
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })

	const [reach, volumes, values] = await Promise.all([
		// Homes-weighted combined reach (any of our listings top-3) per
		// keyword per capture date. homes=1 fallback keeps cells without
		// census data counted while geo_grid_homes back-fills.
		reportsQuery<{
			week: string
			keyword: string
			homes_reached: string
			total_homes: string
			reach_pct: string | null
		}>(
			`WITH pts AS (
			   SELECT week, keyword, "gridRow", "gridCol",
			     max(COALESCE(h.homes, 1)) AS homes,
			     bool_or(m.place_id IS NOT NULL AND r."rankAbsolute" <= 3) AS hit
			   FROM raw_dataforseo_region r
			   LEFT JOIN geo_my_listing m ON m.place_id = r."placeId"
			   LEFT JOIN geo_grid_homes h
			     ON h.grid_lat = round(r."gridLat"::numeric, 4) AND h.grid_lng = round(r."gridLng"::numeric, 4)
			   GROUP BY 1, 2, 3, 4)
			 SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword,
			   COALESCE(sum(homes) FILTER (WHERE hit), 0)::int AS homes_reached,
			   sum(homes)::int AS total_homes,
			   round(100.0 * COALESCE(sum(homes) FILTER (WHERE hit), 0) / nullif(sum(homes), 0), 1) AS reach_pct
			 FROM pts GROUP BY 1, 2 ORDER BY 1, 2`,
		),
		reportsQuery<{
			keyword: string
			location: string
			monthly_searches: string | null
			estimated: boolean
			fetched_at: string
		}>(`SELECT keyword, location, monthly_searches, estimated, to_char(fetched_at, 'YYYY-MM-DD') AS fetched_at FROM keyword_search_volume`),
		reportsQuery<{ category: string; expected_value: string; cohort_n: string }>(
			`SELECT category, expected_value_per_conversion AS expected_value, cohort_n
			 FROM client_value WHERE horizon_months = 6`,
		),
	])
	return json({ configured: true as const, reach, volumes, values })
}

const people = (n: number) =>
	n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))

export default function ReachReport() {
	const data = useLoaderData<typeof loader>()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { reach, volumes, values } = data

	const volumeByKw = new Map(volumes.map(v => [v.keyword, v]))
	const valueByCat = new Map(values.map(v => [v.category, Number(v.expected_value)]))
	// Chart/table the canonical keywords (the ones with volume data), in a
	// stable order; one-off experimental capture keywords stay out of the way.
	const keywords = Object.keys(KEYWORD_CATEGORY).filter(k =>
		reach.some(r => r.keyword === k),
	)
	const weeks = [...new Set(reach.map(r => r.week))].sort()
	const cell = new Map(reach.map(r => [`${r.week}|${r.keyword}`, r]))

	const peopleReached = (r: { homes_reached: string } | undefined) =>
		r ? Number(r.homes_reached) * PERSONS_PER_HOUSEHOLD : null
	const monthlyRevenue = (kw: string, r: { homes_reached: string; total_homes: string } | undefined) => {
		const vol = Number(volumeByKw.get(kw)?.monthly_searches ?? 0)
		const value = valueByCat.get(KEYWORD_CATEGORY[kw]!) ?? valueByCat.get('ALL') ?? 0
		if (!r || !vol || !value) return null
		const share = Number(r.homes_reached) / Math.max(1, Number(r.total_homes))
		return vol * share * PACK_CLICK_SHARE * CLICK_TO_CLIENT * value
	}

	const latestWeek = weeks[weeks.length - 1]
	const latest = keywords.map(kw => {
		const r = cell.get(`${latestWeek}|${kw}`)
		const vol = volumeByKw.get(kw)
		const value = valueByCat.get(KEYWORD_CATEGORY[kw]!) ?? valueByCat.get('ALL') ?? 0
		const searches = Number(vol?.monthly_searches ?? 0)
		const share = r ? Number(r.homes_reached) / Math.max(1, Number(r.total_homes)) : 0
		const clients = searches * share * PACK_CLICK_SHARE * CLICK_TO_CLIENT
		return {
			kw,
			reachPct: r?.reach_pct != null ? Number(r.reach_pct) : null,
			households: r ? Number(r.homes_reached) : null,
			people: peopleReached(r),
			searches,
			estimated: vol?.estimated ?? false,
			clients,
			value,
			revenue: clients * value,
		}
	})
	const totals = latest.reduce(
		(acc, l) => ({ clients: acc.clients + l.clients, revenue: acc.revenue + l.revenue }),
		{ clients: 0, revenue: 0 },
	)
	const maxPeople = Math.max(...latest.map(l => l.people ?? 0))

	return (
		<ReportPage
			title="Reach over time"
			subtitle={`People inside our top-3 map zone per keyword, and what that reach earns — metro grid of ${people(Number(reach[0]?.total_homes ?? 0))} households, ${volumes[0] ? `search volumes ${volumes[0].location} (${volumes[0].fetched_at})` : 'no search volumes yet'}`}
		>
			<div className="tiles">
				<StatTile
					label="People reached (best keyword)"
					value={people(maxPeople)}
					whisper={`as of ${latestWeek}`}
				/>
				<StatTile
					label="Est. new clients / month"
					value={totals.clients.toFixed(1)}
					whisper="across tracked keywords"
				/>
				<StatTile
					label="Est. revenue / month"
					value={usd(totals.revenue)}
					whisper="6-month value of those clients"
				/>
			</div>

			<section>
				<h2>
					People reached <span className="mini">households in our top-3 zone × {PERSONS_PER_HOUSEHOLD} people</span>
				</h2>
				<LineChart
					labels={weeks}
					series={keywords.map((kw, i) => ({
						name: kw.replace(' near me', ''),
						color: SERIES[i % SERIES.length]!,
						values: weeks.map(w => peopleReached(cell.get(`${w}|${kw}`))),
					}))}
					height={220}
					format={people}
				/>
			</section>

			<section>
				<h2>
					Expected revenue per month <span className="mini">searches × reach × clicks × bookings × 6-mo client value</span>
				</h2>
				<LineChart
					labels={weeks}
					series={keywords.map((kw, i) => ({
						name: kw.replace(' near me', ''),
						color: SERIES[i % SERIES.length]!,
						values: weeks.map(w => monthlyRevenue(kw, cell.get(`${w}|${kw}`))),
					}))}
					height={220}
				/>
			</section>

			<section>
				<h2>
					Latest snapshot <span className="mini">{latestWeek}</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Keyword</th>
								<th className="num">Reach</th>
								<th className="num">Households</th>
								<th className="num">People</th>
								<th className="num">Searches/mo</th>
								<th className="num">New clients/mo</th>
								<th className="num">6-mo value</th>
								<th className="num">Revenue/mo</th>
							</tr>
						</thead>
						<tbody>
							{latest.map(l => (
								<tr key={l.kw}>
									<td>{l.kw}</td>
									<td className="num">{l.reachPct != null ? `${l.reachPct}%` : '—'}</td>
									<td className="num">{l.households != null ? people(l.households) : '—'}</td>
									<td className="num">{l.people != null ? people(l.people) : '—'}</td>
									<td className="num">
										{l.searches || '—'}
										{l.estimated ? '*' : ''}
									</td>
									<td className="num">{l.clients.toFixed(1)}</td>
									<td className="num">{usd(l.value)}</td>
									<td className={`num ${l.revenue > 0 ? 'good' : ''}`}>{usd(l.revenue)}</td>
								</tr>
							))}
							<tr>
								<td>
									<strong>Total</strong>
								</td>
								<td className="num" />
								<td className="num" />
								<td className="num" />
								<td className="num" />
								<td className="num">
									<strong>{totals.clients.toFixed(1)}</strong>
								</td>
								<td className="num" />
								<td className="num">
									<strong>{usd(totals.revenue)}</strong>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p className="note">
					Reach = share of metro households (weighted by census homes per grid cell) where at
					least one of our listings ranks top-3. Searches/mo = Google Ads volume for the
					Knoxville DMA; * = Google hides volume for drug terms, estimated from Google Trends
					(botox gets 2.19× med spa's searches). New clients/mo = searches × reach ×{' '}
					{Math.round(PACK_CLICK_SHARE * 100)}% pack click share ×{' '}
					{Math.round(CLICK_TO_CLIENT * 100)}% click-to-booking. 6-mo value = expected revenue
					per new client from our own Boulevard cohorts (client_value). These six terms are
					proxies — total demand across all related searches ("botox knoxville", "lip filler",
					…) is several times larger, so treat revenue as a floor that scales with reach.
				</p>
			</section>
		</ReportPage>
	)
}
