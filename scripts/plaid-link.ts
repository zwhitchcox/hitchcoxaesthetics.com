/**
 * One-time bank connector for the local finance tooling.
 *
 * Plaid never lets the app see your bank login: you log into your bank inside
 * Plaid's own window. This starts a tiny localhost server, opens Plaid Link in
 * your browser, and on success saves the long-lived access token to a
 * git-ignored file (.plaid-tokens.json) that scripts/plaid-expenses.ts reads.
 *
 * Run as many times as you have banks to connect (Bank of America, etc.) - each
 * connection is appended.
 *
 *   pnpm plaid:link --owner sarah                       connect a new bank
 *   pnpm plaid:link --owner sarah --update amex         update-mode re-auth
 *       (fix credentials/consent; per Plaid docs this canNOT extend history)
 *   pnpm plaid:link --owner sarah --remove amex         delete the connection
 *       (then run a plain link to reconnect with the full 730-day request —
 *       the only documented way to extend history on an existing Item)
 *
 * Env (.env):
 *   PLAID_CLIENT_ID   - from dashboard.plaid.com
 *   PLAID_SECRET      - the secret for the env you're using
 *   PLAID_ENV         - sandbox | development | production   (default: sandbox)
 *   PLAID_PORT        - local port                            (default: 4271)
 *   PLAID_REDIRECT_URI- required for OAuth banks (e.g. BoA). Register the exact
 *                       value in the Plaid dashboard. For local use:
 *                       http://localhost:4271/oauth
 */
import { exec } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import dotenv from 'dotenv'
import {
	Configuration,
	CountryCode,
	PlaidApi,
	PlaidEnvironments,
	Products,
} from 'plaid'

dotenv.config()

const CLIENT_ID = process.env.PLAID_CLIENT_ID?.trim()
const ENV = (process.env.PLAID_ENV?.trim() ||
	'sandbox') as keyof typeof PlaidEnvironments
// PLAID_SECRET wins; otherwise use the env-specific name, e.g.
// PLAID_SANDBOX_SECRET / PLAID_PRODUCTION_SECRET.
const SECRET = (
	process.env.PLAID_SECRET ?? process.env[`PLAID_${ENV.toUpperCase()}_SECRET`]
)?.trim()
const PORT = Number(process.env.PLAID_PORT?.trim() || '4271')
const REDIRECT_URI = process.env.PLAID_REDIRECT_URI?.trim() || undefined
const TOKENS_FILE = path.join(process.cwd(), '.plaid-tokens.json')

if (!CLIENT_ID || !SECRET) {
	console.error(
		'Missing PLAID_CLIENT_ID / PLAID_SECRET in .env. Create an app at dashboard.plaid.com first.',
	)
	process.exit(1)
}

const client = new PlaidApi(
	new Configuration({
		basePath: PlaidEnvironments[ENV],
		baseOptions: {
			headers: { 'PLAID-CLIENT-ID': CLIENT_ID, 'PLAID-SECRET': SECRET },
		},
	}),
)

type StoredItem = {
	itemId: string
	accessToken: string
	institutionName: string
	connectedAt: string
	env: string
	/** Whose connection this is (e.g. "zane", "sarah") — `--owner <name>`. */
	owner?: string
}

const OWNER =
	process.argv.includes('--owner')
		? process.argv[process.argv.indexOf('--owner') + 1]?.trim()
		: undefined

// `--update <institution substring>` re-opens Link for an already-connected
// bank in update mode (credential/consent fixes only — Plaid does not extend
// transaction history this way; use --remove + a fresh link for that).
const UPDATE =
	process.argv.includes('--update')
		? process.argv[process.argv.indexOf('--update') + 1]?.trim().toLowerCase()
		: undefined

// `--remove <institution substring>` deletes the connection at Plaid and drops
// it from the tokens file. Reconnecting afterwards requests the full 730 days.
const REMOVE =
	process.argv.includes('--remove')
		? process.argv[process.argv.indexOf('--remove') + 1]?.trim().toLowerCase()
		: undefined

const INSTITUTION_ALIASES: Record<string, string> = {
	amex: 'american express',
	boa: 'bank of america',
	bofa: 'bank of america',
	capone: 'capital one',
	cap1: 'capital one',
}

/** Resolve exactly one stored connection from a name fragment, or exit. */
function findStoredItem(fragment: string): StoredItem {
	const query = INSTITUTION_ALIASES[fragment] ?? fragment
	const matches = loadTokens().filter(
		i =>
			i.institutionName.toLowerCase().includes(query) &&
			(!OWNER || i.owner?.toLowerCase() === OWNER.toLowerCase()),
	)
	if (matches.length !== 1) {
		console.error(
			matches.length === 0
				? `No connected bank matches "${fragment}"${OWNER ? ` for owner ${OWNER}` : ''}.`
				: `"${fragment}" matches several connections (${matches.map(m => `${m.institutionName}${m.owner ? ` (${m.owner})` : ''}`).join(', ')}); add --owner or be more specific.`,
		)
		process.exit(1)
	}
	return matches[0]
}

function loadTokens(): StoredItem[] {
	try {
		return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')) as StoredItem[]
	} catch {
		return []
	}
}

function saveItem(item: StoredItem) {
	const items = loadTokens().filter(existing => existing.itemId !== item.itemId)
	items.push(item)
	fs.writeFileSync(TOKENS_FILE, JSON.stringify(items, null, 2))
}

