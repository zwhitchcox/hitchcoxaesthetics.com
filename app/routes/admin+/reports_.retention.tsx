/**
 * Retention, patients who have quietly stopped coming. Each client's
 * expected-return date comes from their own visit rhythm (mean + 1 SD) or
 * their last service's typical rebook interval across all clients, whichever
 * is later; past it with no future booking = lapsed. Consult-only clients who
 * never bought are their own "never converted" bucket.
 * Data: `lapsed_patients` in the reports DB, recomputed daily.
 */
import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { Form, useLoaderData, useSubmit } from '@remix-run/react'
import { ReportPage, StatTile, usd, useSortable } from '#app/components/report-ui'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Retention: lapsed patients' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

type Row = {
	client_id: string
	client_name: string
	phone: string | null
	visit_count: number
	last_visit_at: string
	last_services: string | null
	usual_interval_days: number | null
	interval_source: string
	due_at: string
	overdue_days: number
	status: string
	lifetime_usd: string
	computed_at: string
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	if (!hasReportsDb()) return json({ configured: false as const })
	const params = new URL(request.url).searchParams
	const show = params.get('show') === 'all' ? 'all' : 'lost'
	const rows = await reportsQuery<Row>(
		`SELECT client_id, client_name, phone, visit_count,
			to_char(last_visit_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS last_visit_at,
			last_services, usual_interval_days, interval_source,
			to_char(due_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS due_at,
			overdue_days, status, round(lifetime_usd) AS lifetime_usd,
			to_char(max(computed_at) over (), 'Mon DD HH12:MI AM') AS computed_at
		 FROM lapsed_patients
		 ORDER BY lifetime_usd DESC`,
	).catch(() => null)
	return json({ configured: true as const, show, rows })
}

const STATUS_LABEL: Record<string, string> = {
	lapsed: 'Lapsed',
	never_converted: 'Never converted',
	active: 'Active',
	booked: 'Booked',
}

export default function Retention() {
	const data = useLoaderData<typeof loader>()
	// Hooks must run unconditionally, so all of them come before the
	// not-configured early return.
	const submit = useSubmit()
	const allRows = data.configured ? data.rows : []
	const show = data.configured ? data.show : 'lapsed'
	const lapsed = (allRows ?? []).filter(r => r.status === 'lapsed')
	const neverConverted = (allRows ?? []).filter(r => r.status === 'never_converted')
	const visible =
		show === 'all'
			? (allRows ?? [])
			: [...lapsed, ...neverConverted]
	const { rows, Th } = useSortable(visible, {
		lifetime_usd: r => Number(r.lifetime_usd),
	})
	if (!data.configured)
		return <p style={{ padding: 32 }}>Reports database is not configured (REPORTS_DATABASE_URL).</p>
	const valueAtStake = lapsed.reduce((sum, r) => sum + Number(r.lifetime_usd), 0)

	if (allRows == null || allRows.length === 0) {
		return (
			<ReportPage title="Retention, lapsed patients">
				<p className="note">
					No data yet. The lapsed-patients job runs daily on the worker; its
					first run after deploy fills this page.
				</p>
			</ReportPage>
		)
	}

	return (
		<ReportPage
			title="Retention, lapsed patients"
			subtitle={`Overdue = past their usual visit rhythm (their own cadence or the service's, whichever is later) with nothing booked · computed ${rows[0]?.computed_at ?? ''}`}
		>
			<div className="tiles">
				<StatTile
					label="Lapsed patients"
					value={String(lapsed.length)}
					whisper={`${usd(valueAtStake)} of lifetime value gone quiet`}
				/>
				<StatTile
					label="Never converted"
					value={String(neverConverted.length)}
					whisper="consult only, never bought, nothing booked"
				/>
				<StatTile
					label="Coming back"
					value={String((allRows ?? []).filter(r => r.status === 'booked').length)}
					whisper="have a future appointment on the books"
				/>
			</div>

			<Form method="get" className="controls" onChange={e => submit(e.currentTarget)}>
				<label htmlFor="show">Show</label>
				<select id="show" name="show" defaultValue={show}>
					<option value="lost">Lapsed + never converted</option>
					<option value="all">Everyone (incl. active/booked)</option>
				</select>
			</Form>

			<section>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<Th k="client_name">Client</Th>
								<Th k="last_visit_at">Last visit</Th>
								<Th k="visit_count" num>Visits</Th>
								<Th k="last_services">Last service</Th>
								<Th k="usual_interval_days" num>Usual gap</Th>
								<Th k="due_at">Was due back</Th>
								<Th k="overdue_days" num>Overdue by</Th>
								<Th k="status">Status</Th>
								<Th k="lifetime_usd" num>Lifetime value</Th>
							</tr>
						</thead>
						<tbody>
							{rows.map(r => (
								<tr key={r.client_id}>
									<td>
										{r.client_name}
										{r.phone ? <span className="mini"> · {r.phone}</span> : null}
									</td>
									<td>{r.last_visit_at}</td>
									<td className="num">{r.visit_count}</td>
									<td>{r.last_services || '-'}</td>
									<td className="num">
										{r.usual_interval_days != null ? `${r.usual_interval_days}d` : '-'}
										<span className="mini"> ({r.interval_source})</span>
									</td>
									<td>{r.due_at}</td>
									<td className={`num ${r.overdue_days > 0 ? 'bad' : ''}`}>
										{r.overdue_days > 0 ? `${r.overdue_days}d` : '-'}
									</td>
									<td>{STATUS_LABEL[r.status] ?? r.status}</td>
									<td className="num">{usd(Number(r.lifetime_usd))}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					Sorted by lifetime value, so the top of the list is the win-back call
					sheet. "Usual gap" shows which cadence flagged them: their own
					(personal), the service's typical rebook interval (service), or the
					all-clients fallback (global) when there isn't enough history.
				</p>
			</section>
		</ReportPage>
	)
}
