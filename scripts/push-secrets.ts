import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { parse as parseDotenv } from 'dotenv'

type PushSecretsArgs = {
	dryRun: boolean
	envFile: string
	flyApp?: string
	flyDeploy: boolean
	githubOnly: boolean
	githubRepo?: string
	flyOnly: boolean
}

const GITHUB_SECRET_NAMES = [
	'FLY_API_TOKEN',
	'SENTRY_AUTH_TOKEN',
	'RETELL_API_KEY',
	'RETELL_TOOL_URL_TOKEN',
	'RETELL_TOOL_SHARED_SECRET',
] as const

const GITHUB_REQUIRED_SECRET_NAMES = [
	'FLY_API_TOKEN',
	'RETELL_API_KEY',
	'RETELL_TOOL_URL_TOKEN',
	'RETELL_TOOL_SHARED_SECRET',
] as const

const FLY_REQUIRED_SECRET_NAMES = [
	'BLVD_API_KEY',
	'BLVD_BUSINESS_ID',
	'BLVD_SECRET_KEY',
	'RETELL_TOOL_URL_TOKEN',
	'RETELL_TOOL_SHARED_SECRET',
	'RESEND_API_KEY',
] as const

const FLY_OPTIONAL_SECRET_NAMES = [
	'ALLOW_INDEXING',
	'BLVD_APPOINTMENT_URL_TEMPLATE',
	'BLVD_CLIENT_URL_TEMPLATE',
	'CALLRAIL_ACCOUNT_ID',
	'CALLRAIL_API_KEY',
	'DEFAULT_PROVIDER',
	'GA_CONVERSION_ID',
	'GA_CONVERSION_LABEL',
	'GA_PHONE_NUMBER',
	'GOOGLE_MAPS_API_KEY',
	'RETELL_CALL_URL_TEMPLATE',
	'RETELL_STAFF_MESSAGE_FROM_EMAIL',
	'RETELL_STAFF_MESSAGE_TO_EMAIL',
	'SENTRY_DSN',
] as const

const args = parseArgs(process.argv.slice(2))
const env = loadEnv(args.envFile)
const flyApp = args.flyApp ?? readFlyAppName()

if (!args.flyOnly) {
	await pushGithubSecrets(env, args)
}

if (!args.githubOnly) {
	await pushFlySecrets(env, args, flyApp)
}

async function pushGithubSecrets(
	env: Record<string, string>,
	args: PushSecretsArgs,
) {
	const secrets = pickSecrets(env, GITHUB_SECRET_NAMES, {
		required: GITHUB_REQUIRED_SECRET_NAMES,
		target: 'GitHub Actions',
	})
	const input = formatDotenv(secrets)
	const commandArgs = ['secret', 'set', '--app', 'actions', '-f', '-']
	if (args.githubRepo) commandArgs.push('--repo', args.githubRepo)

	if (args.dryRun) {
		printDryRun('GitHub Actions', Object.keys(secrets))
		return
	}

	await runWithInput('gh', commandArgs, input)
}

async function pushFlySecrets(
	env: Record<string, string>,
	args: PushSecretsArgs,
	flyApp: string,
) {
	const secrets = {
		...pickSecrets(env, FLY_REQUIRED_SECRET_NAMES, {
			required: FLY_REQUIRED_SECRET_NAMES,
			target: 'Fly',
		}),
		...pickSecrets(env, FLY_OPTIONAL_SECRET_NAMES, {
			required: [],
			target: 'Fly',
		}),
	}
	const input = formatDotenv(secrets)
	const commandArgs = ['secrets', 'import', '--app', flyApp]
	if (!args.flyDeploy) commandArgs.push('--stage')

	if (args.dryRun) {
		printDryRun(
			`Fly app ${flyApp}${args.flyDeploy ? '' : ' (staged)'}`,
			Object.keys(secrets),
		)
		return
	}

	await runWithInput('fly', commandArgs, input)
}

function loadEnv(envFile: string) {
	if (!existsSync(envFile)) {
		throw new Error(`Env file not found: ${envFile}`)
	}

	const env = {
		...process.env,
		...parseDotenv(readFileSync(envFile)),
	}
	if (!env.RETELL_TOOL_URL_TOKEN?.trim() && env.RETELL_TOOL_SHARED_SECRET) {
		env.RETELL_TOOL_URL_TOKEN = env.RETELL_TOOL_SHARED_SECRET
	}
	if (!env.FLY_API_TOKEN?.trim()) {
		env.FLY_API_TOKEN = readFlyAuthToken()
	}
	return env
}

function readFlyAuthToken() {
	try {
		return execFileSync('fly', ['auth', 'token'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim()
	} catch {
		return ''
	}
}

function pickSecrets<TName extends string>(
	env: Record<string, string>,
	names: readonly TName[],
	{
		required,
		target,
	}: {
		required: readonly TName[]
		target: string
	},
) {
	const picked: Partial<Record<TName, string>> = {}
	const missing: string[] = []

	for (const name of names) {
		const value = env[name]?.trim()
		if (value) picked[name] = value
		else if (required.includes(name)) missing.push(name)
	}

	if (missing.length) {
		throw new Error(
			`${target} secrets are missing from ${args.envFile}: ${missing.join(', ')}`,
		)
	}

	return picked as Record<TName, string>
}

function formatDotenv(secrets: Record<string, string>) {
	return Object.entries(secrets)
		.map(([name, value]) => `${name}=${formatDotenvValue(value)}`)
		.join('\n')
}

function formatDotenvValue(value: string) {
	return `"${value
		.replace(/\\/g, '\\\\')
		.replace(/\n/g, '\\n')
		.replace(/"/g, '\\"')}"`
}

async function runWithInput(
	command: string,
	args: string[],
	input: string,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['pipe', 'inherit', 'inherit'],
		})
		child.stdin.end(input)
		child.on('error', reject)
		child.on('close', code => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
			}
		})
	})
}

function readFlyAppName() {
	const flyToml = readFileSync('fly.toml', 'utf8')
	const match = flyToml.match(/^app\s*=\s*"([^"]+)"/m)
	if (!match?.[1]) {
		throw new Error('Could not read app name from fly.toml. Pass --fly-app=...')
	}
	return match[1]
}

function printDryRun(target: string, names: string[]) {
	console.log(`${target}: would push ${names.length} secrets`)
	for (const name of names.sort()) console.log(`- ${name}`)
}

function parseArgs(argv: string[]): PushSecretsArgs {
	let dryRun = false
	let envFile = '.env'
	let flyApp: string | undefined
	let flyDeploy = false
	let flyOnly = false
	let githubOnly = false
	let githubRepo: string | undefined

	for (const arg of argv) {
		if (arg === '--') {
			continue
		} else if (arg === '--dry-run') {
			dryRun = true
		} else if (arg === '--fly-deploy') {
			flyDeploy = true
		} else if (arg === '--fly-only') {
			flyOnly = true
		} else if (arg === '--github-only') {
			githubOnly = true
		} else if (arg.startsWith('--env-file=')) {
			envFile = arg.slice('--env-file='.length)
		} else if (arg.startsWith('--fly-app=')) {
			flyApp = arg.slice('--fly-app='.length)
		} else if (arg.startsWith('--github-repo=')) {
			githubRepo = arg.slice('--github-repo='.length)
		} else {
			throw new Error(`Unknown argument: ${arg}`)
		}
	}

	if (flyOnly && githubOnly) {
		throw new Error('Use only one of --fly-only or --github-only.')
	}

	return {
		dryRun,
		envFile,
		flyApp,
		flyDeploy,
		flyOnly,
		githubOnly,
		githubRepo,
	}
}
