/**
 * Reach over time, for each tracked keyword: how many people are inside our
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
import { BarChart, LineChart, ReportPage, SERIES, StatTile, usd } from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Reach over time' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

/** Organic ranks past this are functionally "not ranking"; chart at the floor. */
const RANK_FLOOR = 50

type SerpRankRow = {
	week: string
	keyword: string
	target: string | null
	rank_group: string | null
	my_domain: string | null
	my_url: string | null
	top_domain: string | null
}

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

	const [reach, volumes, values, serpRanks, serpRivals, linkGains, newLinks, linkLosses, lostLinks, backlinks, rivalAuthority, packRivals] = await Promise.all([
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
		// Organic ("blue link") Google rank per keyword per week, from
		// sha-reports src/serp.ts. Metro-wide, unlike the grid above.
		reportsQuery<SerpRankRow>(
			`SELECT to_char(week, 'YYYY-MM-DD') AS week, keyword, target,
			   rank_group, my_domain, my_url, top_domain
			 FROM report_serp_rank ORDER BY week, keyword`,
		),
		// Who else keeps landing in the organic top 10 this week.
		reportsQuery<{ domain: string; keywords: string; best: string; avg_rank: string }>(
			`WITH latest AS (SELECT max(week) AS week FROM raw_serp_organic)
			 SELECT domain, count(DISTINCT keyword)::int AS keywords,
			   min(rank_group)::int AS best, round(avg(rank_group), 1) AS avg_rank
			 FROM raw_serp_organic, latest
			 WHERE raw_serp_organic.week = latest.week
			   AND rank_group <= 10 AND domain <> ''
			 GROUP BY domain ORDER BY keywords DESC, avg_rank ASC LIMIT 15`,
		),
		// Authority + backlink counts per site, every 3 days
		// (sha-reports src/backlinks.ts).
		// New referring domains per ISO week (clean only), from the per-domain
		// first-seen ledger. The seed week counts every pre-existing domain as
		// "new", ignore the first bar.
		reportsQuery<{ week: string; target: string; gained: string }>(
			`SELECT to_char(date_trunc('week', first_seen), 'YYYY-MM-DD') AS week,
			   target, count(*)::int AS gained
			 FROM backlink_domains WHERE spam < 25
			 GROUP BY 1, 2 ORDER BY 1`,
		),
		// The actual newest links, so the weekly number is auditable.
		reportsQuery<{ domain: string; target: string; rank: string | null; first_seen: string }>(
			`SELECT domain, target, rank, to_char(first_seen, 'YYYY-MM-DD') AS first_seen
			 FROM backlink_domains WHERE spam < 25
			 ORDER BY first_seen DESC, rank DESC NULLS LAST LIMIT 25`,
		),
		// Lost links: a domain whose last sighting predates the newest capture
		// has stopped linking. Loss week = week it was last seen.
		reportsQuery<{ week: string; target: string; lost: string }>(
			`SELECT to_char(date_trunc('week', last_seen), 'YYYY-MM-DD') AS week,
			   target, count(*)::int AS lost
			 FROM backlink_domains
			 WHERE spam < 25
			   AND last_seen < (SELECT max(day) FROM raw_backlink_summary)
			 GROUP BY 1, 2 ORDER BY 1`,
		),
		reportsQuery<{ domain: string; target: string; rank: string | null; last_seen: string }>(
			`SELECT domain, target, rank, to_char(last_seen, 'YYYY-MM-DD') AS last_seen
			 FROM backlink_domains
			 WHERE spam < 25
			   AND last_seen < (SELECT max(day) FROM raw_backlink_summary)
			 ORDER BY last_seen DESC, rank DESC NULLS LAST LIMIT 15`,
		),
		reportsQuery<{
			day: string
			target: string
			rank: string | null
			backlinks: string | null
			referring_domains: string | null
			clean_referring_domains: string | null
			spam_referring_domains: string | null
		}>(
			`SELECT to_char(day, 'YYYY-MM-DD') AS day, target, rank, backlinks,
			   referring_domains, clean_referring_domains, spam_referring_domains
			 FROM raw_backlink_summary ORDER BY day, target`,
		),
		// Competitor authority + backlink snapshots, same cadence as ours
		// (sha-reports src/backlinks.ts COMPETITORS).
		reportsQuery<{
			day: string
			domain: string
			rank: string | null
			backlinks: string | null
			referring_domains: string | null
			clean_referring_domains: string | null
			spam_referring_domains: string | null
		}>(
			`SELECT to_char(day, 'YYYY-MM-DD') AS day, domain, rank, backlinks,
			   referring_domains, clean_referring_domains, spam_referring_domains
			 FROM raw_competitor_authority ORDER BY day, domain`,
		),
		// Map-pack rivals per keyword: same homes-weighted reach math as our
		// own number, computed for every business in the latest grid capture.
		// Listings sharing a domain count as one business (multi-location).
		reportsQuery<{
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
			`WITH latest AS (SELECT max(week) AS week FROM raw_dataforseo_region),
			 cellhomes AS (
			   SELECT r.keyword, r."gridRow" gr, r."gridCol" gc,
			     max(COALESCE(h.homes, 1)) AS homes
			   FROM raw_dataforseo_region r
			   JOIN latest ON r.week = latest.week
			   LEFT JOIN geo_grid_homes h
			     ON h.grid_lat = round(r."gridLat"::numeric, 4)
			    AND h.grid_lng = round(r."gridLng"::numeric, 4)
			   GROUP BY 1, 2, 3),
			 tot AS (SELECT keyword, sum(homes) AS total_homes FROM cellhomes GROUP BY 1),
			 bizcell AS (
			   SELECT r.keyword, COALESCE(nullif(r.domain, ''), r."placeId") AS biz,
			     r."gridRow" gr, r."gridCol" gc, bool_or(r."rankAbsolute" <= 3) AS hit
			   FROM raw_dataforseo_region r JOIN latest ON r.week = latest.week
			   WHERE r."placeId" IS NOT NULL
			   GROUP BY 1, 2, 3, 4),
			 bizmeta AS (
			   SELECT keyword, COALESCE(nullif(domain, ''), "placeId") AS biz,
			     max(title) AS title, max(domain) AS domain, bool_or("isMine") AS is_mine,
			     round(avg("rankAbsolute"), 1) AS avg_rank,
			     max(rating) AS rating, max("ratingVotes") AS reviews
			   FROM raw_dataforseo_region r JOIN latest ON r.week = latest.week
			   WHERE "placeId" IS NOT NULL GROUP BY 1, 2),
			 ranked AS (
			   SELECT m.keyword, m.title, m.domain, m.is_mine, m.avg_rank, m.rating,
			     m.reviews,
			     COALESCE(sum(ch.homes) FILTER (WHERE bc.hit), 0)::int AS homes_reached,
			     t.total_homes::int AS total_homes,
			     round(100.0 * COALESCE(sum(ch.homes) FILTER (WHERE bc.hit), 0)
			       / nullif(t.total_homes, 0), 1) AS reach_pct,
			     row_number() OVER (
			       PARTITION BY m.keyword
			       ORDER BY COALESCE(sum(ch.homes) FILTER (WHERE bc.hit), 0) DESC
			     ) AS rn
			   FROM bizcell bc
			   JOIN cellhomes ch ON ch.keyword = bc.keyword AND ch.gr = bc.gr AND ch.gc = bc.gc
			   JOIN bizmeta m ON m.keyword = bc.keyword AND m.biz = bc.biz
			   JOIN tot t ON t.keyword = bc.keyword
			   GROUP BY m.keyword, m.title, m.domain, m.is_mine, m.avg_rank, m.rating,
			     m.reviews, t.total_homes
			   HAVING COALESCE(sum(ch.homes) FILTER (WHERE bc.hit), 0) > 0)
			 SELECT keyword, title, domain, is_mine, avg_rank, rating, reviews,
			   homes_reached, total_homes, reach_pct
			 FROM ranked WHERE rn <= 10 OR is_mine
			 ORDER BY keyword, homes_reached DESC`,
		),
	])
	return json({
		configured: true as const,
		reach,
		volumes,
		values,
		serpRanks,
		serpRivals,
		linkGains,
		newLinks,
		linkLosses,
		lostLinks,
		backlinks,
		rivalAuthority,
		packRivals,
	})
}

