/**
 * Backlinks: the websites that link to our three sites. Tabs (?view=) and a
 * site filter (?site=sha|bk|kwlc):
 *
 *   summary (default)  Sarah's reviews per day (the articles behind the
 *                      links are hers to approve, so her pace is the pace of
 *                      this page), then one row per site with the numbers
 *                      that matter, and their trend.
 *   changes            new and lost linking sites per week, and which ones.
 *   google             Google's own links report, per site.
 *   crawl              whether Google has each linking page in its index.
 *   competitors        our main site's authority against Knoxville rivals.
 *
 * Two sources, never mixed in one number:
 *   - Google's links report. The Search Console API has no links report, so
 *     ~/outreach/gsc-links.py on the Mac mini reads it in a signed-in browser
 *     every morning and pushes each snapshot to /resources/gsc-links-sync.
 *     Google refreshes that report in batches, weeks apart.
 *   - The DataForSEO link crawler, every 3 days (sha-reports src/backlinks.ts,
 *     reports Postgres): authority, linking sites, first and last seen, and a
 *     site: check per linking page. The crawler also tracks other domains
 *     (the network sites); this page reads only our three.
 */
import {
	json,
	type LoaderFunctionArgs,
	type SerializeFrom,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { formatInTimeZone } from 'date-fns-tz'
import { type ReactNode } from 'react'
import {
	BarChart,
	Choice,
	LineChart,
	ReportPage,
	revalidateUnlessOnly,
	SERIES,
	StatTile,
	useChoice,
	usePersistedSearch,
} from '#app/components/report-ui'
import {
	findReviewerUser,
	REVIEWER_STAFF_URN,
} from '#app/utils/article-reminder.server.ts'
import { zoneDayStart } from '#app/utils/article-reminder.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	OUR_DOMAINS,
	OUR_SITES,
	SITE_CHOICES,
	SITE_CHOICE_VALUES,
} from '#app/utils/report-sites.ts'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'
import {
	bucketReviewActivity,
	REVIEW_DECISION_KINDS,
} from '#app/utils/review-activity.ts'
import { loadWaiting } from '#app/utils/review-waiting.server.ts'

const TIME_ZONE = 'America/New_York'
const REVIEW_DAYS = 30

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	// Sarah's reviews per day. The articles behind the backlinks are hers to
	// approve, so how many she decides each day is the pace of this whole page.
	const now = new Date()
	const reviewer = await findReviewerUser()
	const days = bucketReviewActivity([], TIME_ZONE, REVIEW_DAYS, now)
	const since = zoneDayStart(days[0]!.day, TIME_ZONE)
	const [events, decidedAllTime, waiting, timeRows] = reviewer
		? await Promise.all([
				prisma.articleReviewEvent.findMany({
					where: { userId: reviewer.id, at: { gte: since } },
					select: { articleId: true, kind: true, at: true },
				}),
				prisma.articleReviewEvent.count({
					where: {
						userId: reviewer.id,
						kind: { in: [...REVIEW_DECISION_KINDS] },
					},
				}),
				loadWaiting(now),
				// Her time per day, as the reviewer-days job last measured it.
				prisma.reviewerDay.findMany({
					where: { staffId: REVIEWER_STAFF_URN, day: { gte: days[0]!.day } },
					select: {
						day: true,
						shiftMinutes: true,
						blockMinutes: true,
						appointmentMinutes: true,
						freeMinutes: true,
						reviewMinutes: true,
						reviewSessions: true,
						reviewSource: true,
						fetchedAt: true,
					},
				}),
			])
		: [[], 0, null, []]
	const timeByDay = new Map(timeRows.map(r => [r.day, r]))
	const measuredAt = timeRows.reduce<Date | null>(
		(latest, r) => (latest && latest > r.fetchedAt ? latest : r.fetchedAt),
		null,
	)
	const reviews = {
		name: reviewer?.name?.trim() || 'Sarah',
		found: reviewer != null,
		days: bucketReviewActivity(events, TIME_ZONE, REVIEW_DAYS, now).map(d => {
			const t = timeByDay.get(d.day)
			return {
				...d,
				time: t
					? {
							shift: t.shiftMinutes,
							blocked: t.blockMinutes,
							booked: t.appointmentMinutes,
							free: t.freeMinutes,
							reviewing: t.reviewMinutes,
							sittings: t.reviewSessions,
							source: t.reviewSource,
						}
					: null,
			}
		}),
		decidedAllTime,
		waiting: waiting ? waiting.articles.length : null,
		measuredAt: measuredAt
			? formatInTimeZone(measuredAt, TIME_ZONE, 'MMM d, h:mm a')
			: null,
	}

	const brands = await Promise.all(
		OUR_SITES.map(async brand => {
			const pulls = await prisma.gscLinkPull.findMany({
				where: { property: brand.key },
				orderBy: { pulledAt: 'desc' },
				take: 30,
				select: {
					id: true,
					pulledAt: true,
					sites: true,
					linkingPages: true,
					realSites: true,
					spamSites: true,
					oursSites: true,
					searchSites: true,
					ourLiveLinks: true,
					pickedUp: true,
				},
			})
			const current = pulls[0] ?? null
			const links = current
				? await prisma.gscLinkSite.findMany({
						where: { pullId: current.id },
						orderBy: [{ linkingPages: 'desc' }, { root: 'asc' }],
						select: {
							site: true,
							root: true,
							linkingPages: true,
							klass: true,
							spam: true,
							ours: true,
							isOurLink: true,
						},
					})
				: []
			// What changed since the pull before this one, by root domain.
			let gained: string[] = []
			let lost: string[] = []
			if (pulls[1]) {
				const prev = await prisma.gscLinkSite.findMany({
					where: { pullId: pulls[1].id },
					select: { root: true },
				})
				const before = new Set(prev.map(p => p.root))
				const now = new Set(links.map(l => l.root))
				gained = [...now].filter(r => !before.has(r)).sort()
				lost = [...before].filter(r => !now.has(r)).sort()
			}
			return {
				key: brand.key,
				label: brand.label,
				site: brand.site,
				current: current
					? { ...current, pulledAt: current.pulledAt.toISOString() }
					: null,
				// One point per day: several pulls can land on the same date (a backfill, a re-run),
				// and a trend line with four dots on one day reads as movement that never happened.
				history: (() => {
					const byDay = new Map<
						string,
						{ day: string; real: number; all: number; pickedUp: number }
					>()
					for (const p of [...pulls].reverse()) {
						const day = p.pulledAt.toISOString().slice(0, 10)
						byDay.set(day, {
							day,
							real: p.realSites,
							all: p.sites,
							pickedUp: p.pickedUp,
						})
					}
					return [...byDay.values()]
				})(),
				links,
				gained,
				lost,
			}
		}),
	)
	return json({ brands, reviews, crawler: await loadCrawler() })
}

