import dotenv from 'dotenv'

import { syncBoulevardRealRevenue } from '#app/utils/blvd-revenue-sync.server.ts'
import { prisma } from '#app/utils/db.server.ts'

dotenv.config()

type Args = {
	apply: boolean
	days?: number
	limit?: number
	since?: Date
	until?: Date
}

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false }

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]
		if (arg === '--') continue
		if (arg === '--apply') {
			args.apply = true
			continue
		}
		if (arg === '--days') {
			args.days = parsePositiveInteger(argv[index + 1])
			index++
			continue
		}
		if (arg.startsWith('--days=')) {
			args.days = parsePositiveInteger(arg.slice('--days='.length))
			continue
		}
		if (arg === '--limit') {
			args.limit = parsePositiveInteger(argv[index + 1])
			index++
			continue
		}
		if (arg.startsWith('--limit=')) {
			args.limit = parsePositiveInteger(arg.slice('--limit='.length))
			continue
		}
		if (arg === '--since') {
			args.since = parseDateArg(argv[index + 1], '--since')
			index++
			continue
		}
		if (arg.startsWith('--since=')) {
			args.since = parseDateArg(arg.slice('--since='.length), '--since')
			continue
		}
		if (arg === '--until') {
			args.until = parseDateArg(argv[index + 1], '--until')
			index++
			continue
		}
		if (arg.startsWith('--until=')) {
			args.until = parseDateArg(arg.slice('--until='.length), '--until')
			continue
		}

		throw new Error(`Unknown argument: ${arg}`)
	}

	if (args.days && !args.since) {
		args.since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000)
	}

	return args
}

function parsePositiveInteger(value: string | undefined) {
	if (!value) return undefined
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseDateArg(value: string | undefined, name: string) {
	if (!value) throw new Error(`${name} requires an ISO date value`)
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		throw new Error(`${name} must be a valid ISO date`)
	}
	return date
}

const args = parseArgs(process.argv.slice(2))

try {
	const result = await syncBoulevardRealRevenue({
		dryRun: !args.apply,
		limit: args.limit,
		since: args.since,
		until: args.until,
	})

	console.log(JSON.stringify(result, null, 2))
	if (!args.apply) {
		console.log(
			'Run again with --apply to import revenue and update attributed CallRail calls.',
		)
	}
	if (!result.ok) process.exitCode = 1
} finally {
	await prisma.$disconnect()
}
