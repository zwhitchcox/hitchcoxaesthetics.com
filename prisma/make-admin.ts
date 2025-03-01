import { PrismaClient } from '@prisma/client'

/**
 * This script makes a user an admin by their phone number
 * Usage: pnpm tsx prisma/make-admin.ts "+15551234567"
 */

async function makeUserAdmin(phoneNumber: string) {
	const prisma = new PrismaClient()

	try {
		console.log(`Looking for user with phone number: ${phoneNumber}...`)

		// Find the user
		const user = await prisma.user.findFirst({
			where: { phone: phoneNumber },
			include: { roles: true },
		})

		if (!user) {
			console.error(`❌ User with phone number ${phoneNumber} not found`)
			process.exit(1)
		}

		console.log(
			`Found user: ${user.name || user.phone || 'Unknown'} (ID: ${user.id})`,
		)

		// Check if admin role exists
		const adminRole = await prisma.role.findUnique({
			where: { name: 'admin' },
		})

		if (!adminRole) {
			console.log(`Creating admin role...`)
			// Create admin role if it doesn't exist
			await prisma.role.create({
				data: {
					name: 'admin',
					description: 'Administrator with full access',
				},
			})
			console.log(`✅ Created admin role`)
		}

		// Check if user already has admin role
		const hasAdminRole = user.roles.some(role => role.name === 'admin')

		if (hasAdminRole) {
			console.log(`✅ User already has admin role`)
			return
		}

		// Add admin role to user
		await prisma.user.update({
			where: { id: user.id },
			data: {
				roles: {
					connect: { name: 'admin' },
				},
			},
		})

		console.log(`✅ Successfully made user with phone ${phoneNumber} an admin`)
	} catch (error) {
		console.error('Error making user admin:', error)
		process.exit(1)
	} finally {
		await prisma.$disconnect()
	}
}

// Get phone number from command line args
const phoneNumber = process.argv[2]

if (!phoneNumber) {
	console.error('❌ Please provide a user phone number')
	console.log('Usage: pnpm tsx prisma/make-admin.ts "+15551234567"')
	process.exit(1)
}

makeUserAdmin(phoneNumber).catch(error => {
	console.error('Error:', error)
	process.exit(1)
})
