import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { format, isValid, parseISO } from 'date-fns'
import React, { useEffect, useMemo, useRef, useState } from 'react'

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
import { getEstimatedValueForBlvdService } from '#app/utils/blvd-pricing.ts'
import {
	type Location as SiteLocation,
	locations as siteLocations,
} from '#app/utils/locations.ts'
import { cn, getErrorMessage } from '#app/utils/misc.tsx'
import { usePostHog } from '#app/utils/posthog.tsx'
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

type BlvdCart = {
	bookingQuestions: BlvdBookingQuestion[]
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
		appointments: Array<{ appointmentId: string }>
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
	id: string
	item: BlvdServiceItem
	searchText: string
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
	const [serviceLocations, setServiceLocations] = useState<BlvdLocation[]>([])
	const [selectedService, setSelectedService] = useState<ServiceEntry | null>(
		null,
	)
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
	const [checkoutSuccess, setCheckoutSuccess] =
		useState<CheckoutSuccess | null>(null)
	const [referrerHint, setReferrerHint] = useState<SourceHint | null>(null)
	const [hasEvaluatedReferrerHint, setHasEvaluatedReferrerHint] = useState(
		Boolean(sourceHint),
	)
	const [search, setSearch] = useState(sourceHint?.search ?? '')
	const searchInputRef = useRef<HTMLInputElement>(null)
	const didHandleInitialEntryBehavior = useRef(false)
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
	const [questionAnswers, setQuestionAnswers] = useState<
		Record<string, unknown>
	>({})
	const posthog = usePostHog()
	const pendingBookingStepsRef = useRef<Set<string>>(new Set())

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

		try {
			if (!document.referrer) return
			const referrer = new URL(document.referrer)
			if (referrer.origin !== window.location.origin) return
			const referrerPath = normalizeSourcePath(referrer.pathname)
			const currentPath = normalizeSourcePath(window.location.pathname)
			if (!referrerPath || referrerPath === currentPath) return
			if (referrerPath === '/blvd-book') return
			const nextReferrerHint = buildClientSourceHint(referrer.pathname)
			if (!nextReferrerHint) return
			setReferrerHint(nextReferrerHint)
			setSearch(currentSearch => currentSearch || nextReferrerHint.search)
		} catch {
			// Ignore referrer parsing failures.
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
		sourceHint?.preferredLocationId ?? referrerHint?.preferredLocationId ?? null
	const activeSourceHint = sourceHint ?? referrerHint
	const selectedDate =
		bookableDates.find(date => date.id === selectedDateId) ??
		bookableDates[0] ??
		null
	const selectedTime =
		bookableTimes.find(time => time.id === selectedTimeId) ?? null
	const selectedSiteLocation = selectedLocation
		? (getSiteLocationForBlvdLocation(selectedLocation) ?? null)
		: null
	const requiresCard = Boolean(cart?.summary.paymentMethodRequired)

	const filteredServices = useMemo(() => {
		const trimmedSearch = search.trim()
		const nextServices = services
			.map(service => ({
				service,
				score: scoreService(service, trimmedSearch),
			}))
			.filter(result => trimmedSearch.length === 0 || result.score > 0)
			.sort((a, b) => {
				if (a.score !== b.score) return b.score - a.score
				return a.service.item.name.localeCompare(b.service.item.name)
			})
			.map(result => result.service)

		return nextServices
	}, [search, services])

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
		if (!posthog) return

		for (const step of pendingBookingStepsRef.current) {
			posthog.capture('booking_step_viewed', { step })
		}

		pendingBookingStepsRef.current.clear()
	}, [currentStep, posthog])

	const bookableDateStrings = useMemo(() => {
		return new Set(
			bookableDates.map(d =>
				format(toDate(d.date) ?? new Date(), 'yyyy-MM-dd'),
			),
		)
	}, [bookableDates])

	useEffect(() => {
		if (didHandleInitialEntryBehavior.current) return
		if (initializing || initError || !hasEvaluatedReferrerHint) return

		didHandleInitialEntryBehavior.current = true

		if (typeof window !== 'undefined' && 'gtag' in window) {
			;(window as any).gtag('event', 'cart_created', {})
		}

		if (selectedService) return

		window.setTimeout(() => {
			searchInputRef.current?.focus()
			searchInputRef.current?.select()
		}, 100)
	}, [hasEvaluatedReferrerHint, initError, initializing, selectedService])

	async function handleSelectService(service: ServiceEntry) {
		setLoadingLocations(true)
		setStepError(null)
		setCheckoutSuccess(null)
		setSelectedService(service)
		setActiveStep(null)
		setSelectedLocation(null)
		setServiceLocations([])
		setCart(null)
		setBookableDates([])
		setBookableTimes([])
		setSelectedDateId(null)
		setSelectedTimeId(null)
		setQuestionAnswers({})

		try {
			const isTelehealth = service.item.name
				.toLowerCase()
				.includes('telehealth')
			const variants = await service.item.getLocationVariants()
			const nextLocations = sortLocationsByPreference(
				dedupeLocations(variants.map(variant => variant.location)),
				preferredLocationId,
			)
			setServiceLocations(nextLocations)

			if (isTelehealth && nextLocations.length > 0) {
				await handleSelectTelehealth(nextLocations, service)
			} else if (nextLocations.length === 1) {
				await handleSelectLocation(nextLocations[0]!, service)
			} else {
				setActiveStep('location')
			}
		} catch (error) {
			setStepError(getErrorMessage(error))
		} finally {
			setLoadingLocations(false)
		}
	}

	async function handleSelectTelehealth(
		locations: BlvdLocation[],
		serviceOverride: ServiceEntry,
	) {
		if (!client) return

		setLoadingSchedule(true)
		setStepError(null)
		setCheckoutSuccess(null)

		const telehealthLocation = {
			id: 'telehealth',
			name: 'Telehealth (Virtual)',
			address: null,
			tz: 'America/New_York',
		} as unknown as BlvdLocation

		setSelectedLocation(telehealthLocation)
		setActiveStep('schedule')
		setBookableDates([])
		setBookableTimes([])
		setSelectedDateId(null)
		setSelectedTimeId(null)

		try {
			const nextCarts: { location: BlvdLocation; cart: BlvdCart }[] = []
			for (const loc of locations) {
				let nextCart = await client.carts.create(loc)
				const preferredStaffVariant = await getPreferredStaffVariant(
					serviceOverride.item,
				)
				nextCart = await nextCart.addBookableItem(serviceOverride.item, {
					...(preferredStaffVariant
						? { staffVariant: preferredStaffVariant }
						: {}),
				})
				nextCarts.push({ location: loc, cart: nextCart })
			}

			const dateMap = new Map<string, { dateObj: Date; locationCarts: any[] }>()

			for (const { location, cart } of nextCarts) {
				const dates = await cart.getBookableDates({
					location,
					timezone: location.tz ?? undefined,
				})
				for (const d of dates) {
					const dateObj = toDate(d.date)
					if (!dateObj) continue
					const dateStr = format(dateObj, 'yyyy-MM-dd')
					if (!dateMap.has(dateStr)) {
						dateMap.set(dateStr, { dateObj, locationCarts: [] })
					}
					dateMap
						.get(dateStr)!
						.locationCarts.push({ location, cart, blvdDate: d })
				}
			}

			const sortedDates = Array.from(dateMap.values()).sort(
				(a, b) => a.dateObj.getTime() - b.dateObj.getTime(),
			)

			const mergedDates = sortedDates.map(d => ({
				id: format(d.dateObj, 'yyyy-MM-dd'),
				date: d.dateObj,
				_telehealthCarts: d.locationCarts,
			})) as unknown as BlvdBookableDate[]

			setBookableDates(mergedDates)

			if (mergedDates.length > 0) {
				await handleSelectDate(mergedDates[0] as BlvdBookableDate)
			}
		} catch (error) {
			setStepError(getErrorMessage(error))
		} finally {
			setLoadingSchedule(false)
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
		setCheckoutSuccess(null)
		setSelectedLocation(location)
		setActiveStep('location')
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
				setSelectedDateId(nextDates[0].id)
				const nextTimes = await nextCart.getBookableTimes(nextDates[0], {
					location,
					timezone: location.tz ?? undefined,
				})
				setBookableTimes(nextTimes)
			}
		} catch (error) {
			setStepError(getErrorMessage(error))
		} finally {
			setLoadingSchedule(false)
		}
	}

	async function handleSelectDate(
		date: BlvdBookableDate & { _telehealthCarts?: any[] },
	) {
		if (date._telehealthCarts) {
			setLoadingTimes(true)
			setStepError(null)
			setSelectedDateId(date.id)
			setActiveStep(null)
			setSelectedTimeId(null)
			setCheckoutSuccess(null)

			try {
				const allTimes = new Map<string, any>()
				for (const locCart of date._telehealthCarts) {
					const times = await locCart.cart.getBookableTimes(locCart.blvdDate, {
						location: locCart.location,
						timezone: locCart.location.tz ?? undefined,
					})
					for (const t of times) {
						const timeObj = toDate(t.startTime)
						if (!timeObj) continue
						const timeStr = timeObj.getTime().toString()
						if (!allTimes.has(timeStr)) {
							allTimes.set(timeStr, {
								id: timeStr + '-' + locCart.location.id,
								startTime: t.startTime,
								_locationCart: locCart,
								_blvdTime: t,
							})
						}
					}
				}

				const sortedTimes = Array.from(allTimes.values()).sort((a, b) => {
					return toDate(a.startTime)!.getTime() - toDate(b.startTime)!.getTime()
				})

				setBookableTimes(sortedTimes as unknown as BlvdBookableTime[])
			} catch (error) {
				setStepError(getErrorMessage(error))
			} finally {
				setLoadingTimes(false)
			}
			return
		}

		if (!cart || !selectedLocation) return

		setLoadingTimes(true)
		setStepError(null)
		setSelectedDateId(date.id)
		setActiveStep(null)
		setSelectedTimeId(null)
		setCheckoutSuccess(null)

		try {
			const nextTimes = await cart.getBookableTimes(date, {
				location: selectedLocation,
				timezone: selectedLocation.tz ?? undefined,
			})
			setBookableTimes(nextTimes)
		} catch (error) {
			setStepError(getErrorMessage(error))
		} finally {
			setLoadingTimes(false)
		}
	}

	async function handleSelectTime(
		time: BlvdBookableTime & { _locationCart?: any; _blvdTime?: any },
	) {
		if (time._locationCart) {
			setLoadingSchedule(true)
			setStepError(null)
			setCheckoutSuccess(null)

			try {
				const locCart = time._locationCart
				const nextCart = await locCart.cart.reserveBookableItems(time._blvdTime)
				setCart(nextCart)
				setActiveStep(null)
				setSelectedTimeId(time.id)
			} catch (error) {
				setStepError(getErrorMessage(error))
			} finally {
				setLoadingSchedule(false)
			}
			return
		}

		if (!cart) return

		setLoadingSchedule(true)
		setStepError(null)
		setCheckoutSuccess(null)

		try {
			const nextCart = await cart.reserveBookableItems(time)
			setCart(nextCart)
			setActiveStep(null)
			setSelectedTimeId(time.id)
		} catch (error) {
			setStepError(getErrorMessage(error))
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
			questions: cart.bookingQuestions,
		})
		if (validationError) {
			setStepError(validationError)
			return
		}

		setStepError(null)
		setDetailsSubmitted(true)
		setActiveStep('reserve')
	}

	async function handleCheckout(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()

		if (!cart || !selectedService || !selectedLocation) return

		if (requiresCard) {
			const paymentError = validatePaymentDetails(clientForm)
			if (paymentError) {
				setStepError(paymentError)
				return
			}
		}

		setSubmittingBooking(true)
		setStepError(null)

		try {
			let nextCart = await cart.update({
				clientInformation: {
					email: clientForm.email.trim(),
					firstName: clientForm.firstName.trim(),
					lastName: clientForm.lastName.trim(),
					phoneNumber: normalizePhoneNumber(clientForm.phone),
				},
				clientMessage: clientForm.notes.trim() || undefined,
			})

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

			if (nextCart.summary.paymentMethodRequired) {
				const card = parseCardDetails(clientForm)
				nextCart = await nextCart.addCardPaymentMethod({ card })
			}

			const checkoutPayload = await nextCart.checkout()
			setCart(checkoutPayload.cart)

			const valueInDollars = getEstimatedValueForBlvdService(
				selectedService.item.name,
			)

			if (typeof window !== 'undefined' && 'gtag' in window) {
				;(window as any).gtag('event', 'purchase', {
					currency: 'USD',
					value: valueInDollars,
					items: [
						{
							item_id: selectedService.item.id,
							item_name: selectedService.item.name,
							price: valueInDollars,
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
				posthog.capture('booking_step_viewed', { step: 'success' })
				posthog.capture('booking_completed', {
					service: selectedService.item.name,
					location: selectedLocation.name,
					value: valueInDollars,
				})
			}

			if (typeof window !== 'undefined') {
				window.scrollTo({ top: 0, behavior: 'smooth' })
			}
		} catch (error) {
			if (error && typeof error === 'object') {
				const err = error as any

				// Try to extract from the standard `response` property
				if (err.response?.errors?.[0]?.message) {
					setStepError(err.response.errors[0].message)
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
								// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
								setStepError(parsed.response.errors[0].message)
								return
							}
						}
					} catch {}
				}
			}
			setStepError(getErrorMessage(error))
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
		setClientForm(currentForm => ({ ...currentForm, [name]: value }))
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
						<Card className="flex w-full max-w-5xl flex-col items-center p-4 pb-6 transition-all duration-300 lg:flex-row lg:items-start lg:space-x-8">
							<div className="w-64 flex-shrink-0">
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
							<div className="mt-8 w-full min-w-0 flex-1 lg:mt-0">
								{currentStep === 'service' ? (
									<div className="flex w-full flex-col items-center space-y-6">
										<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest text-foreground">
											Service
										</h2>
										<p className="-mt-4 mb-4 text-center text-sm text-muted-foreground">
											Type what the client is looking for. If they came from a
											service page, the list is already narrowed to the closest
											matches.
										</p>
										<div className="flex w-full flex-col items-center gap-3 sm:flex-row">
											<Input
												ref={searchInputRef}
												className="w-full"
												placeholder="Search Botox, lip filler, microneedling, weight loss..."
												value={search}
												onChange={event => setSearch(event.currentTarget.value)}
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

										{filteredServices.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												No services matched that search yet.
											</p>
										) : (
											<div className="grid items-start gap-4 md:grid-cols-2">
												{filteredServices.map(service => {
													const isSelected = selectedService?.id === service.id
													return (
														<button
															key={service.id}
															type="button"
															onClick={() => {
																void handleSelectService(service)
															}}
															className={cn(
																'rounded-xl border p-5 text-left transition hover:border-primary hover:shadow-md',
																isSelected &&
																	'border-primary bg-primary/5 shadow-sm',
															)}
														>
															<div className="mb-2 flex w-full items-start justify-between gap-4">
																<div>
																	<p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
																		{service.categoryName}
																	</p>
																	<h3 className="mt-2 text-xl font-semibold">
																		{service.item.name}
																	</h3>
																</div>
																{isSelected ? (
																	<span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground">
																		Selected
																	</span>
																) : null}
															</div>
															{service.item.description ? (
																<p className="line-clamp-3 text-sm text-muted-foreground">
																	{service.item.description}
																</p>
															) : null}
															<div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
																{formatDurationRange(
																	service.item.listDurationRange,
																) ? (
																	<span>
																		{formatDurationRange(
																			service.item.listDurationRange,
																		)}
																	</span>
																) : null}
																{getDisplayPrice(service.item.name) ? (
																	<span>
																		{getDisplayPrice(service.item.name)}
																	</span>
																) : null}
															</div>
														</button>
													)
												})}
											</div>
										)}
									</div>
								) : currentStep === 'location' ? (
									<div className="flex w-full flex-col items-center space-y-6">
										<h2 className="mb-2 text-center text-2xl font-semibold tracking-widest text-foreground">
											Location
										</h2>
										<p className="-mt-4 mb-4 text-center text-sm text-muted-foreground">
											{selectedService?.item.name} is selected. Choose the
											office and the matching map will appear right next to it.
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
																		'rounded-xl border p-5 text-left transition hover:border-primary hover:shadow-md',
																		isSelected &&
																			'border-primary bg-primary/5 shadow-sm',
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
															<div className="mt-6 flex justify-end">
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
																? (toDate(selectedDate.date) ?? undefined)
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
											{selectedService?.item.name} at {selectedLocation?.name}{' '}
											on{' '}
											{selectedTime
												? formatTimeLabel(selectedTime.startTime)
												: ''}
											. Fill out the client details and card hold below.
										</p>
										<div className="w-full space-y-6">
											<form
												className="space-y-8"
												onSubmit={handleDetailsSubmit}
											>
												<div className="grid gap-4 md:grid-cols-2">
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
													<div className="space-y-2">
														<Label htmlFor="email">Email</Label>
														<Input
															id="email"
															name="email"
															type="email"
															value={clientForm.email}
															onChange={updateClientForm}
														/>
													</div>
													<div className="space-y-2">
														<Label htmlFor="phone">Mobile phone</Label>
														<Input
															id="phone"
															name="phone"
															type="tel"
															value={clientForm.phone}
															onChange={updateClientForm}
														/>
													</div>
												</div>

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

												{cart?.bookingQuestions &&
												cart.bookingQuestions.length > 0 ? (
													<div className="space-y-4 rounded-xl border p-5">
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
										<p className="-mt-4 mb-4 text-center text-sm text-muted-foreground">
											Review your appointment and secure your slot below.
										</p>
										<div className="w-full space-y-6">
											<form className="space-y-8" onSubmit={handleCheckout}>
												{requiresCard ? (
													<div className="space-y-4 rounded-xl border p-5">
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
																<Label htmlFor="cardNumber">Card number</Label>
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

	return (
		<div className={cn(`mx-4 flex w-full flex-col items-center lg:w-64`)}>
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
								{selectedService.item.name}
							</div>
							{getDisplayPrice(selectedService.item.name) ? (
								<div className="mt-1 text-sm text-muted-foreground">
									{getDisplayPrice(selectedService.item.name)}
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
					(getDisplayPrice(selectedService.item.name) ||
						cart?.summary.depositAmount) ? (
						<div className="mt-4 w-full rounded-xl border bg-muted/30 p-4 text-sm">
							{getDisplayPrice(selectedService.item.name) ? (
								<div className="flex items-center justify-between gap-4">
									<span className="font-medium text-muted-foreground">
										Estimated total
									</span>
									<span className="font-semibold text-foreground">
										{getDisplayPrice(selectedService.item.name)}
									</span>
								</div>
							) : null}
							{cart?.summary.depositAmount ? (
								<p
									className={cn(
										'text-left text-muted-foreground',
										getDisplayPrice(selectedService.item.name) ? 'mt-2' : '',
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

function humanizePathSegment(value: string) {
	return value.replace(/[-_/]+/g, ' ').trim()
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
	if (page) {
		const ancestorNames = getAncestors(slug).map(ancestor => ancestor.name)
		return {
			label: page.name,
			path,
			preferredLocationId: explicitLocation,
			search: uniqueTokens([page.name, ...ancestorNames]).join(' '),
		}
	}

	const search = uniqueTokens(slug.split('/').map(humanizePathSegment)).join(
		' ',
	)
	if (!search) return null

	return {
		label: search,
		path,
		preferredLocationId: explicitLocation,
		search,
	}
}

function buildClientSourceHint(path: string): SourceHint | null {
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

	const search = uniqueTokens(slug.split('/').map(humanizePathSegment)).join(
		' ',
	)
	if (!search) return null

	return {
		label: search,
		path: normalizedPath,
		preferredLocationId: null,
		search,
	}
}

function buildServiceEntries(categories: BlvdCategory[]) {
	const services = new Map<string, ServiceEntry>()

	for (const category of categories) {
		for (const item of category.availableItems) {
			if (item.__typename !== 'CartAvailableBookableItem' || item.disabled)
				continue
			if (services.has(item.id)) continue

			services.set(item.id, {
				categoryName: category.name,
				id: item.id,
				item,
				searchText: normalizeText(
					[category.name, item.name, item.description ?? ''].join(' '),
				),
			})
		}
	}

	return [...services.values()].sort((a, b) =>
		a.item.name.localeCompare(b.item.name),
	)
}

function scoreService(service: ServiceEntry, search: string) {
	if (!search.trim()) return 0

	const normalizedSearch = normalizeText(search)
	const searchTokens = tokenize(search)
	const normalizedName = normalizeText(service.item.name)
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

function getDisplayPrice(serviceName: string) {
	const lower = serviceName.toLowerCase()
	if (lower.includes('consultation')) return 'Free Consultation'
	if (lower.includes('lip flip')) return '$129'
	return null
}

function toDate(value: Date | string | null | undefined) {
	if (!value) return null
	if (value instanceof Date) return value
	if (typeof value !== 'string') return null

	const parsed = value.length === 10 ? parseISO(value) : new Date(value)
	return isValid(parsed) ? parsed : null
}

function formatDateLabel(value: Date | string) {
	const date = toDate(value)
	return date ? format(date, 'EEE, MMM d') : 'Unavailable'
}

function formatTimeLabel(value: Date | string) {
	const date = toDate(value)
	return date ? format(date, 'h:mm a') : 'Unavailable'
}

function normalizePhoneNumber(value: string) {
	const digits = value.replace(/\D/g, '')
	if (digits.length === 10) return `+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
	if (value.trim().startsWith('+')) return value.trim()
	return `+${digits}`
}

function validateClientDetails({
	answers,
	clientForm,
	questions,
}: {
	answers: Record<string, unknown>
	clientForm: {
		email: string
		firstName: string
		lastName: string
		phone: string
	}
	questions: BlvdBookingQuestion[]
}) {
	if (!clientForm.firstName.trim()) return 'First name is required.'
	if (!clientForm.lastName.trim()) return 'Last name is required.'
	if (!clientForm.email.trim()) return 'Email is required.'
	if (!clientForm.phone.trim()) return 'Mobile phone is required.'

	for (const question of questions) {
		if (!question.required) continue
		if (!hasBookingQuestionAnswer(answers[question.id])) {
			return `Please answer: ${question.label}`
		}
	}

	return null
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
