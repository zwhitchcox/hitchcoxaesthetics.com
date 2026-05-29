import { z } from 'zod'

import {
	boulevardBookingAttributionInputSchema,
	recordBoulevardBookingAttributionTouch,
} from '#app/utils/blvd-attribution.server.ts'
import { getEstimatedValueForBlvdService } from '#app/utils/blvd-pricing.ts'

type BlvdLocation = {
	address?: {
		city?: string | null
		line1?: string | null
		line2?: string | null
		state?: string | null
		zip?: string | null
	}
	id: string
	name: string
	tz?: string | null
}

type BlvdStaffVariant = {
	duration?: number | null
	id: string
	price?: number | null
	staff: {
		displayName?: string | null
		firstName?: string | null
		lastName?: string | null
	}
}

type BlvdBookableDate = {
	date: Date | string
	id: string
}

type BlvdBookableTime = {
	id: string
	startTime: Date | string
}

type BlvdBookingQuestionOption = {
	id: string
	label: string
}

type BlvdBookingQuestion = {
	answer?: unknown
	displayType?: string | null
	id: string
	label: string
	options: BlvdBookingQuestionOption[]
	required: boolean
	valueType: string
	submitAnswer(answer: unknown): Promise<BlvdCart>
}

type BlvdServiceItem = {
	__typename?: string
	description?: string | null
	disabled?: boolean
	disabledDescription?: string | null
	id: string
	listDurationRange?: {
		max: number
		min: number
		variable: boolean
	} | null
	listPriceRange?: {
		max: number
		min: number
		variable: boolean
	} | null
	name: string
	getLocationVariants(): Promise<Array<{ location: BlvdLocation }>>
	getStaffVariants(): Promise<BlvdStaffVariant[]>
}

type BlvdCategory = {
	availableItems: BlvdServiceItem[]
	id: string
	name: string
}

type BlvdCart = {
	bookingQuestions: BlvdBookingQuestion[]
	clientInformation?: {
		email?: string | null
		externalId?: string | null
		firstName?: string | null
		lastName?: string | null
		phoneNumber?: string | null
	} | null
	endTime?: Date | string | null
	id: string
	summary: {
		depositAmount?: number | null
		paymentMethodRequired?: boolean | null
		subtotal?: number | null
		total?: number | null
	}
	startTime?: Date | string | null
	addBookableItem(
		item: BlvdServiceItem,
		opts?: { staffVariant?: BlvdStaffVariant },
	): Promise<BlvdCart>
	addCardPaymentMethod(details: {
		card: {
			address_postal_code: string
			cvv: string
			exp_month: number
			exp_year: number
			name: string
			number: string
		}
	}): Promise<BlvdCart>
	checkout(): Promise<{
		appointments: Array<{
			appointmentId: string
			clientId?: string | null
			forCartOwner?: boolean | null
		}>
		cart: BlvdCart
	}>
	getAvailableCategories(): Promise<BlvdCategory[]>
	getBookableDates(opts?: {
		location?: BlvdLocation
		timezone?: string
	}): Promise<BlvdBookableDate[]>
	getBookableTimes(
		date: BlvdBookableDate,
		opts?: { location?: BlvdLocation; timezone?: string },
	): Promise<BlvdBookableTime[]>
	reserveBookableItems(time: BlvdBookableTime): Promise<BlvdCart>
	update(opts: {
		clientInformation?: {
			email?: string
			firstName?: string
			lastName?: string
			phoneNumber?: string
		}
		clientMessage?: string
	}): Promise<BlvdCart>
}

type BlvdClient = {
	businesses: {
		get(): Promise<{
			getLocations(): Promise<BlvdLocation[]>
		}>
	}
	carts: {
		create(location?: BlvdLocation): Promise<BlvdCart>
	}
}

type ServiceEntry = {
	categoryName: string
	categoryOrder: number
	id: string
	item: BlvdServiceItem
	itemOrder: number
	searchText: string
}

