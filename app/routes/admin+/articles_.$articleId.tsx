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
import { useEffect, useRef, useState } from 'react'
import { ArticleEditor } from '#app/components/article-editor.tsx'
import {
	DictateButton,
	DictationNote,
	GhostTextarea,
	useDictation,
} from '#app/components/dictation.tsx'
import { Sheet, SheetError } from '#app/components/review-sheet.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { bylineText, whereLabel } from '#app/routes/review+/_shared.server.ts'
import { loadChatHistory } from '#app/utils/article-chat.server.ts'
import { type ChatMessageJson } from '#app/utils/article-chat.ts'
import { appendSpeech } from '#app/utils/article-edit.ts'
import { countPictureLines, picturesNote } from '#app/utils/article-images.ts'
import { hashBody, reviewerName } from '#app/utils/articles.server.ts'
import {
	articleGroup,
	countWords,
	destinationLabel,
	formatDate,
	parseLinks,
	statusLabel,
} from '#app/utils/articles.ts'
import { useSubmitAfterSave } from '#app/utils/auto-save.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	aboutMinutes,
	estimateReadSeconds,
	loadReviewAid,
	plainQuote,
	reviewAidNote,
} from '#app/utils/review-aid.ts'
import {
	recordReviewEvent,
	secondsSinceOpened,
} from '#app/utils/review-events.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/** The reviewNote prefix for "Write a different article". */
const NEW_ARTICLE_PREFIX = 'NEW ARTICLE: '

