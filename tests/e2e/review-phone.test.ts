import { createHash } from 'node:crypto'
import { type Page } from '@playwright/test'
import { countWords } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { estimateReadSeconds } from '#app/utils/review-aid.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Sarah's phone review (/review) end to end, at phone width (spec section 9,
 * phase 2 plan section 5).
 *
 * Four articles: two short guest posts (both fit the 2 min lane, so the feed
 * has a next card), a blog post and a guest post a publisher is holding a
 * spot for (both too long for 2 min). The walk: pick 2 min, the shortest is
 * served with its picture in the prose, read to the end, Approve, the
 * approved card and its record, the next one below it, Undo; tap a claim
 * row, the fix sheet opens with that sentence, a (mocked) AI change lands
 * and saves itself, "Undo that" puts the text back; "Write a different
 * article" on the next card, then "Keep this one"; the blog post gets
 * "Approve anyway" on the read-to-the-end sheet and a typed edit on its
 * change page saves itself and survives a reload; the guest post gets no
 * "Approve anyway"; Change it, then "Send this to the writer instead"; then
 * the sync endpoint answers `meta` for the same text and `kept` for
 * different text.
 *
 * The AI change is mocked at /resources/article-edit (no OpenRouter call).
 * The save that follows it is real.
 *
 * The dev server and this test share prisma/data.db. Other pending articles
 * would take the 2 min card, so the test holds them out with the app's own
 * `skippedUntil` (10 minutes, restored at the end).
 *
 * `hashBody` is not imported from app/utils/articles.server.ts on purpose:
 * that module declares a class with TypeScript parameter properties, which
 * Node's strip-only type loader (the one Playwright's workers use here)
 * refuses. The oracle below is the spec's definition of the approval record.
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

/** What the mocked AI change returns: the dose becomes a range, nothing else moves. */
const SHORT_BODY_CHANGED = SHORT_BODY.replace(
	'20 units on each side',
	'15 to 25 units on each side',
)
const CHANGE_SUMMARY = 'Changed the dose to a range.'

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

/** Her typed edit on the blog post's change page. */
const BLOG_BODY_EDITED = `${BLOG_BODY}\n\nSarah added this line.`

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

const shot = (name: string) => `test-results/phase2-${name}.png`

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

async function events(articleId: string, kind: string) {
	return prisma.articleReviewEvent.findMany({
		where: { articleId, kind },
		orderBy: { at: 'asc' },
		select: { note: true, userId: true, seconds: true },
	})
}

