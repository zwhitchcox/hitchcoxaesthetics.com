import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { runPodcastTopicsJob } from '#app/utils/background-jobs.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type NewsItem } from '#app/utils/podcast-topics.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const [proposed, accepted, recorded, dismissedCount] = await Promise.all([
		prisma.podcastTopic.findMany({
			where: { status: 'proposed' },
			orderBy: [{ createdAt: 'desc' }, { score: 'desc' }],
		}),
		prisma.podcastTopic.findMany({
			where: { status: 'accepted' },
			orderBy: { decidedAt: 'asc' },
		}),
		prisma.podcastTopic.findMany({
			where: { status: 'recorded' },
			orderBy: { decidedAt: 'desc' },
			take: 10,
		}),
		prisma.podcastTopic.count({ where: { status: 'dismissed' } }),
	])
	return json({ proposed, accepted, recorded, dismissedCount })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const intent = formData.get('intent')?.toString()

	if (intent === 'mine-now') {
		runPodcastTopicsJob().catch(console.error)
		return json({
			ok: true,
			message: 'Looking for new ideas. Refresh in a minute or two.',
		})
	}

	const topicId = formData.get('topicId')?.toString()
	if (!topicId) return json({ ok: false }, { status: 400 })
	const statusByIntent: Record<string, string> = {
		accept: 'accepted',
		dismiss: 'dismissed',
		'back-to-feed': 'proposed',
		recorded: 'recorded',
	}
	const status = intent ? statusByIntent[intent] : undefined
	if (!status) return json({ ok: false }, { status: 400 })
	await prisma.podcastTopic.update({
		where: { id: topicId },
		data: { status, decidedAt: new Date() },
	})
	return json({ ok: true })
}

type Topic = ReturnType<typeof useLoaderData<typeof loader>>['proposed'][number]

function parseSources(topic: Topic): NewsItem[] {
	try {
		const parsed = JSON.parse(topic.sourcesJson) as NewsItem[]
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function parseQuestions(topic: Topic): string[] {
	try {
		const parsed = JSON.parse(topic.questionsJson) as string[]
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function OutlineText({ outline }: { outline: string }) {
	return (
		<ul className="mt-2 space-y-1 text-sm text-muted-foreground">
			{outline
				.split('\n')
				.map(line => line.replace(/^[-*]\s*/, '').trim())
				.filter(Boolean)
				.map((line, index) => (
					<li key={index} className="flex gap-2">
						<span aria-hidden>•</span>
						<span>{line}</span>
					</li>
				))}
		</ul>
	)
}

function TopicActions({
	topic,
	actions,
}: {
	topic: Topic
	actions: Array<{ intent: string; label: string; variant?: 'default' | 'outline' | 'ghost' }>
}) {
	const fetcher = useFetcher()
	const busy = fetcher.state !== 'idle'
	return (
		<div className="flex shrink-0 gap-2">
			{actions.map(action => (
				<fetcher.Form key={action.intent} method="post">
					<input type="hidden" name="topicId" value={topic.id} />
					<input type="hidden" name="intent" value={action.intent} />
					<Button
						type="submit"
						size="sm"
						variant={action.variant ?? 'default'}
						disabled={busy}
					>
						{action.label}
					</Button>
				</fetcher.Form>
			))}
		</div>
	)
}

function TopicCard({
	topic,
	actions,
}: {
	topic: Topic
	actions: Array<{ intent: string; label: string; variant?: 'default' | 'outline' | 'ghost' }>
}) {
	const sources = parseSources(topic)
	const questions = parseQuestions(topic)
	return (
		<div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold">{topic.title}</h3>
					{topic.hook ? (
						<p className="mt-1 text-sm text-muted-foreground">{topic.hook}</p>
					) : null}
				</div>
				<TopicActions topic={topic} actions={actions} />
			</div>
			{topic.outline ? <OutlineText outline={topic.outline} /> : null}
			{questions.length > 0 ? (
				<div className="mt-4">
					<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Clients are asking
					</h4>
					<ul className="mt-1 space-y-1 text-sm">
						{questions.map((question, index) => (
							<li key={index} className="italic">
								&ldquo;{question}&rdquo;
							</li>
						))}
					</ul>
				</div>
			) : null}
			{sources.length > 0 ? (
				<div className="mt-4">
					<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Source articles
					</h4>
					<ul className="mt-1 space-y-1 text-sm">
						{sources.map((source, index) => (
							<li key={index}>
								<a
									href={source.url}
									target="_blank"
									rel="noreferrer"
									className="text-primary underline-offset-2 hover:underline"
								>
									{source.title}
								</a>{' '}
								<span className="text-muted-foreground">
									({source.publisher})
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
			<div className="mt-3 text-xs text-muted-foreground">
				Suggested {new Date(topic.createdAt).toLocaleDateString()} · idea
				strength {topic.score}/10
			</div>
		</div>
	)
}

export default function PodcastAdmin() {
	const { proposed, accepted, recorded, dismissedCount } =
		useLoaderData<typeof loader>()
	const mineFetcher = useFetcher<{ message?: string }>()

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h2 className="text-2xl font-semibold">Podcast ideas</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Episode ideas from industry news and what clients ask us. Accept
						the ones you want to record; dismiss the rest and they stay gone.
					</p>
				</div>
				<mineFetcher.Form method="post">
					<input type="hidden" name="intent" value="mine-now" />
					<Button
						type="submit"
						variant="outline"
						disabled={mineFetcher.state !== 'idle'}
					>
						<Icon name="update" className="mr-2">
							Find new ideas now
						</Icon>
					</Button>
				</mineFetcher.Form>
			</div>
			{mineFetcher.data?.message ? (
				<p className="rounded-md border bg-muted p-3 text-sm">
					{mineFetcher.data.message}
				</p>
			) : null}

			{accepted.length > 0 ? (
				<section>
					<h3 className="mb-3 text-lg font-medium">
						Ready to record ({accepted.length})
					</h3>
					<div className="space-y-4">
						{accepted.map(topic => (
							<TopicCard
								key={topic.id}
								topic={topic}
								actions={[
									{ intent: 'recorded', label: 'Mark recorded' },
									{
										intent: 'back-to-feed',
										label: 'Back to ideas',
										variant: 'outline',
									},
								]}
							/>
						))}
					</div>
				</section>
			) : null}

			<section>
				<h3 className="mb-3 text-lg font-medium">
					New ideas ({proposed.length})
				</h3>
				{proposed.length === 0 ? (
					<p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
						No new ideas right now. The finder runs on its own every few days,
						or press &ldquo;Find new ideas now&rdquo;.
					</p>
				) : (
					<div className="space-y-4">
						{proposed.map(topic => (
							<TopicCard
								key={topic.id}
								topic={topic}
								actions={[
									{ intent: 'accept', label: 'Accept' },
									{ intent: 'dismiss', label: 'Dismiss', variant: 'outline' },
								]}
							/>
						))}
					</div>
				)}
			</section>

			{recorded.length > 0 ? (
				<section>
					<h3 className="mb-3 text-lg font-medium">Recorded</h3>
					<div className="space-y-2">
						{recorded.map(topic => (
							<div
								key={topic.id}
								className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2 text-sm"
							>
								<span>{topic.title}</span>
								<span className="text-xs text-muted-foreground">
									{topic.decidedAt
										? new Date(topic.decidedAt).toLocaleDateString()
										: ''}
								</span>
							</div>
						))}
					</div>
				</section>
			) : null}

			<p className="text-xs text-muted-foreground">
				{dismissedCount} dismissed ideas are remembered so they will not be
				suggested again.
			</p>
		</div>
	)
}
