/**
 * Rankings: where our sites show up on Google for the searches we
 * track, week by week. Two views, chosen with ?view=:
 *
 *   map (default)  the map pack: the share of metro homes that see one of
 *                  our listings in the top 3 (homes-weighted across the
 *                  1,222-cell grid), what that reach earns, and who else
 *                  holds the pack for each search (?kw=).
 *   organic        the blue links under the map: our rank for each tracked
 *                  search, its history, and who beats us most often
 *                  (?site=sha|bk|kwlc|klc filters to one site).
 *
 * Backlinks (authority, linking sites, new and lost links, crawl status,
 * competitors' authority) live on /admin/reports/links.
 *
 * Revenue model, every factor from real data where we have it:
 *   monthly searches (Google Ads, Knoxville DMA, keyword_search_volume)
 *   × reach share (share of metro households where we rank top-3)
 *   × search → new client (PACK_VIEW_TO_CLIENT, measured on our own listings)
 *   × 6-month expected value per new client (client_value, real Boulevard cohorts)
 *
 * Organic value of #1 (the organic view's "What #1 is worth, by service"):
 *   every search for the service in the Knoxville market (service_search_volume)
 *   × click share of the first blue link (ORGANIC_CTR × SEARCH_CONSOLE_SCALE)
 *   × visit → new client for searches of the service (SEARCH_VISIT_TO_CLIENT)
 *   × phone bookings on top (PHONE_FACTOR)
 *   × 6-month expected value per new client for the service
 */
import {
	json,
	type LoaderFunctionArgs,
	type MetaFunction,
	type SerializeFrom,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import {
	Choice,
	LineChart,
	RankSparkline,
	ReportPage,
	revalidateUnlessOnly,
	SERIES,
	StatTile,
	usd,
	useChoice,
	usePersistedSearch,
	useSortable,
} from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	OUR_SITES,
	SITE_CHOICES,
	SITE_CHOICE_VALUES,
} from '#app/utils/report-sites.ts'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Rankings' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

/** Organic ranks past this are functionally "not ranking"; charts stop here. */
const RANK_FLOOR = 50

/**
 * A weekly capture reads about 95 results per search; the shortest normal
 * one read 75. One that read fewer than this was cut short, so "not found"
 * in it means "not checked": the 2026-09-21 capture read 13 to 59, and past
 * the first page it held national pages, not Knoxville ones.
 */
const SHORT_CAPTURE = 70

type SerpRankRow = {
	week: string
	keyword: string
	target: string | null
	rank_group: number | null
	my_domain: string | null
	my_url: string | null
	top_domain: string | null
	// From the week of 2026-10-19, every search is read from five points; rank_group
	// is the middle reading. Older weeks have one point.
	best_rank: number | null
	worst_rank: number | null
	points: number | null
	points_found: number | null
}

// Knox County average household size (US Census).
const PERSONS_PER_HOUSEHOLD = 2.4
// Of the times Google shows our listing, the share that become a new client
// who books online from the listing's link: 29 of 12,626 views of the SHA
// Bearden and Farragut listings, 2026-07-22 to 2026-10-19 (Business Profile
// views; PostHog bookings from utm_campaign=gmb visits). It replaced an
// assumed 15% click x 20% book (3%), which ran about 13 times too high. Calls
// from the listing are not counted, so this is a floor.
const PACK_VIEW_TO_CLIENT = 0.0023
// Organic: the share of searchers who click the blue link at ranks 1 to 10
// (published click curves). Past #10 we count no clicks.
const ORGANIC_CTR = [
	0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018,
]
// The published curve is for all searches. On ours the map box and the ads
// sit above the blue links and take most clicks: Search Console shows 4.0% of
// searchers click us where we rank in the top 3 on non-brand searches (25 clicks
// from 624 times shown, 2026-07-20 to 2026-10-18). Scale the curve so ranks 1
// to 3 average that, which puts #1 near 6%. The assumed 0.7 before this made
// #1 for weight loss worth more new clients than all our weight-loss sources
// bring today. Those Search Console readings are small (about 2 views per
// search, some from rank checkers), but the same searches agree: our top ad
// got 6.6% clicks (Semaglutide ad group, 43 of 651, 2026-07-22 to 2026-10-20),
// and our #1 weight-loss map listings got a click, call or directions from
// 6.6% of views (805 of 12,258, Business Profile, 2026-07-22 to 2026-10-19).
// Every search in the market counts: those listings are seen 4,086 times a
// month, more than the 2,690 weight-loss searches, so local searchers see a
// #1. Counting "near me" searches at the 15% where our #10 blue link shows
// (c8f3d49) cut #1 too far.
const SEARCH_CONSOLE_SCALE = 0.04 / ((0.28 + 0.15 + 0.1) / 3)
// Of visitors who searched for the service itself, the share who book online
// as a new client in the same visit. Measured on our Google Ads clicks, which
// came from those searches: 30 of 999 visits, PostHog, 2026-07-22 to
// 2026-10-20. Today's blue-link visitors book at 1.1% (10 of 909): most come
// from our name, job and page-2 searches, not from a top rank for a service.
const SEARCH_VISIT_TO_CLIENT = 0.03
// New clients who book by phone, on top of those who book online: 12 booked by
// staff to 74 online, Boulevard, 2026-07-22 to 2026-10-20.
const PHONE_FACTOR = 86 / 74

