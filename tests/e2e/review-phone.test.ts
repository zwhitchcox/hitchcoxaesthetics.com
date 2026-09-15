import { createHash } from 'node:crypto'
import { type Page } from '@playwright/test'
import { countWords } from '#app/utils/articles.ts'
import { prisma } from '#app/utils/db.server.ts'
import { estimateReadSeconds } from '#app/utils/review-aid.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Sarah's phone review (/review) end to end, at phone width (spec section 9).
 *
 * Three articles: a short guest post (fits the 2 min lane), a blog post and a
 * guest post a publisher is holding a spot for (both too long for 2 min).
 * The walk: pick 2 min, the short one is served, read to the end, Approve,
 * the Approved screen and its record, Undo; the blog post gets "Approve
 * anyway" on the read-to-the-end sheet, the guest post does not; Change it,
 * then "Send this to the writer instead"; then the sync endpoint answers
 * `meta` for the same text and `kept` for different text.
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

/** About 100 words: fits the 2 min lane. Has a claim, the byline, and the link. */
const SHORT_BODY = [
	'# Botox for a tight jaw',
	'',
	'A tight jaw from clenching often responds to 20 units on each side, spread over three points in the masseter.',
	'',
	'Sarah Hitchcox, RN, treats this at [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com) in Knoxville.',
	'',
	paragraphs(1),
].join('\n')

/** About 700 words: out of the 2 min lane, in the 5 min lane. */
const BLOG_BODY = [
	'# What to ask before your first visit',
	'',
	'You can book with [Sarah Hitchcox Aesthetics](https://hitchcoxaesthetics.com) online.',
	'',
	paragraphs(12, 1),
].join('\n')

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

const shot = (name: string) => `test-results/review-phone-${name}.png`

