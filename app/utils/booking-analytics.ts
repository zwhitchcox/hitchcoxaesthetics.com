const STORAGE_KEY = 'sha.booking-analytics'
const SITE_ENTERED_EVENT_STORAGE_KEY = 'sha.site-entered-event-v1'
const sentCallTrackingAttributionKeys = new Set<string>()

const MARKETING_PARAM_KEYS = [
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_content',
	'utm_term',
	'gclid',
	'gbraid',
	'wbraid',
	'msclkid',
	'fbclid',
] as const

const CALLRAIL_SESSION_PARAM_KEYS = [
	'callrail_session_id',
	'callrail_session_uuid',
	'calltrk_session_id',
	'calltrk_session',
	'calltrk_session_uuid',
	'session_uuid',
] as const

const CALLRAIL_VISITOR_PARAM_KEYS = [
	'callrail_visitor_id',
	'callrail_uuid',
	'callrail_person_id',
	'calltrk_visitor_id',
	'calltrk_uuid',
	'person_id',
] as const

const POSTHOG_DISTINCT_COOKIE = 'sha_posthog_distinct_id'
const POSTHOG_SESSION_COOKIE = 'sha_posthog_session_id'
const BOOKING_ANALYTICS_TIME_ZONE = 'America/New_York'

const SERVICE_PAGE_SEGMENTS = new Set([
	'injectables',
	'botox',
	'filler',
	'skinvive',
	'kybella',
	'jeuveau',
	'dysport',
	'laser-services',
	'everesse',
	'laser-hair-removal',
	'skin-revitalization',
	'pigmented-lesion-reduction',
	'vascular-lesion-reduction',
	'microneedling',
	'weight-loss',
	'semaglutide',
	'tirzepatide',
])

type MarketingParamKey = (typeof MARKETING_PARAM_KEYS)[number]

type StoredBookingAnalytics = Record<MarketingParamKey, string | null> & {
	bookEntryFromPath: string | null
	callrailSessionId: string | null
	callrailVisitorId: string | null
	firstBookEnteredAt: number | null
	firstBookPath: string | null
	initialLandingPath: string
	initialLandingSearch: string
	initialReferrer: string | null
	initialReferringDomain: string | null
	lastNonBookPath: string | null
	lastPath: string | null
	pageviewCount: number
	preBookDurationMs: number | null
	preBookPageviewCount: number | null
	preBookUniquePageCount: number | null
	startedAt: number
	trafficChannel: string
	uniquePaths: string[]
}

export function trackBookingAnalyticsPageView({
	pathname,
	referrer,
	search,
}: {
	pathname: string
	referrer?: string | null
	search: string
}) {
	if (typeof window === 'undefined') return

	const now = Date.now()
	const fullPath = `${pathname}${search}`
	const stored =
		readStoredBookingAnalytics() ??
		createStoredBookingAnalytics({ now, pathname, referrer, search })
	mergeMarketingParamsIntoStoredAnalytics(stored, search)
	const callrailTracking = getCallRailTrackingFromBrowser(search)

	const previousPageviewCount = stored.pageviewCount
	const previousUniquePageCount = stored.uniquePaths.length
	const isNewPathView = stored.lastPath !== fullPath

	if (isNewPathView) {
		stored.pageviewCount += 1
		if (!stored.uniquePaths.includes(pathname)) {
			stored.uniquePaths.push(pathname)
		}
	}

	if (!isBookPath(pathname)) {
		stored.lastNonBookPath = fullPath
	}

	if (isBookPath(pathname) && stored.firstBookEnteredAt === null) {
		stored.firstBookEnteredAt = now
		stored.firstBookPath = fullPath
		stored.bookEntryFromPath = stored.lastNonBookPath
		stored.preBookDurationMs = Math.max(0, now - stored.startedAt)
		stored.preBookPageviewCount = previousPageviewCount
		stored.preBookUniquePageCount = previousUniquePageCount
	}

	stored.callrailSessionId =
		callrailTracking.sessionId ?? stored.callrailSessionId
	stored.callrailVisitorId =
		callrailTracking.visitorId ?? stored.callrailVisitorId
	stored.lastPath = fullPath
	syncPostHogAttributionCookies()
	writeStoredBookingAnalytics(stored)
}

