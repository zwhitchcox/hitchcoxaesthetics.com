import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { useState } from 'react'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { reviewerName } from '#app/utils/articles.server.ts'
import {
	articleGroup,
	countWords,
	destinationLabel,
	formatDate,
	missingLinks,
	parseLinks,
	statusLabel,
} from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { redirectWithToast } from '#app/utils/toast.server.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const article = await prisma.article.findUnique({
		where: { id: params.articleId ?? '' },
		include: {
			images: {
				orderBy: { position: 'asc' },
				select: { id: true, altText: true, caption: true, fileName: true },
			},
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	return json({
		article: {
			...article,
			links: parseLinks(article.linksJson),
			group: articleGroup({
				kind: article.kind,
				status: article.status,
				isReference: article.isReference,
				imageCount: article.images.length,
				outreachStatus: article.outreachStatus,
				writer: article.writer,
			}),
		},
	})
}

export async function action({ params, request }: ActionFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const id = params.articleId ?? ''
	const article = await prisma.article.findUnique({
		where: { id },
		select: {
			id: true,
			kind: true,
			title: true,
			body: true,
			bodyOriginal: true,
			publishedAt: true,
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	const form = await request.formData()
	const intent = String(form.get('intent') ?? '')
	const rawBody = form.get('body')
	const body = typeof rawBody === 'string' ? rawBody.replace(/\r\n/g, '\n') : null
	const note = String(form.get('note') ?? '').trim()
	const who = await reviewerName(userId)
	const now = new Date()
	const textChange =
		body !== null && body.trim() !== article.body.trim()
			? { body, editedAt: now, editedBy: who }
			: {}

	switch (intent) {
		case 'save': {
			if (body === null || !body.trim()) {
				return json({ error: 'The article text cannot be empty.' }, { status: 400 })
			}
			await prisma.article.update({ where: { id }, data: textChange })
			return json({ ok: 'Saved.' })
		}
		case 'approve': {
			if (body !== null && !body.trim()) {
				return json({ error: 'The article text cannot be empty.' }, { status: 400 })
			}
			await prisma.article.update({
				where: { id },
				data: {
					...textChange,
					status: 'approved',
					reviewedAt: now,
					reviewedBy: who,
					reviewNote: note || null,
					publishedAt:
						article.kind === 'blog'
							? (article.publishedAt ?? now)
							: article.publishedAt,
				},
			})
			return redirectWithToast('/admin/articles', {
				type: 'success',
				title: 'Approved',
				description:
					article.kind === 'blog'
						? `"${article.title}" is now live on the blog.`
						: `"${article.title}" will be sent to the publisher.`,
			})
		}
		case 'deny': {
			if (!note) {
				return json(
					{ error: 'Add a short reason, so the writer knows what to change.' },
					{ status: 400 },
				)
			}
			await prisma.article.update({
				where: { id },
				data: {
					...textChange,
					status: 'denied',
					reviewedAt: now,
					reviewedBy: who,
					reviewNote: note,
				},
			})
			return redirectWithToast('/admin/articles', {
				type: 'message',
				title: 'Denied',
				description: `"${article.title}" will not be used.`,
			})
		}
		case 'restore': {
			await prisma.article.update({
				where: { id },
				data: { body: article.bodyOriginal, editedAt: null, editedBy: null },
			})
			return json({ ok: 'The original text is back.' })
		}
		case 'reopen': {
			await prisma.article.update({
				where: { id },
				data: { status: 'pending', reviewedAt: null, reviewedBy: null },
			})
			return json({ ok: 'Reopened. Approve or deny it again when you are ready.' })
		}
		default:
			return json({ error: 'Unknown action.' }, { status: 400 })
	}
}

export default function ArticleReview() {
	const { article } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'
	const error = actionData && 'error' in actionData ? actionData.error : null
	const ok = actionData && 'ok' in actionData ? actionData.ok : null
	const decided = article.status !== 'pending'

	return (
		<div className="space-y-6">
			<Link
				to="/admin/articles"
				className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"
			>
				<Icon name="arrow-left" className="mr-1 h-4 w-4" /> All articles
			</Link>

			<header>
				<h2 className="text-2xl font-bold">{article.title}</h2>
				{article.dek ? (
					<p className="mt-1 text-muted-foreground">{article.dek}</p>
				) : null}
				<p className="mt-2 text-sm text-muted-foreground">
					{article.kind === 'blog' ? (
						<>
							For our blog, at{' '}
							<span className="font-medium">
								{destinationLabel(article)}
							</span>
						</>
					) : (
						<>
							For{' '}
							{article.publicationUrl ? (
								<a
									href={article.publicationUrl}
									target="_blank"
									rel="noreferrer"
									className="font-medium hover:underline"
								>
									{destinationLabel(article)}
								</a>
							) : (
								<span className="font-medium">{destinationLabel(article)}</span>
							)}
						</>
					)}
					{article.byline ? <> · byline {article.byline}</> : null}
					<> · received {formatDate(article.receivedAt)}</>
					{article.liveUrl ? (
						<>
							{' '}
							·{' '}
							<a
								href={article.liveUrl}
								target="_blank"
								rel="noreferrer"
								className="text-primary hover:underline"
							>
								live page
							</a>
						</>
					) : null}
				</p>
			</header>

			{decided ? (
				<div
					className={`rounded-md border p-3 text-sm ${
						article.status === 'approved'
							? 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100'
							: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
					}`}
				>
					<p className="font-medium">
						{statusLabel(article.status)}
						{article.reviewedBy ? ` by ${article.reviewedBy}` : ''}
						{article.reviewedAt ? ` on ${formatDate(article.reviewedAt)}` : ''}.
					</p>
					{article.reviewNote ? <p className="mt-1">{article.reviewNote}</p> : null}
					<Form method="post" className="mt-2">
						<input type="hidden" name="intent" value="reopen" />
						<Button type="submit" variant="outline" size="sm" disabled={busy}>
							Reopen
						</Button>
					</Form>
				</div>
			) : article.reviewNote ? (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
					{article.reviewNote}
				</div>
			) : null}

			{article.group === 'reference' ? (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
					This publisher only takes human-written text. Please change this draft
					into your own words before approving. Your approved text is what gets
					sent, exactly as you leave it.
				</div>
			) : null}

			{article.group === 'sent' ? (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
					This one was sent to the publisher before this review step existed
					{article.outreachStatus === 'live' ? ' and is live' : ''}. It is here
					for the record. Changes on this page do not reach the publisher.
				</div>
			) : null}

			{article.images.length > 0 ? (
				<section>
					<h3 className="text-lg font-semibold">Pictures</h3>
					<p className="text-sm text-muted-foreground">
						{article.kind === 'blog'
							? 'The first picture is shown at the top of the guide.'
							: 'These go to the publisher with the article. Ask Zane to change one.'}
					</p>
					<div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{article.images.map(im => (
							<figure key={im.id} className="rounded-lg border bg-card p-2">
								<img
									src={`/resources/article-images/${im.id}`}
									alt={im.altText ?? ''}
									loading="lazy"
									className="aspect-[3/2] w-full rounded object-cover"
								/>
								{im.caption ? (
									<figcaption className="mt-2 text-xs text-muted-foreground">
										{im.caption}
									</figcaption>
								) : null}
							</figure>
						))}
					</div>
				</section>
			) : article.kind === 'guest' && article.group !== 'sent' ? (
				<div className="rounded-md border p-3 text-sm text-muted-foreground">
					No pictures yet. They are being made and will show up here on their
					own.
				</div>
			) : null}

			<Editor
				key={String(article.updatedAt)}
				body={article.body}
				kind={article.kind}
				group={article.group}
				links={article.links}
				busy={busy}
				error={error}
				ok={ok}
			/>

			{article.body !== article.bodyOriginal ? (
				<details className="rounded-lg border bg-card p-4">
					<summary className="cursor-pointer text-sm font-medium">
						Original text as written
						{article.editedBy
							? ` (you changed it${article.editedAt ? ` on ${formatDate(article.editedAt)}` : ''})`
							: ''}
					</summary>
					<Form method="post" className="mt-3">
						<input type="hidden" name="intent" value="restore" />
						<Button type="submit" variant="outline" size="sm" disabled={busy}>
							Put the original text back
						</Button>
					</Form>
					<pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
						{article.bodyOriginal}
					</pre>
				</details>
			) : null}

			{article.notes ? (
				<details className="rounded-lg border bg-card p-4">
					<summary className="cursor-pointer text-sm font-medium">
						Notes from the writing system
					</summary>
					<pre className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
						{article.notes}
					</pre>
				</details>
			) : null}
		</div>
	)
}

function Editor({
	body: initialBody,
	kind,
	group,
	links,
	busy,
	error,
	ok,
}: {
	body: string
	kind: string
	group: string
	links: Array<{ name: string; url: string }>
	busy: boolean
	error: string | null
	ok: string | null
}) {
	const [body, setBody] = useState(initialBody)
	const [showPreview, setShowPreview] = useState(true)
	const missing = missingLinks(body, links)
	const words = countWords(body)
	const approveLabel =
		kind === 'blog'
			? 'Approve and publish'
			: group === 'reference'
				? 'Approve in my words'
				: group === 'sent'
					? 'Mark approved'
					: 'Approve'

	return (
		<Form method="post" className="space-y-3">
			<div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow">
				<Button type="submit" name="intent" value="approve" disabled={busy}>
					<Icon name="check" className="mr-1 h-4 w-4" /> {approveLabel}
				</Button>
				<Button
					type="submit"
					name="intent"
					value="deny"
					variant="destructive"
					disabled={busy}
				>
					<Icon name="cross-1" className="mr-1 h-4 w-4" /> Deny
				</Button>
				<Button
					type="submit"
					name="intent"
					value="save"
					variant="outline"
					disabled={busy || body === initialBody}
				>
					Save edits
				</Button>
				<input
					name="note"
					aria-label="Note for the writer"
					placeholder="Note for the writer (needed to deny, optional to approve)"
					className="min-w-[16rem] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
				/>
				<span className="text-xs text-muted-foreground">{words} words</span>
				<button
					type="button"
					onClick={() => setShowPreview(v => !v)}
					className="text-xs text-primary hover:underline"
				>
					{showPreview ? 'Hide preview' : 'Show preview'}
				</button>
			</div>

			{error ? (
				<p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
					{error}
				</p>
			) : null}
			{ok ? (
				<p className="rounded-md border border-green-300 bg-green-50 p-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
					{ok}
				</p>
			) : null}

			{links.length > 0 ? (
				<div className="rounded-md border p-3 text-sm">
					<p className="font-medium">Links that must stay in the article</p>
					<ul className="mt-1 space-y-1">
						{links.map(l => {
							const gone = missing.some(m => m.url === l.url)
							return (
								<li
									key={l.url}
									className={
										gone
											? 'text-red-700 dark:text-red-400'
											: 'text-muted-foreground'
									}
								>
									{gone ? 'Missing: ' : 'In place: '}
									{l.name} ({l.url})
								</li>
							)
						})}
					</ul>
					{missing.length > 0 ? (
						<p className="mt-2 text-xs text-muted-foreground">
							You can move a link to another sentence. If it is gone, the
							placement loses its purpose.
						</p>
					) : null}
				</div>
			) : null}

			<div className={`grid gap-4 ${showPreview ? 'lg:grid-cols-2' : ''}`}>
				<div>
					<label htmlFor="body" className="text-sm font-medium">
						Text
					</label>
					<p className="mb-1 text-xs text-muted-foreground">
						Plain text with simple marks: a line starting with ## is a heading,
						*this* is italic, **this** is bold, and [words](https://...) is a
						link.
					</p>
					<Textarea
						id="body"
						name="body"
						value={body}
						onChange={e => setBody(e.currentTarget.value)}
						className="min-h-[70vh] font-mono text-sm leading-relaxed"
					/>
				</div>
				{showPreview ? (
					<div>
						<p className="text-sm font-medium">How it reads</p>
						<p className="mb-1 text-xs text-muted-foreground">
							Updates as you type.
						</p>
						<div className="max-h-[70vh] overflow-auto rounded-md border bg-background p-4">
							<MarkdownContent
								content={body}
								className="prose prose-sm max-w-none dark:prose-invert"
							/>
						</div>
					</div>
				) : null}
			</div>
		</Form>
	)
}
