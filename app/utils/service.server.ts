import { prisma } from '#/app/utils/db.server'

export function getServices() {
	return prisma.service.findMany()
}
