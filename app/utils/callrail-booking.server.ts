export const CALLRAIL_API_BASE_URL = 'https://api.callrail.com/v3'
export const CALLRAIL_CALL_FIELDS = [
	'id',
	'company_id',
	'company_name',
	'customer_name',
	'customer_phone_number',
	'formatted_customer_phone_number',
	'start_time',
	'lead_status',
	'value',
	'tags',
	'session_uuid',
	'person_id',
	'timeline_url',
	'source',
	'source_name',
	'medium',
	'landing_page_url',
	'last_requested_url',
	'referring_url',
	'referrer_domain',
	'utm_campaign',
	'utm_content',
	'utm_medium',
	'utm_source',
	'utm_term',
	'gclid',
	'fbclid',
	'msclkid',
	'custom',
	'duration',
	'answered',
	'recording',
	'source_name',
].join(',')

const POSTHOG_SESSION_CUSTOM_KEYS = [
	'sha_posthog_session_id',
	'posthog_session_id',
	'ph_session_id',
]
const POSTHOG_DISTINCT_CUSTOM_KEYS = [
	'sha_posthog_distinct_id',
	'posthog_distinct_id',
	'ph_distinct_id',
]

export type CallRailCall = {
	customer_phone_number?: string | null
	id?: string | null
	start_time?: string | null
	[key: string]: unknown
}

type ReportCallRailBookingInput = {
	appointmentIds: string[]
	bookingChannel?: string | null
	boulevardClientId?: string | null
	callrailAccountId?: string | null
	callrailCallId?: string | null
	callerPhoneNumber?: string | null
	cartId?: string | null
	customerName?: string | null
	locationName?: string | null
	projectedRevenueUsd: number
	serviceName?: string | null
	startTime?: string | null
}

type ReportCallRailRealRevenueInput = {
	attributionTouchId?: string | null
	bookingCartId?: string | null
	callrailAccountId?: string | null
	callrailCallId: string
	currency?: string | null
	customerName?: string | null
	firstRevenueAt?: string | null
	lastRevenueAt?: string | null
	revenueItemCount: number
	serviceNames: string[]
	totalGrossRevenueUsd: number
}

type FindCallRailCallInput = {
	callrailAccountId?: string | null
	callrailCallId?: string | null
	callerPhoneNumber?: string | null
}

export type CallRailCallAttributionResult = {
	account_id?: string | null
	call_id?: string | null
	callrail_call_id?: string | null
	callrail_landing_page_url?: string | null
	callrail_last_requested_url?: string | null
	callrail_medium?: string | null
	callrail_person_id?: string | null
	callrail_referrer_domain?: string | null
	callrail_referring_url?: string | null
	callrail_reported?: boolean
	callrail_session_id?: string | null
	callrail_source?: string | null
	callrail_timeline_url?: string | null
	caller_phone_number?: string | null
	error?: string
	matched_by?: string
	ok: boolean
	posthog_distinct_id?: string | null
	posthog_session_id?: string | null
}

export async function reportCallRailBookingConversion(
	input: ReportCallRailBookingInput,
) {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) {
		return {
			ok: false,
			callrail_reported: false,
			error: 'missing_callrail_api_key',
		}
	}

	const normalizedCallerPhone = normalizePhoneNumber(input.callerPhoneNumber)
	if (!input.callrailCallId && !normalizedCallerPhone) {
		return {
			ok: false,
			callrail_reported: false,
			error: 'missing_caller_phone_number',
		}
	}

	let accountIds: string[] | null = null
	const getAccountIds = async () =>
		(accountIds ??= await getCallRailAccountIds(apiKey))
	const updateBody = buildBookingCallRailUpdate(input)

	if (input.callrailCallId) {
		const callrailAccountIds = input.callrailAccountId?.trim()
			? [input.callrailAccountId.trim()]
			: await getAccountIds()
		if (callrailAccountIds.length === 0) {
			throw new Error('No CallRail account was found.')
		}
		for (const accountId of callrailAccountIds) {
			const call = await updateCallRailCall(
				apiKey,
				accountId,
				input.callrailCallId,
				updateBody,
			).catch(error => {
				console.error('Failed to update CallRail call by id', error)
				return null
			})
			if (!call) continue
			const detailedCall = await getCallRailCall(
				apiKey,
				accountId,
				input.callrailCallId,
			).catch(() => call)
			return buildReportResult({
				accountId,
				call: detailedCall,
				matchedBy: 'callrail_call_id',
			})
		}
		if (!normalizedCallerPhone) {
			return {
				ok: false,
				callrail_reported: false,
				error: 'callrail_call_not_found',
			}
		}
	}

	for (const accountId of await getAccountIds()) {
		const call = await findCallByPhone(
			apiKey,
			accountId,
			normalizedCallerPhone!,
		)
		if (!call?.id) continue

		const updatedCall = await updateCallRailCall(
			apiKey,
			accountId,
			call.id,
			updateBody,
		)
		const detailedCall = await getCallRailCall(
			apiKey,
			accountId,
			call.id,
		).catch(() => updatedCall)
		return buildReportResult({
			accountId,
			call: detailedCall,
			matchedBy: 'caller_phone_number',
		})
	}

	return {
		ok: false,
		callrail_reported: false,
		error: 'callrail_call_not_found',
		caller_phone_number: normalizedCallerPhone,
	}
}

