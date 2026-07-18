/**
 * Live slug list for ad deep-links, grouped from the Boulevard catalog with
 * the same derivation the booking wizard uses. Shared by the hidden
 * /booking-links page (for Rick) and scripts/print-booking-slugs.ts.
 */
import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import {
	bookingServiceSlug,
	bookingServiceVariant,
} from '#app/utils/booking-service-slugs.ts'

export type BookingSlugGroup = {
	slug: string
	url: string
	serviceNames: string[]
	hasVariants: boolean
}

let cache: { at: number; groups: BookingSlugGroup[] } | null = null
const CACHE_MS = 5 * 60 * 1000

export async function listBookingSlugGroups(): Promise<BookingSlugGroup[]> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.groups

	const names: string[] = []
	let after: string | null = null
	for (let page = 0; page < 20; page++) {
		const data: any = await boulevardAdminFetch(
			`query Services($after: String) {
				services(first: 100, after: $after) {
					pageInfo { endCursor hasNextPage }
					edges { node { name active } }
				}
			}`,
			{ after },
		)
		for (const e of data.services?.edges ?? []) {
			if (e.node?.active !== false && e.node?.name) names.push(e.node.name)
		}
		if (!data.services?.pageInfo?.hasNextPage) break
		after = data.services.pageInfo.endCursor
	}

	const bySlug = new Map<string, string[]>()
	for (const name of names) {
		if (/telehealth/i.test(name)) continue
		const slug = bookingServiceSlug(name)
		if (!slug) continue
		bySlug.set(slug, [...(bySlug.get(slug) ?? []), name])
	}

	const groups = [...bySlug.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([slug, serviceNames]) => {
			const variants = serviceNames.map(bookingServiceVariant)
			return {
				slug,
				url: `https://hitchcoxaesthetics.com/book?service=${slug}`,
				serviceNames,
				hasVariants: variants.includes('new') && variants.includes('existing'),
			}
		})
	cache = { at: Date.now(), groups }
	return groups
}
