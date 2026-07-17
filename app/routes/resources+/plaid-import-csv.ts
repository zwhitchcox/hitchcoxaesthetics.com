/**
 * Internal statement-CSV import endpoint — lets the local machine load
 * Apple Card CSV history into the production database (Plaid can't serve
 * Apple Card at all, so the Wallet export is the only source).
 *
 *   curl -X POST https://hitchcoxaesthetics.com/resources/plaid-import-csv \
 *     -H "Authorization: Bearer $INTERNAL_COMMAND_TOKEN" \
 *     -H "Content-Type: text/csv" \
 *     -H "X-Import-Kind: apple-card" \
 *     --data-binary @transactions.csv
 *
 * Guarded by INTERNAL_COMMAND_TOKEN, same trust model as /cache/sqlite.
 */
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { prisma } from '#app/utils/db.server.ts'
import {
	importAppleCardCsv,
	importCapOneCsv,
} from '#app/utils/plaid-csv-import.server.ts'

function requireToken(request: Request) {
	const token = process.env.INTERNAL_COMMAND_TOKEN
	const auth = request.headers.get('Authorization')
	return Boolean(token && auth === `Bearer ${token}`)
}

/** GET: per-source row counts + coverage, to check local/prod parity. */
export async function loader({ request }: LoaderFunctionArgs) {
	if (!requireToken(request)) return json({ error: 'unauthorized' }, { status: 401 })
	const groups = await prisma.plaidTransaction.groupBy({
		by: ['itemId', 'institution'],
		_count: true,
		_min: { date: true },
		_max: { date: true },
	})
	return json({
		sources: groups.map(g => ({
			itemId: g.itemId,
			institution: g.institution,
			rows: g._count,
			from: g._min.date,
			to: g._max.date,
		})),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	if (!requireToken(request)) {
		return json({ error: 'unauthorized' }, { status: 401 })
	}
	const kind = request.headers.get('X-Import-Kind')
	const csv = await request.text()
	if (kind === 'apple-card') {
		if (!csv.includes('Transaction Date')) {
			return json({ error: 'body does not look like an Apple Card CSV' }, { status: 400 })
		}
		return json(await importAppleCardCsv(csv))
	}
	if (kind === 'capone') {
		if (!csv.includes('Posted Date')) {
			return json({ error: 'body does not look like a Capital One CSV' }, { status: 400 })
		}
		return json(await importCapOneCsv(csv))
	}
	return json({ error: `unknown import kind: ${kind}` }, { status: 400 })
}