test('Sarah reviews on her phone: lane, approve, undo, tap to fix, a different article, auto-save, the end gate, send to the writer, sync', async ({
	page,
	login,
	request,
}) => {
	test.setTimeout(180_000)

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

		/* S3: the article, with its picture in the prose (R1) */
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

		/* R3: a tap on a claim row opens the fix sheet with that sentence */
		const claimRow = shortCard.getByRole('button', {
			name: `Change: ${SHORT_CLAIM}`,
		})
		await claimRow.scrollIntoViewIfNeeded()
		await expect(claimRow).toBeVisible()
		// the same sentence is highlighted in the prose
		await expect(shortCard.locator('mark[data-claim]').first()).toBeVisible()
		await claimRow.click()
		// the copy uses a curly apostrophe: What’s wrong with this?
		const fixSheet = page.getByRole('dialog', {
			name: /^What.s wrong with this\?$/,
		})
		await expect(fixSheet).toBeVisible()
		await expect(fixSheet.locator('blockquote')).toContainText(SHORT_CLAIM)
		await expect(
			fixSheet.getByRole('button', { name: 'Show me where it is' }),
		).toBeVisible()
		const makeChange = fixSheet.getByRole('button', {
			name: 'Make this change',
		})
		await expect(makeChange).toBeDisabled()
		await expect(
			fixSheet.getByRole('button', { name: 'Wrong fact' }),
		).toBeVisible()
		await expectNoSidewaysScroll(page)
		await page.screenshot({ path: shot('fix-sheet') })

		/* R4 + R5: a (mocked) AI change lands in the prose and saves itself */
		let editRequest: unknown = null
		await page.route('**/resources/article-edit', async route => {
			editRequest = route.request().postDataJSON()
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					markdown: SHORT_BODY_CHANGED,
					summary: CHANGE_SUMMARY,
				}),
			})
		})
		await fixSheet
			.getByLabel('What should change here')
			.fill('Say 15 to 25 units, it depends on the person.')
		await expect(makeChange).toBeEnabled()
		await makeChange.click()
		await expect(fixSheet).toBeHidden()
		await page.unroute('**/resources/article-edit')
		expect(editRequest).toMatchObject({
			articleId: short.id,
			prompt: 'Say 15 to 25 units, it depends on the person.',
			markdown: SHORT_BODY,
			selection: { text: SHORT_CLAIM },
		})
		await expect(
			shortCard.getByText(`Changed: ${CHANGE_SUMMARY}`),
		).toBeVisible()
		await expect(shortCard.getByText('Saved', { exact: true })).toBeVisible()
		await expect(shortCard.locator('mark.review-changed')).toBeVisible()
		await expect(
			shortCard.locator('section:has([data-every-word])'),
		).toContainText('15 to 25 units on each side')
		// the picture line was kept, so the picture is still in the prose
		await expect(picture).toBeVisible()
		await page.screenshot({ path: shot('changed'), fullPage: true })

		const changed = await prisma.article.findUniqueOrThrow({
			where: { id: short.id },
		})
		expect(changed.status).toBe('pending')
		expect(changed.body).toBe(SHORT_BODY_CHANGED)
		expect(changed.editedBy).toBe(user.name)
		expect(changed.editedAt).not.toBeNull()
		const aiSaves = await events(short.id, 'saved')
		expect(aiSaves).toEqual([
			expect.objectContaining({ note: 'ai', userId: user.id }),
		])

		/* "Undo that" puts the text back, and that saves too */
		await shortCard.getByRole('button', { name: 'Undo that' }).click()
		await expect(shortCard.getByText(`Changed: ${CHANGE_SUMMARY}`)).toHaveCount(
			0,
		)
		await expect(
			shortCard.locator('section:has([data-every-word])'),
		).toContainText('20 units on each side')
		await expect
			.poll(
				async () =>
					(
						await prisma.article.findUniqueOrThrow({
							where: { id: short.id },
							select: { body: true },
						})
					).body,
				{ message: 'Undo that saved the previous text' },
			)
			.toBe(SHORT_BODY)
		expect((await events(short.id, 'saved')).length).toBe(2)

		/* The sticky bar follows the article in view */
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
		const moreSheet = page.getByRole('dialog', { name: 'More' })
		await expect(moreSheet).toBeVisible()
		await moreSheet
			.getByRole('button', { name: 'Write a different article' })
			.click()
		const rewriteSheet = page.getByRole('dialog', {
			name: 'Write a different article',
		})
		await expect(rewriteSheet).toBeVisible()
		await expect(
			rewriteSheet.getByText(
				`The writer starts over with a new topic for ${PUBLICATION}. This one leaves your list until the new one is ready. That usually takes a day or two.`,
			),
		).toBeVisible()
		await rewriteSheet
			.getByLabel('Anything to tell the writer? (optional)')
			.fill('Not fillers again.')
		await page.screenshot({ path: shot('rewrite-sheet') })
		await rewriteSheet
			.getByRole('button', { name: 'Write a different one' })
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
		expect(rewrite.reviewNote).toBe('NEW ARTICLE: Not fillers again.')
		expect(rewrite.reviewedBy).toBe(user.name)
		expect(rewrite.reviewedAt).not.toBeNull()
		expect(rewrite.approvedBodyHash).toBeNull()
		expect(rewrite.body).toBe(SECOND_BODY)
		expect(await events(second.id, 'rewrite_requested')).toEqual([
			expect.objectContaining({ note: 'Not fillers again.', userId: user.id }),
		])

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

		/* R5 on the change page: a typed edit saves itself and survives a reload */
		await page.goto(`/review/${blog.id}/change`)
		await expect(
			page.getByRole('tab', { name: 'Tell it what to change' }),
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Save edits' })).toHaveCount(
			0,
		)
		await page.getByRole('tab', { name: 'Edit the text myself' }).click()
		const editor = page.getByLabel('Article text')
		await expect(editor).toHaveValue(BLOG_BODY)
		await editor.fill(BLOG_BODY_EDITED)
		await expect(page.getByText('Saved', { exact: true })).toBeVisible({
			timeout: 10_000,
		})
		await page.screenshot({ path: shot('autosave'), fullPage: true })
		const autoSaved = await prisma.article.findUniqueOrThrow({
			where: { id: blog.id },
		})
		expect(autoSaved.body).toBe(BLOG_BODY_EDITED)
		expect(autoSaved.status).toBe('pending')
		expect(autoSaved.editedBy).toBe(user.name)
		expect(await events(blog.id, 'saved')).toEqual([
			expect.objectContaining({ note: 'auto', userId: user.id }),
		])

		await page.reload()
		await expect(
			page.getByRole('tab', { name: 'Edit the text myself' }),
		).toBeVisible()
		// the save landed, so nothing is offered back from the browser mirror
		await expect(
			page.getByRole('button', { name: 'Restore your unsaved edit' }),
		).toHaveCount(0)
		await page.getByRole('tab', { name: 'Edit the text myself' }).click()
		await expect(page.getByLabel('Article text')).toHaveValue(BLOG_BODY_EDITED)

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

		/* S5: Change it, then "Send this to the writer instead" */
		await page.getByRole('link', { name: 'Change it' }).click()
		await expect(page).toHaveURL(new RegExp(`/review/${held.id}/change$`))
		await expect(
			page.getByRole('tab', { name: 'Tell it what to change' }),
		).toBeVisible()
		await expect(
			page.getByRole('tab', { name: 'Edit the text myself' }),
		).toBeVisible()
		await expect(
			page.getByRole('button', { name: 'Make these changes' }),
		).toBeDisabled()
		await expect(
			page.getByRole('link', { name: 'Back to the article' }).first(),
		).toBeVisible()
		await expect(page.getByRole('button', { name: 'Save edits' })).toHaveCount(
			0,
		)
		await expectNoSidewaysScroll(page)
		await page.screenshot({ path: shot('change'), fullPage: true })
		await page
			.getByRole('button', { name: 'Send this to the writer instead' })
			.click()
		const writerSheet = page.getByRole('dialog', {
			name: 'Send this to the writer',
		})
		await expect(writerSheet).toBeVisible()
		await writerSheet.getByText('Wrong fact', { exact: true }).click()
		await expect(writerSheet.getByLabel('Wrong fact')).toBeChecked()
		await writerSheet
			.getByLabel('What to change')
			.fill('Say 2 to 4 units, not 5.')
		await page.screenshot({ path: shot('writer-sheet') })
		await writerSheet
			.getByRole('button', { name: 'Send to the writer' })
			.click()
		await expect(page).toHaveURL(/\/review(\?plenty=1)?$/)
		await expect(
			page.getByText(
				'Sent to the writer. It comes back to you as "Your change is in".',
			),
		).toBeVisible()
		// the toast slides in; let it settle before the capture
		await page.screenshot({
			path: shot('sent'),
			fullPage: true,
			animations: 'disabled',
		})

		const requested = await prisma.article.findUniqueOrThrow({
			where: { id: held.id },
		})
		expect(requested.status).toBe('changes_requested')
		expect(requested.rewriteRequested).toBe(false)
		expect(requested.reviewNote).toBe('Wrong fact: Say 2 to 4 units, not 5.')
		expect(requested.reviewedBy).toBe(user.name)
		expect(requested.body).toBe(HELD_BODY)
		const afterRequest = await eventKinds(held.id)
		expect(afterRequest.indexOf('changes_requested')).toBeGreaterThan(
			afterRequest.indexOf('opened'),
		)

		/* The sync endpoint: the same text is `meta`, different text is `kept` */
		const token = process.env.ARTICLE_SYNC_TOKEN
		expect(token, 'ARTICLE_SYNC_TOKEN is read from .env').toBeTruthy()
		const push = (body: string) =>
			request.post('/resources/article-sync', {
				headers: { Authorization: `Bearer ${token}` },
				data: {
					articles: [
						{
							sourceKey: held.sourceKey,
							kind: 'guest',
							title: held.title,
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

		const same = await push(HELD_BODY)
		expect(same.status()).toBe(200)
		expect((await same.json()).results).toEqual([
			expect.objectContaining({
				sourceKey: held.sourceKey,
				id: held.id,
				status: 'changes_requested',
				changed: 'meta',
			}),
		])

		const trimmed = `${HELD_BODY}\n\nA line the writer added after her note.`
		const different = await push(trimmed)
		expect(different.status()).toBe(200)
		expect((await different.json()).results).toEqual([
			expect.objectContaining({
				sourceKey: held.sourceKey,
				id: held.id,
				status: 'changes_requested',
				changed: 'kept',
			}),
		])
		const kept = await prisma.article.findUniqueOrThrow({
			where: { id: held.id },
		})
		expect(kept.status).toBe('changes_requested')
		expect(kept.body).toBe(HELD_BODY)
		expect(kept.reviewNote).toBe(requested.reviewNote)
		expect(kept.reviewedAt?.getTime()).toBe(requested.reviewedAt?.getTime())
		expect(kept.incomingBody).toBe(trimmed)
		expect(kept.incomingBodyHash).toBe(hashBody(trimmed))
		expect(kept.incomingAt).not.toBeNull()
		expect(
			await prisma.articleImage.count({ where: { articleId: held.id } }),
		).toBe(1)
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
		await prisma.article
			.deleteMany({ where: { id: { in: mine } } })
			.catch(() => {})
		await prisma.reviewSetting
			.deleteMany({ where: { userId: user.id } })
			.catch(() => {})
	}
})
