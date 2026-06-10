/**
 * True end-to-end test of the returning-client (Boulevard) verification path.
 *
 * Ensures a Boulevard test client exists whose mobile phone is a Twilio
 * number we own, creates a real cart, has Boulevard text its ownership code
 * to that number, reads the SMS back through the Twilio API, and takes cart
 * ownership with the code — exercising the same takeOwnershipByCode(Int)
 * call the /book flow uses for returning customers.
 *
 *   pnpm tsx scripts/booking-blvd-ownership-e2e.ts
 */
import dotenv from 'dotenv'

dotenv.config()

const { findAdminClientByPhone } = await import(
	'#app/utils/blvd-voice-booking.server.ts'
)
const { boulevardAdminFetch } = await import('#app/utils/blvd-admin.server.ts')

// A second SMS-capable Twilio number on this account (reserved for e2e tests)
const TEST_PHONE = '+18658138516'
const POLL_ATTEMPTS = 18
const POLL_INTERVAL_MS = 5000

const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
if (!accountSid || !authToken) {
	console.error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required')
	process.exit(1)
}
const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

async function findOwnershipCodeSince(since: Date) {
	const url = new URL(
		`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
	)
	url.searchParams.set('To', TEST_PHONE)
	url.searchParams.set('PageSize', '10')
	const response = await fetch(url.toString(), {
		headers: { Authorization: `Basic ${twilioAuth}` },
	})
	if (!response.ok) {
		throw new Error(`Twilio Messages query failed: ${response.status}`)
	}
	const data = (await response.json()) as {
		messages?: { body?: string; date_created?: string; from?: string }[]
	}
	for (const message of data.messages ?? []) {
		const body = message.body ?? ''
		const createdAt = new Date(message.date_created ?? 0)
		// Boulevard ownership codes are 6-digit numbers
		const match = body.match(/\b(\d{6})\b/)
		if (match && createdAt >= since) {
			return { body, code: match[1]! }
		}
	}
	return null
}

console.log('1. Ensuring a Boulevard test client exists for', TEST_PHONE, '…')
let client = await findAdminClientByPhone(TEST_PHONE)
if (!client) {
	const created = await boulevardAdminFetch<{
		createClient: { client: { id: string } }
	}>(
		`mutation createClient($input: CreateClientInput!) {
			createClient(input: $input) {
				client { id }
			}
		}`,
		{
			input: {
				firstName: 'Automated',
				lastName: 'E2E Test',
				mobilePhone: TEST_PHONE,
			},
		},
	)
	console.log('   created test client', created.createClient.client.id)
	client = await findAdminClientByPhone(TEST_PHONE)
} else {
	console.log('   found existing client', client.id)
}
if (!client) {
	console.error('Could not find or create the Boulevard test client')
	process.exit(1)
}

console.log('2. Creating a cart and requesting the ownership code…')
const { Blvd, PlatformTarget } = await import('@boulevard/blvd-book-sdk')
const apiKey = process.env.BLVD_API_KEY!.trim()
const businessId = process.env.BLVD_BUSINESS_ID!.trim()
const blvd = new Blvd(apiKey, businessId, PlatformTarget.Live)
const cart = await blvd.carts.create()

const sentAt = new Date(Date.now() - 60_000) // clock-skew cushion
const codeId = await cart.sendOwnershipCodeBySms(TEST_PHONE)
console.log('   Boulevard accepted the send (codeId:', codeId, ')')

console.log('3. Polling Twilio for Boulevard’s SMS…')
let found: { body: string; code: string } | null = null
for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
	found = await findOwnershipCodeSince(sentAt)
	if (found) break
	await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
	console.log(`   attempt ${attempt}/${POLL_ATTEMPTS}…`)
}
if (!found) {
	console.error('Never received the Boulevard ownership SMS')
	process.exit(1)
}
console.log(`   received code ${found.code} ("${found.body.slice(0, 60)}…")`)

console.log('4. Taking cart ownership with the numeric code…')
const nextCart = await cart.takeOwnershipByCode(codeId, Number(found.code))
const info = (nextCart as unknown as { clientInformation?: { firstName?: string; lastName?: string } })
	.clientInformation
console.log(
	'   ownership taken ✓ client on cart:',
	info?.firstName,
	info?.lastName,
)

console.log(
	'\nEND-TO-END PASS: returning-client path — Boulevard code sent → SMS received → takeOwnershipByCode(Int) accepted',
)
