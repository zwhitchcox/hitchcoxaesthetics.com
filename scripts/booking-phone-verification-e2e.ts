/**
 * True end-to-end test of the booking phone verification SMS path.
 *
 * Sends a verification code to a second Twilio number owned by this account,
 * reads the delivered SMS back through the Twilio API, then verifies the
 * extracted code against the server (and confirms reuse is rejected).
 * Defaults to production.
 *
 *   pnpm tsx scripts/booking-phone-verification-e2e.ts
 *   pnpm tsx scripts/booking-phone-verification-e2e.ts --base-url=http://localhost:3000 --phone=+18658138516
 */
import dotenv from 'dotenv'

dotenv.config()

const DEFAULT_BASE_URL = 'https://hitchcoxaesthetics.com'
// A second SMS-capable Twilio number on this account (the sender is
// TWILIO_PHONE_NUMBER, so the receiver must be a different number).
const DEFAULT_PHONE = '+18658138516'
const POLL_ATTEMPTS = 18
const POLL_INTERVAL_MS = 5000

function parseArgs(argv: string[]) {
	const args = { baseUrl: DEFAULT_BASE_URL, phone: DEFAULT_PHONE }
	for (const arg of argv) {
		if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice(11)
		if (arg.startsWith('--phone=')) args.phone = arg.slice(8)
	}
	return args
}

const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
if (!accountSid || !authToken) {
	console.error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required')
	process.exit(1)
}

const { baseUrl, phone } = parseArgs(process.argv.slice(2))
const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

async function postVerification(payload: Record<string, unknown>) {
	const response = await fetch(
		`${baseUrl}/resources/booking-phone-verification`,
		{
			body: JSON.stringify(payload),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		},
	)
	const body = (await response.json().catch(() => null)) as {
		error?: string
		ok?: boolean
	} | null
	return { body, status: response.status }
}

async function findVerificationCodeSince(since: Date) {
	const url = new URL(
		`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
	)
	url.searchParams.set('To', phone)
	url.searchParams.set('PageSize', '10')
	const response = await fetch(url.toString(), {
		headers: { Authorization: `Basic ${twilioAuth}` },
	})
	if (!response.ok) {
		throw new Error(`Twilio Messages query failed: ${response.status}`)
	}
	const data = (await response.json()) as {
		messages?: { body?: string; date_created?: string; status?: string }[]
	}
	for (const message of data.messages ?? []) {
		const body = message.body ?? ''
		const createdAt = new Date(message.date_created ?? 0)
		const match = body.match(/verification code is ([A-Z0-9]{6})/i)
		if (match && createdAt >= since) {
			return { code: match[1]!.toUpperCase(), status: message.status }
		}
	}
	return null
}

console.log(`1. Sending verification code from ${baseUrl} to ${phone}…`)
const sentAt = new Date(Date.now() - 60_000) // clock-skew cushion
const send = await postVerification({ intent: 'send', phone })
if (!send.body?.ok) {
	console.error('Send failed:', send.status, send.body)
	process.exit(1)
}
console.log('   sent.')

console.log('2. Polling Twilio for the delivered SMS…')
let found: { code: string; status?: string } | null = null
for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
	found = await findVerificationCodeSince(sentAt)
	if (found?.status === 'delivered' || (found && attempt > 3)) break
	await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
	console.log(`   attempt ${attempt}/${POLL_ATTEMPTS}…`)
}
if (!found) {
	console.error('Never received the verification SMS')
	process.exit(1)
}
console.log(`   received code ${found.code} (status: ${found.status})`)

console.log('3. Verifying the code…')
const verify = await postVerification({
	code: found.code,
	intent: 'verify',
	phone,
})
if (!verify.body?.ok) {
	console.error('VERIFY FAILED:', verify.status, verify.body)
	process.exit(1)
}
console.log('   verified ✓')

console.log('4. Confirming a reused code is rejected…')
const reuse = await postVerification({
	code: found.code,
	intent: 'verify',
	phone,
})
if (reuse.body?.ok) {
	console.error('Reused code unexpectedly accepted')
	process.exit(1)
}
console.log('   rejected as expected ✓')

console.log('\nEND-TO-END PASS: send → SMS delivered → verify → reuse rejected')
