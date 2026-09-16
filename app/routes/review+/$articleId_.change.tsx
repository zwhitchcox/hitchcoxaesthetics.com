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
import { ArticleEditor } from '#app/components/article-editor.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { loadChatHistory } from '#app/utils/article-chat.server.ts'
import { countPassage } from '#app/utils/article-edit.ts'
import { reviewerName } from '#app/utils/articles.server.ts'
import { useSubmitAfterSave } from '#app/utils/auto-save.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { plainQuote } from '#app/utils/review-aid.ts'
import { useBottomEdge } from '#app/utils/viewport.ts'
import {
	approveArticle,
	loadArticleView,
	settleSitting,
} from './_shared.server.ts'

/**
 * "Change it": the article editor under a sticky top bar with "Back to the
 * article", the editor's bar items (the Markdown toggle) and Approve. She
 * edits the article in place; the chat folds into a dock at the bottom.
 * Every change saves itself. Approve waits for a save in flight, then stores
 * the working copy and approves it in one action, so what she approved is
 * what goes out.
 *
 * `?quote=` (from "Comment on this" on the reading page) is attached to the
 * chat composer on mount and then dropped from the URL.
 */
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const CHANGE_COPY = {
	back: 'Back to the article',
	approve: 'Approve',
	approveBlog: 'Approve and publish',
} as const

/** A quote from the reading page is cut here (the page cuts at 1000 too). */
const QUOTE_MAX = 1000
const QUOTE_MIN = 3

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const id = params.articleId ?? ''
	const view = await loadArticleView(id)
	if (!view) throw new Response('Not found', { status: 404 })
	if (view.article.status !== 'pending') return redirect(`/review/${id}`)
	const url = new URL(request.url)
	// The reading page appends an ellipsis when it cuts a long quote.
	const rawQuote = (url.searchParams.get('quote') ?? '')
		.trim()
		.replace(/…$/, '')
	// Only a passage that is really in the article; a crafted link cannot plant one.
	const quote =
		rawQuote.length >= QUOTE_MIN &&
		rawQuote.length <= QUOTE_MAX &&
		(countPassage(view.article.body, rawQuote) > 0 ||
			// the reading page quotes rendered text: links and marks folded
			countPassage(plainQuote(view.article.body), rawQuote) > 0)
			? rawQuote
			: null
	const claims = Array.from(
		new Set(
			[...view.aid.claims, ...view.aid.credentials].map(c =>
				plainQuote(c.quote),
			),
		),
	)
	const history = await loadChatHistory(id)
	return json({ view, claims, history, quote })
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
				return json(
					{ error: 'The article text cannot be empty.' },
					{ status: 400 },
				)
			}
			await approveArticle(article, { userId, who, body, now })
			const settled = await settleSitting(request, article, now, who)
			// The feed shows the decided card and the queue continues below it.
			return redirect(`/review/${id}`, { headers: settled.headers })
		}
		default:
			return json({ error: 'Unknown action.' }, { status: 400 })
	}
}

/** The sticky top bar is this tall (`h-11`); the editor's sheet sits under it. */
const TOP_BAR_PX = 44

export default function ChangeArticle() {
	const { view, claims, history, quote } = useLoaderData<typeof loader>()
	const { article, images, links } = view
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const submitting = navigation.state !== 'idle'
	const [chatBusy, setChatBusy] = useState(false)
	// The editor portals its bar items (the Markdown toggle) in here once the element exists.
	const [barSlot, setBarSlot] = useState<HTMLElement | null>(null)
	const flushRef = useRef<(() => Promise<void>) | null>(null)
	const barRef = useRef<HTMLDivElement>(null)
	// The bar's bottom edge: 92 px under the layout header, 44 px once that has scrolled away.
	const barBottom = useBottomEdge(barRef)
	const submitAfterSave = useSubmitAfterSave(flushRef)
	const error = actionData && 'error' in actionData ? actionData.error : null
	const approveLabel =
		article.kind === 'blog' ? CHANGE_COPY.approveBlog : CHANGE_COPY.approve

	return (
		<Form method="post" onSubmit={submitAfterSave}>
			<div
				ref={barRef}
				className="sticky top-0 z-30 -mx-4 flex h-11 items-center justify-between gap-2 bg-background/95 px-4 backdrop-blur"
			>
				<Link
					to={`/review/${article.id}`}
					className="inline-flex min-w-0 items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
				>
					<Icon name="chevron-left" className="h-4 w-4 shrink-0" />
					<span className="truncate">{CHANGE_COPY.back}</span>
				</Link>
				<div
					data-editor-bar-slot=""
					className="flex items-center gap-2"
					ref={setBarSlot}
				/>
				<Button
					type="submit"
					name="intent"
					value="approve"
					size="sm"
					className="shrink-0"
					disabled={submitting || chatBusy}
				>
					{approveLabel}
				</Button>
			</div>

			{error ? (
				<p
					role="alert"
					className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
				>
					{error}
				</p>
			) : null}

			<div className="mt-2">
				<ArticleEditor
					key={article.savedHash}
					article={{
						id: article.id,
						kind: article.kind,
						title: article.title,
						where: article.where,
						byline: article.byline,
						about: article.about,
						body: article.body,
						savedHash: article.savedHash,
						isReference: article.isReference,
					}}
					images={images}
					links={links}
					claims={claims}
					history={history}
					initialQuote={quote}
					stickyTop={barBottom || TOP_BAR_PX}
					flushRef={flushRef}
					onBusyChange={setChatBusy}
					barSlot={barSlot}
				/>
			</div>
		</Form>
	)
}
