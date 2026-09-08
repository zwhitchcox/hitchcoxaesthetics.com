/**
 * Daily profit: was any given day actually profitable? Revenue minus
 * estimated COGS (per-line ratios fitted from real vendor spend / revenue),
 * minus actual Google Ads spend, minus overhead spread over Mon-Sat working
 * days only (a closed Sunday never reads as an unprofitable day).
 */
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { BarChart, ReportPage, StatTile, usd, usePersistedSearch } from '#app/components/report-ui'
import { WindowControls } from '#app/components/revenue-by-source.tsx'
import {
	computeDailyProfitModel,
	loadDailyProfitModel,
	loadDailyProfitRows,
} from '#app/utils/daily-profit.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { parseReportWindow } from '#app/utils/revenue-by-source.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const win = parseReportWindow(request, '30d')
	// Stored by the finance sync; computed live only before its first run.
	const model = (await loadDailyProfitModel()) ?? (await computeDailyProfitModel())
	const rows = await loadDailyProfitRows(win.fromDay, win.toDay, model)
	const todayEt = win.todayEt
	const done = rows.filter(r => r.day < todayEt)
	const workdays = done.filter(r => !r.isSunday)
	const profitable = workdays.filter(r => r.profitUsd > 0)
	const last7 = workdays.slice(-7)
	return json({
		configured: true as const,
		windowKey: win.windowKey,
		from: win.fromDay,
		to: win.toDay,
		todayEt,
		model,
		rows,
		profitableShare: workdays.length
			? Math.round((100 * profitable.length) / workdays.length)
			: null,
		last7Avg: last7.length
			? Math.round(last7.reduce((t, r) => t + r.profitUsd, 0) / last7.length)
			: null,
		windowTotal: Math.round(done.reduce((t, r) => t + r.profitUsd, 0)),
		windowAfterTax: Math.round(done.reduce((t, r) => t + r.afterTaxUsd, 0)),
	})
}

export default function DailyProfit() {
	usePersistedSearch()
	const data = useLoaderData<typeof loader>()
	const { model, rows, todayEt } = data
	const pct = (r: number) => `${Math.round(r * 100)}%`
	return (
		<ReportPage
			title="Daily profit"
			subtitle="revenue − estimated COGS − actual ad spend − overhead per working day (Mon–Sat)"
		>
			<WindowControls windowKey={data.windowKey} from={data.from} to={data.to} showGranularity={false} />
			<div className="tiles">
				<StatTile
					label="Window total"
					value={usd(data.windowTotal)}
					tone={data.windowTotal < 0 ? 'bad' : 'good'}
					whisper={`after taxes ${usd(data.windowAfterTax)} · completed days only`}
				/>
				<StatTile
					label="Avg last 7 workdays"
					value={data.last7Avg == null ? '-' : usd(data.last7Avg)}
					tone={data.last7Avg != null && data.last7Avg < 0 ? 'bad' : 'good'}
				/>
				<StatTile
					label="Profitable workdays"
					value={data.profitableShare == null ? '-' : `${data.profitableShare}%`}
					tone={
						data.profitableShare != null && data.profitableShare < 50
							? 'bad'
							: 'good'
					}
				/>
				<StatTile
					label="Overhead / workday"
					value={usd(model.overheadPerWorkdayUsd)}
					whisper={`${usd(model.overheadMonthlyUsd)}/mo over Mon–Sat`}
				/>
			</div>

			<section>
				<h2>
					Profit by day{' '}
					<span className="mini">Sundays carry no overhead (closed)</span>
				</h2>
				<BarChart
					labels={rows.map(r => r.day.slice(5))}
					series={[
						{
							name: 'Profit',
							color: 'var(--pos)',
							values: rows.map(r =>
								r.day >= todayEt ? null : r.isSunday && r.revenueUsd === 0 ? null : r.profitUsd,
							),
						},
					]}
					colorBy={v => (v >= 0 ? 'var(--pos)' : 'var(--neg)')}
					height={190}
				/>
			</section>

			<section>
				<h2>Daily breakdown</h2>
				<div className="rtable-wrap">
					<table className="rtable">
						<thead>
							<tr>
								<th>Day</th>
								<th className="num">Revenue</th>
								<th className="num">Est. COGS</th>
								<th className="num">Ads (actual)</th>
								<th className="num">Overhead</th>
								<th className="num">Profit</th>
								<th className="num">After taxes</th>
							</tr>
						</thead>
						<tbody>
							{[...rows].reverse().map(r => (
								<tr key={r.day} style={r.isSunday ? { opacity: 0.55 } : undefined}>
									<td>
										{r.day}
										{r.isSunday ? ' (closed)' : ''}
										{r.day >= todayEt ? ' (in progress)' : ''}
									</td>
									<td className="num">{usd(r.revenueUsd)}</td>
									<td className="num">− {usd(r.cogsUsd)}</td>
									<td className="num">
										{r.adsUsd == null ? '-' : `− ${usd(r.adsUsd)}`}
									</td>
									<td className="num">
										{r.overheadUsd ? `− ${usd(r.overheadUsd)}` : '-'}
									</td>
									<td className={`num ${r.profitUsd < 0 ? 'bad' : 'good'}`}>
										{usd(r.profitUsd)}
									</td>
									<td className={`num ${r.afterTaxUsd < 0 ? 'bad' : 'good'}`}>
										{usd(r.afterTaxUsd)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="note">
					COGS is estimated per service line from real purchasing since{' '}
					{model.ratioFrom}: injectables{' '}
					{pct(model.lines.injectables.ratio)} of revenue (
					{usd(model.lines.injectables.spendUsd)} spent /{' '}
					{usd(model.lines.injectables.revenueUsd)} earned), weight loss{' '}
					{pct(model.lines['weight-loss'].ratio)}, laser/skincare/other{' '}
					{pct(model.lines.other.ratio)}, plus{' '}
					{pct(model.generalCogs.ratio)} general supplies on all revenue.
					Overhead is every non-COGS, non-ads business expense over the last 3
					full months, spread across Mon–Sat working days. The ratios refresh
					with the finance sync, so the model follows real purchasing. After
					taxes applies the household accrual model: 30% of positive profit
					(federal + self-employment) plus 0.375% of gross receipts (TN
					business tax).
				</p>
			</section>
		</ReportPage>
	)
}
