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
import { ArticleChanger } from '#app/components/article-changer.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { hashBody, reviewerName } from '#app/utils/articles.server.ts'
import {
	articleGroup,
	destinationLabel,
	formatDate,
	parseLinks,
	statusLabel,
} from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { loadReviewAid, reviewAidNote } from '#app/utils/review-aid.ts'
import {
	recordReviewEvent,
	secondsSinceOpened,
} from '#app/utils/review-events.server.ts'
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
	// The "things to check" list, verified against the text she will see.
	// The changer offers each quote as a pill for "Tell it what to change".
	const aid = loadReviewAid(article.reviewAidJson, article.body)
	const claims = Array.from(
		new Set([...aid.claims, ...aid.credentials].map(item => item.quote)),
	)
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
				question: article.question,
				answer: article.answer,
			}),
		},
		claims,
		aidNote: reviewAidNote(aid),
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
	const textChanged = body !== null && body.trim() !== article.body.trim()
	const textChange = textChanged ? { body, editedAt: now, editedBy: who } : {}
	// The text a decision is about: the working copy, else what is stored.
	const decidedBody = body ?? article.body

	switch (intent) {
		case 'save': {
			if (body === null || !body.trim()) {
				return json({ error: 'The article text cannot be empty.' }, { status: 400 })
			}
			await prisma.article.update({ where: { id }, data: textChange })
			if (textChanged) await recordReviewEvent(id, 'saved', { userId })
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
					// The record: what she approved is what goes out, byte for byte.
					approvedBodyHash: hashBody(decidedBody),
					publishedAt:
						article.kind === 'blog'
							? (article.publishedAt ?? now)
							: article.publishedAt,
				},
			})
			await recordReviewEvent(id, 'approved', {
				userId,
				seconds: await secondsSinceOpened(id, now),
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
					approvedBodyHash: null,
				},
			})
			await recordReviewEvent(id, 'denied', { userId, note })
			return redirectWithToast('/admin/articles', {
				type: 'message',
				title: 'Denied',
				description: `"${article.title}" will not be used.`,
			})
		}
		case 'changes_requested': {
			if (!note) {
				return json(
					{ error: 'Write the change you want. The writer gets this note.' },
					{ status: 400 },
				)
			}
			await prisma.article.update({
				where: { id },
				data: {
					...textChange,
					status: 'changes_requested',
					reviewedAt: now,
					reviewedBy: who,
					reviewNote: note,
					approvedBodyHash: null,
				},
			})
			await recordReviewEvent(id, 'changes_requested', { userId, note })
			return redirectWithToast('/admin/articles', {
				type: 'success',
				title: 'Sent to the writer',
				description: `"${article.title}" comes back as "Your change is in".`,
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
				data: {
					status: 'pending',
					reviewedAt: null,
					reviewedBy: null,
					approvedBodyHash: null,
				},
			})
			await recordReviewEvent(id, 'reopened', { userId })
			return json({ ok: 'Reopened. Approve or deny it again when you are ready.' })
		}
		case 'answer': {
			const answer = String(form.get('answer') ?? '').trim()
			if (!answer) {
				return json(
					{ error: 'Write an answer first.', for: 'answer' as const },
					{ status: 400 },
				)
			}
			await prisma.article.update({
				where: { id },
				data: { answer, answeredAt: now },
			})
			return json({ ok: 'Answer saved.', for: 'answer' as const })
		}
		default:
			return json({ error: 'Unknown action.' }, { status: 400 })
	}
}

const AMBER_BOX =
	'rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'

function Messages({ error, ok }: { error: string | null; ok: string | null }) {
	return (
		<>
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
		</>
	)
}

