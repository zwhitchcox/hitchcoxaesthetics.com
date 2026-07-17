/**
 * Boulevard webhook receiver. Registered via scripts/blvd-register-webhook.ts
 * for APPOINTMENT_COMPLETED so the provider's review-reminder text fires the
 * moment a client is checked out, instead of waiting on the 10-minute poll
 * (which stays on as the safety net).
 *
 * Security model: the payload is never trusted. We take the appointment id
 * and re-fetch it from the Boulevard Admin API; the text only sends if
 * Boulevard itself says the appointment is checked out, and the ledger
 * dedupes retries/replays. Signature verification (HMAC of the raw body with
 * BLVD_SECRET_KEY) is attempted and logged so we can hard-enforce once the
 * header Boulevard sends is confirmed in prod logs.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import { sendReviewReminderForAppointment } from '#app/utils/review-reminder-sms.server.ts'

const SIGNATURE_HEADERS = [
	'x-boulevard-signature',
	'x-blvd-signature',
	'x-signature',
	'x-webhook-signature',
]

function verifySignature(rawBody: string, request: Request): string {
	const secret = process.env.BLVD_SECRET_KEY?.trim()
	if (!secret) return 'no-secret'
	const digests = [
		createHmac('sha256', Buffer.from(secret, 'base64')).update(rawBody).digest('hex'),
		createHmac('sha256', Buffer.from(secret, 'base64')).update(rawBody).digest('base64'),
		createHmac('sha256', secret).update(rawBody).digest('hex'),
		createHmac('sha256', secret).update(rawBody).digest('base64'),
	]
	for (const header of SIGNATURE_HEADERS) {
		const provided = request.headers.get(header)
		if (!provided) continue
		for (const digest of digests) {
			const a = Buffer.from(provided)
			const b = Buffer.from(digest)
			if (a.length === b.length && timingSafeEqual(a, b)) return `ok:${header}`
		}
		return `mismatch:${header}`
	}
	return 'no-signature-header'
}

export async function action({ request }: ActionFunctionArgs) {
	// The reminder ledger writes to SQLite — pin to the litefs primary.
	await ensurePrimary()
	const rawBody = await request.text()
	const signature = verifySignature(rawBody, request)

	let body: any = null
	try {
		body = JSON.parse(rawBody)
	} catch {
		return json({ ok: false, error: 'invalid json' }, { status: 400 })
	}

	const eventType: string = String(
		body?.eventType ?? body?.event ?? body?.type ?? '',
	).toUpperCase()
	const appointmentId: string | null =
		body?.node?.id ?? body?.data?.node?.id ?? body?.appointmentId ?? null
	console.log(
		`Boulevard webhook: event=${eventType || `(keys: ${Object.keys(body ?? {}).join(',')})`} id=${appointmentId ?? '-'} signature=${signature}`,
	)
	if (eventType.includes('PING')) return json({ ok: true, pong: true })
	if (!eventType.includes('APPOINTMENT') || !appointmentId)
		return json({ ok: true, ignored: true })

	try {
		const result = await sendReviewReminderForAppointment(String(appointmentId))
		if (result.sent > 0)
			console.log(
				`Review reminder sent via webhook for ${appointmentId} (signature: ${signature})`,
			)
		return json({ ok: true, sent: result.sent })
	} catch (error) {
		console.error('Boulevard webhook reminder failed:', error)
		return json({ ok: false }, { status: 500 })
	}
}
