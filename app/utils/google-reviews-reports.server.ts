/**
 * Syncs review-level Google reviews (with createTime) for every listing we
 * own into the reports Postgres `google_reviews` table — the source for the
 * /admin/reports/reviews page. Ported from sha-reports/src/google-reviews.ts
 * so the site's own job scheduler keeps the table fresh daily (the worker's
 * copy of this sync had been silently stale for days).
 */
import { hasReportsDb, reportsDb } from '#app/utils/reports-db.server.ts'

const ACCOUNT = 'accounts/104663503113561659457'
const LOCATIONS: Array<{ id: string; label: string }> = [
	{ id: 'locations/13581758717989522836', label: 'SHA Bearden' },
	{ id: 'locations/7968858603211080242', label: 'SHA Farragut' },
	{ id: 'locations/18165056681856849543', label: 'SHA West Hills' },
	{ id: 'locations/7823258395260652453', label: 'SHA Cedar Bluff' },
	{ id: 'locations/8814118436068854281', label: 'Botox Knox Med Spa (Bearden)' },
	{ id: 'locations/8388106535416305139', label: 'Botox Knox Med Spa (Farragut)' },
	{ id: 'locations/15016055128629417766', label: 'KWLC (Bearden)' },
	{ id: 'locations/11750979648218741829', label: 'KWLC (Farragut)' },
]
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

export function hasGoogleReviewsReportsConfig() {
	return (
		hasReportsDb() &&
		Boolean(
			process.env.GOOGLE_CLIENT_ID?.trim() &&
				process.env.GOOGLE_CLIENT_SECRET?.trim() &&
				process.env.GOOGLE_REFRESH_TOKEN?.trim(),
		)
	)
}

async function accessToken(): Promise<string> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: process.env.GOOGLE_CLIENT_ID ?? '',
			client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
			refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
			grant_type: 'refresh_token',
		}),
	})
	const json = (await res.json()) as { access_token?: string }
	if (!json.access_token)
		throw new Error(
			'Google token exchange failed: ' + JSON.stringify(json).slice(0, 200),
		)
	return json.access_token
}

export async function syncGoogleReviewsToReports(): Promise<{ reviews: number }> {
	const pool = reportsDb()
	await pool.query(`
		CREATE TABLE IF NOT EXISTS google_reviews (
			review_id   TEXT PRIMARY KEY,
			location_id TEXT NOT NULL,
			listing     TEXT NOT NULL,
			star        INT,
			create_time TIMESTAMPTZ NOT NULL,
			update_time TIMESTAMPTZ,
			reviewer    TEXT,
			comment     TEXT
		)`)

	const token = await accessToken()
	let total = 0
	for (const loc of LOCATIONS) {
		let pageToken = ''
		for (let page = 0; page < 40; page++) {
			const url = `https://mybusiness.googleapis.com/v4/${ACCOUNT}/${loc.id}/reviews?pageSize=50&pageToken=${pageToken}`
			const res = await fetch(url, {
				headers: { Authorization: `Bearer ${token}` },
			})
			const data = (await res.json()) as any
			if (!res.ok) {
				console.error(
					`[google-reviews] ${loc.label} failed: ${JSON.stringify(data.error ?? data).slice(0, 200)}`,
				)
				break
			}
			for (const r of data.reviews ?? []) {
				await pool.query(
					`INSERT INTO google_reviews (review_id, location_id, listing, star, create_time, update_time, reviewer, comment)
					 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
					 ON CONFLICT (review_id) DO UPDATE SET
						star = excluded.star, update_time = excluded.update_time, comment = excluded.comment`,
					[
						r.reviewId,
						loc.id,
						loc.label,
						STARS[r.starRating] ?? null,
						r.createTime,
						r.updateTime ?? null,
						r.reviewer?.displayName ?? null,
						r.comment ?? null,
					],
				)
				total++
			}
			pageToken = data.nextPageToken ?? ''
			if (!pageToken) break
		}
	}
	console.log(
		`[google-reviews] synced ${total} reviews across ${LOCATIONS.length} listings into the reports db`,
	)
	return { reviews: total }
}
