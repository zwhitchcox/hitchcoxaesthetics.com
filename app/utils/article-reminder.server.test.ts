import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'

const sendSMS = vi.fn(async (_args: { to: string; body: string }) => ({
	status: 'success' as string,
	error: undefined as string | undefined,
}))
vi.mock('#app/utils/sms.server.ts', () => ({
	sendSMS: (args: { to: string; body: string }) => sendSMS(args),
}))

// The readers, never loaded for real: no Boulevard, no outreach sync.
const inputs = vi.hoisted(() => ({
	waiting: { articles: [], questions: [] } as {
		articles: Array<{ id: string; title: string; receivedAt: Date }>
		questions: Array<{
			id: string
			ask: string
			domain: string
			openedAt: Date
		}>
	},
	appointments: [] as Array<Record<string, unknown>>,
	working: true as boolean | null,
	answers: [] as Array<Record<string, unknown>>,
}))
vi.mock('#app/utils/review-waiting.server.ts', () => ({
	loadWaiting: vi.fn(async () => inputs.waiting),
}))
vi.mock('#app/utils/review-asks.server.ts', () => ({
	listAnswersForSync: vi.fn(async () => inputs.answers),
}))
vi.mock('#app/utils/blvd-availability.server.ts', () => ({
	readStaffAvailability: vi.fn(async () => ({
		working: inputs.working,
		shifts: [],
		blocks: [],
		fetchedAt: '',
	})),
}))
vi.mock('#app/utils/review-link.server.ts', () => ({
	readAppointmentSnapshot: vi.fn(async () => ({
		refreshedAt: '',
		appointments: inputs.appointments,
	})),
}))

import {
	noteCheckout,
	REMINDER_LEDGER_KEY,
	REVIEWER_STAFF_URN,
	sendArticleReminderText,
} from '#app/utils/article-reminder.server.ts'
import { readStaffAvailability } from '#app/utils/blvd-availability.server.ts'
import { prisma } from '#app/utils/db.server.ts'

// A Thursday in New York (EDT, UTC-4).
const DAY = '2026-09-17'
const at = (hhmm: string, day = DAY) => new Date(`${day}T${hhmm}:00-04:00`)
// A fictional destination. No real number is in this file.
const TO = '+15550001111'
const LINK = 'hitchcoxaesthetics.com/review'

function appt(
	id: string,
	start: string,
	end: string,
	state = 'BOOKED',
	over: Record<string, unknown> = {},
) {
	return {
		id,
		startAt: at(start).toISOString(),
		endAt: at(end).toISOString(),
		state,
		locationId: 'loc',
		locationName: 'Knoxville',
		staffId: REVIEWER_STAFF_URN,
		staffName: 'Sarah Hitchcox',
		staffPhone: null,
		clientFirstName: 'Jessica',
		serviceName: 'Botox',
		...over,
	}
}

const article = (title: string, receivedAt: Date) => ({
	id: title,
	title,
	receivedAt,
})

async function seedReviewer(
	phone = '15550001111',
	over: { name?: string; admin?: boolean } = {},
) {
	return prisma.user.create({
		data: {
			phone,
			name: over.name ?? 'Sarah Hitchcox',
			...(over.admin
				? {
						roles: {
							connectOrCreate: {
								where: { name: 'admin' },
								create: { name: 'admin' },
							},
						},
					}
				: {}),
		},
		select: { id: true },
	})
}

async function readLedger() {
	const row = await prisma.blvdSyncState.findUnique({
		where: { key: REMINDER_LEDGER_KEY },
	})
	return row?.value
		? (JSON.parse(row.value) as Record<string, unknown> & {
				checkouts: Record<string, string>
			})
		: null
}

beforeEach(() => {
	inputs.waiting = {
		articles: [article('Botox for TMJ', at('18:00', '2026-09-15'))],
		questions: [],
	}
	inputs.appointments = []
	inputs.working = true
	inputs.answers = []
})

afterEach(() => {
	sendSMS.mockClear()
	vi.unstubAllEnvs()
})

test('no destination: nothing happens', async () => {
	expect(await sendArticleReminderText(at('09:30'))).toEqual({
		sent: 0,
		skipped: 'no destination',
	})
	expect(sendSMS).not.toHaveBeenCalled()
})

test('no user for the destination: skipped, logged once per boot', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	consoleError.mockImplementation(() => {})
	// A client named Sarah is not the reviewer.
	await seedReviewer('15550009999', { name: 'Sarah Someone' })
	expect(await sendArticleReminderText(at('09:30'))).toEqual({
		sent: 0,
		skipped: 'no reviewer user',
	})
	expect(await sendArticleReminderText(at('09:35'))).toEqual({
		sent: 0,
		skipped: 'no reviewer user',
	})
	expect(consoleError).toHaveBeenCalledTimes(1)
	expect(sendSMS).not.toHaveBeenCalled()
})

test('a morning text, once', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	await seedReviewer()
	expect(await sendArticleReminderText(at('09:30'))).toEqual({
		sent: 1,
		kind: 'morning',
	})
	expect(sendSMS).toHaveBeenCalledWith({
		to: TO,
		body: `1 article is waiting: Botox for TMJ. ${LINK}`,
	})
	expect(readStaffAvailability).toHaveBeenCalledWith(
		REVIEWER_STAFF_URN,
		DAY,
		'America/New_York',
		at('09:30'),
	)
	expect(await readLedger()).toMatchObject({
		day: DAY,
		morningAt: at('09:30').toISOString(),
		lastTextAt: at('09:30').toISOString(),
	})

	expect(await sendArticleReminderText(at('09:35'))).toEqual({ sent: 0 })
	expect(sendSMS).toHaveBeenCalledTimes(1)
})