export function getBookingAnalyticsEventProperties() {
	const stored = readStoredBookingAnalytics()
	if (!stored) return {}
	syncPostHogAttributionCookies()
	const trafficAttribution = getStoredTrafficAttribution(stored)
	const callrailTracking = getStoredCallRailAttribution(stored)
	const bookEntryPathname = getPathnameFromStoredPath(stored.bookEntryFromPath)
	const initialLandingPathname = getPathnameFromStoredPath(
		stored.initialLandingPath,
	)

	return compactEventProperties({
		...getBookingTemporalEventProperties(
			stored.firstBookEnteredAt,
			'booking_entered',
		),
		book_entry_from_path: stored.bookEntryFromPath,
		book_entry_page_prefix_type: bookEntryPathname
			? getPagePrefixType(bookEntryPathname)
			: undefined,
		book_entry_page_type: bookEntryPathname
			? getPageType(bookEntryPathname)
			: undefined,
		book_entry_path: stored.firstBookPath,
		initial_landing_path: stored.initialLandingPath,
		initial_landing_page_prefix_type: initialLandingPathname
			? getPagePrefixType(initialLandingPathname)
			: undefined,
		initial_landing_page_type: initialLandingPathname
			? getPageType(initialLandingPathname)
			: undefined,
		initial_landing_search: stored.initialLandingSearch || undefined,
		initial_referrer: stored.initialReferrer,
		initial_referring_domain: stored.initialReferringDomain,
		pages_before_book_bucket: getPageCountBucket(stored.preBookPageviewCount),
		pages_visited_before_book: stored.preBookPageviewCount,
		pre_book_duration_bucket: getDurationBucket(stored.preBookDurationMs),
		pre_book_duration_ms: stored.preBookDurationMs,
		pre_book_duration_seconds:
			typeof stored.preBookDurationMs === 'number'
				? roundToOneDecimal(stored.preBookDurationMs / 1000)
				: undefined,
		traffic_channel: stored.trafficChannel || trafficAttribution.channel,
		traffic_platform: trafficAttribution.platform,
		traffic_source_detail: trafficAttribution.detail,
		posthog_distinct_id: getPostHogDistinctId(),
		posthog_session_id: getPostHogSessionId(),
		callrail_session_id: callrailTracking.sessionId,
		callrail_visitor_id: callrailTracking.visitorId,
		unique_pages_before_book: stored.preBookUniquePageCount,
		utm_campaign: stored.utm_campaign,
		utm_content: stored.utm_content,
		utm_medium: stored.utm_medium,
		utm_source: stored.utm_source,
		utm_term: stored.utm_term,
		fbclid: stored.fbclid,
		gclid: stored.gclid,
		gbraid: stored.gbraid,
		msclkid: stored.msclkid,
		wbraid: stored.wbraid,
	})
}

export function getBookingTemporalEventProperties(
	timestamp: number | Date | null | undefined,
	prefix: string,
) {
	const date =
		timestamp instanceof Date
			? timestamp
			: typeof timestamp === 'number'
				? new Date(timestamp)
				: null
	if (!date || Number.isNaN(date.getTime())) return {}

	const parts = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23',
		month: '2-digit',
		timeZone: BOOKING_ANALYTICS_TIME_ZONE,
		weekday: 'long',
		year: 'numeric',
	}).formatToParts(date)
	const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]))
	const year = partMap.year
	const month = partMap.month
	const day = partMap.day
	const weekday = partMap.weekday
	const hour = Number(partMap.hour)

	if (!year || !month || !day || !weekday || !Number.isFinite(hour)) return {}

	return {
		[`${prefix}_date`]: `${year}-${month}-${day}`,
		[`${prefix}_day_of_week`]: formatDayOfWeekBucket(weekday),
		[`${prefix}_hour`]: `${hour.toString().padStart(2, '0')}:00`,
		[`${prefix}_hour_bucket`]: formatHourBucket(hour),
		[`${prefix}_time_zone`]: BOOKING_ANALYTICS_TIME_ZONE,
	}
}

