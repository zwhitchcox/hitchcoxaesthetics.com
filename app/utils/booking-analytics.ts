const STORAGE_KEY = 'sha.booking-analytics'

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

type MarketingParamKey = (typeof MARKETING_PARAM_KEYS)[number]

type StoredBookingAnalytics = Record<MarketingParamKey, string | null> & {
	bookEntryFromPath: string | null
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

	stored.lastPath = fullPath
	writeStoredBookingAnalytics(stored)
}

export function getBookingAnalyticsEventProperties() {
	const stored = readStoredBookingAnalytics()
	if (!stored) return {}
	const trafficAttribution = inferTrafficAttribution({
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

	return compactEventProperties({
		book_entry_from_path: stored.bookEntryFromPath,
		book_entry_path: stored.firstBookPath,
		initial_landing_path: stored.initialLandingPath,
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
	const searchParams = new URLSearchParams(search)
	const marketingParams = Object.fromEntries(
		MARKETING_PARAM_KEYS.map(key => [key, searchParams.get(key)]),
	) as Record<MarketingParamKey, string | null>
	const initialReferrer = normalizeReferrer(referrer)
	const trafficAttribution = inferTrafficAttribution({
		...marketingParams,
		initialReferrer,
		initialReferringDomain: getReferringDomain(initialReferrer),
	})

	return {
		...marketingParams,
		bookEntryFromPath: null,
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

function inferTrafficAttribution({
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
