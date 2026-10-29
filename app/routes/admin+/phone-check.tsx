import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useLoaderData, useNavigation } from '@remix-run/react'

import { StatusButton } from '#app/components/ui/status-button.tsx'
import { runPhoneCheckJob } from '#app/utils/background-jobs.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import {
	type CheckStatus,
	readPhoneCheckState,
} from '#app/utils/phone-check.server.ts'

const etTime = (iso: string) =>
	new Date(iso).toLocaleString('en-US', {
		timeZone: 'America/New_York',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const { runs } = await readPhoneCheckState()
	// Times are formatted here, in ET, so the server and the browser agree.
	return json({
		runs: runs.map(run => ({
			when: `${etTime(run.ranAt)} ET`,
			rows: run.rows,
			failed: run.rows.filter(r => r.status === 'fail'),
			skipped: run.rows.filter(r => r.status === 'skip').length,
			passed: run.rows.filter(r => r.status === 'ok').length,
		})),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	await runPhoneCheckJob()
	return json({ ok: true })
}

const BADGE: Record<CheckStatus, { label: string; className: string }> = {
	ok: { label: 'OK', className: 'bg-muted text-muted-foreground' },
	fail: { label: 'Failed', className: 'bg-destructive text-destructive-foreground' },
	skip: { label: 'Not checked', className: 'bg-secondary text-secondary-foreground' },
}

export default function PhoneCheckPage() {
	const { runs } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const running = navigation.state !== 'idle' && navigation.formMethod === 'POST'
	const last = runs[0]

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="max-w-3xl space-y-1">
					<h2 className="text-2xl font-semibold text-foreground">Phone check</h2>
					<p className="text-sm text-muted-foreground">
						Each day at 8 AM ET, this checks the phone path of each brand: the AI
						agent and its number, the calls of yesterday, the CallRail numbers, the
						RingCentral queue, and the voicemail emails. When a check fails, Zane
						gets a text, one time each day for each check.
					</p>
				</div>
				<Form method="post">
					<StatusButton type="submit" status={running ? 'pending' : 'idle'} disabled={running}>
						Run now
					</StatusButton>
				</Form>
			</div>

			{last ? (
				<section className="rounded-lg border border-border bg-card text-card-foreground">
					<div className="border-b border-border px-4 py-3">
						<h3 className="font-semibold">Last run: {last.when}</h3>
						<p className="text-sm text-muted-foreground">
							{last.passed} passed, {last.failed.length} failed, {last.skipped} not
							checked.
						</p>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border text-left text-muted-foreground">
									<th className="px-4 py-2 font-medium">Brand</th>
									<th className="px-4 py-2 font-medium">Check</th>
									<th className="px-4 py-2 font-medium">Result</th>
									<th className="px-4 py-2 font-medium">Detail</th>
								</tr>
							</thead>
							<tbody>
								{last.rows.map(r => (
									<tr key={`${r.brand}|${r.check}`} className="border-b border-border last:border-0">
										<td className="whitespace-nowrap px-4 py-2">{r.brand}</td>
										<td className="whitespace-nowrap px-4 py-2">{r.check}</td>
										<td className="px-4 py-2">
											<span
												className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${BADGE[r.status].className}`}
											>
												{BADGE[r.status].label}
											</span>
										</td>
										<td className="px-4 py-2">{r.detail}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			) : (
				<p className="text-sm text-muted-foreground">
					The check has not run yet. Select Run now.
				</p>
			)}

			{runs.length > 0 ? (
				<section className="rounded-lg border border-border bg-card text-card-foreground">
					<div className="border-b border-border px-4 py-3">
						<h3 className="font-semibold">History</h3>
						<p className="text-sm text-muted-foreground">
							{runs.length === 1 ? 'The last run.' : `The last ${runs.length} runs.`}
						</p>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border text-left text-muted-foreground">
									<th className="px-4 py-2 font-medium">Run</th>
									<th className="px-4 py-2 font-medium">Passed</th>
									<th className="px-4 py-2 font-medium">Failed</th>
									<th className="px-4 py-2 font-medium">Not checked</th>
									<th className="px-4 py-2 font-medium">Failed checks</th>
								</tr>
							</thead>
							<tbody>
								{runs.map(run => (
									<tr key={run.when} className="border-b border-border last:border-0">
										<td className="whitespace-nowrap px-4 py-2">{run.when}</td>
										<td className="px-4 py-2">{run.passed}</td>
										<td className={`px-4 py-2 ${run.failed.length ? 'font-semibold text-destructive' : ''}`}>
											{run.failed.length}
										</td>
										<td className="px-4 py-2">{run.skipped}</td>
										<td className="px-4 py-2">
											{run.failed.map(r => `${r.brand}: ${r.check}`).join('; ') || '-'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			) : null}
		</div>
	)
}