// Which client-value cohort each keyword's searchers convert into.
const KEYWORD_CATEGORY: Record<string, string> = {
	'med spa near me': 'ALL',
	'botox near me': 'Tox',
	'filler near me': 'Filler',
	'weight loss near me': 'Weight Loss',
	'medical weight loss near me': 'Weight Loss',
	'semaglutide near me': 'Weight Loss',
}

// Which client-value cohort each service's searchers convert into.
const SERVICE_CATEGORY: Record<string, string> = {
	'weight loss': 'Weight Loss',
	botox: 'Tox',
	'laser hair removal': 'Laser Hair',
	filler: 'Filler',
	'med spa': 'ALL',
	skin: 'Laser & Skin',
}

/**
 * The client-value cohort a search's searchers convert into, with the
 * service groups of sha-reports src/client-value.ts.
 */
function searchCategory(kw: string) {
	if (/weight loss|semaglutide|tirzepatide|glp-1/.test(kw)) return 'Weight Loss'
	if (/laser hair/.test(kw)) return 'Laser Hair'
	if (/botox|dysport|jeuveau|lip flip/.test(kw)) return 'Tox'
	if (/filler|skinvive/.test(kw)) return 'Filler'
	if (
		/laser|microneedling|tightening|everesse|photofacial|vein|sun spot|prp/.test(
			kw,
		)
	)
		return 'Laser & Skin'
	return 'ALL'
}

// Stale-while-revalidate for the two map-pack views (report_reach_weekly and
// mv_pack_rivals): serve them as-is and rebuild both in the background at most
// once per 12 hours. The sha-reports worker rebuilds them after each weekly
// capture; this is the fallback when it does not. No request ever waits the
// ~25s the rebuild takes. Stamp only after both are rebuilt, so a stamp never
// hides a stale view.
let reachRefreshInFlight = false
function maybeRefreshReachView() {
	if (reachRefreshInFlight) return
	reachRefreshInFlight = true
	void (async () => {
		try {
			const stale = await reportsQuery<{ id: number }>(
				`SELECT id FROM report_reach_meta
				 WHERE id = 1 AND refreshed_at < now() - interval '12 hours'`,
			)
			if (stale.length) {
				await reportsQuery(
					'REFRESH MATERIALIZED VIEW CONCURRENTLY report_reach_weekly',
				)
				await reportsQuery('REFRESH MATERIALIZED VIEW mv_pack_rivals')
				await reportsQuery(
					'UPDATE report_reach_meta SET refreshed_at = now() WHERE id = 1',
				)
			}
		} catch (error) {
			console.error('[reach] view refresh failed:', error)
		} finally {
			reachRefreshInFlight = false
		}
	})()
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })
	maybeRefreshReachView()

	const [
		reach,
		volumes,
		values,
		serpRanks,
		serpDepth,
		serpRivals,
		packRivals,
		services,
	] = await Promise.all([
		// Homes-weighted combined reach (any of our listings top-3) per
		// keyword per capture date, read from the report_reach_weekly
		// materialized view. The underlying aggregate scans every grid
		// capture and took 18s live (measured 2026-08-03); the view reads in
		// ~80ms and maybeRefreshReachView() above re-aggregates it in the
		// background when captures land.
		reportsQuery<{
			week: string
			keyword: string
			homes_reached: string
			total_homes: string
			reach_pct: string | null
		}>(
			`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword,
			   homes_reached, total_homes, reach_pct
			 FROM report_reach_weekly ORDER BY 1, 2`,
		),
		reportsQuery<{
			keyword: string
			location: string
			monthly_searches: string | null
			estimated: boolean
			fetched_at: string
		}>(
			`SELECT keyword, location, monthly_searches, estimated, to_char(fetched_at, 'YYYY-MM-DD') AS fetched_at FROM keyword_search_volume`,
		),
		reportsQuery<{
			category: string
			expected_value: string
			cohort_n: string
		}>(
			`SELECT category, expected_value_per_conversion AS expected_value, cohort_n
			 FROM client_value WHERE horizon_months = 6`,
		),
		// Organic ("blue link") Google rank per keyword per week, from
		// sha-reports src/serp.ts, read from five points around Knoxville.
		reportsQuery<SerpRankRow>(
			`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword, target,
			   rank_group, my_domain, my_url, top_domain,
			   best_rank, worst_rank, points, points_found
			 FROM report_serp_rank ORDER BY week, keyword`,
		),
		// How many results each weekly capture read (the middle of its points),
		// so a capture that was cut short reads as "not checked", not "not in
		// the top 100".
		reportsQuery<{ week: string; keyword: string; depth: number }>(
			`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword,
			   percentile_disc(0.5) WITHIN GROUP (ORDER BY n)::int AS depth
			 FROM (SELECT week, keyword, point, count(*) AS n
			       FROM raw_serp_organic GROUP BY 1, 2, 3) per_point
			 GROUP BY 1, 2`,
		),
		// Who else keeps landing in the organic top 10 this week.
		reportsQuery<{
			domain: string
			keywords: number
			best: number
			avg_rank: string
		}>(
			`WITH latest AS (SELECT max(week) AS week FROM raw_serp_organic)
			 SELECT domain, count(DISTINCT keyword)::int AS keywords,
			   min(rank_group)::int AS best, round(avg(rank_group), 1) AS avg_rank
			 FROM raw_serp_organic, latest
			 WHERE raw_serp_organic.week = latest.week
			   AND rank_group <= 10 AND domain <> ''
			 GROUP BY domain ORDER BY keywords DESC, avg_rank ASC LIMIT 15`,
		),
		// Map-pack rivals per keyword (latest capture), from mv_pack_rivals —
		// the live five-CTE aggregate cost ~1.6s per view; the worker refreshes
		// the MV post-capture and maybeRefreshReachView() above is the
		// fallback. Listings sharing a domain count as one business, except
		// ours: each of our offices has its own row.
		reportsQuery<{
			week: string
			keyword: string
			title: string
			domain: string | null
			is_mine: boolean
			avg_rank: string
			rating: string | null
			reviews: string | null
			homes_reached: string
			total_homes: string
			reach_pct: string | null
		}>(
			`WITH ranked AS (
			   SELECT *, row_number() OVER (
			     PARTITION BY keyword ORDER BY homes_reached DESC) AS rn
			   FROM mv_pack_rivals WHERE homes_reached > 0)
			 SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword, title, domain,
			   is_mine, avg_rank, rating, reviews, homes_reached, total_homes,
			   reach_pct
			 FROM ranked WHERE rn <= 10 OR is_mine
			 ORDER BY keyword, homes_reached DESC`,
		),
		// Every search for each service in the Knoxville market (all variants).
		reportsQuery<{
			service: string
			monthly_searches: string
			estimated: boolean
			main_search: string
		}>(
			`SELECT service, monthly_searches, estimated, main_search
			 FROM service_search_volume ORDER BY monthly_searches DESC`,
		),
	])
	return json({
		configured: true as const,
		reach,
		volumes,
		values,
		serpRanks,
		serpDepth,
		serpRivals,
		packRivals,
		services,
	})
}