export default function ArticleReview() {
	const { article, claims, aidNote } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'
	const error = actionData && 'error' in actionData ? actionData.error : null
	const ok = actionData && 'ok' in actionData ? actionData.ok : null
	const forAnswer = Boolean(
		actionData && 'for' in actionData && actionData.for === 'answer',
	)
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
							: article.status === 'changes_requested'
								? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
								: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
					}`}
				>
					<p className="font-medium">
						{statusLabel(article.status)}
						{article.reviewedBy ? ` by ${article.reviewedBy}` : ''}
						{article.reviewedAt ? ` on ${formatDate(article.reviewedAt)}` : ''}.
					</p>
					{article.status === 'changes_requested' ? (
						<>
							{article.reviewNote ? (
								<p className="mt-1">Her note: “{article.reviewNote}”</p>
							) : null}
							<p className="mt-1 text-xs opacity-80">
								The writer gets this note on the next sync. The article comes
								back to her as “Your change is in”. Reopen it to take it back.
							</p>
						</>
					) : article.reviewNote ? (
						<p className="mt-1">{article.reviewNote}</p>
					) : null}
					<Form method="post" className="mt-2">
						<input type="hidden" name="intent" value="reopen" />
						<Button type="submit" variant="outline" size="sm" disabled={busy}>
							Reopen
						</Button>
					</Form>
				</div>
			) : article.reviewNote ? (
				<div className={AMBER_BOX}>{article.reviewNote}</div>
			) : null}

			{article.incomingBody != null ? (
				<div className={AMBER_BOX}>
					<p className="font-medium">
						<span className="mr-2 inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-100">
							New text arrived
						</span>
						The writer sent new text
						{article.incomingAt ? ` on ${formatDate(article.incomingAt)}` : ''}
						, after this was {statusLabel(article.status).toLowerCase()}.
					</p>
					<p className="mt-1">
						The decision stands and the text below is what goes out. The new
						text is held here. Nothing changes until it is reviewed again.
					</p>
					<details className="mt-2">
						<summary className="cursor-pointer text-xs font-medium">
							Show the new text
						</summary>
						<pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-3 text-xs">
							{article.incomingBody}
						</pre>
					</details>
				</div>
			) : null}

			{article.question ? (
				<section className="rounded-lg border bg-card p-4">
					<h3 className="text-lg font-semibold">Sarah asks</h3>
					<p className="mt-1">“{article.question}”</p>
					{article.questionAt ? (
						<p className="text-xs text-muted-foreground">
							{formatDate(article.questionAt)}
						</p>
					) : null}
					{article.answeredAt ? (
						<p className="mt-2 text-sm text-muted-foreground">
							You answered on {formatDate(article.answeredAt)}. It shows on her
							card as “Zane says”.
						</p>
					) : null}
					<Form method="post" className="mt-3 space-y-2">
						<input type="hidden" name="intent" value="answer" />
						<label htmlFor="answer" className="text-sm font-medium">
							Answer
						</label>
						<Textarea
							id="answer"
							name="answer"
							defaultValue={article.answer ?? ''}
							className="min-h-[5rem]"
						/>
						{forAnswer ? <Messages error={error} ok={ok} /> : null}
						<Button type="submit" size="sm" disabled={busy}>
							{article.answer ? 'Update answer' : 'Send answer'}
						</Button>
					</Form>
				</section>
			) : null}

			{article.group === 'reference' ? (
				<div className={AMBER_BOX}>
					This publisher only takes human-written text. Please change this draft
					into your own words before approving. Your approved text is what gets
					sent, exactly as you leave it.
				</div>
			) : null}

			{article.group === 'sent' ? (
				<div className={AMBER_BOX}>
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
				articleId={article.id}
				body={article.body}
				kind={article.kind}
				group={article.group}
				isReference={article.isReference}
				links={article.links}
				claims={claims}
				aidNote={aidNote}
				busy={busy}
				error={forAnswer ? null : error}
				ok={forAnswer ? null : ok}
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

/**
 * The sticky decision bar and, under it, the changer: "Tell it what to
 * change" by default, or the plain editor. The changer puts the working
 * copy in a hidden field named `body`, so every button here submits it.
 */
function Editor({
	articleId,
	body,
	kind,
	group,
	isReference,
	links,
	claims,
	aidNote,
	busy,
	error,
	ok,
}: {
	articleId: string
	body: string
	kind: string
	group: string
	isReference: boolean
	links: Array<{ name: string; url: string }>
	claims: string[]
	aidNote: string
	busy: boolean
	error: string | null
	ok: string | null
}) {
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
			<div className="sticky top-0 z-10 space-y-2 rounded-lg border bg-card p-3 shadow">
				<div className="flex flex-wrap items-center gap-2">
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
						value="changes_requested"
						variant="outline"
						disabled={busy}
					>
						Send to the writer
					</Button>
					<Button
						type="submit"
						name="intent"
						value="save"
						variant="outline"
						disabled={busy}
					>
						Save edits
					</Button>
					<input
						name="note"
						aria-label="Note for the writer"
						placeholder="Note for the writer (needed to deny or send back, optional to approve)"
						className="min-w-[16rem] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<Messages error={error} ok={ok} />
			</div>

			{claims.length > 0 ? (
				<p className="text-xs text-muted-foreground">
					Things to check: {claims.length} {claims.length === 1 ? 'quote' : 'quotes'}{' '}
					from the text are offered as pills under “Tell it what to change”.{' '}
					{aidNote}
				</p>
			) : null}

			<ArticleChanger
				articleId={articleId}
				initialBody={body}
				savedBody={body}
				links={links}
				claims={claims}
				isReference={isReference}
				kind={kind}
			/>
		</Form>
	)
}
