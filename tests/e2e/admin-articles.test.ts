import { createHash } from 'node:crypto'
import { type Locator, type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/** sha256 of the exact text, CRLF folded and trimmed: the hash the save and chat resources return. */
function hashBody(body: string): string {
	return createHash('sha256')
		.update(body.replace(/\r\n/g, '\n').trim())
		.digest('hex')
}

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
 * field. "Grill me" in the bar (phase 5, R1-R5) posts a grill start with
 * no text; the (mocked) first question opens the popup as a labelled
 * question row, the button reads "Stop grilling" and the box asks for the
 * answer. Her answer is an ordinary turn; the (mocked) turn changes the
 * text in place and asks the next question. "Stop grilling" posts mode
 * grill_stop; the (mocked) done row ends it and the button and the box
 * return to normal. Approve posts the hidden body from the bar, with the
 * grill's change in it. Then /admin/facts (R7): a seeded grill row is
 * listed with its article, its fact is edited through the row's form,
 * and Retire moves it to the retired list.
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

/** "Grill me" in the bar slot: present while no grill runs. */
function grillMeButton(page: Page) {
	return barSlot(page).getByRole('button', { name: 'Grill me', exact: true })
}

/** The same button while a grill runs: it reads "Stop grilling". */
function stopGrillingButton(page: Page) {
	return barSlot(page).getByRole('button', {
		name: 'Stop grilling',
		exact: true,
	})
}

/** One row as the chat resource sends it: the fields it always carries, then the row's own. */
function chatRow(row: {
	id: string
	role: 'user' | 'assistant' | 'change'
	text: string
	toolName?: string | null
	createdAt: string
}) {
	return { quote: null, imageId: null, imageUrl: null, toolName: null, ...row }
}

/** One of the two lists on /admin/facts: the card whose heading is "Live (n)" or "Retired (n)". */
function factList(page: Page, name: RegExp) {
	return page.locator('div.rounded-lg', {
		has: page.getByRole('heading', { name }),
	})
}

/** The (mocked) grill on the desktop: two questions, her answer, what it changes. */
const GRILL_Q1 =
	'Q1: How many jaw patients do you see in a month? A rough number is fine.'
const GRILL_ANSWER = 'About forty a month.'
const GRILL_Q2 = 'Q2: Do most of them come back, and after how long?'
/** The grill's change row. Lowercase first, so the line reads the same whether summaryLine folds it or not. */
const GRILL_CHANGE_SUMMARY =
	'the last line now says how many jaw patients she sees.'
/** What the grill's answer adds after her typed line. */
const GRILL_SENTENCE = 'She sees about forty jaw patients a month.'

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
	/** The fact bank row seeded for /admin/facts; deleted at the end. */
	let fact: { id: string } | null = null

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

		// Grill me (phase 5, R1-R2): the bar's button posts a grill start with no
		// text; the (mocked) first question opens the popup as a labelled row.
		// The stored text is what she saved above; the mock's rows are shaped
		// like the resource's.
		const grillBase = bolded.body
		const grillBody = grillBase.replace(
			'Sarah added another line.',
			`Sarah added another line. ${GRILL_SENTENCE}`,
		)
		expect(grillBody).not.toBe(grillBase)
		await expect(grillMeButton(page)).toBeVisible()
		await expect(stopGrillingButton(page)).toHaveCount(0)
		const stamp = Date.now()
		let grillStart: unknown = null
		await page.route('**/resources/article-chat', async route => {
			grillStart = route.request().postDataJSON()
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					messages: [
						chatRow({
							id: `mock-grill-q1-${stamp}`,
							role: 'assistant',
							text: GRILL_Q1,
							toolName: 'grill_question',
							createdAt: new Date().toISOString(),
						}),
					],
					body: grillBase,
					hash: hashBody(grillBase),
					changed: false,
					grill: 'active',
				}),
			})
		})
		await grillMeButton(page).click()
		await expect(chatPopup(page)).toBeVisible()
		await page.unroute('**/resources/article-chat')
		// the start carries the mode and the hash, and no text (and not the quote still attached from above)
		expect(grillStart).toEqual({
			articleId: article.id,
			mode: 'grill',
			baseHash: hashBody(grillBase),
		})
		// the quote from "Comment on this" is still in the popup; a quote's placeholder wins, so take it off: her answer is only her answer
		await chatPopup(page)
			.getByRole('button', { name: 'Remove the quote' })
			.click()
		await expect(
			chatPopup(page).getByRole('button', { name: 'Remove the quote' }),
		).toHaveCount(0)
		const chatList = chatPopup(page).locator('[data-chat-list]')
		const questions = chatList.locator('[data-grill-question]')
		await expect(questions).toHaveCount(1)
		await expect(questions.first()).toContainText('Question')
		await expect(questions.first()).toContainText(GRILL_Q1)
		await expect(stopGrillingButton(page)).toBeVisible()
		await expect(grillMeButton(page)).toHaveCount(0)
		const answerBox = chatPopup(page).getByPlaceholder(
			'Answer here, or say skip',
		)
		await expect(answerBox).toBeVisible()
		await expect(
			chatPopup(page).getByPlaceholder('Say or type what to change…'),
		).toHaveCount(0)
		await page.screenshot({
			path: 'test-results/admin-article-grill-question.png',
			fullPage: true,
		})

		// R4: her answer is an ordinary turn; the (mocked) turn applies it in place and asks the next question.
		let grillAnswer: unknown = null
		await page.route('**/resources/article-chat', async route => {
			grillAnswer = route.request().postDataJSON()
			await prisma.article.update({
				where: { id: article.id },
				data: { body: grillBody },
			})
			const createdAt = new Date().toISOString()
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					messages: [
						chatRow({
							id: `mock-grill-answer-${stamp}`,
							role: 'user',
							text: GRILL_ANSWER,
							createdAt,
						}),
						chatRow({
							id: `mock-grill-change-${stamp}`,
							role: 'change',
							text: GRILL_CHANGE_SUMMARY,
							toolName: 'replace_text',
							createdAt,
						}),
						chatRow({
							id: `mock-grill-q2-${stamp}`,
							role: 'assistant',
							text: GRILL_Q2,
							toolName: 'grill_question',
							createdAt,
						}),
					],
					body: grillBody,
					hash: hashBody(grillBody),
					changed: true,
					grill: 'active',
				}),
			})
		})
		await answerBox.fill(GRILL_ANSWER)
		await chatPopup(page)
			.getByRole('button', { name: 'Send', exact: true })
			.click()
		await expect(questions).toHaveCount(2)
		await page.unroute('**/resources/article-chat')
		expect(grillAnswer).toEqual({
			articleId: article.id,
			text: GRILL_ANSWER,
			baseHash: hashBody(grillBase),
		})
		await expect(chatList.getByText(GRILL_ANSWER)).toBeVisible()
		await expect(
			chatList.getByText(`Changed: ${GRILL_CHANGE_SUMMARY}`),
		).toBeVisible()
		await expect(questions.last()).toContainText('Question')
		await expect(questions.last()).toContainText(GRILL_Q2)
		await expect(stopGrillingButton(page)).toBeVisible()
		await expect(answerBox).toHaveValue('')
		// the article took her answer in place, with the green mark
		await expect(preview).toContainText(GRILL_SENTENCE)
		await expect(preview.locator('mark.review-changed')).toBeVisible()

		// R5: Stop grilling posts mode grill_stop; the (mocked) done row ends the grill.
		let grillStop: unknown = null
		await page.route('**/resources/article-chat', async route => {
			grillStop = route.request().postDataJSON()
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					messages: [
						chatRow({
							id: `mock-grill-stopped-${stamp}`,
							role: 'assistant',
							text: 'Stopped.',
							toolName: 'grill_done',
							createdAt: new Date().toISOString(),
						}),
					],
					body: grillBody,
					hash: hashBody(grillBody),
					changed: false,
					grill: 'done',
				}),
			})
		})
		await stopGrillingButton(page).click()
		await expect(chatList.getByText('Stopped.')).toBeVisible()
		await page.unroute('**/resources/article-chat')
		expect(grillStop).toEqual({
			articleId: article.id,
			mode: 'grill_stop',
			baseHash: hashBody(grillBody),
		})
		// the done row is not a question; the button and the box are back to normal
		await expect(questions).toHaveCount(2)
		await expect(
			chatList.locator('[data-grill-question]', { hasText: 'Stopped.' }),
		).toHaveCount(0)
		await expect(grillMeButton(page)).toBeVisible()
		await expect(stopGrillingButton(page)).toHaveCount(0)
		await expect(
			chatPopup(page).getByPlaceholder('Say or type what to change…'),
		).toBeVisible()
		await expect(answerBox).toHaveCount(0)
		await page.screenshot({
			path: 'test-results/admin-article-grill-stopped.png',
			fullPage: true,
		})
		await chatPopup(page)
			.getByRole('button', { name: 'Close the chat', exact: true })
			.click()
		await expect(chatPopup(page)).toHaveCount(0)
		// the mock's write is the only one: the stored text is what it returned
		await markdownToggle(page).click()
		await expect(text).toHaveValue(grillBody)
		await markdownToggle(page).click()
		await expect(saveMark(page)).toHaveAttribute('data-save-state', 'saved')
		expect(
			(
				await prisma.article.findUniqueOrThrow({
					where: { id: article.id },
					select: { body: true },
				})
			).body,
		).toBe(grillBody)

		await page.getByRole('button', { name: 'Approve', exact: true }).click()
		await expect(page).toHaveURL(/\/admin\/articles$/)
		await expect(page.getByText('Approved').first()).toBeVisible()

		const updated = await prisma.article.findUniqueOrThrow({
			where: { id: article.id },
		})
		expect(updated.status).toBe('approved')
		expect(updated.body).toContain('Sarah added another line.')
		expect(updated.body).toContain('**Second**')
		expect(updated.body).toContain(GRILL_SENTENCE)
		expect(updated.reviewedBy).toBeTruthy()

		// /admin/facts (R7): a grill row is listed with its article; its fact is
		// edited through the row's form; Retire moves it to the retired list.
		const FACT = `She sees about forty jaw patients a month. (test ${stamp})`
		const FACT_EDITED = `She sees forty to fifty jaw patients a month. (test ${stamp})`
		fact = await prisma.reviewFact.create({
			data: {
				source: 'grill',
				fact: FACT,
				tags: 'botox, jaw',
				question: GRILL_Q1,
				answer: GRILL_ANSWER,
				articleId: article.id,
				userId: user.id,
			},
			select: { id: true },
		})
		await page.goto('/admin/facts')
		await expect(page.getByRole('heading', { name: 'Facts' })).toBeVisible()
		const live = factList(page, /^Live \(\d+\)$/)
		const retired = factList(page, /^Retired \(\d+\)$/)
		await expect(live).toBeVisible()
		await expect(retired).toBeVisible()
		// the row: the fact, the tags and the answer in the row's form, the question and the source as text, the article as a link
		const factInput = page.locator(`input[name="fact"][form="edit-${fact.id}"]`)
		const liveRow = live.locator('tr', { has: factInput })
		await expect(liveRow).toHaveCount(1)
		await expect(factInput).toHaveValue(FACT)
		await expect(
			liveRow.locator(`input[name="tags"][form="edit-${fact.id}"]`),
		).toHaveValue('botox, jaw')
		await expect(
			liveRow.locator(`input[name="answer"][form="edit-${fact.id}"]`),
		).toHaveValue(GRILL_ANSWER)
		await expect(liveRow).toContainText(GRILL_Q1)
		await expect(liveRow).toContainText('grill')
		await expect(
			liveRow.getByRole('link', { name: article.title }),
		).toHaveAttribute('href', `/admin/articles/${article.id}`)
		await expect(retired.locator('tr', { hasText: FACT })).toHaveCount(0)
		await page.screenshot({
			path: 'test-results/admin-facts.png',
			fullPage: true,
		})

		// edit the fact through the row's form
		await factInput.fill(FACT_EDITED)
		await liveRow.getByRole('button', { name: 'Save', exact: true }).click()
		await expect
			.poll(
				async () =>
					(
						await prisma.reviewFact.findUniqueOrThrow({
							where: { id: fact!.id },
							select: { fact: true },
						})
					).fact,
				{ message: 'the edit saved the fact' },
			)
			.toBe(FACT_EDITED)
		const edited = await prisma.reviewFact.findUniqueOrThrow({
			where: { id: fact.id },
		})
		expect(edited.tags).toBe('botox, jaw')
		expect(edited.answer).toBe(GRILL_ANSWER)
		expect(edited.source).toBe('grill')
		expect(edited.retiredAt).toBeNull()
		await expect(factInput).toHaveValue(FACT_EDITED)

		// retire it: the row leaves the live list for the retired one, as text with Restore
		await liveRow.getByRole('button', { name: 'Retire', exact: true }).click()
		const retiredRow = retired.locator('tr', { hasText: FACT_EDITED })
		await expect(retiredRow).toHaveCount(1)
		await expect(
			retiredRow.getByRole('button', { name: 'Restore', exact: true }),
		).toBeVisible()
		// a retired row is text, not fields (the Restore form's hidden inputs are not fields)
		await expect(retiredRow.locator('input:not([type="hidden"])')).toHaveCount(
			0,
		)
		await expect(liveRow).toHaveCount(0)
		const retiredFact = await prisma.reviewFact.findUniqueOrThrow({
			where: { id: fact.id },
		})
		expect(retiredFact.retiredAt).not.toBeNull()
		expect(retiredFact.fact).toBe(FACT_EDITED)
		await page.screenshot({
			path: 'test-results/admin-facts-retired.png',
			fullPage: true,
		})
	} finally {
		if (fact) {
			await prisma.reviewFact
				.deleteMany({ where: { id: fact.id } })
				.catch(() => {})
		}
		await prisma.article.delete({ where: { id: article.id } }).catch(() => {})
	}
})
