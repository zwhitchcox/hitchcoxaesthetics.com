/**
 * The annual fee list behind the P&L's annual fees (AnnualFee rows, read by
 * scripts/plaid-expenses.ts). Zane edits it in Settings on the household
 * profit page.
 */
import { queueFinanceReportsRun } from '#app/utils/background-jobs.server.ts'
import { prisma } from '#app/utils/db.server.ts'

export async function loadAnnualFees() {
	const fees = await prisma.annualFee.findMany({ orderBy: { createdAt: 'asc' } })
	// The newest business charge that each fee's text finds, so a wrong or
	// missing text shows in the editor.
	const lastCharges = await Promise.all(
		fees.map(fee => {
			const text = fee.chargeMatch?.trim()
			if (!text) return null
			return prisma.plaidTransaction.findFirst({
				where: {
					owner: 'sarah',
					amount: { gt: 0 },
					OR: [{ name: { contains: text } }, { merchant: { contains: text } }],
				},
				orderBy: { date: 'desc' },
				select: { date: true, amount: true },
			})
		}),
	)
	return fees.map((fee, i) => ({
		id: fee.id,
		name: fee.name,
		amountUsd: fee.amountUsd,
		chargeMatch: fee.chargeMatch ?? '',
		lastCharge: lastCharges[i] ?? null,
	}))
}

/** Add, save or delete one fee from the editor's form. */
export async function handleAnnualFeeForm(
	form: FormData,
): Promise<{ ok: boolean; error: string | null }> {
	const intent = form.get('intent')?.toString()
	const id = form.get('id')?.toString()

	if (intent === 'delete-fee' && id) {
		await prisma.annualFee.delete({ where: { id } })
	} else if (intent === 'add-fee' || (intent === 'save-fee' && id)) {
		const name = form.get('name')?.toString().trim() ?? ''
		const amountText = form.get('amountUsd')?.toString().trim() ?? ''
		const amountUsd = amountText ? Number(amountText) : NaN
		if (!name || !Number.isFinite(amountUsd) || amountUsd < 0) {
			return { ok: false, error: 'Type a name and an amount of 0 or more.' }
		}
		const data = {
			name,
			amountUsd,
			chargeMatch: form.get('chargeMatch')?.toString().trim() || null,
		}
		if (intent === 'add-fee') await prisma.annualFee.create({ data })
		else await prisma.annualFee.update({ where: { id }, data })
	} else {
		return { ok: false, error: 'Unknown request.' }
	}

	queueFinanceReportsRun()
	return { ok: true, error: null }
}
