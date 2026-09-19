/**
 * Backlinks: what GOOGLE says links to us, per brand.
 *
 * The Search Console API has no links report, so ~/outreach/gsc-links.py on the Mac mini reads the
 * report in a signed-in browser every morning and pushes each snapshot to /resources/gsc-links-sync.
 * This page reads those snapshots.
 *
 * The number that matters is not the raw count. Google's list includes auto-generated spam, our own
 * network, and search engines, and one spam domain can supply half the linking pages. So the headline
 * here is REAL third-party referring domains, with everything else shown separately rather than
 * quietly folded in.
 */
import { json, type LoaderFunctionArgs, type SerializeFrom } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { BarChart, LineChart, ReportPage, SERIES, StatTile } from '#app/components/report-ui'
import { findReviewerUser } from '#app/utils/article-reminder.server.ts'
import { zoneDayStart } from '#app/utils/article-reminder.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	bucketReviewActivity,
	REVIEW_DECISION_KINDS,
} from '#app/utils/review-activity.ts'
import { loadWaiting } from '#app/utils/review-waiting.server.ts'

const TIME_ZONE = 'America/New_York'
const REVIEW_DAYS = 30

const BRANDS = [
	{ key: 'sha', label: 'Sarah Hitchcox Aesthetics', site: 'hitchcoxaesthetics.com' },
	{ key: 'bk', label: 'Botox Knox', site: 'botoxknoxvilletn.com' },
	{ key: 'kwlc', label: 'Knoxville Weight Loss', site: 'weightlossknoxvilletn.com' },
] as const

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	// Sarah's reviews per day. The articles behind the backlinks are hers to
	// approve, so how many she decides each day is the pace of this whole page.
	const now = new Date()
	const reviewer = await findReviewerUser()
	const days = bucketReviewActivity([], TIME_ZONE, REVIEW_DAYS, now)
	const since = zoneDayStart(days[0]!.day, TIME_ZONE)
	const [events, decidedAllTime, waiting] = reviewer
		? await Promise.all([
				prisma.articleReviewEvent.findMany({
					where: { userId: reviewer.id, at: { gte: since } },
					select: { articleId: true, kind: true, at: true },
				}),
				prisma.articleReviewEvent.count({
					where: { userId: reviewer.id, kind: { in: [...REVIEW_DECISION_KINDS] } },
				}),
				loadWaiting(now),
			])
		: [[], 0, null]
	const reviews = {
		name: reviewer?.name?.trim() || 'Sarah',
		found: reviewer != null,
		days: bucketReviewActivity(events, TIME_ZONE, REVIEW_DAYS, now),
		decidedAllTime,
		waiting: waiting ? waiting.articles.length : null,
	}

	const brands = await Promise.all(
		BRANDS.map(async brand => {
			const pulls = await prisma.gscLinkPull.findMany({
				where: { property: brand.key },
				orderBy: { pulledAt: 'desc' },
				take: 30,
				select: {
					id: true, pulledAt: true, sites: true, linkingPages: true, realSites: true,
					spamSites: true, oursSites: true, searchSites: true, ourLiveLinks: true, pickedUp: true,
				},
			})
			const current = pulls[0] ?? null
			const links = current
				? await prisma.gscLinkSite.findMany({
						where: { pullId: current.id },
						orderBy: [{ linkingPages: 'desc' }, { root: 'asc' }],
						select: { site: true, root: true, linkingPages: true, klass: true, spam: true, ours: true, isOurLink: true },
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
				...brand,
				current: current
					? { ...current, pulledAt: current.pulledAt.toISOString() }
					: null,
				// One point per day: several pulls can land on the same date (a backfill, a re-run),
				// and a trend line with four dots on one day reads as movement that never happened.
				history: (() => {
					const byDay = new Map<string, { day: string; real: number; all: number; pickedUp: number }>()
					for (const p of [...pulls].reverse()) {
						const day = p.pulledAt.toISOString().slice(0, 10)
						byDay.set(day, { day, real: p.realSites, all: p.sites, pickedUp: p.pickedUp })
					}
					return [...byDay.values()]
				})(),
				links,
				gained,
				lost,
			}
		}),
	)
	return json({ brands, reviews })
}

function ReviewPace({ reviews }: { reviews: SerializeFrom<typeof loader>['reviews'] }) {
	const today = reviews.days.at(-1)
	const week = reviews.days.slice(-7)
	const decidedWeek = week.reduce((n, d) => n + d.decided, 0)
	const workedWeek = week.reduce((n, d) => n + d.worked, 0)
	const activeDays = reviews.days.filter(d => d.worked > 0).length
	return (
		<section style={{ marginBottom: 34 }}>
			<h2>{reviews.name}'s reviews</h2>
			{!reviews.found ? (
				<p className="note">No reviewer account is set up, so there is nothing to count yet.</p>
			) : (
				<>
					<div className="tiles">
						<StatTile
							label="Decided today"
							value={String(today?.decided ?? 0)}
							whisper={today?.worked ? `${today.worked} article${today.worked === 1 ? '' : 's'} worked on` : 'nothing opened yet today'}
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
							tone={reviews.waiting != null && reviews.waiting > 20 ? 'bad' : undefined}
						/>
						<StatTile
							label="Decided all time"
							value={String(reviews.decidedAllTime)}
							whisper={`${activeDays} active day${activeDays === 1 ? '' : 's'} in the last ${REVIEW_DAYS}`}
						/>
					</div>
					<BarChart
						labels={reviews.days.map(d => d.day.slice(5))}
						height={170}
						format={(n: number) => String(Math.round(n))}
						tickEvery={5}
						showTotal={false}
						series={[
							{ name: 'Decided', color: SERIES[0]!, values: reviews.days.map(d => d.decided) },
							{ name: 'Articles worked on', color: SERIES[2]!, values: reviews.days.map(d => d.worked) },
						]}
					/>
					<p className="note">
						A decision is approve, ask for changes, ask for a different article, or turn down.
						Worked on means opened, read, edited, asked about or decided. Days are New York time.
					</p>
				</>
			)}
		</section>
	)
}

