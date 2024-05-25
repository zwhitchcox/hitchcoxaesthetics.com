import { faker } from '@faker-js/faker'
import { type Prisma } from '@prisma/client'

import { prisma } from '#app/utils/db.server.js'
import { DayOfWeek, UserType } from '#app/utils/types'

function generateId() {
	return Math.random().toString(36).substring(2, 9)
}
let id = 1
function getNextId() {
	return id++
}

export async function createTestUser(
	data: Partial<Prisma.UserCreateInput> = {},
) {
	const clientData: Prisma.UserCreateInput = {
		id: generateId(),
		phone: faker.phone.number(),
		name: 'Test User ' + getNextId(),
		...data,
	}
	return await prisma.user.upsert({
		where: { id: clientData.id },
		create: clientData,
		update: clientData,
	})
}

export async function createTestClient(
	data: Partial<Prisma.UserCreateInput> = {},
) {
	return await createTestUser({
		name: 'Test Client ' + getNextId(),
		type: UserType.Client,
		...data,
	})
}

const getSchedule = () => {
	const daysOfWeek = [
		DayOfWeek.Sunday,
		DayOfWeek.Monday,
		DayOfWeek.Tuesday,
		DayOfWeek.Wednesday,
		DayOfWeek.Thursday,
		DayOfWeek.Friday,
		DayOfWeek.Saturday,
	]

	const startTime = new Date()
	startTime.setHours(9, 0, 0, 0)
	const endTime = new Date()
	endTime.setDate(startTime.getDate() + 1)
	endTime.setHours(21, 0, 0, 0)

	return daysOfWeek.map(day => ({
		dayOfWeek: day,
		startTime,
		endTime,
	}))
}
export async function createTestProvider(
	data: Partial<Prisma.UserCreateInput> = {},
) {
	return await createTestUser({
		name: 'Test Provider ' + getNextId(),
		type: UserType.Provider,
		schedule: { create: getSchedule() },
		...data,
	})
}

export async function createTestService(
	data: Partial<Prisma.ServiceCreateInput> = {},
) {
	const serviceData: Prisma.ServiceCreateInput = {
		id: generateId(),
		title: 'Test Service',
		body: 'Test Service Body',
		duration: 60,
		slug: 'test-service' + getNextId(),
		hint: 'Test Service Hint',
		order: Math.random(),
		...data,
	}

	return await prisma.service.upsert({
		where: { id: serviceData.id },
		create: serviceData,
		update: serviceData,
	})
}

export async function createTestAppointment(
	data: Partial<Prisma.AppointmentCreateInput> = {},
) {
	const appointmentData: Prisma.AppointmentCreateInput = {
		id: generateId(),
		windowStart: new Date(),
		windowEnd: new Date(),
		service: data.service ?? {
			connect: { id: (await createTestService()).id },
		},
		client: data.client ?? {
			connect: { id: (await createTestClient()).id },
		},
		provider: data.provider ?? {
			connect: { id: (await createTestProvider()).id },
		},
		...data,
	}

	return await prisma.appointment.upsert({
		where: { id: appointmentData.id },
		create: appointmentData,
		update: appointmentData,
	})
}

export async function createTestBlockedTime(
	data: Partial<Prisma.BlockedTimeCreateInput> = {},
) {
	const blockedTimeData: Prisma.BlockedTimeCreateInput = {
		id: generateId(),
		start: new Date(),
		end: new Date(),
		reason: 'Test Blocked Time',
		provider: data.provider ?? {
			connect: { id: (await createTestProvider()).id },
		},
		...data,
	}

	return await prisma.blockedTime.upsert({
		where: { id: blockedTimeData.id },
		create: blockedTimeData,
		update: blockedTimeData,
	})
}

export async function clearAllData() {
	await prisma.weeklySchedule.deleteMany()
	await prisma.user.deleteMany()
	await prisma.appointment.deleteMany()
	await prisma.service.deleteMany()
}
