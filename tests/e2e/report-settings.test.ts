import { type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/*
 * The annual fee editor at /admin/reports/annual-fees. An admin adds a fee,
 * changes its amount and its bank charge text, and deletes it. The per-year
 * and per-month tiles follow each step. The row's charge text finds a
 * seeded business charge and shows it as the last charge. Rows that other
 * tests or people made stay in the totals, so the expected sums start from
 * them.
 */
test.use({ viewport: { width: 1280, height: 800 } })

const money = (n: number) =>
	`$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`

function tile(page: Page, label: string) {
	return page.locator('.tile').filter({ hasText: label }).locator('.val')
}

test('an admin can add, change and delete an annual fee', async ({ page, login }) => {
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
	const name = `Test fee ${stamp}`
	const chargeId = `test-annual-fee-${stamp}`
	const others =
		(await prisma.annualFee.aggregate({ _sum: { amountUsd: true } }))._sum
			.amountUsd ?? 0
	await prisma.plaidTransaction.create({
		data: {
			id: chargeId,
			itemId: 'test',
			owner: 'sarah',
			institution: 'Test Bank',
			accountId: 'test',
			date: '2026-01-15',
			amount: 49.5,
			name: `TESTFEEVENDOR ${stamp}`,
		},
	})

	try {
		await page.goto('/admin/reports/annual-fees')
		await expect(page.getByRole('heading', { name: 'Annual fees' })).toBeVisible()

		// Add
		await page.getByRole('textbox', { name: 'New fee', exact: true }).fill(name)
		await page.getByRole('spinbutton', { name: 'New fee amount per year' }).fill('1200')
		await page.getByRole('button', { name: 'Add' }).click()
		const row = page.getByRole('row').filter({ has: page.locator(`input[value="${name}"]`) })
		await expect(row).toBeVisible()
		await expect(tile(page, 'Per year')).toHaveText(money(others + 1200))
		await expect(tile(page, 'Per month in the reports')).toHaveText(
			money(Math.round(((others + 1200) / 12) * 100) / 100),
		)
		// The add row is empty again.
		await expect(page.getByRole('textbox', { name: 'New fee', exact: true })).toHaveValue('')

		// Change the amount and the charge text
		await row.getByRole('spinbutton', { name: 'Amount per year' }).fill('600')
		await row.getByRole('textbox', { name: 'Bank charge text' }).fill(`testfeevendor ${stamp}`)
		await row.getByRole('button', { name: 'Save' }).click()
		await expect(row.getByText('Saved')).toBeVisible()
		await expect(tile(page, 'Per year')).toHaveText(money(others + 600))
		await expect(row.getByText('$49.5 on Jan 15, 2026')).toBeVisible()
		const saved = await prisma.annualFee.findFirstOrThrow({ where: { name } })
		expect(saved.amountUsd).toBe(600)
		expect(saved.chargeMatch).toBe(`testfeevendor ${stamp}`)

		// Delete
		await row.getByRole('button', { name: 'Delete' }).click()
		await expect(row).toHaveCount(0)
		await expect(tile(page, 'Per year')).toHaveText(money(others))
		expect(await prisma.annualFee.count({ where: { name } })).toBe(0)
	} finally {
		await prisma.annualFee.deleteMany({ where: { name } })
		await prisma.plaidTransaction.deleteMany({ where: { id: chargeId } })
	}
})
