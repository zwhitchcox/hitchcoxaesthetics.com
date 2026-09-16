import { createHash } from 'node:crypto'
import { createId } from '@paralleldrive/cuid2'
import { type Locator, type Page } from '@playwright/test'
import { countWords } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { estimateReadSeconds } from '#app/utils/review-aid.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Sarah's phone review (/review) end to end, at phone width (spec section 9,
 * phase 4 plan section G.8).
 *
 * Four articles: two short guest posts (both fit the 2 min lane, so the feed
 * has a next card), a blog post and a guest post a publisher is holding a
 * spot for (both too long for 2 min). The walk: pick 2 min, the shortest is
 * served with its picture in the prose and inert claim marks, read to the
 * end, Approve, the approved card and its record, the next one below it,
 * Undo. "Change it" opens the editor page (phase 4.1 facts R1-R7): the
 * article fills the screen in the rich editor, the top bar holds Back to
 * the article, the Markdown toggle and Approve, and one dock sits at the
 * bottom with the composer, the save mark at the end of its row (a spinner
 * while a save waits or runs, a check after it; `data-save-state` carries
 * the state) and a tab on its top edge that opens the chat sheet. There is
 * no tab strip and no status line before the first turn. Opening the editor
 * never saves. A (mocked) chat turn from the dock changes the text in
 * place: the status line reads "Changed: …" with "See it" and "Undo", the
 * green mark shows, the Markdown toggle holds the new text, and "Undo" puts
 * the old text back with a real save. A selected passage in the article
 * becomes a quote through "Comment on this" in the format row. An attached
 * picture (the upload is mocked) shows a thumbnail in the dock, goes out
 * with her words, and lands in the text as a `user-` picture line; the chat
 * sheet shows both bubbles. "Write a different article" on the next card
 * (no note field; the "…" sheet has no Deny and no note to the writer),
 * the sync endpoint answers `meta` for the same text and `kept` for
 * different text while she waits, then "Keep this one". The blog post gets
 * "Approve anyway" on the read-to-the-end sheet; a typed edit in the rich
 * editor and one under the Markdown toggle save themselves and survive a
 * reload; the dock stays inside the screen with the box focused. The guest
 * post gets no "Approve anyway"; a selected passage on the reading page
 * opens the editor with the quote in the dock; Change it opens the editor
 * with no edit, and Back keeps the stored text byte for byte.
 *
 * The chat turn is mocked at /resources/article-chat (no OpenRouter call):
 * the mock writes the changed text with prisma, as the real resource does,
 * so the hash it returns is real and the Undo that follows is a real save.
 * The save is never mocked.
 *
 * The dev server and this test share prisma/data.db. Other pending articles
 * would take the 2 min card, so the test holds them out with the app's own
 * `skippedUntil` (10 minutes, restored at the end).
 *
 * `hashBody` is not imported from app/utils/articles.server.ts on purpose:
 * that module declares a class with TypeScript parameter properties, which
 * Node's strip-only type loader (the one Playwright's workers use here)
 * refuses. The oracle below is the spec's definition of the approval record.
 *
 * The caret goes to the end of a paragraph through a DOM selection, not the
 * End key: on macOS Playwright maps End to `scrollToEndOfDocument:`, which
 * scrolls and does not move the caret in a contenteditable.
 */

test.use({ viewport: { width: 390, height: 844 } })

/** sha256 of the exact text she approved, CRLF folded and trimmed (spec section 4). */
function hashBody(body: string): string {
	return createHash('sha256')
		.update(body.replace(/\r\n/g, '\n').trim())
		.digest('hex')
}

const ONE_PIXEL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64',
)

