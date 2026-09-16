import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type SerializeFrom,
} from '@remix-run/node'
import {
	Form,
	Link,
	useFetcher,
	useLoaderData,
	useNavigate,
} from '@remix-run/react'
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react'
import { ARTICLE_EDITOR_COPY } from '#app/components/article-editor.tsx'
import {
	CommentOnThis,
	useProseSelection,
} from '#app/components/comment-on-this.tsx'
import {
	DictateButton,
	DictationNote,
	GhostTextarea,
	useDictation,
} from '#app/components/dictation.tsx'
import { MarkdownContent } from '#app/components/markdown-content.tsx'
import { Sheet, SheetError } from '#app/components/review-sheet.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { appendSpeech, ARTICLE_EDIT_CHIPS } from '#app/utils/article-edit.ts'
import {
	articleImageResolver,
	articleImageUrl,
	countPictureLines,
	picturesNote,
	zoomTarget,
	type ZoomTarget,
} from '#app/utils/article-images.ts'
import { reviewerName } from '#app/utils/articles.server.ts'
import { formatDate } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	findHighlightRanges,
	plainQuote,
	splitParagraphs,
} from '#app/utils/review-aid.ts'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'
import {
	MARKER_ID,
	reviewProsePlugin,
	type ProseRange,
} from '#app/utils/review-prose.ts'
import { getReviewLane } from '#app/utils/review-queue.server.ts'
import {
	approveArticle,
	approvedSince,
	approvedToday,
	LATER_MS,
	loadArticleView,
	reopenArticle,
	settleSitting,
} from './_shared.server.ts'

/**
 * The feed at /review/:id. The deep-linked article comes first; when she
 * decides on it, the next one that fits her time appends below, with no
 * tap and no new page. One sticky bar acts on the article in view.
 *
 * Each card holds S3 (the panel, every word, the sheets), S4 (read to the
 * end), S6 (the "..." menu) and the lapsed-session sheet. This page reads
 * and decides; it never edits. "Change it" and "Comment on this" (a
 * selected passage) open the editor at /review/:id/change on its Chat tab.
 * After a decision the card collapses to a one-line header and the decided
 * card (S7). "That is plenty" (S8) is a card in the feed.
 */
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const EVENTS_ENDPOINT = '/resources/review-events'
const NEXT_ENDPOINT = '/resources/review-next'
/** read_to is posted every this many paragraphs, and at the end. */
const READ_TO_EVERY = 5
/** The Undo link on an approved card stays this long. */
const UNDO_MS = 8000
/** A quote handed to the editor's chat is at most this long, ellipsis included. */
const QUOTE_MAX_CHARS = 1000
/** "Every word": 18 px prose, the claim marks, the writer's green marks and the "You were here" marker. */
const PROSE_CLASS =
	'prose prose-lg max-w-none dark:prose-invert [&_li]:leading-[1.6] [&_p]:leading-[1.6] [&_[data-paragraph]]:scroll-mt-4 [&_mark]:rounded-sm [&_mark]:bg-amber-200 [&_mark]:px-0.5 [&_mark]:text-inherit dark:[&_mark]:bg-amber-700 [&_.review-changed]:bg-green-200 dark:[&_.review-changed]:bg-green-800 [&_.review-marker]:my-4 [&_.review-marker]:inline-block [&_.review-marker]:rounded-full [&_.review-marker]:bg-primary [&_.review-marker]:px-3 [&_.review-marker]:py-1 [&_.review-marker]:text-xs [&_.review-marker]:font-medium [&_.review-marker]:text-primary-foreground'
/** Her "Write a different article" note carries this prefix on the ledger. */
const REWRITE_PREFIX = 'NEW ARTICLE: '
const REWRITE_DEFAULT_NOTE = 'a different article'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const id = params.articleId ?? ''
	const url = new URL(request.url)
	const first = await loadArticleView(id)
	if (!first) throw new Response('Not found', { status: 404 })
	// An own-words row has no Approve here, so the lapsed sheet never offers it.
	const lapsedIntent =
		url.searchParams.get('intent') === 'approve' &&
		first.article.status === 'pending' &&
		!first.article.isReference
	return json({ first, lane: getReviewLane(request), lapsedIntent })
}

const SHEET_KEYS = ['more', 'ask', 'deny', 'writer', 'rewrite'] as const
type SheetKey = (typeof SHEET_KEYS)[number]

function isSheetKey(value: unknown): value is SheetKey {
	return (SHEET_KEYS as ReadonlyArray<unknown>).includes(value)
}
type DecidedKind = 'approved' | 'changes_requested' | 'denied' | 'rewrite'

