import { renderAsync } from '@react-email/components'
import { type ReactElement } from 'react'
import { z } from 'zod'

const resendErrorSchema = z.union([
	z.object({
		name: z.string(),
		message: z.string(),
		statusCode: z.number(),
	}),
	z.object({
		name: z.literal('UnknownError'),
		message: z.literal('Unknown Error'),
		statusCode: z.literal(500),
		cause: z.any(),
	}),
])
type ResendError = z.infer<typeof resendErrorSchema>

const resendSuccessSchema = z.object({
	id: z.string(),
})

export async function sendEmail({
	from = 'hello@hitchcoxaesthetics.com',
	react,
	replyTo,
	attachments,
	...options
}: {
	from?: string
	to: string
	subject: string
	/** Where a reply to this mail goes (Resend `reply_to`), e.g. the applicant on the careers form. */
	replyTo?: string
	/** Files to attach; `content` is base64. Resend caps a mail at 40 MB. */
	attachments?: Array<{ filename: string; content: string }>
} & (
	| { html: string; text: string; react?: never }
	| { react: ReactElement; html?: never; text?: never }
)) {
	const email = {
		from,
		...options,
		...(replyTo ? { reply_to: replyTo } : null),
		...(attachments?.length ? { attachments } : null),
		...(react ? await renderReactEmail(react) : null),
	}

	if (!process.env.RESEND_API_KEY?.trim() && process.env.MOCKS !== 'true') {
		return {
			status: 'error',
			error: {
				name: 'MissingResendApiKey',
				message: 'RESEND_API_KEY is not set.',
				statusCode: 500,
			},
		} as const
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		body: JSON.stringify(email),
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
	})
	const data = await response.json()
	const parsedData = resendSuccessSchema.safeParse(data)

	if (response.ok && parsedData.success) {
		return {
			status: 'success',
			data: parsedData.data,
		} as const
	} else {
		const parseResult = resendErrorSchema.safeParse(data)
		if (parseResult.success) {
			return {
				status: 'error',
				error: parseResult.data,
			} as const
		} else {
			return {
				status: 'error',
				error: {
					name: 'UnknownError',
					message: 'Unknown Error',
					statusCode: 500,
					cause: data,
				} satisfies ResendError,
			} as const
		}
	}
}

async function renderReactEmail(react: ReactElement) {
	const [html, text] = await Promise.all([
		renderAsync(react),
		renderAsync(react, { plainText: true }),
	])
	return { html, text }
}