export function getMarketingPageEventProperties({
	pathname,
	search,
}: {
	pathname: string
	search: string
}) {
	const stored = readStoredBookingAnalytics()
	const trafficAttribution = stored ? getStoredTrafficAttribution(stored) : null
	if (stored) syncPostHogAttributionCookies()
	const callrailTracking = stored ? getStoredCallRailAttribution(stored) : null

	return compactEventProperties({
		current_path: pathname,
		current_search: search || undefined,
		current_page_prefix_type: getPagePrefixType(pathname),
		current_page_type: getPageType(pathname),
		book_entry_from_path: stored?.bookEntryFromPath,
		book_entry_page_prefix_type: stored?.bookEntryFromPath
			? getPagePrefixType(
					getPathnameFromStoredPath(stored.bookEntryFromPath) ?? '',
				)
			: undefined,
		book_entry_page_type: stored?.bookEntryFromPath
			? getPageType(getPathnameFromStoredPath(stored.bookEntryFromPath) ?? '')
			: undefined,
		initial_landing_path: stored?.initialLandingPath,
		initial_landing_page_prefix_type: stored?.initialLandingPath
			? getPagePrefixType(
					getPathnameFromStoredPath(stored.initialLandingPath) ?? '',
				)
			: undefined,
		initial_landing_page_type: stored?.initialLandingPath
			? getPageType(getPathnameFromStoredPath(stored.initialLandingPath) ?? '')
			: undefined,
		pages_before_book_bucket: getPageCountBucket(
			stored?.preBookPageviewCount ?? null,
		),
		pre_book_duration_bucket: getDurationBucket(
			stored?.preBookDurationMs ?? null,
		),
		traffic_channel: stored?.trafficChannel || trafficAttribution?.channel,
		traffic_platform: trafficAttribution?.platform,
		traffic_source_detail: trafficAttribution?.detail,
		callrail_session_id: callrailTracking?.sessionId,
		callrail_visitor_id: callrailTracking?.visitorId,
		utm_campaign: stored?.utm_campaign,
		utm_content: stored?.utm_content,
		utm_medium: stored?.utm_medium,
		utm_source: stored?.utm_source,
		utm_term: stored?.utm_term,
		fbclid: stored?.fbclid,
		gclid: stored?.gclid,
		gbraid: stored?.gbraid,
		msclkid: stored?.msclkid,
		wbraid: stored?.wbraid,
	})
}

export function claimSiteEnteredEvent() {
	if (typeof window === 'undefined') return false

	try {
		if (window.sessionStorage.getItem(SITE_ENTERED_EVENT_STORAGE_KEY)) {
			return false
		}
		window.sessionStorage.setItem(SITE_ENTERED_EVENT_STORAGE_KEY, '1')
		return true
	} catch {
		return true
	}
}

export function queueCallTrackingSessionAttribution({
	pathname,
	referrer,
	search,
}: {
	pathname: string
	referrer?: string | null
	search: string
}) {
	if (typeof window === 'undefined') return

	const send = () => {
		const payload = getCallTrackingSessionAttributionPayload({
			pathname,
			referrer,
			search,
		})
		if (!hasSessionAttribution(payload)) return false
		const sentKey = JSON.stringify([
			payload.current_path,
			payload.posthog_session_id,
			payload.posthog_distinct_id,
			payload.callrail_session_id,
			payload.callrail_visitor_id,
		])
		if (sentCallTrackingAttributionKeys.has(sentKey)) {
			return Boolean(payload.callrail_session_id || payload.callrail_visitor_id)
		}
		sentCallTrackingAttributionKeys.add(sentKey)
		void attachGaTrackingIds(payload)
			.then(persistCallTrackingSessionAttribution)
			.catch(error => {
				console.error('Failed to persist call tracking attribution', error)
			})
		return Boolean(payload.callrail_session_id || payload.callrail_visitor_id)
	}

	if (send()) return
	window.setTimeout(send, 1500)
	window.setTimeout(send, 5000)
}

