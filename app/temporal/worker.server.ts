import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Supervises the Temporal worker as a CHILD PROCESS (built by
 * other/build-temporal.ts to build/temporal/worker.js) so a worker crash can
 * never take down the web server. Restarts with exponential backoff; a stop
 * or a pause is not restarted.
 *
 * The worker handles SIGTERM itself and then exits with code 0 and no signal.
 * So the exit event cannot tell a pause from a crash: the `paused` and
 * `stopped` flags do. (Until 2026-09-18 the exit signal was trusted. A paused
 * worker was restarted on the LiteFS replica every few minutes, its database
 * writes failed with "disk I/O error", and Temporal ran the job again.)
 */
const WORKER_ENTRY = 'build/temporal/worker.js'
const MIN_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000

let child: ChildProcess | null = null
let backoffMs = MIN_BACKOFF_MS
let stopped = false
/** True while this machine must not run a worker: it is a LiteFS replica. */
let paused = false

export async function startTemporalWorker(address: string): Promise<void> {
	paused = false
	if (child) return
	const entry = path.join(process.cwd(), WORKER_ENTRY)
	if (!existsSync(entry)) {
		throw new Error(
			`Temporal worker bundle missing at ${entry}, run the build (build:temporal).`,
		)
	}
	spawnWorker(entry, address)
}

function spawnWorker(entry: string, address: string) {
	// `child`: a restart timer can fire after the reconcile loop already
	// started a worker. A second spawn would lose the first child's handle.
	if (stopped || paused || child) return
	child = spawn(process.execPath, [entry], {
		env: { ...process.env, TEMPORAL_ADDRESS: address },
		stdio: ['ignore', 'inherit', 'inherit'],
	})
	console.log(`Temporal worker child process started (pid ${child.pid})`)

	// Reset backoff once the child survives its startup window.
	const settle = setTimeout(() => {
		backoffMs = MIN_BACKOFF_MS
	}, 60_000)

	child.on('exit', (code, signal) => {
		clearTimeout(settle)
		child = null
		if (stopped || paused || signal === 'SIGTERM') {
			console.log('Temporal worker child exited (shutdown)')
			return
		}
		console.error(
			`Temporal worker child exited (code=${code}, signal=${signal}), restarting in ${Math.round(backoffMs / 1000)}s. The web server is unaffected.`,
		)
		const delay = backoffMs
		backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
		setTimeout(() => spawnWorker(entry, address), delay).unref()
	})
}

export function stopTemporalWorker() {
	stopped = true
	child?.kill('SIGTERM')
}

/**
 * This machine is not the LiteFS primary: no worker may run here. Safe to call
 * on every reconcile tick. It also cancels a restart that waits on its timer.
 * `child` stays set until the exit event fires, so startTemporalWorker() can't
 * double-spawn; the reconcile loop calls it again once the lease returns.
 */
export function pauseTemporalWorker() {
	paused = true
	if (!child) return
	console.log('Pausing Temporal worker, no longer the LiteFS primary')
	child.kill('SIGTERM')
}

export function isTemporalWorkerRunning() {
	return child != null
}
