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
		await expect(page.getByText('In place: Sarah Hitchcox Aesthetics')).toBeVisible()
		await expect(page.getByRole('img', { name: 'a test picture' })).toBeVisible()
		await page.screenshot({
			path: process.env.ARTICLE_SHOT ?? 'test-results/admin-article-review.png',
			fullPage: true,
		})

		const text = page.getByLabel('Text')
		await text.fill(`${BODY}\n\nSarah added this line.`)
		await expect(page.getByText('Sarah added this line.').last()).toBeVisible()
		await page.getByRole('button', { name: 'Save edits' }).click()
		await expect(page.getByText('Saved.')).toBeVisible()

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
