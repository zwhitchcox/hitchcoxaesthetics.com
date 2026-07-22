/**
 * Recent CallRail activity (calls + text messages) for one client phone
 * number. Used by the appointment performance report to answer "why did this
 * appointment cancel?" with the client's actual communication trail.
 */
import {
	callRailFetch,
	getCallRailAccountIds,
	normalizePhoneNumber,
} from '#app/utils/callrail-booking.server.ts'

export type ClientComm = {
	kind: 'call' | 'text'
	at: string
	direction: 'inbound' | 'outbound'
	/** call: duration + answered state; text: the message content (trimmed). */
	summary: string
}

const MAX_COMMS_PER_CLIENT = 6

export async function getRecentClientComms(
	phone: string | null | undefined,
): Promise<ClientComm[]> {
	const apiKey = process.env.CALLRAIL_API_KEY?.trim()
	const normalized = normalizePhoneNumber(phone)
	if (!apiKey || !normalized) return []

	const comms: ClientComm[] = []
	const accountIds = await getCallRailAccountIds(apiKey).catch(() => [])
	for (const accountId of accountIds) {
		const [callsRes, textsRes] = await Promise.all([
			callRailFetch(apiKey, `/a/${accountId}/calls.json`, {
				method: 'GET',
				params: new URLSearchParams({
					date_range: 'recent',
					fields: 'start_time,direction,duration,answered,customer_phone_number',
					order: 'desc',
					per_page: '10',
					search: normalized,
					sort: 'start_time',
				}),
			}).catch(() => null),
			callRailFetch(apiKey, `/a/${accountId}/text-messages.json`, {
				method: 'GET',
				params: new URLSearchParams({ search: normalized, per_page: '5' }),
			}).catch(() => null),
		])

		for (const call of (Array.isArray(callsRes?.calls) ? callsRes.calls : []) as Array<
			Record<string, any>
		>) {
			if (normalizePhoneNumber(call.customer_phone_number) !== normalized) continue
			const minutes = Math.round(Number(call.duration ?? 0) / 60)
			comms.push({
				kind: 'call',
				at: String(call.start_time ?? ''),
				direction: String(call.direction ?? '').includes('out')
					? 'outbound'
					: 'inbound',
				summary: call.answered
					? `${minutes || '<1'} min call`
					: 'missed / not answered',
			})
		}

		for (const convo of (Array.isArray(textsRes?.conversations)
			? textsRes.conversations
			: []) as Array<Record<string, any>>) {
			if (
				normalizePhoneNumber(convo.customer_phone_number) !== normalized
			)
				continue
			for (const msg of (Array.isArray(convo.recent_messages)
				? convo.recent_messages
				: []) as Array<Record<string, any>>) {
				comms.push({
					kind: 'text',
					at: String(msg.created_at ?? convo.last_message_at ?? ''),
					direction: String(msg.direction ?? '').includes('out')
						? 'outbound'
						: 'inbound',
					summary: String(msg.content ?? '').slice(0, 140),
				})
			}
		}
	}

	return comms
		.filter(c => c.at)
		.sort((a, b) => b.at.localeCompare(a.at))
		.slice(0, MAX_COMMS_PER_CLIENT)
}
