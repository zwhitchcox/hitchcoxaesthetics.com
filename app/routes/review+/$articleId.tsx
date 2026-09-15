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
	useNavigate,
	useNavigation,
	useSubmit,
} from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import { ARTICLE_CHANGER_COPY } from '#app/components/article-changer.tsx'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
import { Sheet, SheetError } from '#app/components/review-sheet.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { ARTICLE_EDIT_CHIPS } from '#app/utils/article-edit.ts'
import { reviewerName } from '#app/utils/articles.server.ts'
import { formatDate, missingLinks, parseLinks } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	aboutMinutes,
	findHighlightRanges,
	loadReviewAid,
	paragraphIndexAt,
	plainQuote,
	reviewAidNote,
	splitParagraphs,
} from '#app/utils/review-aid.ts'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'
import {
	claimRowId,
	highlightId,
	MARKER_ID,
	reviewProsePlugin,
} from '#app/utils/review-prose.ts'
import {
	cardReadSeconds,
	getReviewLane,
	getReviewSitting,
} from '#app/utils/review-queue.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	afterDecisionUrl,
	approveArticle,
	approvedSince,
	approvedToday,
	LATER_MS,
	loadCards,
	plentyNow,
	reopenArticle,
	settleSitting,
	whereLabel,
} from './_shared.server.ts'

/**
 * S3, the article: the "things to check first" panel, every word of the
 * text with the claims marked, and one sticky bar. S4 (read to the end),
 * S6 (the "..." menu), S7 (Approved, with S8 when the sitting is spent),
 * and the lapsed-session sheet live here too.
 */
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const EVENTS_ENDPOINT = '/resources/review-events'
/** read_to is posted every this many paragraphs, and at the end. */
const READ_TO_EVERY = 5
/** The Undo link on the Approved screen stays this long. */
const UNDO_MS = 8000

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The words the link is on in the text, or null when the link is not there. */
function anchorTextFor(body: string, url: string): string | null {
	const target = escapeRegExp(url.replace(/\/+$/, ''))
	const re = new RegExp(`\\[([^\\]]+)\\]\\(\\s*${target}\\/?[^)]*\\)`, 'i')
	return re.exec(body)?.[1]?.trim() ?? null
}