const optionalTrimmedString = z.preprocess(
	value => (value === null ? undefined : value),
	z.string().trim().optional(),
)

const optionalNumberWithDefault = (defaultValue: number) =>
	z.preprocess(
		value => (value === null || value === '' ? undefined : value),
		z.coerce.number().int().optional().default(defaultValue),
	)

export const voiceServiceLookupSchema = z.object({
	limit: optionalNumberWithDefault(8).pipe(z.number().min(1).max(20)),
	service_query: optionalTrimmedString,
})

export const voiceAvailabilitySchema = z.object({
	days: optionalNumberWithDefault(14).pipe(z.number().min(1).max(45)),
	limit: optionalNumberWithDefault(8).pipe(z.number().min(1).max(25)),
	location_id: optionalTrimmedString,
	location_query: optionalTrimmedString,
	service_id: optionalTrimmedString,
	service_query: optionalTrimmedString,
	start_date: optionalTrimmedString,
})

export const voiceBookingQuestionAnswerSchema = z.object({
	question_id: optionalTrimmedString,
	question_label: optionalTrimmedString,
	value: z.unknown(),
})

export const voiceBookAppointmentSchema = z.object({
	card: z.preprocess(
		value => (value === null ? undefined : value),
		z
			.object({
				cvc: z.string().trim(),
				exp_month: z.coerce.number().int().min(1).max(12),
				exp_year: z.coerce
					.number()
					.int()
					.min(new Date().getFullYear())
					.max(2100),
				name: z.string().trim(),
				number: z.string().trim(),
				postal_code: z.string().trim(),
			})
			.optional(),
	),
	client: z.object({
		email: z.string().trim().email(),
		first_name: z.string().trim().min(1),
		last_name: z.string().trim().min(1),
		phone: z.string().trim().min(7),
	}),
	booking_question_answers: z
		.preprocess(
			value => (value === null ? undefined : value),
			z.array(voiceBookingQuestionAnswerSchema),
		)
		.default([]),
	location_id: optionalTrimmedString,
	location_query: optionalTrimmedString,
	notes: optionalTrimmedString,
	service_id: optionalTrimmedString,
	service_query: optionalTrimmedString,
	start_time: z.string().trim().min(1),
	time_id: optionalTrimmedString,
})

type VoiceServiceLookupInput = z.output<typeof voiceServiceLookupSchema>
type VoiceAvailabilityInput = z.output<typeof voiceAvailabilitySchema>
type VoiceBookAppointmentInput = z.output<typeof voiceBookAppointmentSchema>

let cachedCatalog:
	| {
			expiresAt: number
			locations: BlvdLocation[]
			services: ServiceEntry[]
	  }
	| undefined

export async function listVoiceBookingServices(input: VoiceServiceLookupInput) {
	const catalog = await getCatalog()
	const services = rankServices(catalog.services, input.service_query ?? '').slice(
		0,
		input.limit,
	)

	return {
		ok: true,
		services: services.map(serializeService),
	}
}

export async function getVoiceBookingAvailability(
	input: VoiceAvailabilityInput,
) {
	const catalog = await getCatalog()
	const service = resolveService(catalog.services, input)
	if ('error' in service) return service

	const serviceLocations = sortLocations(
		dedupeLocations(
			(await service.item.getLocationVariants()).map(variant => variant.location),
		),
	)
	const location = resolveLocation(serviceLocations, input)
	if ('error' in location) {
		return {
			...location,
			service: serializeService(service),
			locations: serviceLocations.map(serializeLocation),
		}
	}

	const availability = await collectAvailability({
		limit: input.limit,
		location,
		service,
		startDate: parseStartDate(input.start_date),
		untilDate: addDays(parseStartDate(input.start_date), input.days),
	})
	const nextAvailableSlot =
		availability.length > 0
			? null
			: await collectNextAvailableSlot({
					location,
					service,
					startDate: addDays(parseStartDate(input.start_date), input.days),
					untilDate: addDays(parseStartDate(input.start_date), 90),
				})

	return {
		ok: true,
		message:
			availability.length > 0
				? undefined
				: nextAvailableSlot
					? `No openings were found in the requested window. Offer the next available appointment at ${nextAvailableSlot.location_name}.`
					: 'No openings were found in the requested window. Ask the caller for another service, location, or broader date range.',
		next_available_slot: nextAvailableSlot,
		service: serializeService(service),
		location: serializeLocation(location),
		slots: availability,
	}
}

