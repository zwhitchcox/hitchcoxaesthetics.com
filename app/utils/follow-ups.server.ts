import {
	callRailFetch,
	getCallRailAccountIds,
	normalizePhoneNumber,
} from '#app/utils/callrail-booking.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * Follow-up tracking.
 *
 * A FollowUp row is created automatically when call analysis recommends one
 * (see callrail-posthog-conversions.server.ts) or manually from
 * /admin/follow-ups. A pending follow-up is marked contacted when we see an
 * outbound call to that customer placed after the follow-up was created:
 *
 * - CallRail: outbound calls through tracking numbers, via the CallRail API.
 * - Google Voice: only available when the number is on Google Workspace
 *   Voice, via the Admin Reports "voice" audit log. Consumer Google Voice
 *   has no API at all, so those calls can only be marked manually.
 */

const OUTBOUND_LOOKBACK_DAYS = 35
const GOOGLE_TOKEN_ID = 'google-voice'
const GOOGLE_OAUTH_SCOPES = [
	'https://www.googleapis.com/auth/admin.reports.audit.readonly',
	'openid',
	'email',
]

type OutboundCall = {
	id: string
	phone: string
	startedAt: Date
	via: 'callrail_outbound' | 'google_voice'
}

export async function syncFollowUpContacts({ db = prisma } = {}) {
	const pending = await db.followUp.findMany({
		where: { status: 'pending' },
		select: { id: true, customerPhone: true, createdAt: true },
	})
	const stats = {
		ok: true as const,
		pending: pending.length,
		contacted: 0,
		callrail_outbound_calls: 0,
		google_voice_calls: 0,
		google_voice_error: null as string | null,
	}
	if (pending.length === 0) return stats

	const outbound: OutboundCall[] = []

	const callrailCalls = await listCallRailOutboundCalls().catch(error => {
		console.warn('CallRail outbound call listing failed', error)
		return []
	})
	outbound.push(...callrailCalls)
	stats.callrail_outbound_calls = callrailCalls.length

	const voice = await listGoogleVoiceOutboundCalls({ db })
	if (voice.ok) {
		outbound.push(...voice.calls)
		stats.google_voice_calls = voice.calls.length
	} else {
		stats.google_voice_error = voice.error
	}

	for (const followUp of pending) {
		const phone = normalizePhoneNumber(followUp.customerPhone)
		if (!phone) continue
		const match = outbound.find(
			call => call.phone === phone && call.startedAt > followUp.createdAt,
		)
		if (!match) continue
		await db.followUp.update({
			where: { id: followUp.id },
			data: {
				status: 'contacted',
				contactedAt: match.startedAt,
				contactedVia: match.via,
				contactedRef: match.id,
			},
		})
		stats.contacted += 1
	}

	return stats
}

async function listCallRailOutboundCalls(): Promise<OutboundCall[]> {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	if (!apiKey) return []
	const since = new Date(
		Date.now() - OUTBOUND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
	)
	const accountIds = await getCallRailAccountIds(apiKey)
	const calls: OutboundCall[] = []
	for (const accountId of accountIds) {
		const params = new URLSearchParams({
			call_type: 'outbound',
			date_range: 'recent', // last 30 days
			fields: 'id,customer_phone_number,start_time,answered',
			order: 'desc',
			per_page: '250',
			sort: 'start_time',
		})
		const response = await callRailFetch(apiKey, `/a/${accountId}/calls.json`, {
			method: 'GET',
			params,
		})
		const pageCalls = Array.isArray(response.calls) ? response.calls : []
		for (const call of pageCalls as {
			id?: string
			customer_phone_number?: string
			start_time?: string
		}[]) {
			const phone = normalizePhoneNumber(call.customer_phone_number)
			const startedAt = call.start_time ? new Date(call.start_time) : null
			if (!call.id || !phone || !startedAt || Number.isNaN(startedAt.getTime()))
				continue
			if (startedAt < since) continue
			calls.push({
				id: call.id,
				phone,
				startedAt,
				via: 'callrail_outbound',
			})
		}
	}
	return calls
}

// --- Google Voice (Workspace) ---

export function getGoogleOAuthConfig() {
	const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
	const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
	if (!clientId || !clientSecret) return null
	return { clientId, clientSecret }
}

