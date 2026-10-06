import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'
import { OUR_DOMAINS } from '#app/utils/report-sites.ts'
import {
	hasReportsDb,
	reportsDb,
	reportsQuery,
} from '#app/utils/reports-db.server.ts'

/**
 * Sync endpoint for the pages our outreach ledger calls live.
 *
 *   POST /resources/ledger-links-sync   {pages: [...]}   store the pages; the reply lists the ones Google has indexed
 *
 * ~/outreach/ledger-links-sync.py on the Mac mini sends every live page once a day. The rows go to
 * ledger_link_pages in the reports database, a table apart from the link crawler's backlink_pages, so
 * neither source overwrites the other. The reports worker (sha-reports src/link-index.ts, which also
 * creates the table) runs a site: check on each page every day until Google returns it, and records
 * that day in google_indexed_since. The reply lists every indexed page, so the mini can note the
 * confirmation on the ledger row. Same trust model as gsc-links-sync: a bearer token, and with no
 * token set the endpoint refuses everything.
 */
const PageSchema = z.object({
	ledgerId: z.number().int().positive(),
	url: z
		.string()
		.max(2000)
		.url()
		.refine(u => /^https?:\/\//i.test(u), 'an http or https address'),
	/** The ledger row's own domain. The page can sit on another site. */
	ledgerDomain: z.string().max(255).nullable().optional(),
	/** Our sites whose link on this page the ledger marks live. */
	targets: z
		.array(
			z
				.string()
				.refine(d => OUR_DOMAINS.some(o => o === d), 'one of our sites'),
		)
		.min(1)
		.max(4),
	/** The day the ledger first verified the link live. */
	liveSince: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.optional(),
})

const PayloadSchema = z.object({ pages: z.array(PageSchema).min(1).max(2000) })

function authorized(request: Request) {
	const token = process.env.GSC_SYNC_TOKEN || process.env.ARTICLE_SYNC_TOKEN
	const auth = request.headers.get('Authorization')
	return Boolean(token && auth === `Bearer ${token}`)
}

export async function action({ request }: ActionFunctionArgs) {
	if (!authorized(request))
		return json({ error: 'unauthorized' }, { status: 401 })
	if (request.method !== 'POST')
		return json({ error: 'method not allowed' }, { status: 405 })
	if (!hasReportsDb())
		return json(
			{ error: 'the reports database is not configured' },
			{ status: 503 },
		)

	const parsed = PayloadSchema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) {
		return json(
			{ error: 'bad payload', detail: parsed.error.flatten() },
			{ status: 400 },
		)
	}

	const day = new Date().toISOString().slice(0, 10)
	const db = await reportsDb().connect()
	try {
		await db.query('BEGIN')
		for (const p of parsed.data.pages) {
			await db.query(
				`INSERT INTO ledger_link_pages
				   (ledger_id, url, domain, ledger_domain, targets, live_since, first_seen, last_seen)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
				 ON CONFLICT (ledger_id, url) DO UPDATE SET
				   domain = excluded.domain, ledger_domain = excluded.ledger_domain,
				   targets = excluded.targets, live_since = excluded.live_since,
				   last_seen = excluded.last_seen`,
				[
					p.ledgerId,
					p.url,
					new URL(p.url).hostname.toLowerCase().replace(/^www\./, ''),
					p.ledgerDomain ?? null,
					p.targets,
					p.liveSince ?? null,
					day,
				],
			)
		}
		await db.query('COMMIT')
	} catch (err) {
		await db.query('ROLLBACK').catch(() => {})
		throw err
	} finally {
		db.release()
	}

	const indexed = await reportsQuery<{
		ledger_id: number
		url: string
		since: string
	}>(
		`SELECT ledger_id, url, to_char(google_indexed_since, 'YYYY-MM-DD') AS since
		 FROM ledger_link_pages WHERE google_indexed_since IS NOT NULL
		 ORDER BY ledger_id, url`,
	)
	return json({
		ok: true,
		day,
		stored: parsed.data.pages.length,
		indexed: indexed.map(r => ({
			ledgerId: r.ledger_id,
			url: r.url,
			since: r.since,
		})),
	})
}