export async function bookVoiceAppointment(input: VoiceBookAppointmentInput) {
	const catalog = await getCatalog()
	const service = resolveService(catalog.services, input)
	if ('error' in service) return service

	const serviceLocations = dedupeLocations(
		(await service.item.getLocationVariants()).map(variant => variant.location),
	)
	const location = resolveLocation(serviceLocations, input)
	if ('error' in location) {
		return {
			...location,
			service: serializeService(service),
			locations: serviceLocations.map(serializeLocation),
		}
	}

	const startTime = new Date(input.start_time)
	if (Number.isNaN(startTime.getTime())) {
		return {
			error: 'invalid_start_time',
			message: 'start_time must be an ISO timestamp returned by availability.',
			ok: false,
		}
	}

	let { cart, selectedTime } = await createCartForService(service, location)
	const targetDate = await findBookableDate(cart, location, startTime)
	if (!targetDate) {
		return {
			error: 'slot_not_available',
			message: 'That appointment date is no longer available.',
			ok: false,
		}
	}

	selectedTime = await findBookableTime({
		cart,
		location,
		startTime,
		targetDate,
		timeId: input.time_id,
	})

	if (!selectedTime) {
		return {
			error: 'slot_not_available',
			message: 'That appointment time is no longer available.',
			ok: false,
		}
	}

	cart = await cart.reserveBookableItems(selectedTime)
	cart = await cart.update({
		clientInformation: {
			email: input.client.email,
			firstName: input.client.first_name,
			lastName: input.client.last_name,
			phoneNumber: normalizePhoneNumber(input.client.phone),
		},
		clientMessage: input.notes || undefined,
	})

	const missingQuestions = getMissingRequiredQuestions(
		cart.bookingQuestions,
		input.booking_question_answers,
	)
	if (missingQuestions.length > 0) {
		return {
			error: 'missing_booking_questions',
			message:
				'Boulevard requires these booking question answers before checkout.',
			ok: false,
			questions: missingQuestions,
		}
	}

	for (const answer of input.booking_question_answers) {
		const question = findQuestion(cart.bookingQuestions, answer)
		if (!question) continue
		cart = await question.submitAnswer(coerceQuestionAnswer(question, answer.value))
	}

	const requiresPayment = Boolean(cart.summary.paymentMethodRequired)
	if (requiresPayment && !input.card) {
		return {
			error: 'missing_card',
			message: 'Boulevard requires a card to reserve this appointment.',
			ok: false,
			payment: serializePaymentSummary(cart),
		}
	}

	if (requiresPayment && input.card) {
		cart = await cart.addCardPaymentMethod({
			card: {
				address_postal_code: input.card.postal_code,
				cvv: input.card.cvc.replace(/\D/g, ''),
				exp_month: input.card.exp_month,
				exp_year: input.card.exp_year,
				name: input.card.name.toUpperCase(),
				number: input.card.number.replace(/\D/g, ''),
			},
		})
	}

	const checkout = await cart.checkout()
	const appointmentIds = checkout.appointments.map(
		appointment => appointment.appointmentId,
	)
	const valueUsd = getEstimatedValueForBlvdService(service.item.name)

	void recordBoulevardBookingAttributionTouch(
		boulevardBookingAttributionInputSchema.parse({
			appointments: checkout.appointments.map(appointment => ({
				appointmentId: appointment.appointmentId,
				clientId: appointment.clientId ?? undefined,
				endTime: toIso(checkout.cart.endTime),
				forCartOwner: appointment.forCartOwner ?? undefined,
				startTime: toIso(checkout.cart.startTime),
			})),
			attribution: {
				booking_channel: 'retell_test_agent',
			},
			booking: {
				cartId: checkout.cart.id,
				hasVerifiedClient: false,
				locationId: location.id,
				locationName: location.name,
				occurredAt: new Date().toISOString(),
				selectedPaymentMethodType: requiresPayment ? 'new_card' : 'none_required',
				serviceCategory: service.categoryName,
				serviceId: service.item.id,
				serviceName: service.item.name,
				valueUsd,
			},
			client: {
				boulevardClientId:
					checkout.appointments.find(appointment => appointment.clientId)
						?.clientId ??
					checkout.cart.clientInformation?.externalId ??
					undefined,
				email: checkout.cart.clientInformation?.email ?? input.client.email,
				firstName:
					checkout.cart.clientInformation?.firstName ?? input.client.first_name,
				lastName:
					checkout.cart.clientInformation?.lastName ?? input.client.last_name,
				phone: checkout.cart.clientInformation?.phoneNumber ?? input.client.phone,
			},
		}),
	).catch(error => {
		console.error('Failed to persist Retell Boulevard attribution touch', error)
	})

	return {
		ok: true,
		appointment_ids: appointmentIds,
		location: serializeLocation(location),
		payment: serializePaymentSummary(checkout.cart),
		service: serializeService(service),
		start_time: toIso(checkout.cart.startTime) ?? input.start_time,
		end_time: toIso(checkout.cart.endTime),
	}
}