export const REWRITE_COPY = {
	link: 'Write a different article',
	body: (where: string) =>
		`The writer starts over with a new topic for ${where}. This one leaves your list until the new one is ready. That usually takes a day or two.`,
	publisherWaiting:
		'The publisher agreed to this topic. The writer will offer them the new one.',
	noteLabel: 'Anything to tell the writer? (optional)',
	notePlaceholder: 'For example: not fillers again, something about skin care.',
	button: 'Write a different one',
	pill: 'New article coming',
} as const

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const article = await prisma.article.findUnique({
		where: { id: params.articleId ?? '' },
		include: {
			images: {
				orderBy: { position: 'asc' },
				select: {
					id: true,
					altText: true,
					caption: true,
					fileName: true,
					position: true,
					width: true,
					height: true,
				},
			},
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	// The "things to check" list, verified against the text she will see.
	// The editor highlights each quote in the article as plain reference.
	const aid = loadReviewAid(article.reviewAidJson, article.body)
	const claims = Array.from(
		new Set(
			[...aid.claims, ...aid.credentials].map(item => plainQuote(item.quote)),
		),
	)
	const history = await loadChatHistory(article.id)
	return json({
		article: {
			...article,
			savedHash: hashBody(article.body),
			pictureLineCount: countPictureLines(article.body),
			links: parseLinks(article.linksJson),
			where: whereLabel(article),
			bylineLine: bylineText(article.byline),
			about: aboutMinutes(
				article.estimatedReadSeconds ??
					estimateReadSeconds(article.wordCount ?? countWords(article.body)),
			),
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
		history,
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
			status: true,
			publishedAt: true,
			rewriteRequested: true,
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	const form = await request.formData()
	const intent = String(form.get('intent') ?? '')
	const rawBody = form.get('body')
	const body =
		typeof rawBody === 'string' ? rawBody.replace(/\r\n/g, '\n') : null
	const note = String(form.get('note') ?? '')
		.trim()
		.slice(0, 2000)
	const who = await reviewerName(userId)
	const now = new Date()
	const textChanged = body !== null && body.trim() !== article.body.trim()
	const textChange = textChanged ? { body, editedAt: now, editedBy: who } : {}
	// The text a decision is about: the working copy, else what is stored.
	const decidedBody = body ?? article.body

	switch (intent) {
		case 'approve': {
			if (body !== null && !body.trim()) {
				return json(
					{ error: 'The article text cannot be empty.' },
					{ status: 400 },
				)
			}
			await prisma.article.update({
				where: { id },
				data: {
					...textChange,
					status: 'approved',
					reviewedAt: now,
					reviewedBy: who,
					reviewNote: note || null,
					rewriteRequested: false,
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
					rewriteRequested: false,
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
					rewriteRequested: false,
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
		case 'rewrite': {
			// "Write a different article": a clean-room draft from the mini.
			if (article.status !== 'pending') {
				return json({ error: 'This one is already decided.' }, { status: 400 })
			}
			const words = String(form.get('rewrite_note') ?? '')
				.trim()
				.slice(0, 2000)
			await prisma.article.update({
				where: { id },
				data: {
					status: 'changes_requested',
					reviewNote: `${NEW_ARTICLE_PREFIX}${words || 'a different article'}`,
					rewriteRequested: true,
					reviewedAt: now,
					reviewedBy: who,
					skippedUntil: null,
					approvedBodyHash: null,
				},
			})
			await recordReviewEvent(id, 'rewrite_requested', {
				userId,
				note: words || null,
			})
			return redirectWithToast('/admin/articles', {
				type: 'success',
				title: 'A new article is on its way',
				description: `The writer starts over on "${article.title}".`,
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
					rewriteRequested: false,
					// a rewrite request's note is not a note for this text
					...(article.rewriteRequested ? { reviewNote: null } : {}),
				},
			})
			await recordReviewEvent(id, 'reopened', { userId })
			return json({
				ok: 'Reopened. Approve or deny it again when you are ready.',
			})
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
	const { article, claims, aidNote, history } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'
	const error = actionData && 'error' in actionData ? actionData.error : null
	const ok = actionData && 'ok' in actionData ? actionData.ok : null
	const forAnswer = Boolean(
		actionData && 'for' in actionData && actionData.for === 'answer',
	)
	const decided = article.status !== 'pending'
	const showThumbnails =
		article.images.length > 0 && article.pictureLineCount === 0

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
							<span className="font-medium">{destinationLabel(article)}</span>
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
						{article.rewriteRequested
							? REWRITE_COPY.pill
							: statusLabel(article.status)}
						{article.reviewedBy ? ` by ${article.reviewedBy}` : ''}
						{article.reviewedAt ? ` on ${formatDate(article.reviewedAt)}` : ''}.
					</p>
					{article.status === 'changes_requested' ? (
						<>
							{article.reviewNote ? (
								<p className="mt-1">Her note: “{article.reviewNote}”</p>
							) : null}
							<p className="mt-1 text-xs opacity-80">
								{article.rewriteRequested
									? 'The writer starts over with a new topic on the next sync. The new draft comes back to her as “A new article, as you asked”. Reopen it to keep this one.'
									: 'The writer gets this note on the next sync. The article comes back to her as “Your change is in”. Reopen it to take it back.'}
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
						{article.incomingAt ? ` on ${formatDate(article.incomingAt)}` : ''},
						after this was {statusLabel(article.status).toLowerCase()}.
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

			{article.kind === 'guest' &&
			article.group === 'sent' &&
			article.images.length === 0 ? null : (
				<section>
					<h3 className="text-lg font-semibold">Pictures</h3>
					<p className="text-sm text-muted-foreground">
						{picturesNote(article.pictureLineCount, article.images.length)}
					</p>
					{showThumbnails ? (
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
					) : null}
				</section>
			)}

			<Editor
				key={String(article.updatedAt)}
				article={{
					id: article.id,
					kind: article.kind,
					title: article.title,
					where: article.where,
					byline: article.bylineLine,
					about: article.about,
					body: article.body,
					savedHash: article.savedHash,
					isReference: article.isReference,
					readOnly: decided,
					links: article.links,
					images: article.images,
				}}
				group={article.group}
				publisherWaiting={article.publisherWaiting}
				rewriteWhere={
					article.kind === 'blog' ? 'your blog' : destinationLabel(article)
				}
				claims={claims}
				aidNote={aidNote}
				history={history}
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

/** The site header is sticky and this tall (root.tsx, `h-[3rem]`); the bar sits under it. */
const SITE_HEADER_PX = 48
/** The gap under the decision bar (`space-y-3`). */
const BAR_GAP_PX = 12

/** The height of an element, kept up to date. 0 until measured. */
function useMeasuredHeight(ref: React.RefObject<HTMLElement | null>): number {
	const [height, setHeight] = useState(0)
	useEffect(() => {
		const el = ref.current
		if (!el) return
		const measure = () =>
			setHeight(Math.round(el.getBoundingClientRect().height))
		measure()
		if (typeof ResizeObserver === 'undefined') return
		const observer = new ResizeObserver(measure)
		observer.observe(el)
		return () => observer.disconnect()
	}, [ref])
	return height
}

/**
 * The sticky decision bar and, under it, the editor: the chat (or the raw
 * markdown) on the left, the article on the right. Every change saves
 * itself and the working copy sits in a hidden field named `body`, so every
 * button here submits it after any save in flight. A decided article is
 * read-only until Reopen.
 */
function Editor({
	article,
	group,
	publisherWaiting,
	rewriteWhere,
	claims,
	aidNote,
	history,
	busy,
	error,
	ok,
}: {
	article: {
		id: string
		kind: string
		title: string
		where: string
		byline: string
		about: string
		body: string
		savedHash: string
		isReference: boolean
		readOnly: boolean
		links: Array<{ name: string; url: string }>
		images: Array<{
			id: string
			fileName: string
			position: number
			altText: string | null
			caption: string | null
			width: number | null
			height: number | null
		}>
	}
	group: string
	publisherWaiting: boolean
	/** "for your blog" or the publication, for the rewrite sheet. */
	rewriteWhere: string
	claims: string[]
	aidNote: string
	history: ChatMessageJson[]
	busy: boolean
	error: string | null
	ok: string | null
}) {
	const flushRef = useRef<(() => Promise<void>) | null>(null)
	const submitAfterSave = useSubmitAfterSave(flushRef)
	const [rewriteOpen, setRewriteOpen] = useState(false)
	const [chatBusy, setChatBusy] = useState(false)
	const barRef = useRef<HTMLDivElement>(null)
	const barHeight = useMeasuredHeight(barRef)
	const disabled = busy || chatBusy
	const approveLabel =
		article.kind === 'blog'
			? 'Approve and publish'
			: group === 'reference'
				? 'Approve in my words'
				: group === 'sent'
					? 'Mark approved'
					: 'Approve'

	return (
		<>
			<Form method="post" className="space-y-3" onSubmit={submitAfterSave}>
				<div
					ref={barRef}
					className="sticky top-12 z-10 space-y-2 rounded-lg border bg-card p-3 shadow"
				>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="submit"
							name="intent"
							value="approve"
							disabled={disabled}
						>
							<Icon name="check" className="mr-1 h-4 w-4" /> {approveLabel}
						</Button>
						<Button
							type="submit"
							name="intent"
							value="deny"
							variant="destructive"
							disabled={disabled}
						>
							<Icon name="cross-1" className="mr-1 h-4 w-4" /> Deny
						</Button>
						<Button
							type="submit"
							name="intent"
							value="changes_requested"
							variant="outline"
							disabled={disabled}
						>
							Send to the writer
						</Button>
						<input
							name="note"
							aria-label="Note for the writer"
							placeholder="Note for the writer (needed to deny or send back, optional to approve)"
							className="min-w-[16rem] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
						/>
					</div>
					{!article.readOnly ? (
						<button
							type="button"
							onClick={() => setRewriteOpen(true)}
							className="text-sm text-primary underline-offset-2 hover:underline"
						>
							{REWRITE_COPY.link}
						</button>
					) : null}
					<Messages error={error} ok={ok} />
				</div>

				{aidNote ? (
					<p className="text-xs text-muted-foreground">{aidNote}</p>
				) : null}

				<ArticleEditor
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
					images={article.images}
					links={article.links}
					claims={claims}
					history={history}
					initialTab="chat"
					readOnly={article.readOnly}
					showHeader={false}
					stickyTop={SITE_HEADER_PX + barHeight + BAR_GAP_PX}
					flushRef={flushRef}
					onBusyChange={setChatBusy}
				/>
			</Form>

			{rewriteOpen ? (
				<RewriteSheet
					where={rewriteWhere}
					publisherWaiting={publisherWaiting}
					busy={busy}
					error={error}
					onClose={() => setRewriteOpen(false)}
				/>
			) : null}
		</>
	)
}

/** "Write a different article": one optional line for the writer (dictate or type), then the button. */
function RewriteSheet({
	where,
	publisherWaiting,
	busy,
	error,
	onClose,
}: {
	where: string
	publisherWaiting: boolean
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
		<Sheet title={REWRITE_COPY.link} onClose={onClose}>
			<Form method="post" className="space-y-3">
				<input type="hidden" name="intent" value="rewrite" />
				<p className="text-sm text-muted-foreground">
					{REWRITE_COPY.body(where)}
				</p>
				{publisherWaiting ? (
					<p className="text-sm text-muted-foreground">
						{REWRITE_COPY.publisherWaiting}
					</p>
				) : null}
				<label htmlFor="rewrite-note" className="text-sm font-medium">
					{REWRITE_COPY.noteLabel}
				</label>
				<GhostTextarea
					id="rewrite-note"
					name="rewrite_note"
					rows={2}
					value={note}
					ghost={ghost}
					listening={dictation.listening}
					onChange={e => setNote(e.currentTarget.value)}
					placeholder={REWRITE_COPY.notePlaceholder}
					className="text-base"
				/>
				<DictationNote dictation={dictation} />
				{error ? <SheetError>{error}</SheetError> : null}
				<div className="flex flex-wrap items-center gap-2">
					<DictateButton dictation={dictation} disabled={busy} />
					<Button
						type="submit"
						size="lg"
						className="min-w-0 flex-1"
						disabled={busy || dictation.listening}
					>
						{REWRITE_COPY.button}
					</Button>
				</div>
			</Form>
		</Sheet>
	)
}