export async function findRecentCallRailCallForCaller(
	input: FindCallRailCallInput,
): Promise<CallRailCallAttributionResult> {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) {
		return {
			ok: false,
			error: 'missing_callrail_api_key',
		}
	}

	const normalizedCallerPhone = normalizePhoneNumber(input.callerPhoneNumber)
	const accountIds = input.callrailAccountId?.trim()
		? [input.callrailAccountId.trim()]
		: await getCallRailAccountIds(apiKey)

	if (input.callrailCallId) {
		for (const accountId of accountIds) {
			const call = await getCallRailCall(
				apiKey,
				accountId,
				input.callrailCallId,
			).catch(error => {
				console.error('Failed to retrieve CallRail call by id', error)
				return null
			})
			if (!call?.id) continue
			return buildAttributionResult({
				accountId,
				call,
				matchedBy: 'callrail_call_id',
			})
		}
	}

	if (!normalizedCallerPhone) {
		return {
			ok: false,
			error: 'missing_caller_phone_number',
		}
	}

	for (const accountId of accountIds) {
		const call = await findCallByPhone(apiKey, accountId, normalizedCallerPhone)
		if (!call?.id) continue
		return buildAttributionResult({
			accountId,
			call,
			matchedBy: 'caller_phone_number',
		})
	}

	return {
		ok: false,
		error: 'callrail_call_not_found',
		caller_phone_number: normalizedCallerPhone,
	}
}

export async function reportCallRailRealRevenueConversion(
	input: ReportCallRailRealRevenueInput,
) {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) {
		return {
			ok: false,
			callrail_reported: false,
			error: 'missing_callrail_api_key',
		}
	}

	const body = buildRealRevenueCallRailUpdate(input)
	const accountIds = input.callrailAccountId?.trim()
		? [input.callrailAccountId.trim()]
		: await getCallRailAccountIds(apiKey)
	for (const accountId of accountIds) {
		const call = await updateCallRailCall(
			apiKey,
			accountId,
			input.callrailCallId,
			body,
		).catch(error => {
			console.error('Failed to update CallRail call with real revenue', error)
			return null
		})
		if (!call) continue
		return {
			account_id: accountId,
			callrail_call_id: input.callrailCallId,
			callrail_reported: true,
			ok: true,
		}
	}

	return {
		ok: false,
		callrail_reported: false,
		error: 'callrail_call_not_found',
	}
}

function buildBookingCallRailUpdate(input: ReportCallRailBookingInput) {
	const value = formatCurrencyValue(input.projectedRevenueUsd)
	const bookingChannel = input.bookingChannel?.toLowerCase()
	const tags = [
		'Booked Appointment',
		bookingChannel?.includes('retell') ? 'Retell Booking' : 'Online Booking',
	]

	return {
		append_tags: true,
		customer_name: input.customerName || undefined,
		lead_status: 'good_lead',
		note: buildBookingNote(input, value),
		tags,
		value,
	}
}

function buildRealRevenueCallRailUpdate(input: ReportCallRailRealRevenueInput) {
	const value = formatCurrencyValue(input.totalGrossRevenueUsd)
	return {
		append_tags: true,
		customer_name: input.customerName || undefined,
		lead_status: 'good_lead',
		note: buildRealRevenueNote(input, value),
		tags: ['Booked Appointment', 'Real Revenue Recorded'],
		value,
	}
}

function buildRealRevenueNote(
	input: ReportCallRailRealRevenueInput,
	value: string,
) {
	return [
		'Actual Boulevard revenue recorded.',
		`Actual revenue: $${value}`,
		`Revenue item count: ${input.revenueItemCount}`,
		input.serviceNames.length > 0
			? `Service(s): ${input.serviceNames.join(', ')}`
			: null,
		input.firstRevenueAt ? `First revenue at: ${input.firstRevenueAt}` : null,
		input.lastRevenueAt ? `Last revenue at: ${input.lastRevenueAt}` : null,
		input.attributionTouchId
			? `Attribution touch ID: ${input.attributionTouchId}`
			: null,
		input.bookingCartId ? `Boulevard cart ID: ${input.bookingCartId}` : null,
	]
		.filter(Boolean)
		.join('\n')
}

