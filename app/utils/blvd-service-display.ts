export type BookingClientHistory = 'returning' | 'new' | 'unsure'

export type BookingServiceClientFit =
	| 'returning_client'
	| 'new_client'
	| 'neutral'

export type BlvdServiceDisplayInput = {
	categoryName?: string | null
	id?: string | null
	name: string
}

export type PopularBlvdService = {
	name: string
	recentBookingCount: number
}

export type BlvdServiceDisplayGroup = {
	displayCategoryName: string
	displayName: string
	id: string
	searchAliases: string[]
	serviceIdsByClientHistory: Record<BookingClientHistory, string>
}

const NEW_CLIENT_TOX_SERVICE_ID =
	'urn:blvd:Service:b293ac32-1e70-47e7-9a6c-fcd0478aec85'
const EXISTING_CLIENT_TOX_SERVICE_ID =
	'urn:blvd:Service:ce6af60c-c8b7-464c-9c33-75ce8cc6972c'

export const BLVD_CUSTOMER_BOOKING_BLOCKED_SERVICE_IDS = new Set([
	'urn:blvd:Service:16a2cb2f-f7da-4b60-9a5a-6b60bd06b38f',
])

export const BLVD_SERVICE_DISPLAY_GROUPS: BlvdServiceDisplayGroup[] = [
	{
		displayCategoryName: 'Injectables',
		displayName: 'Tox (Botox, Dysport, Jeuveau, Xeomin)',
		id: 'tox',
		searchAliases: ['botox', 'dysport', 'jeuveau', 'xeomin', 'wrinkle relaxer'],
		serviceIdsByClientHistory: {
			new: NEW_CLIENT_TOX_SERVICE_ID,
			returning: EXISTING_CLIENT_TOX_SERVICE_ID,
			unsure: NEW_CLIENT_TOX_SERVICE_ID,
		},
	},
]

const SERVICE_DISPLAY_GROUP_BY_SERVICE_ID = new Map(
	BLVD_SERVICE_DISPLAY_GROUPS.flatMap(group =>
		getBlvdServiceDisplayGroupServiceIds(group).map(serviceId => [
			serviceId,
			group,
		]),
	),
)

export const POPULAR_BLVD_SERVICES: PopularBlvdService[] = [
	{ name: 'Weight Loss Injection (In Person)', recentBookingCount: 193 },
	{
		name: 'Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		recentBookingCount: 153,
	},
	{
		name: 'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		recentBookingCount: 111,
	},
	{ name: 'Weight Loss Consultation (In-Person)', recentBookingCount: 100 },
	{ name: 'Lip Flip', recentBookingCount: 99 },
	{ name: 'Laser Hair Reduction - Large Area', recentBookingCount: 62 },
	{ name: 'Consultation: Skincare/Injectables', recentBookingCount: 50 },
	{ name: 'Laser Hair Reduction - Medium Area', recentBookingCount: 47 },
	{ name: 'Existing Client Filler', recentBookingCount: 41 },
	{ name: 'New Client Tox & Filler', recentBookingCount: 25 },
	{ name: 'Vascular Lesion Reduction', recentBookingCount: 24 },
	{ name: 'Existing Client Microneedling', recentBookingCount: 21 },
	{ name: 'VI Peel - Advanced', recentBookingCount: 21 },
	{ name: 'Laser Hair Reduction - Small Area', recentBookingCount: 20 },
	{ name: 'Lipotropic B12 Injection', recentBookingCount: 20 },
	{ name: 'New Client Filler', recentBookingCount: 17 },
	{ name: 'Existing Client Tox & Filler', recentBookingCount: 14 },
	{ name: 'KYBELLA®', recentBookingCount: 13 },
	{
		name: 'Pigmented Lesion Reduction (Brown/Sun Spots)',
		recentBookingCount: 13,
	},
	{ name: 'Hylenex® - Filler Dissolve', recentBookingCount: 12 },
	{ name: 'New Client Microneedling', recentBookingCount: 10 },
	{ name: 'Non-Surgical Skin Tightening (EVERESSE)', recentBookingCount: 10 },
	{ name: 'Touch Up Laser Treatment - Small Area', recentBookingCount: 10 },
	{ name: 'VI Peel - Original', recentBookingCount: 10 },
]

const POPULARITY_BY_NORMALIZED_NAME = new Map(
	POPULAR_BLVD_SERVICES.map(service => [
		normalizeBlvdServiceKey(service.name),
		service.recentBookingCount,
	]),
)

export function getBlvdServiceDisplayGroupForServiceId(serviceId: string) {
	return SERVICE_DISPLAY_GROUP_BY_SERVICE_ID.get(serviceId) ?? null
}