export async function action({ params, request }: ActionFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const id = params.articleId ?? ''
	const article = await prisma.article.findUnique({
		where: { id },
		select: {
			id: true,
			kind: true,
			slug: true,
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
	const note = String(form.get('note') ?? '')
		.trim()
		.slice(0, 2000)
	const now = new Date()
	const who = await reviewerName(userId)
	const fail = (error: string, sheet: SheetKey) =>
		json({ error, sheet }, { status: 400 })
	// The publisher takes only her own words: this page never approves the
	// draft as it is, and never sends it to the writer. Change it is the way.
	const ownWords = `${ARTICLE_EDITOR_COPY.referenceNote} Use Change it.`
	const blogPath =
		article.kind === 'blog' ? `/blog/${article.slug ?? ''}` : null

	/** The JSON after a decision, with the sitting cookie. */
	const decided = async (kind: DecidedKind) => {
		const settled = await settleSitting(request, article, now, who)
		return json(
			{
				ok: true as const,
				decided: kind,
				view: {
					doneToday: await approvedToday(now),
					approvedThisSitting: await approvedSince(
						new Date(settled.sitting.startedAt),
					),
					showPlenty: settled.showPlenty,
					blogPath,
				},
			},
			{ headers: settled.headers },
		)
	}

	switch (intent) {
		case 'approve': {
			if (article.status === 'approved') {
				// A second tap: the first one stands. Nothing is added to the sitting.
				return json({
					ok: true as const,
					decided: 'approved' as const,
					view: {
						doneToday: await approvedToday(now),
						approvedThisSitting: 0,
						showPlenty: false,
						blogPath,
					},
				})
			}
			if (article.status !== 'pending') {
				return fail('Reopen it first, then approve.', 'more')
			}
			if (article.isReference) return fail(ownWords, 'more')
			await approveArticle(article, { userId, who, now })
			return decided('approved')
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
			return decided('changes_requested')
		}
		case 'rewrite': {
			if (article.status !== 'pending') {
				return fail('This one is already decided.', 'rewrite')
			}
			await prisma.article.update({
				where: { id },
				data: {
					status: 'changes_requested',
					reviewNote: `${REWRITE_PREFIX}${note || REWRITE_DEFAULT_NOTE}`,
					rewriteRequested: true,
					reviewedAt: now,
					reviewedBy: who,
					skippedUntil: null,
					approvedBodyHash: null,
				},
			})
			await recordReviewEvent(id, 'rewrite_requested', {
				userId,
				note: note || null,
			})
			return decided('rewrite')
		}
		case 'later': {
			await prisma.article.update({
				where: { id },
				data: { skippedUntil: new Date(now.getTime() + LATER_MS) },
			})
			await recordReviewEvent(id, 'later', { userId })
			return json({ ok: true as const, decided: 'later' as const })
		}
		case 'question': {
			const question = String(form.get('question') ?? '')
				.trim()
				.slice(0, 2000)
			if (!question) return fail('Type one thing to ask.', 'ask')
			await prisma.article.update({
				where: { id },
				data: { question, questionAt: now, answer: null, answeredAt: null },
			})
			await recordReviewEvent(id, 'question', { userId, note: question })
			return json({ ok: true as const, asked: true as const, question })
		}
		case 'deny': {
			if (article.status !== 'pending') {
				return fail('This one is already decided.', 'deny')
			}
			if (!note)
				return fail('Add one line, so the next draft is better.', 'deny')
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
			return decided('denied')
		}
		case 'reopen':
		case 'takedown': {
			if (article.status !== 'pending') {
				await reopenArticle(id, {
					userId,
					kind: intent === 'takedown' ? 'takedown' : 'reopened',
				})
			}
			return json({ ok: true as const, reopened: true as const })
		}
		default:
			return json({ error: 'Unknown action.' }, { status: 400 })
	}
}

/* ------------------------------------------------------------------------ */
/* Shared bits                                                              */
/* ------------------------------------------------------------------------ */

type CardView = SerializeFrom<typeof loader>['first']

type Decision =
	| { kind: 'approved'; doneToday: number; blogPath: string | null }
	| { kind: 'later' | 'writer' | 'rewrite' | 'denied' }

type ArticleEntry = {
	type: 'article'
	view: CardView
	/** The status as the page knows it: the loaded one, then pending again after a reopen. */
	status: string
	/** Her decision in this feed, or null while the card is open. */
	decision: Decision | null
	/** One line under the header after a reopen ("Undone. ..."). */
	notice: string | null
}
type PlentyEntry = { type: 'plenty'; key: string; approved: number }
type Entry = ArticleEntry | PlentyEntry
type Tail = 'idle' | 'loading' | 'plenty' | 'empty'
type Current = { kind: 'article'; id: string } | { kind: 'other' }

type DecisionData =
	| {
			decided: DecidedKind
			view: {
				doneToday: number
				approvedThisSitting: number
				showPlenty: boolean
				blogPath: string | null
			}
	  }
	| { decided: 'later' }

function isArticle(e: Entry): e is ArticleEntry {
	return e.type === 'article'
}

function articleEntry(view: CardView): ArticleEntry {
	return {
		type: 'article',
		view,
		status: view.article.status,
		decision: null,
		notice: null,
	}
}

function toDecision(data: DecisionData): Decision {
	if (data.decided === 'later') return { kind: 'later' }
	if (data.decided === 'approved') {
		return {
			kind: 'approved',
			doneToday: data.view.doneToday,
			blogPath: data.view.blogPath,
		}
	}
	if (data.decided === 'changes_requested') return { kind: 'writer' }
	if (data.decided === 'rewrite') return { kind: 'rewrite' }
	return { kind: 'denied' }
}

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

function cardElementId(id: string): string {
	return `feed-${id}`
}

/** Her words from a "Write a different article" note, or '' for the default. */
function rewriteWords(note: string | null): string {
	if (!note || !note.startsWith(REWRITE_PREFIX)) return ''
	const words = note.slice(REWRITE_PREFIX.length).trim()
	return words === REWRITE_DEFAULT_NOTE ? '' : words
}

function isRewriteNote(note: string | null): boolean {
	return Boolean(note && note.startsWith(REWRITE_PREFIX))
}

/** The editor, open on its chat. With a quote, the chat starts with that passage attached. */
function changeUrl(id: string, quote?: string): string {
	const base = `/review/${id}/change?tab=chat`
	return quote ? `${base}&quote=${encodeURIComponent(quote)}` : base
}

/** A selected passage, cut so the whole quote fits the editor's limit. */
function cutQuote(text: string): string {
	if (text.length <= QUOTE_MAX_CHARS) return text
	return `${text.slice(0, QUOTE_MAX_CHARS - 1).trimEnd()}…`
}

/* ------------------------------------------------------------------------ */
/* The feed                                                                 */
/* ------------------------------------------------------------------------ */

export default function ReviewArticle() {
	const { first, lane, lapsedIntent } = useLoaderData<typeof loader>()
	return (
		<Feed
			key={first.article.id}
			first={first}
			lane={lane}
			lapsedIntent={lapsedIntent}
		/>
	)
}

type CardHandle = { tapApprove: () => void; openMore: () => void }

function Feed({
	first,
	lane,
	lapsedIntent,
}: {
	first: CardView
	lane: number
	lapsedIntent: boolean
}) {
	const [entries, setEntries] = useState<Entry[]>([articleEntry(first)])
	const [tail, setTail] = useState<Tail>('idle')
	const [current, setCurrent] = useState<Current>({
		kind: 'article',
		id: first.article.id,
	})
	const [busyId, setBusyId] = useState<string | null>(null)
	const rootRef = useRef<HTMLDivElement>(null)
	const sentinelRef = useRef<HTMLDivElement>(null)
	const entriesRef = useRef(entries)
	entriesRef.current = entries
	const tailRef = useRef(tail)
	tailRef.current = tail
	const currentRef = useRef(current)
	currentRef.current = current
	const busyRef = useRef<string | null>(null)
	busyRef.current = busyId
	/** Cards that hold the current line still: a sheet open, a request running, text selected. */
	const locksRef = useRef(new Set<string>())
	/** The last position the spy saw, kept while a lock holds the current line. */
	const latestRef = useRef<Current>(current)
	const openedRef = useRef(new Set<string>())
	const loadingRef = useRef(false)
	const sentinelSeenRef = useRef(false)
	const handles = useRef(new Map<string, CardHandle>())

	/** True when a pending, undecided article sits after `id` in the feed. */
	function pendingAfter(id: string): ArticleEntry | null {
		const list = entriesRef.current
		const at = list.findIndex(e => isArticle(e) && e.view.article.id === id)
		for (const e of list.slice(at + 1)) {
			if (isArticle(e) && e.status === 'pending' && !e.decision) return e
		}
		return null
	}

	const loadNext = useCallback(async () => {
		if (loadingRef.current) return
		loadingRef.current = true
		setTail('loading')
		const exclude = entriesRef.current
			.filter(isArticle)
			.map(e => e.view.article.id)
		try {
			const params = new URLSearchParams({
				lane: String(lane),
				exclude: exclude.join(','),
			})
			const response = await fetch(`${NEXT_ENDPOINT}?${params.toString()}`, {
				headers: { Accept: 'application/json' },
			})
			if (!response.ok) throw new Error(String(response.status))
			const data = (await response.json()) as { card: CardView | null }
			const card = data.card
			if (!card || exclude.includes(card.article.id)) {
				setTail('empty')
				return
			}
			setEntries(prev => [...prev, articleEntry(card)])
			setTail('idle')
		} catch {
			// the sentinel tries again when it next comes into view
			setTail('idle')
		} finally {
			loadingRef.current = false
		}
	}, [lane])

	/** Pre-load one article ahead, never more. */
	const maybeLoad = useCallback(() => {
		if (!sentinelSeenRef.current) return
		if (tailRef.current !== 'idle') return
		if (busyRef.current) return
		const articles = entriesRef.current.filter(isArticle)
		const last = articles[articles.length - 1]
		const cur = currentRef.current
		if (
			last &&
			last.status === 'pending' &&
			!last.decision &&
			!(cur.kind === 'article' && cur.id === last.view.article.id)
		) {
			return
		}
		void loadNext()
	}, [loadNext])

	// The sentinel one viewport below the last item.
	useEffect(() => {
		const el = sentinelRef.current
		if (!el) return
		const io = new IntersectionObserver(
			list => {
				sentinelSeenRef.current = list.some(e => e.isIntersecting)
				maybeLoad()
			},
			{ rootMargin: '0px 0px 100% 0px' },
		)
		io.observe(el)
		return () => io.disconnect()
	}, [maybeLoad])
	useEffect(() => {
		maybeLoad()
	}, [current, tail, entries, maybeLoad])

	// The current line at 40 percent of the viewport.
	useEffect(() => {
		const root = rootRef.current
		if (!root) return
		const spy = new IntersectionObserver(
			list => {
				for (const entry of list) {
					if (!entry.isIntersecting) continue
					const id = (entry.target as HTMLElement).dataset.feedId
					latestRef.current = id ? { kind: 'article', id } : { kind: 'other' }
				}
				if (locksRef.current.size > 0) return
				setCurrent(latestRef.current)
			},
			{ rootMargin: '-40% 0px -59% 0px' },
		)
		root
			.querySelectorAll<HTMLElement>('[data-feed-spy]')
			.forEach(el => spy.observe(el))
		return () => spy.disconnect()
	}, [entries.length, tail])

	// The first time a card is current: the opened beacon and the address bar.
	useEffect(() => {
		if (current.kind !== 'article') return
		const id = current.id
		if (!openedRef.current.has(id)) {
			openedRef.current.add(id)
			sendBeacon({ articleId: id, kind: 'opened' })
		}
		const path = `/review/${id}`
		if (window.location.pathname !== path) {
			window.history.replaceState(window.history.state, '', path)
		}
	}, [current])

	const onLock = useCallback((id: string, on: boolean) => {
		if (on) locksRef.current.add(id)
		else locksRef.current.delete(id)
		// The spy only reports crossings. When the last lock clears, apply the
		// position it saw while locked.
		if (locksRef.current.size === 0) setCurrent(latestRef.current)
	}, [])

	const onBusy = useCallback((id: string, on: boolean) => {
		setBusyId(prev => (on ? id : prev === id ? null : prev))
	}, [])

	const onDecided = useCallback(
		(id: string, data: DecisionData) => {
			const decision = toDecision(data)
			const showPlenty = 'view' in data && data.view.showPlenty
			setEntries(prev => {
				const next: Entry[] = prev.map(e =>
					isArticle(e) && e.view.article.id === id
						? { ...e, decision, notice: null }
						: e,
				)
				if (showPlenty && 'view' in data) {
					const at = next.findIndex(
						e => isArticle(e) && e.view.article.id === id,
					)
					next.splice(at + 1, 0, {
						type: 'plenty',
						key: `plenty-${id}`,
						approved: data.view.approvedThisSitting,
					})
				}
				return next
			})
			window.requestAnimationFrame(() => {
				document
					.getElementById(cardElementId(id))
					?.scrollIntoView({ block: 'start' })
			})
			if (pendingAfter(id)) return
			if (showPlenty) setTail('plenty')
			else void loadNext()
		},
		[loadNext],
	)

	const onReopened = useCallback((id: string, notice: string) => {
		setEntries(prev =>
			prev.map(e =>
				isArticle(e) && e.view.article.id === id
					? { ...e, status: 'pending', decision: null, notice }
					: e,
			),
		)
	}, [])

	function oneMore(afterKey: string) {
		const at = entries.findIndex(e => e.type === 'plenty' && e.key === afterKey)
		const next = entries
			.slice(at + 1)
			.find(e => isArticle(e) && e.status === 'pending' && !e.decision)
		if (next && isArticle(next)) {
			document
				.getElementById(cardElementId(next.view.article.id))
				?.scrollIntoView({ block: 'start' })
			return
		}
		void loadNext()
	}

	const currentEntry =
		current.kind === 'article'
			? entries.find(
					(e): e is ArticleEntry =>
						isArticle(e) && e.view.article.id === current.id,
				)
			: undefined
	const barOn =
		Boolean(currentEntry) &&
		currentEntry?.status === 'pending' &&
		!currentEntry.decision
	const barArticle = currentEntry?.view.article
	const barBusy = Boolean(barArticle) && busyId === barArticle?.id
	const approveLabel =
		barArticle?.kind === 'blog' ? 'Approve and publish on my site' : 'Approve'

	let articleIndex = -1
	return (
		<div ref={rootRef} className="pb-28">
			{entries.map(entry => {
				if (entry.type === 'plenty') {
					return (
						<PlentyCard
							key={entry.key}
							approved={entry.approved}
							onOneMore={() => oneMore(entry.key)}
						/>
					)
				}
				articleIndex += 1
				const id = entry.view.article.id
				return (
					<div key={id}>
						{articleIndex > 0 ? <Divider view={entry.view} /> : null}
						<ArticleCard
							ref={handle => {
								if (handle) handles.current.set(id, handle)
								else handles.current.delete(id)
							}}
							entry={entry}
							first={articleIndex === 0}
							active={current.kind === 'article' && current.id === id}
							lapsedIntent={articleIndex === 0 && lapsedIntent}
							onDecided={onDecided}
							onReopened={onReopened}
							onLock={onLock}
							onBusy={onBusy}
						/>
					</div>
				)
			})}

			{tail === 'loading' ? (
				<div data-feed-spy="" role="status" className="mt-10 space-y-3">
					<span className="sr-only">Loading the next one</span>
					<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
					<div className="h-3 w-full animate-pulse rounded bg-muted" />
					<div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
				</div>
			) : null}
			{tail === 'empty' ? (
				<section
					data-feed-spy=""
					className="mt-10 rounded-xl border bg-card p-6 text-center shadow-sm"
				>
					<p className="text-base">
						Nothing needs you today. The writers are working.
					</p>
					<Link
						to="/review"
						className="mt-3 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
					>
						Back to the start
					</Link>
				</section>
			) : null}
			<div ref={sentinelRef} aria-hidden="true" className="h-px" />

			<div
				data-review-bar=""
				className={`fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur transition-transform duration-200 ${
					barOn ? 'translate-y-0' : 'translate-y-full'
				}`}
				aria-hidden={!barOn}
			>
				<div className="mx-auto max-w-xl">
					{barArticle ? (
						<p
							key={barArticle.id}
							className="mb-2 line-clamp-1 text-xs text-muted-foreground duration-200 animate-in fade-in"
						>
							<span className="sr-only">This article: </span>
							{barArticle.title}
						</p>
					) : null}
					{/* The blog label is long: it gets its own row on a phone. */}
					<div className="flex flex-wrap items-center gap-2">
						{barArticle?.isReference ? (
							<p className="basis-full text-sm text-muted-foreground">
								{ARTICLE_EDITOR_COPY.referenceNote}
							</p>
						) : (
							<Button
								type="button"
								size="lg"
								className={`min-w-0 flex-1 px-3 text-base ${
									barArticle?.kind === 'blog' ? 'basis-full' : ''
								}`}
								onClick={() =>
									barArticle && handles.current.get(barArticle.id)?.tapApprove()
								}
								disabled={!barOn || barBusy}
								tabIndex={barOn ? 0 : -1}
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
							<Link
								to={changeUrl(barArticle?.id ?? first.article.id)}
								tabIndex={barOn ? 0 : -1}
							>
								Change it
							</Link>
						</Button>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="shrink-0 px-3"
							onClick={() =>
								barArticle && handles.current.get(barArticle.id)?.openMore()
							}
							aria-label="More"
							disabled={!barOn || barBusy}
							tabIndex={barOn ? 0 : -1}
						>
							<Icon name="dots-horizontal" className="h-5 w-5" />
							<span className="sr-only">...</span>
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

function Divider({ view }: { view: CardView }) {
	return (
		<div
			data-feed-spy=""
			className="flex min-h-[40vh] flex-col items-center justify-center border-t py-8 text-center"
		>
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Next one
			</p>
			<p className="mt-2 line-clamp-2 text-lg font-semibold leading-snug">
				{view.article.title}
			</p>
			<p className="mt-1 text-sm text-muted-foreground">
				{view.article.where} · {view.article.about}
			</p>
		</div>
	)
}

function PlentyCard({
	approved,
	onOneMore,
}: {
	approved: number
	onOneMore: () => void
}) {
	return (
		<section
			data-feed-spy=""
			className="mt-6 rounded-xl border bg-card p-6 shadow-sm"
		>
			<p className="text-lg font-medium">
				{approved > 0
					? `That is plenty for now. ${approved} approved.`
					: 'That is plenty for now.'}
			</p>
			<div className="mt-4 flex flex-col gap-2">
				<Form method="post" action="/review?index">
					<input type="hidden" name="intent" value="stop" />
					<Button type="submit" size="lg" className="w-full text-base">
						Stop here
					</Button>
				</Form>
				<Button
					type="button"
					variant="outline"
					size="lg"
					className="w-full text-base"
					onClick={onOneMore}
				>
					One more anyway
				</Button>
			</div>
		</section>
	)
}

/* ------------------------------------------------------------------------ */
/* One card                                                                 */
/* ------------------------------------------------------------------------ */

type CardProps = {
	entry: ArticleEntry
	first: boolean
	active: boolean
	lapsedIntent: boolean
	onDecided: (id: string, data: DecisionData) => void
	onReopened: (id: string, notice: string) => void
	onLock: (id: string, on: boolean) => void
	onBusy: (id: string, on: boolean) => void
}

type CardSheet = SheetKey | 'end' | 'lapsed'

const ArticleCard = forwardRef<CardHandle, CardProps>(function ArticleCard(
	{ entry, first, active, lapsedIntent, onDecided, onReopened, onLock, onBusy },
	ref,
) {
	const { view, status, decision, notice } = entry
	const { article, images, aid, links } = view
	const id = article.id
	const body = article.body
	const fetcher = useFetcher<typeof action>()
	const navigate = useNavigate()
	const busy = fetcher.state !== 'idle'
	const pending = status === 'pending'
	const collapsed = decision !== null
	/** A selected passage can be sent to the editor's chat from here. */
	const commentable = active && pending && !collapsed && !article.isReference

	const [sheet, setSheet] = useState<CardSheet | null>(
		lapsedIntent ? 'lapsed' : null,
	)
	const [error, setError] = useState<string | null>(null)
	const [errorSheet, setErrorSheet] = useState<SheetKey | null>(null)
	const [reachedEnd, setReachedEnd] = useState(article.reachedEnd)
	const [zoom, setZoom] = useState<ZoomTarget | null>(null)
	const [question, setQuestion] = useState(article.question)
	const [answer, setAnswer] = useState(article.answer)
	const [showRejected, setShowRejected] = useState(false)
	const [selecting, setSelecting] = useState(false)
	const cardRef = useRef<HTMLElement>(null)
	const proseRef = useRef<HTMLDivElement>(null)
	const endRef = useRef<HTMLParagraphElement>(null)
	// The furthest paragraph she reached in this visit. "Take me there" reads it.
	const maxSeenRef = useRef(-1)
	const markerDoneRef = useRef(false)
	const handledRef = useRef<unknown>(null)
	const lastIntentRef = useRef('')

	/* ---- the text and its marks ---- */

	const paragraphs = useMemo(() => splitParagraphs(body), [body])
	const claimRanges = useMemo(
		() =>
			findHighlightRanges(
				body,
				aid.claims.map(c => c.quote),
			),
		[body, aid.claims],
	)
	// A quote the panel lists but the text no longer holds reads " (changed)".
	const claims = useMemo(
		() =>
			aid.claims.map((c, index) => ({
				quote: c.quote,
				gone: findHighlightRanges(body, [c.quote]).length === 0,
				index,
			})),
		[aid.claims, body],
	)
	const credentials = useMemo(
		() =>
			aid.credentials.map(c => ({
				quote: c.quote,
				gone: findHighlightRanges(body, [c.quote]).length === 0,
			})),
		[aid.credentials, body],
	)
	const ranges = useMemo(() => {
		const out: ProseRange[] = claimRanges.map(r => ({
			start: r.start,
			end: r.end,
			index: r.index,
			kind: 'claim',
		}))
		// the writer's changes after her note
		for (const at of view.changedParagraphs) {
			const p = paragraphs[at]
			if (p)
				out.push({ start: p.start, end: p.end, index: -1, kind: 'changed' })
		}
		return out
	}, [claimRanges, paragraphs, view.changedParagraphs])
	const resolveImage = useMemo(() => articleImageResolver(images), [images])
	const pictureLines = countPictureLines(body)
	const markerAt =
		pending && article.readToParagraph > 0 && !article.reachedEnd
			? article.readToParagraph
			: null
	const remarkPlugins = useMemo(
		() => [reviewProsePlugin({ paragraphs, ranges, markerAt })],
		[paragraphs, ranges, markerAt],
	)
	// One element, kept while its inputs stand. The card re-renders on a
	// selection (the feed's lock) and on every fetcher step; a re-render of
	// the prose would remount its links and cut a live selection short.
	const prose = useMemo(
		() => (
			<MarkdownContent
				content={body}
				className={PROSE_CLASS}
				remarkPlugins={remarkPlugins}
				resolveImageSrc={resolveImage}
			/>
		),
		[body, remarkPlugins, resolveImage],
	)

	/* ---- "Comment on this": a selected passage goes to the editor's chat ---- */

	const commentOn = useCallback(
		(text: string) => {
			navigate(changeUrl(id, cutQuote(text)))
		},
		[id, navigate],
	)
	const selection = useProseSelection({
		containerRef: proseRef,
		active: commentable && !busy,
		onPick: commentOn,
	})

	/* ---- what the feed needs to know ---- */

	useEffect(() => {
		onBusy(id, busy)
	}, [busy, id, onBusy])
	useEffect(() => {
		onLock(id, sheet !== null || busy || selecting)
		return () => onLock(id, false)
	}, [busy, id, onLock, selecting, sheet])

	// A live selection in the prose holds the current line still.
	useEffect(() => {
		if (!commentable) return
		const onSelection = () => {
			const sel = document.getSelection()
			setSelecting(
				Boolean(
					sel &&
					!sel.isCollapsed &&
					sel.rangeCount > 0 &&
					proseRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer),
				),
			)
		}
		document.addEventListener('selectionchange', onSelection)
		return () => {
			document.removeEventListener('selectionchange', onSelection)
			setSelecting(false)
		}
	}, [commentable])

	// What the server said to the last submission.
	useEffect(() => {
		if (fetcher.formData) {
			lastIntentRef.current = String(fetcher.formData.get('intent') ?? '')
		}
	}, [fetcher.formData])
	useEffect(() => {
		const data = fetcher.data
		if (fetcher.state !== 'idle' || !data || data === handledRef.current) return
		handledRef.current = data
		if ('error' in data) {
			setError(data.error)
			const at = (data as { sheet?: unknown }).sheet
			setErrorSheet(isSheetKey(at) ? at : null)
			return
		}
		setError(null)
		setErrorSheet(null)
		setSheet(null)
		if ('decided' in data) {
			onDecided(id, data)
			return
		}
		if ('asked' in data) {
			setQuestion(data.question)
			setAnswer(null)
			return
		}
		if ('reopened' in data) {
			onReopened(
				id,
				lastIntentRef.current === 'takedown'
					? 'Taken down. It is off your blog.'
					: 'Undone. It is back in your list.',
			)
		}
	}, [fetcher.data, fetcher.state, id, onDecided, onReopened])

	useImperativeHandle(
		ref,
		() => ({
			tapApprove() {
				if (reachedEnd) approve()
				else setSheet('end')
			},
			openMore() {
				setSheet('more')
			},
		}),
		// approve() reads state that changes with these
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[reachedEnd, id],
	)

	/* ---- reading, recorded and never policed ---- */

	useEffect(() => {
		if (collapsed) return
		const total = paragraphs.length
		let lastSent = -1
		const send = (paragraph: number, end: boolean, unload = false) => {
			lastSent = paragraph
			sendBeacon({ articleId: id, kind: 'read_to', paragraph, end }, unload)
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

		let frame = 0
		if (first && !markerDoneRef.current) {
			markerDoneRef.current = true
			frame = window.requestAnimationFrame(() => {
				cardRef.current
					?.querySelector(`#${MARKER_ID}`)
					?.scrollIntoView({ block: 'center' })
			})
		}

		return () => {
			if (frame) window.cancelAnimationFrame(frame)
			seen.disconnect()
			atEnd.disconnect()
			document.removeEventListener('visibilitychange', onVisibility)
			window.removeEventListener('pagehide', flush)
			flush()
		}
	}, [id, paragraphs.length, collapsed, first])

	/* ---- actions ---- */

	function approve() {
		setSheet(null)
		fetcher.submit(
			{ intent: 'approve' },
			{ method: 'post', action: `/review/${id}?intent=approve` },
		)
	}

	function takeMeThere() {
		setSheet(null)
		// The block after the furthest one she reached in this visit (the end
		// line when that was the last block), then the marker from her last
		// visit, then the top of the text.
		const root = cardRef.current
		const seen = maxSeenRef.current
		const next =
			seen < 0
				? null
				: (root?.querySelector(`[data-paragraph="${seen + 1}"]`) ??
					endRef.current)
		scrollTo(
			next ??
				root?.querySelector(`#${MARKER_ID}`) ??
				root?.querySelector('[data-every-word]'),
		)
	}

	/** A tap on a picture zooms it. The marks are plain text. */
	function onProseClick(event: React.MouseEvent<HTMLDivElement>) {
		const hit = zoomTarget(event.target)
		if (hit) setZoom(hit)
	}

	/* ---- render ---- */

	const zoomedImage = zoom
		? images.find(im => articleImageUrl(im.id) === zoom.src)
		: undefined
	const rewriteBack =
		Boolean(article.revisionNote) && isRewriteNote(article.revisionNote)
	const rewriteSaid = rewriteWords(article.revisionNote)
	const stateLabel = decision ? collapsedLabel(decision) : null

	return (
		<article
			id={cardElementId(id)}
			ref={cardRef}
			data-feed-id={id}
			data-feed-spy=""
			className="scroll-mt-2"
			aria-current={active ? 'true' : undefined}
		>
			<header>
				<h1
					className={
						collapsed
							? 'line-clamp-2 text-lg font-semibold leading-tight'
							: 'text-2xl font-semibold leading-tight'
					}
				>
					{article.title}
				</h1>
				{collapsed ? (
					<p className="mt-1 text-sm text-muted-foreground">{stateLabel}</p>
				) : (
					<p className="mt-2 text-sm text-muted-foreground">
						{article.where} · {article.byline} · {article.about}
					</p>
				)}
				{notice && !collapsed ? (
					<p className="mt-2 text-sm font-medium text-green-800 dark:text-green-200">
						{notice}
					</p>
				) : null}
			</header>

			{decision ? (
				<DecidedCard
					article={article}
					decision={decision}
					busy={busy}
					onUndo={() =>
						fetcher.submit(
							{ intent: 'reopen' },
							{ method: 'post', action: `/review/${id}` },
						)
					}
					onTakedown={() =>
						fetcher.submit(
							{ intent: 'takedown' },
							{ method: 'post', action: `/review/${id}` },
						)
					}
				/>
			) : (
				<>
					{!pending ? (
						<DecidedBanner
							article={article}
							status={status}
							busy={busy}
							onReopen={intent =>
								fetcher.submit(
									{ intent },
									{ method: 'post', action: `/review/${id}` },
								)
							}
						/>
					) : null}

					{rewriteBack ? (
						<div className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
							<p className="font-medium">A new article, as you asked.</p>
							{rewriteSaid ? (
								<p className="mt-1">You said: “{rewriteSaid}”</p>
							) : null}
							{article.revisionBaseBody ? (
								<button
									type="button"
									onClick={() => setShowRejected(v => !v)}
									aria-expanded={showRejected}
									className="mt-1 text-sm underline underline-offset-2"
								>
									See the one you turned down
								</button>
							) : null}
							{showRejected && article.revisionBaseBody ? (
								<MarkdownContent
									content={article.revisionBaseBody}
									className="prose prose-sm mt-3 max-w-none text-muted-foreground dark:prose-invert"
									resolveImageSrc={resolveImage}
								/>
							) : null}
						</div>
					) : article.revisionNote ? (
						<div className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
							<p>
								Your note: “{article.revisionNote}”. The writer’s changes are
								marked.
							</p>
						</div>
					) : null}

					{answer ? (
						<div className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
							<p className="font-medium">Zane says:</p>
							<p className="mt-1 whitespace-pre-wrap">{answer}</p>
						</div>
					) : question ? (
						<div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
							<p className="font-medium">You asked Zane:</p>
							<p className="mt-1 whitespace-pre-wrap">{question}</p>
							<p className="mt-1 text-xs">His answer will show here.</p>
						</div>
					) : null}

					<section className="mt-5 rounded-xl border bg-card p-4 shadow-sm">
						<h2 className="text-base font-semibold">Things to check first</h2>

						<PanelSection number={1} title="Medical claims">
							{claims.length === 0 ? (
								<p className="text-sm text-muted-foreground">None found.</p>
							) : (
								<ul className="space-y-1">
									{claims.map(c => (
										<li key={c.index}>
											<CheckRow quote={c.quote} gone={c.gone} />
										</li>
									))}
								</ul>
							)}
						</PanelSection>

						<PanelSection number={2} title="Your credentials">
							{credentials.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									This text does not name you or the practice.
								</p>
							) : (
								<ul className="space-y-1">
									{credentials.map((c, i) => (
										<li key={i}>
											<CheckRow quote={c.quote} gone={c.gone} />
										</li>
									))}
								</ul>
							)}
						</PanelSection>

						<PanelSection number={3} title="Links">
							{links.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No links were asked for.
								</p>
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
													<span className="font-medium">
														{l.anchor ?? l.name}
													</span>
													<Icon
														name="arrow-right"
														className="h-4 w-4 text-muted-foreground"
													/>
													<span>{l.domain}</span>
													<span className="text-muted-foreground">
														({l.name})
													</span>
												</p>
											)}
										</li>
									))}
								</ul>
							)}
						</PanelSection>

						<PanelSection number={4} title="Pictures">
							<p className="text-sm text-muted-foreground">
								{picturesNote(pictureLines, images.length)}
							</p>
							{pictureLines === 0 && images.length > 0 ? (
								<ul className="-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-1">
									{images.map(im => (
										<li key={im.id} className="w-36 shrink-0">
											<button
												type="button"
												onClick={() =>
													setZoom({
														src: articleImageUrl(im.id),
														alt: im.altText ?? '',
													})
												}
												className="block w-full rounded-lg border bg-background p-1 text-left"
												aria-label={`Zoom: ${im.altText ?? 'picture'}`}
											>
												<img
													src={articleImageUrl(im.id)}
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
							) : null}
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
						<h2
							data-every-word=""
							className="scroll-mt-4 text-base font-semibold"
						>
							Every word
						</h2>
						<div
							ref={proseRef}
							role="presentation"
							onClick={onProseClick}
							className="mt-3"
						>
							{prose}
						</div>
						<p
							ref={endRef}
							className="mt-8 text-center text-sm text-muted-foreground"
						>
							That is all of it.
						</p>
					</section>

					<CommentOnThis
						candidate={selection.candidate}
						bottom="bar"
						onPick={selection.pick}
					/>
				</>
			)}

			{sheet === 'more' ? (
				<Sheet onClose={() => setSheet(null)} title="More">
					<div className="flex flex-col gap-2">
						<fetcher.Form method="post" action={`/review/${id}`}>
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
						</fetcher.Form>
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
							className="w-full text-base"
							onClick={() => setSheet('rewrite')}
						>
							Write a different article
						</Button>
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
					{error && errorSheet === 'more' ? (
						<SheetError>{error}</SheetError>
					) : null}
				</Sheet>
			) : null}

			{sheet === 'ask' ? (
				<Sheet onClose={() => setSheet(null)} title="Ask Zane">
					<fetcher.Form
						method="post"
						action={`/review/${id}`}
						className="space-y-3"
					>
						<input type="hidden" name="intent" value="question" />
						<DictatedNote
							id={`review-question-${id}`}
							name="question"
							label="Ask Zane one thing"
							rows={2}
							required
							placeholder="Is this publisher real?"
							initial={question ?? ''}
							error={error && errorSheet === 'ask' ? error : null}
							submit={listening => (
								<Button
									type="submit"
									size="lg"
									className="min-w-0 flex-1 text-base"
									disabled={busy || listening}
								>
									Send
								</Button>
							)}
						/>
					</fetcher.Form>
				</Sheet>
			) : null}

			{sheet === 'writer' ? (
				<Sheet onClose={() => setSheet(null)} title="Send a note to the writer">
					<fetcher.Form
						method="post"
						action={`/review/${id}`}
						className="space-y-3"
					>
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
						<DictatedNote
							id={`review-writer-note-${id}`}
							name="note"
							label="What to change"
							hideLabel
							rows={3}
							placeholder="Say what to change. The writer sends it back to you."
							error={error && errorSheet === 'writer' ? error : null}
							submit={listening => (
								<Button
									type="submit"
									size="lg"
									className="min-w-0 flex-1 text-base"
									disabled={busy || listening}
								>
									Send to the writer
								</Button>
							)}
						/>
					</fetcher.Form>
				</Sheet>
			) : null}

			{sheet === 'rewrite' ? (
				<Sheet onClose={() => setSheet(null)} title="Write a different article">
					<p className="text-sm text-muted-foreground">
						The writer starts over with a new topic for{' '}
						{article.kind === 'blog'
							? 'your blog'
							: (article.publication ?? 'the publisher')}
						. This one leaves your list until the new one is ready. That usually
						takes a day or two.
					</p>
					{article.publisherWaiting ? (
						<p className="mt-2 text-sm text-muted-foreground">
							The publisher agreed to this topic. The writer will offer them the
							new one.
						</p>
					) : null}
					<fetcher.Form
						method="post"
						action={`/review/${id}`}
						className="mt-3 space-y-3"
					>
						<input type="hidden" name="intent" value="rewrite" />
						<DictatedNote
							id={`review-rewrite-note-${id}`}
							name="note"
							label="Anything to tell the writer? (optional)"
							rows={2}
							placeholder="For example: not fillers again, something about skin care."
							error={error && errorSheet === 'rewrite' ? error : null}
							submit={listening => (
								<Button
									type="submit"
									size="lg"
									className="min-w-0 flex-1 text-base"
									disabled={busy || listening}
								>
									Write a different one
								</Button>
							)}
						/>
					</fetcher.Form>
				</Sheet>
			) : null}

			{sheet === 'deny' ? (
				<Sheet onClose={() => setSheet(null)} title="Do not publish this">
					<p className="text-sm text-muted-foreground">
						This drops the placement. Use Change it if you want a fix.
					</p>
					<fetcher.Form
						method="post"
						action={`/review/${id}`}
						className="mt-3 space-y-3"
					>
						<input type="hidden" name="intent" value="deny" />
						<label
							htmlFor={`review-deny-note-${id}`}
							className="text-sm font-medium"
						>
							Why not? One line helps the next draft.
						</label>
						<Textarea
							id={`review-deny-note-${id}`}
							name="note"
							rows={2}
							required
							className="text-base"
						/>
						{error && errorSheet === 'deny' ? (
							<SheetError>{error}</SheetError>
						) : null}
						<Button
							type="submit"
							variant="destructive"
							size="lg"
							className="w-full text-base"
							disabled={busy}
						>
							Do not use it
						</Button>
					</fetcher.Form>
				</Sheet>
			) : null}

			{sheet === 'end' ? (
				<Sheet
					onClose={() => setSheet(null)}
					title="You have not reached the end yet. Read the rest?"
				>
					<div className="flex flex-col gap-2">
						<Button
							type="button"
							size="lg"
							className="w-full text-base"
							onClick={takeMeThere}
						>
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
						navigate(`/review/${id}`, { replace: true })
					}}
					title="You tapped Approve before you signed in. Approve now?"
				>
					<div className="flex flex-col gap-2">
						<Button
							type="button"
							size="lg"
							className="w-full text-base"
							onClick={approve}
							disabled={busy}
						>
							Approve now
						</Button>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full text-base"
							onClick={() => {
								setSheet(null)
								navigate(`/review/${id}`, { replace: true })
							}}
						>
							Not now
						</Button>
					</div>
				</Sheet>
			) : null}

			{zoom ? (
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
						aria-label={zoom.alt || 'Picture'}
						className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4"
					>
						<img
							src={zoom.src}
							alt={zoom.alt}
							className="max-h-[80vh] w-full max-w-xl rounded object-contain"
						/>
						{zoom.alt || zoomedImage?.caption ? (
							<p className="mt-3 max-w-xl text-center text-sm text-white">
								{zoom.alt || zoomedImage?.caption}
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
		</article>
	)
})

/**
 * A note box in a sheet, with dictation: the box (the form field keeps its
 * `name`), the microphone, the status line, then the sheet's own submit
 * button, which the sheet disables while a dictation runs. Spoken words
 * show as grey ghost text and join the typed words when she stops.
 */
function DictatedNote({
	id,
	name,
	label,
	hideLabel = false,
	rows = 3,
	required = false,
	placeholder,
	initial = '',
	error,
	submit,
}: {
	id: string
	name: string
	label: string
	hideLabel?: boolean
	rows?: number
	required?: boolean
	placeholder?: string
	initial?: string
	error: string | null
	submit: (listening: boolean) => React.ReactNode
}) {
	const [value, setValue] = useState(initial)
	const [ghost, setGhost] = useState('')
	const dictation = useDictation({
		onInterim: setGhost,
		onFinal: text => {
			setValue(current => appendSpeech(current, text))
			setGhost('')
		},
	})
	return (
		<>
			<label
				htmlFor={id}
				className={hideLabel ? 'sr-only' : 'text-sm font-medium'}
			>
				{label}
			</label>
			<GhostTextarea
				id={id}
				name={name}
				value={value}
				ghost={ghost}
				listening={dictation.listening}
				onChange={e => setValue(e.currentTarget.value)}
				rows={rows}
				required={required}
				placeholder={placeholder}
				aria-label={hideLabel ? label : undefined}
				className="text-base"
			/>
			<DictationNote dictation={dictation} />
			{error ? <SheetError>{error}</SheetError> : null}
			<div className="flex flex-wrap items-center gap-2">
				<DictateButton dictation={dictation} disabled={false} />
				{submit(dictation.listening)}
			</div>
		</>
	)
}

/** One row of claims or credentials: the quote as plain text. */
function CheckRow({ quote, gone }: { quote: string; gone: boolean }) {
	const text = plainQuote(quote)
	return (
		<p className={`py-1 text-sm ${gone ? 'text-muted-foreground' : ''}`}>
			{gone ? `“${text}” (changed)` : `“${text}”`}
		</p>
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

type ViewArticle = CardView['article']

/** A deep-linked article she decided before: the record and a way back. */
function DecidedBanner({
	article,
	status,
	busy,
	onReopen,
}: {
	article: ViewArticle
	status: string
	busy: boolean
	onReopen: (intent: 'reopen' | 'takedown') => void
}) {
	const when = article.reviewedAt ? ` on ${formatDate(article.reviewedAt)}` : ''
	const isApproved = status === 'approved'
	const takedown = isApproved && article.kind === 'blog'
	return (
		<div
			className={`mt-4 rounded-md border p-3 text-sm ${
				isApproved
					? 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100'
					: status === 'denied'
						? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
						: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
			}`}
		>
			<p className="font-medium">
				{isApproved
					? `Approved${when}.`
					: status === 'denied'
						? `Do not publish${when}.`
						: article.rewriteRequested
							? `A new article is on its way${when}.`
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
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="mt-2"
				disabled={busy}
				onClick={() => onReopen(takedown ? 'takedown' : 'reopen')}
			>
				{takedown
					? 'Take it down'
					: article.rewriteRequested
						? 'Keep this one'
						: 'Reopen'}
			</Button>
		</div>
	)
}

function collapsedLabel(decision: Decision): string {
	switch (decision.kind) {
		case 'approved':
			return 'Approved'
		case 'later':
			return 'Set aside for 3 days'
		case 'writer':
		case 'rewrite':
			return 'Sent to the writer'
		case 'denied':
			return 'Set aside. It will not go anywhere.'
	}
}

/** S7 as a card: what happens next, and the way back for a few seconds. */
function DecidedCard({
	article,
	decision,
	busy,
	onUndo,
	onTakedown,
}: {
	article: ViewArticle
	decision: Decision
	busy: boolean
	onUndo: () => void
	onTakedown: () => void
}) {
	const [undoOpen, setUndoOpen] = useState(decision.kind === 'approved')
	useEffect(() => {
		if (decision.kind !== 'approved') return
		const timer = window.setTimeout(() => setUndoOpen(false), UNDO_MS)
		return () => window.clearTimeout(timer)
	}, [decision.kind])

	if (decision.kind === 'approved') {
		const blogPath = decision.blogPath ?? `/blog/${article.slug ?? ''}`
		return (
			<section className="mt-4 rounded-xl border border-green-300 bg-green-50 p-5 text-center text-green-900 shadow-sm dark:border-green-800 dark:bg-green-950 dark:text-green-100">
				<div className="mx-auto w-fit rounded-full bg-green-100 p-3 dark:bg-green-900">
					<Icon
						name="check"
						className="h-8 w-8 text-green-700 dark:text-green-200"
					/>
				</div>
				<p className="mt-3 text-xl font-semibold">Approved.</p>
				{article.kind === 'blog' ? (
					<>
						<p className="mt-2 text-base">
							{`It is live now: hitchcoxaesthetics.com${blogPath}`}
						</p>
						<div className="mt-3 flex justify-center gap-2">
							<Button asChild variant="outline">
								<a href={blogPath} target="_blank" rel="noreferrer">
									Open it
								</a>
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={onTakedown}
							>
								Take it down
							</Button>
						</div>
					</>
				) : (
					<p className="mt-2 text-base">
						“{article.title}” is on its way to{' '}
						{article.publication ?? 'the publisher'}. You will see Sent here,
						then Live when the publisher posts it, with the link.
					</p>
				)}
				<p className="mt-3 text-sm text-muted-foreground">{`${decision.doneToday} done today.`}</p>
				{undoOpen ? (
					<button
						type="button"
						disabled={busy}
						onClick={onUndo}
						className="mt-2 text-sm font-medium text-primary underline underline-offset-2"
					>
						Undo
					</button>
				) : null}
			</section>
		)
	}

	if (decision.kind === 'rewrite') {
		return (
			<section className="mt-4 rounded-xl border bg-card p-5 text-center shadow-sm">
				<p className="text-base">
					A new article is on its way. It comes back to you here.
				</p>
				<p className="mt-3 text-sm text-muted-foreground">
					Changed your mind?{' '}
					<button
						type="button"
						disabled={busy}
						onClick={onUndo}
						className="font-medium text-primary underline underline-offset-2"
					>
						Keep this one
					</button>
				</p>
			</section>
		)
	}

	return (
		<section className="mt-4 rounded-xl border bg-card p-5 text-center shadow-sm">
			<p className="text-base">
				{decision.kind === 'writer'
					? 'Sent to the writer. It comes back to you as "Your change is in".'
					: decision.kind === 'later'
						? 'Set aside for 3 days.'
						: 'Set aside. It will not go anywhere.'}
			</p>
		</section>
	)
}
