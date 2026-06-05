import { createHash } from 'node:crypto'

import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'

import {
	isCodeValid,
	prepareVerification,
} from '#/app/routes/_auth+/verify.server.ts'
import { isExcludedBookingAnalyticsIdentity } from '#app/utils/analytics-exclusions.ts'
import { prisma } from '#app/utils/db.server.ts'
import { captureServerPostHogEvent } from '#app/utils/posthog.server.ts'
import { sendSMS } from '#app/utils/sms.server.ts'

const BOOKING_PHONE_VERIFICATION_TYPE = 'booking-phone'
const BOOKING_PHONE_VERIFICATION_PERIOD_SECONDS = 10 * 60

const bookingPhoneVerificationSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('send'),
		phone: z.string().min(10),
	}),
	z.object({
		code: z.string().min(6).max(6),
		intent: z.literal('verify'),
		phone: z.string().min(10),
	}),
])

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'Method not allowed', ok: false }, { status: 405 })
	}

	try {
		const payload = bookingPhoneVerificationSchema.parse(await request.json())
		const phone = normalizePhoneNumber(payload.phone)

		if (payload.intent === 'send') {
			const { otp } = await prepareVerification({
				period: BOOKING_PHONE_VERIFICATION_PERIOD_SECONDS,
				request,
				target: phone,
				type: BOOKING_PHONE_VERIFICATION_TYPE,
			})
			const response = await sendSMS({
				body: `Your Sarah Hitchcox Aesthetics verification code is ${otp}`,
				to: phone,
			})

			if (response.status !== 'success') {
				await captureBookingPhoneVerificationError({
					action: 'send',
					error: response.error ?? 'SMS delivery failed',
					phone,
				})
				return json(
					{
						error:
							'We could not send that code. Please check the number and try again.',
						ok: false,
					},
					{ status: 502 },
				)
			}

			return json({
				debugCode: process.env.NODE_ENV === 'production' ? undefined : otp,
				ok: true,
			})
		}

		const isValid = await isCodeValid({
			code: payload.code,
			target: phone,
			type: BOOKING_PHONE_VERIFICATION_TYPE,
		})

		if (!isValid) {
			return json(
				{
					error: 'That verification code was not valid. Please try again.',
					ok: false,
				},
				{ status: 400 },
			)
		}

		await prisma.verification.deleteMany({
			where: {
				target: phone,
				type: BOOKING_PHONE_VERIFICATION_TYPE,
			},
		})

		return json({ ok: true })
	} catch (error) {
		let phone: string | null = null
		try {
			const payload = await request.clone().json()
			if (payload && typeof payload === 'object' && 'phone' in payload) {
				phone = normalizePhoneNumber(String(payload.phone))
			}
		} catch {
			// Ignore malformed payload extraction.
		}

		await captureBookingPhoneVerificationError({
			action: 'unknown',
			error,
			phone,
		})
		return json(
			{
				error: 'We could not verify that number right now. Please try again.',
				ok: false,
			},
			{ status: 400 },
		)
	}
}

async function captureBookingPhoneVerificationError({
	action,
	error,
	phone,
}: {
	action: string
	error: unknown
	phone: string | null
}) {
	if (isExcludedBookingAnalyticsIdentity({ phone })) return

	await captureServerPostHogEvent({
		distinctId: phone
			? `booking-phone:${hashValue(phone)}`
			: 'booking-phone:unknown',
		event: 'booking_error',
		insertId: `booking-phone-verification:${action}:${Date.now()}:${Math.random()
			.toString(36)
			.slice(2)}`,
		properties: {
			booking_error_action: action,
			booking_error_area: 'phone_verification',
			booking_error_message: getErrorMessage(error),
			booking_error_source: 'server',
			booking_phone_last4: phone ? phone.slice(-4) : undefined,
			booking_step: 'details',
		},
	})
}

function normalizePhoneNumber(value: string) {
	const digits = value.replace(/\D/g, '')
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (value.trim().startsWith('+')) return value.trim()
	return `+${digits}`
}

function hashValue(value: string) {
	return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	return 'Unknown error'
}