async function getCatalog() {
	const now = Date.now()
	if (cachedCatalog && cachedCatalog.expiresAt > now) return cachedCatalog

	const client = await getBlvdClient()
	const business = await client.businesses.get()
	const locations = await business.getLocations()
	const cart = await client.carts.create()
	const categories = await cart.getAvailableCategories()

	cachedCatalog = {
		expiresAt: now + 5 * 60 * 1000,
		locations,
		services: buildServiceEntries(categories),
	}
	return cachedCatalog
}

async function getBlvdClient() {
	const apiKey = process.env['BLVD_API_KEY']?.trim()
	const businessId = process.env['BLVD_BUSINESS_ID']?.trim()
	if (!apiKey || !businessId) {
		throw new Error('BLVD_API_KEY and BLVD_BUSINESS_ID are required.')
	}

	const sdk = (await import('@boulevard/blvd-book-sdk')) as unknown as {
		Blvd: new (apiKey: string, businessId: string, target?: number) => BlvdClient
		PlatformTarget?: { Live: number }
	}

	return new sdk.Blvd(apiKey, businessId, sdk.PlatformTarget?.Live)
}

function resolveService(
	services: ServiceEntry[],
	input: { service_id?: string; service_query?: string },
) {
	if (input.service_id) {
		const service = services.find(candidate => candidate.id === input.service_id)
		if (service) return service
	}

	const ranked = rankServices(services, input.service_query ?? '')
	if (ranked.length === 1) return ranked[0]!

	const topScore = input.service_query ? scoreService(ranked[0]!, input.service_query) : 0
	const secondScore =
		input.service_query && ranked[1] ? scoreService(ranked[1], input.service_query) : 0

	if (ranked[0] && (ranked.length === 1 || topScore >= secondScore + 25)) {
		return ranked[0]
	}

	return {
		error: 'ambiguous_service',
		message: 'Ask which service the caller wants before checking availability.',
		ok: false,
		services: ranked.slice(0, 8).map(serializeService),
	}
}

