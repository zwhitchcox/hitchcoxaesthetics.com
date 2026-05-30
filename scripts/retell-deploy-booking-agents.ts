import { execFileSync } from 'node:child_process'
import { config as loadDotenv } from 'dotenv'

import {
	buildRetellBookingPrompt,
	getRetellBookingBeginMessage,
	upsertRetellTools,
} from './retell-booking-agent-config.ts'
import {
	type RetellBookingAgentBrand,
	type RetellBookingBrandKey,
	getRetellBookingAgentBrand,
	getRetellBookingAgentBrandKeys,
} from './retell-booking-brands.ts'

loadDotenv({ override: true })

const RETELL_API_BASE_URL = 'https://api.retellai.com'
const REQUIRED_PHONE_NUMBER_TYPE = 'retell-twilio'

type RetellAgent = {
	agent_id?: string
	agent_name?: string
	response_engine?: {
		llm_id?: string
		type?: string
		version?: number
	}
	voice_id?: string
}

type DeployArgs = {
	allowNgrok: boolean
	baseUrl?: string
	brandKeys: RetellBookingBrandKey[]
	commitMessage?: string
	commitSha?: string
	dryRun: boolean
	skipPhoneBind: boolean
}

type DeployMetadata = {
	commitMessage: string | null
	commitSha: string | null
}

const args = parseArgs(process.argv.slice(2))
const apiKey = process.env.RETELL_API_KEY?.trim()
const sharedSecret = process.env.RETELL_TOOL_SHARED_SECRET?.trim()
const voiceId =
	process.env.RETELL_DEPLOY_AGENT_VOICE_ID?.trim() ??
	process.env.RETELL_TEST_AGENT_VOICE_ID?.trim() ??
	'openai-Cimo'
const realtimeModel =
	process.env.RETELL_DEPLOY_AGENT_S2S_MODEL?.trim() ??
	process.env.RETELL_TEST_AGENT_S2S_MODEL?.trim() ??
	'gpt-realtime-2'
const textModel =
	process.env.RETELL_DEPLOY_AGENT_MODEL?.trim() ??
	process.env.RETELL_TEST_AGENT_MODEL?.trim() ??
	'gpt-5.1'

if (!apiKey) throw new Error('RETELL_API_KEY is required.')

const publicUrl = getDeployBaseUrl(args)
const normalizedBaseUrl = publicUrl.replace(/\/+$/, '')
const deployMetadata = getDeployMetadata(args)
const toolHeaders = sharedSecret
	? { 'x-retell-tool-secret': sharedSecret }
	: undefined

const deployed = []
for (const brandKey of args.brandKeys) {
	const brand = getRetellBookingAgentBrand(brandKey)
	const result = await deployBrand(brandKey, brand)
	deployed.push(result)
}

console.log(JSON.stringify({ deployed, dry_run: args.dryRun }, null, 2))

async function deployBrand(
	brandKey: RetellBookingBrandKey,
	brand: RetellBookingAgentBrand,
) {
	const existingAgent = brand.agentId
		? await getAgent(brand.agentId).catch(() => null)
		: await findAgentByName(brand.agentName)
	const existingLlmId = brand.llmId ?? existingAgent?.response_engine?.llm_id
	const existingLlm = existingLlmId
		? await retellFetch(
				`/get-retell-llm/${existingLlmId}`,
				undefined,
				'GET',
			).catch(() => null)
		: null
	const existingTools = readArray(existingLlm, 'general_tools')
	const tools = upsertRetellTools({
		brand,
		publicUrl: normalizedBaseUrl,
		toolHeaders,
		tools: existingTools,
	})
	const releaseAgentName = formatDeploymentAgentName(
		brand.agentName,
		deployMetadata,
	)
	const llmPayload = {
		begin_message: getRetellBookingBeginMessage(brand.agentDisplayName, brand),
		general_prompt: [
			formatDeploymentPromptHeader(deployMetadata),
			buildRetellBookingPrompt(brand),
		]
			.filter(Boolean)
			.join('\n\n'),
		general_tools: tools,
		model_temperature: 0,
		start_speaker: 'agent',
		tool_call_strict_mode: true,
		...(realtimeModel ? { s2s_model: realtimeModel } : { model: textModel }),
	}

	let llmId = existingLlmId
	if (!args.dryRun) {
		const llm = existingLlmId
			? await retellFetch(`/update-retell-llm/${existingLlmId}`, llmPayload)
			: await retellFetch('/create-retell-llm', llmPayload, 'POST')
		llmId = readRequiredString(llm, 'llm_id')
	}

	let agentId = existingAgent?.agent_id ?? brand.agentId
	if (!args.dryRun) {
		const agentPayload = {
			agent_name: releaseAgentName,
			response_engine: {
				llm_id: llmId,
				type: 'retell-llm',
			},
			voice_id: voiceId,
		}
		const agent = agentId
			? await retellFetch(`/update-agent/${agentId}`, agentPayload)
			: await retellFetch('/create-agent', agentPayload, 'POST')
		agentId = readRequiredString(agent, 'agent_id')
	}

	let phoneNumberBound = false
	if (!args.skipPhoneBind && brand.phoneNumber && agentId && !args.dryRun) {
		await bindPhoneNumberToAgent(brand.phoneNumber, agentId)
		phoneNumberBound = true
	}

	return {
		agent_id: agentId,
		agent_name: releaseAgentName,
		brand: brandKey,
		begin_message: llmPayload.begin_message,
		commit_message: deployMetadata.commitMessage,
		commit_sha: deployMetadata.commitSha,
		llm_id: llmId,
		phone_number: brand.phoneNumber ?? null,
		phone_number_bound: phoneNumberBound,
		service_focus: brand.serviceFocus ?? 'all',
		webhook_base_url: normalizedBaseUrl,
	}
}