function getCallTrackingSessionAttributionPayload({
	pathname,
	referrer,
	search,
}: {
	pathname: string
	referrer?: string | null
	search: string
}) {
	const properties = getMarketingPageEventProperties({ pathname, search })
	return compactEventProperties({
		...properties,
		current_path: pathname,
		current_search: search || undefined,
		initial_referrer:
			'initial_referrer' in properties
				? properties.initial_referrer
				: normalizeReferrer(referrer),
		occurred_at: new Date().toISOString(),
	})
}

const GA_TRACKING_ID_TIMEOUT_MS = 1000

function getGaTagValue(field: 'client_id' | 'session_id') {
	return new Promise<string | null>(resolve => {
		const measurementId = window.ENV?.GA_MEASUREMENT_ID
		if (!measurementId || typeof window.gtag !== 'function') {
			resolve(null)
			return
		}
		// gtag never invokes the callback until the GA library has loaded, so
		// resolve null after a short wait — later pageviews will fill these in.
		const timeout = window.setTimeout(
			() => resolve(null),
			GA_TRACKING_ID_TIMEOUT_MS,
		)
		window.gtag('get', measurementId, field, (value: unknown) => {
			window.clearTimeout(timeout)
			if (typeof value === 'string' && value) resolve(value)
			else if (typeof value === 'number') resolve(String(value))
			else resolve(null)
		})
	})
}

async function attachGaTrackingIds(payload: Record<string, unknown>) {
	const [gaClientId, gaSessionId] = await Promise.all([
		getGaTagValue('client_id'),
		getGaTagValue('session_id'),
	])
	return compactEventProperties({
		...payload,
		ga_client_id: gaClientId ?? undefined,
		ga_session_id: gaSessionId ?? undefined,
	})
}

async function persistCallTrackingSessionAttribution(
	payload: Record<string, unknown>,
) {
	const response = await fetch('/resources/call-tracking-attribution', {
		body: JSON.stringify(payload),
		headers: {
			'Content-Type': 'application/json',
		},
		keepalive: true,
		method: 'POST',
	})

	if (!response.ok) {
		throw new Error('Failed to persist call tracking attribution')
	}
}

function hasSessionAttribution(payload: Record<string, unknown>) {
	return Boolean(
		payload.posthog_session_id ||
		payload.posthog_distinct_id ||
		payload.callrail_session_id ||
		payload.callrail_visitor_id,
	)
}

function createStoredBookingAnalytics({
	now,
	pathname,
	referrer,
	search,
}: {
	now: number
	pathname: string
	referrer?: string | null
	search: string
}): StoredBookingAnalytics {
	const marketingParams = getMarketingParamsFromSearch(search)
	const callrailTracking = getCallRailTrackingFromBrowser(search)
	const initialReferrer = normalizeReferrer(referrer)
	const trafficAttribution = inferTrafficAttribution({
		...marketingParams,
		initialReferrer,
		initialReferringDomain: getReferringDomain(initialReferrer),
	})

	return {
		...marketingParams,
		bookEntryFromPath: null,
		callrailSessionId: callrailTracking.sessionId,
		callrailVisitorId: callrailTracking.visitorId,
		firstBookEnteredAt: null,
		firstBookPath: null,
		initialLandingPath: pathname,
		initialLandingSearch: search,
		initialReferrer,
		initialReferringDomain: getReferringDomain(initialReferrer),
		lastNonBookPath: isBookPath(pathname) ? null : `${pathname}${search}`,
		lastPath: null,
		pageviewCount: 0,
		preBookDurationMs: null,
		preBookPageviewCount: null,
		preBookUniquePageCount: null,
		startedAt: now,
		trafficChannel: trafficAttribution.channel,
		uniquePaths: [],
	}
}

