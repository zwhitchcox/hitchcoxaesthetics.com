import { json } from '@remix-run/node'
import {
	Form,
	useLoaderData,
	useRouteError,
	isRouteErrorResponse,
} from '@remix-run/react'
import { useState, useEffect } from 'react'

import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	type JobStatus,
	runInvoiceDownloadJob,
	runInvoiceAnalysisJob,
	getJobStatuses,
	clearJobError,
} from '#app/utils/background-jobs.server'
import { requireUserWithRole } from '#app/utils/permissions.server'

// Define the Route type for this file
export interface Route {
	LoaderArgs: { request: Request }
	ActionArgs: { request: Request }
}

// Maps the job status to the StatusButton status
function mapJobStatusToButtonStatus(
	status: JobStatus['status'],
): 'idle' | 'pending' | 'success' | 'error' {
	switch (status) {
		case 'running':
			return 'pending'
		case 'completed':
			return 'success'
		case 'failed':
			return 'error'
		default:
			return 'idle'
	}
}

// Handle actions from the admin UI
export async function action({ request }: Route['ActionArgs']) {
	// Require admin role before allowing any actions
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'run-invoiceDownload') {
		runInvoiceDownloadJob().catch(console.error)
		return json({ success: true, message: 'Invoice download job started' })
	}

	if (intent === 'run-invoiceAnalysis') {
		runInvoiceAnalysisJob().catch(console.error)
		return json({ success: true, message: 'Invoice analysis job started' })
	}

	if (intent?.toString().startsWith('clear-error-')) {
		const jobId = intent.toString().replace('clear-error-', '')
		const success = clearJobError(jobId)
		if (success) {
			return json({
				success: true,
				message: `Cleared error for job ${jobId}`,
			})
		}
	}

	return json({ success: false, message: 'Unknown action' }, { status: 400 })
}

// Provide the current status to the UI
export async function loader({ request }: Route['LoaderArgs']) {
	// Require admin role before showing background jobs status
	await requireUserWithRole(request, 'admin')

	return json({
		jobStatuses: getJobStatuses(),
	})
}

// Define a loader type
type LoaderData = {
	jobStatuses: JobStatus[]
}