const people = (n: number) =>
	n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))

export default function ReachReport() {
	const data = useLoaderData<typeof loader>()
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const { reach, volumes, values, serpRanks, serpRivals, linkGains, newLinks, linkLosses, lostLinks, backlinks, rivalAuthority, packRivals } = data

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
			subtitle={`People inside our top-3 map zone per keyword, and what that reach earns, metro grid of ${people(Number(reach[0]?.total_homes ?? 0))} households, ${volumes[0] ? `search volumes ${volumes[0].location} (${volumes[0].fetched_at})` : 'no search volumes yet'}`}
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
									<td className="num">{l.reachPct != null ? `${l.reachPct}%` : '-'}</td>
									<td className="num">{l.households != null ? people(l.households) : '-'}</td>
									<td className="num">{l.people != null ? people(l.people) : '-'}</td>
									<td className="num">
										{l.searches || '-'}
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
					proxies, total demand across all related searches ("botox knoxville", "lip filler",
					…) is several times larger, so treat revenue as a floor that scales with reach.
				</p>
			</section>

			<PackRivalSections rows={packRivals} />
			<OrganicRankSections ranks={serpRanks} rivals={serpRivals} />
			<BacklinkSections rows={backlinks} />
			<RivalAuthoritySections ours={backlinks} rivals={rivalAuthority} />
			<LinkVelocitySections gains={linkGains} newest={newLinks} losses={linkLosses} lost={lostLinks} />
		</ReportPage>
	)
}