export function getMarketingParamsFromSearch(
	search: string,
): Record<MarketingParamKey, string | null> {
	const searchParams = new URLSearchParams(search)
	const marketingParams = Object.fromEntries(
		MARKETING_PARAM_KEYS.map(key => [
			key,
			searchParams.get(key)?.trim() || null,
		]),
	) as Record<MarketingParamKey, string | null>
	const googleLinkerClickIds = getGoogleClickIdsFromLinkerParam(
		searchParams.get('_gl'),
	)

	return {
		...marketingParams,
		gbraid: marketingParams.gbraid ?? googleLinkerClickIds.gbraid ?? null,
		gclid: marketingParams.gclid ?? googleLinkerClickIds.gclid ?? null,
		wbraid: marketingParams.wbraid ?? googleLinkerClickIds.wbraid ?? null,
	}
}

function mergeMarketingParamsIntoStoredAnalytics(
	stored: StoredBookingAnalytics,
	search: string,
) {
	const marketingParams = getMarketingParamsFromSearch(search)
	let changed = false

	for (const key of MARKETING_PARAM_KEYS) {
		const value = marketingParams[key]
		if (!value || stored[key] === value) continue
		stored[key] = value
		changed = true
	}

	if (!changed) return

	const trafficAttribution = getStoredTrafficAttribution(stored)
	stored.trafficChannel = trafficAttribution.channel
}

function getGoogleClickIdsFromLinkerParam(value?: string | null) {
	if (!value) return {}

	const clickIds: Partial<
		Record<'gbraid' | 'gclid' | 'wbraid', string | null>
	> = {}
	const parts = value.split('*')
	for (let index = 0; index < parts.length - 1; index++) {
		const key = parts[index]
		const encodedValue = parts[index + 1]
		if (!key || !encodedValue) continue

		const decodedValue = decodeGoogleLinkerValue(encodedValue)
		const clickId = getGoogleClickIdFromDecodedLinkerValue(decodedValue)
		if (!clickId) continue

		if (key === '_gcl_aw' || key === '_gcl_dc') {
			clickIds.gclid = clickId
		} else if (key === '_gcl_gb') {
			clickIds.gbraid = clickId
		} else if (key === '_gcl_wb') {
			clickIds.wbraid = clickId
		}
	}

	return clickIds
}

function decodeGoogleLinkerValue(value: string) {
	try {
		const normalized = value
			.replace(/-/g, '+')
			.replace(/_/g, '/')
			.replace(/\./g, '=')
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
		return globalThis.atob(padded)
	} catch {
		return value
	}
}

function getGoogleClickIdFromDecodedLinkerValue(value: string | null) {
	const trimmed = value?.trim()
	if (!trimmed) return null

	const parts = trimmed.split('.')
	return parts.length >= 3 ? parts[parts.length - 1]?.trim() || null : trimmed
}

