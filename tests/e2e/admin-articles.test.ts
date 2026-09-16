import { type Locator, type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

const ONE_PIXEL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64',
)

const BODY = [
	'# A test article for the review page',
	'',
	'First paragraph with a [link to the practice](https://hitchcoxaesthetics.com).',
	'',
	'## A heading',
	'',
	'Second paragraph.',
].join('\n')

/*
 * Desktop width (phase 4 plan, section G.9; phase 4.1 facts R1-R7). The
 * article fills the page in the rich editor, centred at 70ch, with no bar
 * of its own. One bar at the bottom holds Approve, "Write a different
 * article" and the editor's slot: the save mark (a spinner while a save
 * waits or runs, a check after it; `data-save-state` carries the state) and
 * the Markdown toggle. No Deny, no "Send to the writer", no note for the
 * writer. The chat is a launcher in the bottom right corner; it opens as a
 * popup above the bar. A typed edit in the article saves itself and shows
 * in the Markdown toggle; an edit under the toggle lands in the article. A
 * double-click on a word shows the formatting bubble; Bold from it saves
 * `**Second**`. "Comment on this" from the bubble opens the popup with the
 * quote. "Write a different article" opens a confirm sheet with no note
 * field. Approve posts the hidden body from the bar.
 *
 * The caret goes to the end of a paragraph through a DOM selection, not the
 * End key: on macOS Playwright maps End to `scrollToEndOfDocument:`, which
 * scrolls and does not move the caret in a contenteditable.
 */
test.use({ viewport: { width: 1280, height: 800 } })

/** The rich editor's root: a contenteditable named "Article". */
function richEditor(page: Page) {
	return page.getByRole('textbox', { name: 'Article', exact: true })
}

/** The editor's slot in the route's bar: the save mark and the Markdown toggle render into it. */
function barSlot(page: Page) {
	return page.locator('[data-editor-bar-slot]')
}

/** The "Markdown" toggle in the bar slot; `aria-pressed` carries its state. */
function markdownToggle(page: Page) {
	return barSlot(page).getByRole('button', { name: 'Markdown', exact: true })
}

/** The save mark in the bar slot; `data-save-state` is idle, saving, saved, error or conflict. */
function saveMark(page: Page) {
	return barSlot(page).locator('[data-save-state]')
}

/** The decision bar at the bottom: Approve, "Write a different article" and the editor's slot. */
function decisionBar(page: Page) {
	return page.locator('.sticky.bottom-0', {
		has: page.locator('[data-editor-bar-slot]'),
	})
}

/** The chat popup, open. */
function chatPopup(page: Page) {
	return page.getByRole('dialog', { name: 'Chat', exact: true })
}

/** Select the whole text of one block, as a mouse drag would. */
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

/** Put the caret after the last character of one block, as a click after its last word would. */
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