function bylineText(byline: string | null): string {
	const text = (byline ?? 'Sarah Hitchcox, RN').trim()
	return /^by\s/i.test(text) ? text : `By ${text}`
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const id = params.articleId ?? ''
	const url = new URL(request.url)
	const article = await prisma.article.findUnique({
		where: { id },
		include: {
			images: {
				orderBy: { position: 'asc' },
				select: { id: true, altText: true, caption: true },
			},
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	const now = new Date()
	const body = article.body
	const aid = loadReviewAid(article.reviewAidJson, body)
	const links = parseLinks(article.linksJson)
	const missing = missingLinks(body, links)
	const paragraphs = splitParagraphs(body)
	const ranges = findHighlightRanges(
		body,
		aid.claims.map(c => c.quote),
	)
	const readSeconds = cardReadSeconds(article)
	const decided = article.status !== 'pending'
	const done =
		url.searchParams.get('done') === 'approved' && article.status === 'approved'
	// An own-words row has no Approve here, so the lapsed sheet never offers it.
	const lapsedIntent =
		url.searchParams.get('intent') === 'approve' &&
		!decided &&
		!article.isReference

	let doneView: {
		doneToday: number
		approvedThisSitting: number
		showPlenty: boolean
		next: { id: string; about: string } | null
	} | null = null
	if (done) {
		const lane = getReviewLane(request)
		const sitting = getReviewSitting(request, lane, now)
		const cards = (
			await loadCards(lane, now, { ownEditsBy: await reviewerName(userId) })
		).filter(c => c.article.id !== id)
		const next = cards[0] ?? null
		doneView = {
			doneToday: await approvedToday(now),
			approvedThisSitting: await approvedSince(new Date(sitting.startedAt)),
			showPlenty: plentyNow(sitting, cards, now),
			next: next
				? { id: next.article.id, about: aboutMinutes(next.readSeconds) }
				: null,
		}
	}

	return json({
		article: {
			id: article.id,
			kind: article.kind,
			title: article.title,
			slug: article.slug,
			publication: article.publication,
			byline: bylineText(article.byline),
			status: article.status,
			reviewedAt: article.reviewedAt,
			reviewedBy: article.reviewedBy,
			reviewNote: article.reviewNote,
			liveUrl: article.liveUrl,
			readToParagraph: article.readToParagraph ?? 0,
			reachedEnd: Boolean(article.readReachedEndAt),
			question: article.question,
			answer: article.answer,
			isReference: article.isReference,
			body,
			where: whereLabel(article),
			about: aboutMinutes(readSeconds),
		},
		images: article.images,
		aid: {
			note: reviewAidNote(aid),
			rules: aid.rules,
			claims: aid.claims.map((c, index) => ({
				quote: c.quote,
				paragraph: paragraphIndexAt(paragraphs, c.offset),
				highlighted: ranges.some(r => r.index === index),
			})),
			credentials: aid.credentials.map(c => ({
				quote: c.quote,
				paragraph: paragraphIndexAt(paragraphs, c.offset),
			})),
		},
		links: links.map(l => ({
			name: l.name,
			url: l.url,
			domain: hostOf(l.url),
			anchor: anchorTextFor(body, l.url),
			missing: missing.some(m => m.url === l.url),
		})),
		paragraphs: paragraphs.map(p => ({ start: p.start, end: p.end })),
		ranges: ranges.map(r => ({ start: r.start, end: r.end, index: r.index })),
		lapsedIntent,
		doneView,
	})
}

type SheetKey = 'more' | 'ask' | 'deny' | 'writer'

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
			status: true,
			isReference: true,
			publishedAt: true,
			wordCount: true,
			estimatedReadSeconds: true,
		},
	})
	if (!article) throw new Response('Not found', { status: 404 })
	const form = await request.formData()
	const intent = String(form.get('intent') ?? '')
	const note = String(form.get('note') ?? '').trim()
	const now = new Date()
	const who = await reviewerName(userId)
	const fail = (error: string, sheet: SheetKey) =>
		json({ error, sheet }, { status: 400 })
	// The publisher takes only her own words: this page never approves the
	// draft as it is, and never sends it to the writer. Change it is the way.
	const ownWords = `${ARTICLE_CHANGER_COPY.referenceNote} Use Change it.`

	switch (intent) {
		case 'approve': {
			if (article.status === 'approved') {
				return redirect(`/review/${id}?done=approved`)
			}
			if (article.status !== 'pending') {
				return fail('Reopen it first, then approve.', 'more')
			}
			if (article.isReference) return fail(ownWords, 'more')
			await approveArticle(article, { userId, who, now })
			const settled = await settleSitting(request, article, now, who)
			return redirect(`/review/${id}?done=approved`, {
				headers: settled.headers,
			})
		}
		case 'changes_requested': {
			if (article.status !== 'pending') {
				return fail('This one is already decided.', 'writer')
			}
			if (article.isReference) return fail(ownWords, 'writer')
			const chips = form
				.getAll('chip')
				.map(v => String(v).trim())
				.filter(Boolean)
			const text = [chips.join(', '), note].filter(Boolean).join(': ')
			if (!text) {
				return fail('Say what to change, in a line or two.', 'writer')
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
		case 'later': {
			await prisma.article.update({
				where: { id },
				data: { skippedUntil: new Date(now.getTime() + LATER_MS) },
			})
			await recordReviewEvent(id, 'later', { userId })
			return redirectWithToast('/review', {
				type: 'message',
				description: 'Set aside for 3 days.',
			})
		}
		case 'question': {
			const question = String(form.get('question') ?? '').trim()
			if (!question) return fail('Type one thing to ask.', 'ask')
			await prisma.article.update({
				where: { id },
				data: { question, questionAt: now, answer: null, answeredAt: null },
			})
			await recordReviewEvent(id, 'question', { userId, note: question })
			return redirectWithToast('/review', {
				type: 'success',
				description: 'Sent to Zane. His answer will show on this article.',
			})
		}
		case 'deny': {
			if (article.status !== 'pending') {
				return fail('This one is already decided.', 'deny')
			}
			if (!note) return fail('Add one line, so the next draft is better.', 'deny')
			await prisma.article.update({
				where: { id },
				data: {
					status: 'denied',
					reviewNote: note,
					reviewedAt: now,
					reviewedBy: who,
				},
			})
			await recordReviewEvent(id, 'denied', { userId, note })
			const settled = await settleSitting(request, article, now, who)
			return redirectWithToast(
				afterDecisionUrl(settled),
				{ type: 'message', description: 'Set aside. It will not go anywhere.' },
				{ headers: settled.headers },
			)
		}
		case 'reopen':
		case 'takedown': {
			if (article.status === 'pending') return redirect(`/review/${id}`)
			await reopenArticle(id, {
				userId,
				kind: intent === 'takedown' ? 'takedown' : 'reopened',
			})
			return redirectWithToast(`/review/${id}`, {
				type: 'message',
				description:
					intent === 'takedown'
						? 'Taken down. It is off your blog.'
						: 'Undone. It is back in your list.',
			})
		}
		default:
			return json({ error: 'Unknown action.' }, { status: 400 })
	}
}

/* ------------------------------------------------------------------------ */
/* The reading beacon                                                       */
/* ------------------------------------------------------------------------ */

type Beacon =
	| { articleId: string; kind: 'opened' }
	| { articleId: string; kind: 'read_to'; paragraph: number; end?: boolean }

function sendBeacon(payload: Beacon, unload = false) {
	const body = JSON.stringify(payload)
	if (unload && typeof navigator.sendBeacon === 'function') {
		navigator.sendBeacon(
			EVENTS_ENDPOINT,
			new Blob([body], { type: 'application/json' }),
		)
		return
	}
	fetch(EVENTS_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
		keepalive: true,
	}).catch(() => {
		// reading is recorded, never policed: a lost beacon changes nothing
	})
}

