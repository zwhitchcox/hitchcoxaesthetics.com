/**
 * Settings for the household profit page: a button that opens a dialog
 * (Zane 2026-10-01: settings sit behind a button on the household page, not
 * on a page of their own). Today the dialog holds the annual fee list that
 * the P&L spreads over 12 months. The forms post to the page's own action,
 * which calls handleAnnualFeeForm.
 */
import { useFetcher } from '@remix-run/react'
import { useRef } from 'react'
import { usd } from '#app/components/report-ui'

export interface AnnualFee {
	id: string
	name: string
	amountUsd: number
	chargeMatch: string
	lastCharge: { date: string; amount: number } | null
}

type FeeFormResult = { ok: boolean; error: string | null }

const CSS = `
.settings-open, .settings-head button { font: inherit; font-weight: 600; padding: 5px 14px;
	border-radius: 7px; border: 1px solid var(--axis); background: var(--surface-1);
	color: var(--ink); cursor: pointer; }
dialog.settings { width: min(980px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
	padding: 14px 16px 16px; border: 1px solid var(--ring); border-radius: 12px;
	background: var(--surface-1); color: var(--ink); }
dialog.settings::backdrop { background: rgba(0, 0, 0, 0.4); }
.settings-head { display: flex; align-items: center; justify-content: space-between;
	margin-bottom: 12px; }
.settings-head h2 { font-size: 15px; margin: 0; }
.settings h3 { font-size: 13.5px; margin: 0 0 4px; }
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

function FeeRow({ fee }: { fee: AnnualFee }) {
	const fetcher = useFetcher<FeeFormResult>()
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
					<button form={formId} name="intent" value="save-fee" disabled={busy}>
						Save
					</button>
					<button form={formId} name="intent" value="delete-fee" disabled={busy}>
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
	const fetcher = useFetcher<FeeFormResult>()
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
					<button form="fee-new" name="intent" value="add-fee" disabled={fetcher.state !== 'idle'}>
						Add
					</button>
					{fetcher.data?.error ? <span className="error">{fetcher.data.error}</span> : null}
				</div>
			</td>
		</tr>
	)
}

export function SettingsDialog({ fees }: { fees: AnnualFee[] }) {
	const dialog = useRef<HTMLDialogElement>(null)
	const total = fees.reduce((sum, fee) => sum + fee.amountUsd, 0)
	return (
		<>
			<style dangerouslySetInnerHTML={{ __html: CSS }} />
			<button type="button" className="settings-open" onClick={() => dialog.current?.showModal()}>
				Settings
			</button>
			<dialog ref={dialog} className="settings" aria-labelledby="settings-title">
				<div className="settings-head">
					<h2 id="settings-title">Settings</h2>
					<button type="button" onClick={() => dialog.current?.close()}>
						Close
					</button>
				</div>
				<h3>Annual fees</h3>
				<p className="lede">
					Business fees paid once a year: {usd(total, 2)} a year in total. The
					reports spread it over 12 months, {usd(total / 12, 2)} a month.
				</p>
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
			</dialog>
		</>
	)
}
