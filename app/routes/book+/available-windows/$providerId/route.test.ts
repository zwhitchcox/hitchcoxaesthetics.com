import { beforeEach, expect, test } from 'vitest'

import {
	getAvailableWindows,
	getDayOfWeek,
} from '#/app/routes/book+/available-windows/$providerId/route.server'
import { dateToMinutes } from '#app/utils/date'
import {
	clearAllData,
	createTestAppointment,
	createTestBlockedTime,
	createTestProvider,
} from '#tests/fake'

beforeEach(clearAllData)

test.skip('get available windows', async () => {
	const date = '2024-02-10'
	const dayOfWeek = getDayOfWeek(date)
	const startTime = new Date()
	startTime.setHours(9, 0, 0, 0)
	const endTime = new Date()
	endTime.setDate(startTime.getDate() + 1)
	endTime.setHours(21, 0, 0, 0)
	const providerId = 'sarah'
	await createTestProvider({
		id: providerId,
		schedule: {
			create: {
				dayOfWeek,
				startTime,
				endTime,
			},
		},
	})
	const startMinutes = dateToMinutes(startTime)
	const endMinutes = dateToMinutes(endTime)

	const windows = await getAvailableWindows(date, providerId)
	expect(windows).toEqual([{ start: startMinutes, end: endMinutes }])
})

test.skip('get available windows with appointment', async () => {
	const date = '2024-02-10'
	const dayOfWeek = getDayOfWeek(date)
	const startTime = new Date(date)
	startTime.setHours(9, 0, 0, 0)
	const endTime = new Date(date)
	endTime.setHours(21, 0, 0, 0)
	const providerId = 'sarah'
	await createTestProvider({
		id: providerId,
		schedule: {
			create: {
				dayOfWeek,
				startTime,
				endTime,
			},
		},
	})

	const appointmentStart = new Date(date)
	appointmentStart.setDate(appointmentStart.getDate() + 1)
	appointmentStart.setHours(10, 0, 0, 0)
	const appointmentEnd = new Date(date)
	appointmentEnd.setDate(appointmentStart.getDate() + 1)
	appointmentEnd.setHours(11, 0, 0, 0)
	await createTestAppointment({
		provider: { connect: { id: providerId } },
		windowStart: appointmentStart,
		windowEnd: appointmentEnd,
	})

	const windows = await getAvailableWindows(date, providerId)
	expect(windows).toEqual([
		{ start: dateToMinutes(startTime), end: dateToMinutes(appointmentStart) },
		{ start: dateToMinutes(appointmentEnd), end: dateToMinutes(endTime) },
	])
})

test.skip('get available windows with blocked times', async () => {
	const date = '2024-02-10'
	const dayOfWeek = getDayOfWeek(date)
	const startTime = new Date(date)
	startTime.setDate(startTime.getDate() + 1)
	startTime.setHours(9, 0, 0, 0)
	const endTime = new Date(date)
	endTime.setDate(endTime.getDate() + 1)
	endTime.setHours(21, 0, 0, 0)
	const providerId = 'sarah'
	await createTestProvider({
		id: providerId,
		schedule: {
			create: {
				dayOfWeek,
				startTime,
				endTime,
			},
		},
	})

	const blockedStartTime = new Date(date)
	blockedStartTime.setDate(blockedStartTime.getDate() + 1)
	blockedStartTime.setHours(13, 0, 0, 0) // Blocking from 1 PM
	const blockedEndTime = new Date(date)
	blockedEndTime.setDate(blockedEndTime.getDate() + 1)
	blockedEndTime.setHours(15, 0, 0, 0) // to 3 PM

	await createTestBlockedTime({
		provider: { connect: { id: providerId } },
		start: blockedStartTime,
		end: blockedEndTime,
		reason: 'Meeting',
	})

	const windows = await getAvailableWindows(date, providerId)

	// Expected windows should exclude the blocked time from 1 PM to 3 PM
	expect(windows).toEqual([
		{ start: dateToMinutes(startTime), end: dateToMinutes(blockedStartTime) },
		{ start: dateToMinutes(blockedEndTime), end: dateToMinutes(endTime) },
	])
})