const PUBLICATION = 'example-magazine.com'
const LINKS = [
	{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com' },
]

const SENTENCES = [
	'Most people notice the first change in about two weeks, and the full result settles in by the end of the month.',
	'A good consultation starts with what bothers you when you look in the mirror, not with a product name.',
	'The plan is written down, so the next visit picks up where the last one ended.',
	'Small doses spaced out over time give a softer look than one large dose.',
	'Ask how the person treating you was trained and how often they do this exact treatment.',
	'Sun protection every morning does more for the skin than any single procedure.',
]

/** `count` paragraphs of three sentences each, all different from one another. */
function paragraphs(count: number, offset = 0): string {
	return Array.from({ length: count }, (_, i) =>
		[0, 1, 2]
			.map(k => SENTENCES[(i * 3 + k + offset) % SENTENCES.length])
			.join(' '),
	).join('\n\n')
}

/** The one medical claim in SHORT_BODY: the word search finds "20 units". */
const SHORT_CLAIM =
	'A tight jaw from clenching often responds to 20 units on each side, spread over three points in the masseter.'

/** About 100 words: fits the 2 min lane. Has a claim, the byline, the link, and a picture in place. */
const SHORT_BODY = [
	'# Botox for a tight jaw',
	'',
	SHORT_CLAIM,
	'',
	'![a test picture](images/image-1.png)',
	'',
	'Sarah Hitchcox, RN, treats this at [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com) in Knoxville.',
	'',
	paragraphs(1),
].join('\n')

/** What the mocked chat turn writes: the dose becomes a range, nothing else moves. */
const SHORT_BODY_CHANGED = SHORT_BODY.replace(
	'20 units on each side',
	'15 to 25 units on each side',
)
/** The change row's text. Lowercase first, so the line reads the same whether summaryLine folds it or not. */
const CHANGE_SUMMARY = 'the dose is now a range.'
const CHAT_WORDS = 'Say 15 to 25 units, it depends on the person.'

/** A little longer than SHORT_BODY, so it is served second in the 2 min lane. */
const SECOND_BODY = [
	'# What a brow lift with Botox can do',
	'',
	'A few units above the outer brow can lift it a little, and the effect shows in about ten days.',
	'',
	'Sarah Hitchcox, RN, does this at [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com) in Knoxville.',
	'',
	paragraphs(1, 3),
	'',
	'The result is subtle on purpose, and a follow-up visit checks that both sides match.',
].join('\n')

/** About 700 words: out of the 2 min lane, in the 5 min lane. */
const BLOG_BODY = [
	'# What to ask before your first visit',
	'',
	'You can book with [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com) online.',
	'',
	paragraphs(12, 1),
].join('\n')

/** Her typed words at the end of the last paragraph, in the rich editor. */
const BLOG_BODY_TYPED = `${BLOG_BODY} Sarah added this line.`

/** Her edit under the Markdown toggle: the same line as its own paragraph. */
const BLOG_BODY_EDITED = `${BLOG_BODY}\n\nSarah added this line.`

/**
 * The first paragraph of HELD_BODY, as it reads on the page (no link marks).
 * The link and the final period are part of it on purpose: a re-render of
 * the prose while she selects would remount the link and cut the selection
 * there, so the quote must arrive whole.
 */
const HELD_FIRST_PARAGRAPH =
	'Sarah Hitchcox, RN, writes every plan by hand at Sarah Hitchcox Aesthetics.'

/** About 900 words: out of the 2 min lane, in the 5 min lane. */
const HELD_BODY = [
	'# How a treatment plan is built',
	'',
	'Sarah Hitchcox, RN, writes every plan by hand at [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com).',
	'',
	paragraphs(15, 2),
].join('\n')

function articleData(body: string) {
	const wordCount = countWords(body)
	return {
		body,
		bodyOriginal: body,
		bodyHash: hashBody(body),
		wordCount,
		estimatedReadSeconds: estimateReadSeconds(wordCount),
		byline: 'Sarah Hitchcox, RN',
		writer: 'fable-5.1',
		linksJson: JSON.stringify(LINKS),
	}
}

const onePicture = {
	create: [
		{
			fileName: 'image-1.png',
			contentType: 'image/png',
			blob: ONE_PIXEL_PNG,
			altText: 'a test picture',
			caption: 'A caption.',
			position: 0,
		},
	],
}

/** Screenshot names: `review-phone-*` by default; a run can set REVIEW_SHOT_PREFIX. */
const SHOT_PREFIX = process.env.REVIEW_SHOT_PREFIX ?? 'review-phone'
const shot = (name: string) => `test-results/${SHOT_PREFIX}-${name}.png`

/** One card of the feed. Every check on an article is scoped to its card. */
function card(page: Page, id: string) {
	return page.locator(`#feed-${id}`)
}

/** The title in a card's header. The prose renders the markdown `# title` as a second h1. */
function cardTitle(page: Page, id: string, title: string) {
	return card(page, id)
		.locator('header')
		.getByRole('heading', { name: title, level: 1 })
}

/** The "Next one" divider that holds a title. */
function divider(page: Page, title: string) {
	return page
		.locator('[data-feed-spy]', { hasText: 'Next one' })
		.filter({ hasText: title })
}

/** The article block on the editor page: the rich editor, the Markdown box, or the read-only view. */
function article(page: Page) {
	return page.locator('[data-article-preview]')
}

/** The rich editor's root: a contenteditable named "Article". */
function richEditor(page: Page) {
	return page.getByRole('textbox', { name: 'Article', exact: true })
}

/** The one-line status above the composer in the dock (a change, an answer or an error). Absent before the first turn. */
function statusLine(page: Page) {
	return page.locator('[data-chat-dock] [data-status-line]')
}

/** The "Markdown" toggle in the editor's slot in the top bar; `aria-pressed` carries its state. */
function markdownToggle(page: Page) {
	return page
		.locator('[data-editor-bar-slot]')
		.getByRole('button', { name: 'Markdown', exact: true })
}

/** The save mark at the end of the dock's composer row; `data-save-state` is idle, saving, saved, error or conflict. */
function saveMark(page: Page) {
	return page.locator('[data-chat-dock] [data-save-state]')
}

/** The tab on the dock's top edge: "Open the chat" while the sheet is closed, "Close the chat" while it is open. */
function chatTab(page: Page) {
	return page.locator('[data-chat-dock] [aria-controls="article-chat-sheet"]')
}

/** The tab on the dock opens the chat sheet and flips to "Close the chat", expanded. */
async function openChat(page: Page) {
	await expect(chatTab(page)).toHaveAttribute('aria-expanded', 'false')
	await page
		.locator('[data-chat-dock]')
		.getByRole('button', { name: 'Open the chat', exact: true })
		.click()
	await expect(
		page.getByRole('dialog', { name: 'Chat', exact: true }),
	).toBeVisible()
	await expect(chatTab(page)).toHaveAttribute('aria-label', 'Close the chat')
	await expect(chatTab(page)).toHaveAttribute('aria-expanded', 'true')
}

/** The tab closes the sheet and flips back. The sheet's × has the same name, so the dock's button is the one. */
async function closeChat(page: Page) {
	await page
		.locator('[data-chat-dock]')
		.getByRole('button', { name: 'Close the chat', exact: true })
		.click()
	await expect(
		page.getByRole('dialog', { name: 'Chat', exact: true }),
	).toHaveCount(0)
	await expect(chatTab(page)).toHaveAttribute('aria-label', 'Open the chat')
	await expect(chatTab(page)).toHaveAttribute('aria-expanded', 'false')
}

/** Scroll one element to the middle of the screen, clear of the fixed dock and the top bar. */
async function scrollToCentre(target: Locator) {
	await target.evaluate(el => el.scrollIntoView({ block: 'center' }))
}

/** Select the whole text of one block, as a finger drag would. */
async function selectText(block: Locator) {
	await block.scrollIntoViewIfNeeded()
	await block.evaluate(el => {
		const range = document.createRange()
		range.selectNodeContents(el)
		const selection = window.getSelection()
		selection?.removeAllRanges()
		selection?.addRange(range)
	})
}

/** Put the caret after the last character of one block, as a tap after its last word would. */
async function caretToEnd(block: Locator) {
	await block.evaluate(el => {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
		let last: Node | null = null
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			last = node
		}
		const range = document.createRange()
		range.selectNodeContents(last ?? el)
		range.collapse(false)
		const selection = window.getSelection()
		selection?.removeAllRanges()
		selection?.addRange(range)
	})
}

/** The "Comment on this" pill on the reading page. Its name starts with the label; the pill adds the first words. */
function commentPill(page: Page) {
	return page.getByRole('button', { name: /^Comment on this/ })
}