export function buildGoogleOAuthUrl({
	redirectUri,
	state,
}: {
	redirectUri: string
	state: string
}) {
	const config = getGoogleOAuthConfig()
	if (!config) return null
	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: GOOGLE_OAUTH_SCOPES.join(' '),
		access_type: 'offline',
		prompt: 'consent',
		state,
	})
	return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeGoogleOAuthCode({
	code,
	redirectUri,
	db = prisma,
}: {
	code: string
	redirectUri: string
	db?: typeof prisma
}) {
	const config = getGoogleOAuthConfig()
	if (!config) return { ok: false as const, error: 'missing_google_oauth_env' }
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri,
		}),
	})
	const data = (await response.json().catch(() => null)) as {
		access_token?: string
		refresh_token?: string
		expires_in?: number
		scope?: string
		id_token?: string
	} | null
	if (!response.ok || !data?.access_token) {
		return { ok: false as const, error: `google_token_http_${response.status}` }
	}

	const accountEmail = data.id_token ? decodeJwtEmail(data.id_token) : null
	await db.googleOAuthToken.upsert({
		where: { id: GOOGLE_TOKEN_ID },
		create: {
			id: GOOGLE_TOKEN_ID,
			accountEmail,
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? null,
			scope: data.scope ?? null,
			expiresAt: data.expires_in
				? new Date(Date.now() + data.expires_in * 1000)
				: null,
		},
		update: {
			accountEmail,
			accessToken: data.access_token,
			// Google only returns a refresh token on the first consent
			...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
			scope: data.scope ?? null,
			expiresAt: data.expires_in
				? new Date(Date.now() + data.expires_in * 1000)
				: null,
		},
	})
	return { ok: true as const, accountEmail }
}

export async function getGoogleVoiceConnection(db = prisma) {
	return db.googleOAuthToken.findUnique({ where: { id: GOOGLE_TOKEN_ID } })
}

export async function disconnectGoogleVoice(db = prisma) {
	await db.googleOAuthToken
		.delete({ where: { id: GOOGLE_TOKEN_ID } })
		.catch(() => {})
}

async function getFreshGoogleAccessToken(db = prisma) {
	const token = await getGoogleVoiceConnection(db)
	if (!token) return { ok: false as const, error: 'google_not_connected' }
	const isExpired =
		!token.expiresAt || token.expiresAt.getTime() < Date.now() + 60_000
	if (!isExpired) return { ok: true as const, accessToken: token.accessToken }

	const config = getGoogleOAuthConfig()
	if (!config || !token.refreshToken) {
		return { ok: false as const, error: 'google_token_expired_no_refresh' }
	}
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: 'refresh_token',
			refresh_token: token.refreshToken,
		}),
	})
	const data = (await response.json().catch(() => null)) as {
		access_token?: string
		expires_in?: number
	} | null
	if (!response.ok || !data?.access_token) {
		return {
			ok: false as const,
			error: `google_refresh_http_${response.status}`,
		}
	}
	await db.googleOAuthToken.update({
		where: { id: GOOGLE_TOKEN_ID },
		data: {
			accessToken: data.access_token,
			expiresAt: data.expires_in
				? new Date(Date.now() + data.expires_in * 1000)
				: null,
		},
	})
	return { ok: true as const, accessToken: data.access_token }
}

/**
 * Reads outbound calls from the Google Workspace Admin Reports "voice" audit
 * log. Returns a structured error when the account is not connected or the
 * Voice audit log is unavailable (e.g. consumer Google Voice).
 */
async function listGoogleVoiceOutboundCalls({
	db = prisma,
}): Promise<
	{ ok: true; calls: OutboundCall[] } | { ok: false; error: string }
> {
	const tokenResult = await getFreshGoogleAccessToken(db)
	if (!tokenResult.ok) return tokenResult

	const since = new Date(
		Date.now() - OUTBOUND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
	)
	const url = new URL(
		'https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/voice',
	)
	url.searchParams.set('eventName', 'call_outbound')
	url.searchParams.set('startTime', since.toISOString())
	url.searchParams.set('maxResults', '500')

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
	})
	if (!response.ok) {
		return { ok: false, error: `google_voice_audit_http_${response.status}` }
	}
	const data = (await response.json().catch(() => null)) as {
		items?: {
			id?: { time?: string; uniqueQualifier?: string }
			events?: {
				name?: string
				parameters?: { name?: string; value?: string }[]
			}[]
		}[]
	} | null

	const calls: OutboundCall[] = []
	for (const item of data?.items ?? []) {
		const startedAt = item.id?.time ? new Date(item.id.time) : null
		if (!startedAt || Number.isNaN(startedAt.getTime())) continue
		for (const event of item.events ?? []) {
			const destination = event.parameters?.find(parameter =>
				['destination_phone_number', 'callee_phone_number'].includes(
					parameter.name ?? '',
				),
			)?.value
			const phone = normalizePhoneNumber(destination)
			if (!phone) continue
			calls.push({
				id: item.id?.uniqueQualifier ?? `${phone}:${startedAt.toISOString()}`,
				phone,
				startedAt,
				via: 'google_voice',
			})
		}
	}
	return { ok: true, calls }
}

function decodeJwtEmail(idToken: string): string | null {
	try {
		const payload = idToken.split('.')[1]
		if (!payload) return null
		const decoded = JSON.parse(
			Buffer.from(payload, 'base64url').toString('utf8'),
		) as { email?: string }
		return typeof decoded.email === 'string' ? decoded.email : null
	} catch {
		return null
	}
}
