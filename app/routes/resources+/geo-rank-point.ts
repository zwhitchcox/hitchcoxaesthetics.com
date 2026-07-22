/**
 * Full local-pack listing for one geo-grid point, feeds the click-a-dot
 * popup on /geo-rank. Returns every result DataForSEO captured at that grid
 * point for the given week + keyword, in rank order.
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ results: [] })
	const p = new URL(request.url).searchParams
	const week = p.get('week') ?? ''
	const keyword = p.get('keyword') ?? ''
	const row = Number(p.get('row'))
	const col = Number(p.get('col'))
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(week) ||
		!keyword ||
		!Number.isInteger(row) ||
		!Number.isInteger(col)
	) {
		return json({ results: [] }, { status: 400 })
	}
	const results = await reportsQuery<{
		rank: number | null
		title: string | null
		rating: string | null
		votes: number | null
		address: string | null
		is_mine: boolean
	}>(
		`SELECT r."rankAbsolute" AS rank, r.title, r.rating::text AS rating,
			r."ratingVotes" AS votes, r.address,
			(m.place_id IS NOT NULL) AS is_mine
		 FROM raw_dataforseo_region r
		 LEFT JOIN geo_my_listing m ON m.place_id = r."placeId"
		 WHERE r.week = $1::date AND r.keyword = $2
			 AND r."gridRow" = $3 AND r."gridCol" = $4
			 AND r."rankAbsolute" IS NOT NULL
		 ORDER BY r."rankAbsolute" LIMIT 20`,
		[week, keyword, row, col],
	)
	return json({ results })
}
