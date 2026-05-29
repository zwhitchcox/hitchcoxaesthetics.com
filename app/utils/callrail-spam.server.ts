import { z } from 'zod'

const CALLRAIL_API_BASE_URL = 'https://api.callrail.com/v3'

const optionalTrimmedString = z.preprocess(
	value => (value === null ? undefined : value),
	z.string().trim().optional(),
)

export const callRailSpamInputSchema = z.object({
	account_id: optionalTrimmedString,
	caller_phone_number: optionalTrimmedString,
	callrail_call_id: optionalTrimmedString,
	reason: optionalTrimmedString,
})

type CallRailSpamInput = z.output<typeof callRailSpamInputSchema>

type CallRailCall = {
	customer_phone_number?: string | null
	id?: string | null
	start_time?: string | null
}

export async function markCallRailCallerAsSpam(input: CallRailSpamInput) {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) {
		throw new Error('CALLRAIL_API_KEY is required.')
	}

	const normalizedCallerPhone = normalizePhoneNumber(input.caller_phone_number)
	const note = [
		'Marked as spam by Sarah Hitchcox Aesthetics Retell booking agent.',
		input.reason ? `Reason: ${input.reason}` : null,
	].filter(Boolean).join(' ')

	if (!input.callrail_call_id && !normalizedCallerPhone) {
		return {
			ok: false,
			blocked: false,
			callrail_marked_spam: false,
			should_end_call: true,
			error: 'missing_caller_phone_number',
			message:
				'No CallRail call id or caller phone number was provided, so the caller could not be marked as spam in CallRail. End this spam call anyway.',
		}
	}

	const accountIds = input.account_id
		? [input.account_id]
		: await getCallRailAccountIds(apiKey)

	if (input.callrail_call_id) {
		const accountId = accountIds[0]
		if (!accountId) throw new Error('No CallRail account was found.')
		const call = await updateCallRailCall(apiKey, accountId, input.callrail_call_id, {
			note,
			spam: true,
		})
		return buildSpamResult({ accountId, call, matchedBy: 'callrail_call_id' })
	}

	const callerPhoneNumber = normalizedCallerPhone
	if (!callerPhoneNumber) {
		throw new Error('Expected caller phone number after validation.')
	}

	for (const accountId of accountIds) {
		const call = await findCallByPhone(apiKey, accountId, callerPhoneNumber)
		if (!call?.id) continue

		const updatedCall = await updateCallRailCall(apiKey, accountId, call.id, {
			note,
			spam: true,
		})
		return buildSpamResult({
			accountId,
		call: updatedCall,
		matchedBy: 'caller_phone_number',
		})
	}

	return {
		ok: false,
		blocked: false,
		callrail_marked_spam: false,
		should_end_call: true,
		error: 'callrail_call_not_found',
		message:
			'No CallRail call was found for this caller. The caller may not have entered through a CallRail tracking number. End this spam call anyway.',
		caller_phone_number: callerPhoneNumber,
	}
}

async function getCallRailAccountIds(apiKey: string) {
	if (process.env.CALLRAIL_ACCOUNT_ID?.trim()) {
		return [process.env.CALLRAIL_ACCOUNT_ID.trim()]
	}

	const response = await callRailFetch(apiKey, '/a.json', { method: 'GET' })
	const accounts = Array.isArray(response.accounts) ? response.accounts : []
	return accounts
		.map(account =>
			account && typeof account === 'object'
				? (account as Record<string, unknown>).id
				: null,
		)
		.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

async function findCallByPhone(
	apiKey: string,
	accountId: string,
	callerPhoneNumber: string,
) {
	return (
		(await findCallByPhoneInDateRange(
			apiKey,
			accountId,
			callerPhoneNumber,
			'recent',
		)) ??
		(await findCallByPhoneInDateRange(
			apiKey,
			accountId,
			callerPhoneNumber,
			'all_time',
		))
	)
}

async function findCallByPhoneInDateRange(
	apiKey: string,
	accountId: string,
	callerPhoneNumber: string,
	dateRange: 'all_time' | 'recent',
) {
	const params = new URLSearchParams({
		call_type: 'inbound',
		date_range: dateRange,
		fields: 'company_id,company_name,formatted_customer_phone_number,tags',
		order: 'desc',
		per_page: '10',
		search: callerPhoneNumber,
		sort: 'start_time',
	})
	const response = await callRailFetch(apiKey, `/a/${accountId}/calls.json`, {
		method: 'GET',
		params,
	})
	const calls = Array.isArray(response.calls) ? response.calls : []
	return (
		calls.find(call => {
			if (!call || typeof call !== 'object') return false
			const candidate = call as CallRailCall
			return normalizePhoneNumber(candidate.customer_phone_number) === callerPhoneNumber
		}) as CallRailCall | undefined
	)
}

async function updateCallRailCall(
	apiKey: string,
	accountId: string,
	callId: string,
	body: Record<string, unknown>,
) {
	return callRailFetch(apiKey, `/a/${accountId}/calls/${callId}.json`, {
		body,
		method: 'PUT',
	})
}

async function callRailFetch(
	apiKey: string,
	path: string,
	{
		body,
		method,
		params,
	}: {
		body?: Record<string, unknown>
		method: 'GET' | 'PUT'
		params?: URLSearchParams
	},
) {
	const url = new URL(`${CALLRAIL_API_BASE_URL}${path}`)
	if (params) url.search = params.toString()

	const response = await fetch(url, {
		body: body ? JSON.stringify(body) : undefined,
		headers: {
			Authorization: `Token token=${apiKey}`,
			'Content-Type': 'application/json',
		},
		method,
	})
	const payload = (await response.json().catch(() => null)) as
		| Record<string, unknown>
		| null

	if (!response.ok) {
		throw new Error(
			`CallRail ${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
		)
	}

	return payload ?? {}
}

function buildSpamResult({
	accountId,
	call,
	matchedBy,
}: {
	accountId: string
	call: Record<string, unknown>
	matchedBy: string
}) {
	return {
		ok: true,
		blocked: true,
		callrail_marked_spam: true,
		should_end_call: true,
		account_id: accountId,
		call_id: typeof call.id === 'string' ? call.id : null,
		caller_phone_number:
			typeof call.customer_phone_number === 'string'
				? call.customer_phone_number
				: null,
		matched_by: matchedBy,
		message:
			'Marked this CallRail call as spam. CallRail will challenge this caller in the future.',
	}
}

function normalizePhoneNumber(value?: string | null) {
	const trimmed = value?.trim()
	if (!trimmed) return null

	const digits = trimmed.replace(/\D/g, '')
	if (!digits) return null
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (trimmed.startsWith('+')) return trimmed
	return `+${digits}`
}