/** The DataForSEO crawler's view of our three sites, or null without the reports database. */
async function loadCrawler() {
	if (!hasReportsDb()) return null
	const [summary, recent, gains, losses, newest, lost, pages, rivals] =
		await Promise.all([
			// Authority and linking-site counts per site, every 3 days.
			reportsQuery<{
				day: string
				target: string
				rank: number | null
				backlinks: number | null
				referring_domains: number | null
				clean_referring_domains: number | null
				spam_referring_domains: number | null
			}>(
				`SELECT to_char(day, 'YYYY-MM-DD') AS day, target, rank, backlinks,
			   referring_domains, clean_referring_domains, spam_referring_domains
			 FROM raw_backlink_summary WHERE target = ANY($1) ORDER BY day, target`,
				[OUR_DOMAINS],
			),
			// New and lost linking sites in the 7 days up to the newest capture.
			reportsQuery<{ target: string; new_7d: number; lost_7d: number }>(
				`WITH latest AS (SELECT max(day) AS day FROM raw_backlink_summary WHERE target = ANY($1))
			 SELECT target,
			   count(*) FILTER (WHERE first_seen > latest.day - 7)::int AS new_7d,
			   count(*) FILTER (WHERE last_seen < latest.day AND last_seen >= latest.day - 7)::int AS lost_7d
			 FROM backlink_domains, latest
			 WHERE spam < 25 AND target = ANY($1)
			 GROUP BY target`,
				[OUR_DOMAINS],
			),
			// Linking sites gained per ISO week, from the per-domain first-seen
			// ledger. The seed week counts every pre-existing site as new; the
			// chart leaves it out.
			reportsQuery<{ week: string; target: string; gained: number }>(
				`SELECT to_char(date_trunc('week', first_seen), 'YYYY-MM-DD') AS week,
			   target, count(*)::int AS gained
			 FROM backlink_domains WHERE spam < 25 AND target = ANY($1)
			 GROUP BY 1, 2 ORDER BY 1`,
				[OUR_DOMAINS],
			),
			// Lost: a site whose last sighting predates the newest capture has
			// stopped linking. Loss week = the week it was last seen.
			reportsQuery<{ week: string; target: string; lost: number }>(
				`SELECT to_char(date_trunc('week', last_seen), 'YYYY-MM-DD') AS week,
			   target, count(*)::int AS lost
			 FROM backlink_domains
			 WHERE spam < 25 AND target = ANY($1)
			   AND last_seen < (SELECT max(day) FROM raw_backlink_summary WHERE target = ANY($1))
			 GROUP BY 1, 2 ORDER BY 1`,
				[OUR_DOMAINS],
			),
			reportsQuery<{
				domain: string
				target: string
				rank: number | null
				first_seen: string
			}>(
				`SELECT domain, target, rank, to_char(first_seen, 'YYYY-MM-DD') AS first_seen
			 FROM backlink_domains WHERE spam < 25 AND target = ANY($1)
			 ORDER BY first_seen DESC, rank DESC NULLS LAST LIMIT 60`,
				[OUR_DOMAINS],
			),
			reportsQuery<{
				domain: string
				target: string
				rank: number | null
				last_seen: string
			}>(
				`SELECT domain, target, rank, to_char(last_seen, 'YYYY-MM-DD') AS last_seen
			 FROM backlink_domains
			 WHERE spam < 25 AND target = ANY($1)
			   AND last_seen < (SELECT max(day) FROM raw_backlink_summary WHERE target = ANY($1))
			 ORDER BY last_seen DESC, rank DESC NULLS LAST LIMIT 40`,
				[OUR_DOMAINS],
			),
			// Each linking page and the first day a site: query proved it is in
			// Google's index (the crawler re-checks unconfirmed pages every 3 days).
			reportsQuery<{
				target: string
				domain: string
				url_from: string
				dofollow: boolean | null
				first_seen: string
				google_indexed_confirmed: string | null
			}>(
				`SELECT target, domain, url_from, dofollow,
			   to_char(first_seen, 'YYYY-MM-DD') AS first_seen,
			   to_char(google_indexed_confirmed, 'YYYY-MM-DD') AS google_indexed_confirmed
			 FROM backlink_pages WHERE spam < 25 AND target = ANY($1)
			 ORDER BY google_indexed_confirmed NULLS FIRST, first_seen DESC
			 LIMIT 400`,
				[OUR_DOMAINS],
			),
			// Competitor authority snapshots, same cadence as ours
			// (sha-reports src/backlinks.ts COMPETITORS).
			reportsQuery<{
				day: string
				domain: string
				rank: number | null
				backlinks: number | null
				referring_domains: number | null
				clean_referring_domains: number | null
				spam_referring_domains: number | null
			}>(
				`SELECT to_char(day, 'YYYY-MM-DD') AS day, domain, rank, backlinks,
			   referring_domains, clean_referring_domains, spam_referring_domains
			 FROM raw_competitor_authority ORDER BY day, domain`,
			),
		])
	return { summary, recent, gains, losses, newest, lost, pages, rivals }
}