// Switching views, sites or keywords only re-renders; the data stays.
export const shouldRevalidate = revalidateUnlessOnly([
	'view',
	'site',
	'kw',
	'metric',
])

type Data = Extract<SerializeFrom<typeof loader>, { configured: true }>

const people = (n: number) =>
	n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))

const site = (d: string | null) => (d ?? '').replace(/^www\./, '')

const VIEWS = [
	{ value: 'map', label: 'Map pack' },
	{ value: 'organic', label: 'Organic results' },
] as const

export default function RankingsReport() {
	usePersistedSearch()
	const data = useLoaderData<typeof loader>()
	const [view, setView] = useChoice('view', ['map', 'organic'] as const, 'map')
	if (!data.configured)
		return (
			<p style={{ padding: 32 }}>
				Reports database is not configured (REPORTS_DATABASE_URL).
			</p>
		)

	return (
		<ReportPage
			title="Rankings"
			subtitle="Where our sites show up on Google for the searches we track, week by week. Backlinks are on the Backlinks page."
		>
			<div className="choices">
				<Choice
					label="Which Google results"
					value={view}
					options={VIEWS}
					onChange={setView}
				/>
			</div>
			{view === 'map' ? (
				<MapPackView data={data} />
			) : (
				<OrganicView data={data} />
			)}
		</ReportPage>
	)
}

/* ------------------------------------------------------------------------ */
/* Map pack                                                                 */
/* ------------------------------------------------------------------------ */

