import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { format, isValid } from 'date-fns'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Calendar } from '#app/components/ui/calendar.tsx'
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	isExcludedBookingAnalyticsIdentity,
	type BookingAnalyticsExclusionInput,
} from '#app/utils/analytics-exclusions.ts'
import {
	BLVD_SERVICE_DISPLAY_GROUPS,
	type BookingClientHistory,
	type BlvdServiceDisplayGroup,
	getBlvdServiceClientFit,
	getBlvdServiceDisplayGroupServiceIdForClientHistory,
	getBlvdServiceDisplayGroupServiceIds,
	getBlvdServicePopularityCount,
	getBookingClientTypeFromHistory,
	getCustomerFacingBlvdCategoryName,
	getCustomerFacingBlvdServiceName,
	isBlvdServiceVisibleForClientHistory,
} from '#app/utils/blvd-service-display.ts'
import { getBookingAnalyticsEventProperties } from '#app/utils/booking-analytics.ts'
import {
	type LastBookingServiceHint,
	readLastBookingServiceHint,
} from '#app/utils/booking-source-hints.ts'
import {
	type Location as SiteLocation,
	locations as siteLocations,
} from '#app/utils/locations.ts'
import { cn, getErrorMessage } from '#app/utils/misc.tsx'
import {
	buildBookingPostHogIdentity,
	type BookingPostHogIdentityInput,
} from '#app/utils/posthog-booking-identity.ts'
import { usePostHog } from '#app/utils/posthog.tsx'
import {
	getBlvdBookingPriceDisplay,
	getProjectedRevenueForBlvdService,
} from '#app/utils/service-pricing.ts'
import { getAncestors, getPage } from '#app/utils/site-pages.server.ts'

type SourceHint = {
	label: string
	path: string
	preferredLocationId: SiteLocation['id'] | null
	search: string
}

type LoaderData = {
	apiKey: string | null
	businessId: string | null
	sourceHint: SourceHint | null
}

type BlvdLocation = {
	address?: {
		city?: string | null
		country?: string | null
		line1?: string | null
		line2?: string | null
		state?: string | null
		zip?: string | null
	}
	allowOnlineBooking?: boolean | null
	arrivalInstructions?: string | null
	coordinates?: {
		latitude?: number | null
		longitude?: number | null
	} | null
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
	errors?: string[]
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

type BlvdPaymentMethod = {
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
	getAvailablePaymentMethods(): Promise<BlvdPaymentMethod[]>
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
	sendOwnershipCodeBySms(mobilePhone: string): Promise<string>
	selectPaymentMethod(paymentMethod: BlvdPaymentMethod): Promise<BlvdCart>
	takeOwnershipByCode(codeId: string, codeValue: number): Promise<BlvdCart>
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
	displayCategoryName: string
	displayDescription?: string | null
	displayDurationLabel?: string | null
	displayGroupId: string | null
	displayName: string
	displayPrice?: string | null
	groupedServiceIds: string[]
	id: string
	item: BlvdServiceItem
	itemOrder: number
	recentBookingCount: number
	searchText: string
	selectionOptions?: Array<{
		label: string
		service: ServiceEntry
		sortOrder: number
	}>
	selectionPrompt?: string
}

type ServiceGroup = {
	categoryName: string
	categoryOrder: number
	services: ServiceEntry[]
}

type CheckoutSuccess = {
	appointmentIds: string[]
	serviceName: string
	startTime: Date | null
	endTime: Date | null
	locationName: string
}

type BlvdBookStepName =
	| 'service'
	| 'location'
	| 'schedule'
	| 'details'
	| 'reserve'

const BLVD_BOOK_STEPS: Array<{
	label: string
	name: BlvdBookStepName
}> = [
	{ label: 'Service', name: 'service' },
	{ label: 'Location', name: 'location' },
	{ label: 'Schedule', name: 'schedule' },
	{ label: 'Details', name: 'details' },
	{ label: 'Reserve', name: 'reserve' },
]

const CLIENT_HISTORY_OPTIONS: Array<{
	label: string
	value: BookingClientHistory
}> = [
	{ label: 'Yes', value: 'returning' },
	{ label: 'No', value: 'new' },
	{ label: "Don't Remember", value: 'unsure' },
]

const DEFAULT_BOOKING_LOCATION_ID: SiteLocation['id'] = 'bearden'
const BOOKING_PHONE_VERIFICATION_CODE_ID = 'booking-phone'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const meta: MetaFunction = () => [
	{ title: 'Book Online | Sarah Hitchcox Aesthetics' },
]

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const source =
		normalizeSourcePath(
			url.searchParams.get('source') ??
				url.searchParams.get('service') ??
				url.searchParams.get('slug'),
		) ?? null
	const explicitLocation = normalizeLocationId(url.searchParams.get('location'))
	const sourceHint = source
		? buildServerSourceHint(source, explicitLocation)
		: null

	return json<LoaderData>({
		apiKey: process.env['BLVD_API_KEY']?.trim() ?? null,
		businessId: process.env['BLVD_BUSINESS_ID']?.trim() ?? null,
		sourceHint:
			sourceHint ??
			(explicitLocation
				? {
						label:
							siteLocations.find(location => location.id === explicitLocation)
								?.displayName ?? explicitLocation,
						path: `/${explicitLocation}`,
						preferredLocationId: explicitLocation,
						search: '',
					}
				: null),
	})
}