async function createLinkToken(accessToken?: string) {
	const res = await client.linkTokenCreate({
		user: { client_user_id: 'hitchcox-finance' },
		client_name: 'Hitchcox Aesthetics Finance',
		// In update mode (access_token set) products must be omitted.
		...(accessToken
			? { access_token: accessToken }
			: { products: [Products.Transactions] }),
		transactions: { days_requested: 730 },
		country_codes: [CountryCode.Us],
		language: 'en',
		...(REDIRECT_URI ? { redirect_uri: REDIRECT_URI } : {}),
	})
	return res.data.link_token
}

async function exchange(publicToken: string) {
	const ex = await client.itemPublicTokenExchange({ public_token: publicToken })
	const accessToken = ex.data.access_token
	const itemId = ex.data.item_id
	let institutionName = 'Unknown institution'
	try {
		const item = await client.itemGet({ access_token: accessToken })
		const instId = item.data.item.institution_id
		if (instId) {
			const inst = await client.institutionsGetById({
				institution_id: instId,
				country_codes: [CountryCode.Us],
			})
			institutionName = inst.data.institution.name
		}
	} catch {
		// institution name is best-effort
	}
	saveItem({
		itemId,
		accessToken,
		institutionName,
		connectedAt: new Date().toISOString(),
		env: ENV,
		...(OWNER ? { owner: OWNER } : {}),
	})
	return OWNER ? `${institutionName} (${OWNER})` : institutionName
}

function page(linkToken: string, isOauth: boolean, updating?: string) {
	return `<!doctype html><html><head><meta charset="utf-8"><title>Connect bank</title>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<style>body{font-family:system-ui;margin:3rem auto;max-width:32rem;text-align:center}button{font-size:1.1rem;padding:.8rem 1.4rem;border-radius:8px;border:0;background:#111;color:#fff;cursor:pointer}#msg{margin-top:1.5rem;white-space:pre-wrap}</style>
</head><body>
<h2>${updating ? `Update ${updating}` : 'Connect a bank account'}</h2>
<p>You'll log in inside Plaid's secure window. This page never sees your bank credentials.</p>
<button id="go">${updating ? 'Re-authenticate' : 'Connect bank'}</button>
<div id="msg"></div>
<script>
const handler = Plaid.create({
  token: ${JSON.stringify(linkToken)},
  ${isOauth ? 'receivedRedirectUri: window.location.href,' : ''}
  onSuccess: async (public_token, metadata) => {
    ${
			updating
				? `document.getElementById('msg').textContent = 'Updated: ' + ${JSON.stringify(updating)} + '\\n\\nPlaid will now backfill up to 2 years of history (can take a few minutes to a day). Re-run pnpm plaid:expenses later. You can close this tab.';`
				: `document.getElementById('msg').textContent = 'Saving connection for ' + (metadata.institution && metadata.institution.name || 'your bank') + '...';
    const r = await fetch('/exchange', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({public_token})});
    const j = await r.json();
    document.getElementById('msg').textContent = j.ok ? ('Connected: ' + j.institution + '\\n\\nYou can close this tab. Re-run pnpm plaid:link to add another bank, or run pnpm plaid:expenses.') : ('Error: ' + (j.error||'unknown'));`
		}
  },
  onExit: (err) => { if (err) document.getElementById('msg').textContent = 'Exited: ' + JSON.stringify(err); },
});
${isOauth ? 'handler.open();' : "document.getElementById('go').onclick = () => handler.open();"}
</script></body></html>`
}

async function main() {
	if (REMOVE) {
		const item = findStoredItem(REMOVE)
		await client.itemRemove({ access_token: item.accessToken })
		const rest = loadTokens().filter(i => i.itemId !== item.itemId)
		fs.writeFileSync(TOKENS_FILE, JSON.stringify(rest, null, 2))
		console.log(
			`✓ Removed ${item.institutionName}${item.owner ? ` (${item.owner})` : ''}. Reconnect with: pnpm exec tsx scripts/plaid-link.ts${OWNER ? ` --owner ${OWNER}` : ''}`,
		)
		return
	}
	let updating: string | undefined
	let accessToken: string | undefined
	if (UPDATE) {
		const item = findStoredItem(UPDATE)
		updating = OWNER
			? `${item.institutionName} (${OWNER})`
			: item.institutionName
		accessToken = item.accessToken
	}
	const linkToken = await createLinkToken(accessToken)
	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
		if (url.pathname === '/' || url.pathname === '/oauth') {
			res.writeHead(200, { 'content-type': 'text/html' })
			res.end(page(linkToken, url.pathname === '/oauth', updating))
			return
		}
		if (url.pathname === '/exchange' && req.method === 'POST') {
			let body = ''
			req.on('data', chunk => (body += chunk))
			req.on('end', async () => {
				try {
					const { public_token } = JSON.parse(body) as { public_token: string }
					const institution = await exchange(public_token)
					console.log(`✓ Connected ${institution} (saved to ${TOKENS_FILE})`)
					res.writeHead(200, { 'content-type': 'application/json' })
					res.end(JSON.stringify({ ok: true, institution }))
				} catch (error) {
					res.writeHead(500, { 'content-type': 'application/json' })
					res.end(
						JSON.stringify({
							ok: false,
							error: error instanceof Error ? error.message : String(error),
						}),
					)
				}
			})
			return
		}
		res.writeHead(404)
		res.end()
	})
	server.listen(PORT, () => {
		const link = `http://localhost:${PORT}`
		console.log(`Plaid Link (${ENV}) running at ${link}`)
		console.log('Opening your browser. Connect your bank, then close the tab.')
		console.log('Press Ctrl+C when done.')
		exec(`open ${link}`)
	})
}

main().catch(error => {
	// Plaid errors carry the useful details (error_code/error_message) in the
	// response body, not the axios message.
	const plaidBody = (error as any)?.response?.data
	if (plaidBody) console.error('Plaid error:', JSON.stringify(plaidBody, null, 2))
	else console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