function MapPackView({ data }: { data: Data }) {
	const { reach, volumes, values, packRivals } = data
	const [metric, setMetric] = useChoice(
		'metric',
		['people', 'revenue'] as const,
		'people',
	)

	const volumeByKw = new Map(volumes.map(v => [v.keyword, v]))
	const valueByCat = new Map(
		values.map(v => [v.category, Number(v.expected_value)]),
	)
	// The canonical keywords (the ones with volume data), in a stable order;
	// one-off experimental capture keywords stay out of the way.
	const keywords = Object.keys(KEYWORD_CATEGORY).filter(k =>
		reach.some(r => r.keyword === k),
	)
	const weeks = [...new Set(reach.map(r => r.week))].sort()
	const cell = new Map(reach.map(r => [`${r.week}|${r.keyword}`, r]))
	const latestWeek = weeks[weeks.length - 1]
	const priorWeek = weeks[weeks.length - 2]

	const peopleReached = (r: { homes_reached: string } | undefined) =>
		r ? Number(r.homes_reached) * PERSONS_PER_HOUSEHOLD : null
	const valueFor = (kw: string) =>
		valueByCat.get(KEYWORD_CATEGORY[kw]!) ?? valueByCat.get('ALL') ?? 0
	const monthlyRevenue = (
		kw: string,
		r: { homes_reached: string; total_homes: string } | undefined,
	) => {
		const vol = Number(volumeByKw.get(kw)?.monthly_searches ?? 0)
		const value = valueFor(kw)
		if (!r || !vol || !value) return null
		const share = Number(r.homes_reached) / Math.max(1, Number(r.total_homes))
		return vol * share * PACK_VIEW_TO_CLIENT * value
	}

	const latest = keywords.map(kw => {
		const r = cell.get(`${latestWeek}|${kw}`)
		const prev = priorWeek ? cell.get(`${priorWeek}|${kw}`) : undefined
		const vol = volumeByKw.get(kw)
		const value = valueFor(kw)
		const searches = Number(vol?.monthly_searches ?? 0)
		const share = r
			? Number(r.homes_reached) / Math.max(1, Number(r.total_homes))
			: 0
		const clients = searches * share * PACK_VIEW_TO_CLIENT
		const reachPct = r?.reach_pct != null ? Number(r.reach_pct) : null
		const prevPct = prev?.reach_pct != null ? Number(prev.reach_pct) : null
		return {
			kw,
			reachPct,
			change: reachPct != null && prevPct != null ? reachPct - prevPct : null,
			people: peopleReached(r),
			searches,
			estimated: vol?.estimated ?? false,
			clients,
			value,
			revenue: clients * value,
		}
	})
	const totals = latest.reduce(
		(acc, l) => ({
			clients: acc.clients + l.clients,
			revenue: acc.revenue + l.revenue,
		}),
		{ clients: 0, revenue: 0 },
	)
	const best = [...latest].sort(
		(a, b) => (b.reachPct ?? -1) - (a.reachPct ?? -1),
	)[0]
	const totalHomes = Number(reach[0]?.total_homes ?? 0)

	return (
		<>
			<p className="lede">
				The map box at the top of Google shows three businesses. We check who is
				in it from 1,222 points across the Knoxville metro, and weight each
				point by the homes around it. Reach is the share of the metro's{' '}
				{people(totalHomes)} homes where one of our listings is in the box.
			</p>
			<div className="tiles">
				<StatTile
					label="Best reach"
					value={best?.reachPct != null ? `${best.reachPct}%` : '-'}
					whisper={
						best ? `${best.kw}, ${people(best.people ?? 0)} people` : undefined
					}
				/>
				<StatTile
					label="New clients a month"
					value={totals.clients.toFixed(1)}
					whisper="estimate, all six searches"
				/>
				<StatTile
					label="Revenue a month"
					value={usd(totals.revenue)}
					whisper="estimate, 6-month value of those clients"
				/>
			</div>

			<section>
				<h2>
					Reach by search{' '}
					<span className="mini">
						capture of {latestWeek}, change against{' '}
						{priorWeek ?? 'the one before'}
					</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Search</th>
								<th className="num">Homes reached</th>
								<th className="num">Change</th>
								<th className="num">People</th>
								<th className="num">Searches a month</th>
								<th className="num">New clients a month</th>
								<th className="num">Revenue a month</th>
							</tr>
						</thead>
						<tbody>
							{latest.map(l => (
								<tr key={l.kw}>
									<td>{l.kw}</td>
									<td className="num">
										{l.reachPct != null ? `${l.reachPct}%` : '-'}
									</td>
									<td
										className={`num ${l.change ? (l.change > 0 ? 'good' : 'bad') : ''}`}
									>
										{l.change == null
											? '-'
											: l.change === 0
												? '='
												: `${l.change > 0 ? '+' : '−'}${Math.abs(l.change).toFixed(1)} pts`}
									</td>
									<td className="num">
										{l.people != null ? people(l.people) : '-'}
									</td>
									<td className="num">
										{l.searches || '-'}
										{l.estimated ? '*' : ''}
									</td>
									<td className="num">{l.clients.toFixed(1)}</td>
									<td className={`num ${l.revenue > 0 ? 'good' : ''}`}>
										{usd(l.revenue)}
									</td>
								</tr>
							))}
							<tr>
								<td colSpan={5} style={{ fontWeight: 600 }}>
									Total
								</td>
								<td className="num">
									<strong>{totals.clients.toFixed(1)}</strong>
								</td>
								<td className="num">
									<strong>{usd(totals.revenue)}</strong>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<details className="how">
					<summary>How these numbers are worked out</summary>
					<p>
						Homes reached: the share of metro homes (weighted by census homes
						per grid point) where at least one of our listings is in the top 3
						of the map box. People = homes × {PERSONS_PER_HOUSEHOLD}.
					</p>
					<p>
						Searches a month: Google Ads volume for the Knoxville market. * =
						Google hides the volume for drug terms, so it is estimated from
						Google Trends (botox gets 2.19× the searches of med spa).
					</p>
					<p>
						New clients a month = searches × homes reached ×{' '}
						{Math.round(PACK_VIEW_TO_CLIENT * 10000) / 100}%, the share of the
						times Google showed our listing that became a new client booking
						online (measured on our Bearden and Farragut listings, 2026-07-22 to
						2026-10-19). Calls from the listing are not counted, so this is a
						floor. Revenue = new clients × the 6-month value of a new client in
						that service, from our own Boulevard history.
					</p>
					<p>
						These six searches stand in for the whole market. All the related
						searches together ("botox knoxville", "lip filler" and more) are
						several times bigger, so read the revenue as a floor that grows with
						reach.
					</p>
				</details>
			</section>

			<section>
				<h2>
					Over time <span className="mini">one line per search</span>
				</h2>
				<div className="choices">
					<Choice
						label="Measure"
						small
						value={metric}
						onChange={setMetric}
						options={[
							{ value: 'people', label: 'People reached' },
							{ value: 'revenue', label: 'Revenue a month' },
						]}
					/>
				</div>
				<LineChart
					labels={weeks}
					series={keywords.map((kw, i) => ({
						name: kw.replace(' near me', ''),
						color: SERIES[i % SERIES.length]!,
						values: weeks.map(w =>
							metric === 'people'
								? peopleReached(cell.get(`${w}|${kw}`))
								: monthlyRevenue(kw, cell.get(`${w}|${kw}`)),
						),
					}))}
					height={230}
					format={metric === 'people' ? people : n => usd(n)}
				/>
			</section>

			<PackRivals rows={packRivals} />
		</>
	)
}

