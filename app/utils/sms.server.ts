import twilio from 'twilio'

export async function sendSMS({ body, to }: { body: string; to: string }) {
	const client = twilio(
		process.env.TWILIO_ACCOUNT_SID,
		process.env.TWILIO_AUTH_TOKEN,
	)
	if (process.env.NODE_ENV !== 'production') {
		console.log('SMS:', body, to)
		return { status: 'success' }
	}

	const response = await client.messages.create({
		body: body,
		from: process.env.TWILIO_PHONE_NUMBER,
		to: '+' + to,
	})
	if (!response.errorMessage) {
		return { status: 'success' }
	}
	return { status: 'error', error: response.errorMessage }
}
