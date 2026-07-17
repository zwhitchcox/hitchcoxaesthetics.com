import { afterEach, expect, test, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'

const sendSMS = vi.fn(async (_args: { to: string; body: string }) => ({
	status: 'success' as string,
	error: undefined as string | undefined,
}))
vi.mock('#app/utils/sms.server.ts', () => ({
	sendSMS: (args: { to: string; body: string }) => sendSMS(args),
}))

import { prisma } from '#app/utils/db.server.ts'
import { REVIEW_RECENT_APPOINTMENTS_KEY } from '#app/utils/review-link.server.ts'
import { sendReviewReminderTexts } from '#app/utils/review-reminder-sms.server.ts'

const NOW = new Date('2026-07-17T20:00:00.000Z')
const LATER = new Date('2026-07-17T20:10:00.000Z')

type SeedAppt = {
	id: string
	state?: string
	endAt?: string | null
	staffPhone?: string | null
	clientFirstName?: string
}

async function seedSnapshot(appointments: SeedAppt[]) {
	const value = JSON.stringify({
		refreshedAt: NOW.toISOString(),
		appointments: appointments.map(a => ({
			id: a.id,
			startAt: '2026-07-17T19:00:00.000Z',
			endAt: a.endAt === undefined ? '2026-07-17T19:50:00.000Z' : a.endAt,
			state: a.state ?? 'CONFIRMED',
			locationId: 'loc',
			locationName: 'Bearden',
			staffId: 'urn:blvd:Staff:sarah',
			staffName: 'Sarah Hitchcox',
			staffPhone: a.staffPhone === undefined ? '+18655551111' : a.staffPhone,
			clientFirstName: a.clientFirstName ?? 'Jessica',
			serviceName: 'Botox',
		})),
	})
	await prisma.blvdSyncState.upsert({
		where: { key: REVIEW_RECENT_APPOINTMENTS_KEY },
		create: { key: REVIEW_RECENT_APPOINTMENTS_KEY, value },
		update: { value },
	})
}

afterEach(() => {
	sendSMS.mockClear()
	vi.unstubAllEnvs()
})

test('texts the provider when a watched appointment transitions to checked out', async () => {
	// First sync: in progress. No text.
	await seedSnapshot([{ id: 'a1', state: 'ARRIVED' }])
	expect(await sendReviewReminderTexts(NOW)).toEqual({ sent: 0 })

	// Next sync: Sarah checked them out (state flipped to FINAL).
	await seedSnapshot([{ id: 'a1', state: 'FINAL' }])
	expect(await sendReviewReminderTexts(LATER)).toEqual({ sent: 1 })
	expect(sendSMS).toHaveBeenCalledWith({
		to: '+18655551111',
		body: 'Review reminder: Jessica (Botox) is checking out. Ask for the Google review before they leave!',
	})

	// Later syncs never re-text.
	expect(await sendReviewReminderTexts(LATER)).toEqual({ sent: 0 })
	expect(sendSMS).toHaveBeenCalledTimes(1)
})

test('first sighting already FINAL: texts only when scheduled end is recent', async () => {
	await seedSnapshot([
		// Ended 10 min ago: a fast walk-in checked out between syncs. Texts.
		{ id: 'recent', state: 'FINAL', endAt: '2026-07-17T19:50:00.000Z' },
		// Yesterday's appointment (first run after a deploy). Silent.
		{ id: 'old', state: 'FINAL', endAt: '2026-07-16T19:50:00.000Z' },
	])
	expect(await sendReviewReminderTexts(NOW)).toEqual({ sent: 1 })
	expect(sendSMS).toHaveBeenCalledTimes(1)
	expect(sendSMS.mock.calls[0]![0].body).toContain('Jessica')
})

test('falls back to REVIEW_REMINDER_SMS_TO when the provider has no phone', async () => {
	vi.stubEnv('REVIEW_REMINDER_SMS_TO', '+18655550000')
	await seedSnapshot([{ id: 'a1', state: 'ARRIVED', staffPhone: null }])
	await sendReviewReminderTexts(NOW)
	await seedSnapshot([{ id: 'a1', state: 'FINAL', staffPhone: null }])
	expect(await sendReviewReminderTexts(LATER)).toEqual({ sent: 1 })
	expect(sendSMS).toHaveBeenCalledWith(
		expect.objectContaining({ to: '+18655550000' }),
	)
})

test('no phone anywhere: stays silent', async () => {
	await seedSnapshot([{ id: 'a1', state: 'ARRIVED', staffPhone: null }])
	await sendReviewReminderTexts(NOW)
	await seedSnapshot([{ id: 'a1', state: 'FINAL', staffPhone: null }])
	expect(await sendReviewReminderTexts(LATER)).toEqual({ sent: 0 })
	expect(sendSMS).not.toHaveBeenCalled()
})

test('cancelled appointments never text', async () => {
	await seedSnapshot([{ id: 'a1', state: 'ARRIVED' }])
	await sendReviewReminderTexts(NOW)
	await seedSnapshot([{ id: 'a1', state: 'CANCELLED' }])
	expect(await sendReviewReminderTexts(LATER)).toEqual({ sent: 0 })
	expect(sendSMS).not.toHaveBeenCalled()
})

test('failed sends are not marked sent, so the next run retries', async () => {
	consoleError.mockImplementation(() => {})
	await seedSnapshot([{ id: 'a1', state: 'ARRIVED' }])
	await sendReviewReminderTexts(NOW)
	await seedSnapshot([{ id: 'a1', state: 'FINAL' }])

	sendSMS.mockResolvedValueOnce({ status: 'error', error: 'boom' })
	expect(await sendReviewReminderTexts(LATER)).toEqual({ sent: 0 })
	expect(await sendReviewReminderTexts(LATER)).toEqual({ sent: 1 })
})