// Switching tabs or sites only re-renders; the data stays.
export const shouldRevalidate = revalidateUnlessOnly(['view', 'site'])

type Data = SerializeFrom<typeof loader>
type Crawler = NonNullable<Data['crawler']>

const VIEWS = [
	{ value: 'summary', label: 'Summary' },
	{ value: 'changes', label: 'New and lost links' },
	{ value: 'google', label: "Google's report" },
	{ value: 'crawl', label: 'Google crawl status' },
	{ value: 'competitors', label: 'Against competitors' },
] as const
type View = (typeof VIEWS)[number]['value']

const labelOf = (domain: string) =>
	OUR_SITES.find(s => s.site === domain)?.label ?? domain
const colorOf = (domain: string) =>
	SERIES[
		Math.max(
			0,
			OUR_SITES.findIndex(s => s.site === domain),
		)
	]!

/** Minutes as a short duration: 45 min, 2 h 05 min. */
function hm(minutes: number) {
	const h = Math.floor(minutes / 60)
	const m = Math.round(minutes % 60)
	return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

export default function LinksReport() {
	usePersistedSearch()
	const { brands, reviews, crawler } = useLoaderData<typeof loader>()
	const [view, setView] = useChoice(
		'view',
		VIEWS.map(v => v.value),
		'summary' as View,
	)
	const [siteKey, setSite] = useChoice('site', SITE_CHOICE_VALUES, 'all')
	const chosen = OUR_SITES.filter(s => siteKey === 'all' || s.key === siteKey)
	const chosenDomains = new Set<string>(chosen.map(s => s.site))

	return (
		<ReportPage
			title="Backlinks"
			subtitle="The websites that link to our three sites: how many, which are new or gone, and which ones Google has seen."
		>
			<div className="choices">
				<Choice
					label="Section"
					value={view}
					options={VIEWS}
					onChange={setView}
				/>
				{view !== 'competitors' ? (
					<Choice
						label="Site"
						variant="pills"
						value={siteKey}
						onChange={setSite}
						options={SITE_CHOICES}
					/>
				) : null}
			</div>
			{view === 'summary' ? (
				<>
					<ReviewPace reviews={reviews} />
					<SiteSummary
						brands={brands}
						crawler={crawler}
						chosen={chosenDomains}
					/>
				</>
			) : view === 'changes' ? (
				<NeedsCrawler crawler={crawler}>
					{c => <NewAndLost crawler={c} chosen={chosenDomains} />}
				</NeedsCrawler>
			) : view === 'google' ? (
				<GoogleReport brands={brands.filter(b => chosenDomains.has(b.site))} />
			) : view === 'crawl' ? (
				<NeedsCrawler crawler={crawler}>
					{c => <CrawlStatus crawler={c} chosen={chosenDomains} />}
				</NeedsCrawler>
			) : (
				<NeedsCrawler crawler={crawler}>
					{c => <Competitors crawler={c} />}
				</NeedsCrawler>
			)}
		</ReportPage>
	)
}

function NeedsCrawler({
	crawler,
	children,
}: {
	crawler: Data['crawler']
	children: (c: Crawler) => ReactNode
}) {
	if (!crawler)
		return (
			<p className="note">
				The reports database is not configured (REPORTS_DATABASE_URL), so the
				link crawler's numbers are not available.
			</p>
		)
	return <>{children(crawler)}</>
}

/* ------------------------------------------------------------------------ */
/* Summary                                                                  */
/* ------------------------------------------------------------------------ */

function ReviewPace({ reviews }: { reviews: Data['reviews'] }) {
	const today = reviews.days.at(-1)
	const week = reviews.days.slice(-7)
	const decidedWeek = week.reduce((n, d) => n + d.decided, 0)
	const workedWeek = week.reduce((n, d) => n + d.worked, 0)
	const activeDays = reviews.days.filter(d => d.worked > 0).length
	// Time only for the days the job has measured. Free time needs a shift.
	const measured = reviews.days.filter(d => d.time)
	const weekMeasured = week.filter(d => d.time)
	const reviewingWeek = weekMeasured.reduce(
		(n, d) => n + (d.time?.reviewing ?? 0),
		0,
	)
	const freeWeek = weekMeasured.reduce((n, d) => n + (d.time?.free ?? 0), 0)
	const shareWeek =
		freeWeek > 0 ? Math.round((100 * reviewingWeek) / freeWeek) : null
	const todayTime = today?.time ?? null
	return (
		<section style={{ marginBottom: 34 }}>
			<h2>{reviews.name}'s reviews</h2>
			{!reviews.found ? (
				<p className="note">
					No reviewer account is set up, so there is nothing to count yet.
				</p>
			) : (
				<>
					<div className="tiles">
						<StatTile
							label="Decided today"
							value={String(today?.decided ?? 0)}
							whisper={
								today?.worked
									? `${today.worked} article${today.worked === 1 ? '' : 's'} worked on`
									: 'nothing opened yet today'
							}
						/>
						<StatTile
							label="Decided, last 7 days"
							value={String(decidedWeek)}
							whisper={`${workedWeek} article-days of work`}
						/>
						<StatTile
							label="Waiting on her"
							value={reviews.waiting == null ? '-' : String(reviews.waiting)}
							whisper="articles with no decision yet"
							tone={
								reviews.waiting != null && reviews.waiting > 20
									? 'bad'
									: undefined
							}
						/>
						<StatTile
							label="Decided all time"
							value={String(reviews.decidedAllTime)}
							whisper={`${activeDays} active day${activeDays === 1 ? '' : 's'} in the last ${REVIEW_DAYS}`}
						/>
						<StatTile
							label="Reviewing today"
							value={todayTime ? hm(todayTime.reviewing) : '-'}
							whisper={
								!todayTime
									? 'not measured yet'
									: todayTime.free == null
										? 'no shift in Boulevard today'
										: `of ${hm(todayTime.free)} free time`
							}
						/>
						<StatTile
							label="Reviewing, last 7 days"
							value={weekMeasured.length ? hm(reviewingWeek) : '-'}
							whisper={
								!weekMeasured.length
									? 'not measured yet'
									: shareWeek == null
										? 'no shifts in Boulevard'
										: `${shareWeek}% of ${hm(freeWeek)} free time`
							}
						/>
					</div>
					<BarChart
						labels={reviews.days.map(d => d.day.slice(5))}
						height={170}
						format={(n: number) => String(Math.round(n))}
						tickEvery={5}
						showTotal={false}
						series={[
							{
								name: 'Decided',
								color: SERIES[0]!,
								values: reviews.days.map(d => d.decided),
							},
							{
								name: 'Articles worked on',
								color: SERIES[2]!,
								values: reviews.days.map(d => d.worked),
							},
						]}
					/>
					{measured.length ? (
						<>
							<h3>Free time and time reviewing, per day</h3>
							<BarChart
								labels={reviews.days.map(d => d.day.slice(5))}
								height={170}
								format={hm}
								tickEvery={5}
								showTotal={false}
								series={[
									{
										name: 'Free time',
										color: SERIES[1]!,
										values: reviews.days.map(d => d.time?.free ?? 0),
									},
									{
										name: 'Reviewing',
										color: SERIES[0]!,
										values: reviews.days.map(d => d.time?.reviewing ?? 0),
									},
								]}
								extraTipRows={i => {
									const t = reviews.days[i]?.time
									if (!t)
										return [
											{ name: 'Not measured', color: 'transparent', value: '' },
										]
									return [
										{
											name: 'Shift',
											color: 'transparent',
											value: t.shift == null ? 'none' : hm(t.shift),
										},
										{
											name: 'Booked',
											color: 'transparent',
											value: hm(t.booked ?? 0),
										},
										{
											name: 'Blocked',
											color: 'transparent',
											value: hm(t.blocked ?? 0),
										},
										{
											name: 'Sittings',
											color: 'transparent',
											value: String(t.sittings),
										},
									]
								}}
							/>
						</>
					) : null}
					<p className="note">
						A decision is approve, ask for changes, ask for a different article,
						or turn down. Worked on means opened, read, edited, asked about or
						decided. Days are New York time. Free time is her Boulevard shift
						minus booked appointments and blocked time; a day with no shift
						shows no free time. Reviewing is her time on the review pages,
						measured from her page sessions; days before September 19 are
						estimated from her saved edits and decisions
						{reviews.measuredAt ? ` (last measured ${reviews.measuredAt})` : ''}
						.
					</p>
				</>
			)}
		</section>
	)
}

/** One row per site with the numbers that matter, then their trend. */
function SiteSummary({
	brands,
	crawler,
	chosen,
}: {
	brands: Data['brands']
	crawler: Data['crawler']
	chosen: Set<string>
}) {
	const summary = crawler?.summary.filter(r => chosen.has(r.target)) ?? []
	const days = [...new Set(summary.map(r => r.day))].sort()
	const cell = new Map(summary.map(r => [`${r.day}|${r.target}`, r]))
	const latestDay = days[days.length - 1]
	// The capture closest to 4 weeks before the newest one.
	const monthAgo = latestDay
		? ([...days]
				.reverse()
				.find(d => Date.parse(d) <= Date.parse(latestDay) - 28 * 86_400_000) ??
			days[0])
		: undefined
	const recent = new Map(crawler?.recent.map(r => [r.target, r]) ?? [])
	const rows = OUR_SITES.filter(s => chosen.has(s.site)).map(s => {
		const now = latestDay ? cell.get(`${latestDay}|${s.site}`) : undefined
		const then = monthAgo ? cell.get(`${monthAgo}|${s.site}`) : undefined
		const gsc = brands.find(b => b.key === s.key)?.current ?? null
		const linking = now?.clean_referring_domains ?? null
		const before = then?.clean_referring_domains ?? null
		return {
			...s,
			linking,
			change: linking != null && before != null ? linking - before : null,
			new7: recent.get(s.site)?.new_7d ?? null,
			lost7: recent.get(s.site)?.lost_7d ?? null,
			authority: now?.rank ?? null,
			google: gsc?.realSites ?? null,
			seen:
				gsc && gsc.ourLiveLinks
					? `${gsc.pickedUp} of ${gsc.ourLiveLinks}`
					: null,
		}
	})
	const plural = rows.length === 1 ? 'site' : 'sites'
	return (
		<>
			<section>
				<h2>
					Our {plural} at a glance{' '}
					<span className="mini">
						{latestDay ? `link crawler ${latestDay}` : 'no crawler data'}
						{monthAgo && latestDay ? `, change against ${monthAgo}` : ''}
					</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Site</th>
								<th className="num">Linking sites</th>
								<th className="num">Last 4 weeks</th>
								<th className="num">New, 7 days</th>
								<th className="num">Lost, 7 days</th>
								<th className="num">Authority</th>
								<th className="num">In Google's report</th>
								<th className="num">Our placements Google lists</th>
							</tr>
						</thead>
						<tbody>
							{rows.map(r => (
								<tr key={r.key}>
									<td>
										{r.label}
										<span className="sub-line">{r.site}</span>
									</td>
									<td className="num">
										<strong>{r.linking ?? '-'}</strong>
									</td>
									<td
										className={`num ${r.change ? (r.change > 0 ? 'good' : 'bad') : ''}`}
									>
										{r.change == null
											? '-'
											: r.change === 0
												? '='
												: `${r.change > 0 ? '+' : '−'}${Math.abs(r.change)}`}
									</td>
									<td className={`num ${r.new7 ? 'good' : ''}`}>
										{r.new7 ?? '-'}
									</td>
									<td className={`num ${r.lost7 ? 'bad' : ''}`}>
										{r.lost7 ?? '-'}
									</td>
									<td className="num">{r.authority ?? '-'}</td>
									<td className="num">{r.google ?? '-'}</td>
									<td className="num">{r.seen ?? '-'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<details className="how" open>
					<summary>What the columns mean</summary>
					<p>
						<strong>Linking sites</strong>: how many different websites link to
						the site. Each website counts once, however many links it has, and
						websites with a spam score of 25 or more are left out. This is the
						number our link work should grow. Counted by the DataForSEO link
						crawler every 3 days.
					</p>
					<p>
						<strong>New, 7 days</strong> and <strong>Lost, 7 days</strong>:
						linking sites the crawler saw for the first time, or stopped seeing,
						in the week up to its newest capture. The crawler usually finds a
						new link 1 to 3 weeks after it goes live.
					</p>
					<p>
						<strong>Authority</strong>: DataForSEO's score for the whole site, 0
						to 1,000. It rises when sites that have authority of their own link
						to us.
					</p>
					<p>
						<strong>In Google's report</strong>: the real websites in Google's
						own links report (spam, our own sites and search engines left out).{' '}
						<strong>Our placements Google lists</strong>: of the links our
						outreach ledger calls live, how many are in that report. Google
						refreshes the report in batches, weeks apart, so it lags the
						crawler.
					</p>
				</details>
			</section>

			{days.length > 1 ? (
				<>
					<section>
						<h2>
							Linking sites over time{' '}
							<span className="mini">spam left out, every 3 days</span>
						</h2>
						<LineChart
							labels={days}
							series={rows.map(r => ({
								name: r.label,
								color: colorOf(r.site),
								values: days.map(
									d =>
										cell.get(`${d}|${r.site}`)?.clean_referring_domains ?? null,
								),
							}))}
							height={200}
							format={n => String(Math.round(n))}
						/>
					</section>
					<section>
						<h2>
							Authority over time{' '}
							<span className="mini">DataForSEO, 0 to 1,000</span>
						</h2>
						<LineChart
							labels={days}
							series={rows.map(r => ({
								name: r.label,
								color: colorOf(r.site),
								values: days.map(d => cell.get(`${d}|${r.site}`)?.rank ?? null),
							}))}
							height={180}
							format={n => String(Math.round(n))}
						/>
					</section>
				</>
			) : null}
		</>
	)
}

/* ------------------------------------------------------------------------ */
/* New and lost links                                                       */
/* ------------------------------------------------------------------------ */

function NewAndLost({
	crawler,
	chosen,
}: {
	crawler: Crawler
	chosen: Set<string>
}) {
	const gains = crawler.gains.filter(g => chosen.has(g.target))
	const losses = crawler.losses.filter(l => chosen.has(l.target))
	// The first week counts the whole backlog found when tracking began.
	const seedWeek = [...crawler.gains.map(g => g.week)].sort()[0]
	const weeks = [
		...new Set([...gains.map(g => g.week), ...losses.map(l => l.week)]),
	]
		.filter(w => w !== seedWeek)
		.sort()
	const targets = OUR_SITES.filter(s => chosen.has(s.site)).map(s => s.site)
	const gained = new Map(gains.map(g => [`${g.week}|${g.target}`, g.gained]))
	const lostBy = new Map(losses.map(l => [`${l.week}|${l.target}`, l.lost]))
	const newest = crawler.newest.filter(l => chosen.has(l.target))
	const lost = crawler.lost.filter(l => chosen.has(l.target))
	return (
		<>
			<section>
				<h2>
					Linking sites gained, per week{' '}
					<span className="mini">new minus lost, spam left out</span>
				</h2>
				{weeks.length ? (
					<BarChart
						labels={weeks}
						series={targets.map(t => ({
							name: labelOf(t),
							color: colorOf(t),
							values: weeks.map(
								w =>
									(gained.get(`${w}|${t}`) ?? 0) -
									(lostBy.get(`${w}|${t}`) ?? 0),
							),
						}))}
						height={190}
						tickEvery={1}
						format={n => String(Math.round(n))}
					/>
				) : (
					<p className="note">No weeks to show yet.</p>
				)}
				<p className="note">
					Each bar is one week: sites that started linking minus sites that
					stopped. The week tracking began ({seedWeek ?? 'the first week'}) is
					left out, because it counted every link that already existed. The
					crawler usually finds a new link 1 to 3 weeks after it goes live.
				</p>
			</section>

			<section>
				<h2>
					Newest linking sites{' '}
					<span className="mini">{newest.length} most recent</span>
				</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Linking site</th>
								<th>Links to</th>
								<th className="num">Its authority</th>
								<th className="num">First seen</th>
							</tr>
						</thead>
						<tbody>
							{newest.map(l => (
								<tr key={`${l.target}|${l.domain}`}>
									<td>{l.domain}</td>
									<td className="mini">{labelOf(l.target)}</td>
									<td className="num">{l.rank ?? '-'}</td>
									<td className="num">{l.first_seen}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>
					Lost linking sites{' '}
					<span className="mini">no longer seen by the crawler</span>
				</h2>
				{lost.length ? (
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Linking site</th>
									<th>Linked to</th>
									<th className="num">Its authority</th>
									<th className="num">Last seen</th>
								</tr>
							</thead>
							<tbody>
								{lost.map(l => (
									<tr key={`${l.target}|${l.domain}`}>
										<td className="bad">{l.domain}</td>
										<td className="mini">{labelOf(l.target)}</td>
										<td className="num">{l.rank ?? '-'}</td>
										<td className="num">{l.last_seen}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="note">No linking sites lost since tracking began.</p>
				)}
			</section>
		</>
	)
}

/* ------------------------------------------------------------------------ */
/* Google's report                                                          */
/* ------------------------------------------------------------------------ */

function GoogleReport({ brands }: { brands: Data['brands'] }) {
	if (!brands.some(b => b.current))
		return (
			<p className="note">
				No snapshot yet. The Mac mini pushes one every morning at 04:45 from{' '}
				<code>~/outreach/gsc-links.py</code>; run <code>gsc-links.py push</code>{' '}
				there to fill this now.
			</p>
		)
	return (
		<>
			<p className="lede">
				Google's own list of the websites that link to each site, read from
				Search Console every morning. Google refreshes this list in batches,
				weeks apart, so a new link can take a month or more to appear here.
			</p>
			{brands.map(b => {
				const c = b.current
				if (!c)
					return (
						<section key={b.key}>
							<h2>{b.label}</h2>
							<p className="note">No snapshot for this property yet.</p>
						</section>
					)
				const real = b.links.filter(l => !l.spam && !l.ours)
				const dropped = b.links.filter(l => l.spam || l.ours)
				const coverage = c.ourLiveLinks
					? Math.round((c.pickedUp / c.ourLiveLinks) * 100)
					: null
				const worstSpam = b.links
					.filter(l => l.spam)
					.sort((x, y) => (y.linkingPages ?? 0) - (x.linkingPages ?? 0))[0]
				return (
					<section key={b.key}>
						<h2>{b.label}</h2>
						<div className="tiles">
							<StatTile
								label="Real linking sites"
								value={String(c.realSites)}
								whisper={`${c.sites} listed by Google, ${c.sites - c.realSites} not counted`}
							/>
							<StatTile
								label="Linking pages"
								value={String(c.linkingPages)}
								whisper={
									worstSpam
										? `${worstSpam.root} alone: ${worstSpam.linkingPages ?? 0}`
										: undefined
								}
							/>
							<StatTile
								label="Our placements Google lists"
								value={
									c.ourLiveLinks ? `${c.pickedUp} of ${c.ourLiveLinks}` : '-'
								}
								whisper={
									coverage == null
										? undefined
										: `${coverage}% of what the ledger calls live`
								}
								tone={coverage != null && coverage < 25 ? 'bad' : undefined}
							/>
							<StatTile
								label="Since the last pull"
								value={`+${b.gained.length} / −${b.lost.length}`}
								whisper={
									b.gained.length
										? `new: ${b.gained.slice(0, 3).join(', ')}`
										: 'no new sites'
								}
							/>
						</div>
						{b.history.length > 1 ? (
							<LineChart
								labels={b.history.map(h => h.day.slice(5))}
								height={190}
								format={(n: number) => String(Math.round(n))}
								series={[
									{
										name: 'Real linking sites',
										color: SERIES[0]!,
										values: b.history.map(h => h.real),
									},
									{
										name: 'Our placements Google lists',
										color: SERIES[1]!,
										values: b.history.map(h => h.pickedUp),
									},
									{
										name: 'Everything Google lists',
										color: SERIES[2]!,
										values: b.history.map(h => h.all),
									},
								]}
							/>
						) : (
							<p className="note">
								One snapshot so far, so there is no line to draw yet. The mini
								adds one every morning.
							</p>
						)}
						<p className="note">
							Pulled{' '}
							{new Date(c.pulledAt).toLocaleString('en-US', {
								timeZone: TIME_ZONE,
							})}
							. Not counted: {c.spamSites} spam, {c.oursSites} ours,{' '}
							{c.searchSites} search engines.
						</p>
						<div className="rtable-wrap">
							<table className="rtable">
								<thead>
									<tr>
										<th>Linking site</th>
										<th className="num">Linking pages</th>
										<th>What it is</th>
										<th>Ours?</th>
									</tr>
								</thead>
								<tbody>
									{real.map(l => (
										<tr key={l.site}>
											<td>{l.site}</td>
											<td className="num">{l.linkingPages ?? '-'}</td>
											<td>{l.klass ?? 'unclassified'}</td>
											<td>{l.isOurLink ? 'placed by us' : ''}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{dropped.length ? (
							<details className="how">
								<summary>{dropped.length} not counted</summary>
								<div className="rtable-wrap">
									<table className="rtable">
										<tbody>
											{dropped.map(l => (
												<tr key={l.site}>
													<td>{l.site}</td>
													<td className="num">{l.linkingPages ?? '-'}</td>
													<td>{l.spam ? 'spam' : 'ours'}</td>
													<td>{l.klass ?? ''}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</details>
						) : null}
					</section>
				)
			})}
		</>
	)
}

/* ------------------------------------------------------------------------ */
/* Google crawl status                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Which linking pages Google has in its index. Confirmed = the first day a
 * site: query returned the page; expect rank effects 2 to 6 weeks after that
 * date, not at once. Unconfirmed pages are re-checked every 3 days.
 */
function CrawlStatus({
	crawler,
	chosen,
}: {
	crawler: Crawler
	chosen: Set<string>
}) {
	const rows = crawler.pages.filter(p => chosen.has(p.target))
	const confirmed = rows.filter(r => r.google_indexed_confirmed).length
	return (
		<section>
			<h2>
				Is each linking page in Google's index?{' '}
				<span className="mini">
					{confirmed} of {rows.length} confirmed
				</span>
			</h2>
			<div className="tiles">
				<StatTile
					label="In Google's index"
					value={String(confirmed)}
					tone="good"
					whisper="linking pages confirmed"
				/>
				<StatTile
					label="Not yet"
					value={String(rows.length - confirmed)}
					tone={rows.length - confirmed ? 'bad' : undefined}
					whisper="re-checked every 3 days"
				/>
			</div>
			<div className="rtable-wrap">
				<table className="rtable">
					<thead>
						<tr>
							<th>Linking page</th>
							<th>Links to</th>
							<th className="num">Followed link</th>
							<th className="num">Link found</th>
							<th className="num">In Google's index since</th>
						</tr>
					</thead>
					<tbody>
						{rows.map(r => (
							<tr key={`${r.target}|${r.url_from}`}>
								<td>
									<a href={r.url_from} target="_blank" rel="noreferrer">
										{r.domain}
									</a>
								</td>
								<td className="mini">{labelOf(r.target)}</td>
								<td className="num">
									{r.dofollow == null ? '-' : r.dofollow ? 'yes' : 'no'}
								</td>
								<td className="num">{r.first_seen}</td>
								<td
									className={`num ${r.google_indexed_confirmed ? 'good' : 'bad'}`}
								>
									{r.google_indexed_confirmed ?? 'not yet'}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="note">
				A page counts as confirmed on the first day a site: search on Google
				returned it, so Google had crawled it by then (checks began 2026-08-01;
				pages confirmed on the first check were crawled earlier). A link on a
				page Google has not indexed does little. Rankings take in a new link
				slowly: look for movement on the Rankings page 2 to 6 weeks after the
				confirmation date. A followed link is one without a nofollow mark; both
				kinds count as a mention.
			</p>
		</section>
	)
}

/* ------------------------------------------------------------------------ */
/* Against competitors                                                      */
/* ------------------------------------------------------------------------ */

/** Our main site's authority and linking sites against the tracked Knoxville competitors. */
function Competitors({ crawler }: { crawler: Crawler }) {
	const { summary, rivals } = crawler
	if (!rivals.length) return <p className="note">No competitor captures yet.</p>
	const MAIN = OUR_SITES[0].site
	const us = summary.filter(r => r.target === MAIN)
	const all = [...us.map(r => ({ ...r, domain: MAIN })), ...rivals]
	const days = [...new Set(all.map(r => r.day))].sort()
	const latest = days[days.length - 1]
	const cell = new Map(all.map(r => [`${r.day}|${r.domain}`, r]))
	// Us first, then competitors by latest authority. Rows are day-ordered, so
	// the last write per domain is its newest rank.
	const newestRank = new Map<string, number>()
	for (const r of rivals) newestRank.set(r.domain, Number(r.rank ?? 0))
	const domains = [
		MAIN,
		...[...new Set(rivals.map(r => r.domain))].sort(
			(a, b) => (newestRank.get(b) ?? 0) - (newestRank.get(a) ?? 0),
		),
	]
	const latestRow = (d: string) =>
		cell.get(`${latest}|${d}`) ?? [...all].reverse().find(r => r.domain === d)
	return (
		<section>
			<h2>
				{OUR_SITES[0].label} against Knoxville competitors{' '}
				<span className="mini">DataForSEO, every 3 days</span>
			</h2>
			<LineChart
				labels={days}
				series={domains.map((d, i) => ({
					name: d === MAIN ? 'us' : d.replace(/^www\./, ''),
					color: SERIES[i % SERIES.length]!,
					values: days.map(day => cell.get(`${day}|${d}`)?.rank ?? null),
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
							<th className="num">Linking sites</th>
							<th className="num">All linking sites</th>
							<th className="num">Spam</th>
							<th className="num">Links</th>
						</tr>
					</thead>
					<tbody>
						{domains.map(d => {
							const r = latestRow(d)
							const mine = d === MAIN
							return (
								<tr key={d} className={mine ? 'ours' : undefined}>
									<td>
										{d.replace(/^www\./, '')}
										{mine ? <strong> (us)</strong> : null}
									</td>
									<td className="num">{r?.rank ?? '-'}</td>
									<td className="num">
										<strong>{r?.clean_referring_domains ?? '-'}</strong>
									</td>
									<td className="num">{r?.referring_domains ?? '-'}</td>
									<td className="num">{r?.spam_referring_domains ?? '-'}</td>
									<td className="num">{r?.backlinks ?? '-'}</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
			<p className="note">
				As of {latest}. Linking sites leave out spam (a spam score of 25 or
				more), the same as on the Summary tab; all linking sites and spam are
				shown for comparison. Links counts every single link, so one website
				with thousands of links inflates it. Competitor tracking started
				2026-07-31.
			</p>
		</section>
	)
}
