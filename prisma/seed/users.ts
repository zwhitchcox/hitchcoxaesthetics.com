import { prisma } from '#app/utils/db.server'

const DAYS_OF_WEEK = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
] as const

const getSchedule = () => {
	const daysOfWeek = [...DAYS_OF_WEEK]

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

async function users() {
	const users = [
		{
			id: 'zane',
			email: 'zwhitchcox@gmail.com',
			phone: '18652101404',
			name: 'Zane Hitchcox',
			type: 'Client',
		},
		{
			id: 'sarah',
			email: 'sarahahitchcox@gmail.com',
			phone: '18652489365',
			name: 'Sarah Hitchcox',
			type: 'Provider',
		},
	]

	for (const user of users) {
		const data = {
			id: user.id,
			email: user.email,
			phone: user.phone,
			name: user.name,
			type: user.type,
		}

		await prisma.user.upsert({
			where: {
				id: user.id,
			},
			create: data,
			update: data,
		})

		if (user.id === 'sarah') {
			const schedule = getSchedule()
			for (const day of schedule) {
				const data = {
					userId: user.id,
					dayOfWeek: day.dayOfWeek,
					startTime: day.startTime,
					endTime: day.endTime,
				}
				await prisma.weeklySchedule.upsert({
					where: {
						userId_dayOfWeek: {
							userId: user.id,
							dayOfWeek: day.dayOfWeek,
						},
					},
					create: data,
					update: data,
				})
			}
		}
	}

	console.log('Users seeded successfully')
}

async function seed() {
	await users()
	console.log(`Database has been seeded. 🌱`)
}

seed()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => await prisma.$disconnect())
