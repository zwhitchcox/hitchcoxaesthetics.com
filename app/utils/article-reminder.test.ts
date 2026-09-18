import { describe, expect, test } from 'vitest'
import {
	checkoutsAfter,
	decideReminder,
	inTextWindow,
	ledgerForDay,
	stampReminder,
	withCheckout,
	type ReminderAppointment,
	type ReminderInput,
	type ReminderLedger,
} from '#app/utils/article-reminder.ts'

// A Thursday in New York (EDT, UTC-4). Every clock below is her wall clock.
const ZONE = 'America/New_York'
const DAY = '2026-09-17'
const YESTERDAY = '2026-09-16'
const LINK = 'hitchcoxaesthetics.com/review'

function at(hhmm: string, day = DAY): Date {
	return new Date(`${day}T${hhmm}:00-04:00`)
}

function appt(
	id: string,
	start: string,
	end: string,
	state = 'BOOKED',
): ReminderAppointment {
	return {
		id,
		startAt: at(start).toISOString(),
		endAt: at(end).toISOString(),
		state,
	}
}

const article = (title: string, receivedAt: Date) => ({ title, receivedAt })
const question = (ask: string, openedAt: Date) => ({ ask, openedAt })
const OLD_ARTICLE = article('Botox for TMJ', at('18:00', '2026-09-15'))
/** She looked yesterday evening: the old article is seen, today is unopened. */
const LOOKED_YESTERDAY = at('18:00', YESTERDAY)

function ledger(over: Partial<ReminderLedger> = {}): ReminderLedger {
	return { day: DAY, checkouts: {}, ...over }
}

function input(over: Partial<ReminderInput> = {}): ReminderInput {
	return {
		now: at('09:30'),
		zone: ZONE,
		working: true,
		appointments: [],
		waiting: { articles: [OLD_ARTICLE], questions: [] },
		lastOpenAt: null,
		decidedToday: false,
		ledger: ledger(),
		...over,
	}
}

const kindAt = (now: Date, over: Partial<ReminderInput> = {}) =>
	decideReminder(input({ now, ...over }))?.kind ?? null

describe('nothing goes out', () => {
	test('before 09:00 or from 21:00', () => {
		expect(kindAt(at('08:59'))).toBeNull()
		expect(kindAt(at('09:00'))).toBe('morning')
		expect(kindAt(at('20:59'))).toBe('alert')
		expect(kindAt(at('21:00'))).toBeNull()
	})

	test('on a day off', () => {
		expect(kindAt(at('09:30'), { working: false })).toBeNull()
	})

	test('when nothing waits', () => {
		expect(
			kindAt(at('09:30'), { waiting: { articles: [], questions: [] } }),
		).toBeNull()
	})

	test('while she is with a client', () => {
		const inRoom = [appt('a', '09:00', '10:00', 'ARRIVED')]
		expect(kindAt(at('09:40'), { appointments: inRoom })).toBeNull()
		// Checked out early: she is free.
		expect(
			kindAt(at('09:40'), {
				appointments: inRoom,
				ledger: ledger({ checkouts: { a: at('09:25').toISOString() } }),
			}),
		).toBe('alert')
		expect(
			kindAt(at('09:40'), {
				appointments: [appt('a', '09:00', '10:00', 'FINAL')],
			}),
		).toBe('alert')
	})

	test('cancelled and no-show clients do not count', () => {
		expect(
			kindAt(at('09:30'), {
				appointments: [
					appt('a', '09:00', '10:00', 'CANCELLED'),
					appt('b', '09:00', '10:00', 'NO_SHOW'),
				],
			}),
		).toBe('morning')
	})

	test('appointments belong to her date, not the UTC date', () => {
		// 23:30 in New York is already the 17th in UTC.
		const lateLastNight: ReminderAppointment = {
			id: 'a',
			startAt: at('23:30', YESTERDAY).toISOString(),
			endAt: at('23:59', YESTERDAY).toISOString(),
			state: 'FINAL',
		}
		expect(kindAt(at('09:30'), { appointments: [lateLastNight] })).toBe(
			'morning',
		)
	})
})