/** The page body must never scroll sideways at phone width. */
async function expectNoSidewaysScroll(page: Page) {
	const widths = await page.evaluate(() => ({
		page: document.documentElement.scrollWidth,
		viewport: window.innerWidth,
	}))
	expect(widths.page, 'page wider than the viewport').toBeLessThanOrEqual(
		widths.viewport,
	)
}

async function eventKinds(articleId: string): Promise<string[]> {
	const rows = await prisma.articleReviewEvent.findMany({
		where: { articleId },
		orderBy: { at: 'asc' },
		select: { kind: true },
	})
	return rows.map(r => r.kind)
}

/** The review events of one kind for an article, oldest first. A `saved` row carries its source (`auto` or `ai`) as `note`. */
async function eventsOfKind(articleId: string, kind: string) {
	return prisma.articleReviewEvent.findMany({
		where: { articleId, kind },
		orderBy: { at: 'asc' },
		select: { note: true, userId: true, seconds: true },
	})
}

test('Sarah reviews on her phone: lane, approve, undo, the editor and its dock, a different article, sync, auto-save, the end gate, comment on this, a look with no edit', async ({
	page,
	login,
	request,
}) => {
	test.setTimeout(240_000)

	for (const name of ['user', 'admin']) {
		await prisma.role.upsert({
			where: { name },
			update: {},
			create: { name, description: name },
		})
	}
	const user = await login()
	await prisma.user.update({
		where: { id: user.id },
		data: { roles: { connect: { name: 'admin' } } },
	})

	const stamp = Date.now()
	const short = await prisma.article.create({
		data: {
			...articleData(SHORT_BODY),
			kind: 'guest',
			sourceKey: `test:phone-short:${stamp}`,
			publication: PUBLICATION,
			publicationUrl: `https://${PUBLICATION}/`,
			title: 'Botox for a tight jaw',
			images: onePicture,
		},
	})
	const second = await prisma.article.create({
		data: {
			...articleData(SECOND_BODY),
			kind: 'guest',
			sourceKey: `test:phone-second:${stamp}`,
			publication: PUBLICATION,
			publicationUrl: `https://${PUBLICATION}/`,
			title: 'What a brow lift with Botox can do',
			images: onePicture,
		},
	})
	const blog = await prisma.article.create({
		data: {
			...articleData(BLOG_BODY),
			kind: 'blog',
			sourceKey: `test:phone-blog:${stamp}`,
			slug: `phone-test-${stamp}`,
			title: 'What to ask before your first visit',
		},
	})
	const held = await prisma.article.create({
		data: {
			...articleData(HELD_BODY),
			kind: 'guest',
			sourceKey: `test:phone-held:${stamp}`,
			publication: PUBLICATION,
			publicationUrl: `https://${PUBLICATION}/`,
			title: 'How a treatment plan is built',
			publisherWaiting: true,
			placementUsd: 150,
			images: onePicture,
		},
	})
	const mine = [short.id, second.id, blog.id, held.id]

	// Hold every other pending article out of the lanes while this runs.
	const others = await prisma.article.findMany({
		where: { status: 'pending', id: { notIn: mine } },
		select: { id: true, skippedUntil: true },
	})
	const holdUntil = new Date(Date.now() + 10 * 60 * 1000)
	await prisma.article.updateMany({
		where: { id: { in: others.map(o => o.id) } },
		data: { skippedUntil: holdUntil },
	})

	// Every address the page lands on, including the ones it replaces at once.
	const visited: string[] = []
	page.on('framenavigated', frame => {
		if (frame === page.mainFrame()) visited.push(frame.url())
	})

	try {
		/* S2: home, the lane pick, the short one is served */
		await page.goto('/review')
		await expect(page.getByText('How long do you have?')).toBeVisible()
		await page.getByRole('button', { name: '2 min' }).click()
		await expect(page.getByRole('button', { name: '2 min' })).toHaveAttribute(
			'aria-pressed',
			'true',
		)
		await expect(page.getByRole('heading', { name: short.title })).toBeVisible()
		await expect(page.getByText(`Goes on ${PUBLICATION}`)).toBeVisible()
		await expect(page.getByRole('heading', { name: blog.title })).toHaveCount(0)
		await expect(page.getByRole('heading', { name: held.title })).toHaveCount(0)
		await expectNoSidewaysScroll(page)
		await page.screenshot({ path: shot('home'), fullPage: true })

		/* S3: the article, with its picture in the prose and inert claim marks */
		await page.getByRole('link', { name: 'Start' }).click()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}$`))
		const shortCard = card(page, short.id)
		await expect(cardTitle(page, short.id, short.title)).toBeVisible()
		await expect(shortCard.getByText('By Sarah Hitchcox, RN')).toBeVisible()
		await expect(shortCard.getByText('Things to check first')).toBeVisible()
		await expect(shortCard.getByText('Every word')).toBeVisible()
		const picture = shortCard.locator(
			'section:has([data-every-word]) img[alt="a test picture"]',
		)
		await expect(picture).toBeVisible()
		// the writer's `images/image-1.png` resolves to the stored picture
		await expect(picture).toHaveAttribute(
			'src',
			/^\/resources\/article-images\/[A-Za-z0-9]+$/,
		)
		await expect(picture).toHaveAttribute('data-zoom-src', /article-images/)
		await expect(shortCard.locator('[data-picture-placeholder]')).toHaveCount(0)
		await expect(
			shortCard.getByText(
				'1 picture, shown in place. Tap it to see it larger.',
			),
		).toBeVisible()
		// the claim is marked in the prose and listed as plain text: no Change button
		await expect(shortCard.locator('mark[data-claim]').first()).toBeVisible()
		await expect(shortCard.getByText(`“${SHORT_CLAIM}”`)).toBeVisible()
		await expect(
			shortCard.getByRole('button', { name: /^Change: / }),
		).toHaveCount(0)
		await expect(shortCard.getByText('That is all of it.')).toBeAttached()
		await expectNoSidewaysScroll(page)

		// Read to the end: the beacon stamps readReachedEndAt.
		await shortCard.getByText('That is all of it.').scrollIntoViewIfNeeded()
		await expect
			.poll(
				async () =>
					(
						await prisma.article.findUniqueOrThrow({
							where: { id: short.id },
							select: { readReachedEndAt: true },
						})
					).readReachedEndAt,
				{ timeout: 10_000, message: 'read_to end beacon' },
			)
			.not.toBeNull()
		await page.screenshot({ path: shot('article'), fullPage: true })

		/* Approve: no sheet; the card collapses and the next one appends below (R2) */
		await page.getByRole('button', { name: 'Approve', exact: true }).click()
		await expect(
			shortCard.getByText('Approved.', { exact: true }),
		).toBeVisible()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}$`))
		await expect(
			shortCard.getByText(
				`“${short.title}” is on its way to ${PUBLICATION}. You will see Sent here, then Live when the publisher posts it, with the link.`,
			),
		).toBeVisible()
		await expect(shortCard.getByText(/^\d+ done today\.$/)).toBeVisible()
		const undo = shortCard.getByRole('button', { name: 'Undo' })
		await expect(undo).toBeVisible()
		// the next one, below, inside a "Next one" divider
		await expect(divider(page, second.title)).toBeVisible()
		await expect(cardTitle(page, second.id, second.title)).toBeAttached()
		const secondBox = await card(page, second.id).boundingBox()
		const shortBox = await shortCard.boundingBox()
		expect(secondBox!.y).toBeGreaterThan(shortBox!.y + shortBox!.height)
		await page.screenshot({ path: shot('approved'), fullPage: true })

		const approved = await prisma.article.findUniqueOrThrow({
			where: { id: short.id },
		})
		expect(approved.status).toBe('approved')
		expect(approved.reviewedAt).not.toBeNull()
		expect(approved.reviewedBy).toBe(user.name)
		expect(approved.approvedBodyHash).toBe(hashBody(SHORT_BODY))
		expect(approved.approvedBodyHash).toBe(hashBody(approved.body))
		expect(approved.publishedAt).toBeNull()
		// opened, then read_to, then approved. A late read_to flush may follow.
		const afterApprove = await eventKinds(short.id)
		expect(afterApprove.indexOf('opened')).toBeGreaterThanOrEqual(0)
		expect(afterApprove.indexOf('read_to')).toBeGreaterThan(
			afterApprove.indexOf('opened'),
		)
		expect(afterApprove.indexOf('approved')).toBeGreaterThan(
			afterApprove.indexOf('read_to'),
		)
		const approvedEvent = await prisma.articleReviewEvent.findFirst({
			where: { articleId: short.id, kind: 'approved' },
			select: { seconds: true, userId: true },
		})
		expect(approvedEvent?.userId).toBe(user.id)
		expect(approvedEvent?.seconds).not.toBeNull()

		/* Undo within 8 seconds: the card opens again */
		await undo.click()
		await expect(
			shortCard.getByText('Undone. It is back in your list.'),
		).toBeVisible()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}$`))
		await expect(shortCard.getByText('Every word')).toBeVisible()
		const undone = await prisma.article.findUniqueOrThrow({
			where: { id: short.id },
		})
		expect(undone.status).toBe('pending')
		expect(undone.reviewedAt).toBeNull()
		expect(undone.reviewedBy).toBeNull()
		expect(undone.approvedBodyHash).toBeNull()
		const afterUndo = await eventKinds(short.id)
		expect(afterUndo.indexOf('reopened')).toBeGreaterThan(
			afterUndo.indexOf('approved'),
		)
		await page.screenshot({ path: shot('undone'), fullPage: true })

		/* R1: "Change it" opens the editor page: the article is the screen, the dock at the bottom, no tabs */
		await shortCard.scrollIntoViewIfNeeded()
		await expect(
			page.locator('.fixed p', { hasText: short.title }),
		).toBeVisible()
		await page.getByRole('link', { name: 'Change it' }).click()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}/change$`))
		await expect(page.getByRole('tab')).toHaveCount(0)
		// the top bar: Back to the article, the editor's slot with the Markdown toggle, Approve (R2, R7)
		await expect(
			page.getByRole('link', { name: /Back to the article/ }).first(),
		).toBeVisible()
		await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'false')
		await expect(
			page.getByRole('button', { name: 'Approve', exact: true }),
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Save edits' })).toHaveCount(
			0,
		)
		await expect(
			page.getByRole('button', { name: 'Send this to the writer instead' }),
		).toHaveCount(0)
		// the dock: no status line before the first turn, the box's placeholder
		// invites her words, the save mark ends the row, the tab is closed (R1, R5)
		await expect(
			page.getByText('Ask a question or say what to change.'),
		).toHaveCount(0)
		await expect(statusLine(page)).toHaveCount(0)
		const composer = page.getByPlaceholder('Say or type what to change…')
		await expect(composer).toBeVisible()
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'idle')
		await expect(chatTab(page)).toHaveAttribute('aria-label', 'Open the chat')
		await expect(chatTab(page)).toHaveAttribute('aria-expanded', 'false')
		await expect(article(page)).toContainText(SHORT_CLAIM)
		await expect(richEditor(page)).toBeVisible()
		await expectNoSidewaysScroll(page)
		await page.screenshot({ path: shot('editor'), fullPage: true })

		/* Opening the editor never saves: the mark stays idle, no `saved` event, the stored text is untouched (D11) */
		await page.waitForTimeout(3000)
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'idle')
		expect(await eventsOfKind(short.id, 'saved')).toHaveLength(0)
		expect(
			(
				await prisma.article.findUniqueOrThrow({
					where: { id: short.id },
					select: { body: true },
				})
			).body,
		).toBe(SHORT_BODY)

		/* R2: a (mocked) chat turn from the dock changes the text in place */
		let chatRequest: unknown = null
		await page.route('**/resources/article-chat', async route => {
			chatRequest = route.request().postDataJSON()
			// The real resource saves the change before it answers. So does the mock,
			// so the hash it returns is the server's and the Undo below is a real save.
			await prisma.article.update({
				where: { id: short.id },
				data: { body: SHORT_BODY_CHANGED },
			})
			const createdAt = new Date().toISOString()
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					messages: [
						{
							id: `mock-user-${stamp}`,
							role: 'user',
							text: CHAT_WORDS,
							quote: null,
							imageId: null,
							imageUrl: null,
							toolName: null,
							createdAt,
						},
						{
							id: `mock-change-${stamp}`,
							role: 'change',
							text: CHANGE_SUMMARY,
							quote: null,
							imageId: null,
							imageUrl: null,
							toolName: 'replace_text',
							createdAt,
						},
					],
					body: SHORT_BODY_CHANGED,
					hash: hashBody(SHORT_BODY_CHANGED),
					changed: true,
				}),
			})
		})
		await composer.fill(CHAT_WORDS)
		await page.getByRole('button', { name: 'Send', exact: true }).click()
		// the answer shows on the status line above the composer; the sheet stays closed
		await expect(statusLine(page)).toContainText(`Changed: ${CHANGE_SUMMARY}`)
		await page.unroute('**/resources/article-chat')
		expect(chatRequest).toMatchObject({
			articleId: short.id,
			text: CHAT_WORDS,
			baseHash: hashBody(SHORT_BODY),
		})
		const seeIt = statusLine(page).getByRole('button', {
			name: 'See it',
			exact: true,
		})
		const undoChange = statusLine(page).getByRole('button', {
			name: 'Undo',
			exact: true,
		})
		await expect(seeIt).toBeVisible()
		await expect(undoChange).toBeVisible()
		// the article updated in place, with the green mark; the picture kept
		await expect(article(page)).toContainText('15 to 25 units on each side')
		await expect(article(page).locator('mark.review-changed')).toBeVisible()
		await expect(
			article(page).locator('img[alt="a test picture"]'),
		).toBeVisible()
		await page.screenshot({ path: shot('chat-changed'), fullPage: true })

		/* "See it": the sheet stays closed and the green mark scrolls into view */
		await seeIt.click()
		await expect(
			page.getByRole('dialog', { name: 'Chat', exact: true }),
		).toHaveCount(0)
		await expect(
			article(page).locator('mark.review-changed').first(),
		).toBeInViewport()
		await page.screenshot({ path: shot('see-it'), fullPage: true })

		/* The Markdown toggle shows the same working copy */
		await markdownToggle(page).click()
		await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'true')
		await expect(page.getByLabel('Article text')).toHaveValue(
			SHORT_BODY_CHANGED,
		)
		await markdownToggle(page).click()
		await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'false')
		await expect(richEditor(page)).toBeVisible()

		/* "Undo" on the status line puts the old text back, with a real save */
		await undoChange.click()
		await expect(statusLine(page)).toContainText('Undone.')
		await expect
			.poll(
				async () =>
					(
						await prisma.article.findUniqueOrThrow({
							where: { id: short.id },
							select: { body: true },
						})
					).body,
				{ message: 'Undo saved the previous text' },
			)
			.toBe(SHORT_BODY)
		expect(await eventsOfKind(short.id, 'saved')).toEqual([
			expect.objectContaining({ note: 'ai', userId: user.id }),
		])
		const undoneChange = await prisma.article.findUniqueOrThrow({
			where: { id: short.id },
		})
		expect(undoneChange.status).toBe('pending')
		expect(undoneChange.editedBy).toBe(user.name)

		/* R3: a selected passage in the editor becomes a quote through the format row */
		const shortParagraph = article(page)
			.locator('p[data-paragraph]', { hasText: '20 units on each side' })
			.first()
		await scrollToCentre(shortParagraph)
		// the tap gives the editor focus, so the format row shows in the dock
		await shortParagraph.click()
		await selectText(shortParagraph)
		const commentButton = page.getByRole('button', {
			name: 'Comment on this',
			exact: true,
		})
		await expect(commentButton).toBeEnabled()
		await page.screenshot({ path: shot('format-row') })
		await commentButton.click()
		const removeQuote = page.getByRole('button', { name: 'Remove the quote' })
		await expect(removeQuote).toBeVisible()
		await expect(
			page.locator('[data-chat-dock] blockquote', {
				hasText: '20 units on each side',
			}),
		).toBeVisible()
		await expect(
			page.getByPlaceholder('What should change here? Or ask about it.'),
		).toBeVisible()
		await page.screenshot({ path: shot('quote-attached'), fullPage: true })
		await removeQuote.click()
		await expect(removeQuote).toHaveCount(0)
		await expect(composer).toBeVisible()

		/* R4: an attached picture shows a thumbnail in the dock (the upload is mocked) */
		// The stored row exists, so the thumbnail and the article load real bytes.
		const userImageId = createId()
		const userFileName = `user-${userImageId}.png`
		const userImageUrl = `/resources/article-images/${userImageId}`
		await prisma.articleImage.create({
			data: {
				id: userImageId,
				articleId: short.id,
				fileName: userFileName,
				contentType: 'image/png',
				blob: ONE_PIXEL_PNG,
				width: 1,
				height: 1,
				position: 1,
			},
		})
		// Chromium does not hand a blob-backed multipart body to the route, so the
		// check is the method and the content type; the fields are the server's unit tests.
		let upload: { method: string; contentType: string } | null = null
		await page.route('**/resources/article-image-upload', async route => {
			const req = route.request()
			upload = {
				method: req.method(),
				contentType: req.headers()['content-type'] ?? '',
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					image: {
						id: userImageId,
						fileName: userFileName,
						width: 1,
						height: 1,
						url: userImageUrl,
					},
				}),
			})
		})
		const chooser = page.waitForEvent('filechooser')
		await page.getByRole('button', { name: 'Add a picture' }).click()
		await (
			await chooser
		).setFiles({
			name: 'test-picture.png',
			mimeType: 'image/png',
			buffer: ONE_PIXEL_PNG,
		})
		const thumb = page.locator('[data-chat-dock] [data-status="ready"]')
		await expect(thumb).toBeVisible()
		await expect(thumb.locator('img')).toBeVisible()
		await expect(
			thumb.getByText(
				'Say where it goes. For example: use this instead of the second picture.',
			),
		).toBeVisible()
		await page.unroute('**/resources/article-image-upload')
		expect(upload).toMatchObject({
			method: 'POST',
			contentType: expect.stringMatching(/^multipart\/form-data; boundary=/),
		})
		// the picture alone can be sent: the box is empty and Send is on
		await expect(composer).toHaveValue('')
		await expect(
			page.getByRole('button', { name: 'Send', exact: true }),
		).toBeEnabled()
		await expectNoSidewaysScroll(page)
		await page.screenshot({ path: shot('picture-attached'), fullPage: true })

		/* The picture goes out with her words; the (mocked) turn swaps the picture line */
		const SHORT_BODY_PICTURE = SHORT_BODY.replace(
			'images/image-1.png',
			`images/${userFileName}`,
		)
		const PICTURE_WORDS = 'Use this instead of the picture.'
		const PICTURE_SUMMARY = 'picture 1 is now the one you sent.'
		let pictureRequest: unknown = null
		await page.route('**/resources/article-chat', async route => {
			pictureRequest = route.request().postDataJSON()
			await prisma.article.update({
				where: { id: short.id },
				data: { body: SHORT_BODY_PICTURE },
			})
			const createdAt = new Date().toISOString()
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					messages: [
						{
							id: `mock-user-picture-${stamp}`,
							role: 'user',
							text: PICTURE_WORDS,
							quote: null,
							imageId: userImageId,
							imageUrl: userImageUrl,
							toolName: null,
							createdAt,
						},
						{
							id: `mock-change-picture-${stamp}`,
							role: 'change',
							text: PICTURE_SUMMARY,
							quote: null,
							imageId: userImageId,
							imageUrl: userImageUrl,
							toolName: 'replace_picture',
							createdAt,
						},
					],
					body: SHORT_BODY_PICTURE,
					hash: hashBody(SHORT_BODY_PICTURE),
					changed: true,
				}),
			})
		})
		await composer.fill(PICTURE_WORDS)
		await page.getByRole('button', { name: 'Send', exact: true }).click()
		await expect(statusLine(page)).toContainText(`Changed: ${PICTURE_SUMMARY}`)
		await page.unroute('**/resources/article-chat')
		expect(pictureRequest).toMatchObject({
			articleId: short.id,
			text: PICTURE_WORDS,
			imageId: userImageId,
			baseHash: hashBody(SHORT_BODY),
		})
		// the sheet holds the conversation: her bubbles, the picture in her bubble and in the change row
		await openChat(page)
		const chatList = page.locator('[data-chat-list]')
		await expect(chatList.getByText(CHAT_WORDS)).toBeVisible()
		await expect(chatList.getByText(PICTURE_WORDS)).toBeVisible()
		await expect(
			page
				.getByRole('button', { name: 'Show the picture larger' })
				.locator('img'),
		).toHaveAttribute('src', userImageUrl)
		await expect(chatList.locator(`img[src="${userImageUrl}"]`)).toHaveCount(2)
		// the change detached the picture from the composer
		await expect(
			page.getByRole('button', { name: 'Remove the picture' }),
		).toHaveCount(0)
		await page.screenshot({ path: shot('sheet'), fullPage: true })
		await closeChat(page)

		/* The picture she sent is in place in the article; the Markdown toggle holds the line */
		await expect(
			article(page).locator(`img[src="${userImageUrl}"][alt="a test picture"]`),
		).toBeVisible()
		await expect(
			article(page).locator('[data-picture-placeholder]'),
		).toHaveCount(0)
		await markdownToggle(page).click()
		await expect(page.getByLabel('Article text')).toHaveValue(
			SHORT_BODY_PICTURE,
		)
		await markdownToggle(page).click()
		await expect(richEditor(page)).toBeVisible()
		await page.screenshot({ path: shot('picture-in-place'), fullPage: true })

		/* Back to the feed */
		await page
			.getByRole('link', { name: /Back to the article/ })
			.first()
			.click()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}$`))
		await expect(cardTitle(page, short.id, short.title)).toBeVisible()
		await expect(
			shortCard.locator('section:has([data-every-word])'),
		).toContainText('20 units on each side')

		/* The sticky bar follows the article in view */
		await expect(cardTitle(page, second.id, second.title)).toBeAttached()
		await page.evaluate(id => {
			document.getElementById(`feed-${id}`)?.scrollIntoView({ block: 'start' })
		}, second.id)
		await expect(
			page.locator('.fixed p', { hasText: second.title }),
		).toBeVisible()
		await expect(page).toHaveURL(new RegExp(`/review/${second.id}$`))
		await page.screenshot({ path: shot('next-current') })

		/* R6: "Write a different article" on the second card, then "Keep this one" */
		const secondCard = card(page, second.id)
		await page.getByRole('button', { name: 'More' }).click()
		const moreSheet = page.getByRole('dialog', { name: 'More', exact: true })
		await expect(moreSheet).toBeVisible()
		// Later, Ask Zane and Write a different article; no "Do not publish this", no note to the writer (R7)
		await expect(
			moreSheet.getByRole('button', { name: 'Later', exact: true }),
		).toBeVisible()
		await expect(
			moreSheet.getByRole('button', { name: 'Ask Zane', exact: true }),
		).toBeVisible()
		await expect(
			moreSheet.getByRole('button', { name: 'Do not publish this' }),
		).toHaveCount(0)
		await expect(
			moreSheet.getByRole('button', { name: 'Send a note to the writer' }),
		).toHaveCount(0)
		await moreSheet
			.getByRole('button', { name: 'Write a different article', exact: true })
			.click()
		const rewriteSheet = page.getByRole('dialog', {
			name: 'Write a different article',
			exact: true,
		})
		await expect(rewriteSheet).toBeVisible()
		await expect(
			rewriteSheet.getByText(
				'The writer starts over with a new topic and never sees this text. The new article comes back here for you.',
			),
		).toBeVisible()
		// no note field: the writer never sees this text, or her words about it
		await expect(
			rewriteSheet.getByLabel('Anything to tell the writer? (optional)'),
		).toHaveCount(0)
		await expect(rewriteSheet.getByRole('textbox')).toHaveCount(0)
		await page.screenshot({ path: shot('rewrite-sheet') })
		await rewriteSheet
			.getByRole('button', { name: 'Write a different article', exact: true })
			.click()
		await expect(rewriteSheet).toBeHidden()
		await expect(
			secondCard.getByText(
				'A new article is on its way. It comes back to you here.',
			),
		).toBeVisible()
		const keepThisOne = secondCard.getByRole('button', {
			name: 'Keep this one',
		})
		await expect(keepThisOne).toBeVisible()
		await expect(
			secondCard.getByRole('button', { name: 'Undo', exact: true }),
		).toHaveCount(0)
		await page.screenshot({ path: shot('rewritten'), fullPage: true })

		const rewrite = await prisma.article.findUniqueOrThrow({
			where: { id: second.id },
		})
		expect(rewrite.status).toBe('changes_requested')
		expect(rewrite.rewriteRequested).toBe(true)
		// the ledger note is the fixed prefix and default: no words of hers go to the writer
		expect(rewrite.reviewNote).toBe('NEW ARTICLE: a different article')
		expect(rewrite.reviewedBy).toBe(user.name)
		expect(rewrite.reviewedAt).not.toBeNull()
		expect(rewrite.approvedBodyHash).toBeNull()
		expect(rewrite.body).toBe(SECOND_BODY)
		expect(await eventsOfKind(second.id, 'rewrite_requested')).toEqual([
			expect.objectContaining({ note: null, userId: user.id }),
		])

		/* The sync endpoint while she waits for a different one: the same text is `meta`, different text is `kept` */
		const token = process.env.ARTICLE_SYNC_TOKEN
		expect(token, 'ARTICLE_SYNC_TOKEN is read from .env').toBeTruthy()
		const push = (body: string) =>
			request.post('/resources/article-sync', {
				headers: { Authorization: `Bearer ${token}` },
				data: {
					articles: [
						{
							sourceKey: second.sourceKey,
							kind: 'guest',
							title: second.title,
							publication: PUBLICATION,
							publicationUrl: `https://${PUBLICATION}/`,
							byline: 'Sarah Hitchcox, RN',
							wordCount: countWords(body),
							links: LINKS,
							body,
						},
					],
				},
			})

		const same = await push(SECOND_BODY)
		expect(same.status()).toBe(200)
		expect((await same.json()).results).toEqual([
			expect.objectContaining({
				sourceKey: second.sourceKey,
				id: second.id,
				status: 'changes_requested',
				changed: 'meta',
			}),
		])

		const later = `${SECOND_BODY}\n\nA line the writer added later.`
		const different = await push(later)
		expect(different.status()).toBe(200)
		expect((await different.json()).results).toEqual([
			expect.objectContaining({
				sourceKey: second.sourceKey,
				id: second.id,
				status: 'changes_requested',
				changed: 'kept',
			}),
		])
		const kept = await prisma.article.findUniqueOrThrow({
			where: { id: second.id },
		})
		expect(kept.status).toBe('changes_requested')
		expect(kept.body).toBe(SECOND_BODY)
		expect(kept.reviewNote).toBe(rewrite.reviewNote)
		expect(kept.reviewedAt?.getTime()).toBe(rewrite.reviewedAt?.getTime())
		expect(kept.incomingBody).toBe(later)
		expect(kept.incomingBodyHash).toBe(hashBody(later))
		expect(kept.incomingAt).not.toBeNull()
		expect(
			await prisma.articleImage.count({ where: { articleId: second.id } }),
		).toBe(1)

		await keepThisOne.click()
		await expect(secondCard.getByText('Every word')).toBeVisible()
		const keptOne = await prisma.article.findUniqueOrThrow({
			where: { id: second.id },
		})
		expect(keptOne.status).toBe('pending')
		expect(keptOne.rewriteRequested).toBe(false)
		expect(keptOne.reviewNote).toBeNull()
		expect(keptOne.reviewedAt).toBeNull()
		const afterKeep = await eventKinds(second.id)
		expect(afterKeep.indexOf('reopened')).toBeGreaterThan(
			afterKeep.indexOf('rewrite_requested'),
		)

		/* S4 on the blog post: Approve early shows "Approve anyway" */
		await page.goto(`/review/${blog.id}`)
		await expect(cardTitle(page, blog.id, blog.title)).toBeVisible()
		await expect(card(page, blog.id).getByText('Your blog')).toBeVisible()
		await page
			.getByRole('button', { name: 'Approve and publish on my site' })
			.click()
		const endSheet = page.getByRole('dialog', {
			name: 'You have not reached the end yet. Read the rest?',
		})
		await expect(endSheet).toBeVisible()
		await expect(
			endSheet.getByRole('button', { name: 'Take me there' }),
		).toBeVisible()
		await expect(
			endSheet.getByRole('button', { name: 'Approve anyway' }),
		).toBeVisible()
		await page.screenshot({ path: shot('blog-sheet') })
		await page.keyboard.press('Escape')
		await expect(endSheet).toBeHidden()
		expect(
			(await prisma.article.findUniqueOrThrow({ where: { id: blog.id } }))
				.status,
		).toBe('pending')

		/* R6 on the editor: a typed edit in the article saves itself; so does one under Markdown; both survive a reload */
		await page.goto(`/review/${blog.id}/change`)
		await expect(page.getByRole('button', { name: 'Save edits' })).toHaveCount(
			0,
		)
		const prose = richEditor(page)
		await expect(prose).toBeVisible()
		const lastParagraph = prose.locator('p').last()
		await scrollToCentre(lastParagraph)
		await lastParagraph.click()
		await caretToEnd(lastParagraph)
		await page.keyboard.type(' Sarah added this line.')
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saved', {
			timeout: 10_000,
		})
		await page.screenshot({ path: shot('autosave'), fullPage: true })
		const typedSave = await prisma.article.findUniqueOrThrow({
			where: { id: blog.id },
		})
		expect(typedSave.body).toBe(BLOG_BODY_TYPED)
		expect(typedSave.status).toBe('pending')
		expect(typedSave.editedBy).toBe(user.name)
		expect(await eventsOfKind(blog.id, 'saved')).toEqual([
			expect.objectContaining({ note: 'auto', userId: user.id }),
		])

		await markdownToggle(page).click()
		const editor = page.getByLabel('Article text')
		await expect(editor).toHaveValue(BLOG_BODY_TYPED)
		await editor.fill(BLOG_BODY_EDITED)
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saving')
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saved', {
			timeout: 10_000,
		})
		const autoSaved = await prisma.article.findUniqueOrThrow({
			where: { id: blog.id },
		})
		expect(autoSaved.body).toBe(BLOG_BODY_EDITED)
		expect(autoSaved.status).toBe('pending')
		expect(autoSaved.editedBy).toBe(user.name)
		expect(await eventsOfKind(blog.id, 'saved')).toEqual([
			expect.objectContaining({ note: 'auto', userId: user.id }),
			expect.objectContaining({ note: 'auto', userId: user.id }),
		])

		await page.reload()
		// the toggle is not in the address, so a reload opens the rich view
		await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'false')
		// the save landed, so nothing is offered back from the browser mirror
		await expect(
			page.getByRole('button', { name: 'Restore your unsaved edit' }),
		).toHaveCount(0)
		await expect(article(page)).toContainText('Sarah added this line.')

		/* The dock stays inside the screen with the box focused (the phone walk, section H, checks the real keyboard) */
		await composer.focus()
		const dockBox = await page.locator('[data-chat-dock]').boundingBox()
		const viewport = page.viewportSize()
		expect(dockBox, 'the dock is on the page').not.toBeNull()
		expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(viewport!.height)

		/* S4 on the guest post: no "Approve anyway" */
		await page.goto(`/review/${held.id}`)
		await expect(cardTitle(page, held.id, held.title)).toBeVisible()
		await expect(
			card(page, held.id).getByText(`Goes on ${PUBLICATION}`),
		).toBeVisible()
		await page.getByRole('button', { name: 'Approve', exact: true }).click()
		await expect(endSheet).toBeVisible()
		await expect(
			endSheet.getByRole('button', { name: 'Take me there' }),
		).toBeVisible()
		await expect(
			endSheet.getByRole('button', { name: 'Approve anyway' }),
		).toHaveCount(0)
		await page.screenshot({ path: shot('guest-sheet') })
		await page.keyboard.press('Escape')
		await expect(endSheet).toBeHidden()

		/* R3 on the reading page: a selected passage opens the editor with the quote in the dock */
		const heldParagraph = card(page, held.id)
			.locator('p[data-paragraph]', { hasText: 'writes every plan by hand' })
			.first()
		await selectText(heldParagraph)
		const readingPill = commentPill(page)
		await expect(readingPill).toBeVisible()
		// the pill sits above the sticky bar, not under it
		const pillBox = await readingPill.boundingBox()
		const barBox = await page.locator('[data-review-bar]').boundingBox()
		expect(pillBox!.y + pillBox!.height).toBeLessThanOrEqual(barBox!.y + 1)
		await page.screenshot({ path: shot('reading-pill') })
		await readingPill.click()
		// the hand-off carried the quote in the address, then the editor dropped it
		await expect
			.poll(() =>
				visited.some(url =>
					new RegExp(`/review/${held.id}/change\\?quote=`).test(url),
				),
			)
			.toBe(true)
		await expect(page).toHaveURL(new RegExp(`/review/${held.id}/change$`))
		await expect(
			page.locator('[data-chat-dock] blockquote', {
				hasText: HELD_FIRST_PARAGRAPH,
			}),
		).toBeVisible()
		await expect(
			page
				.locator('[data-chat-dock]')
				.getByRole('button', { name: 'Remove the quote' }),
		).toBeVisible()
		await page.screenshot({ path: shot('reading-quote'), fullPage: true })
		await page
			.getByRole('link', { name: /Back to the article/ })
			.first()
			.click()
		await expect(page).toHaveURL(new RegExp(`/review/${held.id}$`))
		await expect(cardTitle(page, held.id, held.title)).toBeVisible()

		/* Change it opens the editor with no edit; Back keeps the stored text: no save, byte for byte (D11) */
		await page.getByRole('link', { name: 'Change it' }).click()
		await expect(page).toHaveURL(new RegExp(`/review/${held.id}/change$`))
		await expect(page.getByRole('tab')).toHaveCount(0)
		await expect(
			page.getByRole('button', { name: 'Make these changes' }),
		).toHaveCount(0)
		await expect(
			page.getByRole('link', { name: /Back to the article/ }).first(),
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Save edits' })).toHaveCount(
			0,
		)
		// the writer link and its sheet are gone: the chat took their place (R7)
		await expect(
			page.getByRole('button', { name: 'Send this to the writer instead' }),
		).toHaveCount(0)
		await expect(
			page.getByRole('dialog', { name: 'Send this to the writer' }),
		).toHaveCount(0)
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'idle')
		await expectNoSidewaysScroll(page)
		await page.screenshot({ path: shot('change'), fullPage: true })
		await page
			.getByRole('link', { name: /Back to the article/ })
			.first()
			.click()
		await expect(page).toHaveURL(new RegExp(`/review/${held.id}$`))
		await expect(cardTitle(page, held.id, held.title)).toBeVisible()
		await expect(card(page, held.id).getByText('Every word')).toBeVisible()

		// two editor visits with no edit left the stored text byte for byte, still hers to decide
		const untouched = await prisma.article.findUniqueOrThrow({
			where: { id: held.id },
		})
		expect(untouched.status).toBe('pending')
		expect(untouched.body).toBe(HELD_BODY)
		expect(untouched.editedAt).toBeNull()
		expect(untouched.editedBy).toBeNull()
		expect(untouched.reviewNote).toBeNull()
		expect(await eventsOfKind(held.id, 'saved')).toHaveLength(0)
		expect(await eventKinds(held.id)).toContain('opened')
	} finally {
		await Promise.all(
			others.map(o =>
				prisma.article
					.update({
						where: { id: o.id },
						data: { skippedUntil: o.skippedUntil },
					})
					.catch(() => {}),
			),
		)
		// Chat rows, events and pictures cascade from the article.
		await prisma.article
			.deleteMany({ where: { id: { in: mine } } })
			.catch(() => {})
		await prisma.reviewSetting
			.deleteMany({ where: { userId: user.id } })
			.catch(() => {})
	}
})