/** The title in the page header. The prose renders the markdown `# title` as a second h1. */
function pageTitle(page: Page, title: string) {
	return page.locator('header').getByRole('heading', { name: title, level: 1 })
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

test('Sarah reviews on her phone: lane, approve, undo, the end gate, send to the writer, sync', async ({
	page,
	login,
	request,
}) => {
	test.setTimeout(120_000)

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
	const mine = [short.id, blog.id, held.id]

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

		/* S3: the article */
		await page.getByRole('link', { name: 'Start' }).click()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}$`))
		await expect(pageTitle(page, short.title)).toBeVisible()
		await expect(page.getByText('By Sarah Hitchcox, RN')).toBeVisible()
		await expect(page.getByText('Things to check first')).toBeVisible()
		await expect(page.getByText('Every word')).toBeVisible()
		await expect(page.getByRole('img', { name: 'a test picture' })).toBeVisible()
		await expect(page.getByText('That is all of it.')).toBeAttached()
		await expectNoSidewaysScroll(page)

		// Read to the end: the beacon stamps readReachedEndAt.
		await page.getByText('That is all of it.').scrollIntoViewIfNeeded()
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

		/* Approve: no sheet, straight to S7 */
		await page.getByRole('button', { name: 'Approve', exact: true }).click()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}\\?done=approved$`))
		await expect(page.getByText('Approved.', { exact: true })).toBeVisible()
		await expect(
			page.getByText(
				`“${short.title}” is on its way to ${PUBLICATION}. You will see Sent here, then Live when the publisher posts it, with the link.`,
			),
		).toBeVisible()
		await expect(page.getByText(/^\d+ done today\.$/)).toBeVisible()
		const undo = page.getByRole('button', { name: 'Undo' })
		await expect(undo).toBeVisible()
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

		/* Undo within 8 seconds */
		await undo.click()
		await expect(page).toHaveURL(new RegExp(`/review/${short.id}$`))
		await expect(page.getByText('Undone. It is back in your list.')).toBeVisible()
		const undone = await prisma.article.findUniqueOrThrow({
			where: { id: short.id },
		})
		expect(undone.status).toBe('pending')
		expect(undone.reviewedAt).toBeNull()
		expect(undone.reviewedBy).toBeNull()
		expect(undone.approvedBodyHash).toBeNull()
		// reopened comes after approved; the reader mounts again and posts a new opened
		const afterUndo = await eventKinds(short.id)
		expect(afterUndo.indexOf('reopened')).toBeGreaterThan(
			afterUndo.indexOf('approved'),
		)
		await page.screenshot({ path: shot('undone'), fullPage: true })

		/* S4 on the blog post: Approve early shows "Approve anyway" */
		await page.goto(`/review/${blog.id}`)
		await expect(pageTitle(page, blog.title)).toBeVisible()
		await expect(page.getByText('Your blog')).toBeVisible()
		await page
			.getByRole('button', { name: 'Approve and publish on my site' })
			.click()
		const endSheet = page.getByRole('dialog', {
			name: 'You have not reached the end yet. Read the rest?',
		})
		await expect(endSheet).toBeVisible()
		await expect(endSheet.getByRole('button', { name: 'Take me there' })).toBeVisible()
		await expect(endSheet.getByRole('button', { name: 'Approve anyway' })).toBeVisible()
		await page.screenshot({ path: shot('blog-sheet') })
		await page.keyboard.press('Escape')
		await expect(endSheet).toBeHidden()
		expect(
			(await prisma.article.findUniqueOrThrow({ where: { id: blog.id } })).status,
		).toBe('pending')

		/* S4 on the guest post: no "Approve anyway" */
		await page.goto(`/review/${held.id}`)
		await expect(pageTitle(page, held.title)).toBeVisible()
		await expect(page.getByText(`Goes on ${PUBLICATION}`)).toBeVisible()
		await page.getByRole('button', { name: 'Approve', exact: true }).click()
		await expect(endSheet).toBeVisible()
		await expect(endSheet.getByRole('button', { name: 'Take me there' })).toBeVisible()
		await expect(endSheet.getByRole('button', { name: 'Approve anyway' })).toHaveCount(0)
		await page.screenshot({ path: shot('guest-sheet') })
		await page.keyboard.press('Escape')
		await expect(endSheet).toBeHidden()

		/* S5: Change it, then "Send this to the writer instead" */
		await page.getByRole('link', { name: 'Change it' }).click()
		await expect(page).toHaveURL(new RegExp(`/review/${held.id}/change$`))
		await expect(page.getByRole('tab', { name: 'Tell it what to change' })).toBeVisible()
		await expect(page.getByRole('tab', { name: 'Edit the text myself' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Make these changes' })).toBeDisabled()
		await expect(page.getByRole('button', { name: 'Save edits' })).toBeVisible()
		await expectNoSidewaysScroll(page)
		await page.screenshot({ path: shot('change'), fullPage: true })
		await page.getByRole('button', { name: 'Send this to the writer instead' }).click()
		const writerSheet = page.getByRole('dialog', { name: 'Send this to the writer' })
		await expect(writerSheet).toBeVisible()
		await writerSheet.getByText('Wrong fact', { exact: true }).click()
		await expect(writerSheet.getByLabel('Wrong fact')).toBeChecked()
		await writerSheet.getByLabel('What to change').fill('Say 2 to 4 units, not 5.')
		await page.screenshot({ path: shot('writer-sheet') })
		await writerSheet.getByRole('button', { name: 'Send to the writer' }).click()
		await expect(page).toHaveURL(/\/review(\?plenty=1)?$/)
		await expect(
			page.getByText('Sent to the writer. It comes back to you as "Your change is in".'),
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
		const kept = await prisma.article.findUniqueOrThrow({ where: { id: held.id } })
		expect(kept.status).toBe('changes_requested')
		expect(kept.body).toBe(HELD_BODY)
		expect(kept.reviewNote).toBe(requested.reviewNote)
		expect(kept.reviewedAt?.getTime()).toBe(requested.reviewedAt?.getTime())
		expect(kept.incomingBody).toBe(trimmed)
		expect(kept.incomingBodyHash).toBe(hashBody(trimmed))
		expect(kept.incomingAt).not.toBeNull()
		expect(await prisma.articleImage.count({ where: { articleId: held.id } })).toBe(1)
	} finally {
		await Promise.all(
			others.map(o =>
				prisma.article
					.update({ where: { id: o.id }, data: { skippedUntil: o.skippedUntil } })
					.catch(() => {}),
			),
		)
		await prisma.article.deleteMany({ where: { id: { in: mine } } }).catch(() => {})
		await prisma.reviewSetting
			.deleteMany({ where: { userId: user.id } })
			.catch(() => {})
	}
})
