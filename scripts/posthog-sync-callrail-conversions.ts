import dotenv from 'dotenv'

import { syncCallRailPhoneConversionsToPostHog } from '#app/utils/callrail-posthog-conversions.server.ts'

dotenv.config()

type Args = {
	accountIds: string[]
	apply: boolean
	days?: number
	limit?: number
	since?: Date
	until?: Date
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		accountIds: [],
		apply: false,
	}

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]
		if (arg === '--apply') {
			args.apply = true
			continue
		}
		if (arg === '--account-id') {
			const accountId = argv[index + 1]?.trim()
			if (accountId) args.accountIds.push(accountId)
			index++
			continue
		}
		if (arg.startsWith('--account-id=')) {
			const accountId = arg.slice('--account-id='.length).trim()
			if (accountId) args.accountIds.push(accountId)
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
		}
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
const result = await syncCallRailPhoneConversionsToPostHog({
	accountIds: args.accountIds,
	dryRun: !args.apply,
	limit: args.limit,
	since: args.since,
	until: args.until,
})

console.log(JSON.stringify(result, null, 2))
if (!args.apply) {
	console.log('Run again with --apply to capture events in PostHog.')
}

if (!result.ok) process.exitCode = 1