function scrollTo(el: Element | null | undefined) {
	el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function paragraphEl(index: number): Element | null {
	if (index < 0) return null
	return document.querySelector(`[data-paragraph="${index}"]`)
}

/* ------------------------------------------------------------------------ */
/* Page                                                                     */
/* ------------------------------------------------------------------------ */

export default function ReviewArticle() {
	const data = useLoaderData<typeof loader>()
	if (data.doneView) {
		return <ApprovedScreen article={data.article} view={data.doneView} />
	}
	return <ArticleScreen key={data.article.id} />
}

function ArticleScreen() {
	const { article, images, aid, links, paragraphs, ranges, lapsedIntent } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const navigate = useNavigate()
	const submit = useSubmit()
	const busy = navigation.state !== 'idle'
	const pending = article.status === 'pending'
	const error = actionData && 'error' in actionData ? actionData.error : null
	const errorSheet =
		actionData && 'sheet' in actionData ? actionData.sheet : null

	const [sheet, setSheet] = useState<SheetKey | 'end' | 'lapsed' | null>(
		lapsedIntent ? 'lapsed' : null,
	)
	const [reachedEnd, setReachedEnd] = useState(article.reachedEnd)
	const [zoom, setZoom] = useState<string | null>(null)
	const proseRef = useRef<HTMLDivElement>(null)
	const endRef = useRef<HTMLParagraphElement>(null)
	// The furthest paragraph she reached in this visit. "Take me there" reads it.
	const maxSeenRef = useRef(-1)

	const markerAt =
		pending && article.readToParagraph > 0 && !article.reachedEnd
			? article.readToParagraph
			: null

	// Record reading: opened once, read_to every five paragraphs and at the
	// end. Come back to where she was. Nothing here blocks anything.
	useEffect(() => {
		const articleId = article.id
		const total = paragraphs.length
		sendBeacon({ articleId, kind: 'opened' })

		maxSeenRef.current = -1
		let lastSent = -1
		const send = (paragraph: number, end: boolean, unload = false) => {
			lastSent = paragraph
			sendBeacon({ articleId, kind: 'read_to', paragraph, end }, unload)
		}
		const blocks = Array.from(
			proseRef.current?.querySelectorAll<HTMLElement>('[data-paragraph]') ?? [],
		)
		const seen = new IntersectionObserver(entries => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue
				const index = Number((entry.target as HTMLElement).dataset.paragraph)
				if (Number.isNaN(index) || index <= maxSeenRef.current) continue
				maxSeenRef.current = index
				if (index - lastSent >= READ_TO_EVERY) send(index, false)
			}
		})
		blocks.forEach(el => seen.observe(el))

		const endEl = endRef.current
		const atEnd = new IntersectionObserver(entries => {
			if (!entries.some(e => e.isIntersecting)) return
			setReachedEnd(true)
			maxSeenRef.current = Math.max(maxSeenRef.current, total - 1)
			send(Math.max(0, total - 1), true)
			atEnd.disconnect()
		})
		if (endEl) atEnd.observe(endEl)

		const flush = () => {
			const maxSeen = maxSeenRef.current
			if (maxSeen > lastSent) send(maxSeen, false, true)
		}
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') flush()
		}
		document.addEventListener('visibilitychange', onVisibility)
		window.addEventListener('pagehide', flush)

		const frame = window.requestAnimationFrame(() => {
			document.getElementById(MARKER_ID)?.scrollIntoView({ block: 'center' })
		})

		return () => {
			window.cancelAnimationFrame(frame)
			seen.disconnect()
			atEnd.disconnect()
			document.removeEventListener('visibilitychange', onVisibility)
			window.removeEventListener('pagehide', flush)
			flush()
		}
	}, [article.id, paragraphs.length])

	function approve() {
		setSheet(null)
		submit(
			{ intent: 'approve' },
			{ method: 'post', action: `/review/${article.id}?intent=approve` },
		)
	}

	function tapApprove() {
		if (reachedEnd) approve()
		else setSheet('end')
	}

	function takeMeThere() {
		setSheet(null)
		// The block after the furthest one she reached in this visit (the end
		// line when that was the last block), then the marker from her last
		// visit, then the top of the text.
		const seen = maxSeenRef.current
		const next = seen < 0 ? null : (paragraphEl(seen + 1) ?? endRef.current)
		scrollTo(
			next ??
				document.getElementById(MARKER_ID) ??
				document.getElementById('every-word'),
		)
	}

	function seeInText(claimIndex: number | null, paragraph: number) {
		const mark =
			claimIndex === null ? null : document.getElementById(highlightId(claimIndex))
		scrollTo(mark ?? paragraphEl(paragraph))
	}

	/** A tap on a highlight scrolls back to its row in the panel. */
	function onProseClick(event: React.MouseEvent<HTMLDivElement>) {
		const target = event.target as Element
		const mark = target.closest<HTMLElement>('mark[data-claim]')
		if (!mark) return
		const index = Number(mark.dataset.claim)
		if (Number.isNaN(index)) return
		scrollTo(document.getElementById(claimRowId(index)))
	}

	/** The marks are not focusable; Enter on the wrapper does nothing extra. */
	function onProseKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		if (event.key !== 'Enter') return
		const target = event.target as Element
		const mark = target.closest<HTMLElement>('mark[data-claim]')
		if (!mark) return
		const index = Number(mark.dataset.claim)
		if (!Number.isNaN(index)) scrollTo(document.getElementById(claimRowId(index)))
	}

	const approveLabel =
		article.kind === 'blog' ? 'Approve and publish on my site' : 'Approve'
	const zoomed = zoom ? images.find(im => im.id === zoom) : null

	return (
		<div className="pb-28">
			<header>
				<h1 className="text-2xl font-semibold leading-tight">{article.title}</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{article.where} · {article.byline} · {article.about}
				</p>
			</header>

			{!pending ? <DecidedBanner article={article} busy={busy} /> : null}

			{article.answer ? (
				<div className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
					<p className="font-medium">Zane says:</p>
					<p className="mt-1 whitespace-pre-wrap">{article.answer}</p>
				</div>
			) : article.question ? (
				<div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
					<p className="font-medium">You asked Zane:</p>
					<p className="mt-1 whitespace-pre-wrap">{article.question}</p>
					<p className="mt-1 text-xs">His answer will show here.</p>
				</div>
			) : null}

			<section className="mt-5 rounded-xl border bg-card p-4 shadow-sm">
				<h2 className="text-base font-semibold">Things to check first</h2>

				<PanelSection number={1} title="Medical claims">
					{aid.claims.length === 0 ? (
						<p className="text-sm text-muted-foreground">None found.</p>
					) : (
						<ul className="space-y-2">
							{aid.claims.map((c, i) => (
								<li
									key={i}
									id={claimRowId(i)}
									className="flex items-start gap-2 scroll-mt-4"
								>
									<p className="flex-1 text-sm">“{plainQuote(c.quote)}”</p>
									<button
										type="button"
										onClick={() => seeInText(c.highlighted ? i : null, c.paragraph)}
										className="shrink-0 rounded-full p-1 text-primary hover:bg-accent"
										aria-label="See in text"
										title="See in text"
									>
										<Icon name="chevron-right" className="h-5 w-5" />
									</button>
								</li>
							))}
						</ul>
					)}
				</PanelSection>

				<PanelSection number={2} title="Your credentials">
					{aid.credentials.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							This text does not name you or the practice.
						</p>
					) : (
						<ul className="space-y-2">
							{aid.credentials.map((c, i) => (
								<li key={i} className="flex items-start gap-2">
									<p className="flex-1 text-sm">“{plainQuote(c.quote)}”</p>
									<button
										type="button"
										onClick={() => seeInText(null, c.paragraph)}
										className="shrink-0 rounded-full p-1 text-primary hover:bg-accent"
										aria-label="See in text"
										title="See in text"
									>
										<Icon name="chevron-right" className="h-5 w-5" />
									</button>
								</li>
							))}
						</ul>
					)}
				</PanelSection>

				<PanelSection number={3} title="Links">
					{links.length === 0 ? (
						<p className="text-sm text-muted-foreground">No links were asked for.</p>
					) : (
						<ul className="space-y-2">
							{links.map(l => (
								<li key={l.url} className="text-sm">
									{l.missing ? (
										<p className="font-medium text-red-700 dark:text-red-400">
											Missing: {l.name}
										</p>
									) : (
										<p className="flex flex-wrap items-center gap-x-1.5">
											<span className="font-medium">{l.anchor ?? l.name}</span>
											<Icon name="arrow-right" className="h-4 w-4 text-muted-foreground" />
											<span>{l.domain}</span>
											<span className="text-muted-foreground">({l.name})</span>
										</p>
									)}
								</li>
							))}
						</ul>
					)}
				</PanelSection>

				<PanelSection number={4} title="Pictures">
					{images.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No pictures yet. They are being made and will show up here on
							their own.
						</p>
					) : (
						<ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
							{images.map(im => (
								<li key={im.id} className="w-36 shrink-0">
									<button
										type="button"
										onClick={() => setZoom(im.id)}
										className="block w-full rounded-lg border bg-background p-1 text-left"
										aria-label={`Zoom: ${im.altText ?? 'picture'}`}
									>
										<img
											src={`/resources/article-images/${im.id}`}
											alt={im.altText ?? ''}
											loading="lazy"
											className="aspect-[3/2] w-full rounded object-cover"
										/>
										<span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
											{im.altText ?? im.caption ?? 'No description'}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</PanelSection>

				{aid.rules.length > 0 ? (
					<PanelSection number={5} title="The publisher’s rules">
						<ul className="list-disc space-y-1 pl-5 text-sm">
							{aid.rules.map((rule, i) => (
								<li key={i}>{rule}</li>
							))}
						</ul>
					</PanelSection>
				) : null}

				<p className="mt-4 text-xs text-muted-foreground">{aid.note}</p>
			</section>

			<section className="mt-6">
				<h2 id="every-word" className="text-base font-semibold scroll-mt-4">
					Every word
				</h2>
				<div
					ref={proseRef}
					role="presentation"
					onClick={onProseClick}
					onKeyDown={onProseKeyDown}
					className="mt-3"
				>
					<MarkdownContent
						content={article.body}
						className="prose prose-lg max-w-none dark:prose-invert [&_li]:leading-[1.6] [&_p]:leading-[1.6] [&_[data-paragraph]]:scroll-mt-4 [&_mark]:cursor-pointer [&_mark]:rounded-sm [&_mark]:bg-amber-200 [&_mark]:px-0.5 [&_mark]:text-inherit dark:[&_mark]:bg-amber-700 [&_.review-marker]:my-4 [&_.review-marker]:inline-block [&_.review-marker]:rounded-full [&_.review-marker]:bg-primary [&_.review-marker]:px-3 [&_.review-marker]:py-1 [&_.review-marker]:text-xs [&_.review-marker]:font-medium [&_.review-marker]:text-primary-foreground"
						remarkPlugins={[reviewProsePlugin({ paragraphs, ranges, markerAt })]}
					/>
				</div>
				<p ref={endRef} className="mt-8 text-center text-sm text-muted-foreground">
					That is all of it.
				</p>
			</section>

			{pending ? (
				<div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
					{/* The blog label is long: it gets its own row on a phone. */}
					<div className="mx-auto flex max-w-xl flex-wrap items-center gap-2">
						{article.isReference ? (
							<p className="basis-full text-sm text-muted-foreground">
								{ARTICLE_CHANGER_COPY.referenceNote}
							</p>
						) : (
							<Button
								type="button"
								size="lg"
								className={`min-w-0 flex-1 px-3 text-base ${
									article.kind === 'blog' ? 'basis-full' : ''
								}`}
								onClick={tapApprove}
								disabled={busy}
							>
								{approveLabel}
							</Button>
						)}
						<Button
							asChild
							variant="outline"
							size="lg"
							className="min-w-0 flex-1 px-3 text-base"
						>
							<Link to={`/review/${article.id}/change`}>Change it</Link>
						</Button>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="shrink-0 px-3"
							onClick={() => setSheet('more')}
							aria-label="More"
							disabled={busy}
						>
							<Icon name="dots-horizontal" className="h-5 w-5" />
							<span className="sr-only">...</span>
						</Button>
					</div>
				</div>
			) : null}

			{sheet === 'more' ? (
				<Sheet onClose={() => setSheet(null)} title="More">
					<div className="flex flex-col gap-2">
						<Form method="post">
							<input type="hidden" name="intent" value="later" />
							<Button
								type="submit"
								variant="outline"
								size="lg"
								className="w-full text-base"
								disabled={busy}
							>
								Later
							</Button>
						</Form>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full text-base"
							onClick={() => setSheet('ask')}
						>
							Ask Zane
						</Button>
						{!article.isReference ? (
							<Button
								type="button"
								variant="outline"
								size="lg"
								className="w-full text-base"
								onClick={() => setSheet('writer')}
							>
								Send a note to the writer
							</Button>
						) : null}
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full text-base text-red-700 dark:text-red-400"
							onClick={() => setSheet('deny')}
						>
							Do not publish this
						</Button>
					</div>
					{error && errorSheet === 'more' ? <SheetError>{error}</SheetError> : null}
				</Sheet>
			) : null}

			{sheet === 'ask' ? (
				<Sheet onClose={() => setSheet(null)} title="Ask Zane">
					<Form method="post" className="space-y-3">
						<input type="hidden" name="intent" value="question" />
						<label htmlFor="review-question" className="text-sm font-medium">
							Ask Zane one thing
						</label>
						<Textarea
							id="review-question"
							name="question"
							rows={2}
							required
							placeholder="Is this publisher real?"
							className="text-base"
							defaultValue={article.question ?? ''}
						/>
						{error && errorSheet === 'ask' ? <SheetError>{error}</SheetError> : null}
						<Button type="submit" size="lg" className="w-full text-base" disabled={busy}>
							Send
						</Button>
					</Form>
				</Sheet>
			) : null}

			{sheet === 'writer' ? (
				<Sheet onClose={() => setSheet(null)} title="Send a note to the writer">
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
						{error && errorSheet === 'writer' ? <SheetError>{error}</SheetError> : null}
						<Button type="submit" size="lg" className="w-full text-base" disabled={busy}>
							Send to the writer
						</Button>
					</Form>
				</Sheet>
			) : null}

			{sheet === 'deny' ? (
				<Sheet onClose={() => setSheet(null)} title="Do not publish this">
					<p className="text-sm text-muted-foreground">
						This drops the placement. Use Change it if you want a fix.
					</p>
					<Form method="post" className="mt-3 space-y-3">
						<input type="hidden" name="intent" value="deny" />
						<label htmlFor="review-deny-note" className="text-sm font-medium">
							Why not? One line helps the next draft.
						</label>
						<Textarea
							id="review-deny-note"
							name="note"
							rows={2}
							required
							className="text-base"
						/>
						{error && errorSheet === 'deny' ? <SheetError>{error}</SheetError> : null}
						<Button
							type="submit"
							variant="destructive"
							size="lg"
							className="w-full text-base"
							disabled={busy}
						>
							Do not use it
						</Button>
					</Form>
				</Sheet>
			) : null}

			{sheet === 'end' ? (
				<Sheet
					onClose={() => setSheet(null)}
					title="You have not reached the end yet. Read the rest?"
				>
					<div className="flex flex-col gap-2">
						<Button type="button" size="lg" className="w-full text-base" onClick={takeMeThere}>
							Take me there
						</Button>
						{article.kind === 'blog' ? (
							<Button
								type="button"
								variant="outline"
								size="lg"
								className="w-full text-base"
								onClick={approve}
								disabled={busy}
							>
								Approve anyway
							</Button>
						) : null}
					</div>
				</Sheet>
			) : null}

			{sheet === 'lapsed' ? (
				<Sheet
					onClose={() => {
						setSheet(null)
						navigate(`/review/${article.id}`, { replace: true })
					}}
					title="You tapped Approve before you signed in. Approve now?"
				>
					<div className="flex flex-col gap-2">
						<Button type="button" size="lg" className="w-full text-base" onClick={approve} disabled={busy}>
							Approve now
						</Button>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full text-base"
							onClick={() => {
								setSheet(null)
								navigate(`/review/${article.id}`, { replace: true })
							}}
						>
							Not now
						</Button>
					</div>
				</Sheet>
			) : null}

			{zoomed ? (
				<div className="fixed inset-0 z-50">
					<button
						type="button"
						aria-label="Close"
						onClick={() => setZoom(null)}
						className="absolute inset-0 h-full w-full bg-black/90"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label={zoomed.altText ?? 'Picture'}
						className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4"
					>
						<img
							src={`/resources/article-images/${zoomed.id}`}
							alt={zoomed.altText ?? ''}
							className="max-h-[80vh] w-full max-w-xl rounded object-contain"
						/>
						{zoomed.altText || zoomed.caption ? (
							<p className="mt-3 max-w-xl text-center text-sm text-white">
								{zoomed.altText ?? zoomed.caption}
							</p>
						) : null}
						<button
							type="button"
							className="pointer-events-auto mt-4 rounded-full bg-white/10 px-4 py-2 text-sm text-white"
							onClick={() => setZoom(null)}
						>
							Close
						</button>
					</div>
				</div>
			) : null}
		</div>
	)
}

function PanelSection({
	number,
	title,
	children,
}: {
	number: number
	title: string
	children: React.ReactNode
}) {
	return (
		<div className="mt-4">
			<h3 className="text-sm font-semibold text-muted-foreground">
				{`${number}. ${title}`}
			</h3>
			<div className="mt-1.5">{children}</div>
		</div>
	)
}

type LoaderArticle = ReturnType<typeof useLoaderData<typeof loader>>['article']

function DecidedBanner({
	article,
	busy,
}: {
	article: LoaderArticle
	busy: boolean
}) {
	const when = article.reviewedAt ? ` on ${formatDate(article.reviewedAt)}` : ''
	const isApproved = article.status === 'approved'
	return (
		<div
			className={`mt-4 rounded-md border p-3 text-sm ${
				isApproved
					? 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100'
					: article.status === 'denied'
						? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
						: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
			}`}
		>
			<p className="font-medium">
				{isApproved
					? `Approved${when}.`
					: article.status === 'denied'
						? `Do not publish${when}.`
						: `With the writer${when}.`}
			</p>
			{article.reviewNote ? <p className="mt-1">{article.reviewNote}</p> : null}
			{isApproved && article.liveUrl ? (
				<a
					href={article.liveUrl}
					target="_blank"
					rel="noreferrer"
					className="mt-1 block underline underline-offset-2"
				>
					Live page
				</a>
			) : null}
			<Form method="post" className="mt-2">
				<input
					type="hidden"
					name="intent"
					value={isApproved && article.kind === 'blog' ? 'takedown' : 'reopen'}
				/>
				<Button type="submit" variant="outline" size="sm" disabled={busy}>
					{isApproved && article.kind === 'blog' ? 'Take it down' : 'Reopen'}
				</Button>
			</Form>
		</div>
	)
}

/* ------------------------------------------------------------------------ */
/* S7: Approved (with S8 when the sitting is spent)                         */
/* ------------------------------------------------------------------------ */

type DoneView = NonNullable<
	ReturnType<typeof useLoaderData<typeof loader>>['doneView']
>

function ApprovedScreen({
	article,
	view,
}: {
	article: LoaderArticle
	view: DoneView
}) {
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'
	const [undoOpen, setUndoOpen] = useState(true)
	useEffect(() => {
		const timer = window.setTimeout(() => setUndoOpen(false), UNDO_MS)
		return () => window.clearTimeout(timer)
	}, [])
	const blogPath = `/blog/${article.slug ?? ''}`

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
			<div className="rounded-full bg-green-100 p-4 dark:bg-green-900">
				<Icon name="check" className="h-10 w-10 text-green-700 dark:text-green-200" />
			</div>
			<p className="text-2xl font-semibold">Approved.</p>
			{article.kind === 'blog' ? (
				<>
					<p className="text-base">
						{`It is live now: hitchcoxaesthetics.com${blogPath}`}
					</p>
					<div className="flex gap-2">
						<Button asChild variant="outline">
							<a href={blogPath} target="_blank" rel="noreferrer">
								Open it
							</a>
						</Button>
						<Form method="post">
							<input type="hidden" name="intent" value="takedown" />
							<Button type="submit" variant="outline" disabled={busy}>
								Take it down
							</Button>
						</Form>
					</div>
				</>
			) : (
				<p className="text-base">
					“{article.title}” is on its way to{' '}
					{article.publication ?? 'the publisher'}. You will see Sent here, then
					Live when the publisher posts it, with the link.
				</p>
			)}
			<p className="text-sm text-muted-foreground">{`${view.doneToday} done today.`}</p>
			{undoOpen ? (
				<Form method="post">
					<input type="hidden" name="intent" value="reopen" />
					<button
						type="submit"
						disabled={busy}
						className="text-sm font-medium text-primary underline underline-offset-2"
					>
						Undo
					</button>
				</Form>
			) : null}

			<div className="mt-4 w-full">
				{view.showPlenty ? (
					<section className="rounded-xl border bg-card p-6 shadow-sm">
						<p className="text-lg font-medium">
							{view.approvedThisSitting > 0
								? `That is plenty for now. ${view.approvedThisSitting} approved.`
								: 'That is plenty for now.'}
						</p>
						<div className="mt-4 flex flex-col gap-2">
							<Form method="post" action="/review?index">
								<input type="hidden" name="intent" value="stop" />
								<Button type="submit" size="lg" className="w-full text-base" disabled={busy}>
									Stop here
								</Button>
							</Form>
							{view.next ? (
								<Button asChild variant="outline" size="lg" className="w-full text-base">
									<Link to={`/review/${view.next.id}`}>One more anyway</Link>
								</Button>
							) : null}
						</div>
					</section>
				) : (
					<div className="flex flex-col gap-2">
						{view.next ? (
							<Button asChild size="lg" className="w-full text-base">
								<Link to={`/review/${view.next.id}`}>
									{`Next one (${view.next.about.toLowerCase()})`}
								</Link>
							</Button>
						) : (
							<p className="text-base">
								Nothing needs you today. The writers are working.
							</p>
						)}
						<Form method="post" action="/review?index">
							<input type="hidden" name="intent" value="stop" />
							<Button
								type="submit"
								variant="outline"
								size="lg"
								className="w-full text-base"
								disabled={busy}
							>
								I am done for now
							</Button>
						</Form>
					</div>
				)}
			</div>
		</div>
	)
}
