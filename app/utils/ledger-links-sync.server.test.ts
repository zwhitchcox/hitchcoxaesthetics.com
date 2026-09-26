import { afterEach, describe, expect, test, vi } from 'vitest'
import { action } from '#app/routes/resources+/ledger-links-sync.ts'

/**
 * /resources/ledger-links-sync against a stand-in for the reports database:
 * the token, the payload check, and the rows the mini's push writes. The
 * SQL itself runs against Postgres in the sha-reports link-index checks.
 */
const calls = vi.hoisted(() => ({
	queries: [] as Array<{ sql: string; params: unknown[] }>,
}))
vi.mock('#app/utils/reports-db.server.ts', () => ({
	hasReportsDb: () => true,
	reportsDb: () => ({
		connect: async () => ({
			query: async (sql: string, params: unknown[] = []) => {
				calls.queries.push({ sql, params })
				return { rows: [] }
			},
			release: () => {},
		}),
	}),
	reportsQuery: async () => [
		{
			ledger_id: 36,
			url: 'https://www.knoxtntoday.com/spotlight/',
			since: '2026-09-27',
		},
	],
}))

const TOKEN = 'test-sync-token'

function post(body: unknown, token = TOKEN) {
	vi.stubEnv('GSC_SYNC_TOKEN', TOKEN)
	return action({
		request: new Request('http://localhost/resources/ledger-links-sync', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		}),
		params: {},
		context: {},
	})
}

const page = {
	ledgerId: 162,
	url: 'https://www.hereknoxville.com/partners/hitchcox-aesthetics-bearden/',
	ledgerDomain: 'visitdowntownmadison.com',
	targets: ['hitchcoxaesthetics.com'],
	liveSince: '2026-09-02',
}

describe('/resources/ledger-links-sync', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
		calls.queries.length = 0
	})

	test('a wrong token writes nothing', async () => {
		const res = await post({ pages: [page] }, 'wrong')
		expect(res.status).toBe(401)
		expect(calls.queries).toEqual([])
	})

	test('a page for a site that is not ours is refused', async () => {
		const res = await post({
			pages: [{ ...page, targets: ['hepisontheway.com'] }],
		})
		expect(res.status).toBe(400)
		expect(calls.queries).toEqual([])
	})

	test('each page is stored under its own host, and the reply lists the indexed pages', async () => {
		const res = await post({
			pages: [
				page,
				{
					ledgerId: 1351,
					url: 'https://ganjingworld.com/a/1',
					targets: ['hitchcoxaesthetics.com', 'botoxknoxvilletn.com'],
				},
			],
		})
		expect(res.status).toBe(200)
		const body = await res.json()
		const day = new Date().toISOString().slice(0, 10)
		expect(body).toEqual({
			ok: true,
			day,
			stored: 2,
			indexed: [
				{
					ledgerId: 36,
					url: 'https://www.knoxtntoday.com/spotlight/',
					since: '2026-09-27',
				},
			],
		})
		const upserts = calls.queries.filter(q =>
			q.sql.includes('INSERT INTO ledger_link_pages'),
		)
		expect(upserts.map(q => q.params)).toEqual([
			[
				162,
				page.url,
				'hereknoxville.com',
				'visitdowntownmadison.com',
				['hitchcoxaesthetics.com'],
				'2026-09-02',
				day,
			],
			[
				1351,
				'https://ganjingworld.com/a/1',
				'ganjingworld.com',
				null,
				['hitchcoxaesthetics.com', 'botoxknoxvilletn.com'],
				null,
				day,
			],
		])
		expect(calls.queries.map(q => q.sql)).toEqual([
			'BEGIN',
			expect.stringContaining('INSERT INTO ledger_link_pages'),
			expect.stringContaining('INSERT INTO ledger_link_pages'),
			'COMMIT',
		])
	})
})
