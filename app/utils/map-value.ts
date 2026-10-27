/**
 * What reach in the Google map box is worth, by service. Every stage is
 * measured on our own listings:
 *
 *   the times Google showed our listings for the service's searches in the
 *     last 30 days (Business Profile views, split by the search words Google
 *     names for each listing; searches for our own names and for jobs left out)
 *   ÷ today's reach for those searches (the share of metro homes where one of
 *     our listings is in the top 3)
 *   × the reach to value (today's for "now", 100% for the top spot)
 *   × view → new client (PACK_VIEW_TO_CLIENT, measured on our listings)
 *   × the 6-month value of a new client in the service (client_value)
 *
 * It replaced a model (to 2026-10-27) that started from the Google Ads volume
 * of six near-me searches. Those six were about 1% of the times Google showed
 * our listings (82 of 9,498 in September 2026), so the map read 0.7 new
 * clients a month while the map listings brought 23.
 */

export const MAP_SERVICES = [
	{
		key: 'weight loss',
		label: 'Weight loss',
		category: 'Weight Loss',
		searches: [
			'weight loss',
			'weight loss near me',
			'medical weight loss near me',
			'semaglutide near me',
		],
	},
	{
		key: 'botox',
		label: 'Botox',
		category: 'Tox',
		searches: ['botox knoxville tn', 'botox near me'],
	},
	{
		key: 'filler',
		label: 'Filler',
		category: 'Filler',
		searches: ['lip filler knoxville tn', 'filler near me'],
	},
	{
		key: 'med spa',
		label: 'Med spa and skin',
		category: 'ALL',
		searches: ['med spa knoxville tn', 'med spa near me'],
	},
	{
		key: 'laser hair removal',
		label: 'Laser hair removal',
		category: 'Laser Hair',
		searches: ['laser hair removal near me'],
	},
] as const

export type MapServiceKey = (typeof MAP_SERVICES)[number]['key']

const OUR_NAMES =
	/hitchcox|hitchcock|hitch cox|\bsarah h|\bbotox knox\b|\bweight ?loss knox\b|knoxville laser clinic/i
const JOBS = /\bjobs?\b|hiring|career/i

/** The service a search word is about, or 'ours' for a search for one of our
 *  names, or 'jobs' for a job search. Neither of those depends on reach. */
export function searchWordService(word: string): MapServiceKey | 'ours' | 'jobs' {
	if (OUR_NAMES.test(word)) return 'ours'
	if (JOBS.test(word)) return 'jobs'
	if (
		/weight|semaglut|tirzep|glp|ozempic|wegovy|mounjaro|zepbound|phentermine|\breta|diet|fat loss|lipo|b12/i.test(
			word,
		)
	)
		return 'weight loss'
	if (/botox|dysport|xeomin|daxx|jeuveau|\btox|wrinkle|masseter/i.test(word))
		return 'botox'
	if (/fill|\blips?\b|juvederm|restylane|sculptra|kybella/i.test(word))
		return 'filler'
	if (/laser|hair removal/i.test(word)) return 'laser hair removal'
	return 'med spa'
}

/** The brand a Business Profile listing belongs to, and the service a
 *  one-service listing stands for when Google names none of its searches. */
export function listingBrand(listing: string): {
	brand: string
	service: MapServiceKey | null
} {
	if (/^SHA\b/.test(listing))
		return { brand: 'Sarah Hitchcox Aesthetics', service: null }
	if (/Botox Knox/i.test(listing)) return { brand: 'Botox Knox', service: 'botox' }
	if (/KWLC/.test(listing))
		return { brand: 'Weight Loss Knox', service: 'weight loss' }
	if (/KLC/.test(listing))
		return { brand: 'Knoxville Laser Clinic', service: 'laser hair removal' }
	return { brand: listing, service: null }
}

// Google names a search word only from 15 views a month; a word it lists as
// "under 15" counts as this many views when it weights a search's reach.
const UNNAMED_WORD_VIEWS = 7

export type MapServiceValue = {
	key: MapServiceKey
	label: string
	category: string
	/** Times Google showed our listings for the service's searches, last 30 days. */
	seen: number
	/** Today's share of metro homes where we are top 3, weighted over the
	 *  service's tracked searches by their views; null without a capture. */
	reach: number | null
	/** The service's biggest search (the first in its list) is in the reach
	 *  capture. Until it is, reach comes from the smaller near-me searches. */
	mainSearchRead: boolean
	clients: number
	revenue: number
	/** The same at 100% reach: every home sees one of our listings in the top 3. */
	topClients: number | null
	topRevenue: number | null
	/** Revenue a month at any reach share (0 to 1). */
	revenueAt: (reachShare: number) => number | null
}

export function mapValueByService({
	views,
	words,
	reach,
	value,
	rate,
}: {
	/** Business Profile views per listing, last 30 days. */
	views: Array<{ listing: string; views: number }>
	/** Search words per listing (several months); views null = "under 15". */
	words: Array<{ listing: string; keyword: string; views: number | null }>
	/** Share of metro homes (0 to 1) where one of our listings is top 3, per search. */
	reach: Map<string, number>
	/** 6-month value of a new client, by client_value category. */
	value: (category: string) => number
	/** View → new client. */
	rate: number
}): MapServiceValue[] {
	// Named views per brand and search-word kind.
	const named = new Map<string, Map<string, number>>()
	const wordViews = new Map<string, number>()
	for (const w of words) {
		const kw = w.keyword.toLowerCase().trim()
		wordViews.set(kw, (wordViews.get(kw) ?? 0) + (w.views ?? UNNAMED_WORD_VIEWS))
		if (w.views == null) continue
		const { brand } = listingBrand(w.listing)
		const kinds = named.get(brand) ?? new Map<string, number>()
		const kind = searchWordService(kw)
		kinds.set(kind, (kinds.get(kind) ?? 0) + w.views)
		named.set(brand, kinds)
	}
	// Split each listing's views by its brand's search-word mix.
	const seen = new Map<MapServiceKey, number>()
	for (const v of views) {
		const { brand, service } = listingBrand(v.listing)
		const kinds = named.get(brand)
		const total = kinds ? [...kinds.values()].reduce((a, b) => a + b, 0) : 0
		if (!total) {
			if (service) seen.set(service, (seen.get(service) ?? 0) + v.views)
			continue
		}
		for (const s of MAP_SERVICES) {
			const share = (kinds!.get(s.key) ?? 0) / total
			if (share) seen.set(s.key, (seen.get(s.key) ?? 0) + v.views * share)
		}
	}
	return MAP_SERVICES.map(s => {
		let weight = 0
		let weighted = 0
		for (const kw of s.searches) {
			const share = reach.get(kw)
			if (share == null) continue
			const w = wordViews.get(kw) ?? UNNAMED_WORD_VIEWS
			weight += w
			weighted += w * share
		}
		const r = weight ? weighted / weight : null
		const sSeen = seen.get(s.key) ?? 0
		const clients = sSeen * rate
		const v = value(s.category)
		const perReach = r ? (clients * v) / r : null
		return {
			key: s.key,
			label: s.label,
			category: s.category,
			seen: sSeen,
			reach: r,
			mainSearchRead: reach.has(s.searches[0]),
			clients,
			revenue: clients * v,
			topClients: r ? clients / r : null,
			topRevenue: perReach,
			revenueAt: (share: number) => (perReach == null ? null : perReach * share),
		}
	})
}
