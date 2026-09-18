import twilio from 'twilio'

export type SendSMSResult =
	| { status: 'success' }
	| { status: 'error'; error: string; code?: number }

/** Twilio codes that will fail again however often the text is sent. */
const PERMANENT_SMS_ERROR_CODES = new Set([
	21211, // not a valid phone number
	21610, // the recipient replied STOP
	21614, // not a mobile number
])

/** True when a retry cannot work, for example the recipient replied STOP. */
export function isPermanentSMSError(result: SendSMSResult) {
	return (
		result.status === 'error' &&
		result.code !== undefined &&
		PERMANENT_SMS_ERROR_CODES.has(result.code)
	)
}

/**
 * Send one text. Never throws: Twilio rejects with an exception (a STOP reply,
 * a bad number), and one bad recipient must not stop the job that called this.
 */
export async function sendSMS({
	body,
	to,
}: {
	body: string
	to: string
}): Promise<SendSMSResult> {
	const normalizedTo = to.trim().startsWith('+')
		? to.trim()
		: `+${to.replace(/\D/g, '')}`
	if (process.env.NODE_ENV !== 'production') {
		console.log('SMS:', body, normalizedTo)
		return { status: 'success' }
	}

	try {
		const client = twilio(
			process.env.TWILIO_ACCOUNT_SID,
			process.env.TWILIO_AUTH_TOKEN,
		)
		const response = await client.messages.create({
			body: body,
			from: process.env.TWILIO_PHONE_NUMBER,
			to: normalizedTo,
		})
		if (!response.errorMessage) return { status: 'success' }
		return {
			status: 'error',
			error: response.errorMessage,
			code: response.errorCode ?? undefined,
		}
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? Number((error as { code: unknown }).code)
				: NaN
		return {
			status: 'error',
			error: error instanceof Error ? error.message : String(error),
			...(Number.isFinite(code) ? { code } : {}),
		}
	}
}