const site = (d: string | null) => (d ?? '').replace(/^www\./, '')

/**
 * Organic Google rank, the "blue links" below the map pack. Captured Mondays
 * by sha-reports (src/serp.ts) for the Knoxville metro; every top-100 result
 * is stored, so a drop can name who took the slot.
 */
function OrganicRankSections({
	ranks,
	rivals,
}: {
	ranks: SerpRankRow[]
	rivals: Array<{ domain: string; keywords: string; best: string; avg_rank: string }>
}) {
	if (!ranks.length) return null
	const weeks = [...new Set(ranks.map(r => r.week))].sort()
	const latestWeek = weeks[weeks.length - 1]
	const priorWeek = weeks[weeks.length - 2]
	const cell = new Map(ranks.map(r => [`${r.week}|${r.keyword}`, r]))
	const rankAt = (week: string | undefined, kw: string) => {
		const v = week ? cell.get(`${week}|${kw}`)?.rank_group : null
		return v == null ? null : Number(v)
	}

	const BRANDS = ['Sarah Hitchcox Aesthetics', 'Botox Knox', 'Weight Loss Knox']
	const latestRows = ranks.filter(r => r.week === latestWeek)
	const groups = BRANDS.map(brand => ({
		brand,
		keywords: latestRows
			.filter(r => (r.target ?? BRANDS[0]) === brand)
			.map(r => r.keyword)
			.sort(
				(a, b) => (rankAt(latestWeek, a) ?? 999) - (rankAt(latestWeek, b) ?? 999),
			),
	})).filter(g => g.keywords.length)

	// Plot FLOOR+1-rank so better ranks sit higher; labels translate back.
	const plot = (n: number | null) =>
		n == null ? null : Math.max(1, RANK_FLOOR + 1 - n)
	const asRank = (v: number) => `#${Math.round(RANK_FLOOR + 1 - v)}`

	return (
		<>
			{groups.map(g => (
				<section key={g.brand}>
					<h2>
						Organic Google rank: {g.brand}{' '}
						<span className="mini">higher is better, captured Mondays</span>
					</h2>
					<LineChart
						labels={weeks}
						series={g.keywords.map((kw, i) => ({
							name: kw,
							color: SERIES[i % SERIES.length]!,
							values: weeks.map(w => plot(rankAt(w, kw))),
						}))}
						height={220}
						yMax={RANK_FLOOR}
						format={asRank}
					/>
				</section>
			))}

			<section>
				<h2>
					Organic rank snapshot <span className="mini">{latestWeek}</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Keyword</th>
								<th>Target site</th>
								<th className="num">Rank</th>
								<th className="num">Change</th>
								<th>Ranking page</th>
								<th>Who holds #1</th>
							</tr>
						</thead>
						<tbody>
							{groups.flatMap(g =>
								g.keywords.map(kw => {
									const row = cell.get(`${latestWeek}|${kw}`)
									const now = rankAt(latestWeek, kw)
									const was = rankAt(priorWeek, kw)
									// A rank going DOWN in number is an improvement.
									const delta = now != null && was != null ? was - now : null
									const weAreFirst =
										row?.top_domain != null &&
										site(row.top_domain) === site(row.my_domain)
									return (
										<tr key={kw}>
											<td>{kw}</td>
											<td className="mini">{g.brand}</td>
											<td
												className={`num ${now != null && now <= 3 ? 'good' : now == null || now > 20 ? 'bad' : ''}`}
											>
												{now != null ? `#${now}` : 'not in top 100'}
											</td>
											<td className={`num ${delta ? (delta > 0 ? 'good' : 'bad') : ''}`}>
												{delta == null ? '-' : delta === 0 ? '=' : delta > 0 ? `+${delta}` : delta}
											</td>
											<td className="mini">
												{row?.my_url ? (
													<a href={row.my_url} target="_blank" rel="noreferrer">
														{site(row.my_domain)}
														{new URL(row.my_url).pathname}
													</a>
												) : (
													'-'
												)}
											</td>
											<td className="mini">
												{weAreFirst ? <strong>us</strong> : site(row?.top_domain ?? null) || '-'}
											</td>
										</tr>
									)
								}),
							)}
						</tbody>
					</table>
				</div>
				<p className="note">
					Organic position only, the map pack (above) and ads are excluded. Change
					compares to the prior capture, positive means we climbed. Target site is the
					site we want winning that term, the main site outranking a microsite for the
					microsite's own keyword is worth seeing rather than hiding.
				</p>
			</section>

			<section>
				<h2>
					Who we are up against{' '}
					<span className="mini">organic top-10 appearances this week</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Domain</th>
								<th className="num">Keywords in top 10</th>
								<th className="num">Best rank</th>
								<th className="num">Avg rank</th>
							</tr>
						</thead>
						<tbody>
							{rivals.map(r => {
								const ours = ranks.some(x => site(x.my_domain) === site(r.domain))
								return (
									<tr key={r.domain}>
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
					A domain high on this list beats us broadly rather than on one term, which is
					usually a content-depth or backlink gap rather than a single-page fix.
				</p>
			</section>
		</>
	)
}

/**
 * Authority + backlinks per site, captured every 3 days by sha-reports
 * (src/backlinks.ts). Clean = referring domains with spam score under 25;
 * that is the number link-building work should move.
 */
function BacklinkSections({
	rows,
}: {
	rows: Array<{
		day: string
		target: string
		rank: string | null
		backlinks: string | null
		referring_domains: string | null
		clean_referring_domains: string | null
		spam_referring_domains: string | null
	}>
}) {
	if (!rows.length) return null
	const days = [...new Set(rows.map(r => r.day))].sort()
	const targets = [...new Set(rows.map(r => r.target))]
	const cell = new Map(rows.map(r => [`${r.day}|${r.target}`, r]))
	const latest = days[days.length - 1]
	const num = (v: string | null | undefined) => (v == null ? null : Number(v))

	return (
		<>
			<section>
				<h2>
					Authority score <span className="mini">DataForSEO domain rank, every 3 days</span>
				</h2>
				<LineChart
					labels={days}
					series={targets.map((t, i) => ({
						name: site(t),
						color: SERIES[i % SERIES.length]!,
						values: days.map(d => num(cell.get(`${d}|${t}`)?.rank)),
					}))}
					height={200}
					format={n => String(Math.round(n))}
				/>
			</section>

			<section>
				<h2>
					Clean referring domains{' '}
					<span className="mini">spam score under 25, the number worth growing</span>
				</h2>
				<LineChart
					labels={days}
					series={targets.map((t, i) => ({
						name: site(t),
						color: SERIES[i % SERIES.length]!,
						values: days.map(d => num(cell.get(`${d}|${t}`)?.clean_referring_domains)),
					}))}
					height={200}
					format={n => String(Math.round(n))}
				/>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Site</th>
								<th className="num">Authority</th>
								<th className="num">Backlinks</th>
								<th className="num">Referring domains</th>
								<th className="num">Clean</th>
								<th className="num">Spam</th>
							</tr>
						</thead>
						<tbody>
							{targets.map(t => {
								const r = cell.get(`${latest}|${t}`)
								return (
									<tr key={t}>
										<td>{site(t)}</td>
										<td className="num">{r?.rank ?? '-'}</td>
										<td className="num">{r?.backlinks ?? '-'}</td>
										<td className="num">{r?.referring_domains ?? '-'}</td>
										<td className="num good">{r?.clean_referring_domains ?? '-'}</td>
										<td className="num bad">{r?.spam_referring_domains ?? '-'}</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
				<p className="note">
					As of {latest}. Most historical links are junk directories, so total referring
					domains overstates the profile, watch the clean count. Link targets and
					submission status live in docs/listings/playbook.md and the per-location
					records.
				</p>
			</section>
		</>
	)
}

/**
 * Map-pack rivals per keyword: every business with top-3 presence in the
 * latest grid capture, homes-weighted with the same math as our own reach
 * number. Our row is highlighted.
 */
function PackRivalSections({
	rows,
}: {
	rows: Array<{
		keyword: string
		title: string
		domain: string | null
		is_mine: boolean
		avg_rank: string
		rating: string | null
		reviews: string | null
		reach_pct: string | null
	}>
}) {
	if (!rows.length) return null
	const keywords = [...new Set(rows.map(r => r.keyword))]
	return (
		<section>
			<h2>
				Map-pack rivals by keyword{' '}
				<span className="mini">homes-weighted reach, latest grid capture, our row highlighted</span>
			</h2>
			{keywords.map(kw => (
				<div key={kw}>
					<h3>{kw}</h3>
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Business</th>
									<th>Site</th>
									<th className="num">Reach</th>
									<th className="num">Avg rank</th>
									<th className="num">Rating</th>
									<th className="num">Reviews</th>
								</tr>
							</thead>
							<tbody>
								{rows
									.filter(r => r.keyword === kw)
									.map(r => (
										<tr key={`${kw}|${r.title}`}>
											<td className={r.is_mine ? 'good' : ''}>
												{r.title}
												{r.is_mine ? ' (us)' : ''}
											</td>
											<td className="mini">{site(r.domain)}</td>
											<td className={`num ${r.is_mine ? 'good' : ''}`}>
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
				</div>
			))}
			<p className="note">
				Reach = share of metro homes inside a grid cell where the business ranks
				top-3 in the local pack. Listings on one website count as one business, so
				multi-location brands (including us) show combined reach.
			</p>
		</section>
	)
}

/**
 * Authority and clean-link race: us against the tracked Knoxville
 * competitors, every 3 days (sha-reports src/backlinks.ts).
 */
function RivalAuthoritySections({
	ours,
	rivals,
}: {
	ours: Array<{
		day: string
		target: string
		rank: string | null
		backlinks: string | null
		referring_domains: string | null
		clean_referring_domains: string | null
		spam_referring_domains: string | null
	}>
	rivals: Array<{
		day: string
		domain: string
		rank: string | null
		backlinks: string | null
		referring_domains: string | null
		clean_referring_domains: string | null
		spam_referring_domains: string | null
	}>
}) {
	if (!rivals.length) return null
	// One combined series set: our main site plus every tracked competitor.
	const us = ours.filter(r => r.target === 'hitchcoxaesthetics.com')
	const all = [
		...us.map(r => ({ ...r, domain: 'hitchcoxaesthetics.com', mine: true })),
		...rivals.map(r => ({ ...r, mine: false })),
	]
	const days = [...new Set(all.map(r => r.day))].sort()
	const latest = days[days.length - 1]
	const cell = new Map(all.map(r => [`${r.day}|${r.domain}`, r]))
	// Us first, then competitors by latest authority, descending. Rows are
	// day-ordered, so the last write per domain is its newest rank.
	const newestRank = new Map<string, number>()
	for (const r of rivals) newestRank.set(r.domain, Number(r.rank ?? 0))
	const domains = [
		'hitchcoxaesthetics.com',
		...[...new Set(rivals.map(r => r.domain))].sort(
			(a, b) => (newestRank.get(b) ?? 0) - (newestRank.get(a) ?? 0),
		),
	]
	const num = (v: string | null | undefined) => (v == null ? null : Number(v))
	const latestRow = (d: string) =>
		cell.get(`${latest}|${d}`) ??
		[...all].reverse().find(r => r.domain === d)

	return (
		<section>
			<h2>
				Authority race: us vs competitors{' '}
				<span className="mini">DataForSEO domain rank (Ahrefs DR × ~10), every 3 days</span>
			</h2>
			<LineChart
				labels={days}
				series={domains.map((d, i) => ({
					name: d === 'hitchcoxaesthetics.com' ? 'us' : site(d),
					color: SERIES[i % SERIES.length]!,
					values: days.map(day => num(cell.get(`${day}|${d}`)?.rank)),
				}))}
				height={240}
				format={n => String(Math.round(n))}
			/>
			<div className="rtable-wrap">
				<table className="rtable">
					<thead>
						<tr>
							<th>Site</th>
							<th className="num">Authority</th>
							<th className="num">Backlinks</th>
							<th className="num">Referring domains</th>
							<th className="num">Clean</th>
							<th className="num">Spam</th>
						</tr>
					</thead>
					<tbody>
						{domains.map(d => {
							const r = latestRow(d)
							const mine = d === 'hitchcoxaesthetics.com'
							return (
								<tr key={d}>
									<td className={mine ? 'good' : ''}>
										{site(d)}
										{mine ? ' (us)' : ''}
									</td>
									<td className={`num ${mine ? 'good' : ''}`}>{r?.rank ?? '-'}</td>
									<td className="num">{r?.backlinks ?? '-'}</td>
									<td className="num">{r?.referring_domains ?? '-'}</td>
									<td className="num">{r?.clean_referring_domains ?? '-'}</td>
									<td className="num">{r?.spam_referring_domains ?? '-'}</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
			<p className="note">
				As of {latest}. Clean = referring domains with spam score under 25, the
				number our link work should move. Competitor tracking started 2026-07-31.
			</p>
		</section>
	)
}

/**
 * Links gained per week (clean referring domains only), with the actual
 * domains listed so the number is auditable. first_seen tracking started
 * 2026-07-30; that seed week counts the whole backlog as new.
 */
function LinkVelocitySections({
	gains,
	newest,
	losses,
	lost,
}: {
	gains: Array<{ week: string; target: string; gained: string }>
	newest: Array<{ domain: string; target: string; rank: string | null; first_seen: string }>
	losses: Array<{ week: string; target: string; lost: string }>
	lost: Array<{ domain: string; target: string; rank: string | null; last_seen: string }>
}) {
	if (!gains.length) return null
	const weeks = [...new Set([...gains.map(g => g.week), ...losses.map(l => l.week)])].sort()
	const targets = [...new Set(gains.map(g => g.target))]
	const cell = new Map(gains.map(g => [`${g.week}|${g.target}`, Number(g.gained)]))
	const lossCell = new Map(losses.map(l => [`${l.week}|${l.target}`, Number(l.lost)]))
	const totalLost = losses.reduce((n, l) => n + Number(l.lost), 0)
	return (
		<section>
			<h2>
				New links per week <span className="mini">clean referring domains gained, all sources</span>
			</h2>
			<BarChart
				labels={weeks}
				series={targets.map((t, i) => ({
					name: site(t),
					color: SERIES[i % SERIES.length]!,
					values: weeks.map(w =>
						(cell.get(`${w}|${t}`) ?? 0) - (lossCell.get(`${w}|${t}`) ?? 0),
					),
				}))}
				height={180}
				tickEvery={1}
				format={n => String(Math.round(n))}
			/>
			<div className="rtable-wrap">
				<table className="rtable">
					<thead>
						<tr>
							<th>Newest links</th>
							<th>Points at</th>
							<th className="num">Source authority</th>
							<th className="num">First seen</th>
						</tr>
					</thead>
					<tbody>
						{newest.map(l => (
							<tr key={`${l.target}|${l.domain}`}>
								<td>{l.domain}</td>
								<td className="mini">{site(l.target)}</td>
								<td className="num">{l.rank ?? '-'}</td>
								<td className="num">{l.first_seen}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{totalLost > 0 ? (
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Lost links</th>
								<th>Pointed at</th>
								<th className="num">Source authority</th>
								<th className="num">Last seen</th>
							</tr>
						</thead>
						<tbody>
							{lost.map(l => (
								<tr key={`${l.target}|${l.domain}`}>
									<td className="bad">{l.domain}</td>
									<td className="mini">{site(l.target)}</td>
									<td className="num">{l.rank ?? '-'}</td>
									<td className="num">{l.last_seen}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="note">No links lost since tracking began.</p>
			)}
			<p className="note">
				Bars are NET (gained minus lost) per week. Tracking began 2026-07-30,
				so that week's bar includes the entire pre-existing backlog. Captures
				run every 3 days; a link appears once DataForSEO's crawler sees it,
				typically 1-3 weeks after it goes live, and shows as lost when it
				stops appearing in a capture.
			</p>
		</section>
	)
}