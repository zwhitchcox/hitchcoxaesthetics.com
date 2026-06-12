import { type BookingClientHistory } from '#app/utils/blvd-service-display.ts'
import { getErrorMessage } from '#app/utils/misc.tsx'

type RequestBookingMobileVerificationCodeInput = {
	clientHistory: BookingClientHistory | null
	normalizedPhone: string
	requestBlvdOwnershipCode: (phone: string) => Promise<string>
	requestBookingPhoneVerificationCode: (phone: string) => Promise<void>
}

export type BookingMobileVerificationCodeResult =
	| {
			codeId: string
			type: 'blvd_ownership_code'
	  }
	| {
			fallbackReason?: 'client_not_found'
			type: 'booking_phone_code'
	  }
	| {
			action:
				| 'send_mobile_verification_code'
				| 'send_new_client_mobile_verification_code'
			error: unknown
			message: string
			type: 'error'
	  }

export async function requestBookingMobileVerificationCode({
	clientHistory,
	normalizedPhone,
	requestBlvdOwnershipCode,
	requestBookingPhoneVerificationCode,
}: RequestBookingMobileVerificationCodeInput): Promise<BookingMobileVerificationCodeResult> {
	if (clientHistory === 'new') {
		try {
			await requestBookingPhoneVerificationCode(normalizedPhone)
			return { type: 'booking_phone_code' }
		} catch (error) {
			return {
				action: 'send_new_client_mobile_verification_code',
				error,
				message:
					'We could not send that code. Please check the number and try again.',
				type: 'error',
			}
		}
	}

	try {
		const codeId = await requestBlvdOwnershipCode(normalizedPhone)
		return { codeId, type: 'blvd_ownership_code' }
	} catch (error) {
		if (
			isBlvdClientNotFoundByMobilePhoneError(error) &&
			shouldVerifyPhoneAsNewClient(clientHistory)
		) {
			try {
				await requestBookingPhoneVerificationCode(normalizedPhone)
				return {
					fallbackReason: 'client_not_found',
					type: 'booking_phone_code',
				}
			} catch (fallbackError) {
				return {
					action: 'send_new_client_mobile_verification_code',
					error: fallbackError,
					message:
						'We could not send that code. Please check the number and try again.',
					type: 'error',
				}
			}
		}

		return {
			action: 'send_mobile_verification_code',
			error,
			message: getOwnershipCodeUserMessage(error, clientHistory),
			type: 'error',
		}
	}
}

export function shouldVerifyPhoneAsNewClient(
	clientHistory: BookingClientHistory | null,
) {
	return clientHistory !== 'returning'
}

export function isBlvdClientNotFoundByMobilePhoneError(error: unknown) {
	const details = getBookingVerificationErrorDetails(error)
	return (
		details.code === 'CLIENT_NOT_FOUND_BY_MOBILE_PHONE' ||
		details.technicalMessage.includes('CLIENT_NOT_FOUND_BY_MOBILE_PHONE')
	)
}

export function getOwnershipCodeUserMessage(
	error: unknown,
	clientHistory: BookingClientHistory | null,
) {
	if (isBlvdClientNotFoundByMobilePhoneError(error)) {
		if (clientHistory === 'returning') {
			return 'We could not find a returning profile for that mobile number. Please check the number or continue as a new client.'
		}

		return 'We will verify this number for a new client booking.'
	}

	return 'We could not send that code. Please check the number and try again.'
}

function getBookingVerificationErrorDetails(error: unknown) {
	const message = getErrorMessage(error)
	const technicalMessage = redactSensitiveBookingErrorText(message)
	const code = extractBoulevardErrorCode(message)

	return {
		code,
		technicalMessage,
	}
}

function extractBoulevardErrorCode(value: string) {
	const codeMatch =
		value.match(/"code"\s*:\s*"([^"]+)"/) ??
		value.match(/\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,})\b/)
	return codeMatch?.[1] ?? null
}

function redactSensitiveBookingErrorText(value: string) {
	return value
		.replace(/\+?1?\d[\d\s().-]{8,}\d/g, '[phone]')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
		.replace(/\s+/g, ' ')
		.slice(0, 1000)
}