function buildBookingNote(input: ReportCallRailBookingInput, value: string) {
	return [
		'Booked appointment.',
		input.bookingChannel ? `Channel: ${input.bookingChannel}` : null,
		input.serviceName ? `Service: ${input.serviceName}` : null,
		input.locationName ? `Location: ${input.locationName}` : null,
		input.startTime ? `Appointment time: ${input.startTime}` : null,
		`Projected revenue: $${value}`,
		input.appointmentIds.length > 0
			? `Boulevard appointment ID(s): ${input.appointmentIds.join(', ')}`
			: null,
		input.boulevardClientId
			? `Boulevard client ID: ${input.boulevardClientId}`
			: null,
		input.cartId ? `Boulevard cart ID: ${input.cartId}` : null,
	]
		.filter(Boolean)
		.join('\n')
}

function formatCurrencyValue(value: number) {
	const finiteValue = Number.isFinite(value) ? value : 0
	return finiteValue.toFixed(2)
}

export async function getCallRailAccountIds(apiKey: string) {
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
		fields: CALLRAIL_CALL_FIELDS,
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
	return calls.find(call => {
		if (!call || typeof call !== 'object') return false
		const candidate = call as CallRailCall
		return (
			normalizePhoneNumber(candidate.customer_phone_number) ===
			callerPhoneNumber
		)
	}) as CallRailCall | undefined
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

async function getCallRailCall(
	apiKey: string,
	accountId: string,
	callId: string,
) {
	const params = new URLSearchParams({
		fields: CALLRAIL_CALL_FIELDS,
	})
	return callRailFetch(apiKey, `/a/${accountId}/calls/${callId}.json`, {
		method: 'GET',
		params,
	})
}

export async function callRailFetch(
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
	const payload = (await response.json().catch(() => null)) as Record<
		string,
		unknown
	> | null

	if (!response.ok) {
		throw new Error(
			`CallRail ${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
		)
	}

	return payload ?? {}
}

function buildReportResult({
	accountId,
	call,
	matchedBy,
}: {
	accountId: string
	call: Record<string, unknown>
	matchedBy: string
}) {
	return {
		...buildAttributionResult({ accountId, call, matchedBy }),
		ok: true,
		callrail_reported: true,
	}
}

function buildAttributionResult({
	accountId,
	call,
	matchedBy,
}: {
	accountId: string
	call: Record<string, unknown>
	matchedBy: string
}): CallRailCallAttributionResult {
	const callId = pickOptionalString(call.id)
	const custom = getRecord(call.custom)
	return {
		ok: true,
		account_id: accountId,
		call_id: callId,
		callrail_call_id: callId,
		caller_phone_number: pickOptionalString(call.customer_phone_number),
		callrail_session_id: pickOptionalString(call.session_uuid),
		callrail_person_id: pickOptionalString(call.person_id),
		callrail_timeline_url: pickOptionalString(call.timeline_url),
		callrail_source:
			pickOptionalString(call.source) ?? pickOptionalString(call.source_name),
		callrail_medium: pickOptionalString(call.medium),
		callrail_landing_page_url: pickOptionalString(call.landing_page_url),
		callrail_last_requested_url: pickOptionalString(call.last_requested_url),
		callrail_referring_url: pickOptionalString(call.referring_url),
		callrail_referrer_domain: pickOptionalString(call.referrer_domain),
		matched_by: matchedBy,
		posthog_distinct_id: pickFirstString(custom, POSTHOG_DISTINCT_CUSTOM_KEYS),
		posthog_session_id: pickFirstString(custom, POSTHOG_SESSION_CUSTOM_KEYS),
	}
}

export function normalizePhoneNumber(value?: string | null) {
	const trimmed = value?.trim()
	if (!trimmed) return null

	const digits = trimmed.replace(/\D/g, '')
	if (!digits) return null
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (trimmed.startsWith('+')) return trimmed
	return `+${digits}`
}

function getRecord(value: unknown) {
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null
}

function pickOptionalString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function pickFirstString(
	record: Record<string, unknown> | null,
	keys: readonly string[],
) {
	if (!record) return null
	for (const key of keys) {
		const value = pickOptionalString(record[key])
		if (value) return value
	}
	return null
}
