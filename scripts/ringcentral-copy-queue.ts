/**
 * Copies one RingCentral call queue's members and call handling onto another
 * queue, with its own overflow number (the brand's Retell agent). Use it after
 * a new brand's queue and numbers exist; creating a queue or buying numbers
 * needs the EditAccounts scope, which this app does not have, so those two
 * steps are done in the RingCentral admin portal.
 *
 * Dry run by default (prints what it would change). Pass --apply to write.
 *
 *   pnpm tsx scripts/ringcentral-copy-queue.ts --from=4 --to=6 --forward=+18656068139
 *   pnpm tsx scripts/ringcentral-copy-queue.ts --from=4 --to=6 --forward=+18656068139 --apply
 *
 * --from / --to are queue extension numbers (4 = Botox Knox). --forward is
 * where calls go when no one answers before the hold time runs out.
 */
import 'dotenv/config'

const server = (process.env.RING_CENTRAL_APP_SERVER_URL || '').replace(/\/$/, '')

function flag(name: string) {
	const prefix = `--${name}=`
	return process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length)
}

const FROM = flag('from') ?? ''
const TO = flag('to') ?? ''
const FORWARD = (flag('forward') ?? '').trim()
const APPLY = process.argv.includes('--apply')

async function getToken() {
	const res = await fetch(`${server}/restapi/oauth/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${process.env.RING_CENTRAL_CLIENT_ID}:${process.env.RING_CENTRAL_CLIENT_SECRET}`).toString('base64')}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: process.env.RING_CENTRAL_JWT || '',
		}),
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`auth ${res.status}: ${JSON.stringify(json)}`)
	return json.access_token as string
}

async function rc(token: string, method: string, path: string, body?: unknown) {
	const res = await fetch(`${server}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${json.message ?? JSON.stringify(json).slice(0, 300)}`)
	return json
}

async function main() {
	if (!FROM || !TO) throw new Error('Pass --from=<queue ext> --to=<queue ext>.')
	if (!/^\+1\d{10}$/.test(FORWARD)) throw new Error('Pass --forward=+1XXXXXXXXXX (the Retell number).')

	const token = await getToken()
	const queues = (await rc(token, 'GET', '/restapi/v1.0/account/~/call-queues?perPage=100')).records as any[]
	const from = queues.find(q => q.extensionNumber === FROM)
	const to = queues.find(q => q.extensionNumber === TO)
	if (!from) throw new Error(`No queue with extension ${FROM}.`)
	if (!to) throw new Error(`No queue with extension ${TO}. Create it in the RingCentral admin portal first.`)

	const fromMembers = (await rc(token, 'GET', `/restapi/v1.0/account/~/call-queues/${from.id}/members`)).records as any[]
	const toMembers = (await rc(token, 'GET', `/restapi/v1.0/account/~/call-queues/${to.id}/members`)).records as any[]
	const addIds = fromMembers.map(m => String(m.id)).filter(id => !toMembers.some(m => String(m.id) === id))

	const fromRule = await rc(token, 'GET', `/restapi/v1.0/account/~/extension/${from.id}/answering-rule/business-hours-rule`)
	const q = fromRule.queue ?? {}
	const rule = {
		callHandlingAction: 'AgentQueue',
		queue: {
			transferMode: q.transferMode,
			holdAudioInterruptionMode: q.holdAudioInterruptionMode,
			agentTimeout: q.agentTimeout,
			wrapUpTime: q.wrapUpTime,
			holdTime: q.holdTime,
			maxCallers: q.maxCallers,
			maxCallersAction: q.maxCallersAction,
			holdTimeExpirationAction: 'UnconditionalForwarding',
			noAnswerAction: q.noAnswerAction,
			unconditionalForwarding: [{ phoneNumber: FORWARD, action: 'HoldTimeExpiration' }],
		},
	}

	console.log(`from: queue ${from.extensionNumber} ${from.name} (members: ${fromMembers.map(m => m.name ?? m.extensionNumber).join(', ')})`)
	console.log(`to:   queue ${to.extensionNumber} ${to.name} (members now: ${toMembers.map(m => m.name ?? m.extensionNumber).join(', ') || 'none'})`)
	console.log(`add members: ${addIds.length ? addIds.join(', ') : 'none'}`)
	console.log('call handling:', JSON.stringify(rule, null, 2))

	if (!APPLY) {
		console.log('\nDRY RUN: nothing changed. Re-run with --apply to write.')
		return
	}
	if (addIds.length) {
		await rc(token, 'POST', `/restapi/v1.0/account/~/call-queues/${to.id}/bulk-assign`, { addedExtensionIds: addIds })
		console.log('✓ members added')
	}
	await rc(token, 'PUT', `/restapi/v1.0/account/~/extension/${to.id}/answering-rule/business-hours-rule`, rule)
	console.log(`✓ call handling copied; overflow goes to ${FORWARD}`)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