async function findAgentByName(agentName: string): Promise<RetellAgent | null> {
	const agents = (await retellFetch(
		'/list-agents',
		undefined,
		'GET',
	)) as unknown
	if (!Array.isArray(agents)) return null

	const matches = agents
		.filter((agent): agent is RetellAgent => {
			return (
				agent &&
				typeof agent === 'object' &&
				agentNameMatches((agent as RetellAgent).agent_name, agentName)
			)
		})
		.sort(
			(a, b) =>
				(b.response_engine?.version ?? -1) - (a.response_engine?.version ?? -1),
		)
	return matches[0] ?? null
}

async function getAgent(agentId: string): Promise<RetellAgent> {
	const agent = (await retellFetch(
		`/get-agent/${encodeURIComponent(agentId)}`,
		undefined,
		'GET',
	)) as RetellAgent
	if (!agent || typeof agent !== 'object' || !agent.agent_id) {
		throw new Error(`Retell agent not found: ${agentId}`)
	}
	return agent
}

async function bindPhoneNumberToAgent(phoneNumber: string, agentId: string) {
	const phoneNumberRecord = (await retellFetch(
		`/get-phone-number/${encodeURIComponent(phoneNumber)}`,
		undefined,
		'GET',
	)) as Record<string, unknown>
	const type =
		typeof phoneNumberRecord.phone_number_type === 'string'
			? phoneNumberRecord.phone_number_type
			: null
	if (type !== REQUIRED_PHONE_NUMBER_TYPE) {
		throw new Error(
			`Refusing to bind ${phoneNumber} because it is ${type ?? 'unknown type'}, not ${REQUIRED_PHONE_NUMBER_TYPE}.`,
		)
	}

	await retellFetch(`/update-phone-number/${encodeURIComponent(phoneNumber)}`, {
		inbound_agent_id: agentId,
		inbound_agents: [
			{
				agent_id: agentId,
				weight: 1,
			},
		],
		inbound_webhook_url: null,
	})
}

function getDeployBaseUrl(args: DeployArgs) {
	const baseUrl =
		args.baseUrl ??
		process.env.RETELL_DEPLOY_WEBHOOK_BASE_URL?.trim() ??
		process.env.RETELL_AGENT_WEBHOOK_BASE_URL?.trim()

	if (!baseUrl) {
		throw new Error(
			'Set RETELL_DEPLOY_WEBHOOK_BASE_URL or pass --base-url=https://... before deploying Retell agents.',
		)
	}

	if (!args.allowNgrok && /\.ngrok(-free)?\.app/i.test(baseUrl)) {
		throw new Error(
			`Refusing to deploy production agents to ngrok URL ${baseUrl}. Pass --allow-ngrok only for a temporary test deploy.`,
		)
	}

	return baseUrl
}

