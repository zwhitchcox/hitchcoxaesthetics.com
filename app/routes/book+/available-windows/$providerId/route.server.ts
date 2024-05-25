import { invariant } from '@epic-web/invariant'

import { dateToMinutes, zToEST } from '#app/utils/date.js'
import { prisma } from '#app/utils/db.server.js'
import { AppointmentStatus } from '#app/utils/types'

const MINIMUM_ADVANCED_NOTICE_MINUTES = 180

function roundUp10(num: number) {
	return Math.ceil(num / 10) * 10
}

function roundDown10(num: number) {
	return Math.floor(num / 10) * 10
}

export async function getAvailableWindows(date: string, providerId: string) {
	const dayOfWeek = getDayOfWeek(date)
	const schedule = await prisma.weeklySchedule.findFirst({
		where: {
			userId: providerId,
			dayOfWeek,
		},
	})
	invariant(schedule, 'No schedule found for provider')

	const bod = new Date(date)
	bod.setHours(0, 0, 0, 0) // start of day before
	bod.setDate(bod.getDate() + 1) // start of day
	const eod = new Date(bod)
	eod.setDate(eod.getDate() + 1)

	const appointments = await prisma.appointment.findMany({
		where: {
			providerId,
			windowStart: {
				lte: eod,
			},
			windowEnd: {
				gte: bod,
			},
			status: {
				not: AppointmentStatus.Cancelled,
			},
		},
		orderBy: {
			windowStart: 'asc',
		},
	})

	const availableWindows: { start: number; end: number }[] = []
	const curMinutes = dateToMinutes(new Date())
	const bosMinutes = dateToMinutes(schedule.startTime)
	const curDateString = zToEST(new Date()).toISOString()
	let start = dateToMinutes(schedule.startTime)
	if (curDateString.startsWith(date)) {
		if (curMinutes < bosMinutes) {
			start = Math.max(curMinutes + MINIMUM_ADVANCED_NOTICE_MINUTES, bosMinutes)
		} else {
			start = curMinutes + MINIMUM_ADVANCED_NOTICE_MINUTES
		}
	}
	start = roundUp10(start)
	let end = dateToMinutes(schedule.endTime)
	end = roundDown10(end)
	appointments.forEach(appointment => {
		const aStart = dateToMinutes(appointment.windowStart)
		const aEnd = dateToMinutes(appointment.windowEnd)
		if (aStart < end && aEnd > start) {
			if (aStart > start) {
				availableWindows.push({
					start: start,
					end: aStart,
				})
			}
			start = aEnd
		}
	})
	if (start < end) {
		availableWindows.push({
			start: start,
			end: end,
		})
	}

	const blockedTimes = await prisma.blockedTime.findMany({
		where: {
			providerId,
			start: {
				lte: eod,
			},
			end: {
				gte: bod,
			},
		},
	})

	let finalWindows = [...availableWindows]

	blockedTimes.forEach(blockedTime => {
		const blockedStart =
			blockedTime.start < bod ? 0 : dateToMinutes(blockedTime.start)
		const blockedEnd =
			blockedTime.end > eod ? Infinity : dateToMinutes(blockedTime.end)
		finalWindows = finalWindows.reduce(
			(acc, window) => {
				if (window.end <= blockedStart || window.start >= blockedEnd) {
					acc.push(window)
				} else {
					if (window.start < blockedStart) {
						acc.push({ start: window.start, end: blockedStart })
					}
					if (window.end > blockedEnd) {
						acc.push({ start: blockedEnd, end: window.end })
					}
				}
				return acc
			},
			[] as { start: number; end: number }[],
		)
	})

	return finalWindows
}

export function getDayOfWeek(date: Date | string) {
	return new Date(date).toLocaleString('en-us', {
		weekday: 'long',
	}) as 'Tuesday'
}
