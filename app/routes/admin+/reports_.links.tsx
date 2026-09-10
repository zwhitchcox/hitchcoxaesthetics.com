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
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { ReportPage, StatTile } from '#app/components/report-ui'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

const BRANDS = [
	{ key: 'sha', label: 'Sarah Hitchcox Aesthetics', site: 'hitchcoxaesthetics.com' },
	{ key: 'bk', label: 'Botox Knox', site: 'botoxknoxvilletn.com' },
	{ key: 'kwlc', label: 'Knoxville Weight Loss', site: 'weightlossknoxvilletn.com' },
] as const

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

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
				history: pulls
					.map(p => ({ at: p.pulledAt.toISOString().slice(0, 10), real: p.realSites, all: p.sites }))
					.reverse(),
				links,
				gained,
				lost,
			}
		}),
	)
	return json({ brands })
}

export default function LinksReport() {
	const { brands } = useLoaderData<typeof loader>()
	const any = brands.some(b => b.current)

	if (!any)
		return (
			<ReportPage title="Backlinks" subtitle="What Google says links to us">
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
