import { prisma } from '#app/utils/db.server.ts'

/**
 * Call tagging taxonomy. The database is the source of truth (editable from
 * /admin/call-tags); this file holds the seed defaults so the taxonomy can
 * also be adjusted in code. Run ensureCallTagDefaults() to add any missing
 * groups/tags without touching existing ones.
 *
 * Groups marked `exclusive` force the AI to pick exactly one tag; otherwise
 * it picks all that apply.
 */

export type CallTagGroupDefinition = {
	name: string
	description: string
	exclusive: boolean
	tags: { value: string; description?: string }[]
}

export const DEFAULT_CALL_TAXONOMY: CallTagGroupDefinition[] = [
	{
		name: 'outcome',
		description: 'How the call ended',
		exclusive: true,
		tags: [
			{
				value: 'booked',
				description: 'An appointment was booked on this call',
			},
			{ value: 'rescheduled' },
			{ value: 'cancelled_appt' },
			{ value: 'transferred', description: 'Handed to a human' },
			{ value: 'message_taken' },
			{
				value: 'info_only',
				description: 'Got an answer, nothing to follow up',
			},
			{ value: 'callback_planned' },
			{ value: 'lost', description: 'Hung up unsatisfied or gave up' },
			{ value: 'wrong_number_or_spam' },
			{ value: 'dropped', description: 'Call ended abruptly mid-conversation' },
		],
	},
	{
		name: 'disposition',
		description:
			'What kind of caller this was. Separates real booking prospects from everyone else so prospect metrics are not polluted.',
		exclusive: true,
		tags: [
			{
				value: 'booking_prospect',
				description: 'A potential customer who wanted or considered booking',
			},
			{
				value: 'existing_appointment_question',
				description:
					'Asking about an appointment they already have (confirm, reschedule, cancel, directions, prep)',
			},
			{
				value: 'general_question_only',
				description:
					'Asked a question with no interest in booking now or later',
			},
			{
				value: 'service_not_offered',
				description: 'Wanted a service we do not provide',
			},
			{
				value: 'bot_or_marketing',
				description: 'Robocall, vendor pitch, marketing or sales person',
			},
			{ value: 'job_seeker' },
			{ value: 'wrong_number_or_spam' },
			{ value: 'unclear' },
		],
	},
	{
		name: 'why_not_booked',
		description:
			'For prospective customers who could have booked but did not. Skip for booked calls and non-prospects.',
		exclusive: true,
		tags: [
			{ value: 'wanted_human', description: 'Refused to proceed with the AI' },
			{
				value: 'just_researching',
				description: 'Price shopping or gathering info',
			},
			{ value: 'no_suitable_time' },
			{ value: 'price_concern' },
			{
				value: 'card_objection',
				description: 'Did not want to provide a card',
			},
			{
				value: 'needs_medical_answer',
				description: 'Needed clinical guidance first',
			},
			{ value: 'service_not_offered' },
			{ value: 'agent_failure', description: 'The AI itself caused the loss' },
			{ value: 'call_dropped' },
			{ value: 'other' },
		],
	},
	{
		name: 'agent_mistake',
		description:
			'Mistakes the AI receptionist made on this call. Pick all that apply; omit when the agent performed well.',
		exclusive: false,
		tags: [
			{
				value: 'misheard_request',
				description: 'Misunderstood what the caller asked for',
			},
			{ value: 'booked_wrong_service' },
			{
				value: 'failed_transfer',
				description: 'Tried to transfer and it did not connect',
			},
			{
				value: 'wrong_information',
				description: 'Gave incorrect pricing, hours, or policy',
			},
			{
				value: 'couldnt_find_service',
				description: 'Service exists but agent could not book it',
			},
			{
				value: 'ignored_request',
				description: 'Caller asked for something and the agent talked past it',
			},
			{ value: 'long_silence_or_glitch' },
			{ value: 'premature_hangup' },
		],
	},
	{
		name: 'topics',
		description: 'What the call touched on',
		exclusive: false,
		tags: [
			{ value: 'botox_tox' },
			{ value: 'filler' },
			{ value: 'laser' },
			{ value: 'weight_loss' },
			{ value: 'microneedling' },
			{ value: 'skincare' },
			{ value: 'membership_or_package' },
			{ value: 'gift_certificate' },
			{ value: 'price_question' },
			{ value: 'insurance_question' },
			{ value: 'hours_or_location_question' },
			{ value: 'job_inquiry' },
			{ value: 'vendor_pitch' },
			{ value: 'complaint' },
		],
	},
	{
		name: 'caller',
		description: 'Who was calling',
		exclusive: true,
		tags: [
			{ value: 'new_client' },
			{ value: 'existing_client' },
			{
				value: 'not_a_client',
				description: 'Vendor, job seeker, wrong number',
			},
			{ value: 'unknown' },
		],
	},
	{
		name: 'flags',
		description: 'Operational follow-up signals',
		exclusive: false,
		tags: [
			{ value: 'asked_for_human' },
			{ value: 'frustrated_with_ai' },
			{
				value: 'follow_up_needed',
				description: 'A human should call this person back',
			},
			{
				value: 'urgent_same_day',
				description: 'Wanted an appointment today/tomorrow',
			},
			{ value: 'spanish_language' },
		],
	},
]

