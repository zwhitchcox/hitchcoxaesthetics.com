/**
 * Read-only access to the reports Postgres (REPORTS_DATABASE_URL) — the same
 * database the finance sync (finance-reports.server.ts) and the sha-reports
 * worker write to. Native report pages read it directly.
 */
import pg from 'pg'

let pool: pg.Pool | null = null

export function hasReportsDb() {
	return Boolean(process.env.REPORTS_DATABASE_URL?.trim())
}

export function reportsDb(): pg.Pool {
	const url = process.env.REPORTS_DATABASE_URL?.trim()
	if (!url) throw new Error('REPORTS_DATABASE_URL is not configured')
	pool ??= new pg.Pool({ connectionString: url, max: 3 })
	return pool
}

export async function reportsQuery<T extends pg.QueryResultRow>(
	sql: string,
	params: unknown[] = [],
): Promise<T[]> {
	const res = await reportsDb().query<T>(sql, params as any[])
	return res.rows
}
