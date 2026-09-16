import { countPassage } from '#app/utils/article-edit.ts'
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
	ArticleEditor,
	type EditorTab,
} from '#app/components/article-editor.tsx'
import {
	DictateButton,
	DictationNote,
	GhostTextarea,
	useDictation,
} from '#app/components/dictation.tsx'
import { Sheet, SheetError } from '#app/components/review-sheet.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { loadChatHistory } from '#app/utils/article-chat.server.ts'
import { ARTICLE_EDIT_CHIPS, appendSpeech } from '#app/utils/article-edit.ts'
import { reviewerName } from '#app/utils/articles.server.ts'
import { useSubmitAfterSave } from '#app/utils/auto-save.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { plainQuote } from '#app/utils/review-aid.ts'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	afterDecisionUrl,
	approveArticle,
	loadArticleView,
	settleSitting,
} from './_shared.server.ts'

/**
 * "Change it": the article editor (the article, the chat that edits it,
 * the raw markdown) under a sticky top bar with "Back to the article" and
 * Approve. Every change saves itself. Approve waits for a save in flight,
 * then stores the working copy and approves it in one action, so what she
 * approved is what goes out. "Send this to the writer instead" is the
 * changes_requested path for when she does not want to check a change
 * herself.
 *
 * `?tab=article|chat|markdown` picks the tab (default chat). `?quote=` (from
 * "Comment on this" on the reading page) is attached to the chat composer
 * on mount and then dropped from the URL.
 */
export const handle: SEOHandle & { reviewWide: boolean } = {
	getSitemapEntries: () => null,
	/** The review layout widens for the desktop split (see _layout.tsx). */
	reviewWide: true,
}

export const CHANGE_COPY = {
	back: 'Back to the article',
	approve: 'Approve',
	approveBlog: 'Approve and publish',
	writerLink: 'Send this to the writer instead',
	writerTitle: 'Send this to the writer',
	writerLabel: 'What to change',
	writerPlaceholder: 'Say what to change. The writer sends it back to you.',
	writerButton: 'Send to the writer',
} as const

const TABS: ReadonlyArray<EditorTab> = ['article', 'chat', 'markdown']
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
	const rawTab = url.searchParams.get('tab') ?? ''
	const tab: EditorTab = (TABS as ReadonlyArray<string>).includes(rawTab)
		? (rawTab as EditorTab)
		: 'chat'
	// The reading page appends an ellipsis when it cuts a long quote.
	const rawQuote = (url.searchParams.get('quote') ?? '').trim().replace(/…$/, '')
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
	return json({ view, claims, history, tab, quote })
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
	const { view, claims, history, tab, quote } = useLoaderData<typeof loader>()
	const { article, images, links } = view
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const submitting = navigation.state !== 'idle'
	const [chatBusy, setChatBusy] = useState(false)
	const [writerOpen, setWriterOpen] = useState(false)
	const flushRef = useRef<(() => Promise<void>) | null>(null)
	const submitAfterSave = useSubmitAfterSave(flushRef)
	const error = actionData && 'error' in actionData ? actionData.error : null
	const approveLabel =
		article.kind === 'blog' ? CHANGE_COPY.approveBlog : CHANGE_COPY.approve

	return (
		// -mb-8 cancels the layout's bottom padding, so the Chat panel ends at the edge.
		<div className="-mb-8">
			<Form method="post" onSubmit={submitAfterSave}>
				<div className="sticky top-0 z-30 -mx-4 flex h-11 items-center justify-between bg-background/95 px-4 backdrop-blur">
					<Link
						to={`/review/${article.id}`}
						className="inline-flex min-w-0 items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
					>
						<Icon name="chevron-left" className="h-4 w-4 shrink-0" />
						<span className="truncate">{CHANGE_COPY.back}</span>
					</Link>
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

				{error && !writerOpen ? (
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
						initialTab={tab}
						initialQuote={quote}
						stickyTop={44}
						flushRef={flushRef}
						onBusyChange={setChatBusy}
						writerLink={
							!article.isReference ? (
								<button
									type="button"
									onClick={() => setWriterOpen(true)}
									className="w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
								>
									{CHANGE_COPY.writerLink}
								</button>
							) : null
						}
					/>
				</div>
			</Form>

			{writerOpen ? (
				<WriterSheet
					busy={submitting}
					error={error}
					onClose={() => setWriterOpen(false)}
				/>
			) : null}
		</div>
	)
}

/** "Send this to the writer": chips, a note (dictate or type), one button. */
function WriterSheet({
	busy,
	error,
	onClose,
}: {
	busy: boolean
	error: string | null
	onClose: () => void
}) {
	const [note, setNote] = useState('')
	const [ghost, setGhost] = useState('')
	const dictation = useDictation({
		onInterim: setGhost,
		onFinal: text => {
			setGhost('')
			setNote(current => appendSpeech(current, text))
		},
	})
	return (
		<Sheet onClose={onClose} title={CHANGE_COPY.writerTitle}>
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
					{CHANGE_COPY.writerLabel}
				</label>
				<GhostTextarea
					id="review-writer-note"
					name="note"
					rows={3}
					value={note}
					ghost={ghost}
					listening={dictation.listening}
					aria-label={CHANGE_COPY.writerLabel}
					placeholder={CHANGE_COPY.writerPlaceholder}
					onChange={e => setNote(e.currentTarget.value)}
				/>
				<DictationNote dictation={dictation} />
				{error ? <SheetError>{error}</SheetError> : null}
				<div className="flex items-center gap-2">
					<DictateButton dictation={dictation} disabled={busy} />
					<Button
						type="submit"
						size="lg"
						className="min-w-0 flex-1 text-base"
						disabled={busy || dictation.listening}
					>
						{CHANGE_COPY.writerButton}
					</Button>
				</div>
			</Form>
		</Sheet>
	)
}