export function inferTrafficAttribution({
	fbclid,
	gbraid,
	gclid,
	initialReferrer,
	initialReferringDomain,
	msclkid,
	utm_campaign,
	utm_medium,
	utm_source,
	wbraid,
}: Pick<
	StoredBookingAnalytics,
	| 'fbclid'
	| 'gbraid'
	| 'gclid'
	| 'initialReferrer'
	| 'initialReferringDomain'
	| 'msclkid'
	| 'utm_campaign'
	| 'utm_medium'
	| 'utm_source'
	| 'wbraid'
>) {
	const source = normalizeToken(utm_source)
	const medium = normalizeToken(utm_medium)
	const campaign = normalizeToken(utm_campaign)
	const referrerDomain = normalizeToken(initialReferringDomain)
	const referrer = normalizeToken(initialReferrer)
	const combined = [source, medium, campaign, referrerDomain, referrer]
		.filter(Boolean)
		.join(' ')
	const isPaidMedium = matchesAny(medium, [
		'cpc',
		'ppc',
		'paid',
		'paidsearch',
		'paidsocial',
		'sem',
		'display',
		'retargeting',
	])
	const socialPlatform = getSocialPlatform(source, referrerDomain, campaign)
	const searchPlatform = getSearchPlatform(source, referrerDomain, campaign)

	if (fbclid || (isPaidMedium && socialPlatform === 'meta')) {
		return {
			channel: 'paid_social',
			detail: 'meta_ads',
			platform: 'meta',
		}
	}

	if (msclkid || (isPaidMedium && searchPlatform === 'bing')) {
		return {
			channel: 'paid_search',
			detail: 'bing_ads',
			platform: 'bing',
		}
	}

	if (
		gclid ||
		gbraid ||
		wbraid ||
		(isPaidMedium && searchPlatform === 'google')
	) {
		return {
			channel: 'paid_search',
			detail: 'google_ads',
			platform: 'google',
		}
	}

	if (
		matchesAny(combined, [
			'gmb',
			'googlebusiness',
			'googlemybusiness',
			'businessprofile',
			'googlemaps',
			'mapsgoogle',
		])
	) {
		return {
			channel: 'gmb',
			detail: 'google_business_profile',
			platform: 'google',
		}
	}

	if (medium.includes('email')) {
		return {
			channel: 'email',
			detail: source ? `${source}_email` : 'email',
			platform: source || 'email',
		}
	}

	if (medium.includes('sms') || medium.includes('text')) {
		return {
			channel: 'sms',
			detail: source ? `${source}_sms` : 'sms',
			platform: source || 'sms',
		}
	}

	if (isPaidMedium && socialPlatform) {
		return {
			channel: 'paid_social',
			detail: `${socialPlatform}_ads`,
			platform: socialPlatform,
		}
	}

	if (isPaidMedium && searchPlatform) {
		return {
			channel: 'paid_search',
			detail: `${searchPlatform}_ads`,
			platform: searchPlatform,
		}
	}

	if (socialPlatform) {
		return {
			channel: 'organic_social',
			detail: `${socialPlatform}_organic`,
			platform: socialPlatform,
		}
	}

	if (isSearchReferrer(referrerDomain, referrer)) {
		const seoPlatform = getSearchPlatform(source, referrerDomain, campaign)
		return {
			channel: 'organic_search',
			detail: seoPlatform ? `seo_${seoPlatform}` : 'seo',
			platform: seoPlatform,
		}
	}

	if (!initialReferrer) {
		return {
			channel: 'direct',
			detail: 'direct',
			platform: null,
		}
	}

	return {
		channel: 'referral',
		detail: 'referral',
		platform: null,
	}
}

function isBookPath(pathname: string) {
	return pathname === '/book'
}

function getPagePrefixType(pathname: string) {
	return pathname.startsWith('/lp') ? 'lp' : 'non_lp'
}

function getPageType(pathname: string) {
	if (isBookPath(pathname)) return 'booking'
	if (pathname === '/') return 'home'
	if (pathname.startsWith('/lp')) return 'lp'

	const firstSegment = pathname.replace(/^\/+/, '').split('/')[0] ?? ''
	if (SERVICE_PAGE_SEGMENTS.has(firstSegment)) return 'service'

	return 'other'
}

function formatDayOfWeekBucket(weekday: string) {
	const days = [
		'Sunday',
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday',
	]
	const index = days.indexOf(weekday)
	if (index === -1) return weekday
	return `${index} - ${weekday}`
}

function formatHourBucket(hour: number) {
	const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24
	return `${normalizedHour.toString().padStart(2, '0')} - ${formatHourLabel(
		normalizedHour,
	)}`
}

function formatHourLabel(hour: number) {
	if (hour === 0) return '12 AM'
	if (hour < 12) return `${hour} AM`
	if (hour === 12) return '12 PM'
	return `${hour - 12} PM`
}

function isSearchReferrer(referrerDomain: string, referrer: string) {
	return (
		matchesAny(referrerDomain, [
			'google.',
			'bing.',
			'yahoo.',
			'duckduckgo.',
			'ecosia.',
		]) || matchesAny(referrer, ['/search', 'google'])
	)
}

