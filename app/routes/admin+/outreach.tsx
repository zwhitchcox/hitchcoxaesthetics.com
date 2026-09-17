import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Icon } from '#app/components/ui/icon'
import {
	ARTICLE_GROUPS,
	articleGroup,
	destinationLabel,
	formatDate,
	type ArticleGroupKey,
} from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const rows = await prisma.article.findMany({
		orderBy: [{ receivedAt: 'desc' }],
		select: {
			id: true,
			kind: true,
			title: true,
			publication: true,
			publicationUrl: true,
			slug: true,
			writer: true,
			isReference: true,
			wordCount: true,
			status: true,
			outreachStatus: true,
			liveUrl: true,
			receivedAt: true,
			reviewedAt: true,
			reviewedBy: true,
			reviewNote: true,
			editedAt: true,
			question: true,
			questionAt: true,
			answer: true,
			incomingBody: true,
			incomingAt: true,
			rewriteRequested: true,
			_count: { select: { images: true } },
		},
	})
	return json({
		articles: rows.map(({ incomingBody, _count, ...r }) => ({
			...r,
			imageCount: _count.images,
			// Only the fact that new text is held. The text itself stays on the server.
			incoming: incomingBody != null,
			group: articleGroup({
				kind: r.kind,
				status: r.status,
				isReference: r.isReference,
				imageCount: _count.images,
				outreachStatus: r.outreachStatus,
				writer: r.writer,
				question: r.question,
				answer: r.answer,
			}),
		})),
	})
}

function writerLabel(writer: string | null) {
	if (!writer) return ''
	if (writer.startsWith('fable')) return 'Claude'
	if (writer === 'codex') return 'Codex'
	if (writer === 'zane') return 'Zane'
	return writer
}

/* One grid for the header row and every article row. Below md the row
   stacks: title, where it goes, a 2-column block of small facts, the state. */
const ROW_COLUMNS =
	'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_5rem_4rem_5rem_7rem_11rem]'

function CellLabel({ children }: { children: string }) {
	return (
		<span className="text-xs uppercase text-muted-foreground md:hidden">
			{children}{' '}
		</span>
	)
}

