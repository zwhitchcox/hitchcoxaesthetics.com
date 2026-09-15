import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	redirect,
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
import { useRef, useState } from 'react'
import {
	ArticleChanger,
	useSubmitAfterSave,
} from '#app/components/article-changer.tsx'
import { Sheet, SheetError } from '#app/components/review-sheet.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { ARTICLE_EDIT_CHIPS } from '#app/utils/article-edit.ts'
import { hashBody, reviewerName } from '#app/utils/articles.server.ts'
import { parseLinks } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { loadReviewAid, plainQuote } from '#app/utils/review-aid.ts'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	afterDecisionUrl,
	approveArticle,
	settleSitting,
} from './_shared.server.ts'

/**
 * S5, "Change it": the ArticleChanger (tell it what to change, edit the
 * text, or select a passage) with this page's sticky bar. Every change
 * saves itself; there is no Save button. Approve waits for a save in
 * flight, then stores the working copy and approves it in one action, so
 * what she approved is what goes out. "Send this to the writer instead" is
 * the changes_requested path for when she does not want to check a change
 * herself.
 */
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const id = params.articleId ?? ''
	const article = await prisma.article.findUnique({
		where: { id },
		select: {
			id: true,
			kind: true,
			title: true,
			body: true,
			status: true,
			isReference: true,
			linksJson: true,
			reviewAidJson: true,
			updatedAt: true,
			images: {
				orderBy: { position: 'asc' },
				select: {
					id: true,
					fileName: true,
					position: true,
					width: true,
					height: true,
				},
			},
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	if (article.status !== 'pending') return redirect(`/review/${id}`)
	const aid = loadReviewAid(article.reviewAidJson, article.body)
	const claims = Array.from(
		new Set([...aid.claims, ...aid.credentials].map(c => plainQuote(c.quote))),
	)
	return json({
		article: {
			id: article.id,
			kind: article.kind,
			title: article.title,
			body: article.body,
			savedHash: hashBody(article.body),
			isReference: article.isReference,
			updatedAt: article.updatedAt,
		},
		images: article.images,
		links: parseLinks(article.linksJson),
		claims,
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
			body: true,
			status: true,
			publishedAt: true,
			wordCount: true,
			estimatedReadSeconds: true,
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	if (article.status !== 'pending') {
		return json({ error: 'This one is already decided.' }, { status: 400 })
	}
	const form = await request.formData()
	const intent = String(form.get('intent') ?? '')
	const rawBody = form.get('body')
	const body =
		typeof rawBody === 'string' ? rawBody.replace(/\r\n/g, '\n') : null
	const now = new Date()
	const who = await reviewerName(userId)

	switch (intent) {
		case 'approve': {
			if (body !== null && !body.trim()) {
				return json({ error: 'The article text cannot be empty.' }, { status: 400 })
			}
			await approveArticle(article, { userId, who, body, now })
			const settled = await settleSitting(request, article, now, who)
			// The feed shows the decided card and the queue continues below it.
			return redirect(`/review/${id}`, { headers: settled.headers })
		}
		case 'changes_requested': {
			const chips = form
				.getAll('chip')
				.map(v => String(v).trim())
				.filter(Boolean)
			const note = String(form.get('note') ?? '').trim()
			const text = [chips.join(', '), note].filter(Boolean).join(': ')
			if (!text) {
				return json(
					{ error: 'Say what to change, in a line or two.' },
					{ status: 400 },
				)
			}
			await prisma.article.update({
				where: { id },
				data: {
					status: 'changes_requested',
					reviewNote: text,
					reviewedAt: now,
					reviewedBy: who,
				},
			})
			await recordReviewEvent(id, 'changes_requested', { userId, note: text })
			const settled = await settleSitting(request, article, now, who)
			return redirectWithToast(
				afterDecisionUrl(settled),
				{
					type: 'success',
					description:
						'Sent to the writer. It comes back to you as "Your change is in".',
				},
				{ headers: settled.headers },
			)
		}
		default:
			return json({ error: 'Unknown action.' }, { status: 400 })
	}
}

export default function ChangeArticle() {
	const { article, images, links, claims } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'
	const [writerOpen, setWriterOpen] = useState(false)
	const flushRef = useRef<(() => Promise<void>) | null>(null)
	const submitAfterSave = useSubmitAfterSave(flushRef)
	const error = actionData && 'error' in actionData ? actionData.error : null
	const approveLabel =
		article.kind === 'blog' ? 'Approve and publish on my site' : 'Approve'

	return (
		<div className="pb-36">
			<h1 className="text-xl font-semibold leading-tight">{article.title}</h1>

			{error && !writerOpen ? (
				<p
					role="alert"
					className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
				>
					{error}
				</p>
			) : null}
			<Form method="post" className="mt-4" onSubmit={submitAfterSave}>
				<ArticleChanger
					key={String(article.updatedAt)}
					articleId={article.id}
					initialBody={article.body}
					savedHash={article.savedHash}
					links={links}
					claims={claims}
					isReference={article.isReference}
					kind={article.kind}
					images={images}
					flushRef={flushRef}
				/>

				<div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
					<div className="mx-auto max-w-xl">
						<div className="flex items-center gap-2">
							<Button
								asChild
								variant="outline"
								size="lg"
								className="min-w-0 flex-1 px-3 text-base"
							>
								<Link to={`/review/${article.id}`}>Back to the article</Link>
							</Button>
							<Button
								type="submit"
								name="intent"
								value="approve"
								size="lg"
								className="min-w-0 flex-1 px-3 text-base"
								disabled={busy}
							>
								{approveLabel}
							</Button>
						</div>
						{!article.isReference ? (
							<button
								type="button"
								onClick={() => setWriterOpen(true)}
								className="mt-2 w-full text-center text-sm text-primary underline-offset-2 hover:underline"
							>
								Send this to the writer instead
							</button>
						) : null}
					</div>
				</div>
			</Form>

			{writerOpen ? (
				<Sheet onClose={() => setWriterOpen(false)} title="Send this to the writer">
					<Form method="post" className="space-y-3">
						<input type="hidden" name="intent" value="changes_requested" />
						<div className="flex flex-wrap gap-2">
							{ARTICLE_EDIT_CHIPS.map(chip => (
								<label
									key={chip}
									className="cursor-pointer rounded-full border bg-background px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
								>
									<input
										type="checkbox"
										name="chip"
										value={chip}
										aria-label={chip}
										className="sr-only"
									/>
									{chip}
								</label>
							))}
						</div>
						<label htmlFor="review-writer-note" className="sr-only">
							What to change
						</label>
						<Textarea
							id="review-writer-note"
							name="note"
							rows={3}
							aria-label="What to change"
							placeholder="Say what to change. The writer sends it back to you."
							className="text-base"
						/>
						{error ? <SheetError>{error}</SheetError> : null}
						<Button type="submit" size="lg" className="w-full text-base" disabled={busy}>
							Send to the writer
						</Button>
					</Form>
				</Sheet>
			) : null}
		</div>
	)
}
