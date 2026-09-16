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
 * Desktop width: the editor shows the chat on the left and the article on
 * the right (phase 3 plan, section 7). The typed edit happens under the
 * Markdown tab, saves itself, and shows in the right column.
 */
test.use({ viewport: { width: 1280, height: 800 } })

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
				{ name: 'Sarah Hitchcox Aesthetics', url: 'https://hitchcoxaesthetics.com' },
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
			path: process.env.ARTICLE_LIST_SHOT ?? 'test-results/admin-articles-list.png',
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
		await expect(page.getByRole('img', { name: 'a test picture' })).toBeVisible()
		await page.screenshot({
			path: process.env.ARTICLE_SHOT ?? 'test-results/admin-article-review.png',
			fullPage: true,
		})

		// The editor: the chat on the left (open on its empty state), the
		// article on the right. The old prompt tab is gone. A typed change
		// under Markdown saves itself; there is no Save button.
		await expect(page.getByRole('tab', { name: 'Tell it what to change' })).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Save edits' })).toHaveCount(0)
		await expect(page.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
			'aria-selected',
			'true',
		)
		await expect(page.getByText('Ask a question or say what to change.')).toBeVisible()
		const preview = page.locator('[data-article-preview]')
		await expect(preview).toBeVisible()
		await expect(preview.getByText('Second paragraph.')).toBeVisible()

		await page.getByRole('tab', { name: 'Markdown' }).click()
		// the links check sits under the Markdown tab
		await expect(page.getByText('In place: Sarah Hitchcox Aesthetics')).toBeVisible()
		const text = page.getByLabel('Article text')
		await text.fill(`${BODY}\n\nSarah added this line.`)
		await expect(preview.getByText('Sarah added this line.')).toBeVisible()
		await expect(page.getByText('Saved', { exact: true })).toBeVisible()
		const saved = await prisma.article.findUniqueOrThrow({ where: { id: article.id } })
		expect(saved.body).toContain('Sarah added this line.')
		expect(saved.editedBy).toBeTruthy()

		await page.getByRole('button', { name: 'Approve', exact: true }).click()
		await expect(page).toHaveURL(/\/admin\/articles$/)
		await expect(page.getByText('Approved').first()).toBeVisible()

		const updated = await prisma.article.findUniqueOrThrow({
			where: { id: article.id },
		})
		expect(updated.status).toBe('approved')
		expect(updated.body).toContain('Sarah added this line.')
		expect(updated.reviewedBy).toBeTruthy()
	} finally {
		await prisma.article.delete({ where: { id: article.id } }).catch(() => {})
	}
})