export default function BlvdBookRoute() {
	const { apiKey, businessId, sourceHint } = useLoaderData<typeof loader>()
	const [client, setClient] = useState<BlvdClient | null>(null)
	const [initializing, setInitializing] = useState(true)
	const [initError, setInitError] = useState<string | null>(null)
	const [services, setServices] = useState<ServiceEntry[]>([])
	const [clientHistorySelection, setClientHistorySelection] =
		useState<BookingClientHistory | null>(null)
	const [clientHistory, setClientHistory] =
		useState<BookingClientHistory | null>(null)
	const [clientHistoryLookupError, setClientHistoryLookupError] = useState<
		string | null
	>(null)
	const [clientHistoryLookupMessage, setClientHistoryLookupMessage] = useState<
		string | null
	>(null)
	const [lookingUpClientHistory, setLookingUpClientHistory] = useState(false)
	const [serviceLocations, setServiceLocations] = useState<BlvdLocation[]>([])
	const [selectedService, setSelectedService] = useState<ServiceEntry | null>(
		null,
	)
	const [pendingServiceOptionPath, setPendingServiceOptionPath] = useState<
		ServiceEntry[]
	>([])
	const [
		pendingServiceOptionRootInstanceId,
		setPendingServiceOptionRootInstanceId,
	] = useState<string | null>(null)
	const [selectedLocation, setSelectedLocation] = useState<BlvdLocation | null>(
		null,
	)
	const [cart, setCart] = useState<BlvdCart | null>(null)
	const [bookableDates, setBookableDates] = useState<BlvdBookableDate[]>([])
	const [bookableTimes, setBookableTimes] = useState<BlvdBookableTime[]>([])
	const [selectedDateId, setSelectedDateId] = useState<string | null>(null)
	const [selectedTimeId, setSelectedTimeId] = useState<string | null>(null)
	const [loadingLocations, setLoadingLocations] = useState(false)
	const [loadingSchedule, setLoadingSchedule] = useState(false)
	const [loadingTimes, setLoadingTimes] = useState(false)
	const [submittingBooking, setSubmittingBooking] = useState(false)
	const [detailsSubmitted, setDetailsSubmitted] = useState(false)
	const [stepError, setStepError] = useState<string | null>(null)
	const [ownershipStepError, setOwnershipStepError] = useState<string | null>(
		null,
	)
	const [checkoutSuccess, setCheckoutSuccess] =
		useState<CheckoutSuccess | null>(null)
	const [referrerHint, setReferrerHint] = useState<SourceHint | null>(null)
	const [hasEvaluatedReferrerHint, setHasEvaluatedReferrerHint] = useState(
		Boolean(sourceHint),
	)
	const [search, setSearch] = useState(sourceHint?.search ?? '')
	const searchInputRef = useRef<HTMLInputElement>(null)
	const didHandleInitialEntryBehavior = useRef(false)
	const didFocusSearchAfterClientHistory = useRef(false)
	const [activeStep, setActiveStep] = useState<BlvdBookStepName | null>(null)
	const [clientForm, setClientForm] = useState({
		cardCvc: '',
		cardExpiry: '',
		cardName: '',
		cardNumber: '',
		cardZip: '',
		email: '',
		firstName: '',
		lastName: '',
		notes: '',
		phone: '',
	})
	const [ownershipCodeId, setOwnershipCodeId] = useState<string | null>(null)
	const [ownershipCodeValue, setOwnershipCodeValue] = useState('')
	const [sendingOwnershipCode, setSendingOwnershipCode] = useState(false)
	const [verifyingOwnershipCode, setVerifyingOwnershipCode] = useState(false)
	const [ownershipVerifiedPhone, setOwnershipVerifiedPhone] = useState<
		string | null
	>(null)
	const [verifiedExistingClient, setVerifiedExistingClient] = useState(false)
	const [availablePaymentMethods, setAvailablePaymentMethods] = useState<
		BlvdPaymentMethod[]
	>([])
	const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('new')
	const [questionAnswers, setQuestionAnswers] = useState<
		Record<string, unknown>
	>({})
	const posthog = usePostHog()
	const didCaptureBookingFunnelEnteredRef = useRef(false)
	const pendingBookingStepsRef = useRef<Set<string>>(new Set())
	const bookingAnalyticsPropertiesRef = useRef<Record<string, unknown>>({})
	const bookingAnalyticsExclusionInputRef =
		useRef<BookingAnalyticsExclusionInput>({})
	const lastBookingIntentKeyRef = useRef<string | null>(null)
	const lastPostHogIdentityKeyRef = useRef<string | null>(null)
	bookingAnalyticsExclusionInputRef.current = {
		emails: [clientForm.email, cart?.clientInformation?.email],
		phones: [
			clientForm.phone,
			ownershipVerifiedPhone,
			cart?.clientInformation?.phoneNumber,
		],
	}

	useEffect(() => {
		let cancelled = false

		async function loadBoulevardCatalog() {
			if (!apiKey || !businessId) {
				setInitError(
					'Boulevard is not configured for this route yet. Add BLVD_API_KEY and BLVD_BUSINESS_ID before testing /blvd-book.',
				)
				setInitializing(false)
				return
			}

			try {
				const { Buffer } = await import('buffer')
				;(globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer =
					Buffer
				const sdk = (await import('@boulevard/blvd-book-sdk')) as unknown as {
					Blvd: new (
						apiKey: string,
						businessId: string,
						target: number,
					) => BlvdClient
					PlatformTarget: { Live: number }
				}
				const nextClient = new sdk.Blvd(
					apiKey,
					businessId,
					sdk.PlatformTarget.Live,
				)
				const business = await nextClient.businesses.get()
				await business.getLocations()
				const catalogCart = await nextClient.carts.create()
				const categories = await catalogCart.getAvailableCategories()
				const nextServices = buildServiceEntries(categories)

				if (cancelled) return

				setClient(nextClient)
				setServices(nextServices)
				setInitError(null)
			} catch (error) {
				if (cancelled) return
				setInitError(getErrorMessage(error))
			} finally {
				if (!cancelled) {
					setInitializing(false)
				}
			}
		}

		void loadBoulevardCatalog()

		return () => {
			cancelled = true
		}
	}, [apiKey, businessId])

	useEffect(() => {
		if (sourceHint) {
			setHasEvaluatedReferrerHint(true)
			return
		}

		let nextReferrerHint: SourceHint | null = null
		const lastServiceHint = readLastBookingServiceHint()

		try {
			if (document.referrer) {
				const referrer = new URL(document.referrer)
				if (referrer.origin === window.location.origin) {
					const referrerPath = normalizeSourcePath(referrer.pathname)
					const currentPath = normalizeSourcePath(window.location.pathname)
					if (
						referrerPath &&
						referrerPath !== currentPath &&
						referrerPath !== '/blvd-book'
					) {
						nextReferrerHint = buildClientSourceHint(
							referrer.pathname,
							lastServiceHint,
						)
					}
				}
			}
		} catch {
			// Ignore referrer parsing failures.
		}

		if (!nextReferrerHint && lastServiceHint) {
			nextReferrerHint = buildStoredServiceSourceHint(lastServiceHint)
		}

		try {
			if (!nextReferrerHint) return
			setReferrerHint(nextReferrerHint)
			setSearch(currentSearch => currentSearch || nextReferrerHint.search)
		} catch {
			// Ignore source-hint state failures.
		} finally {
			setHasEvaluatedReferrerHint(true)
		}
	}, [sourceHint])

	useEffect(() => {
		if (!cart) return

		setQuestionAnswers(currentAnswers => {
			const nextAnswers = { ...currentAnswers }
			for (const question of cart.bookingQuestions ?? []) {
				if (nextAnswers[question.id] !== undefined) continue
				const answer = getBookingQuestionValue(question)
				if (answer !== undefined) {
					nextAnswers[question.id] = answer
				}
			}
			return nextAnswers
		})
	}, [cart])

	const preferredLocationId =
		sourceHint?.preferredLocationId ??
		referrerHint?.preferredLocationId ??
		DEFAULT_BOOKING_LOCATION_ID
	const activeSourceHint = sourceHint ?? referrerHint
	const selectedDate =
		bookableDates.find(date => getBookableDateKey(date) === selectedDateId) ??
		bookableDates.find(date => date.id === selectedDateId) ??
		bookableDates[0] ??
		null
	const selectedTime =
		bookableTimes.find(time => time.id === selectedTimeId) ?? null
	const selectedSiteLocation = selectedLocation
		? getSiteLocationForBlvdLocation(selectedLocation) ?? null
		: null
	const requiresCard = Boolean(cart?.summary.paymentMethodRequired)
	const hasVerifiedMobile = Boolean(ownershipVerifiedPhone)
	const hasCompletedBlvdOwnershipVerification = Boolean(
		hasVerifiedMobile &&
			ownershipCodeId &&
			ownershipCodeId !== BOOKING_PHONE_VERIFICATION_CODE_ID,
	)
	const hasVerifiedClient = Boolean(
		hasVerifiedMobile &&
			(hasCompletedBlvdOwnershipVerification ||
				verifiedExistingClient ||
				hasAttachedBlvdClient(cart?.clientInformation)),
	)
	const shouldCollectClientInformation = hasVerifiedMobile && !hasVerifiedClient
	const canRequestOwnershipCode =
		!hasVerifiedMobile && looksLikePhoneNumber(clientForm.phone)
	const canShowOwnershipCodeEntry = Boolean(
		ownershipCodeId && canRequestOwnershipCode,
	)
	const patientName = formatClientName({
		firstName: cart?.clientInformation?.firstName ?? clientForm.firstName,
		lastName: cart?.clientInformation?.lastName ?? clientForm.lastName,
	})
	const selectedExistingPaymentMethod =
		selectedPaymentMethodId === 'new'
			? null
			: availablePaymentMethods.find(
					paymentMethod => paymentMethod.id === selectedPaymentMethodId,
				) ?? null
	const shouldCollectCardDetails =
		requiresCard && !selectedExistingPaymentMethod
	const sourceHintAnalyticsProperties = useMemo(
		() => ({
			book_source_hint_label: activeSourceHint?.label,
			book_source_hint_path: activeSourceHint?.path,
			book_source_hint_search: activeSourceHint?.search,
			book_source_location_hint: activeSourceHint?.preferredLocationId,
		}),
		[
			activeSourceHint?.label,
			activeSourceHint?.path,
			activeSourceHint?.preferredLocationId,
			activeSourceHint?.search,
		],
	)
	const selectionAnalyticsProperties = useMemo(
		() =>
			buildBookingSelectionEventProperties({
				availablePaymentMethodCount: availablePaymentMethods.length,
				cart,
				clientHistory,
				clientHistorySelection,
				hasVerifiedClient,
				selectedExistingPaymentMethod,
				selectedLocation,
				selectedService,
			}),
		[
			availablePaymentMethods.length,
			cart,
			clientHistory,
			clientHistorySelection,
			hasVerifiedClient,
			selectedExistingPaymentMethod,
			selectedLocation,
			selectedService,
		],
	)

	useEffect(() => {
		bookingAnalyticsPropertiesRef.current = {
			...getBookingAnalyticsEventProperties(),
			...sourceHintAnalyticsProperties,
			...selectionAnalyticsProperties,
		}
	}, [selectionAnalyticsProperties, sourceHintAnalyticsProperties])

	const isCurrentBookingAnalyticsExcluded = useCallback(
		(extraInput: BookingAnalyticsExclusionInput = {}) => {
			const currentInput = bookingAnalyticsExclusionInputRef.current
			return isExcludedBookingAnalyticsIdentity({
				emails: [
					...(currentInput.emails ?? []),
					extraInput.email,
					...(extraInput.emails ?? []),
				],
				phones: [
					...(currentInput.phones ?? []),
					extraInput.phone,
					...(extraInput.phones ?? []),
				],
			})
		},
		[],
	)

	const captureBookingPostHogEvent = useCallback(
		(
			event: string,
			properties: Record<string, unknown>,
			extraInput?: BookingAnalyticsExclusionInput,
		) => {
			if (!posthog) return
			if (isCurrentBookingAnalyticsExcluded(extraInput)) return

			posthog.capture(event, properties)
		},
		[isCurrentBookingAnalyticsExcluded, posthog],
	)

	function identifyBookingPerson(input: BookingPostHogIdentityInput) {
		if (!posthog) return
		if (
			isExcludedBookingAnalyticsIdentity({
				email: input.email,
				phone: input.phone,
			})
		) {
			return
		}

		const identity = buildBookingPostHogIdentity(input)
		if (!identity) return

		const identityKey = JSON.stringify(identity)
		if (lastPostHogIdentityKeyRef.current === identityKey) return
		lastPostHogIdentityKeyRef.current = identityKey

		posthog.identify(identity.distinctId, identity.properties)
	}

	function captureBookingError({
		action,
		error,
		source = 'client',
		step = currentStep,
		userMessage,
	}: {
		action: string
		error: unknown
		source?: 'client' | 'server'
		step?: string
		userMessage?: string
	}) {
		const details = getBookingErrorDetails(error)

		captureBookingPostHogEvent('booking_error', {
			...bookingAnalyticsPropertiesRef.current,
			booking_error_action: action,
			booking_error_area: 'booking_flow',
			booking_error_code: details.code,
			booking_error_message: userMessage ?? details.safeMessage,
			booking_error_name: details.name,
			booking_error_source: source,
			booking_error_technical_message: details.technicalMessage,
			booking_step: step,
			cart_id: cart?.id,
		})
	}

	const filteredServices = useMemo(() => {
		const visibleServices = buildDisplayServiceEntries(services, clientHistory)
		const trimmedSearch = search.trim()
		if (trimmedSearch.length === 0) {
			return [...visibleServices].sort(compareServiceEntriesForDisplay)
		}

		return visibleServices
			.map(service => ({
				service,
				score: scoreService(service, trimmedSearch),
			}))
			.filter(result => result.score > 0)
			.sort((a, b) => {
				if (a.score !== b.score) return b.score - a.score
				const popularityComparison = compareServiceEntriesForDisplay(
					a.service,
					b.service,
				)
				if (popularityComparison !== 0) return popularityComparison
				if (a.service.categoryOrder !== b.service.categoryOrder) {
					return a.service.categoryOrder - b.service.categoryOrder
				}
				if (a.service.itemOrder !== b.service.itemOrder) {
					return a.service.itemOrder - b.service.itemOrder
				}
				return a.service.item.name.localeCompare(b.service.item.name)
			})
			.map(result => result.service)
	}, [clientHistory, search, services])
	const showPopularServices = Boolean(
		clientHistory && search.trim().length === 0,
	)
	const popularServices = useMemo(() => {
		if (!showPopularServices) return []

		return filteredServices
			.filter(service => service.recentBookingCount > 0)
			.slice(0, 6)
	}, [filteredServices, showPopularServices])
	const groupedServices = useMemo(() => {
		const groups = new Map<string, ServiceGroup>()

		for (const service of filteredServices) {
			const existing = groups.get(service.categoryName)
			if (existing) {
				existing.services.push(service)
				continue
			}

			groups.set(service.categoryName, {
				categoryName: service.categoryName,
				categoryOrder: service.categoryOrder,
				services: [service],
			})
		}

		return [...groups.values()].sort(
			(a, b) => a.categoryOrder - b.categoryOrder,
		)
	}, [filteredServices])

	const derivedStep = getCurrentBlvdStep({
		checkoutSuccess,
		detailsSubmitted,
		selectedLocation,
		selectedService,
		selectedTime,
	})
	const currentStep = activeStep ?? derivedStep
	const stepAvailability: Record<BlvdBookStepName, boolean> = {
		reserve: detailsSubmitted,
		details: Boolean(selectedTime),
		location: Boolean(selectedService),
		schedule: Boolean(selectedLocation),
		service: true,
	}
	const stepCompletion: Record<BlvdBookStepName, boolean> = {
		reserve: Boolean(checkoutSuccess),
		details: detailsSubmitted,
		location: Boolean(selectedLocation),
		schedule: Boolean(selectedTime),
		service: Boolean(selectedService),
	}
	const appointmentDate = toDate(
		cart?.startTime ?? selectedDate?.date ?? selectedTime?.startTime ?? null,
	)
	const appointmentStartTime = toDate(
		cart?.startTime ?? selectedTime?.startTime ?? null,
	)
	const appointmentEndTime = toDate(cart?.endTime ?? null)

	useEffect(() => {
		if (typeof window !== 'undefined') {
			window.scrollTo(0, 0)
		}
	}, [currentStep])

	useEffect(() => {
		pendingBookingStepsRef.current.add(currentStep)
		if (currentStep === 'service' && !clientHistory) return
		if (!posthog) return

		for (const step of pendingBookingStepsRef.current) {
			captureBookingPostHogEvent('booking_step_viewed', {
				...bookingAnalyticsPropertiesRef.current,
				step,
			})
		}

		pendingBookingStepsRef.current.clear()
	}, [captureBookingPostHogEvent, clientHistory, currentStep, posthog])

	const bookableDateStrings = useMemo(() => {
		return new Set(
			bookableDates.map(d => getBookableDateKey(d)).filter(Boolean),
		)
	}, [bookableDates])

	useEffect(() => {
		if (didCaptureBookingFunnelEnteredRef.current) return
		if (!hasEvaluatedReferrerHint || !posthog) return

		didCaptureBookingFunnelEnteredRef.current = true
		captureBookingPostHogEvent('booking_funnel_entered', {
			...bookingAnalyticsPropertiesRef.current,
			booking_prefill_search:
				activeSourceHint?.search || search.trim() || undefined,
		})
	}, [
		activeSourceHint?.search,
		captureBookingPostHogEvent,
		hasEvaluatedReferrerHint,
		posthog,
		search,
	])

	useEffect(() => {
		if (didHandleInitialEntryBehavior.current) return
		if (initializing || initError || !hasEvaluatedReferrerHint) return

		didHandleInitialEntryBehavior.current = true

		if (typeof window !== 'undefined' && 'gtag' in window) {
			trackGoogleEvent('cart_created')
		}

		if (selectedService) return

		window.setTimeout(() => {
			searchInputRef.current?.focus()
			searchInputRef.current?.select()
		}, 100)
	}, [hasEvaluatedReferrerHint, initError, initializing, selectedService])

	useEffect(() => {
		if (!clientHistory) return
		if (currentStep !== 'service') return
		if (selectedService) return
		if (didFocusSearchAfterClientHistory.current) return

		didFocusSearchAfterClientHistory.current = true
		window.setTimeout(() => {
			searchInputRef.current?.focus()
		}, 0)
	}, [clientHistory, currentStep, selectedService])

	function resetReturningClientState() {
		setOwnershipCodeId(null)
		setOwnershipCodeValue('')
		setOwnershipVerifiedPhone(null)
		setVerifiedExistingClient(false)
		setAvailablePaymentMethods([])
		setSelectedPaymentMethodId('new')
		setOwnershipStepError(null)
	}

	function handleSelectClientHistory(nextClientHistory: BookingClientHistory) {
		const nextResolvedClientHistory =
			nextClientHistory === 'unsure' ? null : nextClientHistory
		if (
			clientHistorySelection === nextClientHistory &&
			clientHistory === nextResolvedClientHistory
		) {
			return
		}

		const nextClientType = getBookingClientTypeFromHistory({
			clientHistory: nextResolvedClientHistory ?? nextClientHistory,
			hasVerifiedClient,
		})
		const nextClientTypeSource = getBookingClientTypeSource({
			clientHistory: nextResolvedClientHistory,
			clientHistorySelection: nextClientHistory,
			hasVerifiedClient,
		})

		if (posthog) {
			const clientHistoryProperties = {
				...bookingAnalyticsPropertiesRef.current,
				booking_client_history_selection: nextClientHistory,
				booking_client_type: nextClientType,
				booking_client_type_source: nextClientTypeSource,
			}

			captureBookingPostHogEvent(
				'booking_client_history_selected',
				clientHistoryProperties,
			)
		}

		setClientHistorySelection(nextClientHistory)
		setClientHistory(nextResolvedClientHistory)
		setClientHistoryLookupError(null)
		setClientHistoryLookupMessage(null)
		didFocusSearchAfterClientHistory.current = false
		setStepError(null)
		setOwnershipStepError(null)
		setCheckoutSuccess(null)
		setSelectedService(null)
		setPendingServiceOptionPath([])
		setPendingServiceOptionRootInstanceId(null)
		setSelectedLocation(null)
		setServiceLocations([])
		setCart(null)
		setBookableDates([])
		setBookableTimes([])
		setSelectedDateId(null)
		setSelectedTimeId(null)
		setQuestionAnswers({})
		setDetailsSubmitted(false)
		setActiveStep('service')
		resetReturningClientState()
		queueClientHistoryBookingIntent({
			clientHistory: nextResolvedClientHistory,
			clientHistorySelection: nextClientHistory,
			clientTypeSource: nextClientTypeSource,
			status: 'client_history_selected',
		})
	}

	async function handleLookupClientHistory(
		event: React.FormEvent<HTMLFormElement>,
	) {
		event.preventDefault()

		if (!looksLikePhoneNumber(clientForm.phone)) {
			setClientHistoryLookupError('Enter a valid mobile phone number.')
			return
		}

		setLookingUpClientHistory(true)
		setClientHistoryLookupError(null)
		setClientHistoryLookupMessage(null)

		try {
			const result = await requestBookingClientLookup(clientForm.phone)
			if (!result.ok) {
				throw new Error(result.error ?? 'Client lookup failed.')
			}

			const nextClientHistory: BookingClientHistory = result.client_found
				? 'returning'
				: 'new'
			const nextClientTypeSource = 'boulevard_phone_lookup'
			setClientHistory(nextClientHistory)
			setClientForm(currentForm => ({
				...currentForm,
				phone: result.phone ?? currentForm.phone,
			}))
			setClientHistoryLookupMessage(
				result.client_found
					? 'We found your profile.'
					: 'No profile found. Continue as a new client.',
			)
			didFocusSearchAfterClientHistory.current = false

			if (posthog) {
				captureBookingPostHogEvent(
					'booking_client_history_resolved',
					{
						...bookingAnalyticsPropertiesRef.current,
						booking_client_history_selection: 'unsure',
						booking_client_type: getBookingClientTypeFromHistory({
							clientHistory: nextClientHistory,
							hasVerifiedClient: false,
						}),
						booking_client_type_source: nextClientTypeSource,
					},
					{ phone: result.phone },
				)
			}

			queueClientHistoryBookingIntent({
				clientHistory: nextClientHistory,
				clientHistorySelection: 'unsure',
				clientTypeSource: nextClientTypeSource,
				phone: result.phone,
				status: 'client_history_resolved',
			})
		} catch (error) {
			const message = 'We could not check that mobile number. Please try again.'
			captureBookingError({
				action: 'lookup_client_history_phone',
				error,
				step: 'service',
				userMessage: message,
			})
			setClientHistoryLookupError(message)
		} finally {
			setLookingUpClientHistory(false)
		}
	}

	async function handleSelectService(
		service: ServiceEntry,
		renderInstanceId?: string,
	) {
		setStepError(null)
		setOwnershipStepError(null)
		setCheckoutSuccess(null)
		setSelectedLocation(null)
		setServiceLocations([])
		setCart(null)
		setBookableDates([])
		setBookableTimes([])
		setSelectedDateId(null)
		setSelectedTimeId(null)
		setQuestionAnswers({})
		setDetailsSubmitted(false)
		resetReturningClientState()

		if (service.selectionOptions?.length) {
			setLoadingLocations(false)
			setSelectedService(null)
			setPendingServiceOptionRootInstanceId(currentInstanceId => {
				if (renderInstanceId) return renderInstanceId
				return currentInstanceId
			})
			setPendingServiceOptionPath(currentPath => {
				const existingIndex = currentPath.findIndex(
					optionGroup => optionGroup.id === service.id,
				)
				if (existingIndex >= 0) return currentPath.slice(0, existingIndex + 1)

				const activeGroup = currentPath.at(-1)
				const selectedFromActiveGroup = activeGroup?.selectionOptions?.some(
					option => option.service.id === service.id,
				)
				return selectedFromActiveGroup ? [...currentPath, service] : [service]
			})
			setActiveStep('service')
			return
		}

		setLoadingLocations(true)
		setSelectedService(service)
		setPendingServiceOptionPath([])
		setPendingServiceOptionRootInstanceId(null)
		setActiveStep(null)

		try {
			const variants = await service.item.getLocationVariants()
			const nextLocations = sortLocationsByPreference(
				dedupeLocations(variants.map(variant => variant.location)),
				preferredLocationId,
			)
			setServiceLocations(nextLocations)

			if (nextLocations.length === 1) {
				await handleSelectLocation(nextLocations[0]!, service)
			} else {
				setActiveStep('location')
			}
		} catch (error) {
			captureBookingError({
				action: 'load_service_locations',
				error,
				step: 'service',
				userMessage: 'We could not load locations for that service.',
			})
			setStepError('We could not load locations for that service.')
		} finally {
			setLoadingLocations(false)
		}
	}

	async function handleSelectLocation(
		location: BlvdLocation,
		serviceOverride?: ServiceEntry,
	) {
		const activeService = serviceOverride ?? selectedService
		if (!client || !activeService) return

		setLoadingSchedule(true)
		setStepError(null)
		setOwnershipStepError(null)
		setCheckoutSuccess(null)
		setSelectedLocation(location)
		setActiveStep('location')
		setDetailsSubmitted(false)
		resetReturningClientState()
		setBookableDates([])
		setBookableTimes([])
		setSelectedDateId(null)
		setSelectedTimeId(null)

		try {
			let nextCart = await client.carts.create(location)
			const preferredStaffVariant = await getPreferredStaffVariant(
				activeService.item,
			)
			nextCart = await nextCart.addBookableItem(activeService.item, {
				...(preferredStaffVariant
					? { staffVariant: preferredStaffVariant }
					: {}),
			})
			setCart(nextCart)

			const nextDates = await nextCart.getBookableDates({
				location,
				timezone: location.tz ?? undefined,
			})
			setBookableDates(nextDates)

			if (nextDates[0]) {
				setSelectedDateId(getBookableDateKey(nextDates[0]) ?? nextDates[0].id)
				const nextTimes = await nextCart.getBookableTimes(nextDates[0], {
					location,
					timezone: location.tz ?? undefined,
				})
				setBookableTimes(nextTimes)
			}
		} catch (error) {
			captureBookingError({
				action: 'load_schedule',
				error,
				step: 'location',
				userMessage: 'We could not load the schedule for that location.',
			})
			setStepError('We could not load the schedule for that location.')
		} finally {
			setLoadingSchedule(false)
		}
	}

	async function handleSelectDate(date: BlvdBookableDate) {
		if (!cart || !selectedLocation) return

		setLoadingTimes(true)
		setStepError(null)
		setOwnershipStepError(null)
		setSelectedDateId(getBookableDateKey(date) ?? date.id)
		setActiveStep(null)
		setDetailsSubmitted(false)
		setSelectedTimeId(null)
		setCheckoutSuccess(null)
		setBookableTimes([])

		try {
			const nextTimes = await cart.getBookableTimes(date, {
				location: selectedLocation,
				timezone: selectedLocation.tz ?? undefined,
			})
			setBookableTimes(nextTimes)
		} catch (error) {
			captureBookingError({
				action: 'load_bookable_times',
				error,
				step: 'schedule',
				userMessage: 'We could not load times for that date.',
			})
			setStepError('We could not load times for that date.')
		} finally {
			setLoadingTimes(false)
		}
	}

	async function handleSelectTime(time: BlvdBookableTime) {
		if (!cart) return

		setLoadingSchedule(true)
		setStepError(null)
		setOwnershipStepError(null)
		setCheckoutSuccess(null)
		setDetailsSubmitted(false)

		try {
			const nextCart = await cart.reserveBookableItems(time)
			setCart(nextCart)
			setActiveStep(null)
			setSelectedTimeId(time.id)
			queueCurrentBlvdBookingIntent({
				cartOverride: nextCart,
				selectedTimeOverride: time,
				status: 'time_selected',
				step: 'details',
			})
		} catch (error) {
			captureBookingError({
				action: 'reserve_selected_time',
				error,
				step: 'schedule',
				userMessage:
					'We could not reserve that time. Please choose another time.',
			})
			setStepError(
				'We could not reserve that time. Please choose another time.',
			)
		} finally {
			setLoadingSchedule(false)
		}
	}

	async function handleDetailsSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()

		if (!cart || !selectedService || !selectedLocation) return

		const validationError = validateClientDetails({
			answers: questionAnswers,
			clientForm,
			hasVerifiedMobile,
			requireClientInformation: shouldCollectClientInformation,
			questions: cart.bookingQuestions,
		})
		if (validationError) {
			if (isMobileVerificationValidationError(validationError)) {
				setOwnershipStepError(validationError)
				setStepError(null)
			} else {
				setStepError(validationError)
			}
			return
		}

		setStepError(null)
		setOwnershipStepError(null)
		identifyBookingPerson({
			boulevardClientId: cart.clientInformation?.externalId,
			email: cart.clientInformation?.email ?? clientForm.email,
			firstName: cart.clientInformation?.firstName ?? clientForm.firstName,
			lastName: cart.clientInformation?.lastName ?? clientForm.lastName,
			phone:
				cart.clientInformation?.phoneNumber ??
				ownershipVerifiedPhone ??
				clientForm.phone,
		})
		setDetailsSubmitted(true)
		setActiveStep('reserve')
		queueCurrentBlvdBookingIntent({
			status: 'reserve_started',
			step: 'reserve',
		})
	}

	async function handleCheckout(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()

		if (!cart || !selectedService || !selectedLocation) return

		if (!selectedTime) {
			setStepError('Please choose an appointment time before booking.')
			return
		}

		if (shouldCollectCardDetails) {
			const paymentError = validatePaymentDetails(clientForm)
			if (paymentError) {
				setStepError(paymentError)
				return
			}
		}

		setSubmittingBooking(true)
		setStepError(null)

		try {
			let nextCart = cart

			if (hasVerifiedClient) {
				if (clientForm.notes.trim()) {
					nextCart = await nextCart.update({
						clientMessage: clientForm.notes.trim(),
					})
				}
			} else {
				nextCart = await nextCart.update({
					clientInformation: {
						email: clientForm.email.trim(),
						firstName: clientForm.firstName.trim(),
						lastName: clientForm.lastName.trim(),
						phoneNumber: normalizePhoneNumber(clientForm.phone),
					},
					clientMessage: clientForm.notes.trim() || undefined,
				})
			}

			for (const questionId of nextCart.bookingQuestions.map(
				question => question.id,
			)) {
				const question = nextCart.bookingQuestions.find(
					candidate => candidate.id === questionId,
				)
				if (!question) continue

				const answer = questionAnswers[question.id]
				if (!hasBookingQuestionAnswer(answer)) continue

				nextCart = await question.submitAnswer(
					getSubmissionValueForQuestion(question, answer),
				)
			}

			if (
				nextCart.summary.paymentMethodRequired &&
				selectedExistingPaymentMethod
			) {
				nextCart = await nextCart.selectPaymentMethod(
					selectedExistingPaymentMethod,
				)
			} else if (nextCart.summary.paymentMethodRequired) {
				const card = parseCardDetails(clientForm)
				nextCart = await nextCart.addCardPaymentMethod({ card })
			}

			nextCart = await ensureCartHasSelectedTime(nextCart, selectedTime)
			setCart(nextCart)

			const checkoutPayload = await nextCart.checkout()
			setCart(checkoutPayload.cart)
			identifyBookingPerson({
				boulevardClientId:
					checkoutPayload.appointments.find(appointment => appointment.clientId)
						?.clientId ?? checkoutPayload.cart.clientInformation?.externalId,
				email:
					checkoutPayload.cart.clientInformation?.email ?? clientForm.email,
				firstName:
					checkoutPayload.cart.clientInformation?.firstName ??
					clientForm.firstName,
				lastName:
					checkoutPayload.cart.clientInformation?.lastName ??
					clientForm.lastName,
				phone:
					checkoutPayload.cart.clientInformation?.phoneNumber ??
					ownershipVerifiedPhone ??
					clientForm.phone,
			})

			const projectedRevenueUsd = getProjectedRevenueForBlvdService(
				selectedService.item.name,
			)
			const selectedPaymentMethodType = nextCart.summary.paymentMethodRequired
				? selectedExistingPaymentMethod
					? 'saved_card'
					: 'new_card'
				: 'none_required'

			if (typeof window !== 'undefined' && 'gtag' in window) {
				trackGoogleEvent('purchase', {
					currency: 'USD',
					value: projectedRevenueUsd,
					items: [
						{
							item_id: selectedService.item.id,
							item_name: selectedService.item.name,
							price: projectedRevenueUsd,
							quantity: 1,
						},
					],
				})
			}

			setCheckoutSuccess({
				appointmentIds: checkoutPayload.appointments.map(
					appointment => appointment.appointmentId,
				),
				endTime: toDate(checkoutPayload.cart.endTime ?? null),
				locationName: selectedLocation.name,
				serviceName: selectedService.item.name,
				startTime: toDate(checkoutPayload.cart.startTime ?? null),
			})

			if (posthog) {
				captureBookingPostHogEvent('booking_step_viewed', {
					...bookingAnalyticsPropertiesRef.current,
					step: 'success',
				})
				captureBookingPostHogEvent('booking_completed', {
					...bookingAnalyticsPropertiesRef.current,
					appointment_count: checkoutPayload.appointments.length,
					booking_selected_payment_method_type: selectedPaymentMethodType,
					booking_value_usd: projectedRevenueUsd,
					service: selectedService.item.name,
					location: selectedLocation.name,
					value: projectedRevenueUsd,
				})
				captureBookingPostHogEvent('booking_conversion_completed', {
					...bookingAnalyticsPropertiesRef.current,
					$insert_id: `booking-conversion:website:${checkoutPayload.cart.id}`,
					appointment_count: checkoutPayload.appointments.length,
					booking_channel: 'website_booking',
					booking_selected_payment_method_type: selectedPaymentMethodType,
					booking_value_usd: projectedRevenueUsd,
					conversion_channel: 'website',
					conversion_source: 'website_booking',
					currency: 'USD',
					location: selectedLocation.name,
					service: selectedService.item.name,
					value: projectedRevenueUsd,
				})
			}

			queueBlvdBookingAttributionTouch({
				appointments: checkoutPayload.appointments.map(appointment => ({
					appointmentId: appointment.appointmentId,
					clientId: appointment.clientId ?? undefined,
					endTime: checkoutPayload.cart.endTime
						? toDate(checkoutPayload.cart.endTime)?.toISOString()
						: undefined,
					forCartOwner: appointment.forCartOwner ?? undefined,
					startTime: checkoutPayload.cart.startTime
						? toDate(checkoutPayload.cart.startTime)?.toISOString()
						: undefined,
				})),
				attribution: bookingAnalyticsPropertiesRef.current,
				booking: {
					cartId: checkoutPayload.cart.id,
					hasVerifiedClient,
					locationId: selectedLocation.id,
					locationName: selectedLocation.name,
					occurredAt: new Date().toISOString(),
					selectedPaymentMethodType,
					serviceCategory: selectedService.categoryName,
					serviceId: selectedService.item.id,
					serviceName: selectedService.item.name,
					valueUsd: projectedRevenueUsd,
				},
				client: {
					boulevardClientId:
						checkoutPayload.appointments.find(
							appointment => appointment.clientId,
						)?.clientId ??
						checkoutPayload.cart.clientInformation?.externalId ??
						undefined,
					email:
						checkoutPayload.cart.clientInformation?.email ??
						clientForm.email ??
						undefined,
					firstName:
						checkoutPayload.cart.clientInformation?.firstName ??
						clientForm.firstName ??
						undefined,
					lastName:
						checkoutPayload.cart.clientInformation?.lastName ??
						clientForm.lastName ??
						undefined,
					phone:
						checkoutPayload.cart.clientInformation?.phoneNumber ??
						clientForm.phone ??
						undefined,
				},
			})
			queueCurrentBlvdBookingIntent({
				appointmentIds: checkoutPayload.appointments.map(
					appointment => appointment.appointmentId,
				),
				cartOverride: checkoutPayload.cart,
				status: 'completed',
				step: 'success',
			})

			if (typeof window !== 'undefined') {
				window.scrollTo({ top: 0, behavior: 'smooth' })
			}
		} catch (error) {
			const checkoutUserMessage = getCheckoutUserMessage(error)
			captureBookingError({
				action: 'checkout',
				error,
				step: 'reserve',
				userMessage: checkoutUserMessage,
			})

			if (error && typeof error === 'object') {
				const err = error as any

				// Try to extract from the standard `response` property
				if (err.response?.errors?.[0]?.message) {
					setStepError(checkoutUserMessage)
					return
				}

				// Boulevard errors sometimes come wrapped as a stringified error object in message
				if (
					typeof err.message === 'string' &&
					err.message.includes('CART_PAYMENT_METHOD_FAILED')
				) {
					setStepError(
						'Please check your payment zip code and CVV and try again.',
					)
					return
				}

				if (typeof err.message === 'string' && err.message.includes('{')) {
					try {
						const match = err.message.match(/({.*})/)
						if (match) {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
							const parsed: any = JSON.parse(match[1])
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
							if (parsed?.response?.errors?.[0]?.message) {
								setStepError(checkoutUserMessage)
								return
							}
						}
					} catch {}
				}
			}
			setStepError(checkoutUserMessage)
		} finally {
			setSubmittingBooking(false)
		}
	}

	function updateQuestionAnswer(questionId: string, value: unknown) {
		setQuestionAnswers(currentAnswers => ({
			...currentAnswers,
			[questionId]: value,
		}))
	}

	function updateClientForm(
		event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) {
		const { name, value } = event.currentTarget
		if (name === 'phone') {
			resetReturningClientState()
		}
		setClientForm(currentForm => ({ ...currentForm, [name]: value }))
	}

	async function handleSendOwnershipCode() {
		if (!cart) return

		if (!looksLikePhoneNumber(clientForm.phone)) {
			setOwnershipStepError(
				'Enter a valid mobile phone number before requesting a verification code.',
			)
			setStepError(null)
			return
		}

		setSendingOwnershipCode(true)
		setStepError(null)
		setOwnershipStepError(null)

		try {
			const normalizedPhone = normalizePhoneNumber(clientForm.phone)
			if (clientHistory === 'new') {
				await sendBookingPhoneVerificationCode(normalizedPhone)
				setOwnershipCodeId(BOOKING_PHONE_VERIFICATION_CODE_ID)
				setOwnershipCodeValue('')
				setOwnershipVerifiedPhone(null)
				setVerifiedExistingClient(false)
				setAvailablePaymentMethods([])
				setSelectedPaymentMethodId('new')
				return
			}

			const codeId = await cart.sendOwnershipCodeBySms(normalizedPhone)
			setOwnershipCodeId(codeId)
			setOwnershipCodeValue('')
			setOwnershipVerifiedPhone(null)
			setVerifiedExistingClient(false)
			setAvailablePaymentMethods([])
			setSelectedPaymentMethodId('new')
		} catch (error) {
			const normalizedPhone = normalizePhoneNumber(clientForm.phone)
			const isClientNotFound = isClientNotFoundByMobilePhoneError(error)

			captureBookingError({
				action: 'send_mobile_verification_code',
				error,
				step: 'details',
				userMessage: getOwnershipCodeUserMessage(error, clientHistory),
			})

			if (isClientNotFound && clientHistory === 'unsure') {
				try {
					await sendBookingPhoneVerificationCode(normalizedPhone)
					setOwnershipCodeId(BOOKING_PHONE_VERIFICATION_CODE_ID)
					setOwnershipCodeValue('')
					setOwnershipVerifiedPhone(null)
					setVerifiedExistingClient(false)
					setAvailablePaymentMethods([])
					setSelectedPaymentMethodId('new')
					setOwnershipStepError(null)
					return
				} catch (fallbackError) {
					captureBookingError({
						action: 'send_new_client_mobile_verification_code',
						error: fallbackError,
						step: 'details',
						userMessage:
							'We could not send that code. Please check the number and try again.',
					})
					setOwnershipStepError(
						'We could not send that code. Please check the number and try again.',
					)
					return
				}
			}

			setOwnershipStepError(getOwnershipCodeUserMessage(error, clientHistory))
		} finally {
			setSendingOwnershipCode(false)
		}
	}

	async function handleVerifyOwnershipCode() {
		if (!cart || !ownershipCodeId) return

		const normalizedCode = ownershipCodeValue.replace(/\D/g, '')
		if (normalizedCode.length !== 6) {
			setOwnershipStepError(
				'Enter the 6-digit verification code from your text message.',
			)
			setStepError(null)
			return
		}

		setVerifyingOwnershipCode(true)
		setStepError(null)
		setOwnershipStepError(null)

		try {
			if (ownershipCodeId === BOOKING_PHONE_VERIFICATION_CODE_ID) {
				await verifyBookingPhoneVerificationCode({
					code: normalizedCode,
					phone: normalizePhoneNumber(clientForm.phone),
				})
				identifyBookingPerson({
					email: clientForm.email,
					firstName: clientForm.firstName,
					lastName: clientForm.lastName,
					phone: normalizePhoneNumber(clientForm.phone),
				})
				setOwnershipVerifiedPhone(normalizePhoneNumber(clientForm.phone))
				setVerifiedExistingClient(false)
				setOwnershipCodeId(null)
				setOwnershipCodeValue('')
				setAvailablePaymentMethods([])
				setSelectedPaymentMethodId('new')
				queueCurrentBlvdBookingIntent({
					hasVerifiedMobileOverride: true,
					selectedPaymentMethodIdOverride: 'new',
					status: 'mobile_verified',
					step: 'details',
				})
				return
			}

			const nextCart = await cart.takeOwnershipByCode(
				ownershipCodeId,
				Number(normalizedCode),
			)
			identifyBookingPerson({
				boulevardClientId: nextCart.clientInformation?.externalId,
				email: nextCart.clientInformation?.email ?? clientForm.email,
				firstName:
					nextCart.clientInformation?.firstName ?? clientForm.firstName,
				lastName: nextCart.clientInformation?.lastName ?? clientForm.lastName,
				phone:
					nextCart.clientInformation?.phoneNumber ??
					normalizePhoneNumber(clientForm.phone),
			})
			setCart(nextCart)
			setOwnershipVerifiedPhone(normalizePhoneNumber(clientForm.phone))
			setVerifiedExistingClient(true)
			setOwnershipCodeValue('')

			const nextClientInformation = nextCart.clientInformation
			if (nextClientInformation) {
				setClientForm(currentForm => ({
					...currentForm,
					email: currentForm.email.trim() || nextClientInformation.email || '',
					firstName:
						currentForm.firstName.trim() ||
						nextClientInformation.firstName ||
						'',
					lastName:
						currentForm.lastName.trim() || nextClientInformation.lastName || '',
				}))
			}

			let nextPaymentMethods: BlvdPaymentMethod[] = []
			try {
				nextPaymentMethods = await nextCart.getAvailablePaymentMethods()
			} catch {
				// Payment methods are helpful but not required to continue.
			}

			setAvailablePaymentMethods(nextPaymentMethods)
			setSelectedPaymentMethodId(nextPaymentMethods[0]?.id ?? 'new')
			queueCurrentBlvdBookingIntent({
				cartOverride: nextCart,
				hasVerifiedMobileOverride: true,
				selectedPaymentMethodIdOverride: nextPaymentMethods[0]?.id ?? 'new',
				status: 'mobile_verified',
				step: 'details',
			})

			if (allRequiredBookingQuestionsAnswered(nextCart, questionAnswers)) {
				setDetailsSubmitted(true)
				setActiveStep('reserve')
				queueCurrentBlvdBookingIntent({
					cartOverride: nextCart,
					hasVerifiedMobileOverride: true,
					selectedPaymentMethodIdOverride: nextPaymentMethods[0]?.id ?? 'new',
					status: 'reserve_started',
					step: 'reserve',
				})
			}
		} catch (error) {
			captureBookingError({
				action: 'verify_mobile_code',
				error,
				step: 'details',
				userMessage: getVerifyCodeUserMessage(error),
			})
			setOwnershipStepError(getVerifyCodeUserMessage(error))
		} finally {
			setVerifyingOwnershipCode(false)
		}
	}

	function queueCurrentBlvdBookingIntent({
		appointmentIds,
		cartOverride,
		hasVerifiedMobileOverride,
		selectedPaymentMethodIdOverride,
		selectedTimeOverride,
		status,
		step,
	}: {
		appointmentIds?: string[]
		cartOverride?: BlvdCart | null
		hasVerifiedMobileOverride?: boolean
		selectedPaymentMethodIdOverride?: string
		selectedTimeOverride?: BlvdBookableTime | null
		status: string
		step: string
	}) {
		const intentCart = cartOverride ?? cart
		if (!intentCart || !selectedService || !selectedLocation) return

		const intentSelectedTime = selectedTimeOverride ?? selectedTime
		const intentHasVerifiedMobile =
			hasVerifiedMobileOverride ?? Boolean(ownershipVerifiedPhone)
		const intentSelectedPaymentMethodId =
			selectedPaymentMethodIdOverride ?? selectedPaymentMethodId
		const intentSelectedExistingPaymentMethod =
			intentSelectedPaymentMethodId === 'new'
				? null
				: availablePaymentMethods.find(
						paymentMethod => paymentMethod.id === intentSelectedPaymentMethodId,
					) ?? null
		const intentHasVerifiedClient = Boolean(
			intentHasVerifiedMobile &&
				(hasVerifiedClient ||
					Boolean(hasVerifiedMobileOverride) ||
					hasAttachedBlvdClient(intentCart.clientInformation)),
		)
		const intentStartTime =
			toDate(intentSelectedTime?.startTime ?? null) ??
			toDate(intentCart.startTime ?? null)
		const intentEndTime = toDate(intentCart.endTime ?? null)
		const intentPaymentMethodType = intentCart.summary.paymentMethodRequired
			? intentSelectedExistingPaymentMethod
				? 'saved_card'
				: 'new_card'
			: 'none_required'
		const clientInformation = intentCart.clientInformation
		const payload = {
			attribution: bookingAnalyticsPropertiesRef.current,
			booking: {
				appointmentCount: appointmentIds?.length,
				appointmentIds,
				cartId: intentCart.id,
				clientHistorySelection:
					clientHistorySelection ?? clientHistory ?? undefined,
				clientType: getBookingClientTypeFromHistory({
					clientHistory,
					hasVerifiedClient: intentHasVerifiedClient,
				}),
				clientTypeSource: getBookingClientTypeSource({
					clientHistory,
					clientHistorySelection,
					hasVerifiedClient: intentHasVerifiedClient,
				}),
				hasVerifiedClient: intentHasVerifiedClient,
				hasVerifiedMobile: intentHasVerifiedMobile,
				locationId: selectedLocation.id,
				locationName: selectedLocation.name,
				requiresCard: Boolean(intentCart.summary.paymentMethodRequired),
				selectedEndTime: intentEndTime?.toISOString(),
				selectedPaymentMethodType: intentPaymentMethodType,
				selectedStartTime: intentStartTime?.toISOString(),
				serviceCategory: selectedService.categoryName,
				serviceClientFit: getBlvdServiceClientFit({
					categoryName: selectedService.categoryName,
					name: selectedService.item.name,
				}),
				serviceDisplayName: selectedService.displayName,
				serviceDisplayGroupId: selectedService.displayGroupId,
				serviceGroupedServiceIds: selectedService.groupedServiceIds,
				serviceId: selectedService.item.id,
				serviceName: selectedService.item.name,
				valueUsd: getProjectedRevenueForBlvdService(selectedService.item.name),
			},
			client: {
				boulevardClientId: clientInformation?.externalId ?? undefined,
				email: clientInformation?.email ?? clientForm.email ?? undefined,
				firstName:
					clientInformation?.firstName ?? clientForm.firstName ?? undefined,
				lastName:
					clientInformation?.lastName ?? clientForm.lastName ?? undefined,
				phone:
					clientInformation?.phoneNumber ??
					ownershipVerifiedPhone ??
					clientForm.phone ??
					undefined,
			},
			occurred_at: new Date().toISOString(),
			status,
			step,
		}
		const dedupeKey = JSON.stringify({ ...payload, occurred_at: undefined })
		if (lastBookingIntentKeyRef.current === dedupeKey) return
		lastBookingIntentKeyRef.current = dedupeKey
		queueBlvdBookingIntent(payload)
	}

	function queueClientHistoryBookingIntent({
		clientHistory,
		clientHistorySelection,
		clientTypeSource,
		phone,
		status,
	}: {
		clientHistory: BookingClientHistory | null
		clientHistorySelection: BookingClientHistory
		clientTypeSource: string
		phone?: string | null
		status: string
	}) {
		const intentHasVerifiedMobile = Boolean(ownershipVerifiedPhone)
		const intentHasVerifiedClient = Boolean(
			intentHasVerifiedMobile && hasVerifiedClient,
		)
		const payload = {
			attribution: bookingAnalyticsPropertiesRef.current,
			booking: {
				clientHistorySelection,
				clientType: getBookingClientTypeFromHistory({
					clientHistory: clientHistory ?? clientHistorySelection,
					hasVerifiedClient: intentHasVerifiedClient,
				}),
				clientTypeSource,
				hasVerifiedClient: intentHasVerifiedClient,
				hasVerifiedMobile: intentHasVerifiedMobile,
			},
			client: {
				phone: phone ?? ownershipVerifiedPhone ?? clientForm.phone ?? undefined,
			},
			occurred_at: new Date().toISOString(),
			status,
			step: 'service',
		}
		const dedupeKey = JSON.stringify({ ...payload, occurred_at: undefined })
		if (lastBookingIntentKeyRef.current === dedupeKey) return
		lastBookingIntentKeyRef.current = dedupeKey
		queueBlvdBookingIntent(payload)
	}

	function renderServiceCard(service: ServiceEntry, renderInstanceId: string) {
		const isActivePendingInstance =
			pendingServiceOptionRootInstanceId === renderInstanceId
		const pendingPathIndex = isActivePendingInstance
			? pendingServiceOptionPath.findIndex(
					optionGroup => optionGroup.id === service.id,
				)
			: -1
		const activeOptionGroup =
			pendingPathIndex >= 0 ? pendingServiceOptionPath.at(-1) ?? null : null
		const isSelected =
			selectedService?.id === service.id || pendingPathIndex >= 0
		const displayPrice = service.displayPrice ?? getDisplayPrice(service.item)
		const displayName = service.displayName
		const displayDescription =
			service.displayDescription ?? service.item.description
		const displayDuration =
			service.displayDurationLabel ??
			formatDurationRange(service.item.listDurationRange)

		return (
			<div key={renderInstanceId} className="min-w-0">
				<button
					type="button"
					onClick={() => {
						void handleSelectService(service, renderInstanceId)
					}}
					className={cn(
						'w-full min-w-0 rounded-xl border bg-white p-5 text-left transition hover:border-primary hover:shadow-md',
						isSelected && 'border-primary shadow-sm',
					)}
				>
					<div className="mb-2 flex w-full items-start justify-between gap-4">
						<div className="min-w-0 flex-1">
							<h4 className="break-words text-lg font-semibold sm:text-xl">
								{displayName}
							</h4>
							{displayPrice ? (
								<p className="mt-2 text-sm font-medium text-primary">
									{displayPrice}
								</p>
							) : null}
						</div>
						{isSelected ? (
							<span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground">
								Selected
							</span>
						) : null}
					</div>
					{displayDescription ? (
						<p className="line-clamp-4 text-sm text-muted-foreground">
							{displayDescription}
						</p>
					) : null}
					<div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
						{displayDuration ? <span>{displayDuration}</span> : null}
					</div>
				</button>
				{activeOptionGroup?.selectionOptions?.length ? (
					<div className="mt-3 rounded-xl border bg-white p-4 shadow-sm">
						{activeOptionGroup.id !== service.id ? (
							<div className="text-sm font-semibold text-foreground">
								{activeOptionGroup.displayName}
							</div>
						) : null}
						<div className="text-sm font-medium text-muted-foreground">
							{activeOptionGroup.selectionPrompt ?? 'Choose one'}
						</div>
						<div className="mt-3 grid gap-2">
							{activeOptionGroup.selectionOptions.map(option => {
								const optionPrice =
									option.service.displayPrice ??
									getDisplayPrice(option.service.item)
								const optionDescription =
									option.service.displayDescription ??
									option.service.item.description
								return (
									<Button
										key={option.service.id}
										type="button"
										variant="outline"
										className="h-auto min-h-12 w-full flex-col items-start justify-center gap-1 whitespace-normal px-4 py-3 text-left"
										onClick={() => {
											void handleSelectService(option.service)
										}}
									>
										<span className="block w-full break-words font-medium leading-snug">
											{option.label}
										</span>
										{optionPrice ? (
											<span className="block w-full break-words text-sm font-normal leading-snug text-muted-foreground">
												{optionPrice}
											</span>
										) : null}
										{optionDescription ? (
											<span className="line-clamp-3 block w-full break-words text-xs font-normal leading-snug text-muted-foreground">
												{optionDescription}
											</span>
										) : null}
									</Button>
								)
							})}
						</div>
					</div>
				) : null}
			</div>
		)
	}

	function renderServiceCardTiles(
		servicesToRender: ServiceEntry[],
		sectionKey: string,
	) {
		const leftColumnServices = servicesToRender.filter(
			(_service, index) => index % 2 === 0,
		)
		const rightColumnServices = servicesToRender.filter(
			(_service, index) => index % 2 === 1,
		)

		return (
			<>
				<div className="space-y-4 md:hidden">
					{servicesToRender.map(service =>
						renderServiceCard(service, `${sectionKey}:mobile:${service.id}`),
					)}
				</div>
				<div className="hidden w-full gap-4 md:grid md:grid-cols-2">
					<div className="space-y-4">
						{leftColumnServices.map(service =>
							renderServiceCard(service, `${sectionKey}:desktop:${service.id}`),
						)}
					</div>
					<div className="space-y-4">
						{rightColumnServices.map(service =>
							renderServiceCard(service, `${sectionKey}:desktop:${service.id}`),
						)}
					</div>
				</div>
			</>
		)
	}

	return (
		<div className="container max-w-6xl py-4 sm:py-8 lg:py-16">
			<div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-8">
				{!apiKey || !businessId ? (
					<Card>
						<CardHeader>
							<CardTitle>Boulevard Config Missing</CardTitle>
							<CardDescription>
								This preview route needs <code>BLVD_API_KEY</code> and{' '}
								<code>BLVD_BUSINESS_ID</code> in the environment.
							</CardDescription>
						</CardHeader>
					</Card>
				) : null}

				{initializing ? (
					<Card>
						<CardHeader>
							<CardTitle>Loading...</CardTitle>
							<CardDescription>
								Pulling live services and locations.
							</CardDescription>
						</CardHeader>
					</Card>
				) : null}

				{initError ? (
					<Card className="border-destructive/40">
						<CardHeader>
							<CardTitle>Unable To Load Services</CardTitle>
							<CardDescription>{initError}</CardDescription>
						</CardHeader>
					</Card>
				) : null}

				{stepError ? (
					<div className="flex w-full justify-center px-4">
						<Card className="mb-4 mt-4 w-full max-w-5xl border-destructive/40">
							<CardHeader>
								<CardTitle className="text-destructive">
									Something Needs Attention
								</CardTitle>
								<CardDescription>{stepError}</CardDescription>
							</CardHeader>
						</Card>
					</div>
				) : null}

				{checkoutSuccess ? (
					<div className="flex min-h-full w-full flex-col items-center justify-center py-12">
						<Card className="mx-auto flex w-full max-w-xl flex-col items-center space-y-8 border-none px-6 py-10 shadow-none sm:px-12">
							<div className="flex flex-col items-center space-y-2 text-center">
								<h2 className="flex items-center gap-2 text-4xl font-bold tracking-tight">
									Success! <span className="text-3xl">🎉</span>
								</h2>
								<p className="text-xl text-muted-foreground">
									Your appointment is confirmed.
								</p>
							</div>
							<div className="pointer-events-none flex w-full justify-center">
								<BlvdAppointmentDetails
									appointmentDate={checkoutSuccess.startTime}
									appointmentEndTime={checkoutSuccess.endTime}
									appointmentStartTime={checkoutSuccess.startTime}
									cart={cart}
									selectedLocation={selectedLocation}
									selectedService={selectedService}
									selectedSiteLocation={selectedSiteLocation}
									servicePendingConfirmation={false}
									sourceHint={null}
								/>
							</div>
							<div className="flex w-full flex-col items-center space-y-6">
								{checkoutSuccess.appointmentIds.length > 0 ? (
									<p className="mt-4 text-center text-[0.95rem] text-muted-foreground">
										Confirmation ID:{' '}
										<code className="break-all bg-transparent p-0 tracking-wide text-muted-foreground">
											{checkoutSuccess.appointmentIds.join(', ')}
										</code>
									</p>
								) : null}
								<Button
									type="button"
									size="lg"
									className="mt-4 w-full px-8 sm:w-auto"
									onClick={() => (window.location.href = '/')}
								>
									Return to Home
								</Button>
							</div>
						</Card>
					</div>
				) : !initializing && !initError && client ? (
					<div className="mx-auto my-4 flex min-h-full w-full flex-col items-center justify-center space-y-4 px-2 transition-all duration-300">
						<BlvdStepTracker
							currentStep={currentStep}
							onStepClick={(step: BlvdBookStepName) => setActiveStep(step)}
							stepAvailability={stepAvailability}
							stepCompletion={stepCompletion}
						/>
						<Card className="flex w-full max-w-5xl flex-col items-stretch bg-white p-4 pb-6 transition-all duration-300 lg:flex-row lg:items-start lg:space-x-8">
							<div className="order-2 mt-6 w-full max-w-xs flex-shrink-0 self-center lg:order-1 lg:mt-0 lg:w-64 lg:self-auto">
								<BlvdAppointmentDetails
									appointmentDate={appointmentDate}
									appointmentEndTime={appointmentEndTime}
									appointmentStartTime={appointmentStartTime}
									cart={cart}
									selectedLocation={selectedLocation}
									selectedService={selectedService}
									selectedSiteLocation={selectedSiteLocation}
									servicePendingConfirmation={false}
									sourceHint={activeSourceHint}
								/>
							</div>
							<div className="order-1 w-full min-w-0 flex-1 lg:order-2">
								{currentStep === 'service' ? (
									<div className="flex w-full max-w-full flex-col items-center space-y-6 overflow-hidden">
										<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest text-foreground">
											Service
										</h2>
										{clientHistorySelection ? null : (
											<div className="-mt-2 flex w-full max-w-2xl flex-col items-center gap-3">
												<h3 className="text-center text-lg font-semibold">
													Have you been with us before?
												</h3>
												<div className="grid w-full max-w-sm grid-cols-1 gap-3">
													{CLIENT_HISTORY_OPTIONS.map(option => (
														<Button
															key={option.value}
															type="button"
															variant="outline"
															className="h-12"
															onClick={() =>
																handleSelectClientHistory(option.value)
															}
														>
															{option.label}
														</Button>
													))}
												</div>
											</div>
										)}

										{clientHistorySelection === 'unsure' && !clientHistory ? (
											<form
												className="w-full max-w-2xl space-y-3 rounded-xl border bg-white p-4"
												onSubmit={handleLookupClientHistory}
											>
												<div className="space-y-2">
													<Label htmlFor="clientHistoryPhone">
														Mobile phone
													</Label>
													<Input
														id="clientHistoryPhone"
														name="phone"
														type="tel"
														value={clientForm.phone}
														onChange={updateClientForm}
													/>
												</div>
												{clientHistoryLookupError ? (
													<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
														{clientHistoryLookupError}
													</div>
												) : null}
												<Button
													type="submit"
													className="w-full sm:w-auto"
													disabled={lookingUpClientHistory}
												>
													{lookingUpClientHistory ? 'Checking...' : 'Continue'}
												</Button>
											</form>
										) : null}

										{clientHistoryLookupMessage && clientHistory ? (
											<p className="text-sm text-muted-foreground">
												{clientHistoryLookupMessage}
											</p>
										) : null}

										{clientHistory ? (
											<div className="flex w-full max-w-full flex-col items-center gap-3 px-1 py-1 sm:flex-row">
												<Input
													ref={searchInputRef}
													className="w-full"
													placeholder="Search Botox, lip filler, microneedling, weight loss..."
													value={search}
													onChange={event =>
														setSearch(event.currentTarget.value)
													}
												/>
												{search ? (
													<Button
														type="button"
														variant="outline"
														className="w-full shrink-0 sm:w-auto"
														onClick={() => setSearch('')}
													>
														Clear Filter
													</Button>
												) : null}
											</div>
										) : null}

										{!clientHistory && !clientHistorySelection ? (
											<p className="text-sm text-muted-foreground">
												Choose one to show the right services.
											</p>
										) : !clientHistory ? null : filteredServices.length ===
										  0 ? (
											<div className="space-y-3 text-center">
												<p className="text-sm text-muted-foreground">
													No services matched that search yet.
												</p>
												{search ? (
													<Button
														type="button"
														variant="outline"
														onClick={() => setSearch('')}
													>
														Clear Filter
													</Button>
												) : null}
											</div>
										) : (
											<div className="w-full max-w-full space-y-8">
												{popularServices.length > 0 ? (
													<div className="w-full space-y-4">
														<div className="border-b pb-3">
															<h3 className="text-lg font-semibold tracking-wide text-foreground">
																Popular Services
															</h3>
														</div>
														{renderServiceCardTiles(popularServices, 'popular')}
													</div>
												) : null}
												{groupedServices.map(group => (
													<div
														key={group.categoryName}
														className="w-full space-y-4"
													>
														<div className="border-b pb-3">
															<h3 className="text-lg font-semibold tracking-wide text-foreground">
																{group.services[0]?.displayCategoryName ??
																	getCustomerFacingBlvdCategoryName(
																		group.categoryName,
																	)}
															</h3>
														</div>
														{renderServiceCardTiles(
															group.services,
															`category:${group.categoryName}`,
														)}
													</div>
												))}
											</div>
										)}
									</div>
								) : currentStep === 'location' ? (
									<div className="flex w-full flex-col items-center space-y-6">
										<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest text-foreground">
											Location
										</h2>
										<p className="-mt-4 mb-4 text-center text-sm text-muted-foreground">
											{selectedService
												? selectedService.displayName
												: 'Service'}{' '}
											is selected. Choose the office and the matching map will
											appear right next to it.
										</p>
										<div className="w-full space-y-6">
											{loadingLocations ? (
												<p className="text-sm text-muted-foreground">
													Checking which locations can book this service.
												</p>
											) : null}

											{!loadingLocations && serviceLocations.length > 0 ? (
												<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
													<div className="grid gap-4">
														{serviceLocations.map(location => {
															const isSelected =
																selectedLocation?.id === location.id
															const matchingSiteLocation =
																getSiteLocationForBlvdLocation(location)
															const isPreferred =
																preferredLocationId !== null &&
																matchingSiteLocation?.id === preferredLocationId

															return (
																<button
																	key={location.id}
																	type="button"
																	onClick={() => {
																		void handleSelectLocation(location)
																	}}
																	className={cn(
																		'rounded-xl border bg-white p-5 text-left transition hover:border-primary hover:shadow-md',
																		isSelected && 'border-primary shadow-sm',
																	)}
																>
																	<div className="flex items-start justify-between gap-4">
																		<div>
																			<h3 className="text-xl font-semibold">
																				{location.name}
																			</h3>
																			<p className="mt-2 text-sm text-muted-foreground">
																				{formatBlvdAddress(location)}
																			</p>
																			{location.arrivalInstructions ? (
																				<p className="mt-3 text-sm text-muted-foreground">
																					{location.arrivalInstructions}
																				</p>
																			) : null}
																		</div>
																		<div className="flex flex-col items-end gap-2">
																			{isPreferred ? (
																				<span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
																					Suggested
																				</span>
																			) : null}
																			{isSelected ? (
																				<span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground">
																					Selected
																				</span>
																			) : null}
																		</div>
																	</div>
																</button>
															)
														})}
													</div>

													{selectedLocation ? (
														<div className="order-2 lg:hidden">
															<Button
																type="button"
																size="lg"
																className="w-full"
																disabled={loadingSchedule}
																onClick={() => setActiveStep('schedule')}
															>
																{loadingSchedule
																	? 'Loading Schedule...'
																	: 'Continue to Schedule'}
															</Button>
														</div>
													) : null}

													<div className="flex flex-col rounded-xl border bg-muted/20 p-4">
														<div className="flex-1">
															{selectedLocation && selectedSiteLocation ? (
																<div className="space-y-4">
																	<div className="space-y-2">
																		<h3 className="text-xl font-semibold">
																			{selectedSiteLocation.displayName}
																		</h3>
																		<p className="text-sm text-muted-foreground">
																			{selectedSiteLocation.address},{' '}
																			{selectedSiteLocation.city},{' '}
																			{selectedSiteLocation.state}{' '}
																			{selectedSiteLocation.zip}
																		</p>
																		<a
																			href={
																				selectedSiteLocation.googleMapsDirectionsUrl
																			}
																			target="_blank"
																			rel="noreferrer"
																			className="text-sm font-medium text-primary hover:underline"
																		>
																			Open Directions
																		</a>
																	</div>
																	<div className="h-80 overflow-hidden rounded-lg border bg-background">
																		<iframe
																			src={
																				selectedSiteLocation.googleMapsEmbedUrl
																			}
																			width="100%"
																			height="100%"
																			allowFullScreen={false}
																			loading="lazy"
																			referrerPolicy="no-referrer-when-downgrade"
																			title={`Map of ${selectedSiteLocation.displayName}`}
																			style={{ border: 0 }}
																		/>
																	</div>
																</div>
															) : selectedLocation ? (
																<div className="space-y-2">
																	<h3 className="text-xl font-semibold">
																		{selectedLocation.name}
																	</h3>
																	<p className="text-sm text-muted-foreground">
																		{formatBlvdAddress(selectedLocation)}
																	</p>
																</div>
															) : (
																<div className="flex h-full min-h-72 items-center justify-center rounded-lg border border-dashed bg-background/60 px-6 text-center text-sm text-muted-foreground">
																	Select a location to show the embedded map.
																</div>
															)}
														</div>
														{selectedLocation ? (
															<div className="mt-6 hidden justify-end lg:flex">
																<Button
																	type="button"
																	size="lg"
																	className="w-full sm:w-auto"
																	disabled={loadingSchedule}
																	onClick={() => setActiveStep('schedule')}
																>
																	{loadingSchedule
																		? 'Loading Schedule...'
																		: 'Continue to Schedule'}
																</Button>
															</div>
														) : null}
													</div>
												</div>
											) : null}

											{!loadingLocations && serviceLocations.length === 0 ? (
												<p className="text-sm text-muted-foreground">
													No online-bookable locations were returned for this
													service.
												</p>
											) : null}
										</div>
									</div>
								) : currentStep === 'schedule' ? (
									<div className="flex w-full flex-col items-center space-y-6">
										<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest text-foreground">
											Schedule
										</h2>
										<p className="-mt-4 mb-4 text-center text-sm text-muted-foreground">
											{selectedLocation?.name} is selected. Choose a date first,
											then pick a time.
										</p>
										<div className="w-full space-y-6">
											{loadingSchedule ? (
												<p className="text-sm text-muted-foreground">
													Loading the live schedule from Boulevard.
												</p>
											) : null}

											{bookableDates.length > 0 ? (
												<div className="grid w-full max-w-[40rem] flex-1 grid-cols-1 justify-center gap-6 lg:grid-cols-2">
													<Calendar
														id="calendar"
														mode="single"
														className="col-span-1"
														selected={
															selectedDate
																? toDate(selectedDate.date) ?? undefined
																: undefined
														}
														onSelect={d => {
															if (!d) return
															const dateStr = format(d, 'yyyy-MM-dd')
															const matchedDate = bookableDates.find(bd => {
																const dateValue = toDate(bd.date)
																return dateValue
																	? format(dateValue, 'yyyy-MM-dd') === dateStr
																	: false
															})
															if (matchedDate) {
																void handleSelectDate(matchedDate)
															}
														}}
														disabled={calDate => {
															const today = new Date()
															today.setHours(0, 0, 0, 0)
															if (calDate < today) {
																return true
															}
															const dateStr = format(calDate, 'yyyy-MM-dd')
															return !bookableDateStrings.has(dateStr)
														}}
														initialFocus
													/>
													<div className="col-span-1 h-full min-h-0 space-y-1 lg:max-h-[350px] lg:overflow-y-scroll">
														{selectedDate ? (
															<div className="space-y-3">
																<div className="flex items-center justify-between gap-4">
																	<h3 className="text-lg font-semibold">
																		Available times for{' '}
																		{formatDateLabel(selectedDate.date)}
																	</h3>
																	{loadingTimes ? (
																		<span className="text-sm text-muted-foreground">
																			Refreshing times
																		</span>
																	) : null}
																</div>

																{bookableTimes.length > 0 ? (
																	<div className="flex flex-col gap-2">
																		{bookableTimes.map(time => {
																			const isSelected =
																				time.id === selectedTimeId
																			return (
																				<Button
																					key={time.id}
																					type="button"
																					variant={
																						isSelected ? 'secondary' : 'outline'
																					}
																					className={cn(
																						'block h-11 w-full border transition duration-300',
																						isSelected
																							? 'border-primary'
																							: 'hover:border-gray-400',
																					)}
																					onClick={() => {
																						void handleSelectTime(time)
																					}}
																				>
																					{formatTimeLabel(time.startTime)}
																				</Button>
																			)
																		})}
																	</div>
																) : !loadingTimes ? (
																	<p className="text-sm text-muted-foreground">
																		No times were returned for that day.
																	</p>
																) : null}
															</div>
														) : (
															<div className="mt-8 text-center text-muted-foreground">
																Select a date to see available times.
															</div>
														)}
													</div>
												</div>
											) : !loadingSchedule ? (
												<p className="text-sm text-muted-foreground">
													No bookable dates were returned for this service and
													location yet.
												</p>
											) : null}
										</div>
									</div>
								) : currentStep === 'details' ? (
									<div className="flex w-full flex-col items-center space-y-6">
										<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest text-foreground">
											Client Details
										</h2>
										<p className="-mt-4 mb-4 text-center text-sm text-muted-foreground">
											{selectedService
												? selectedService.displayName
												: 'Service'}{' '}
											at {selectedLocation?.name} on{' '}
											{selectedTime
												? formatTimeLabel(selectedTime.startTime)
												: ''}
											. Verify your mobile number to continue.
										</p>
										<div className="w-full space-y-6">
											<form
												className="space-y-8"
												onSubmit={handleDetailsSubmit}
											>
												<div className="grid gap-4 md:grid-cols-2">
													<div className="space-y-2 md:col-span-2">
														<Label htmlFor="phone">Mobile phone</Label>
														<Input
															id="phone"
															name="phone"
															type="tel"
															value={clientForm.phone}
															onChange={updateClientForm}
														/>
													</div>
													<div className="space-y-4 rounded-xl border bg-white p-5 md:col-span-2">
														<div className="space-y-1">
															<h3 className="text-lg font-semibold">
																Verify your mobile number
															</h3>
														</div>
														{hasVerifiedMobile ? (
															<div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
																Mobile number verified.
															</div>
														) : (
															<div className="space-y-3">
																{ownershipStepError ? (
																	<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
																		{ownershipStepError}
																	</div>
																) : null}
																<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
																	<Button
																		type="button"
																		variant="outline"
																		onClick={() => {
																			void handleSendOwnershipCode()
																		}}
																		disabled={
																			sendingOwnershipCode ||
																			!canRequestOwnershipCode
																		}
																	>
																		{sendingOwnershipCode
																			? 'Sending Code...'
																			: ownershipCodeId
																				? 'Send A New Code'
																				: 'Text Me A Code'}
																	</Button>
																	{canShowOwnershipCodeEntry ? (
																		<p className="text-sm text-muted-foreground">
																			Enter the code from your text.
																		</p>
																	) : null}
																</div>
																{canShowOwnershipCodeEntry ? (
																	<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
																		<Input
																			className="placeholder:text-muted-foreground/45"
																			value={ownershipCodeValue}
																			onChange={event => {
																				setOwnershipCodeValue(
																					event.currentTarget.value
																						.replace(/\D/g, '')
																						.slice(0, 6),
																				)
																			}}
																			inputMode="numeric"
																			maxLength={6}
																			placeholder="123456"
																		/>
																		<Button
																			type="button"
																			className="w-full whitespace-nowrap sm:w-auto"
																			onClick={() => {
																				void handleVerifyOwnershipCode()
																			}}
																			disabled={verifyingOwnershipCode}
																		>
																			{verifyingOwnershipCode
																				? 'Verifying...'
																				: 'Verify Code'}
																		</Button>
																	</div>
																) : null}
															</div>
														)}
													</div>
													{hasVerifiedClient ? (
														<div className="rounded-xl border bg-white p-5 text-sm text-muted-foreground md:col-span-2">
															Your contact details are already attached through
															the verified Boulevard record.
														</div>
													) : shouldCollectClientInformation ? (
														<>
															<div className="space-y-2">
																<Label htmlFor="firstName">First name</Label>
																<Input
																	id="firstName"
																	name="firstName"
																	value={clientForm.firstName}
																	onChange={updateClientForm}
																/>
															</div>
															<div className="space-y-2">
																<Label htmlFor="lastName">Last name</Label>
																<Input
																	id="lastName"
																	name="lastName"
																	value={clientForm.lastName}
																	onChange={updateClientForm}
																/>
															</div>
															<div className="space-y-2 md:col-span-2">
																<Label htmlFor="email">Email</Label>
																<Input
																	id="email"
																	name="email"
																	type="email"
																	value={clientForm.email}
																	onChange={updateClientForm}
																/>
															</div>
														</>
													) : null}
												</div>

												{cart?.bookingQuestions &&
												cart.bookingQuestions.length > 0 ? (
													<div className="space-y-4 rounded-xl border bg-white p-5">
														<div className="space-y-1">
															<h3 className="text-lg font-semibold">
																Booking Questions
															</h3>
															<p className="text-sm text-muted-foreground">
																These come directly from Boulevard for the
																selected service.
															</p>
														</div>
														<div className="grid gap-4 md:grid-cols-2">
															{cart.bookingQuestions.map(question => (
																<div key={question.id} className="space-y-2">
																	<Label htmlFor={question.id}>
																		{question.label}
																		{question.required ? ' *' : ''}
																	</Label>
																	{renderBookingQuestionField({
																		question,
																		value: questionAnswers[question.id],
																		onChange: value =>
																			updateQuestionAnswer(question.id, value),
																	})}
																	{question.errors?.length ? (
																		<p className="text-sm text-destructive">
																			{question.errors.join(', ')}
																		</p>
																	) : null}
																</div>
															))}
														</div>
													</div>
												) : null}

												<div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
													<div className="text-sm text-muted-foreground">
														<p>
															Selected time:{' '}
															<span className="font-medium text-foreground">
																{selectedTime
																	? formatTimeLabel(selectedTime.startTime)
																	: ''}
															</span>
														</p>
														<p>
															Card required:{' '}
															<span className="font-medium text-foreground">
																{requiresCard ? 'Yes' : 'No'}
															</span>
														</p>
													</div>
													<Button type="submit" size="lg">
														{requiresCard
															? 'Continue to Reserve'
															: 'Confirm Details'}
													</Button>
												</div>
											</form>
										</div>
									</div>
								) : currentStep === 'reserve' ? (
									<div className="flex w-full flex-col items-center space-y-6">
										<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest text-foreground">
											Reserve
										</h2>
										<div className="w-full space-y-6">
											<form className="space-y-8" onSubmit={handleCheckout}>
												<div className="space-y-2">
													<Label htmlFor="notes">Optional note</Label>
													<Textarea
														id="notes"
														name="notes"
														placeholder="Anything Sarah should know before the visit"
														value={clientForm.notes}
														onChange={updateClientForm}
													/>
												</div>

												{requiresCard ? (
													<div className="space-y-4 rounded-xl border bg-white p-5">
														<div className="space-y-1">
															<h3 className="text-lg font-semibold">
																Card Hold
															</h3>
															<p className="text-sm text-muted-foreground">
																Boulevard currently requires a payment method
																for this booking, even when the live subtotal is{' '}
																<code>{formatMoney(cart?.summary.total)}</code>.
															</p>
														</div>
														{availablePaymentMethods.length > 0 ? (
															<div className="space-y-3">
																<Label>Payment method</Label>
																<div className="grid gap-3">
																	{availablePaymentMethods.map(
																		paymentMethod => {
																			const isSelected =
																				selectedPaymentMethodId ===
																				paymentMethod.id
																			return (
																				<Button
																					key={paymentMethod.id}
																					type="button"
																					variant={
																						isSelected ? 'secondary' : 'outline'
																					}
																					onClick={() => {
																						setSelectedPaymentMethodId(
																							paymentMethod.id,
																						)
																					}}
																				>
																					{paymentMethod.name}
																				</Button>
																			)
																		},
																	)}
																	<Button
																		type="button"
																		variant={
																			selectedPaymentMethodId === 'new'
																				? 'secondary'
																				: 'outline'
																		}
																		onClick={() => {
																			setSelectedPaymentMethodId('new')
																		}}
																	>
																		Use a new card
																	</Button>
																</div>
															</div>
														) : null}
														{selectedExistingPaymentMethod ? (
															<p className="text-sm text-muted-foreground">
																We will use{' '}
																<span className="font-medium text-foreground">
																	{selectedExistingPaymentMethod.name}
																</span>{' '}
																for the required card hold.
															</p>
														) : null}
														{shouldCollectCardDetails ? (
															<div className="grid gap-4 md:grid-cols-2">
																<div className="space-y-2 md:col-span-2">
																	<Label htmlFor="cardName">Name on card</Label>
																	<Input
																		id="cardName"
																		name="cardName"
																		value={clientForm.cardName}
																		onChange={updateClientForm}
																	/>
																</div>
																<div className="space-y-2 md:col-span-2">
																	<Label htmlFor="cardNumber">
																		Card number
																	</Label>
																	<Input
																		id="cardNumber"
																		name="cardNumber"
																		inputMode="numeric"
																		placeholder="4242 4242 4242 4242"
																		value={clientForm.cardNumber}
																		onChange={updateClientForm}
																	/>
																</div>
																<div className="space-y-2">
																	<Label htmlFor="cardExpiry">Expiration</Label>
																	<Input
																		id="cardExpiry"
																		name="cardExpiry"
																		placeholder="MM/YY"
																		value={clientForm.cardExpiry}
																		onChange={e => {
																			let val = e.currentTarget.value.replace(
																				/\D/g,
																				'',
																			)
																			if (val.length >= 2) {
																				if (
																					clientForm.cardExpiry.length === 3 &&
																					e.currentTarget.value.length === 2
																				) {
																					val = val.slice(0, 1)
																				} else {
																					val =
																						val.slice(0, 2) +
																						'/' +
																						val.slice(2, 4)
																				}
																			}
																			setClientForm(curr => ({
																				...curr,
																				cardExpiry: val,
																			}))
																		}}
																		maxLength={5}
																		inputMode="numeric"
																	/>
																</div>
																<div className="space-y-2">
																	<Label htmlFor="cardCvc">CVC</Label>
																	<Input
																		id="cardCvc"
																		name="cardCvc"
																		inputMode="numeric"
																		value={clientForm.cardCvc}
																		onChange={updateClientForm}
																	/>
																</div>
																<div className="space-y-2">
																	<Label htmlFor="cardZip">Billing ZIP</Label>
																	<Input
																		id="cardZip"
																		name="cardZip"
																		value={clientForm.cardZip}
																		onChange={updateClientForm}
																	/>
																</div>
															</div>
														) : null}
													</div>
												) : null}

												<div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
													<div className="text-sm text-muted-foreground">
														{patientName ? (
															<p>
																Patient:{' '}
																<span className="font-medium text-foreground">
																	{patientName}
																</span>
															</p>
														) : null}
														<p>
															Selected time:{' '}
															<span className="font-medium text-foreground">
																{selectedTime
																	? formatTimeLabel(selectedTime.startTime)
																	: ''}
															</span>
														</p>
													</div>
													<Button
														type="submit"
														size="lg"
														disabled={submittingBooking}
													>
														{submittingBooking
															? 'Submitting Booking...'
															: 'Book Appointment'}
													</Button>
												</div>
											</form>
										</div>
									</div>
								) : null}
							</div>
						</Card>
					</div>
				) : null}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

function getCurrentBlvdStep({
	checkoutSuccess,
	detailsSubmitted,
	selectedLocation,
	selectedService,
	selectedTime,
}: {
	checkoutSuccess: CheckoutSuccess | null
	detailsSubmitted: boolean
	selectedLocation: BlvdLocation | null
	selectedService: ServiceEntry | null
	selectedTime: BlvdBookableTime | null
}): BlvdBookStepName {
	if (checkoutSuccess) return 'reserve'
	if (detailsSubmitted) return 'reserve'
	if (selectedTime) return 'details'
	if (selectedLocation) return 'schedule'
	if (selectedService) return 'location'
	return 'service'
}

function BlvdStepTracker({
	currentStep,
	onStepClick,
	stepAvailability,
	stepCompletion,
}: {
	currentStep: BlvdBookStepName
	onStepClick(step: BlvdBookStepName): void
	stepAvailability: Record<BlvdBookStepName, boolean>
	stepCompletion: Record<BlvdBookStepName, boolean>
}) {
	return (
		<div className="mb-8 flex w-full max-w-2xl items-center justify-between px-4 py-2">
			{BLVD_BOOK_STEPS.map((step, index) => {
				const isActive = step.name === currentStep
				const isComplete = stepCompletion[step.name]
				const canNavigate =
					stepAvailability[step.name] || isActive || isComplete

				return (
					<React.Fragment key={step.name}>
						<button
							type="button"
							disabled={!canNavigate}
							onClick={() => onStepClick(step.name)}
							className={cn(
								'relative z-10 flex flex-col items-center',
								isActive
									? 'cursor-default'
									: canNavigate
										? 'cursor-pointer'
										: 'cursor-not-allowed',
							)}
						>
							<div
								className={cn(
									'flex h-8 w-8 items-center justify-center rounded-full',
									isActive
										? 'bg-gray-700 text-white'
										: isComplete
											? 'bg-gray-500 text-white'
											: 'bg-gray-300 text-gray-800',
								)}
							>
								{isComplete ? '✓' : index + 1}
							</div>
							<div
								className={cn(
									'mt-1 text-sm',
									isActive ? 'font-medium text-gray-700' : 'text-gray-500',
								)}
							>
								{step.label}
							</div>
						</button>
						{index < BLVD_BOOK_STEPS.length - 1 && (
							<div
								className={cn(
									'h-0.5 w-full -translate-y-3',
									isComplete || isActive ? 'bg-gray-500' : 'bg-gray-300',
								)}
							/>
						)}
					</React.Fragment>
				)
			})}
		</div>
	)
}

function BlvdAppointmentDetails({
	appointmentDate,
	appointmentEndTime,
	appointmentStartTime,
	cart,
	selectedLocation,
	selectedService,
	selectedSiteLocation,
}: {
	appointmentDate: Date | null
	appointmentEndTime: Date | null
	appointmentStartTime: Date | null
	cart: BlvdCart | null
	selectedLocation: BlvdLocation | null
	selectedService: ServiceEntry | null
	selectedSiteLocation: SiteLocation | null
	servicePendingConfirmation: boolean
	sourceHint: SourceHint | null
}) {
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})
	const timeFormatter = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
	})
	const selectedServicePrice = selectedService
		? getDisplayPrice(selectedService.item)
		: null

	return (
		<div className={cn(`flex w-full flex-col items-center lg:w-64`)}>
			<div className="mt-1 flex w-full max-w-md flex-col items-center space-y-4 rounded-lg py-2 text-lg">
				<div className="flex shrink-0 flex-col items-center space-y-2 justify-self-start rounded-lg">
					<img
						src="/img/sarah.jpg"
						alt="Sarah Hitchcox"
						className="h-24 w-24 rounded-full object-cover object-[center_15%]"
					/>
					<div className="mt-2 flex flex-col items-center text-xl font-medium leading-5 tracking-wide">
						<div>Sarah Hitchcox</div>
					</div>
				</div>
				<div className="flex w-full flex-col items-center space-y-2 text-center">
					{selectedService ? (
						<div className="flex w-full flex-col rounded-lg px-2">
							<div className="text-balance break-words text-lg font-medium tracking-wide">
								{selectedService.displayName}
							</div>
							{selectedServicePrice ? (
								<div className="mt-1 text-sm text-muted-foreground">
									{selectedServicePrice}
								</div>
							) : null}
						</div>
					) : null}
					<div className="mt-2 flex w-full flex-col items-start space-y-2 text-[.95rem]">
						{appointmentDate && appointmentEndTime && appointmentStartTime ? (
							<>
								<div className="flex items-center space-x-2 text-left">
									<Icon name="calendar" className="-my-2 size-5 shrink-0" />
									<div>{dateFormatter.format(appointmentDate)}</div>
								</div>
								<div className="flex items-center space-x-2 text-left">
									<Icon
										name="calendar"
										className="-my-2 size-5 shrink-0 opacity-0"
									/>
									<div>{`${timeFormatter.format(appointmentStartTime)} – ${timeFormatter.format(appointmentEndTime)}`}</div>
								</div>
							</>
						) : null}
						{selectedService ? (
							<div className="flex items-center space-x-2 text-left">
								<Icon name="clock" className="-my-2 size-5 shrink-0" />
								<div>
									{formatDurationRange(
										selectedService.item.listDurationRange,
									) ?? 'Varies'}
								</div>
							</div>
						) : null}
						{selectedLocation ? (
							<div className="mt-1 flex items-center space-x-2 text-left">
								<Icon name="map-pin" className="-my-2 size-5 shrink-0" />
								<div>
									{selectedSiteLocation?.displayName ?? selectedLocation.name}
								</div>
							</div>
						) : null}
					</div>
					{selectedService &&
					(selectedServicePrice || cart?.summary.depositAmount) ? (
						<div className="mt-4 w-full rounded-xl border bg-white p-4 text-sm">
							{selectedServicePrice ? (
								<div className="flex items-center justify-between gap-4">
									<span className="font-medium text-muted-foreground">
										Estimated total
									</span>
									<span className="font-semibold text-foreground">
										{selectedServicePrice}
									</span>
								</div>
							) : null}
							{cart?.summary.depositAmount ? (
								<p
									className={cn(
										'text-left text-muted-foreground',
										selectedServicePrice ? 'mt-2' : '',
									)}
								>
									Deposit due now: {formatMoney(cart.summary.depositAmount)}
								</p>
							) : null}
						</div>
					) : null}
				</div>
			</div>
		</div>
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

function uniqueTokens(values: string[]) {
	const tokens = new Set<string>()
	for (const value of values) {
		for (const token of tokenize(value)) {
			tokens.add(token)
		}
	}
	return [...tokens]
}

function normalizeSourcePath(value: string | null) {
	if (!value) return null

	try {
		const url = new URL(value)
		return normalizeSourcePath(url.pathname)
	} catch {
		const strippedValue = value.split('?')[0]?.split('#')[0]?.trim() ?? ''
		if (!strippedValue) return null
		const normalized = strippedValue.startsWith('/')
			? strippedValue
			: `/${strippedValue}`
		return normalized.replace(/\/+$/, '') || '/'
	}
}

function normalizeLocationId(value: string | null): SiteLocation['id'] | null {
	if (value === 'bearden' || value === 'farragut') return value
	return null
}

function buildServerSourceHint(
	path: string,
	explicitLocation: SiteLocation['id'] | null,
): SourceHint | null {
	const slug = path.replace(/^\//, '')
	const directLocation = siteLocations.find(location => location.id === slug)
	if (directLocation) {
		return {
			label: directLocation.displayName,
			path,
			preferredLocationId: directLocation.id,
			search: '',
		}
	}

	const page = getPage(slug)
	if (page?.enabled) {
		const ancestorNames = getAncestors(slug).map(ancestor => ancestor.name)
		return {
			label: page.name,
			path,
			preferredLocationId: explicitLocation,
			search: uniqueTokens([page.name, ...ancestorNames]).join(' '),
		}
	}
	return null
}

function buildClientSourceHint(
	path: string,
	lastServiceHint: LastBookingServiceHint | null,
): SourceHint | null {
	const normalizedPath = normalizeSourcePath(path)
	if (!normalizedPath) return null

	const slug = normalizedPath.replace(/^\//, '')
	const directLocation = siteLocations.find(location => location.id === slug)
	if (directLocation) {
		return {
			label: directLocation.displayName,
			path: normalizedPath,
			preferredLocationId: directLocation.id,
			search: '',
		}
	}

	if (!lastServiceHint) return null

	if (normalizeSourcePath(lastServiceHint.path) !== normalizedPath) {
		return null
	}

	return buildStoredServiceSourceHint(lastServiceHint)
}

function buildStoredServiceSourceHint(
	hint: LastBookingServiceHint,
): SourceHint | null {
	const path = normalizeSourcePath(hint.path)
	if (!path) return null

	const search = uniqueTokens([hint.search, hint.label]).join(' ')
	return {
		label: hint.label,
		path,
		preferredLocationId: normalizeLocationId(hint.preferredLocationId ?? null),
		search,
	}
}

function buildServiceEntries(categories: BlvdCategory[]) {
	const services = new Map<string, ServiceEntry>()

	for (const [categoryOrder, category] of categories.entries()) {
		for (const [itemOrder, item] of category.availableItems.entries()) {
			if (item.__typename !== 'CartAvailableBookableItem' || item.disabled)
				continue
			if (
				isUnavailableOnlineBookingServiceName(
					[category.name, item.name, item.description ?? ''].join(' '),
				)
			) {
				continue
			}
			if (services.has(item.id)) continue

			services.set(item.id, {
				categoryName: category.name,
				categoryOrder,
				displayCategoryName: getCustomerFacingBlvdCategoryName(category.name),
				displayGroupId: null,
				displayName: getCustomerFacingBlvdServiceName(item.name),
				groupedServiceIds: [item.id],
				id: item.id,
				item,
				itemOrder,
				recentBookingCount: getBlvdServicePopularityCount(item.name),
				searchText: normalizeText(
					[
						category.name,
						getCustomerFacingBlvdCategoryName(category.name),
						item.name,
						getCustomerFacingBlvdServiceName(item.name),
						item.description ?? '',
					].join(' '),
				),
			})
		}
	}

	return [...services.values()]
}

function buildDisplayServiceEntries(
	services: ServiceEntry[],
	clientHistory: BookingClientHistory | null,
) {
	if (!clientHistory) return []

	const servicesById = new Map(services.map(service => [service.id, service]))
	const groupedServiceIds = new Set<string>()
	const displayServices: ServiceEntry[] = []

	for (const group of BLVD_SERVICE_DISPLAY_GROUPS) {
		const groupServiceIds = getBlvdServiceDisplayGroupServiceIds(group)
		for (const serviceId of groupServiceIds) {
			groupedServiceIds.add(serviceId)
		}

		const preferredService =
			servicesById.get(
				getBlvdServiceDisplayGroupServiceIdForClientHistory(
					group,
					clientHistory,
				),
			) ?? null

		if (!preferredService) continue

		displayServices.push(
			buildGroupedServiceEntry({
				group,
				preferredService,
				servicesById,
			}),
		)
	}

	const visibleUngroupedServices = services.filter(service => {
		if (groupedServiceIds.has(service.id)) return false
		return isServiceEntryVisibleForClientHistory(service, clientHistory)
	})

	for (const serviceOptionGroup of buildServiceOptionGroupEntries(
		visibleUngroupedServices,
	)) {
		for (const serviceId of serviceOptionGroup.groupedServiceIds) {
			groupedServiceIds.add(serviceId)
		}
		displayServices.push(serviceOptionGroup)
	}

	for (const service of services) {
		if (groupedServiceIds.has(service.id)) continue
		if (!isServiceEntryVisibleForClientHistory(service, clientHistory)) continue

		displayServices.push(service)
	}

	return displayServices
}

function isServiceEntryVisibleForClientHistory(
	service: ServiceEntry,
	clientHistory: BookingClientHistory,
) {
	return isBlvdServiceVisibleForClientHistory(
		{
			categoryName: service.categoryName,
			id: service.id,
			name: service.item.name,
		},
		clientHistory,
	)
}

function buildServiceOptionGroupEntries(services: ServiceEntry[]) {
	const groups: ServiceEntry[] = []
	const laserServicesGroup = buildLaserServicesGroupEntry(services)
	if (laserServicesGroup) groups.push(laserServicesGroup)

	const viPeelGroup = buildServiceOptionGroupEntry({
		displayCategoryName: 'Aesthetic Treatments',
		displayDescription: 'Chemical peel options for brighter, smoother skin.',
		displayName: 'VI Peel',
		id: 'vi-peel',
		optionServices: services
			.map(service => {
				const option = getViPeelOption(service)
				return option ? { ...option, service } : null
			})
			.filter((option): option is ServiceOptionConfig => Boolean(option)),
		selectionPrompt: 'Select a peel type',
	})
	if (viPeelGroup) groups.push(viPeelGroup)

	const microneedlingGroup = buildServiceOptionGroupEntry({
		displayCategoryName: 'Aesthetic Treatments',
		displayDescription:
			'Microneedling options for texture, tone, and collagen support.',
		displayName: 'Microneedling',
		id: 'microneedling',
		optionServices: services
			.map(service => {
				const option = getMicroneedlingOption(service)
				return option ? { ...option, service } : null
			})
			.filter((option): option is ServiceOptionConfig => Boolean(option)),
		selectionPrompt: 'Select a microneedling type',
	})
	if (microneedlingGroup) groups.push(microneedlingGroup)

	return groups
}

type ServiceOptionConfig = {
	label: string
	service: ServiceEntry
	sortOrder: number
}

function buildLaserServicesGroupEntry(services: ServiceEntry[]) {
	const laserServices = services.filter(service => {
		const category = normalizeText(service.displayCategoryName)
		return category === 'laser treatments'
	})
	if (laserServices.length < 2) return null

	const laserHairReductionGroup = buildServiceOptionGroupEntry({
		displayCategoryName: 'Laser Treatments',
		displayDescription:
			'Laser hair reduction packages for small, medium, and large treatment areas.',
		displayName: 'Laser Hair Reduction',
		id: 'laser-hair-reduction',
		optionServices: laserServices
			.map(service => {
				const option = getLaserHairReductionOption(service)
				return option ? { ...option, service } : null
			})
			.filter((option): option is ServiceOptionConfig => Boolean(option)),
		selectionPrompt: 'Select an area size',
	})

	const touchUpLaserGroup = buildServiceOptionGroupEntry({
		displayCategoryName: 'Laser Treatments',
		displayDescription: 'Touch-up laser treatment by area size.',
		displayName: 'Touch Up Laser Treatment',
		id: 'touch-up-laser-treatment',
		optionServices: laserServices
			.map(service => {
				const option = getTouchUpLaserOption(service)
				return option ? { ...option, service } : null
			})
			.filter((option): option is ServiceOptionConfig => Boolean(option)),
		selectionPrompt: 'Select an area size',
	})

	const nestedGroupedServiceIds = new Set([
		...(laserHairReductionGroup?.groupedServiceIds ?? []),
		...(touchUpLaserGroup?.groupedServiceIds ?? []),
	])
	const directLaserOptions = laserServices
		.filter(service => !nestedGroupedServiceIds.has(service.id))
		.map(service => ({
			label: service.displayName,
			service,
			sortOrder: getLaserServiceSortOrder(service),
		}))

	return buildServiceOptionGroupEntry({
		displayCategoryName: 'Laser Treatments',
		displayDescription:
			'Laser treatments for hair reduction, pigment, redness, and skin revitalization.',
		displayName: 'Laser Services',
		id: 'laser-services',
		optionServices: [
			...(laserHairReductionGroup
				? [
						{
							label: laserHairReductionGroup.displayName,
							service: laserHairReductionGroup,
							sortOrder: 10,
						},
					]
				: []),
			...directLaserOptions,
			...(touchUpLaserGroup
				? [
						{
							label: touchUpLaserGroup.displayName,
							service: touchUpLaserGroup,
							sortOrder: 90,
						},
					]
				: []),
		],
		selectionPrompt: 'Select a laser treatment',
	})
}

function buildServiceOptionGroupEntry({
	displayCategoryName,
	displayDescription,
	displayName,
	id,
	optionServices,
	selectionPrompt,
}: {
	displayCategoryName: string
	displayDescription: string
	displayName: string
	id: string
	optionServices: ServiceOptionConfig[]
	selectionPrompt: string
}) {
	const sortedOptions = optionServices
		.filter(option => option.service)
		.sort((a, b) => {
			if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
			return a.label.localeCompare(b.label)
		})
	if (sortedOptions.length < 2) return null

	const representativeService = sortedOptions[0]!.service
	const groupedServiceIds = [
		...new Set(
			sortedOptions.flatMap(option => option.service.groupedServiceIds),
		),
	]

	return {
		...representativeService,
		displayCategoryName,
		displayDescription,
		displayDurationLabel: 'Varies',
		displayGroupId: id,
		displayName,
		displayPrice: getBlvdBookingPriceDisplay({ serviceName: displayName })
			.display,
		groupedServiceIds,
		id: `display-group:${id}`,
		recentBookingCount: sortedOptions.reduce(
			(total, option) => total + option.service.recentBookingCount,
			0,
		),
		searchText: normalizeText(
			[
				displayCategoryName,
				displayName,
				selectionPrompt,
				...sortedOptions.flatMap(option => [
					option.label,
					option.service.displayName,
					option.service.item.name,
					option.service.searchText,
				]),
			].join(' '),
		),
		selectionOptions: sortedOptions,
		selectionPrompt,
	}
}

function getLaserHairReductionOption(service: ServiceEntry) {
	const normalizedName = normalizeText(service.item.name)
	if (!normalizedName.startsWith('laser hair reduction')) return null

	if (normalizedName.includes('small area')) {
		return { label: 'Small Area', sortOrder: 10 }
	}
	if (normalizedName.includes('medium area')) {
		return { label: 'Medium Area', sortOrder: 20 }
	}
	if (normalizedName.includes('large area')) {
		return { label: 'Large Area', sortOrder: 30 }
	}

	return null
}

function getTouchUpLaserOption(service: ServiceEntry) {
	const normalizedName = normalizeText(service.item.name)
	if (!normalizedName.startsWith('touch up laser treatment')) return null

	if (normalizedName.includes('small area')) {
		return { label: 'Small Area', sortOrder: 10 }
	}
	if (normalizedName.includes('medium area')) {
		return { label: 'Medium Area', sortOrder: 20 }
	}
	if (normalizedName.includes('large area')) {
		return { label: 'Large Area', sortOrder: 30 }
	}

	return null
}

function getViPeelOption(service: ServiceEntry) {
	const normalizedName = normalizeText(service.item.name)
	if (!normalizedName.startsWith('vi peel')) return null

	if (normalizedName.includes('original')) {
		return { label: 'Original', sortOrder: 10 }
	}
	if (normalizedName.includes('advanced')) {
		return { label: 'Advanced', sortOrder: 20 }
	}
	if (normalizedName.includes('precision plus')) {
		return { label: 'Precision Plus with Peptides', sortOrder: 30 }
	}

	return null
}

function getMicroneedlingOption(service: ServiceEntry) {
	const normalizedName = normalizeText(service.item.name)
	if (!normalizedName.includes('microneedling')) return null

	if (normalizedName.includes('pdgf')) {
		return { label: 'With PDGF', sortOrder: 20 }
	}
	if (normalizedName.includes('prp')) {
		return { label: 'With PRP', sortOrder: 30 }
	}
	if (
		normalizedName === 'new client microneedling' ||
		normalizedName === 'existing client microneedling'
	) {
		return { label: 'Traditional', sortOrder: 10 }
	}

	return null
}

function getLaserServiceSortOrder(service: ServiceEntry) {
	const normalizedName = normalizeText(service.item.name)
	if (normalizedName.includes('pigmented lesion')) return 20
	if (normalizedName.includes('vascular lesion')) return 30
	if (normalizedName.includes('skin revitalization')) return 40
	return 80
}

function buildGroupedServiceEntry({
	group,
	preferredService,
	servicesById,
}: {
	group: BlvdServiceDisplayGroup
	preferredService: ServiceEntry
	servicesById: Map<string, ServiceEntry>
}) {
	const groupedServices = getBlvdServiceDisplayGroupServiceIds(group)
		.map(serviceId => servicesById.get(serviceId))
		.filter((service): service is ServiceEntry => Boolean(service))

	return {
		...preferredService,
		displayCategoryName: group.displayCategoryName,
		displayGroupId: group.id,
		displayName: group.displayName,
		groupedServiceIds: groupedServices.map(service => service.id),
		recentBookingCount: groupedServices.reduce(
			(total, service) => total + service.recentBookingCount,
			0,
		),
		searchText: normalizeText(
			[
				group.displayCategoryName,
				group.displayName,
				group.searchAliases.join(' '),
				...groupedServices.flatMap(service => [
					service.categoryName,
					service.displayCategoryName,
					service.displayName,
					service.item.name,
					service.item.description ?? '',
				]),
			].join(' '),
		),
	}
}

function scoreService(service: ServiceEntry, search: string) {
	if (!search.trim()) return 0

	const normalizedSearch = normalizeText(search)
	const searchTokens = tokenize(search)
	const normalizedName = normalizeText(service.displayName)
	let score = 0

	if (normalizedName === normalizedSearch) score += 150
	if (normalizedName.startsWith(normalizedSearch)) score += 80
	if (service.searchText.includes(normalizedSearch)) score += 60

	for (const token of searchTokens) {
		if (normalizedName.includes(token)) {
			score += 25
		} else if (service.searchText.includes(token)) {
			score += 10
		}
	}

	return score
}

function compareServiceEntriesForDisplay(a: ServiceEntry, b: ServiceEntry) {
	if (a.recentBookingCount !== b.recentBookingCount) {
		return b.recentBookingCount - a.recentBookingCount
	}

	if (a.categoryOrder !== b.categoryOrder) {
		return a.categoryOrder - b.categoryOrder
	}
	if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder
	return a.displayName.localeCompare(b.displayName)
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

function sortLocationsByPreference(
	locations: BlvdLocation[],
	preferredLocationId: SiteLocation['id'] | null,
) {
	return [...locations].sort((a, b) => {
		const aSiteLocation = getSiteLocationForBlvdLocation(a)
		const bSiteLocation = getSiteLocationForBlvdLocation(b)
		const aPreferred = aSiteLocation?.id === preferredLocationId ? 1 : 0
		const bPreferred = bSiteLocation?.id === preferredLocationId ? 1 : 0
		if (aPreferred !== bPreferred) return bPreferred - aPreferred
		return a.name.localeCompare(b.name)
	})
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

function getStaffDisplayName(staff: BlvdStaffVariant['staff']) {
	return (
		staff.displayName?.trim() ||
		[staff.firstName, staff.lastName].filter(Boolean).join(' ').trim()
	)
}

function getSiteLocationForBlvdLocation(location: BlvdLocation) {
	const line1 = normalizeText(location.address?.line1 ?? '')
	return siteLocations.find(siteLocation =>
		normalizeText(siteLocation.address).includes(line1),
	)
}

function formatBlvdAddress(location: BlvdLocation) {
	const parts = [
		location.address?.line1,
		location.address?.city,
		location.address?.state,
		location.address?.zip,
	].filter(Boolean)
	return parts.join(', ')
}

function formatDurationRange(range: BlvdServiceItem['listDurationRange']) {
	if (!range) return null
	if (range.variable && range.min !== range.max) {
		return `${range.min}-${range.max} min`
	}
	return `${range.min} min`
}

function formatMoney(value?: number | null) {
	if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00'
	return new Intl.NumberFormat('en-US', {
		currency: 'USD',
		style: 'currency',
	}).format(value / 100)
}

function getDisplayPrice(
	item: Pick<BlvdServiceItem, 'listPriceRange' | 'name'>,
) {
	return getBlvdBookingPriceDisplay({
		serviceName: item.name,
	}).display
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function toDate(value: Date | string | null | undefined) {
	if (!value) return null
	if (value instanceof Date) return value
	if (typeof value !== 'string') return null

	const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value.trim())
	if (dateOnlyMatch) {
		const parsed = new Date(
			Number(dateOnlyMatch[1]),
			Number(dateOnlyMatch[2]) - 1,
			Number(dateOnlyMatch[3]),
		)
		return isValid(parsed) ? parsed : null
	}

	const parsed = new Date(value)
	return isValid(parsed) ? parsed : null
}

function getBookableDateKey(date: BlvdBookableDate) {
	const dateValue = toDate(date.date)
	return dateValue ? format(dateValue, 'yyyy-MM-dd') : null
}

function formatDateLabel(value: Date | string) {
	const date = toDate(value)
	return date ? format(date, 'EEE, MMM d') : 'Unavailable'
}

function formatTimeLabel(value: Date | string) {
	const date = toDate(value)
	return date ? format(date, 'h:mm a') : 'Unavailable'
}

function cartHasSelectedTime(cart: BlvdCart, selectedTime: BlvdBookableTime) {
	const cartStartTime = toDate(cart.startTime)
	const selectedStartTime = toDate(selectedTime.startTime)

	if (!cartStartTime || !selectedStartTime) return false

	return (
		Math.abs(cartStartTime.getTime() - selectedStartTime.getTime()) < 60_000
	)
}

async function ensureCartHasSelectedTime(
	cart: BlvdCart,
	selectedTime: BlvdBookableTime,
) {
	if (cartHasSelectedTime(cart, selectedTime)) return cart
	return cart.reserveBookableItems(selectedTime)
}

function buildBookingSelectionEventProperties({
	availablePaymentMethodCount,
	cart,
	clientHistory,
	clientHistorySelection,
	hasVerifiedClient,
	selectedExistingPaymentMethod,
	selectedLocation,
	selectedService,
}: {
	availablePaymentMethodCount: number
	cart: BlvdCart | null
	clientHistory: BookingClientHistory | null
	clientHistorySelection: BookingClientHistory | null
	hasVerifiedClient: boolean
	selectedExistingPaymentMethod: BlvdPaymentMethod | null
	selectedLocation: BlvdLocation | null
	selectedService: ServiceEntry | null
}) {
	const requiresCard = cart ? Boolean(cart.summary.paymentMethodRequired) : null
	const bookingClientType = getBookingClientTypeFromHistory({
		clientHistory,
		hasVerifiedClient,
	})

	return {
		booking_has_verified_client: hasVerifiedClient,
		booking_client_history_selection:
			clientHistorySelection ?? clientHistory ?? 'not_selected',
		booking_client_type: bookingClientType,
		booking_client_type_source: getBookingClientTypeSource({
			clientHistory,
			clientHistorySelection,
			hasVerifiedClient,
		}),
		...(selectedService
			? {
					booking_service_category: selectedService.categoryName,
					booking_service_client_fit: getBlvdServiceClientFit({
						categoryName: selectedService.categoryName,
						name: selectedService.item.name,
					}),
					booking_service_display_group_id: selectedService.displayGroupId,
					booking_service_display_name: selectedService.displayName,
					booking_service_grouped_service_ids:
						selectedService.groupedServiceIds,
					booking_service_id: selectedService.item.id,
					booking_service_name: selectedService.item.name,
					booking_service_recent_booking_count:
						selectedService.recentBookingCount,
				}
			: {}),
		...(selectedLocation
			? {
					booking_location_id: selectedLocation.id,
					booking_location_name: selectedLocation.name,
				}
			: {}),
		...(typeof requiresCard === 'boolean'
			? {
					booking_requires_card: requiresCard,
					booking_selected_payment_method_type: requiresCard
						? selectedExistingPaymentMethod
							? 'saved_card'
							: 'new_card'
						: 'none_required',
				}
			: {}),
		...(availablePaymentMethodCount > 0
			? { booking_saved_payment_method_count: availablePaymentMethodCount }
			: {}),
	}
}

function getBookingClientTypeSource({
	clientHistory,
	clientHistorySelection,
	hasVerifiedClient,
}: {
	clientHistory: BookingClientHistory | null
	clientHistorySelection: BookingClientHistory | null
	hasVerifiedClient: boolean
}) {
	if (hasVerifiedClient) return 'boulevard_sms_ownership'
	if (clientHistorySelection === 'unsure' && clientHistory) {
		return 'boulevard_phone_lookup'
	}
	if (clientHistorySelection ?? clientHistory) return 'patient_self_selection'
	return 'default_unverified_booking_path'
}

function isUnavailableOnlineBookingServiceName(name: string) {
	return name.toLowerCase().includes('telehealth')
}

function trackGoogleEvent(
	eventName: string,
	params: Record<string, unknown> = {},
) {
	if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

	const nextParams = { ...params }
	if (window.ENV?.GA_MEASUREMENT_ID && nextParams.send_to == null) {
		nextParams.send_to = window.ENV.GA_MEASUREMENT_ID
	}

	if (
		typeof nextParams.debug_mode === 'undefined' &&
		new URLSearchParams(window.location.search).has('gtm_debug')
	) {
		nextParams.debug_mode = true
	}

	window.gtag('event', eventName, nextParams)
}

async function persistBlvdBookingAttributionTouch(
	payload: Record<string, unknown>,
) {
	if (typeof window === 'undefined') return

	const response = await fetch('/resources/blvd-attribution', {
		body: JSON.stringify(payload),
		headers: {
			'Content-Type': 'application/json',
		},
		keepalive: true,
		method: 'POST',
	})

	if (!response.ok) {
		throw new Error('Failed to persist Boulevard attribution touch')
	}
}

function queueBlvdBookingAttributionTouch(payload: Record<string, unknown>) {
	try {
		void persistBlvdBookingAttributionTouch(payload).catch(error => {
			console.error('Failed to persist Boulevard attribution touch', error)
		})
	} catch (error) {
		console.error('Failed to queue Boulevard attribution touch', error)
	}
}

async function persistBlvdBookingIntent(payload: Record<string, unknown>) {
	if (typeof window === 'undefined') return

	const response = await fetch('/resources/blvd-booking-intent', {
		body: JSON.stringify(payload),
		headers: {
			'Content-Type': 'application/json',
		},
		keepalive: true,
		method: 'POST',
	})

	if (!response.ok) {
		throw new Error('Failed to persist Boulevard booking intent')
	}
}

function queueBlvdBookingIntent(payload: Record<string, unknown>) {
	try {
		void persistBlvdBookingIntent(payload).catch(error => {
			console.error('Failed to persist Boulevard booking intent', error)
		})
	} catch (error) {
		console.error('Failed to queue Boulevard booking intent', error)
	}
}

async function sendBookingPhoneVerificationCode(phone: string) {
	const result = await requestBookingPhoneVerification({
		intent: 'send',
		phone,
	})
	if (!result.ok) {
		throw new Error(result.error ?? 'Unable to send verification code.')
	}
}

async function verifyBookingPhoneVerificationCode({
	code,
	phone,
}: {
	code: string
	phone: string
}) {
	const result = await requestBookingPhoneVerification({
		code,
		intent: 'verify',
		phone,
	})
	if (!result.ok) {
		throw new Error(result.error ?? 'Unable to verify code.')
	}
}

async function requestBookingPhoneVerification(
	payload:
		| { intent: 'send'; phone: string }
		| { code: string; intent: 'verify'; phone: string },
) {
	const response = await fetch('/resources/booking-phone-verification', {
		body: JSON.stringify(payload),
		headers: {
			'Content-Type': 'application/json',
		},
		method: 'POST',
	})
	const result = (await response.json().catch(() => null)) as {
		error?: string
		ok?: boolean
	} | null

	if (!response.ok || !result?.ok) {
		return {
			error: result?.error ?? 'Verification failed.',
			ok: false,
		}
	}

	return { ok: true }
}

async function requestBookingClientLookup(phone: string) {
	const response = await fetch('/resources/booking-client-lookup', {
		body: JSON.stringify({ phone }),
		headers: {
			'Content-Type': 'application/json',
		},
		method: 'POST',
	})
	const result = (await response.json().catch(() => null)) as {
		client_found?: boolean
		client_type?: 'new' | 'returning'
		error?: string
		ok?: boolean
		phone?: string
	} | null

	if (!response.ok || !result?.ok) {
		return {
			error: result?.error ?? 'Client lookup failed.',
			ok: false as const,
		}
	}

	return {
		client_found: Boolean(result.client_found),
		client_type:
			result.client_type ?? (result.client_found ? 'returning' : 'new'),
		ok: true as const,
		phone: result.phone,
	}
}

function normalizePhoneNumber(value: string) {
	const digits = value.replace(/\D/g, '')
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (value.trim().startsWith('+')) return value.trim()
	return `+${digits}`
}

function looksLikePhoneNumber(value: string) {
	const digits = value.replace(/\D/g, '')
	return (
		digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
	)
}

function validateClientDetails({
	answers,
	clientForm,
	hasVerifiedMobile,
	requireClientInformation = true,
	questions,
}: {
	answers: Record<string, unknown>
	clientForm: {
		email: string
		firstName: string
		lastName: string
		phone: string
	}
	hasVerifiedMobile: boolean
	requireClientInformation?: boolean
	questions: BlvdBookingQuestion[]
}) {
	if (!clientForm.phone.trim()) return 'Mobile phone is required.'
	if (!hasVerifiedMobile) {
		return 'Verify your mobile number before continuing.'
	}

	if (requireClientInformation) {
		if (!clientForm.firstName.trim()) return 'First name is required.'
		if (!clientForm.lastName.trim()) return 'Last name is required.'
		if (!clientForm.email.trim()) return 'Email is required.'
	}

	for (const question of questions) {
		if (!question.required) continue
		if (!hasBookingQuestionAnswer(answers[question.id])) {
			return `Please answer: ${question.label}`
		}
	}

	return null
}

function isMobileVerificationValidationError(error: string) {
	return (
		error === 'Mobile phone is required.' ||
		error === 'Verify your mobile number before continuing.'
	)
}

function isClientNotFoundByMobilePhoneError(error: unknown) {
	const details = getBookingErrorDetails(error)
	return (
		details.code === 'CLIENT_NOT_FOUND_BY_MOBILE_PHONE' ||
		details.technicalMessage.includes('CLIENT_NOT_FOUND_BY_MOBILE_PHONE')
	)
}

function getOwnershipCodeUserMessage(
	error: unknown,
	clientHistory: BookingClientHistory | null,
) {
	if (isClientNotFoundByMobilePhoneError(error)) {
		if (clientHistory === 'returning') {
			return 'We could not find an existing profile for that mobile number. Please check the number or choose No above if this is your first visit.'
		}

		return 'We could not find an existing profile for that number, so we will verify it as a new client.'
	}

	return 'We could not send that code. Please check the number and try again.'
}

function getVerifyCodeUserMessage(error: unknown) {
	const details = getBookingErrorDetails(error)
	if (details.safeMessage.toLowerCase().includes('not valid')) {
		return 'That verification code was not valid. Please try again.'
	}
	return 'We could not verify that code. Please try again.'
}

function getCheckoutUserMessage(error: unknown) {
	const details = getBookingErrorDetails(error)
	if (
		details.code === 'CART_PAYMENT_METHOD_FAILED' ||
		details.technicalMessage.includes('CART_PAYMENT_METHOD_FAILED')
	) {
		return 'Please check your payment zip code and CVV and try again.'
	}

	return 'We could not book the appointment. Please try again.'
}

function getBookingErrorDetails(error: unknown) {
	const message = getErrorMessage(error)
	const technicalMessage = redactSensitiveBookingErrorText(message)
	const code = extractBoulevardErrorCode(message)
	const name = error instanceof Error ? error.name : undefined

	return {
		code,
		name,
		safeMessage: code
			? code.replace(/_/g, ' ').toLowerCase()
			: technicalMessage,
		technicalMessage,
	}
}

function extractBoulevardErrorCode(value: string) {
	const codeMatch =
		value.match(/"code"\s*:\s*"([^"]+)"/) ??
		value.match(/\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,})\b/)
	return codeMatch?.[1] ?? null
}

function redactSensitiveBookingErrorText(value: string) {
	return value
		.replace(/\+?1?\d[\d\s().-]{8,}\d/g, '[phone]')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
		.replace(/\s+/g, ' ')
		.slice(0, 1000)
}

function formatClientName({
	firstName,
	lastName,
}: {
	firstName?: string | null
	lastName?: string | null
}) {
	return [firstName, lastName]
		.map(part => part?.trim())
		.filter(Boolean)
		.join(' ')
}

function allRequiredBookingQuestionsAnswered(
	cart: Pick<BlvdCart, 'bookingQuestions'>,
	answers: Record<string, unknown>,
) {
	return cart.bookingQuestions.every(
		question =>
			!question.required || hasBookingQuestionAnswer(answers[question.id]),
	)
}

function hasAttachedBlvdClient(
	clientInformation: BlvdCart['clientInformation'] | undefined,
) {
	return Boolean(
		clientInformation?.externalId?.trim() ||
			(clientInformation?.email?.trim() &&
				clientInformation.firstName?.trim() &&
				clientInformation.lastName?.trim()),
	)
}

function validatePaymentDetails(clientForm: {
	cardCvc: string
	cardExpiry: string
	cardName: string
	cardNumber: string
	cardZip: string
}) {
	if (!clientForm.cardName.trim()) return 'Name on card is required.'
	if (clientForm.cardNumber.replace(/\D/g, '').length < 12) {
		return 'Enter a valid card number.'
	}
	if (!parseExpiry(clientForm.cardExpiry)) {
		return 'Enter a valid expiration in MM/YY format.'
	}
	if (clientForm.cardCvc.replace(/\D/g, '').length < 3) {
		return 'Enter a valid card security code.'
	}
	if (!clientForm.cardZip.trim()) return 'Billing ZIP code is required.'
	return null
}

function parseExpiry(value: string) {
	const cleaned = value.trim().replace(/\s+/g, '')
	const match = cleaned.match(/^(\d{2})\/(\d{2}|\d{4})$/)
	if (!match) return null

	const month = Number(match[1])
	if (!month || month < 1 || month > 12) return null

	const rawYear = Number(match[2])
	if (!rawYear || rawYear < 0) return null

	const year = String(rawYear).length === 2 ? 2000 + rawYear : rawYear
	if (year < new Date().getFullYear()) return null

	return { month, year }
}

function parseCardDetails(clientForm: {
	cardCvc: string
	cardExpiry: string
	cardName: string
	cardNumber: string
	cardZip: string
}) {
	const expiry = parseExpiry(clientForm.cardExpiry)
	if (!expiry) throw new Error('Enter a valid card expiration date.')

	return {
		address_postal_code: clientForm.cardZip.trim(),
		cvv: clientForm.cardCvc.replace(/\D/g, ''),
		exp_month: expiry.month,
		exp_year: expiry.year,
		name: clientForm.cardName.trim().toUpperCase(),
		number: clientForm.cardNumber.replace(/\D/g, ''),
	}
}

function hasBookingQuestionAnswer(value: unknown) {
	if (value === undefined || value === null) return false
	if (typeof value === 'string') return value.trim().length > 0
	if (Array.isArray(value)) return value.length > 0
	return true
}

function getSubmissionValueForQuestion(
	question: BlvdBookingQuestion,
	answer: unknown,
) {
	if (question.valueType === 'DATETIME' && typeof answer === 'string') {
		return new Date(answer)
	}
	return answer
}

function getBookingQuestionValue(question: BlvdBookingQuestion) {
	const answer = question.answer as
		| {
				booleanValue?: boolean
				datetimeValue?: Date | string
				floatValue?: number
				integerValue?: number
				option?: BlvdBookingQuestionOption
				options?: BlvdBookingQuestionOption[]
				textValue?: string
		  }
		| undefined

	if (!answer) return undefined

	if (question.valueType === 'BOOLEAN') return answer.booleanValue
	if (question.valueType === 'DATETIME') return answer.datetimeValue
	if (question.valueType === 'FLOAT') return answer.floatValue
	if (question.valueType === 'INTEGER') return answer.integerValue
	if (question.valueType === 'SELECT') return answer.option
	if (question.valueType === 'MULTI_SELECT') return answer.options ?? []
	if (question.valueType === 'TEXT') return answer.textValue

	return undefined
}

function renderBookingQuestionField({
	onChange,
	question,
	value,
}: {
	onChange(value: unknown): void
	question: BlvdBookingQuestion
	value: unknown
}) {
	const longText = question.displayType?.toLowerCase().includes('long')

	if (question.valueType === 'BOOLEAN') {
		return (
			<label className="flex items-center gap-3 text-sm text-muted-foreground">
				<input
					type="checkbox"
					checked={Boolean(value)}
					onChange={event => onChange(event.currentTarget.checked)}
					className="h-4 w-4 rounded border-input"
				/>
				<span>Yes</span>
			</label>
		)
	}

	if (question.valueType === 'SELECT') {
		const selectedOption = value as BlvdBookingQuestionOption | undefined
		return (
			<select
				id={question.id}
				className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				value={selectedOption?.id ?? ''}
				onChange={event =>
					onChange(
						question.options.find(
							option => option.id === event.currentTarget.value,
						),
					)
				}
			>
				<option value="">Select an option</option>
				{question.options.map(option => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
		)
	}

	if (question.valueType === 'MULTI_SELECT') {
		const selectedOptions = Array.isArray(value)
			? (value as BlvdBookingQuestionOption[])
			: []
		return (
			<div className="space-y-2 rounded-md border p-3">
				{question.options.map(option => {
					const checked = selectedOptions.some(
						selectedOption => selectedOption.id === option.id,
					)
					return (
						<label key={option.id} className="flex items-center gap-3 text-sm">
							<input
								type="checkbox"
								checked={checked}
								onChange={() => {
									onChange(
										checked
											? selectedOptions.filter(
													selectedOption => selectedOption.id !== option.id,
												)
											: [...selectedOptions, option],
									)
								}}
								className="h-4 w-4 rounded border-input"
							/>
							<span>{option.label}</span>
						</label>
					)
				})}
			</div>
		)
	}

	if (question.valueType === 'DATETIME') {
		const inputValue =
			typeof value === 'string'
				? value.slice(0, 10)
				: toDate(value as Date | string | null | undefined)
					? format(toDate(value as Date | string)!, 'yyyy-MM-dd')
					: ''
		return (
			<Input
				id={question.id}
				type="date"
				value={inputValue}
				onChange={event => onChange(event.currentTarget.value)}
			/>
		)
	}

	if (question.valueType === 'INTEGER' || question.valueType === 'FLOAT') {
		return (
			<Input
				id={question.id}
				type="number"
				step={question.valueType === 'FLOAT' ? '0.01' : '1'}
				value={typeof value === 'number' ? String(value) : ''}
				onChange={event =>
					onChange(
						question.valueType === 'FLOAT'
							? Number(event.currentTarget.value)
							: Number.parseInt(event.currentTarget.value, 10),
					)
				}
			/>
		)
	}

	if (longText) {
		return (
			<Textarea
				id={question.id}
				value={typeof value === 'string' ? value : ''}
				onChange={event => onChange(event.currentTarget.value)}
			/>
		)
	}

	return (
		<Input
			id={question.id}
			value={typeof value === 'string' ? value : ''}
			onChange={event => onChange(event.currentTarget.value)}
		/>
	)
}
