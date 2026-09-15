import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { reviewerName } from '#app/utils/articles.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { parseLane } from '#app/utils/review-queue.server.ts'
import {
	loadArticleView,
	loadCards,
} from '#app/routes/review+/_shared.server.ts'

/**
 * The next card for the feed on /review/:id.
 *
 *   GET /resources/review-next?lane=2|5|10&exclude=id1,id2,...
 *   -> 200 { card: ArticleView | null }
 *
 * The first card of the lane that is not in `exclude` (the ids already on
 * the page), or null when nothing is left. Admin only. Reads no cookies:
 * the lane and sitting cookies have path=/review and never reach here.
 * "That is plenty" is never decided here; it comes from the decision action.
 */
const MAX_EXCLUDED = 200

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const url = new URL(request.url)
	const lane = parseLane(url.searchParams.get('lane'))
	const exclude = new Set(
		(url.searchParams.get('exclude') ?? '')
			.split(',')
			.map(s => s.trim())
			.filter(Boolean)
			.slice(0, MAX_EXCLUDED),
	)
	const now = new Date()
	const cards = (
		await loadCards(lane, now, { ownEditsBy: await reviewerName(userId) })
	).filter(c => !exclude.has(c.article.id))
	const first = cards[0]
	const card = first ? await loadArticleView(first.article.id) : null
	return json({ card }, { headers: { 'Cache-Control': 'no-store' } })
}

export function action() {
	return json({ error: 'GET only' }, { status: 405 })
}
