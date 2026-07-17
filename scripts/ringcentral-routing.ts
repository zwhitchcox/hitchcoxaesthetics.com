/**
 * RingCentral read-only routing map. Shows, for each phone number, where it is
 * assigned, and for each call queue, its members and call-handling (where it
 * forwards — e.g. to a Retell number). Use this to see how the existing
 * locations are wired before replicating for a new location. Writes nothing.
 *
 *   pnpm tsx scripts/ringcentral-routing.ts
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

	const nums = await get(token, '/restapi/v1.0/account/~/phone-number?perPage=100')
	console.log('=== PHONE NUMBERS → assignment ===')
	for (const n of (nums as any).records ?? []) {
		const ext = n.extension
			? `ext ${n.extension.extensionNumber} ${n.extension.name ?? ''}`
			: '(company-level / auto-receptionist or unassigned)'
		console.log(`  ${n.phoneNumber} | ${n.usageType} | ${ext}`)
	}

	const queues = await get(token, '/restapi/v1.0/account/~/call-queues?perPage=100')
	for (const q of (queues as any).records ?? []) {
		console.log(`\n=== QUEUE ${q.extensionNumber} — ${q.name} (id ${q.id}) ===`)
		const members = await get(token, `/restapi/v1.0/account/~/call-queues/${q.id}/members`)
		console.log(
			'  members:',
			(members as any).records?.map((m: any) => m.name || m.extensionNumber).join(', ') ??
				(members as any).error ??
				'-',
		)
		const rule = await get(
			token,
			`/restapi/v1.0/account/~/extension/${q.id}/answering-rule/business-hours-rule`,
		)
		if ((rule as any).error) {
			console.log('  call handling:', (rule as any).error)
			continue
		}
		const r = rule as any
		console.log('  callHandlingAction:', r.callHandlingAction)
		if (r.queue) console.log('  queue settings:', JSON.stringify(r.queue))
		if (r.transfer) console.log('  transfer:', JSON.stringify(r.transfer))
		if (r.unconditionalForwarding)
			console.log('  unconditionalForwarding:', JSON.stringify(r.unconditionalForwarding))
		if (r.forwarding) console.log('  forwarding:', JSON.stringify(r.forwarding).slice(0, 400))
		if (r.voicemail) console.log('  voicemail:', JSON.stringify(r.voicemail).slice(0, 160))
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
