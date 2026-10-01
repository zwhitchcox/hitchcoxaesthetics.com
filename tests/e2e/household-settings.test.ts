import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/*
 * Settings on the household profit page: the Settings button opens a dialog
 * with the annual fee editor. An admin adds a fee, changes its amount and its
 * bank charge text, and deletes it. The yearly and monthly totals follow each
 * step, and the row's charge text finds a seeded business charge. Rows that
 * other tests or people made stay in the totals, so the expected sums start
 * from them. The page needs REPORTS_DATABASE_URL to render. A save on a dev
 * server never rebuilds the reports DB (queueFinanceReportsRun runs only in
 * production).
 */
test.use({ viewport: { width: 1280, height: 800 } })

const money = (n: number) =>
	`$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`

/** The line above the fee table. */
function totalsText(perYear: number) {
	const perMonth = Math.round((perYear / 12) * 100) / 100
	return `${money(perYear)} a year in total. The reports spread it over 12 months, ${money(perMonth)} a month.`
}

test('an admin edits the annual fees in the household page settings', async ({
	page,
	login,
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
		await page.goto('/admin/reports/household-profit')
		await page.getByRole('button', { name: 'Settings' }).click()
		const dialog = page.getByRole('dialog', { name: 'Settings' })
		await expect(dialog).toBeVisible()
		const totals = dialog.getByText('a year in total')

		// Add
		await dialog.getByRole('textbox', { name: 'New fee', exact: true }).fill(name)
		await dialog.getByRole('spinbutton', { name: 'New fee amount per year' }).fill('1200')
		await dialog.getByRole('button', { name: 'Add' }).click()
		const row = dialog.getByRole('row').filter({ has: page.locator(`input[value="${name}"]`) })
		await expect(row).toBeVisible()
		await expect(totals).toContainText(totalsText(others + 1200))
		// The add row is empty again.
		await expect(dialog.getByRole('textbox', { name: 'New fee', exact: true })).toHaveValue('')

		// Change the amount and the charge text
		await row.getByRole('spinbutton', { name: 'Amount per year' }).fill('600')
		await row.getByRole('textbox', { name: 'Bank charge text' }).fill(`testfeevendor ${stamp}`)
		await row.getByRole('button', { name: 'Save' }).click()
		await expect(row.getByText('Saved')).toBeVisible()
		await expect(totals).toContainText(totalsText(others + 600))
		await expect(row.getByText('$49.5 on Jan 15, 2026')).toBeVisible()
		const saved = await prisma.annualFee.findFirstOrThrow({ where: { name } })
		expect(saved.amountUsd).toBe(600)
		expect(saved.chargeMatch).toBe(`testfeevendor ${stamp}`)

		// Delete
		await row.getByRole('button', { name: 'Delete' }).click()
		await expect(row).toHaveCount(0)
		await expect(totals).toContainText(totalsText(others))
		expect(await prisma.annualFee.count({ where: { name } })).toBe(0)

		// Close
		await dialog.getByRole('button', { name: 'Close' }).click()
		await expect(dialog).toBeHidden()
	} finally {
		await prisma.annualFee.deleteMany({ where: { name } })
		await prisma.plaidTransaction.deleteMany({ where: { id: chargeId } })
	}
})