test('falls back to REVIEW_REMINDER_SMS_TO and to the admin named Sarah', async () => {
	vi.stubEnv('REVIEW_REMINDER_SMS_TO', '+15550002222')
	await seedReviewer('15559999999', { admin: true })
	expect(await sendArticleReminderText(at('09:30'))).toEqual({
		sent: 1,
		kind: 'morning',
	})
	expect(sendSMS).toHaveBeenCalledWith(
		expect.objectContaining({ to: '+15550002222' }),
	)
})

test('a failed send leaves the ledger unstamped, so the next tick retries', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	await seedReviewer()
	consoleError.mockImplementation(() => {})
	sendSMS.mockResolvedValueOnce({ status: 'error', error: 'boom' })
	expect(await sendArticleReminderText(at('09:30'))).toEqual({
		sent: 0,
		kind: 'morning',
		skipped: 'send failed',
	})
	expect((await readLedger())?.morningAt).toBeUndefined()
	expect(await sendArticleReminderText(at('09:35'))).toEqual({
		sent: 1,
		kind: 'morning',
	})
})

test('nothing waiting: no Boulevard read, no text, checkouts still noted', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	await seedReviewer()
	inputs.waiting = { articles: [], questions: [] }
	inputs.appointments = [appt('a', '09:00', '10:00', 'FINAL')]
	expect(await sendArticleReminderText(at('10:05'))).toEqual({ sent: 0 })
	expect(readStaffAvailability).not.toHaveBeenCalled()
	expect(sendSMS).not.toHaveBeenCalled()
	expect((await readLedger())?.checkouts).toEqual({
		a: at('10:05').toISOString(),
	})
})

test('other providers and other days are left out of the ledger', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	await seedReviewer()
	inputs.waiting = { articles: [], questions: [] }
	inputs.appointments = [
		appt('mine', '09:00', '10:00', 'FINAL'),
		appt('theirs', '09:00', '10:00', 'FINAL', {
			staffId: 'urn:blvd:Staff:other',
		}),
		appt('old', '09:00', '10:00', 'FINAL', {
			startAt: at('09:00', '2026-09-16').toISOString(),
			endAt: at('10:00', '2026-09-16').toISOString(),
		}),
	]
	await sendArticleReminderText(at('10:05'))
	expect(Object.keys((await readLedger())?.checkouts ?? {})).toEqual(['mine'])
})

test("the webhook's checkout note wins over the poll", async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	await seedReviewer()
	await noteCheckout('a', at('09:58'))
	await noteCheckout('a', at('10:00'))
	expect((await readLedger())?.checkouts).toEqual({
		a: at('09:58').toISOString(),
	})

	inputs.waiting = { articles: [], questions: [] }
	inputs.appointments = [appt('a', '09:00', '10:00', 'FINAL')]
	await sendArticleReminderText(at('10:05'))
	expect((await readLedger())?.checkouts).toEqual({
		a: at('09:58').toISOString(),
	})
})

test('the end-of-day text twenty minutes after her last client', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	const user = await seedReviewer()
	// She opened the page this morning: no morning or gap text today.
	await prisma.reviewSetting.create({
		data: { userId: user.id, lastOpenAt: at('08:00') },
	})
	inputs.appointments = [appt('a', '09:00', '10:00', 'FINAL')]
	await noteCheckout('a', at('10:00'))

	expect(await sendArticleReminderText(at('10:19'))).toEqual({ sent: 0 })
	expect(await sendArticleReminderText(at('10:20'))).toEqual({
		sent: 1,
		kind: 'eod',
	})
	expect((await readLedger())?.eodAt).toBe(at('10:20').toISOString())
})

test('a decision today stops the end-of-day text', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	const user = await seedReviewer()
	await prisma.reviewSetting.create({
		data: { userId: user.id, lastOpenAt: at('08:00') },
	})
	inputs.appointments = [appt('a', '09:00', '10:00', 'FINAL')]
	await noteCheckout('a', at('10:00'))

	// She answered a question today.
	inputs.answers = [{ key: 'row:1', answer: 'yes', answeredAt: at('09:00') }]
	expect(await sendArticleReminderText(at('10:20'))).toEqual({ sent: 0 })

	// She approved an article today.
	inputs.answers = []
	const seeded = await prisma.article.create({
		data: {
			kind: 'guest',
			sourceKey: 't:reminder:1',
			title: 'Botox for TMJ',
			body: 'x',
			bodyOriginal: 'x',
			bodyHash: 'x',
		},
		select: { id: true },
	})
	const event = await prisma.articleReviewEvent.create({
		data: {
			articleId: seeded.id,
			userId: user.id,
			kind: 'approved',
			at: at('09:15'),
		},
		select: { id: true },
	})
	expect(await sendArticleReminderText(at('10:20'))).toEqual({ sent: 0 })

	// Yesterday's decision does not count.
	await prisma.articleReviewEvent.update({
		where: { id: event.id },
		data: { at: at('09:15', '2026-09-16') },
	})
	expect(await sendArticleReminderText(at('10:20'))).toEqual({
		sent: 1,
		kind: 'eod',
	})
})

test('availability unknown: her appointments decide', async () => {
	vi.stubEnv('ARTICLE_REMINDER_SMS_TO', TO)
	await seedReviewer()
	inputs.working = null
	expect(await sendArticleReminderText(at('09:30'))).toEqual({ sent: 0 })

	inputs.appointments = [appt('a', '11:00', '12:00')]
	expect(await sendArticleReminderText(at('09:30'))).toEqual({
		sent: 1,
		kind: 'morning',
	})
})
