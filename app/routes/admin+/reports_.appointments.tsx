/**
 * Appointment performance data (resource route, no page): expected vs actual
 * per appointment plus the append-only change ledger. Rendered inside the
 * Revenue report, which fetches this loader with the page's date window.
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { loadAppointmentPerformance } from '#app/utils/appointment-performance.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { parseReportWindow } from '#app/utils/revenue-by-source.server.ts'
import { hasReportsDb, reportsQuery } from '#app/utils/reports-db.server'

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
