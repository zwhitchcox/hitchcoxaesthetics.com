/**
 * Read-only: pull recent inbound SMS from the RingCentral message store across
 * the main extensions (a number on a call queue doesn't show SMS in the normal
 * inbox, so the API is the only way to see it). Prints sender + text.
 *
 *   pnpm tsx scripts/ringcentral-sms.ts
 */
import 'dotenv/config'

const server = (process.env.RING_CENTRAL_APP_SERVER_URL || '').replace(/\/$/, '')
const clientId = process.env.RING_CENTRAL_CLIENT_ID || ''
const clientSecret = process.env.RING_CENTRAL_CLIENT_SECRET || ''
const jwt = process.env.RING_CENTRAL_JWT || ''

async function getToken() {
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
	if (!res.ok) throw new Error(`auth ${res.status}: ${JSON.stringify(json)}`)
	return json.access_token as string
}

async function get(token: string, path: string) {
	const res = await fetch(`${server}${path}`, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) return { error: `${res.status} ${json.message ?? JSON.stringify(json).slice(0, 160)}` }
	return json
}

async function main() {
	const token = await getToken()
	const dateFrom = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
	// ~ = authed extension; 261989053 admin/Zane; 262022053 Sarah; 262105053 SHA queue
	const exts = ['~', '261989053', '262022053', '262105053']
	const seen = new Set<string>()
	const rows: Array<{ time: string; from: string; text: string }> = []
	for (const ext of exts) {
		const res = await get(
			token,
			`/restapi/v1.0/account/~/extension/${ext}/message-store?messageType=SMS&direction=Inbound&dateFrom=${dateFrom}&perPage=25`,
		)
		if ((res as any).error) {
			console.log(`ext ${ext}: ${(res as any).error}`)
			continue
		}
		for (const m of (res as any).records ?? []) {
			const key = `${m.id}`
			if (seen.has(key)) continue
			seen.add(key)
			rows.push({
				time: m.creationTime,
				from: m.from?.phoneNumber ?? '?',
				text: (m.subject ?? '').replace(/\s+/g, ' ').trim(),
			})
		}
	}
	rows.sort((a, b) => (a.time < b.time ? 1 : -1))
	if (rows.length === 0) {
		console.log('No inbound SMS in the last 3 hours on those extensions.')
		return
	}
	console.log(`Recent inbound SMS (newest first):`)
	for (const r of rows.slice(0, 15)) {
		console.log(`  ${r.time} | from ${r.from} | ${r.text}`)
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