export default function LinksReport() {
	const { brands, reviews } = useLoaderData<typeof loader>()
	const any = brands.some(b => b.current)

	if (!any)
		return (
			<ReportPage title="Backlinks" subtitle="What Google says links to us">
				<ReviewPace reviews={reviews} />
				<p className="note">
					No snapshot yet. The Mac mini pushes one every morning at 04:45 from{' '}
					<code>~/outreach/gsc-links.py</code>; run <code>gsc-links.py push</code> there to fill
					this now.
				</p>
			</ReportPage>
		)

	return (
		<ReportPage
			title="Backlinks"
			subtitle="Google's own linking-sites report, per brand. Spam, our own network and search engines are counted out."
		>
			<ReviewPace reviews={reviews} />
			{brands.map(b => {
				const c = b.current
				if (!c)
					return (
						<section key={b.key} style={{ marginBottom: 28 }}>
							<h2>{b.label}</h2>
							<p className="note">No snapshot for this property yet.</p>
						</section>
					)
				const real = b.links.filter(l => !l.spam && !l.ours)
				const dropped = b.links.filter(l => l.spam || l.ours)
				const coverage = c.ourLiveLinks ? Math.round((c.pickedUp / c.ourLiveLinks) * 100) : null
				const worstSpam = b.links
					.filter(l => l.spam)
					.sort((x, y) => (y.linkingPages ?? 0) - (x.linkingPages ?? 0))[0]
				return (
					<section key={b.key} style={{ marginBottom: 34 }}>
						<h2>{b.label}</h2>
						<div className="tiles">
							<StatTile
								label="Real referring domains"
								value={String(c.realSites)}
								whisper={`${c.sites} listed by Google, ${c.sites - c.realSites} not counted`}
							/>
							<StatTile
								label="Linking pages"
								value={String(c.linkingPages)}
								whisper={worstSpam ? `${worstSpam.root} alone: ${worstSpam.linkingPages ?? 0}` : undefined}
							/>
							<StatTile
								label="Our links Google has seen"
								value={c.ourLiveLinks ? `${c.pickedUp} of ${c.ourLiveLinks}` : '-'}
								whisper={coverage == null ? undefined : `${coverage}% of what the ledger calls live`}
								tone={coverage != null && coverage < 25 ? 'bad' : undefined}
							/>
							<StatTile
								label="Since the last pull"
								value={`+${b.gained.length} / −${b.lost.length}`}
								whisper={b.gained.length ? `new: ${b.gained.slice(0, 3).join(', ')}` : 'no new domains'}
							/>
						</div>
						{b.history.length > 1 ? (
							<LineChart
								labels={b.history.map(h => h.day.slice(5))}
								height={190}
								format={(n: number) => String(Math.round(n))}
								series={[
									{ name: 'Real referring domains', color: SERIES[0]!, values: b.history.map(h => h.real) },
									{ name: 'Our links Google has seen', color: SERIES[1]!, values: b.history.map(h => h.pickedUp) },
									{ name: 'Everything Google lists', color: SERIES[2]!, values: b.history.map(h => h.all) },
								]}
							/>
						) : (
							<p className="note">
								One snapshot so far, so there is no line to draw yet. The mini adds one every morning.
							</p>
						)}
						<p className="note">
							Pulled {new Date(c.pulledAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}.
							Not counted: {c.spamSites} spam, {c.oursSites} ours, {c.searchSites} search engines.
						</p>
						<table>
							<thead>
								<tr>
									<th>Referring domain</th>
									<th style={{ textAlign: 'right' }}>Linking pages</th>
									<th>What it is</th>
									<th>Ours?</th>
								</tr>
							</thead>
							<tbody>
								{real.map(l => (
									<tr key={l.site}>
										<td>{l.site}</td>
										<td style={{ textAlign: 'right' }}>{l.linkingPages ?? '-'}</td>
										<td>{l.klass ?? 'unclassified'}</td>
										<td>{l.isOurLink ? 'placed by us' : ''}</td>
									</tr>
								))}
							</tbody>
						</table>
						{dropped.length ? (
							<details style={{ marginTop: 10 }}>
								<summary>{dropped.length} not counted</summary>
								<table>
									<tbody>
										{dropped.map(l => (
											<tr key={l.site}>
												<td>{l.site}</td>
												<td style={{ textAlign: 'right' }}>{l.linkingPages ?? '-'}</td>
												<td>{l.spam ? 'spam' : 'ours'}</td>
												<td>{l.klass ?? ''}</td>
											</tr>
										))}
									</tbody>
								</table>
							</details>
						) : null}
					</section>
				)
			})}
		</ReportPage>
	)
}
