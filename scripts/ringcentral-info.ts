/**
 * RingCentral read-only probe. Authenticates with the JWT-bearer flow and lists
 * the account, extensions, call queues, and phone numbers, plus the scopes the
 * token actually carries. Use this to see what the account allows BEFORE trying
 * to provision/route a number (ordering a DID needs the Edit Accounts scope and
 * is billable — this script never writes anything).
 *
 *   pnpm tsx scripts/ringcentral-info.ts
 *
 * Requires in .env:
 *   RING_CENTRAL_APP_SERVER_URL   (e.g. https://platform.ringcentral.com)
 *   RING_CENTRAL_CLIENT_ID
 *   RING_CENTRAL_CLIENT_SECRET
 *   RING_CENTRAL_JWT              <-- the ONE thing the "credentials" download does NOT contain.
 *                                    Create it at https://developers.ringcentral.com →
 *                                    your profile (top-right) → Credentials → Create JWT,
 *                                    scoped to this app + production. Copy the eyJ... string.
 */
import 'dotenv/config'

const server = (process.env.RING_CENTRAL_APP_SERVER_URL || '').replace(/\/$/, '')
const clientId = process.env.RING_CENTRAL_CLIENT_ID || ''
const clientSecret = process.env.RING_CENTRAL_CLIENT_SECRET || ''
const jwt = process.env.RING_CENTRAL_JWT || ''

function requireEnv() {
	const missing: string[] = []
	if (!server) missing.push('RING_CENTRAL_APP_SERVER_URL')
	if (!clientId) missing.push('RING_CENTRAL_CLIENT_ID')
	if (!clientSecret) missing.push('RING_CENTRAL_CLIENT_SECRET')
	if (!jwt) missing.push('RING_CENTRAL_JWT')
	if (missing.length) {
		throw new Error(
			`Missing ${missing.join(', ')}.\n` +
				(missing.includes('RING_CENTRAL_JWT')
					? 'RING_CENTRAL_JWT is the JWT-bearer credential. The "RingCentral Account Credentials.json"\n' +
						'download does NOT contain it. Create one at https://developers.ringcentral.com →\n' +
						'profile menu (top-right) → Credentials → Create JWT (scope it to this app + Production),\n' +
						'then paste the eyJ... string as RING_CENTRAL_JWT in .env.'
					: ''),
		)
	}
}

async function getAccessToken() {
	const res = await fetch(`${server}/restapi/oauth/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: jwt,
		}),
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) {
		throw new Error(
			`auth ${res.status}: ${json.error ?? ''} ${json.error_description ?? JSON.stringify(json)}`,
		)
	}
	return json as { access_token: string; scope?: string; owner_id?: string }
}

async function get(token: string, path: string) {
	const res = await fetch(`${server}${path}`, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) {
		return { error: `${res.status} ${json.message ?? JSON.stringify(json).slice(0, 200)}` }
	}
	return json
}

async function main() {
	requireEnv()
	const tok = await getAccessToken()
	console.log('✓ authenticated')
	console.log('  scopes:', tok.scope ?? '(none reported)')
	const canEditAccounts = (tok.scope ?? '').includes('EditAccounts')
	console.log(
		`  number provisioning (EditAccounts scope): ${canEditAccounts ? 'present' : 'NOT granted — DID ordering via API will 403; use the admin portal'}`,
	)

	const account = await get(tok.access_token, '/restapi/v1.0/account/~')
	console.log('\nACCOUNT:', account.error ?? `${account.mainNumber} | ${account.status}`)

	const numbers = await get(tok.access_token, '/restapi/v1.0/account/~/phone-number?perPage=100')
	if (numbers.error) console.log('PHONE NUMBERS:', numbers.error)
	else {
		console.log(`\nPHONE NUMBERS (${numbers.records?.length ?? 0}):`)
		for (const n of numbers.records ?? [])
			console.log(`  ${n.phoneNumber} | ${n.usageType} | ${n.type} | ${n.extension?.name ?? '-'}`)
	}

	const queues = await get(tok.access_token, '/restapi/v1.0/account/~/call-queues?perPage=100')
	if (queues.error) console.log('\nCALL QUEUES:', queues.error)
	else {
		console.log(`\nCALL QUEUES (${queues.records?.length ?? 0}):`)
		for (const q of queues.records ?? [])
			console.log(`  ${q.extensionNumber} | ${q.name}`)
	}

	const ext = await get(
		tok.access_token,
		'/restapi/v1.0/account/~/extension?perPage=100&type=User',
	)
	if (ext.error) console.log('\nEXTENSIONS:', ext.error)
	else {
		console.log(`\nUSER EXTENSIONS (${ext.records?.length ?? 0}):`)
		for (const e of ext.records ?? [])
			console.log(`  ${e.extensionNumber} | ${e.name} | ${e.status}`)
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