async function retellFetch(
	path: string,
	body?: Record<string, unknown>,
	method = 'PATCH',
) {
	const response = await fetch(`${RETELL_API_BASE_URL}${path}`, {
		body: body ? JSON.stringify(body) : undefined,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		method,
	})
	const payload = (await response.json().catch(() => null)) as unknown
	if (!response.ok) {
		throw new Error(
			`Retell ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
		)
	}
	return payload
}

function parseArgs(argv: string[]): DeployArgs {
	const brandKeys = new Set<RetellBookingBrandKey>()
	let allowNgrok = false
	let baseUrl: string | undefined
	let commitMessage: string | undefined
	let commitSha: string | undefined
	let dryRun = false
	let skipPhoneBind = false

	for (const arg of argv) {
		if (arg === '--') {
			continue
		} else if (arg === '--allow-ngrok') {
			allowNgrok = true
		} else if (arg === '--dry-run') {
			dryRun = true
		} else if (arg === '--skip-phone-bind') {
			skipPhoneBind = true
		} else if (arg.startsWith('--base-url=')) {
			baseUrl = arg.slice('--base-url='.length)
		} else if (arg.startsWith('--brand=')) {
			const value = arg.slice('--brand='.length)
			if (value === 'all') {
				getRetellBookingAgentBrandKeys().forEach(key => brandKeys.add(key))
			} else {
				assertBrandKey(value)
				brandKeys.add(value)
			}
		} else if (arg.startsWith('--commit-message=')) {
			commitMessage = arg.slice('--commit-message='.length)
		} else if (arg.startsWith('--commit-sha=')) {
			commitSha = arg.slice('--commit-sha='.length)
		} else {
			throw new Error(`Unknown argument: ${arg}`)
		}
	}

	if (brandKeys.size === 0) {
		getRetellBookingAgentBrandKeys().forEach(key => brandKeys.add(key))
	}

	return {
		allowNgrok,
		baseUrl,
		brandKeys: [...brandKeys],
		commitMessage,
		commitSha,
		dryRun,
		skipPhoneBind,
	}
}

function getDeployMetadata(args: DeployArgs): DeployMetadata {
	const commitSha =
		normalizeWhitespace(
			args.commitSha ??
				process.env.RETELL_DEPLOY_COMMIT_SHA ??
				readGitText(['rev-parse', 'HEAD']),
		) || null
	const commitMessage =
		normalizeMultiline(
			args.commitMessage ??
				process.env.RETELL_DEPLOY_COMMIT_MESSAGE ??
				readGitText(['log', '-1', '--pretty=%B']),
		) || null

	return { commitMessage, commitSha }
}

function readGitText(args: string[]) {
	try {
		return execFileSync('git', args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		})
	} catch {
		return undefined
	}
}

function formatDeploymentAgentName(
	agentName: string,
	metadata: DeployMetadata,
) {
	if (!metadata.commitSha) return agentName
	const shortSha = metadata.commitSha.slice(0, 7)
	const subject = getCommitSubject(metadata.commitMessage)
	return subject
		? `${agentName} @ ${shortSha}: ${truncate(subject, 42)}`
		: `${agentName} @ ${shortSha}`
}

function formatDeploymentPromptHeader(metadata: DeployMetadata) {
	if (!metadata.commitSha && !metadata.commitMessage) return ''
	return [
		'Internal release description:',
		metadata.commitSha ? `Commit hash: ${metadata.commitSha}` : null,
		metadata.commitMessage ? `Commit message: ${metadata.commitMessage}` : null,
		'This is internal deployment metadata only. Do not mention it to callers.',
	]
		.filter(Boolean)
		.join('\n')
}

function getCommitSubject(commitMessage: string | null) {
	return (
		commitMessage
			?.split('\n')
			.find(line => line.trim())
			?.trim() ?? ''
	)
}

function agentNameMatches(actualName: string | undefined, baseName: string) {
	if (!actualName) return false
	return actualName === baseName || actualName.startsWith(`${baseName} @ `)
}

function normalizeWhitespace(value: string | undefined) {
	return value?.replace(/\s+/g, ' ').trim()
}

function normalizeMultiline(value: string | undefined) {
	return value
		?.replace(/\r\n/g, '\n')
		.split('\n')
		.map(line => line.trimEnd())
		.join('\n')
		.trim()
}

function truncate(value: string, maxLength: number) {
	if (value.length <= maxLength) return value
	return `${value.slice(0, maxLength - 3).trimEnd()}...`
}

function assertBrandKey(value: string): asserts value is RetellBookingBrandKey {
	if (
		!getRetellBookingAgentBrandKeys().includes(value as RetellBookingBrandKey)
	) {
		throw new Error(
			`Unknown brand "${value}". Use one of: ${getRetellBookingAgentBrandKeys().join(', ')}, all.`,
		)
	}
}

function readArray(value: unknown, key: string) {
	if (!value || typeof value !== 'object') return []
	const raw = (value as Record<string, unknown>)[key]
	return Array.isArray(raw) ? raw : []
}

function readRequiredString(value: unknown, key: string) {
	if (!value || typeof value !== 'object') {
		throw new Error(`Expected Retell response object with ${key}.`)
	}
	const record = value as Record<string, unknown>
	if (typeof record[key] !== 'string' || !record[key]) {
		throw new Error(`Expected Retell response field ${key}.`)
	}
	return record[key]
}
