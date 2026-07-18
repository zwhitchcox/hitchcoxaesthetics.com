/**
 * Appointment performance — every appointment in the window with expected vs
 * actual revenue and a plain reason, worst first, so underperformers (and the
 * why: cancellation, no-show, membership visit, light ticket) are visible
 * individually instead of hiding inside daily aggregates.
 */
import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node'
import { Form, useLoaderData, useSubmit } from '@remix-run/react'
import { ReportPage, StatTile, usd } from '#app/components/report-ui'
import {
	loadAppointmentPerformance,
	type AppointmentPerformanceRow,
} from '#app/utils/appointment-performance.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

export const meta: MetaFunction = () => [
	{ title: 'Appointment performance' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const dayToDate = (day: string, endOfDay = false) =>
	new Date(`${day}T${endOfDay ? '23:59:59' : '00:00:00'}-04:00`)

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const params = new URL(request.url).searchParams
	const today = new Date().toLocaleDateString('en-CA', {
		timeZone: 'America/New_York',
	})
	const defaultFrom = new Date(Date.now() - 13 * 24 * 3600 * 1000).toLocaleDateString(
		'en-CA',
		{ timeZone: 'America/New_York' },
	)
	const from = DAY_RE.test(params.get('from') ?? '') ? params.get('from')! : defaultFrom
	const to = DAY_RE.test(params.get('to') ?? '') ? params.get('to')! : today
	const rows = await loadAppointmentPerformance(dayToDate(from), dayToDate(to, true))
	return json({ from, to, rows })
}

const STATUS_LABEL: Record<AppointmentPerformanceRow['status'], string> = {
	completed: 'Completed',
	cancelled: 'Cancelled',
	no_show: 'No-show',
	upcoming: 'Upcoming',
}

export default function AppointmentPerformance() {
	const { from, to, rows } = useLoaderData<typeof loader>()
	const submit = useSubmit()
	const happened = rows.filter(r => r.status !== 'upcoming')
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
			subtitle="Expected vs actual per appointment, worst first. Expected = booked price, or the service's 90-day average paid ticket when booked at $0."
		>
			<Form method="get" className="controls" onChange={e => submit(e.currentTarget)}>
				<label htmlFor="from">From</label>
				<input id="from" type="date" name="from" defaultValue={from} />
				<label htmlFor="to">to</label>
				<input id="to" type="date" name="to" defaultValue={to} />
			</Form>

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
								<th>When</th>
								<th>Client</th>
								<th>Service</th>
								<th>Status</th>
								<th className="num">Expected</th>
								<th className="num">Actual</th>
								<th className="num">Δ</th>
								<th>Why</th>
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
									</td>
									<td>{r.services.join(' + ') || '—'}</td>
									<td>{STATUS_LABEL[r.status]}</td>
									<td className="num">{usd(r.expectedUsd)}</td>
									<td className="num">{r.status === 'upcoming' ? '—' : usd(r.actualUsd)}</td>
									<td className={`num ${r.deltaUsd < -50 ? 'bad' : r.deltaUsd > 50 ? 'good' : ''}`}>
										{r.status === 'upcoming' ? '—' : usd(r.deltaUsd)}
									</td>
									<td>{r.reason}</td>
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
		</ReportPage>
	)
}
