import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { reviewerName } from '#app/utils/articles.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { aboutMinutes } from '#app/utils/review-aid.ts'
import {
	cardReadSeconds,
	EDITING_HOLD_MS,
	getReviewLane,
	waitsOnPictures,
} from '#app/utils/review-queue.server.ts'
import {
	hasOpenQuestion,
	isSentBeforeReview,
	loadCards,
	loadQueueRows,
	whereLabel,
	type QueueRow,
} from './_shared.server.ts'

/**
 * S12, "All articles": a stacked list in groups. The only place counts
 * appear, and only as group headings. Tapping a row opens the article.
 */
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

type GroupKey =
	| 'fits'
	| 'change-in'
	| 'questions'
	| 'writer'
	| 'own-words'
	| 'approved'
	| 'denied'
	| 'rest'

/** Display order and headings. */
const GROUPS: ReadonlyArray<{ key: GroupKey; title: string; blurb?: string }> = [
	{ key: 'fits', title: 'Fits your time' },
	{ key: 'change-in', title: 'Your change is in' },
	{ key: 'questions', title: 'Questions I asked' },
	{ key: 'writer', title: 'Waiting on the writer' },
	{ key: 'own-words', title: 'Your own words', blurb: 'Best at a desk.' },
	{ key: 'approved', title: 'Approved' },
	{ key: 'denied', title: 'Do not publish' },
	{
		key: 'rest',
		title: 'The rest',
		blurb: 'Longer than your time, set aside for now, or waiting on pictures.',
	},
]

function toTime(value: Date | string | null | undefined): number {
	if (!value) return Number.NaN
	return new Date(value).getTime()
}

/** Which group a row belongs to. Decisions first, then her own asks, then the lane. */
function groupOf(
	a: QueueRow,
	fits: ReadonlySet<string>,
): GroupKey | null {
	if (isSentBeforeReview(a)) return null
	if (a.status === 'changes_requested') return 'writer'
	if (a.status === 'denied') return 'denied'
	if (a.status === 'approved') return 'approved'
	if (a.status !== 'pending') return null
	if (hasOpenQuestion(a)) return 'questions'
	// Own words before "change is in": an own-words row stays at the desk lane.
	if (a.isReference) return 'own-words'
	if (a.revisionNote) return 'change-in'
	if (fits.has(a.id)) return 'fits'
	return 'rest'
}

function stateOf(
	a: QueueRow,
	group: GroupKey,
	started: boolean,
	now: Date,
): string {
	switch (group) {
		case 'fits':
			return started ? 'Pick up where you left off' : 'Ready'
		case 'change-in':
			return 'Your change is in'
		case 'questions':
			return 'Asked Zane'
		case 'writer':
			return 'With the writer'
		case 'own-words':
			return 'Best at a desk'
		case 'approved':
			if (a.liveUrl || a.outreachStatus === 'live') return 'Live'
			if (a.outreachStatus === 'submitted') return 'Sent'
			return a.kind === 'blog' ? 'Live on your blog' : 'Approved'
		case 'denied':
			return 'Do not publish'
		case 'rest': {
			const skipped = toTime(a.skippedUntil)
			if (!Number.isNaN(skipped) && skipped > now.getTime()) return 'Set aside'
			if (waitsOnPictures(a)) return 'Waiting on pictures'
			const edited = toTime(a.editedAt)
			if (!Number.isNaN(edited) && now.getTime() - edited < EDITING_HOLD_MS)
				return 'Zane is editing it'
			return 'Longer than your time'
		}
	}
}

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const now = new Date()
	const lane = getReviewLane(request)
	const rows = await loadQueueRows()
	const cards = await loadCards(lane, now, {
		rows,
		ownEditsBy: await reviewerName(userId),
	})
	const fits = new Set(cards.map(c => c.article.id))
	const startedIds = new Set(cards.filter(c => c.started).map(c => c.article.id))

	const byGroup = new Map<GroupKey, Array<{
		id: string
		title: string
		where: string
		about: string
		state: string
	}>>()
	// the lane's own order first, then the rest by title
	const ordered = [
		...cards.map(c => c.article),
		...rows
			.filter(r => !fits.has(r.id))
			.sort((x, y) => x.title.localeCompare(y.title)),
	]
	for (const a of ordered) {
		const group = groupOf(a, fits)
		if (!group) continue
		const list = byGroup.get(group) ?? []
		list.push({
			id: a.id,
			title: a.title,
			where: whereLabel(a),
			about: aboutMinutes(cardReadSeconds(a)),
			state: stateOf(a, group, startedIds.has(a.id), now),
		})
		byGroup.set(group, list)
	}

	return json({
		lane,
		groups: GROUPS.map(g => ({ ...g, rows: byGroup.get(g.key) ?? [] })).filter(
			g => g.rows.length > 0,
		),
	})
}

export default function ReviewAll() {
	const { lane, groups } = useLoaderData<typeof loader>()
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-semibold">All articles</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Your time is set to {lane} min.{' '}
					<Link to="/review" className="text-primary underline-offset-2 hover:underline">
						Change it
					</Link>
				</p>
			</div>

			{groups.length === 0 ? (
				<p className="rounded-xl border bg-card p-6 text-center text-base shadow-sm">
					Nothing needs you today. The writers are working.
				</p>
			) : null}

			{groups.map(group => (
				<section key={group.key}>
					<h2 className="text-base font-semibold">
						{group.title}{' '}
						<span className="font-normal text-muted-foreground">
							({group.rows.length})
						</span>
					</h2>
					{group.blurb ? (
						<p className="mt-0.5 text-xs text-muted-foreground">{group.blurb}</p>
					) : null}
					<ul className="mt-2 divide-y rounded-xl border bg-card shadow-sm">
						{group.rows.map(row => (
							<li key={row.id}>
								<Link
									to={`/review/${row.id}`}
									className="block px-4 py-3 hover:bg-accent"
								>
									<p className="line-clamp-2 font-medium leading-snug">
										{row.title}
									</p>
									<p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
										<span>{row.where}</span>
										<span>·</span>
										<span>{row.about}</span>
										<span className="rounded-full bg-muted px-2 py-0.5 font-medium">
											{row.state}
										</span>
									</p>
								</Link>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	)
}
