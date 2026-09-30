/**
 * Annual fees: the once-a-year business fees (memberships, the state annual
 * report) that the P&L spreads over 12 months. Zane adds, changes and
 * deletes them here (2026-09-30); scripts/plaid-expenses.ts reads the same
 * rows. Each change re-runs the finance reports job, so the revenue and
 * household pages show it about a minute later.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { ReportPage, StatTile, usd } from '#app/components/report-ui'
import { queueFinanceReportsRun } from '#app/utils/background-jobs.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: MetaFunction = () => [
	{ title: 'Annual fees' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const fees = await prisma.annualFee.findMany({ orderBy: { createdAt: 'asc' } })
	// The newest business charge that each fee's text finds, so a wrong or
	// missing text shows on the page.
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
	return json({
		fees: fees.map((fee, i) => ({
			id: fee.id,
			name: fee.name,
			amountUsd: fee.amountUsd,
			chargeMatch: fee.chargeMatch ?? '',
			lastCharge: lastCharges[i] ?? null,
		})),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const form = await request.formData()
	const intent = form.get('intent')?.toString()
	const id = form.get('id')?.toString()

	if (intent === 'delete' && id) {
		await prisma.annualFee.delete({ where: { id } })
	} else if (intent === 'add' || (intent === 'save' && id)) {
		const name = form.get('name')?.toString().trim() ?? ''
		const amountText = form.get('amountUsd')?.toString().trim() ?? ''
		const amountUsd = amountText ? Number(amountText) : NaN
		if (!name || !Number.isFinite(amountUsd) || amountUsd < 0) {
			return json(
				{ ok: false, error: 'Type a name and an amount of 0 or more.' },
				{ status: 400 },
			)
		}
		const data = {
			name,
			amountUsd,
			chargeMatch: form.get('chargeMatch')?.toString().trim() || null,
		}
		if (intent === 'add') await prisma.annualFee.create({ data })
		else await prisma.annualFee.update({ where: { id }, data })
	} else {
		return json({ ok: false, error: 'Unknown request.' }, { status: 400 })
	}

	queueFinanceReportsRun()
	return json({ ok: true, error: null })
}

type Fee = ReturnType<typeof useLoaderData<typeof loader>>['fees'][number]

const CSS = `
.fees td { vertical-align: middle; }
.fees input { font: inherit; width: 100%; padding: 4px 8px; border-radius: 7px;
	border: 1px solid var(--axis); background: var(--surface-1); color: var(--ink); }
.fees input.amount { text-align: right; }
.fees .actions { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.fees button { font: inherit; font-weight: 600; padding: 4px 12px; border-radius: 7px;
	border: 1px solid var(--axis); background: var(--surface-1); color: var(--ink); cursor: pointer; }
.fees button:disabled { opacity: 0.6; cursor: default; }
.fees .error { color: var(--bad-text); font-size: 12px; }
@media (max-width: 700px) {
	.fees thead, .fees td.blank { display: none; }
	.fees, .fees tbody, .fees tr, .fees td { display: block; width: 100%; }
	.fees tr { padding: 8px 0; border-bottom: 1px solid var(--grid); }
	.fees td { border: 0; padding: 3px 0; }
	.fees td[data-label]::before { content: attr(data-label); display: block; margin-bottom: 2px;
		font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
}
`

function chargeDate(day: string) {
	return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	})
}

function FeeRow({ fee }: { fee: Fee }) {
	const fetcher = useFetcher<typeof action>()
	const formId = `fee-${fee.id}`
	const busy = fetcher.state !== 'idle'
	return (
		<tr>
			<td data-label="Fee">
				<input form={formId} name="name" defaultValue={fee.name} aria-label="Fee" required />
			</td>
			<td data-label="Amount per year">
				<input
					form={formId}
					name="amountUsd"
					className="amount"
					type="number"
					min="0"
					step="0.01"
					defaultValue={fee.amountUsd}
					aria-label="Amount per year"
					required
				/>
			</td>
			<td data-label="Bank charge text">
				<input
					form={formId}
					name="chargeMatch"
					defaultValue={fee.chargeMatch}
					aria-label="Bank charge text"
				/>
			</td>
			<td className="dim" data-label="Last charge">
				{fee.lastCharge
					? `${usd(fee.lastCharge.amount, 2)} on ${chargeDate(fee.lastCharge.date)}`
					: fee.chargeMatch
						? 'No charge found'
						: '-'}
			</td>
			<td>
				<fetcher.Form id={formId} method="post">
					<input type="hidden" name="id" value={fee.id} />
				</fetcher.Form>
				<div className="actions">
					<button form={formId} name="intent" value="save" disabled={busy}>
						Save
					</button>
					<button form={formId} name="intent" value="delete" disabled={busy}>
						Delete
					</button>
					{fetcher.state === 'idle' && fetcher.data?.ok ? (
						<span className="dim">Saved</span>
					) : null}
					{fetcher.data?.error ? <span className="error">{fetcher.data.error}</span> : null}
				</div>
			</td>
		</tr>
	)
}

function AddFeeRow() {
	const fetcher = useFetcher<typeof action>()
	return (
		<tr>
			<td data-label="New fee">
				<input form="fee-new" name="name" placeholder="New fee" aria-label="New fee" required />
			</td>
			<td data-label="Amount per year">
				<input
					form="fee-new"
					name="amountUsd"
					className="amount"
					type="number"
					min="0"
					step="0.01"
					placeholder="0"
					aria-label="New fee amount per year"
					required
				/>
			</td>
			<td data-label="Bank charge text">
				<input
					form="fee-new"
					name="chargeMatch"
					placeholder="Text on the statement"
					aria-label="New fee bank charge text"
				/>
			</td>
			<td className="dim blank">-</td>
			<td>
				<fetcher.Form id="fee-new" method="post" />
				<div className="actions">
					<button form="fee-new" name="intent" value="add" disabled={fetcher.state !== 'idle'}>
						Add
					</button>
					{fetcher.data?.error ? <span className="error">{fetcher.data.error}</span> : null}
				</div>
			</td>
		</tr>
	)
}

export default function AnnualFees() {
	const { fees } = useLoaderData<typeof loader>()
	const total = fees.reduce((sum, fee) => sum + fee.amountUsd, 0)
	return (
		<ReportPage
			title="Annual fees"
			subtitle="Business fees paid once a year. The reports spread these amounts over 12 months."
		>
			<style dangerouslySetInnerHTML={{ __html: CSS }} />
			<div className="tiles">
				<StatTile label="Per year" value={usd(total, 2)} />
				<StatTile label="Per month in the reports" value={usd(total / 12, 2)} />
			</div>
			<section>
				<h2>Fees</h2>
				<div className="rtable-wrap">
					<table className="rtable fees">
						<thead>
							<tr>
								<th style={{ width: '32%' }}>Fee</th>
								<th className="num" style={{ width: 130 }}>
									Amount per year
								</th>
								<th style={{ width: '20%' }}>Bank charge text</th>
								<th>Last charge</th>
								<th aria-label="Actions" />
							</tr>
						</thead>
						<tbody>
							{fees.map(fee => (
								<FeeRow key={fee.id} fee={fee} />
							))}
							{/* A new key after each add or delete clears the typed values. */}
							<AddFeeRow key={fees.length} />
						</tbody>
					</table>
				</div>
				<p className="note">
					Bank charge text is part of the charge name on the card statement, for
					example "iapam". The reports take each business charge that contains it
					out of its month, because the monthly share already covers it. Leave it
					empty for a fee that has no charge yet.
				</p>
				<p className="note">
					After a change, the revenue and household pages update in about a
					minute.
				</p>
			</section>
		</ReportPage>
	)
}