function getSearchPlatform(
	source: string,
	referrerDomain: string,
	campaign: string,
) {
	const combined = [source, referrerDomain, campaign].filter(Boolean).join(' ')
	if (matchesAny(combined, ['google', 'adwords', 'googleads'])) return 'google'
	if (matchesAny(combined, ['bing', 'microsoft'])) return 'bing'
	if (combined.includes('yahoo')) return 'yahoo'
	if (combined.includes('duckduckgo')) return 'duckduckgo'
	if (combined.includes('ecosia')) return 'ecosia'
	return null
}

function getSocialPlatform(
	source: string,
	referrerDomain: string,
	campaign: string,
) {
	const combined = [source, referrerDomain, campaign].filter(Boolean).join(' ')
	if (matchesAny(combined, ['facebook', 'instagram', 'meta'])) return 'meta'
	if (combined.includes('tiktok')) return 'tiktok'
	if (combined.includes('linkedin')) return 'linkedin'
	if (combined.includes('pinterest')) return 'pinterest'
	return null
}

function matchesAny(value: string, needles: string[]) {
	return needles.some(needle => value.includes(needle))
}

function normalizeReferrer(value?: string | null) {
	const trimmed = value?.trim()
	return trimmed ? trimmed : null
}

function normalizeToken(value?: string | null) {
	return (
		value
			?.trim()
			.toLowerCase()
			.replace(/[\s_-]+/g, '') ?? ''
	)
}

function getReferringDomain(referrer?: string | null) {
	if (!referrer) return null
	try {
		return new URL(referrer).hostname.replace(/^www\./, '')
	} catch {
		return null
	}
}

function getPathnameFromStoredPath(value?: string | null) {
	if (!value) return null

	try {
		return new URL(value, 'https://hitchcoxaesthetics.com').pathname
	} catch {
		return value.split('?')[0] ?? value
	}
}

function getStoredTrafficAttribution(stored: StoredBookingAnalytics) {
	return inferTrafficAttribution({
		fbclid: stored.fbclid,
		gbraid: stored.gbraid,
		gclid: stored.gclid,
		initialReferrer: stored.initialReferrer,
		initialReferringDomain: stored.initialReferringDomain,
		msclkid: stored.msclkid,
		utm_campaign: stored.utm_campaign,
		utm_medium: stored.utm_medium,
		utm_source: stored.utm_source,
		wbraid: stored.wbraid,
	})
}

function getStoredCallRailAttribution(stored: StoredBookingAnalytics) {
	const liveTracking = getCallRailTrackingFromBrowser()
	const sessionId =
		liveTracking.sessionId ?? stored.callrailSessionId ?? undefined
	const visitorId =
		liveTracking.visitorId ?? stored.callrailVisitorId ?? undefined
	return { sessionId, visitorId }
}

function getPostHogDistinctId() {
	return getStoredPostHogState()?.distinct_id
}

function getPostHogSessionId() {
	const session = getStoredPostHogState()?.$sesid
	return Array.isArray(session) && typeof session[1] === 'string'
		? session[1]
		: undefined
}

function getStoredPostHogState() {
	if (typeof window === 'undefined') return null

	for (let index = 0; index < window.localStorage.length; index++) {
		const key = window.localStorage.key(index)
		if (!key?.startsWith('ph_') || !key.endsWith('_posthog')) continue

		const value = window.localStorage.getItem(key)
		if (!value) continue

		try {
			const parsed = JSON.parse(value)
			if (parsed && typeof parsed === 'object') {
				return parsed as {
					distinct_id?: string
					$sesid?: unknown
				}
			}
		} catch {
			continue
		}
	}

	return null
}

function syncPostHogAttributionCookies() {
	if (typeof window === 'undefined' || typeof document === 'undefined') return
	const distinctId = getPostHogDistinctId()
	const sessionId = getPostHogSessionId()
	if (distinctId)
		writeAttributionCookie(POSTHOG_DISTINCT_COOKIE, distinctId, 15552000)
	if (sessionId) writeAttributionCookie(POSTHOG_SESSION_COOKIE, sessionId, 1800)
}

