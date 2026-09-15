import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import { reviewerName } from '#app/utils/articles.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { aboutMinutes, splitParagraphs } from '#app/utils/review-aid.ts'
import {
	clearReviewSitting,
	getReviewLane,
	getReviewSitting,
	parseLane,
	setReviewLane,
} from '#app/utils/review-queue.server.ts'
import {
	approvedSince,
	loadCards,
	weekCounts,
	whereLabel,
} from './_shared.server.ts'

/**
 * S2, "Next one": the time picker and one card. S8, "That is plenty", shows
 * here after a decision that spent the sitting (?plenty=1). No counters,
 * no ages, no money.
 */
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/** The same values as REVIEW_LANES; that module is server only. */
const LANES = [2, 5, 10] as const

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const url = new URL(request.url)
	const now = new Date()
	const lane = getReviewLane(request)
	const sitting = getReviewSitting(request, lane, now)
	const cards = await loadCards(lane, now, {
		ownEditsBy: await reviewerName(userId),
	})
	const top = cards[0] ?? null

	// "Pick up where you left off": how far she got, as a share of the text
	let progress: number | null = null
	if (top?.started) {
		const row = await prisma.article.findUnique({
			where: { id: top.article.id },
			select: { body: true },
		})
		const count = row ? splitParagraphs(row.body).length : 0
		progress =
			count > 0
				? Math.min(1, ((top.article.readToParagraph ?? 0) + 1) / count)
				: null
	}

	const plenty =
		url.searchParams.get('plenty') === '1'
			? { approved: await approvedSince(new Date(sitting.startedAt)) }
			: null
	const week = await weekCounts(now)

	return json({
		lane,
		plenty,
		week,
		card: top
			? {
					id: top.article.id,
					title: top.article.title,
					where: whereLabel(top.article),
					about: aboutMinutes(top.readSeconds),
					holding: top.article.kind === 'guest' && top.article.publisherWaiting,
					started: top.started,
					progress,
				}
			: null,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const form = await request.formData()
	const intent = String(form.get('intent') ?? '')
	if (intent === 'lane') {
		const lane = parseLane(form.get('lane'))
		return redirect('/review', {
			headers: { 'set-cookie': setReviewLane(lane) },
		})
	}
	if (intent === 'stop') {
		return redirect('/review', {
			headers: { 'set-cookie': clearReviewSitting() },
		})
	}
	return json({ error: 'Unknown action.' }, { status: 400 })
}

export default function ReviewHome() {
	const { lane, card, plenty, week } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'

	return (
		<div className="flex flex-1 flex-col gap-6">
			<section>
				<p className="text-sm font-medium text-muted-foreground">
					How long do you have?
				</p>
				<Form method="post" className="mt-2 flex gap-2">
					<input type="hidden" name="intent" value="lane" />
					{LANES.map(l => (
						<button
							key={l}
							type="submit"
							name="lane"
							value={l}
							disabled={busy}
							aria-pressed={l === lane}
							className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
								l === lane
									? 'border-primary bg-primary text-primary-foreground'
									: 'bg-background hover:bg-accent'
							}`}
						>
							{`${l} min`}
						</button>
					))}
				</Form>
			</section>

			{plenty ? (
				<Plenty approved={plenty.approved} nextId={card?.id ?? null} busy={busy} />
			) : card ? (
				<NextCard card={card} />
			) : (
				<Empty />
			)}

			<div className="mt-auto space-y-2 pt-6">
				{week.done > 0 || week.live > 0 ? (
					<p className="text-sm text-muted-foreground">
						{`Done this week: ${week.done} · Live under your name: ${week.live}`}
					</p>
				) : null}
				<Link
					to="/review/all"
					className="inline-block text-sm text-primary underline-offset-2 hover:underline"
				>
					See all articles
				</Link>
			</div>
		</div>
	)
}

type Card = NonNullable<ReturnType<typeof useLoaderData<typeof loader>>['card']>

function NextCard({ card }: { card: Card }) {
	return (
		<section className="rounded-xl border bg-card p-4 shadow-sm">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Next one
			</p>
			<h2 className="mt-1 line-clamp-2 text-xl font-semibold leading-snug">
				{card.title}
			</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				{card.where} · {card.about}
			</p>
			{card.holding ? (
				<span className="mt-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
					Publisher holding a spot
				</span>
			) : null}
			{card.started ? (
				<>
					{card.progress !== null ? (
						<div
							className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted"
							role="progressbar"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={Math.round(card.progress * 100)}
							aria-label="How far you read"
						>
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${Math.round(card.progress * 100)}%` }}
							/>
						</div>
					) : null}
					<Button asChild size="lg" className="mt-4 w-full text-base">
						<Link to={`/review/${card.id}`}>Pick up where you left off</Link>
					</Button>
				</>
			) : (
				<Button asChild size="lg" className="mt-4 w-full text-base">
					<Link to={`/review/${card.id}`}>Start</Link>
				</Button>
			)}
		</section>
	)
}

function Empty() {
	return (
		<section className="rounded-xl border bg-card p-6 text-center shadow-sm">
			<p className="text-base">Nothing needs you today. The writers are working.</p>
		</section>
	)
}

function Plenty({
	approved,
	nextId,
	busy,
}: {
	approved: number
	nextId: string | null
	busy: boolean
}) {
	return (
		<section className="rounded-xl border bg-card p-6 text-center shadow-sm">
			<p className="text-lg font-medium">
				{approved > 0
					? `That is plenty for now. ${approved} approved.`
					: 'That is plenty for now.'}
			</p>
			<div className="mt-4 flex flex-col gap-2">
				<Form method="post">
					<input type="hidden" name="intent" value="stop" />
					<Button type="submit" size="lg" className="w-full text-base" disabled={busy}>
						Stop here
					</Button>
				</Form>
				{nextId ? (
					<Button asChild variant="outline" size="lg" className="w-full text-base">
						<Link to={`/review/${nextId}`}>One more anyway</Link>
					</Button>
				) : null}
			</div>
		</section>
	)
}