export function getBlvdServiceDisplayGroupServiceIdForClientHistory(
	group: BlvdServiceDisplayGroup,
	clientHistory: BookingClientHistory,
) {
	return group.serviceIdsByClientHistory[clientHistory]
}

export function getBlvdServiceDisplayGroupServiceIds(
	group: BlvdServiceDisplayGroup,
) {
	return [...new Set(Object.values(group.serviceIdsByClientHistory))]
}

export function getCustomerFacingBlvdServiceName(name: string) {
	const normalizedName = normalizeBlvdServiceKey(name)

	if (
		normalizedName.includes('tox filler follow up') ||
		normalizedName.includes('tox follow up') ||
		normalizedName.includes('filler follow up')
	) {
		return 'Tox/Filler Follow-Up'
	}

	if (normalizedName.includes('tox') && normalizedName.includes('filler')) {
		return 'Tox & Filler'
	}

	if (isToxServiceName(normalizedName)) {
		return 'Tox (Botox, Dysport, Jeuveau, Xeomin)'
	}

	return name
		.replace(/\b(?:New|Existing)\s+(?:Client|Patient)\s*[-:]*\s*/gi, '')
		.replace(/\s*-\s*(?:New|Existing)\s+Patient\b/gi, '')
		.replace(/\s*\|\s*\*?In Person\*?/gi, '')
		.replace(/\s*\((?:In[-\s]?Person|In Person)\)\s*/gi, '')
		.replace(/\s+/g, ' ')
		.trim()
}

export function getCustomerFacingBlvdCategoryName(name: string) {
	return name
		.replace(/\b(?:New|Existing)\s+Patient\s*-\s*/gi, '')
		.replace(/\b(?:New|Existing)\s+Client\s*-\s*/gi, '')
		.replace(/\s+/g, ' ')
		.trim()
}

export function getBlvdServiceClientFit({
	categoryName,
	name,
}: BlvdServiceDisplayInput): BookingServiceClientFit {
	const searchable = normalizeBlvdServiceKey(`${categoryName ?? ''} ${name}`)

	if (isReturningClientOnlyServiceName(searchable)) return 'returning_client'
	if (/\bnew (client|patient)\b/.test(searchable)) return 'new_client'
	if (/\bexisting (client|patient)\b/.test(searchable)) {
		return 'returning_client'
	}

	return 'neutral'
}

export function isBlvdServiceVisibleForClientHistory(
	service: BlvdServiceDisplayInput,
	clientHistory: BookingClientHistory | null,
) {
	if (!clientHistory) return false
	if (!isBlvdServiceCustomerBookable(service)) return false

	const clientFit = getBlvdServiceClientFit(service)

	if (clientHistory === 'returning') return clientFit !== 'new_client'
	if (clientHistory === 'new') return clientFit !== 'returning_client'

	return clientFit !== 'returning_client'
}

export function isBlvdServiceCustomerBookable(service: BlvdServiceDisplayInput) {
	if (
		service.id &&
		BLVD_CUSTOMER_BOOKING_BLOCKED_SERVICE_IDS.has(service.id)
	) {
		return false
	}

	const normalizedName = normalizeBlvdServiceKey(service.name)
	return !(
		normalizedName.includes('tox filler follow up') ||
		normalizedName.includes('tox follow up')
	)
}

export function getBlvdServicePopularityCount(name: string) {
	return POPULARITY_BY_NORMALIZED_NAME.get(normalizeBlvdServiceKey(name)) ?? 0
}

export function compareBlvdServicePopularity(
	a: Pick<BlvdServiceDisplayInput, 'name'>,
	b: Pick<BlvdServiceDisplayInput, 'name'>,
) {
	const aPopularity = getBlvdServicePopularityCount(a.name)
	const bPopularity = getBlvdServicePopularityCount(b.name)

	if (aPopularity !== bPopularity) return bPopularity - aPopularity

	return 0
}

export function getBookingClientTypeFromHistory({
	clientHistory,
	hasVerifiedClient,
}: {
	clientHistory: BookingClientHistory | null
	hasVerifiedClient: boolean
}) {
	if (hasVerifiedClient || clientHistory === 'returning') {
		return 'returning_client'
	}
	if (clientHistory === 'new') return 'new_client'
	if (clientHistory === 'unsure') return 'unsure_client'
	return 'unknown_client'
}

function normalizeBlvdServiceKey(value: string) {
	return value
		.toLowerCase()
		.replace(/®/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

function isToxServiceName(normalizedName: string) {
	return /\b(tox|botox|dysport|jeuveau|xeomin)\b/.test(normalizedName)
}

function isReturningClientOnlyServiceName(normalizedName: string) {
	return /\bweight loss injection\b/.test(normalizedName)
}