function resolveLocation(
	locations: BlvdLocation[],
	input: { location_id?: string; location_query?: string },
) {
	if (input.location_id) {
		const location = locations.find(candidate => candidate.id === input.location_id)
		if (location) return location
		return {
			error: 'location_unavailable',
			message:
				'That location is not available for this service. Ask the caller if one of the returned locations works.',
			ok: false,
		}
	}

	if (input.location_query) {
		const normalizedQuery = normalizeText(input.location_query)
		const matchedLocation =
			locations.find(location => locationMatchesQuery(location, normalizedQuery)) ??
			null
		if (matchedLocation) return matchedLocation

		return {
			error: 'location_unavailable',
			message:
				'That location is not available for this service. Ask the caller if one of the returned locations works.',
			ok: false,
		}
	}

	const ranked = rankLocations(locations, '')
	if (ranked.length === 1) return ranked[0]!

	return {
		error: 'ambiguous_location',
		message:
			'Ask whether the caller prefers the Bearden or Farragut location before checking availability.',
		ok: false,
	}
}

async function collectAvailability({
	limit,
	location,
	service,
	startDate,
	untilDate,
}: {
	limit: number
	location: BlvdLocation
	service: ServiceEntry
	startDate: Date
	untilDate: Date
}) {
	const { cart } = await createCartForService(service, location)
	const dates = await cart.getBookableDates({
		location,
		timezone: location.tz ?? undefined,
	})
	const slots: Array<ReturnType<typeof serializeSlot>> = []

	for (const date of dates) {
		const dateValue = toDate(date.date)
		if (!dateValue || dateValue < startOfDay(startDate) || dateValue >= untilDate) {
			continue
		}

		const times = await cart.getBookableTimes(date, {
			location,
			timezone: location.tz ?? undefined,
		})

		for (const time of times) {
			slots.push(serializeSlot(time, location))
			if (slots.length >= limit) return slots
		}
	}

	return slots
}

async function collectNextAvailableSlot({
	location,
	service,
	startDate,
	untilDate,
}: {
	location: BlvdLocation
	service: ServiceEntry
	startDate: Date
	untilDate: Date
}) {
	const slots = await collectAvailability({
		limit: 1,
		location,
		service,
		startDate,
		untilDate,
	})
	return slots[0] ?? null
}

async function createCartForService(
	service: ServiceEntry,
	location: BlvdLocation,
) {
	const client = await getBlvdClient()
	let cart = await client.carts.create(location)
	const preferredStaffVariant = await getPreferredStaffVariant(service.item)
	cart = await cart.addBookableItem(service.item, {
		...(preferredStaffVariant ? { staffVariant: preferredStaffVariant } : {}),
	})

	return { cart, selectedTime: null as BlvdBookableTime | null }
}

async function findBookableDate(
	cart: BlvdCart,
	location: BlvdLocation,
	startTime: Date,
) {
	const dates = await cart.getBookableDates({
		location,
		timezone: location.tz ?? undefined,
	})
	const targetDay = startOfDay(startTime).getTime()
	return (
		dates.find(date => {
			const candidate = toDate(date.date)
			return candidate ? startOfDay(candidate).getTime() === targetDay : false
		}) ?? null
	)
}

async function findBookableTime({
	cart,
	location,
	startTime,
	targetDate,
	timeId,
}: {
	cart: BlvdCart
	location: BlvdLocation
	startTime: Date
	targetDate: BlvdBookableDate
	timeId?: string
}) {
	const times = await cart.getBookableTimes(targetDate, {
		location,
		timezone: location.tz ?? undefined,
	})
	const targetTime = startTime.getTime()

	return (
		times.find(time => timeId && time.id === timeId) ??
		times.find(time => {
			const candidate = toDate(time.startTime)
			return candidate ? Math.abs(candidate.getTime() - targetTime) < 60_000 : false
		}) ??
		null
	)
}

