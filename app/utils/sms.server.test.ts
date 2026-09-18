import { afterEach, expect, test, vi } from 'vitest'

const create = vi.fn()
vi.mock('twilio', () => ({
	default: () => ({ messages: { create } }),
}))

import { isPermanentSMSError, sendSMS } from './sms.server.ts'

afterEach(() => {
	create.mockReset()
	vi.unstubAllEnvs()
})

test('a Twilio rejection comes back as an error result, it is never thrown', async () => {
	vi.stubEnv('NODE_ENV', 'production')
	create.mockRejectedValueOnce(
		Object.assign(new Error('Attempt to send to unsubscribed recipient'), {
			code: 21610,
			status: 400,
		}),
	)

	const result = await sendSMS({ to: '+15550001111', body: 'hello' })

	expect(result).toEqual({
		status: 'error',
		error: 'Attempt to send to unsubscribed recipient',
		code: 21610,
	})
	expect(isPermanentSMSError(result)).toBe(true)
})

test('a network failure is an error a caller can retry', async () => {
	vi.stubEnv('NODE_ENV', 'production')
	create.mockRejectedValueOnce(new Error('socket hang up'))

	const result = await sendSMS({ to: '+15550001111', body: 'hello' })

	expect(result).toEqual({ status: 'error', error: 'socket hang up' })
	expect(isPermanentSMSError(result)).toBe(false)
})

test('a delivered text is a success', async () => {
	vi.stubEnv('NODE_ENV', 'production')
	create.mockResolvedValueOnce({ errorMessage: null, errorCode: null })

	expect(await sendSMS({ to: '5550001111', body: 'hello' })).toEqual({
		status: 'success',
	})
	expect(create).toHaveBeenCalledWith(
		expect.objectContaining({ to: '+5550001111' }),
	)
})
