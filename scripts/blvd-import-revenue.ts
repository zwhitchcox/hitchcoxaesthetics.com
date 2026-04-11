import fs from 'node:fs/promises'
import path from 'node:path'

import dotenv from 'dotenv'

import {
	boulevardRevenueItemInputSchema,
	upsertBlvdRevenueItem,
} from '#app/utils/blvd-attribution.server.ts'
import { prisma } from '#app/utils/db.server.ts'

dotenv.config()

function parseArgs(argv: string[]) {
	let inputPath: string | null = null

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]
		if (arg === '--input') {
			inputPath = argv[index + 1] ?? null
			index++
			continue
		}

		if (arg.startsWith('--input=')) {
			inputPath = arg.slice('--input='.length)
		}
	}

	return { inputPath }
}

async function main() {
	const { inputPath } = parseArgs(process.argv.slice(2))
	if (!inputPath) {
		throw new Error(
			'Usage: pnpm blvd:import-revenue --input path/to/revenue.json',
		)
	}

	const absolutePath = path.resolve(process.cwd(), inputPath)
	const raw = await fs.readFile(absolutePath, 'utf8')
	const parsed = JSON.parse(raw) as unknown

	if (!Array.isArray(parsed)) {
		throw new Error('Revenue input must be a JSON array')
	}

	let imported = 0
	for (const entry of parsed) {
		const input = boulevardRevenueItemInputSchema.parse(entry)
		await upsertBlvdRevenueItem(input)
		imported++
	}

	console.log(
		`Imported ${imported} Boulevard revenue items from ${absolutePath}`,
	)
	await prisma.$disconnect()
}

main().catch(async error => {
	console.error(error instanceof Error ? error.message : error)
	await prisma.$disconnect()
	process.exit(1)
})