function writeAttributionCookie(
	name: string,
	value: string,
	maxAgeSeconds: number,
) {
	const secure = window.location.protocol === 'https:' ? '; Secure' : ''
	document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
		value,
	)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
}

function getCallRailTrackingFromBrowser(search = '') {
	const searchParams = new URLSearchParams(search)
	return {
		sessionId:
			getFirstSearchParam(searchParams, CALLRAIL_SESSION_PARAM_KEYS) ??
			getFirstCookieValue(CALLRAIL_SESSION_PARAM_KEYS) ??
			getFirstCallTrackingCookieValue(CALLRAIL_SESSION_PARAM_KEYS),
		visitorId:
			getFirstSearchParam(searchParams, CALLRAIL_VISITOR_PARAM_KEYS) ??
			getFirstCookieValue(CALLRAIL_VISITOR_PARAM_KEYS) ??
			getFirstCallTrackingCookieValue(CALLRAIL_VISITOR_PARAM_KEYS),
	}
}

function getFirstSearchParam(
	searchParams: URLSearchParams,
	keys: readonly string[],
) {
	for (const key of keys) {
		const value = searchParams.get(key)?.trim()
		if (value) return value
	}
	return null
}

function getFirstCookieValue(keys: readonly string[]) {
	const cookies = getCookies()
	for (const key of keys) {
		const value = cookies[key]?.trim()
		if (value) return value
	}
	return null
}

function getFirstCallTrackingCookieValue(keys: readonly string[]) {
	const cookies = getCookies()
	for (const [name, value] of Object.entries(cookies)) {
		if (!/(callrail|calltrk|call_trk)/i.test(name)) continue
		const fromStructuredValue = getFirstStructuredCookieValue(value, keys)
		if (fromStructuredValue) return fromStructuredValue
	}
	return null
}

function getFirstStructuredCookieValue(value: string, keys: readonly string[]) {
	const decodedValue = decodeCookieComponent(value)
	try {
		const parsed = JSON.parse(decodedValue)
		if (parsed && typeof parsed === 'object') {
			for (const key of keys) {
				const nestedValue = (parsed as Record<string, unknown>)[key]
				if (typeof nestedValue === 'string' && nestedValue.trim()) {
					return nestedValue.trim()
				}
			}
		}
	} catch {
		// Try query-string style values next.
	}
	const params = new URLSearchParams(decodedValue)
	return getFirstSearchParam(params, keys)
}

function getCookies() {
	if (typeof document === 'undefined') return {}
	return Object.fromEntries(
		document.cookie.split(';').map(cookie => {
			const [rawName = '', ...rawValue] = cookie.trim().split('=')
			return [
				decodeCookieComponent(rawName),
				decodeCookieComponent(rawValue.join('=')),
			]
		}),
	)
}

function decodeCookieComponent(value: string) {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

function readStoredBookingAnalytics() {
	if (typeof window === 'undefined') return null
	try {
		const value = window.sessionStorage.getItem(STORAGE_KEY)
		if (!value) return null
		return JSON.parse(value) as StoredBookingAnalytics
	} catch {
		return null
	}
}

function writeStoredBookingAnalytics(value: StoredBookingAnalytics) {
	if (typeof window === 'undefined') return
	try {
		window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
	} catch {
		// Ignore sessionStorage failures.
	}
}

function compactEventProperties(properties: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(properties).filter(
			([, value]) => value !== null && value !== '' && value !== undefined,
		),
	)
}

function roundToOneDecimal(value: number) {
	return Math.round(value * 10) / 10
}

function getDurationBucket(value: number | null) {
	if (typeof value !== 'number') return undefined
	if (value < 30_000) return 'under_30s'
	if (value < 120_000) return '30s_to_2m'
	if (value < 600_000) return '2m_to_10m'
	return '10m_plus'
}

function getPageCountBucket(value: number | null) {
	if (typeof value !== 'number') return undefined
	if (value === 0) return '0'
	if (value === 1) return '1'
	if (value <= 4) return '2_to_4'
	return '5_plus'
}
