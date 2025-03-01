import { exec } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { json } from '@remix-run/node'
import { Form, useLoaderData } from '@remix-run/react'
import { useState, useEffect } from 'react'

import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'

// Define the Route type for this file
export interface Route {
	LoaderArgs: { request: Request }
	ActionArgs: { request: Request }
}

// Background job types and interfaces
interface JobStatus {
	id: string
	name: string
	status: 'idle' | 'running' | 'completed' | 'failed'
	lastRun: string | null
	nextRun: string | null
	lastRunDuration: number | null
	lastError: string | null
}

// Global job status tracking - in a real app, this should be in a database
let jobStatuses: Record<string, JobStatus> = {
	invoiceDownload: {
		id: 'invoiceDownload',
		name: 'Invoice Download',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
	invoiceAnalysis: {
		id: 'invoiceAnalysis',
		name: 'Invoice Analysis',
		status: 'idle',
		lastRun: null,
		nextRun: null,
		lastRunDuration: null,
		lastError: null,
	},
}

// Keep track of the interval IDs so we can clear them if needed
let jobIntervals: Record<string, NodeJS.Timeout> = {}

// Initialize background jobs when the server starts
let isInitialized = false

// Helper to run shell commands
const execAsync = promisify(exec)

// Run the download invoices job
async function runInvoiceDownloadJob(): Promise<void> {
	const job = jobStatuses['invoiceDownload']
	if (!job) return

	// If already running, don't start again
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		// Path to the download-invoices script
		const scriptPath = path.join(
			process.cwd(),
			'scripts',
			'download-invoices.js',
		)

		// Execute the script
		const { stdout, stderr } = await execAsync(`node ${scriptPath}`)

		if (stderr) {
			console.error('Invoice download error:', stderr)
			job.status = 'failed'
			job.lastError = stderr
		} else {
			console.log('Invoice download completed:', stdout)
			job.status = 'completed'
			job.lastError = null

			// After successful download, trigger the analysis job
			await runInvoiceAnalysisJob()
		}
	} catch (error) {
		console.error('Invoice download failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
	}
}

// Run the invoice analysis job
async function runInvoiceAnalysisJob(): Promise<void> {
	const job = jobStatuses['invoiceAnalysis']
	if (!job) return

	// If already running, don't start again
	if (job.status === 'running') return

	const startTime = Date.now()
	job.status = 'running'
	job.lastRun = new Date().toISOString()

	try {
		// Path to the analyze script
		const scriptPath = path.join(process.cwd(), 'scripts', 'analyze.js')

		// Execute the script
		const { stderr } = await execAsync(`node ${scriptPath}`)

		if (stderr && !stderr.includes('Warning')) {
			console.error('Invoice analysis error:', stderr)
			job.status = 'failed'
			job.lastError = stderr
		} else {
			console.log('Invoice analysis completed')
			job.status = 'completed'
			job.lastError = null
		}
	} catch (error) {
		console.error('Invoice analysis failed:', error)
		job.status = 'failed'
		job.lastError = error instanceof Error ? error.message : String(error)
	} finally {
		job.lastRunDuration = Date.now() - startTime
		job.nextRun = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
	}
}

// Initialize the background jobs scheduler
function initializeBackgroundJobs() {
	if (isInitialized) return

	console.log('Initializing background jobs...')

	// Schedule the invoice download job to run every hour
	jobIntervals.invoiceDownload = setInterval(
		() => {
			runInvoiceDownloadJob().catch(console.error)
		},
		60 * 60 * 1000,
	) // 1 hour

	// Set the next run time
	const invoiceDownload = jobStatuses['invoiceDownload']
	const invoiceAnalysis = jobStatuses['invoiceAnalysis']

	if (invoiceDownload) {
		invoiceDownload.nextRun = new Date(
			Date.now() + 60 * 60 * 1000,
		).toISOString()
	}

	if (invoiceAnalysis) {
		invoiceAnalysis.nextRun = new Date(
			Date.now() + 60 * 60 * 1000,
		).toISOString()
	}

	isInitialized = true
	console.log('Background jobs initialized')
}

// Initialize when this module is loaded
initializeBackgroundJobs()

// Handle actions from the admin UI
export async function action({ request }: Route['ActionArgs']) {
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
		if (jobStatuses[jobId]) {
			jobStatuses[jobId].lastError = null
			return json({
				success: true,
				message: `Cleared error for ${jobStatuses[jobId].name}`,
			})
		}
	}

	return json({ success: false, message: 'Unknown action' }, { status: 400 })
}

// Provide the current status to the UI
export async function loader() {
	return json({
		jobStatuses: Object.values(jobStatuses),
	})
}

// Define a loader type
type LoaderData = {
	jobStatuses: JobStatus[]
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
