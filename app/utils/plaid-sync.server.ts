/**
 * Pulls transactions from Plaid into the PlaidTransaction table.
 *
 * Runs as the plaid-sync background job (Temporal schedule / legacy interval).
 * The table is a permanent archive: institutions cap how far back Plaid can
 * read (Capital One serves only the last 90 days), so we upsert everything we
 * see and never delete, data stays after Plaid's window slides past it.
 *
 * Connections come from PLAID_TOKENS_JSON (Fly secret: the contents of
 * .plaid-tokens.json) or, when unset, from the local .plaid-tokens.json file
 * written by scripts/plaid-link.ts.
 */
import fs from 'node:fs'
import path from 'node:path'

import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

import { prisma } from '#app/utils/db.server.ts'

const LOOKBACK_DAYS = 730

type PlaidItem = {
	itemId: string
	accessToken: string
	institutionName: string
	owner?: string
}

function loadItems(): PlaidItem[] {
	const envJson = process.env.PLAID_TOKENS_JSON?.trim()
	if (envJson) return JSON.parse(envJson) as PlaidItem[]
	try {
		return JSON.parse(
			fs.readFileSync(path.join(process.cwd(), '.plaid-tokens.json'), 'utf8'),
		) as PlaidItem[]
	} catch {
		return []
	}
}

export function hasPlaidConfig(): boolean {
	return Boolean(
		process.env.PLAID_CLIENT_ID?.trim() &&
			process.env.PLAID_SECRET?.trim() &&
			loadItems().length,
	)
}

export async function syncPlaidTransactions(): Promise<{
	items: number
	upserted: number
	replacedPending: number
}> {
	const clientId = process.env.PLAID_CLIENT_ID?.trim()
	const secret = process.env.PLAID_SECRET?.trim()
	const env = (process.env.PLAID_ENV?.trim() ||
		'production') as keyof typeof PlaidEnvironments
	if (!clientId || !secret) throw new Error('PLAID_CLIENT_ID / PLAID_SECRET missing')
	const items = loadItems()
	if (!items.length) throw new Error('No Plaid connections configured')

	const client = new PlaidApi(
		new Configuration({
			basePath: PlaidEnvironments[env],
			baseOptions: {
				headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret },
			},
		}),
	)

	const end = new Date().toISOString().slice(0, 10)
	const start = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10)

	let upserted = 0
	let replacedPending = 0
	for (const item of items) {
		let offset = 0
		let accounts = new Map<string, { mask: string | null; type: string }>()
		for (;;) {
			const res = await client.transactionsGet({
				access_token: item.accessToken,
				start_date: start,
				end_date: end,
				options: { count: 500, offset },
			})
			if (offset === 0) {
				accounts = new Map(
					res.data.accounts.map(a => [a.account_id, { mask: a.mask, type: a.type }]),
				)
			}
			for (const t of res.data.transactions) {
				// A posted transaction gets a new id and references the pending row
				// it replaces, drop the pending one so it doesn't double-count.
				if (t.pending_transaction_id) {
					const removed = await prisma.plaidTransaction.deleteMany({
						where: { id: t.pending_transaction_id },
					})
					replacedPending += removed.count
				}
				const acct = accounts.get(t.account_id)
				const data = {
					itemId: item.itemId,
					owner: item.owner ?? null,
					institution: item.institutionName,
					accountId: t.account_id,
					accountMask: acct?.mask ?? null,
					accountType: acct?.type ?? null,
					accountOwner: t.account_owner ?? null,
					date: t.date,
					amount: t.amount,
					name: t.name ?? '',
					merchant: t.merchant_name ?? null,
					pfcPrimary: t.personal_finance_category?.primary ?? null,
					pfcDetailed: t.personal_finance_category?.detailed ?? null,
					pending: t.pending ?? false,
				}
				await prisma.plaidTransaction.upsert({
					where: { id: t.transaction_id },
					create: { id: t.transaction_id, ...data },
					update: data,
				})
				upserted++
			}
			offset += res.data.transactions.length
			if (
				offset >= res.data.total_transactions ||
				res.data.transactions.length === 0
			)
				break
		}
	}
	return { items: items.length, upserted, replacedPending }
}
