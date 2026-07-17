/** Print live balances for every connection in .plaid-tokens.json */
import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

dotenv.config()

const ENV = (process.env.PLAID_ENV?.trim() ||
	'production') as keyof typeof PlaidEnvironments
const SECRET = (
	process.env.PLAID_SECRET ?? process.env[`PLAID_${ENV.toUpperCase()}_SECRET`]
)?.trim()
const client = new PlaidApi(
	new Configuration({
		basePath: PlaidEnvironments[ENV],
		baseOptions: {
			headers: {
				'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID?.trim(),
				'PLAID-SECRET': SECRET,
			},
		},
	}),
)

const tokens = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), '.plaid-tokens.json'), 'utf8'),
) as Array<{
	accessToken: string
	institutionName: string
	owner: string
}>

async function main() {
	for (const t of tokens) {
		try {
			const res = await client.accountsGet({
				access_token: t.accessToken,
			})
			for (const a of res.data.accounts) {
				console.log(
					JSON.stringify({
						owner: t.owner,
						institution: t.institutionName,
						name: a.name,
						official_name: a.official_name,
						mask: a.mask,
						type: a.type,
						subtype: a.subtype,
						available: a.balances.available,
						current: a.balances.current,
						limit: a.balances.limit,
					}),
				)
			}
		} catch (e: any) {
			console.log(
				JSON.stringify({
					owner: t.owner,
					institution: t.institutionName,
					error: e?.response?.data?.error_code ?? String(e).slice(0, 200),
				}),
			)
		}
	}
}

void main()
