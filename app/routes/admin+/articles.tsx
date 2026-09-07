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
			editedAt: true,
			_count: { select: { images: true } },
		},
	})
	return json({
		articles: rows.map(r => ({
			...r,
			imageCount: r._count.images,
			group: articleGroup({
				kind: r.kind,
				status: r.status,
				isReference: r.isReference,
				imageCount: r._count.images,
				outreachStatus: r.outreachStatus,
				writer: r.writer,
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

export default function ArticlesAdmin() {
	const { articles } = useLoaderData<typeof loader>()
	const byGroup = new Map<ArticleGroupKey, typeof articles>()
	for (const a of articles) {
		const list = byGroup.get(a.group) ?? []
		list.push(a)
		byGroup.set(a.group, list)
	}
	const toReview = byGroup.get('review')?.length ?? 0

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-2xl font-bold">Articles</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Everything written under the practice's name: guest articles for other
					publications and guides for our own blog. Nothing goes out until it is
					approved here.
					{toReview > 0
						? ` ${toReview} ${toReview === 1 ? 'article is' : 'articles are'} waiting for you.`
						: ''}
				</p>
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
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="text-left text-xs uppercase text-muted-foreground">
									<tr>
										<th className="px-4 py-2">Title</th>
										<th className="px-4 py-2">Where it goes</th>
										<th className="px-4 py-2">Writer</th>
										<th className="px-4 py-2 text-right">Words</th>
										<th className="px-4 py-2 text-right">Pictures</th>
										<th className="px-4 py-2">Received</th>
										<th className="px-4 py-2">State</th>
									</tr>
								</thead>
								<tbody>
									{list.map(a => (
										<tr key={a.id} className="border-t align-top">
											<td className="px-4 py-3">
												<Link
													to={`/admin/articles/${a.id}`}
													className="font-medium text-primary hover:underline"
												>
													{a.title}
												</Link>
												{a.editedAt ? (
													<span className="ml-2 text-xs text-muted-foreground">
														edited
													</span>
												) : null}
											</td>
											<td className="px-4 py-3">
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
											</td>
											<td className="px-4 py-3">{writerLabel(a.writer)}</td>
											<td className="px-4 py-3 text-right">{a.wordCount ?? ''}</td>
											<td className="px-4 py-3 text-right">{a.imageCount}</td>
											<td className="px-4 py-3 whitespace-nowrap">
												{formatDate(a.receivedAt)}
											</td>
											<td className="px-4 py-3">
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
												) : a.group === 'sent' ? (
													<span className="text-muted-foreground">
														{a.outreachStatus === 'live' ? 'Live' : 'Sent'}
													</span>
												) : (
													<Link
														to={`/admin/articles/${a.id}`}
														className="inline-flex items-center gap-1 text-primary hover:underline"
													>
														<Icon name="pencil-1" className="h-4 w-4" /> Review
													</Link>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)
			})}
		</div>
	)
}