// Admin background jobs UI component
export default function BackgroundJobsAdmin() {
	const { jobStatuses } = useLoaderData<LoaderData>()
	const [, setRefreshCounter] = useState(0)

	// Auto-refresh the status every 5 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			setRefreshCounter(c => c + 1)
		}, 5000)

		return () => clearInterval(interval)
	}, [])

	return (
		<div className="container py-10">
			<h1 className="mb-6 text-3xl font-semibold tracking-tight">
				Background Jobs
			</h1>

			<div className="mb-8 space-y-4">
				<h2 className="text-xl font-medium tracking-tight">Job Status</h2>
				<div className="rounded-md border bg-card text-card-foreground shadow">
					<div className="overflow-x-auto">
						<table className="w-full caption-bottom">
							<thead className="[&_tr]:border-b">
								<tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
									<th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
										Job Name
									</th>
									<th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
										Status
									</th>
									<th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
										Last Run
									</th>
									<th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
										Next Run
									</th>
									<th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
										Duration
									</th>
									<th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="[&_tr:last-child]:border-0">
								{jobStatuses.map((job: JobStatus) => (
									<>
										<tr
											key={job.id}
											className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
										>
											<td className="p-4 align-middle">{job.name}</td>
											<td className="p-4 align-middle">
												<div className="inline-flex h-9 items-center justify-center rounded-md px-3 text-xs font-medium">
													<StatusButton
														status={mapJobStatusToButtonStatus(job.status)}
														className={`h-auto px-2 py-1 text-xs ${
															job.status === 'idle'
																? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
																: ''
														}`}
													>
														{job.status}
													</StatusButton>
												</div>
											</td>
											<td className="p-4 align-middle">
												{job.lastRun
													? new Date(job.lastRun).toLocaleString()
													: 'Never'}
											</td>
											<td className="p-4 align-middle">
												{job.nextRun
													? new Date(job.nextRun).toLocaleString()
													: 'Not scheduled'}
											</td>
											<td className="p-4 align-middle">
												{job.lastRunDuration
													? `${(job.lastRunDuration / 1000).toFixed(2)} sec`
													: '-'}
											</td>
											<td className="p-4 align-middle">
												<Form method="post">
													<input
														type="hidden"
														name="intent"
														value={`run-${job.id}`}
													/>
													<Button
														type="submit"
														size="sm"
														disabled={job.status === 'running'}
													>
														Run Now
													</Button>
												</Form>
											</td>
										</tr>
										{job.lastError && (
											<tr key={`${job.id}-error-row`} className="bg-muted/50">
												<td colSpan={6} className="p-0">
													<div className="m-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive dark:border-destructive/30 dark:bg-destructive/20">
														<div className="flex items-center justify-between">
															<h3 className="font-medium text-destructive">
																Error:
															</h3>
															<Form method="post">
																<input
																	type="hidden"
																	name="intent"
																	value={`clear-error-${job.id}`}
																/>
																<Button
																	type="submit"
																	size="sm"
																	variant="ghost"
																	className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
																>
																	Clear
																</Button>
															</Form>
														</div>
														<pre className="mt-2 max-h-[10rem] overflow-auto rounded-md bg-muted p-2 text-xs">
															{job.lastError}
														</pre>
													</div>
												</td>
											</tr>
										)}
									</>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			<div className="mb-8 space-y-4">
				<h2 className="text-xl font-medium tracking-tight">System Log</h2>
				<div className="rounded-md border bg-card p-4 text-card-foreground shadow">
					<div className="flex h-64 flex-col space-y-2 overflow-auto rounded-md bg-muted p-3 font-mono text-sm">
						<div className="text-muted-foreground">
							Initialized background jobs system...
						</div>
						<div className="text-muted-foreground">
							System ready and waiting for scheduled jobs
						</div>
						{/* Simulated log entries that would come from actual log data */}
						{jobStatuses.some((job: JobStatus) => job.lastRun) && (
							<>
								{jobStatuses
									.filter((job: JobStatus) => job.lastRun)
									.sort((a: JobStatus, b: JobStatus) =>
										a.lastRun && b.lastRun
											? new Date(b.lastRun).getTime() -
												new Date(a.lastRun).getTime()
											: 0,
									)
									.map((job: JobStatus) => (
										<div
											key={`log-${job.id}`}
											className={
												job.status === 'failed' ? 'text-destructive' : ''
											}
										>
											[
											{job.lastRun
												? new Date(job.lastRun).toLocaleString()
												: ''}
											] {job.name} job {job.status}
											{job.status === 'completed' && ' successfully'}
											{job.status === 'failed' &&
												` - ${job.lastError?.split('\n')[0]}`}
										</div>
									))}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

// Add an error boundary component to handle permission errors
export function ErrorBoundary() {
	const error = useRouteError()

	if (isRouteErrorResponse(error) && error.status === 403) {
		return (
			<div className="container py-10">
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-destructive">
					<h1 className="mb-4 text-xl font-bold">Access Denied</h1>
					<p>You don't have permission to access this page.</p>
					<p className="mt-2">Required role: admin</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => (window.location.href = '/')}
					>
						Return to Home
					</Button>
				</div>
			</div>
		)
	}

	// For any other type of error
	return (
		<div className="container py-10">
			<div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-destructive">
				<h1 className="mb-4 text-xl font-bold">Error</h1>
				<p>An unexpected error occurred. Please try again later.</p>
				<Button
					variant="outline"
					className="mt-4"
					onClick={() => (window.location.href = '/')}
				>
					Return to Home
				</Button>
			</div>
		</div>
	)
}