/**
 * Who else is in the map box for one search at a time: every business with
 * top-3 presence in the latest grid capture, homes-weighted with the same
 * math as our own reach. Our rows, one per office, are highlighted.
 */
function PackRivals({ rows }: { rows: Data['packRivals'] }) {
	const keywords = [...new Set(rows.map(r => r.keyword))]
	const [kw, setKw] = useChoice('kw', keywords, keywords[0] ?? '')
	if (!rows.length) return null
	const shown = rows.filter(r => r.keyword === kw)
	const ours = shown.filter(r => r.is_mine)
	return (
		<section>
			<h2>
				Who else is in the map box{' '}
				<span className="mini">
					capture of {rows[0]!.week}, one search at a time
				</span>
			</h2>
			<div className="choices">
				<Choice
					label="Search"
					variant="pills"
					value={kw}
					onChange={setKw}
					options={keywords.map(k => ({ value: k, label: k }))}
				/>
			</div>
			<div className="rtable-wrap">
				<table className="rtable">
					<thead>
						<tr>
							<th>Business</th>
							<th>Website</th>
							<th className="num">Homes reached</th>
							<th className="num">Average position</th>
							<th className="num">Rating</th>
							<th className="num">Reviews</th>
						</tr>
					</thead>
					<tbody>
						{shown.map(r => (
							<tr
								key={`${kw}|${r.title}`}
								className={r.is_mine ? 'ours' : undefined}
							>
								<td>
									{r.title}
									{r.is_mine ? <strong> (us)</strong> : null}
								</td>
								<td className="mini">{site(r.domain)}</td>
								<td className="num">
									{r.reach_pct != null ? `${r.reach_pct}%` : '-'}
								</td>
								<td className="num">{r.avg_rank}</td>
								<td className="num">{r.rating ?? '-'}</td>
								<td className="num">{r.reviews ?? '-'}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="note">
				{ours.length
					? null
					: 'None of our listings is in the top 10 for this search. '}
				Homes reached = the share of metro homes where the business is in the
				top 3 of the map box. Average position is across the grid points where
				it shows at all. Listings on one website count as one business, except
				ours: each of our offices has its own row.
			</p>
		</section>
	)
}

/* ------------------------------------------------------------------------ */
/* Organic results                                                          */
/* ------------------------------------------------------------------------ */

type Reading = { week: string; rank: number | null; checked: boolean }

function OrganicView({ data }: { data: Data }) {
	const {
		serpRanks: ranks,
		serpDepth,
		serpRivals: rivals,
		volumes,
		values,
		services,
	} = data
	const [siteKey, setSite] = useChoice('site', SITE_CHOICE_VALUES, 'all')
	if (!ranks.length)
		return (
			<p className="note">
				No organic captures yet. The rank tracker captures every Monday.
			</p>
		)

	const weeks = [...new Set(ranks.map(r => r.week))].sort()
	const latestWeek = weeks[weeks.length - 1]!
	const cell = new Map(ranks.map(r => [`${r.week}|${r.keyword}`, r]))
	const volumeByKw = new Map(volumes.map(v => [v.keyword, v]))
	const valueByCat = new Map(
		values.map(v => [v.category, Number(v.expected_value)]),
	)
	const depth = new Map(serpDepth.map(d => [`${d.week}|${d.keyword}`, d.depth]))
	// One reading per week: the rank, "not found" (checked far enough), or
	// "not checked" (the capture was cut short and we were not in what it read).
	const readingAt = (week: string, kw: string): Reading => {
		const row = cell.get(`${week}|${kw}`)
		const rank = row?.rank_group != null ? Number(row.rank_group) : null
		const read = depth.get(`${week}|${kw}`) ?? 0
		return { week, rank, checked: rank != null || read >= SHORT_CAPTURE }
	}

	const targets = OUR_SITES.filter(s => siteKey === 'all' || s.key === siteKey)
	const latestRows = ranks.filter(r => r.week === latestWeek)
	const groups = targets
		.map(s => ({
			site: s,
			keywords: latestRows
				.filter(r => (r.target ?? OUR_SITES[0].rankTarget) === s.rankTarget)
				.map(r => r.keyword)
				.sort(
					(a, b) =>
						sortRank(readingAt(latestWeek, a)) -
						sortRank(readingAt(latestWeek, b)),
				),
		}))
		.filter(g => g.keywords.length)

	// New clients a month from a rank on some searches: the first blue link's
	// click share less the map box, the booking rate of people who searched
	// for the service, and phone bookings on top.
	const clientsAt = (searches: number, rank: number | null) =>
		searches *
		(rank ? (ORGANIC_CTR[rank - 1] ?? 0) : 0) *
		SEARCH_CONSOLE_SCALE *
		SEARCH_VISIT_TO_CLIENT *
		PHONE_FACTOR
	// What a new client spends in their first 6 months, by service.
	const perClient = (category: string) =>
		valueByCat.get(category) ?? valueByCat.get('ALL') ?? 0

	const rows: SearchRow[] = groups.flatMap(g =>
		g.keywords.map(kw => {
			const history = weeks.map(w => readingAt(w, kw))
			const now = history[history.length - 1]!
			const earlier =
				history
					.slice(0, -1)
					.reverse()
					.find(r => r.checked) ?? null
			const lastRank = [...history].reverse().find(r => r.rank != null) ?? null
			const vol = volumeByKw.get(kw)
			const searches =
				vol?.monthly_searches != null ? Number(vol.monthly_searches) : null
			return {
				kw,
				searches,
				estimated: vol?.estimated ?? false,
				worth:
					searches != null
						? clientsAt(searches, 1) * perClient(searchCategory(kw))
						: null,
				site: g.site,
				history,
				now,
				earlier,
				lastRank,
				row: cell.get(`${latestWeek}|${kw}`),
				read: depth.get(`${latestWeek}|${kw}`) ?? 0,
			}
		}),
	)
	const total = rows.length
	const firsts = rows.filter(r => r.now.rank === 1).length
	const top10 = rows.filter(r => r.now.rank != null && r.now.rank <= 10).length
	const cutShort = rows.filter(r => !r.now.checked).length
	// Our rank on a search this week; a cut-short week uses the last known rank.
	const rankOf = (kw: string) => {
		const now = readingAt(latestWeek, kw)
		if (now.checked) return now.rank
		const known = weeks.map(w => readingAt(w, kw)).filter(r => r.rank != null)
		return known.at(-1)?.rank ?? null
	}
	// What #1 brings for each service, on all its searches.
	const serviceRows = services.map(s => {
		const searches = Number(s.monthly_searches)
		const value = perClient(SERVICE_CATEGORY[s.service] ?? 'ALL')
		const rank = rankOf(s.main_search)
		return {
			...s,
			searches,
			perClient: value,
			rank,
			clientsFirst: clientsAt(searches, 1),
			worthFirst: clientsAt(searches, 1) * value,
			worthNow: clientsAt(searches, rank) * value,
		}
	})
	const totalGain = serviceRows.reduce(
		(sum, s) => sum + s.worthFirst - s.worthNow,
		0,
	)

	// Plot FLOOR+1-rank so better ranks sit higher; labels translate back.
	const plot = (r: Reading) =>
		r.rank == null
			? null
			: Math.max(1, RANK_FLOOR + 1 - Math.min(r.rank, RANK_FLOOR))
	const asRank = (v: number) => `#${Math.round(RANK_FLOOR + 1 - v)}`
	const oneSite = siteKey !== 'all' ? groups[0] : null

	return (
		<>
			<p className="lede">
				The blue links under the map box, checked every Monday from five points
				around Knoxville; the rank is the middle reading. Each search belongs to
				the site we want to win it; when another of our sites ranks higher, that
				page is shown instead.
			</p>
			<div className="choices">
				<Choice
					label="Site"
					variant="pills"
					value={siteKey}
					onChange={setSite}
					options={SITE_CHOICES}
				/>
			</div>
			<div className="tiles">
				<StatTile
					label="#1 spots"
					value={String(firsts)}
					whisper={`of ${total} searches, ${latestWeek}`}
				/>
				<StatTile
					label="In the top 10"
					value={`${top10} of ${total}`}
					whisper="first page of Google"
				/>
				<StatTile
					label="Read in full"
					value={`${total - cutShort} of ${total}`}
					whisper={
						cutShort
							? `${cutShort} cut short this week; their last full reading is shown`
							: 'every search read about 100 results deep'
					}
					tone={cutShort ? 'bad' : undefined}
				/>
				<StatTile
					label="#1 for every service adds"
					value={`${usd(totalGain)} a month`}
					whisper="estimated revenue over our ranks today; see What #1 is worth"
				/>
			</div>

			{serviceRows.length ? (
				<section>
					<h2>
						What #1 is worth, by service{' '}
						<span className="mini">
							every way people search for it in the Knoxville market
						</span>
					</h2>
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Service</th>
									<th className="num">Searches a month</th>
									<th>Main search</th>
									<th className="num">Our rank</th>
									<th className="num">New clients a month at #1</th>
									<th className="num">#1 is worth a month</th>
									<th className="num">Per new client</th>
								</tr>
							</thead>
							<tbody>
								{serviceRows.map(s => (
									<tr key={s.service}>
										<td>{s.service}</td>
										<td className="num">
											{s.searches.toLocaleString()}
											{s.estimated ? '*' : ''}
										</td>
										<td className="mini">{s.main_search}</td>
										<td className="num">
											{s.rank != null ? `#${s.rank}` : '-'}
										</td>
										<td className="num">{s.clientsFirst.toFixed(1)}</td>
										<td className="num">
											{usd(s.worthFirst)}
											{s.worthNow > 0 ? (
												<span className="sub-line">
													+{usd(s.worthFirst - s.worthNow)} over now
												</span>
											) : null}
										</td>
										<td className="num">{usd(s.perClient)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<details className="how">
						<summary>How to read this</summary>
						<p>
							Searches a month: every search in the Knoxville market that names
							the service with a place or a buying word ("laser hair removal
							near me", "lip filler cost"), from Google Ads keyword ideas.
							Variants that Google counts as one are counted once, and searches
							for a competitor's name are left out. * = Google hides most Botox
							numbers, so this adds "botox knoxville tn", our estimate for
							"botox near me" and the price searches.
						</p>
						<p>
							#1 is worth a month = searches ×{' '}
							{Math.round(ORGANIC_CTR[0]! * SEARCH_CONSOLE_SCALE * 1000) / 10}%
							who click the first blue link ×{' '}
							{Math.round(SEARCH_VISIT_TO_CLIENT * 100)}% who book as a new
							client × {PHONE_FACTOR.toFixed(2)} for phone bookings × what a new
							client spends in their first 6 months (Per new client, from our
							Boulevard data). The {Math.round(SEARCH_VISIT_TO_CLIENT * 100)}%
							is measured on our Google Ads visitors, who came from these same
							searches. "Over now" uses our rank today on the main search; past
							#10 we count no clicks.
						</p>
						<p>
							The click share: on these searches the ads and the map box sit
							above the blue links. Our top ad gets 6.6% of searchers to click,
							and our #1 weight-loss map listing gets a click, call or
							directions from 6.6% of the people who see it. Search Console
							shows about 4% on our own top-3 blue links. The published curve
							(28% for #1) is scaled to that, so #1 gets{' '}
							{Math.round(ORGANIC_CTR[0]! * SEARCH_CONSOLE_SCALE * 1000) / 10}%.
						</p>
					</details>
				</section>
			) : null}

			<RankBySearch
				rows={rows}
				showSite={siteKey === 'all'}
				weekCount={weeks.length}
				latestWeek={latestWeek}
			/>

			{oneSite ? (
				<section>
					<h2>
						{oneSite.site.label} over time{' '}
						<span className="mini">
							higher is better; a gap means not found or not checked
						</span>
					</h2>
					<LineChart
						labels={weeks}
						series={oneSite.keywords.map((kw, i) => ({
							name: kw,
							color: SERIES[i % SERIES.length]!,
							values: weeks.map(w => plot(readingAt(w, kw))),
						}))}
						height={230}
						yMax={RANK_FLOOR}
						format={asRank}
					/>
				</section>
			) : (
				<p className="note">
					Pick one site above to see its searches on one chart.
				</p>
			)}

			<section>
				<h2>
					Who beats us most often{' '}
					<span className="mini">
						sites in the top 10 across our searches, {latestWeek}
					</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Website</th>
								<th className="num">Searches where it is in the top 10</th>
								<th className="num">Best rank</th>
								<th className="num">Average rank</th>
							</tr>
						</thead>
						<tbody>
							{rivals.map(r => {
								const ours = OUR_SITES.some(s => s.site === site(r.domain))
								return (
									<tr key={r.domain} className={ours ? 'ours' : undefined}>
										<td>
											{site(r.domain)} {ours ? <strong>(us)</strong> : null}
										</td>
										<td className="num">{r.keywords}</td>
										<td className="num">#{r.best}</td>
										<td className="num">{r.avg_rank}</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
				<p className="note">
					A site high on this list beats us across many searches, not on one.
					That usually points to more content or more backlinks, not a fix to
					one page.
					{cutShort
						? ' This week’s list is incomplete because some captures were cut short.'
						: ''}
				</p>
			</section>
		</>
	)
}

type SearchRow = {
	kw: string
	searches: number | null
	estimated: boolean
	/** What #1 on this search is worth a month; null when Google gives no number. */
	worth: number | null
	site: (typeof OUR_SITES)[number]
	history: Reading[]
	now: Reading
	earlier: Reading | null
	lastRank: Reading | null
	row: SerpRankRow | undefined
	read: number
}

// What each column of the Rank by search table sorts on. Rank is negated, so
// the first click (largest first) puts #1 on top.
const ROW_SORT = {
	search: (r: SearchRow) => r.kw,
	site: (r: SearchRow) => r.site.label,
	searches: (r: SearchRow) => r.searches,
	worth: (r: SearchRow) => r.worth,
	rank: (r: SearchRow) => -sortRank(r.now),
	change: (r: SearchRow) => changeLabel(r.now, r.earlier).value,
	page: (r: SearchRow) => r.row?.my_url ?? null,
	top: (r: SearchRow) => site(r.row?.top_domain ?? null) || null,
}

/**
 * Rank by search: every tracked search, the most valuable first. Every
 * column sorts.
 */
function RankBySearch({
	rows,
	showSite,
	weekCount,
	latestWeek,
}: {
	rows: SearchRow[]
	showSite: boolean
	weekCount: number
	latestWeek: string
}) {
	const { rows: sorted, Th } = useSortable(rows, ROW_SORT, {
		key: 'worth',
		dir: -1,
	})
	return (
		<section>
			<h2>
				Rank by search{' '}
				<span className="mini">
					capture of {latestWeek}; change against the last full reading; click a
					column title to sort
				</span>
			</h2>
			<div className="rtable-wrap">
				<table className="rtable">
					<thead>
						<tr>
							<Th k="search">Search</Th>
							{showSite ? <Th k="site">Site we want to win</Th> : null}
							<Th k="searches" num>
								Searches a month
							</Th>
							<Th k="worth" num>
								#1 is worth a month
							</Th>
							<Th k="rank" num>
								Rank
							</Th>
							<Th k="change" num>
								Change
							</Th>
							<th>Last {weekCount} weeks</th>
							<Th k="page">Our page that ranks</Th>
							<Th k="top">Who is #1</Th>
						</tr>
					</thead>
					<tbody>
						{sorted.map(r => (
							<SearchTr key={r.kw} r={r} showSite={showSite} />
						))}
					</tbody>
				</table>
			</div>
			<details className="how">
				<summary>How to read this</summary>
				<p>
					The searches are in order of what #1 is worth a month, the most first.
					Click a column title to sort by it.
				</p>
				<p>
					#1 is worth a month = searches ×{' '}
					{Math.round(ORGANIC_CTR[0]! * SEARCH_CONSOLE_SCALE * 1000) / 10}% who
					click the first blue link × {Math.round(SEARCH_VISIT_TO_CLIENT * 100)}
					% who book as a new client × {PHONE_FACTOR.toFixed(2)} for phone
					bookings × what a new client spends in their first 6 months, the same
					math as What #1 is worth above.
				</p>
				<p>
					Rank is our position among the blue links only: the map box and ads
					are not counted. From the week of 2026-10-19, every search is read
					from five points (Farragut, Bearden, Downtown, North Knoxville and
					Maryville), because Google ranks the blue links differently across
					town; Rank is the middle reading, and the line under it gives the best
					and worst point. Earlier weeks have one reading from central
					Knoxville. Change compares with the last week that was read in full; a
					plus means we climbed. The small line shows each week, higher is
					better, a red dot means not found, and a gap means that week was cut
					short.
				</p>
				<p>
					A capture normally reads about 100 results. When one reads fewer than{' '}
					{SHORT_CAPTURE} and we are not in them, the row says "not checked" and
					shows our last known rank, because we cannot tell from that week where
					we were.
				</p>
				<p>
					Searches a month: Google Ads volume for the Knoxville market. "&lt;10"
					means Google gives no number, which it does below 10 a month. * = an
					estimate: Google gives this search the number of a close variant we
					also track, or hides it ("botox near me").
				</p>
			</details>
		</section>
	)
}

/** One search's row in the Rank by search table. */
function SearchTr({ r, showSite }: { r: SearchRow; showSite: boolean }) {
	const delta = changeLabel(r.now, r.earlier)
	const weAreFirst =
		r.row?.top_domain != null &&
		site(r.row.top_domain) === site(r.row.my_domain)
	return (
		<tr>
			<td>{r.kw}</td>
			{showSite ? <td className="mini">{r.site.label}</td> : null}
			<td className="num">
				{r.searches != null
					? `${r.searches.toLocaleString()}${r.estimated ? '*' : ''}`
					: '<10'}
			</td>
			<td className="num">{usd(r.worth)}</td>
			<td
				className={`num ${
					!r.now.checked
						? 'dim'
						: r.now.rank != null && r.now.rank <= 3
							? 'good'
							: r.now.rank == null || r.now.rank > 20
								? 'bad'
								: ''
				}`}
			>
				{r.now.rank != null ? (
					<>
						#{r.now.rank}
						{byArea(r.row)}
					</>
				) : r.now.checked ? (
					<>
						not in top {r.read}
						{byArea(r.row)}
					</>
				) : (
					<>
						not checked
						<span className="sub-line">
							{r.lastRank
								? `#${r.lastRank.rank} on ${r.lastRank.week.slice(5)}`
								: `read ${r.read} results`}
						</span>
					</>
				)}
			</td>
			<td className={`num ${delta.tone}`}>{delta.text}</td>
			<td>
				<RankSparkline weeks={r.history} floor={RANK_FLOOR} />
			</td>
			<td className="mini">
				{r.row?.my_url ? (
					<a href={r.row.my_url} target="_blank" rel="noreferrer">
						{site(r.row.my_domain)}
						<wbr />
						{new URL(r.row.my_url).pathname}
					</a>
				) : (
					'-'
				)}
			</td>
			<td className="mini">
				{weAreFirst ? (
					<strong>us</strong>
				) : (
					site(r.row?.top_domain ?? null) || '-'
				)}
			</td>
		</tr>
	)
}

/** Best and worst point, when the readings differ. */
function byArea(row: SerpRankRow | undefined) {
	if (!row?.points || row.points < 2 || !row.points_found) return null
	if (row.points_found < row.points)
		return (
			<span className="sub-line">
				best #{row.best_rank}, found in {row.points_found} of {row.points} areas
			</span>
		)
	if (row.best_rank === row.worst_rank) return null
	return (
		<span className="sub-line">
			#{row.best_rank} to #{row.worst_rank} by area
		</span>
	)
}

/** Sort order for the table: best rank first, then not found, then not checked. */
function sortRank(r: Reading) {
	if (r.rank != null) return r.rank
	return r.checked ? 900 : 950
}

/**
 * "+3", "−2", "=", "new", "out", or "-" when either reading is unknown, with
 * the climb as a number for sorting. Not found counts as #101 there, because
 * a capture reads about 100 results.
 */
function changeLabel(
	now: Reading,
	earlier: Reading | null,
): { text: string; tone: string; value: number | null } {
	if (!now.checked || !earlier) return { text: '-', tone: '', value: null }
	if (now.rank != null && earlier.rank != null) {
		const d = earlier.rank - now.rank
		return d === 0
			? { text: '=', tone: '', value: 0 }
			: {
					text: d > 0 ? `+${d}` : `−${-d}`,
					tone: d > 0 ? 'good' : 'bad',
					value: d,
				}
	}
	if (now.rank != null)
		return { text: 'new', tone: 'good', value: 101 - now.rank }
	if (earlier.rank != null)
		return { text: 'out', tone: 'bad', value: earlier.rank - 101 }
	return { text: '-', tone: '', value: null }
}