function buildServiceEntries(categories: BlvdCategory[]) {
	const services = new Map<string, ServiceEntry>()

	for (const [categoryOrder, category] of categories.entries()) {
		for (const [itemOrder, item] of category.availableItems.entries()) {
			if (item.__typename !== 'CartAvailableBookableItem' || item.disabled) {
				continue
			}
			if (services.has(item.id)) continue

			services.set(item.id, {
				categoryName: category.name,
				categoryOrder,
				id: item.id,
				item,
				itemOrder,
				searchText: normalizeText(
					[
						category.name,
						item.name,
						item.description ?? '',
						...getServiceAliases(category.name, item.name, item.description),
					].join(' '),
				),
			})
		}
	}

	return [...services.values()]
}

function rankServices(services: ServiceEntry[], search: string) {
	if (!search.trim()) {
		return [...services].sort((a, b) => {
			if (a.categoryOrder !== b.categoryOrder) {
				return a.categoryOrder - b.categoryOrder
			}
			if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder
			return a.item.name.localeCompare(b.item.name)
		})
	}

	return [...services]
		.map(service => ({ score: scoreService(service, search), service }))
		.filter(result => result.score > 0)
		.sort((a, b) => {
			if (a.score !== b.score) return b.score - a.score
			return a.service.item.name.localeCompare(b.service.item.name)
		})
		.map(result => result.service)
}

function scoreService(service: ServiceEntry, search: string) {
	const normalizedSearch = normalizeText(search)
	const expandedSearch = expandServiceSearch(search)
	const searchTokens = tokenize(expandedSearch)
	const normalizedName = normalizeText(service.item.name)
	let score = 0

	if (normalizedName === normalizedSearch) score += 150
	if (normalizedName.startsWith(normalizedSearch)) score += 80
	if (service.searchText.includes(normalizedSearch)) score += 60
	if (service.searchText.includes(normalizeText(expandedSearch))) score += 45

	for (const token of searchTokens) {
		if (normalizedName.includes(token)) {
			score += 25
		} else if (service.searchText.includes(token)) {
			score += 10
		}
	}

	return score
}

function expandServiceSearch(search: string) {
	const normalized = normalizeText(search)
	const aliases = new Set(tokenize(search))

	if (isToxQuery(normalized)) {
		for (const token of [
			'botox',
			'tox',
			'neurotoxin',
			'wrinkle',
			'relaxer',
			'dysport',
			'jeuveau',
			'xeomin',
		]) {
			aliases.add(token)
		}
	}

	return [...aliases].join(' ')
}

function getServiceAliases(
	categoryName: string,
	serviceName: string,
	description?: string | null,
) {
	const text = normalizeText([categoryName, serviceName, description ?? ''].join(' '))
	const aliases: string[] = []

	if (isToxService(text)) {
		aliases.push(
			'botox',
			'botox treatment',
			'botox appointment',
			'tox',
			'neurotoxin',
			'wrinkle relaxer',
			'wrinkle relaxing treatment',
			'dysport',
			'jeuveau',
			'xeomin',
		)

		if (text.includes('new client') || text.includes('new patient')) {
			aliases.push('new client botox', 'new patient botox', 'first time botox')
		}
		if (text.includes('existing client') || text.includes('existing patient')) {
			aliases.push('existing client botox', 'returning client botox')
		}
	}

	return aliases
}

function isToxQuery(normalizedSearch: string) {
	return [
		'botox',
		'tox',
		'neurotoxin',
		'wrinkle relaxer',
		'wrinkle relaxing',
		'dysport',
		'jeuveau',
		'xeomin',
	].some(term => normalizedSearch.includes(term))
}

function isToxService(normalizedServiceText: string) {
	return [
		' tox ',
		' botox ',
		'dysport',
		'jeuveau',
		'xeomin',
		'neurotoxin',
	].some(term => ` ${normalizedServiceText} `.includes(term))
}