test('an admin can read, edit and approve an article', async ({
	page,
	login,
}) => {
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
	const article = await prisma.article.create({
		data: {
			kind: 'guest',
			sourceKey: `test:${Date.now()}`,
			publication: 'example-magazine.com',
			publicationUrl: 'https://example-magazine.com/',
			title: 'A test article for the review page',
			dek: 'One line under the title.',
			byline: 'Sarah Hitchcox, RN',
			body: BODY,
			bodyOriginal: BODY,
			bodyHash: 'test',
			writer: 'fable-5.1',
			wordCount: 20,
			linksJson: JSON.stringify([
				{
					name: 'Sarah Hitchcox Aesthetics',
					url: 'https://hitchcoxaesthetics.com',
				},
			]),
			images: {
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
			},
		},
	})

	try {
		await page.goto('/admin/articles')
		await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible()
		await expect(page.getByText('Ready for your review')).toBeVisible()
		await page.screenshot({
			path:
				process.env.ARTICLE_LIST_SHOT ?? 'test-results/admin-articles-list.png',
			fullPage: true,
		})
		await page.getByRole('link', { name: article.title }).first().click()

		await expect(
			page.getByRole('heading', { name: article.title, level: 2 }),
		).toBeVisible()
		// this body has no picture line, so the picture shows under the note
		await expect(
			page.getByText(
				'1 picture. The writer has not placed it in the text yet, so it shows here.',
			),
		).toBeVisible()
		await expect(
			page.getByRole('img', { name: 'a test picture' }),
		).toBeVisible()
		await page.screenshot({
			path: process.env.ARTICLE_SHOT ?? 'test-results/admin-article-review.png',
			fullPage: true,
		})

		// The editor: the article is the screen, no tab strip, no Save button.
		// The chat is a launcher in the corner that opens a popup on its empty state.
		await expect(page.getByRole('tab')).toHaveCount(0)
		await expect(page.getByText('Tell it what to change')).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Save edits' })).toHaveCount(
			0,
		)
		// One bar at the bottom: Approve, "Write a different article" and the editor's
		// slot with the save mark (idle: nothing changed yet) and the Markdown toggle.
		// The editor renders no bar of its own (R1-R3).
		const bar = decisionBar(page)
		await expect(bar).toBeVisible()
		await expect(
			bar.getByRole('button', { name: 'Approve', exact: true }),
		).toBeVisible()
		await expect(
			bar.getByRole('button', {
				name: 'Write a different article',
				exact: true,
			}),
		).toBeVisible()
		await expect(markdownToggle(page)).toBeVisible()
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'idle')
		await expect(
			page.locator('[data-article-editor] [data-save-state]'),
		).toHaveCount(0)
		await expect(
			page
				.locator('[data-article-editor]')
				.getByRole('button', { name: 'Markdown', exact: true }),
		).toHaveCount(0)
		// Deny, "Send to the writer" and the note for the writer are gone (R7).
		await expect(
			page.getByRole('button', { name: 'Deny', exact: true }),
		).toHaveCount(0)
		await expect(
			page.getByRole('button', { name: 'Send to the writer', exact: true }),
		).toHaveCount(0)
		await expect(page.getByLabel('Note for the writer')).toHaveCount(0)

		// "Write a different article" opens the confirm sheet: no note field; Cancel keeps the article.
		await bar
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
		await expect(rewriteSheet.getByRole('textbox')).toHaveCount(0)
		await expect(
			rewriteSheet.getByRole('button', {
				name: 'Write a different article',
				exact: true,
			}),
		).toBeVisible()
		await rewriteSheet
			.getByRole('button', { name: 'Cancel', exact: true })
			.click()
		await expect(rewriteSheet).toHaveCount(0)
		expect(
			(
				await prisma.article.findUniqueOrThrow({
					where: { id: article.id },
					select: { status: true },
				})
			).status,
		).toBe('pending')

		const launcher = page.getByRole('button', { name: 'Open the chat' })
		await expect(launcher).toBeVisible()
		await launcher.click()
		await expect(chatPopup(page)).toBeVisible()
		await expect(
			chatPopup(page).getByText('Ask a question or say what to change.'),
		).toBeVisible()
		await chatPopup(page)
			.getByRole('button', { name: 'Close the chat', exact: true })
			.click()
		await expect(chatPopup(page)).toHaveCount(0)
		await expect(launcher).toBeVisible()
		const preview = page.locator('[data-article-preview]')
		await expect(preview).toBeVisible()
		await expect(preview.getByText('Second paragraph.')).toBeVisible()
		// the article is centred at about 70ch and does not fill the width
		const previewBox = await preview.boundingBox()
		expect(previewBox!.width).toBeLessThanOrEqual(720)

		// A typed edit in the article saves itself; the links check sits under the article in both views.
		const prose = richEditor(page)
		await expect(prose).toBeVisible()
		const lastParagraph = prose.locator('p').last()
		await lastParagraph.click()
		await caretToEnd(lastParagraph)
		await page.keyboard.press('Enter')
		await page.keyboard.type('Sarah added this line.')
		await expect(preview.getByText('Sarah added this line.')).toBeVisible()
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saved', {
			timeout: 10_000,
		})
		const saved = await prisma.article.findUniqueOrThrow({
			where: { id: article.id },
		})
		expect(saved.body).toContain('\n\nSarah added this line.')
		expect(saved.editedBy).toBeTruthy()
		await expect(
			page.getByText('In place: Sarah Hitchcox Aesthetics'),
		).toBeVisible()

		// The Markdown toggle holds the same working copy; an edit there lands in the article.
		await markdownToggle(page).click()
		await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'true')
		await expect(
			page.getByText('In place: Sarah Hitchcox Aesthetics'),
		).toBeVisible()
		const text = page.getByLabel('Article text')
		await expect(text).toHaveValue(/Sarah added this line\./)
		await text.fill(`${BODY}\n\nSarah added another line.`)
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saving')
		await markdownToggle(page).click()
		await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'false')
		await expect(preview).toContainText('Sarah added another line.')
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saved', {
			timeout: 10_000,
		})

		// The bubble: a double-click on a word shows the formatting controls; Bold saves `**Second**`.
		const secondParagraph = prose.locator('p', { hasText: 'Second paragraph.' })
		// the first word: the double-click lands on "Second"
		await secondParagraph.dblclick({ position: { x: 8, y: 14 } })
		const bubble = page.getByRole('toolbar', { name: 'Formatting' })
		await expect(bubble).toBeVisible()
		for (const name of [
			'Bold',
			'Italic',
			'Heading',
			'Small heading',
			'Bullet list',
			'Link',
			'Comment on this',
		]) {
			await expect(
				bubble.getByRole('button', { name, exact: true }),
			).toBeVisible()
		}
		const bold = bubble.getByRole('button', { name: 'Bold', exact: true })
		await bold.click()
		await expect(bold).toHaveAttribute('aria-pressed', 'true')
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saving')
		await markdownToggle(page).click()
		await expect(text).toHaveValue(/\*\*Second\*\*/)
		await markdownToggle(page).click()
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saved', {
			timeout: 10_000,
		})
		const bolded = await prisma.article.findUniqueOrThrow({
			where: { id: article.id },
		})
		expect(bolded.body).toContain('**Second**')

		// "Comment on this" from the bubble opens the popup with the quote attached.
		const firstParagraph = prose.locator('p').first()
		// the click gives the editor focus, so the bubble shows for the selection
		await firstParagraph.click()
		await selectText(firstParagraph)
		await bubble
			.getByRole('button', { name: 'Comment on this', exact: true })
			.click()
		await expect(chatPopup(page)).toBeVisible()
		await expect(
			chatPopup(page).locator('blockquote', {
				hasText: 'First paragraph with a link to the practice',
			}),
		).toBeVisible()
		await expect(
			chatPopup(page).getByRole('button', { name: 'Remove the quote' }),
		).toBeVisible()
		// the popup sits above the decision bar, not over it
		const popupBox = await chatPopup(page).boundingBox()
		const barBox = await bar.boundingBox()
		expect(popupBox, 'the popup is on the page').not.toBeNull()
		expect(barBox, 'the decision bar is on the page').not.toBeNull()
		expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(barBox!.y)
		await chatPopup(page)
			.getByRole('button', { name: 'Close the chat', exact: true })
			.click()
		await expect(chatPopup(page)).toHaveCount(0)
		await expect(launcher).toBeVisible()

		await page.getByRole('button', { name: 'Approve', exact: true }).click()
		await expect(page).toHaveURL(/\/admin\/articles$/)
		await expect(page.getByText('Approved').first()).toBeVisible()

		const updated = await prisma.article.findUniqueOrThrow({
			where: { id: article.id },
		})
		expect(updated.status).toBe('approved')
		expect(updated.body).toContain('Sarah added another line.')
		expect(updated.body).toContain('**Second**')
		expect(updated.reviewedBy).toBeTruthy()
	} finally {
		await prisma.article.delete({ where: { id: article.id } }).catch(() => {})
	}
})