export default function OutreachAdmin() {
	const { articles } = useLoaderData<typeof loader>()
	const byGroup = new Map<ArticleGroupKey, typeof articles>()
	for (const a of articles) {
		const list = byGroup.get(a.group) ?? []
		list.push(a)
		byGroup.set(a.group, list)
	}
	const toReview = byGroup.get('review')?.length ?? 0
	const questions = byGroup.get('questions')?.length ?? 0

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="text-2xl font-bold">Outreach</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Everything written under the practice's name: guest articles for other
						publications and guides for our own blog. Nothing goes out until it is
						approved here.
						{toReview > 0
							? ` ${toReview} ${toReview === 1 ? 'article is' : 'articles are'} waiting for you.`
							: ''}
						{questions > 0
							? ` ${questions} ${questions === 1 ? 'question needs' : 'questions need'} an answer.`
							: ''}
					</p>
				</div>
				<Link
					to="/review"
					className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent"
				>
					<Icon name="phone" className="h-4 w-4" /> Open on your phone
				</Link>
			</div>

			{articles.length === 0 ? (
				<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
					Nothing here yet. Articles arrive from the writing system on their own,
					usually within 15 minutes of being finished.
				</div>
			) : null}

			{ARTICLE_GROUPS.map(group => {
				const list = byGroup.get(group.key) ?? []
				if (list.length === 0) return null
				return (
					<section key={group.key} className="rounded-lg border bg-card shadow">
						<div className="border-b px-4 py-3">
							<h3 className="text-lg font-semibold">
								{group.title}{' '}
								<span className="text-sm font-normal text-muted-foreground">
									({list.length})
								</span>
							</h3>
							{group.blurb ? (
								<p className="mt-1 text-sm text-muted-foreground">{group.blurb}</p>
							) : null}
						</div>
						<div
							className={`hidden gap-x-4 px-4 py-2 text-xs uppercase text-muted-foreground md:grid ${ROW_COLUMNS}`}
							aria-hidden="true"
						>
							<span>Title</span>
							<span>Where it goes</span>
							<span>Writer</span>
							<span className="text-right">Words</span>
							<span className="text-right">Pictures</span>
							<span>Received</span>
							<span>State</span>
						</div>
						<ul className="text-sm">
							{list.map(a => (
								<li
									key={a.id}
									className={`grid grid-cols-2 gap-x-4 gap-y-1 border-t px-4 py-3 md:items-start md:gap-y-0 ${ROW_COLUMNS}`}
								>
									<div className="col-span-2 break-words md:col-span-1">
										<Link
											to={`/admin/outreach/${a.id}`}
											className="font-medium text-primary hover:underline"
										>
											{a.title}
										</Link>
										{a.editedAt ? (
											<span className="ml-2 text-xs text-muted-foreground">
												edited
											</span>
										) : null}
										{a.incoming ? (
											<span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
												New text arrived
											</span>
										) : null}
										{a.group === 'questions' && a.question ? (
											<p className="mt-1 text-xs text-muted-foreground">
												Sarah asks: “{a.question}”
												{a.questionAt ? ` (${formatDate(a.questionAt)})` : ''}
											</p>
										) : null}
										{a.group === 'writer' && a.reviewNote ? (
											<p className="mt-1 text-xs text-muted-foreground">
												Her note: “{a.reviewNote}”
											</p>
										) : null}
									</div>
									<div className="col-span-2 break-words md:col-span-1">
										{a.kind === 'blog' ? (
											<span>
												Our blog
												<span className="block text-xs text-muted-foreground">
													/blog/{a.slug}
												</span>
											</span>
										) : a.publicationUrl ? (
											<a
												href={a.publicationUrl}
												target="_blank"
												rel="noreferrer"
												className="hover:underline"
											>
												{destinationLabel(a)}
											</a>
										) : (
											destinationLabel(a)
										)}
										{a.liveUrl ? (
											<a
												href={a.liveUrl}
												target="_blank"
												rel="noreferrer"
												className="block text-xs text-primary hover:underline"
											>
												live page
											</a>
										) : null}
									</div>
									<div>
										<CellLabel>Writer</CellLabel>
										{writerLabel(a.writer)}
									</div>
									<div className="md:text-right">
										<CellLabel>Words</CellLabel>
										{a.wordCount ?? ''}
									</div>
									<div className="md:text-right">
										<CellLabel>Pictures</CellLabel>
										{a.imageCount}
									</div>
									<div className="whitespace-nowrap">
										<CellLabel>Received</CellLabel>
										{formatDate(a.receivedAt)}
									</div>
									<div className="col-span-2 break-words md:col-span-1">
										<CellLabel>State</CellLabel>
										{a.status === 'approved' ? (
											<span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
												<Icon name="check" className="h-4 w-4" /> Approved
												{a.reviewedBy ? ` by ${a.reviewedBy}` : ''}
											</span>
										) : a.status === 'denied' ? (
											<span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
												<Icon name="cross-1" className="h-4 w-4" /> Denied
												{a.reviewedBy ? ` by ${a.reviewedBy}` : ''}
											</span>
										) : a.status === 'changes_requested' ? (
											<span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
												<Icon name="update" className="h-4 w-4" />{' '}
												{a.rewriteRequested ? 'New article coming' : 'Changes requested'}
												{a.reviewedBy ? ` by ${a.reviewedBy}` : ''}
											</span>
										) : a.group === 'questions' ? (
											<Link
												to={`/admin/outreach/${a.id}`}
												className="inline-flex items-center gap-1 text-primary hover:underline"
											>
												<Icon name="question-mark-circled" className="h-4 w-4" />{' '}
												Answer
											</Link>
										) : a.group === 'sent' ? (
											<span className="text-muted-foreground">
												{a.outreachStatus === 'live' ? 'Live' : 'Sent'}
											</span>
										) : (
											<Link
												to={`/admin/outreach/${a.id}`}
												className="inline-flex items-center gap-1 text-primary hover:underline"
											>
												<Icon name="pencil-1" className="h-4 w-4" /> Review
											</Link>
										)}
									</div>
								</li>
							))}
						</ul>
					</section>
				)
			})}
		</div>
	)
}