function rankLocations(locations: BlvdLocation[], search: string) {
	if (!search.trim()) return sortLocations(locations)

	const normalizedSearch = normalizeText(search)
	return [...locations].sort((a, b) => {
		const aText = normalizeText([a.name, formatAddress(a)].join(' '))
		const bText = normalizeText([b.name, formatAddress(b)].join(' '))
		const aScore = aText.includes(normalizedSearch) ? 1 : 0
		const bScore = bText.includes(normalizedSearch) ? 1 : 0
		if (aScore !== bScore) return bScore - aScore
		return a.name.localeCompare(b.name)
	})
}

function locationMatchesQuery(location: BlvdLocation, normalizedQuery: string) {
	const aliases = getLocationAliases(location)
	return aliases.some(alias => normalizeText(alias).includes(normalizedQuery))
}

function getLocationAliases(location: BlvdLocation) {
	const address = formatAddress(location)
	const aliases = [location.name, address]
	const normalizedAddress = normalizeText(address)

	if (normalizedAddress.includes('kingston pike')) {
		aliases.push('bearden', 'knoxville bearden', '5113 kingston pike')
	}
	if (normalizedAddress.includes('campbell station')) {
		aliases.push('farragut', '102 s campbell station')
	}

	return aliases
}

function sortLocations(locations: BlvdLocation[]) {
	return [...locations].sort((a, b) => a.name.localeCompare(b.name))
}

function dedupeLocations(locations: BlvdLocation[]) {
	const uniqueLocations = new Map<string, BlvdLocation>()
	for (const location of locations) {
		if (!uniqueLocations.has(location.id)) {
			uniqueLocations.set(location.id, location)
		}
	}
	return [...uniqueLocations.values()]
}

async function getPreferredStaffVariant(item: BlvdServiceItem) {
	const uniqueVariants = new Map<string, BlvdStaffVariant>()
	for (const variant of await item.getStaffVariants()) {
		if (!uniqueVariants.has(variant.id)) {
			uniqueVariants.set(variant.id, variant)
		}
	}

	const staffVariants = [...uniqueVariants.values()]
	return (
		staffVariants.find(variant =>
			normalizeText(getStaffDisplayName(variant.staff)).includes(
				'sarah hitchcox',
			),
		) ?? staffVariants[0]
	)
}

function getMissingRequiredQuestions(
	questions: BlvdBookingQuestion[],
	answers: Array<z.infer<typeof voiceBookingQuestionAnswerSchema>>,
) {
	return questions
		.filter(question => question.required)
		.filter(question => !answers.some(answer => findQuestion([question], answer)))
		.map(serializeQuestion)
}

function findQuestion(
	questions: BlvdBookingQuestion[],
	answer: z.infer<typeof voiceBookingQuestionAnswerSchema>,
) {
	return (
		questions.find(question => answer.question_id === question.id) ??
		questions.find(
			question =>
				answer.question_label &&
				normalizeText(question.label) === normalizeText(answer.question_label),
		) ??
		null
	)
}

function coerceQuestionAnswer(question: BlvdBookingQuestion, value: unknown) {
	if (question.valueType === 'BOOLEAN') return Boolean(value)
	if (question.valueType === 'DATETIME' && typeof value === 'string') {
		return new Date(value)
	}
	if (question.valueType === 'SELECT') {
		return (
			question.options.find(option => option.id === value) ??
			question.options.find(
				option =>
					typeof value === 'string' &&
					normalizeText(option.label) === normalizeText(value),
			) ??
			value
		)
	}
	if (question.valueType === 'MULTI_SELECT' && Array.isArray(value)) {
		return value.map(item =>
			question.options.find(option => option.id === item) ??
			question.options.find(
				option =>
					typeof item === 'string' &&
					normalizeText(option.label) === normalizeText(item),
			) ??
			item,
		)
	}
	return value
}

function serializeService(service: ServiceEntry) {
	return {
		aliases: getServiceAliases(
			service.categoryName,
			service.item.name,
			service.item.description,
		),
		category: service.categoryName,
		description: service.item.description ?? null,
		duration: formatDurationRange(service.item.listDurationRange),
		id: service.item.id,
		name: service.item.name,
		price: formatPriceRange(service.item.listPriceRange),
	}
}

