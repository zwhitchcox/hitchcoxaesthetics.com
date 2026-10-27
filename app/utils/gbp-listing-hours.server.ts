/**
 * Keeps GbpListingHours, the mirror of our Google listings' weekly hours as
 * Google shows them (getGoogleUpdated, so a pending edit shows only once
 * Google publishes it). Two writers: the daily gbp-listing-hours job reads
 * every listing, and the Business Profile pub/sub push
 * (routes/resources+/gbp-notifications.ts) reads one listing again when
 * Google changes it. An edit that we make sends no push, so the daily job
 * picks it up. Pages and the brand sites read only the mirror.
 */
import { prisma } from '#app/utils/db.server.ts'
import { toPeriods, type HoursPeriod } from '#app/utils/gbp-listing-hours.ts'
import { accessToken } from '#app/utils/google-reviews-reports.server.ts'

/** Every listing whose hours a page shows. */
export const LISTING_IDS = [
	'locations/13581758717989522836', // SHA Bearden
	'locations/7968858603211080242', // SHA Farragut
	'locations/8814118436068854281', // Botox Knox Bearden
	'locations/8388106535416305139', // Botox Knox Farragut
	'locations/15016055128629417766', // KWLC Bearden
	'locations/5772695199180090933', // KWLC Farragut
	'locations/11737030755730050907', // KLC Bearden
	'locations/11515525288162488122', // KLC Farragut
]

// Our push subscription sha-listing-hours-push (Google Cloud project
// polished-bounty-395315, the topic findgood.work set up) signs each push as
// this service account, for this audience.
const PUSH_SERVICE_ACCOUNT =
	'fgw-244@polished-bounty-395315.iam.gserviceaccount.com'
const PUSH_AUDIENCE = 'sha-gbp-listing-hours'

export type ListingHours = {
	title: string
	periods: HoursPeriod[]
	syncedAt: string
}

export function hasGbpListingHoursConfig() {
	return Boolean(
		process.env.GOOGLE_CLIENT_ID?.trim() &&
			process.env.GOOGLE_CLIENT_SECRET?.trim() &&
			process.env.GOOGLE_REFRESH_TOKEN?.trim(),
	)
}

/** Read each listing as Google shows it, and write its hours to the mirror. */
export async function syncGbpListingHours(locationIds = LISTING_IDS) {
	const token = await accessToken()
	const errors: string[] = []
	let synced = 0
	for (const locationId of locationIds) {
		try {
			const res = await fetch(
				`https://mybusinessbusinessinformation.googleapis.com/v1/${locationId}:getGoogleUpdated?readMask=title,regularHours`,
				{ headers: { Authorization: `Bearer ${token}` } },
			)
			if (!res.ok) {
				throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
			}
			const { location } = (await res.json()) as {
				location?: {
					title?: string
					regularHours?: Parameters<typeof toPeriods>[0]
				}
			}
			const row = {
				title: location?.title ?? '',
				periods: JSON.stringify(toPeriods(location?.regularHours)),
			}
			await prisma.gbpListingHours.upsert({
				where: { locationId },
				create: { locationId, ...row },
				update: row,
			})
			synced++
		} catch (error) {
			errors.push(
				`${locationId}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
	// One bad listing (re-created, new id) must not stop the others.
	if (errors.length) throw new Error(`GBP hours: ${errors.join('; ')}`)
	return { synced }
}

export async function readListingHours(): Promise<Record<string, ListingHours>> {
	const rows = await prisma.gbpListingHours.findMany()
	return Object.fromEntries(
		rows.map(row => [
			row.locationId,
			{
				title: row.title,
				periods: JSON.parse(row.periods) as HoursPeriod[],
				syncedAt: row.syncedAt.toISOString(),
			},
		]),
	)
}

export async function getListingPeriods(
	locationId: string,
): Promise<HoursPeriod[] | null> {
	const row = await prisma.gbpListingHours.findUnique({ where: { locationId } })
	return row ? (JSON.parse(row.periods) as HoursPeriod[]) : null
}

/** Is this the Google-signed token of our push subscription? */
export async function verifyPushToken(authorization: string | null) {
	if (!authorization?.startsWith('Bearer ')) return false
	const res = await fetch(
		`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(authorization.slice('Bearer '.length))}`,
	)
	if (!res.ok) return false
	const claims = (await res.json()) as {
		aud?: string
		email?: string
		email_verified?: string
	}
	return (
		claims.aud === PUSH_AUDIENCE &&
		claims.email === PUSH_SERVICE_ACCOUNT &&
		claims.email_verified === 'true'
	)
}
