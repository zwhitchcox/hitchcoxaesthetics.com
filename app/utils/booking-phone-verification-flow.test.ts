import { expect, test, vi } from 'vitest'

import {
	requestBookingMobileVerificationCode,
	shouldVerifyPhoneAsNewClient,
} from '#app/utils/booking-phone-verification-flow.ts'

const clientNotFoundError = new Error(
	JSON.stringify({
		errors: [
			{
				code: 'CLIENT_NOT_FOUND_BY_MOBILE_PHONE',
				message: 'Unable to find client for mobile phone.',
			},
		],
	}),
)

test('uses internal phone verification when Boulevard cannot find a new client by phone', async () => {
	const requestBlvdOwnershipCode = vi.fn(async () => {
		throw clientNotFoundError
	})
	const requestBookingPhoneVerificationCode = vi.fn(async () => {})

	const result = await requestBookingMobileVerificationCode({
		clientHistory: null,
		normalizedPhone: '+18659780953',
		requestBlvdOwnershipCode,
		requestBookingPhoneVerificationCode,
	})

	expect(result).toEqual({
		fallbackReason: 'client_not_found',
		type: 'booking_phone_code',
	})
	expect(requestBlvdOwnershipCode).toHaveBeenCalledWith('+18659780953')
	expect(requestBookingPhoneVerificationCode).toHaveBeenCalledWith(
		'+18659780953',
	)
})

test('skips Boulevard lookup for explicit new clients', async () => {
	const requestBlvdOwnershipCode = vi.fn(async () => 'blvd-code')
	const requestBookingPhoneVerificationCode = vi.fn(async () => {})

	const result = await requestBookingMobileVerificationCode({
		clientHistory: 'new',
		normalizedPhone: '+18659780953',
		requestBlvdOwnershipCode,
		requestBookingPhoneVerificationCode,
	})

	expect(result).toEqual({ type: 'booking_phone_code' })
	expect(requestBlvdOwnershipCode).not.toHaveBeenCalled()
	expect(requestBookingPhoneVerificationCode).toHaveBeenCalledWith(
		'+18659780953',
	)
})

test('keeps client-not-found as a returning-client correction', async () => {
	const requestBlvdOwnershipCode = vi.fn(async () => {
		throw clientNotFoundError
	})
	const requestBookingPhoneVerificationCode = vi.fn(async () => {})

	const result = await requestBookingMobileVerificationCode({
		clientHistory: 'returning',
		normalizedPhone: '+18659780953',
		requestBlvdOwnershipCode,
		requestBookingPhoneVerificationCode,
	})

	expect(result).toMatchObject({
		action: 'send_mobile_verification_code',
		message:
			'We could not find a returning profile for that mobile number. Please check the number or continue as a new client.',
		type: 'error',
	})
	expect(requestBookingPhoneVerificationCode).not.toHaveBeenCalled()
})

test('treats unsure clients as new clients when Boulevard has no matching profile', () => {
	expect(shouldVerifyPhoneAsNewClient(null)).toBe(true)
	expect(shouldVerifyPhoneAsNewClient('new')).toBe(true)
	expect(shouldVerifyPhoneAsNewClient('unsure')).toBe(true)
	expect(shouldVerifyPhoneAsNewClient('returning')).toBe(false)
})