function serializeLocation(location: BlvdLocation) {
	return {
		address: formatAddress(location),
		boulevard_name: location.name,
		description: getLocationDescription(location),
		display_name: getLocationDisplayName(location),
		id: location.id,
		name: getLocationDisplayName(location),
		timezone: location.tz ?? null,
	}
}

function serializeSlot(time: BlvdBookableTime, location: BlvdLocation) {
	return {
		location_id: location.id,
		location_name: getLocationDisplayName(location),
		location_description: getLocationDescription(location),
		start_time: toIso(time.startTime),
		time_id: time.id,
		timezone: location.tz ?? null,
	}
}

function serializeQuestion(question: BlvdBookingQuestion) {
	return {
		display_type: question.displayType ?? null,
		id: question.id,
		label: question.label,
		options: question.options.map(option => ({
			id: option.id,
			label: option.label,
		})),
		required: question.required,
		value_type: question.valueType,
	}
}

function serializePaymentSummary(cart: BlvdCart) {
	return {
		deposit_amount_cents: cart.summary.depositAmount ?? 0,
		payment_method_required: Boolean(cart.summary.paymentMethodRequired),
		subtotal_cents: cart.summary.subtotal ?? 0,
		total_cents: cart.summary.total ?? 0,
	}
}

function formatAddress(location: BlvdLocation) {
	return [
		location.address?.line1,
		location.address?.line2,
		location.address?.city,
		location.address?.state,
		location.address?.zip,
	]
		.filter(Boolean)
		.join(', ')
}

function getLocationDisplayName(location: BlvdLocation) {
	const address = normalizeText(formatAddress(location))
	if (address.includes('kingston pike')) return 'Bearden on Kingston Pike'
	if (address.includes('campbell station')) return 'Farragut on Campbell Station'
	return location.name
}

function getLocationDescription(location: BlvdLocation) {
	const address = normalizeText(formatAddress(location))
	if (address.includes('kingston pike')) {
		return 'the Bearden location on Kingston Pike in West Knoxville'
	}
	if (address.includes('campbell station')) {
		return 'the Farragut location on South Campbell Station Road'
	}
	return formatAddress(location) || location.name
}

function formatDurationRange(range: BlvdServiceItem['listDurationRange']) {
	if (!range) return null
	if (range.variable && range.min !== range.max) {
		return `${range.min}-${range.max} min`
	}
	return `${range.min} min`
}

function formatPriceRange(range: BlvdServiceItem['listPriceRange']) {
	if (!range) return null
	if (range.variable && range.min !== range.max) {
		return `${formatMoney(range.min)}-${formatMoney(range.max)}`
	}
	return formatMoney(range.min)
}

function formatMoney(value: number) {
	return new Intl.NumberFormat('en-US', {
		currency: 'USD',
		style: 'currency',
	}).format(value / 100)
}

function parseStartDate(value?: string) {
	if (!value) return startOfDay(new Date())
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? startOfDay(new Date()) : startOfDay(parsed)
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
	const nextDate = new Date(date)
	nextDate.setDate(nextDate.getDate() + days)
	return nextDate
}

function toDate(value: Date | string | null | undefined) {
	if (!value) return null
	if (value instanceof Date) return value
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toIso(value: Date | string | null | undefined) {
	return toDate(value)?.toISOString()
}

function normalizePhoneNumber(value: string) {
	const digits = value.replace(/\D/g, '')
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (value.trim().startsWith('+')) return value.trim()
	return `+${digits}`
}

function getStaffDisplayName(staff: BlvdStaffVariant['staff']) {
	return (
		staff.displayName?.trim() ||
		[staff.firstName, staff.lastName].filter(Boolean).join(' ').trim()
	)
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

function tokenize(value: string) {
	return normalizeText(value).split(/\s+/).filter(Boolean)
}
