/**
 * Appointment performance, every appointment in the window with expected vs
 * actual revenue and a plain reason, worst first, so underperformers (and the
 * why: cancellation, no-show, membership visit, light ticket) are visible
 * individually instead of hiding inside daily aggregates.
 */
import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { ReportPage, StatTile, usd, useSortable } from '#app/components/report-ui'
import { WindowControls } from '#app/components/revenue-by-source.tsx'
import {
	loadAppointmentPerformance,
	type AppointmentPerformanceRow,
} from '#app/utils/appointment-performance.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { parseReportWindow } from '#app/utils/revenue-by-source.server.ts'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

export const meta: MetaFunction = () => [
	{ title: 'Appointment performance' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const dayToDate = (day: string, endOfDay = false) =>
	new Date(`${day}T${endOfDay ? '23:59:59' : '00:00:00'}-04:00`)

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	// Legacy links pass bare from/to, treat those as a custom window.
	const url = new URL(request.url)
	if (url.searchParams.get('from') && !url.searchParams.get('window')) {
		url.searchParams.set('window', 'custom')
		request = new Request(url.toString(), request)
	}
	const win = parseReportWindow(request, '14d')
	const { windowKey, fromDay: from, toDay: to } = win
	// The report explains why revenue fell short; appointments that haven't
	// happened yet can't have fallen short, so they're excluded.
	const rows = (
		await loadAppointmentPerformance(dayToDate(from), dayToDate(to, true))
	).filter(r => r.status !== 'upcoming')
	// The ledger is our own append-only record (diffed hourly from Boulevard),
	// so cancellations show here even when Boulevard deletes the appointment
	// outright, the case a live query can never see.
	const ledger = hasReportsDb()
		? await reportsQuery<{
				detected_at: string
				kind: string
				client_name: string | null
				services: string | null
				start_at: string | null
				expected_usd: string | null
				detail: string | null
			}>(
				`SELECT to_char(detected_at AT TIME ZONE 'America/New_York', 'MM-DD HH12:MI AM') AS detected_at,
					kind, client_name, services,
					to_char(start_at AT TIME ZONE 'America/New_York', 'MM-DD HH12:MI AM') AS start_at,
					round(expected_usd) AS expected_usd, detail
				 FROM appointment_change_log
				 WHERE kind <> 'booked'
					 AND detected_at >= $1::date AND detected_at <= $2::date + 1
				 ORDER BY detected_at DESC LIMIT 100`,
				[from, to],
			).catch(() => [])
		: []
	return json({ windowKey, from, to, rows, ledger })
}

const STATUS_LABEL: Record<AppointmentPerformanceRow['status'], string> = {
	completed: 'Completed',
	cancelled: 'Cancelled',
	no_show: 'No-show',
	upcoming: 'Upcoming',
}

export default function AppointmentPerformance() {
	const { windowKey, from, to, rows: rawRows, ledger } = useLoaderData<typeof loader>()
	const { rows, Th } = useSortable(rawRows, {
		services: r => r.services.join(' '),
	})
	const happened = rows
	const totals = happened.reduce(
		(acc, r) => ({
			expected: acc.expected + r.expectedUsd,
			actual: acc.actual + r.actualUsd,
		}),
		{ expected: 0, actual: 0 },
	)
	const lost = happened
		.filter(r => r.status === 'cancelled' || r.status === 'no_show')
		.reduce((s, r) => s + r.expectedUsd, 0)

	return (
		<ReportPage
			title="Appointment performance"
			subtitle="Expected vs actual per appointment that has already happened, worst first. Expected = booked price; $0-booked visits are valued from the client's own payment history (weight loss) or the service's per-visit average."
		>
			<WindowControls
				windowKey={windowKey}
				from={from}
				to={to}
				showGranularity={false}
			/>

			<div className="tiles">
				<StatTile label="Expected" value={usd(totals.expected)} whisper={`${from} to ${to}`} />
				<StatTile
					label="Actual"
					value={usd(totals.actual)}
					whisper={`${Math.round((100 * totals.actual) / Math.max(1, totals.expected))}% of expected`}
				/>
				<StatTile
					label="Lost to cancels / no-shows"
					value={usd(lost)}
					whisper={`${happened.filter(r => r.status === 'cancelled' || r.status === 'no_show').length} appointments`}
				/>
			</div>

			<section>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<Th k="startAt">When</Th>
								<Th k="clientName">Client</Th>
								<Th k="services">Service</Th>
								<Th k="status">Status</Th>
								<Th k="expectedUsd" num>Expected</Th>
								<Th k="actualUsd" num>Actual</Th>
								<Th k="deltaUsd" num>Δ</Th>
								<Th k="nextVisitAt">Next visit</Th>
								<Th k="reason">Why</Th>
							</tr>
						</thead>
						<tbody>
							{rows.map(r => (
								<tr key={r.appointmentId}>
									<td>
										{new Date(r.startAt).toLocaleString('en-US', {
											timeZone: 'America/New_York',
											month: '2-digit',
											day: '2-digit',
											hour: 'numeric',
											minute: '2-digit',
										})}
									</td>
									<td>
										{r.manageUrl ? (
											<a href={r.manageUrl} target="_blank" rel="noreferrer">
												{r.clientName}
											</a>
										) : (
											r.clientName
										)}
										{r.isNewPatient ? (
											<span className="mini"> · new patient</span>
										) : null}
									</td>
									<td>{r.services.join(' + ') || '-'}</td>
									<td>{STATUS_LABEL[r.status]}</td>
									<td className="num">{usd(r.expectedUsd)}</td>
									<td className="num">{usd(r.actualUsd)}</td>
									<td className={`num ${r.deltaUsd < -50 ? 'bad' : r.deltaUsd > 50 ? 'good' : ''}`}>
										{usd(r.deltaUsd)}
									</td>
									<td>
										{r.nextVisitAt ? (
											`${r.status === 'cancelled' || r.status === 'no_show' ? 'rescheduled ' : ''}${new Date(
												r.nextVisitAt,
											).toLocaleDateString('en-US', {
												timeZone: 'America/New_York',
												month: '2-digit',
												day: '2-digit',
											})}`
										) : (
											<span className={r.status === 'cancelled' || r.status === 'no_show' ? 'bad' : 'mini'}>
												{r.status === 'cancelled' || r.status === 'no_show'
													? 'not rebooked'
													: 'none booked'}
											</span>
										)}
									</td>
									<td>
										{r.reason}
										{r.status === 'cancelled' || r.status === 'no_show' ? (
											r.comms.length > 0 ? (
												<div className="mini">
													{r.comms.map((c, i) => (
														<div key={i}>
															{c.kind === 'call' ? '📞' : '💬'}{' '}
															{c.direction === 'inbound' ? 'from client' : 'to client'}{' '}
															{new Date(c.at).toLocaleString('en-US', {
																timeZone: 'America/New_York',
																month: '2-digit',
																day: '2-digit',
																hour: 'numeric',
																minute: '2-digit',
															})}
															: {c.summary}
														</div>
													))}
												</div>
											) : (
												<div className="mini">
													no calls or texts on record, likely cancelled online
												</div>
											)
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					"$0 collected" on a completed visit usually means a membership or
					package covered it, or the order wasn't linked to the appointment.
					Consult revenue often lands on a later visit, so consults can look
					like underperformers here while paying off downstream.
				</p>
			</section>

			<section>
				<h2>
					Cancellation ledger{' '}
					<span className="mini">
						our own append-only record, diffed hourly from Boulevard, catches
						cancellations Boulevard later deletes
					</span>
				</h2>
				{ledger.length === 0 ? (
					<p className="note">
						No cancellations, no-shows, or removals detected in this window. The
						ledger starts recording from its first sync, so it has no history
						from before it was deployed.
					</p>
				) : (
					<div className="rtable-wrap">
						<table className="rtable">
							<thead>
								<tr>
									<th>Detected</th>
									<th>What</th>
									<th>Client</th>
									<th>Service</th>
									<th>Appt was for</th>
									<th className="num">Value at risk</th>
									<th>Detail</th>
								</tr>
							</thead>
							<tbody>
								{ledger.map((e, i) => (
									<tr key={i}>
										<td>{e.detected_at}</td>
										<td className={e.kind === 'removed' ? 'bad' : ''}>{e.kind}</td>
										<td>{e.client_name ?? '-'}</td>
										<td>{e.services || '-'}</td>
										<td>{e.start_at ?? '-'}</td>
										<td className="num">
											{e.expected_usd != null ? usd(Number(e.expected_usd)) : '-'}
										</td>
										<td>{e.detail ?? '-'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</ReportPage>
	)
}