describe('gap', () => {
	const checkedOutAtTen = ledger({
		checkouts: { a: at('10:00').toISOString() },
	})

	test('ten minutes after a checkout when the next client is 30 minutes or more away', () => {
		const day = {
			appointments: [
				appt('a', '09:00', '10:00', 'FINAL'),
				appt('b', '11:00', '12:00'),
			],
			ledger: checkedOutAtTen,
			lastOpenAt: LOOKED_YESTERDAY,
		}
		expect(kindAt(at('10:09'), day)).toBeNull()
		expect(kindAt(at('10:10'), day)).toBe('gap')
	})

	test('not when the next client is only 20 minutes away', () => {
		expect(
			kindAt(at('10:10'), {
				appointments: [
					appt('a', '09:00', '10:00', 'FINAL'),
					appt('b', '10:20', '11:00'),
				],
				ledger: checkedOutAtTen,
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBeNull()
	})

	test('not after the last client of the day: that is the end-of-day text', () => {
		const day = {
			appointments: [appt('a', '09:00', '10:00', 'FINAL')],
			ledger: checkedOutAtTen,
			lastOpenAt: LOOKED_YESTERDAY,
		}
		expect(kindAt(at('10:10'), day)).toBeNull()
		expect(kindAt(at('10:20'), day)).toBe('eod')
	})

	test('a client nobody checked out counts as gone 30 minutes after the end', () => {
		const day = {
			appointments: [
				appt('a', '09:00', '10:00', 'ARRIVED'),
				appt('b', '11:30', '12:30'),
			],
			lastOpenAt: LOOKED_YESTERDAY,
		}
		expect(kindAt(at('10:29'), day)).toBeNull()
		expect(kindAt(at('10:39'), day)).toBeNull()
		expect(kindAt(at('10:40'), day)).toBe('gap')
	})

	test('once a day', () => {
		expect(
			kindAt(at('10:10'), {
				appointments: [
					appt('a', '09:00', '10:00', 'FINAL'),
					appt('b', '11:00', '12:00'),
				],
				ledger: ledger({
					gapAt: at('09:50').toISOString(),
					checkouts: { a: at('10:00').toISOString() },
				}),
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBeNull()
	})

	test('not when she opened the review page today', () => {
		expect(
			kindAt(at('10:10'), {
				appointments: [
					appt('a', '09:00', '10:00', 'FINAL'),
					appt('b', '11:00', '12:00'),
				],
				ledger: checkedOutAtTen,
				lastOpenAt: at('08:00'),
			}),
		).toBeNull()
	})
})

describe('end of day', () => {
	const lastClientGoneAtTen = {
		appointments: [appt('a', '09:00', '10:00', 'FINAL')],
		ledger: ledger({ checkouts: { a: at('10:00').toISOString() } }),
	}

	test('twenty minutes after her last client leaves, opened page or not', () => {
		expect(
			kindAt(at('10:19'), {
				...lastClientGoneAtTen,
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBeNull()
		expect(
			kindAt(at('10:20'), {
				...lastClientGoneAtTen,
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBe('eod')
		expect(
			kindAt(at('10:20'), { ...lastClientGoneAtTen, lastOpenAt: at('08:00') }),
		).toBe('eod')
	})

	test('not when she decided something today', () => {
		expect(
			kindAt(at('10:20'), {
				...lastClientGoneAtTen,
				lastOpenAt: LOOKED_YESTERDAY,
				decidedToday: true,
			}),
		).toBeNull()
	})

	test('once a day', () => {
		expect(
			kindAt(at('10:20'), {
				...lastClientGoneAtTen,
				lastOpenAt: LOOKED_YESTERDAY,
				ledger: ledger({
					eodAt: at('10:20').toISOString(),
					checkouts: { a: at('10:00').toISOString() },
				}),
			}),
		).toBeNull()
	})

	test('waits 90 minutes after the last text of any kind', () => {
		// an alert went out at 18:50; the end-of-day text is due at 19:00 and goes at 20:20
		const evening = {
			appointments: [appt('z', '17:30', '18:30', 'FINAL')],
			ledger: ledger({
				checkouts: { z: at('18:30').toISOString() },
				lastTextAt: at('18:50').toISOString(),
				lastAlertAt: at('18:50').toISOString(),
			}),
			lastOpenAt: LOOKED_YESTERDAY,
		}
		expect(kindAt(at('19:00'), evening)).toBeNull()
		expect(kindAt(at('20:19'), evening)).toBeNull()
		expect(kindAt(at('20:20'), evening)).toBe('eod')
	})

	test('wins over an alert that is due at the same tick', () => {
		expect(
			kindAt(at('10:20'), {
				...lastClientGoneAtTen,
				lastOpenAt: at('08:00'),
				waiting: { articles: [article('New', at('09:10'))], questions: [] },
			}),
		).toBe('eod')
	})
})

describe('morning', () => {
	test('no clients: from 09:00 until 11:00', () => {
		const free = { lastOpenAt: LOOKED_YESTERDAY }
		expect(kindAt(at('09:00'), free)).toBe('morning')
		expect(kindAt(at('10:59'), free)).toBe('morning')
		expect(kindAt(at('11:00'), free)).toBeNull()
	})

	test('a first client at 10:00 or later: until that client starts', () => {
		const day = {
			appointments: [appt('a', '10:00', '11:00')],
			lastOpenAt: LOOKED_YESTERDAY,
		}
		expect(kindAt(at('09:30'), day)).toBe('morning')
		expect(kindAt(at('10:00'), day)).toBeNull()
	})

	test('a first client before 10:00: nothing', () => {
		expect(
			kindAt(at('09:00'), {
				appointments: [appt('a', '09:30', '10:30')],
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBeNull()
	})

	test('not after the first client started', () => {
		expect(
			kindAt(at('10:50'), {
				appointments: [appt('a', '10:00', '11:00', 'FINAL')],
				ledger: ledger({ checkouts: { a: at('10:45').toISOString() } }),
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBeNull()
	})

	test('once a day', () => {
		expect(
			kindAt(at('09:30'), {
				ledger: ledger({ morningAt: at('09:05').toISOString() }),
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBeNull()
	})

	test('not when she opened the review page today', () => {
		expect(kindAt(at('09:30'), { lastOpenAt: at('08:00') })).toBeNull()
	})
})

describe('alert', () => {
	const newArrival = {
		articles: [article('Lip filler aftercare', at('09:10'))],
		questions: [],
	}

	test('a new arrival after she cleared the queue', () => {
		const decision = decideReminder(
			input({ now: at('09:20'), lastOpenAt: at('08:00'), waiting: newArrival }),
		)
		expect(decision).toEqual({
			kind: 'alert',
			body: `1 article is waiting: Lip filler aftercare. ${LINK}`,
		})
	})

	test('blocked while items she has seen still wait', () => {
		expect(
			kindAt(at('09:20'), {
				lastOpenAt: at('08:00'),
				waiting: {
					articles: [OLD_ARTICLE, ...newArrival.articles],
					questions: [],
				},
			}),
		).toBeNull()
	})

	test('one text per four hours', () => {
		const day = {
			lastOpenAt: at('08:00'),
			waiting: newArrival,
			ledger: ledger({ lastTextAt: at('09:00').toISOString() }),
		}
		expect(kindAt(at('12:59'), day)).toBeNull()
		expect(kindAt(at('13:00'), day)).toBe('alert')
	})

	test('items already texted about are not new', () => {
		expect(
			kindAt(at('14:00'), {
				lastOpenAt: at('08:00'),
				waiting: newArrival,
				ledger: ledger({ lastTextAt: at('09:30').toISOString() }),
			}),
		).toBeNull()
	})

	test('waits ten minutes after a checkout', () => {
		const day = {
			appointments: [appt('a', '09:00', '09:55', 'FINAL')],
			ledger: ledger({ checkouts: { a: at('09:55').toISOString() } }),
			lastOpenAt: at('08:00'),
			waiting: newArrival,
		}
		expect(kindAt(at('10:00'), day)).toBeNull()
		expect(kindAt(at('10:05'), day)).toBe('alert')
	})

	test('she never opened the page: everything is new', () => {
		expect(kindAt(at('12:00'), { lastOpenAt: null })).toBe('alert')
	})

	test('what a text already told her about counts as seen, page opened or not', () => {
		// the morning text covered the old article; a later arrival does not alert while it waits
		expect(
			kindAt(at('15:00'), {
				lastOpenAt: null,
				waiting: {
					articles: [OLD_ARTICLE, article('New', at('12:00'))],
					questions: [],
				},
				ledger: ledger({ lastTextAt: at('09:30').toISOString() }),
			}),
		).toBeNull()
	})
})

describe('the text', () => {
	test('the counts, and the title when it is one item', () => {
		const many = decideReminder(
			input({
				waiting: {
					articles: [
						OLD_ARTICLE,
						article('Two', at('08:00')),
						article('Three', at('08:00')),
					],
					questions: [
						question('Why', at('08:00')),
						question('How', at('08:00')),
					],
				},
			}),
		)
		expect(many?.body).toBe(`3 articles and 2 questions are waiting. ${LINK}`)

		const one = decideReminder(
			input({
				waiting: {
					articles: [],
					questions: [question('Can we say board certified?', at('08:00'))],
				},
			}),
		)
		expect(one?.body).toBe(
			`1 question is waiting: Can we say board certified. ${LINK}`,
		)
	})
})

describe('the ledger', () => {
	test('a stamp stops the same kind for the rest of the day', () => {
		const stamped = stampReminder(ledger(), 'gap', at('10:10'))
		expect(stamped.gapAt).toBe(at('10:10').toISOString())
		expect(stamped.lastTextAt).toBe(at('10:10').toISOString())
		expect(
			kindAt(at('10:10'), {
				appointments: [
					appt('a', '09:00', '10:00', 'FINAL'),
					appt('b', '11:00', '12:00'),
				],
				ledger: { ...stamped, checkouts: { a: at('10:00').toISOString() } },
				lastOpenAt: LOOKED_YESTERDAY,
			}),
		).toBeNull()

		expect(stampReminder(ledger(), 'eod', at('10:20')).eodAt).toBe(
			at('10:20').toISOString(),
		)
		expect(stampReminder(ledger(), 'morning', at('09:00')).morningAt).toBe(
			at('09:00').toISOString(),
		)
		const alert = stampReminder(ledger(), 'alert', at('12:00'))
		expect(alert.lastAlertAt).toBe(at('12:00').toISOString())
		expect(alert.lastTextAt).toBe(at('12:00').toISOString())
		expect(alert.gapAt).toBeUndefined()
	})

	test('a new day drops the once-a-day stamps and keeps the rest', () => {
		const old = ledger({
			day: YESTERDAY,
			morningAt: at('09:00', YESTERDAY).toISOString(),
			gapAt: at('10:10', YESTERDAY).toISOString(),
			eodAt: at('17:20', YESTERDAY).toISOString(),
			lastTextAt: at('17:20', YESTERDAY).toISOString(),
			checkouts: { x: at('17:00', YESTERDAY).toISOString() },
		})
		expect(ledgerForDay(old, YESTERDAY)).toBe(old)
		expect(ledgerForDay(old, DAY)).toEqual({
			day: DAY,
			lastTextAt: old.lastTextAt,
			checkouts: old.checkouts,
		})
		// The decision ignores yesterday's stamps on its own.
		expect(
			kindAt(at('09:30'), { ledger: old, lastOpenAt: LOOKED_YESTERDAY }),
		).toBe('morning')
	})

	test('checkoutsAfter notes first-seen checkouts and forgets old ones', () => {
		const before = ledger({
			checkouts: {
				a: at('09:58').toISOString(),
				kept: at('13:00', '2026-09-15').toISOString(),
				old: at('09:00', '2026-09-14').toISOString(),
			},
		})
		const after = checkoutsAfter(
			[
				appt('a', '09:00', '10:00', 'FINAL'),
				appt('b', '10:00', '11:00', 'ARRIVED'),
				appt('c', '11:00', '12:00', 'COMPLETED'),
			],
			before,
			at('12:05'),
		)
		expect(after.checkouts).toEqual({
			a: at('09:58').toISOString(),
			kept: at('13:00', '2026-09-15').toISOString(),
			c: at('12:05').toISOString(),
		})
	})

	test('withCheckout keeps the first note', () => {
		const first = withCheckout(ledger(), 'a', at('10:00'))
		expect(withCheckout(first, 'a', at('10:05')).checkouts.a).toBe(
			at('10:00').toISOString(),
		)
	})

	test('the text window is her clock', () => {
		// 12:30 UTC is 08:30 in New York.
		expect(inTextWindow(new Date('2026-09-17T12:30:00Z'), ZONE)).toBe(false)
		expect(inTextWindow(at('09:00'), ZONE)).toBe(true)
		expect(inTextWindow(at('20:59'), ZONE)).toBe(true)
		expect(inTextWindow(at('21:00'), ZONE)).toBe(false)
	})
})