export type CallTaxonomy = {
	name: string
	description: string | null
	exclusive: boolean
	tags: { value: string; description: string | null }[]
}[]

let seeded = false

export async function ensureCallTagDefaults(db = prisma) {
	for (const [groupIndex, group] of DEFAULT_CALL_TAXONOMY.entries()) {
		const existing = await db.callTagGroup.upsert({
			where: { name: group.name },
			create: {
				name: group.name,
				description: group.description,
				exclusive: group.exclusive,
				order: groupIndex,
			},
			update: {},
			select: { id: true },
		})
		for (const [tagIndex, tag] of group.tags.entries()) {
			await db.callTag.upsert({
				where: { groupId_value: { groupId: existing.id, value: tag.value } },
				create: {
					groupId: existing.id,
					value: tag.value,
					description: tag.description,
					order: tagIndex,
				},
				update: {},
			})
		}
	}
}

export async function getCallTaxonomy(db = prisma): Promise<CallTaxonomy> {
	if (!seeded) {
		await ensureCallTagDefaults(db)
		seeded = true
	}
	const groups = await db.callTagGroup.findMany({
		where: { active: true },
		orderBy: { order: 'asc' },
		select: {
			name: true,
			description: true,
			exclusive: true,
			tags: {
				where: { active: true },
				orderBy: { order: 'asc' },
				select: { value: true, description: true },
			},
		},
	})
	return groups.filter(group => group.tags.length > 0)
}

/** Renders the taxonomy as prompt instructions plus the expected JSON shape. */
export function buildTaxonomyPromptSection(taxonomy: CallTaxonomy) {
	const lines: string[] = []
	const shape: string[] = []
	for (const group of taxonomy) {
		const options = group.tags
			.map(tag =>
				tag.description
					? `"${tag.value}" (${tag.description})`
					: `"${tag.value}"`,
			)
			.join(', ')
		if (group.exclusive) {
			lines.push(
				`- "${group.name}": pick exactly ONE of: ${options}. ${group.description ?? ''} Use null only if truly not applicable.`,
			)
			shape.push(`  "${group.name}": string | null`)
		} else {
			lines.push(
				`- "${group.name}": array, pick ALL that apply from: ${options}. ${group.description ?? ''} Use [] when none apply.`,
			)
			shape.push(`  "${group.name}": string[]`)
		}
	}
	return { instructions: lines.join('\n'), shape: shape.join(',\n') }
}

/** Validates AI selections against the taxonomy, dropping unknown values. */
export function validateTagSelections(
	taxonomy: CallTaxonomy,
	raw: Record<string, unknown>,
) {
	const result: Record<string, string | string[] | null> = {}
	for (const group of taxonomy) {
		const allowed = new Set(group.tags.map(tag => tag.value))
		const value = raw[group.name]
		if (group.exclusive) {
			result[group.name] =
				typeof value === 'string' && allowed.has(value) ? value : null
		} else {
			result[group.name] = Array.isArray(value)
				? value.filter(
						(item): item is string =>
							typeof item === 'string' && allowed.has(item),
					)
				: []
		}
	}
	return result
}
