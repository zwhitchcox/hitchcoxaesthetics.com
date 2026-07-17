import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Supervises the Temporal worker as a CHILD PROCESS (built by
 * other/build-temporal.ts to build/temporal/worker.js) so a worker crash can
 * never take down the web server. Restarts with exponential backoff; a clean
 * shutdown (SIGTERM on deploy) is not restarted.
 */
const WORKER_ENTRY = 'build/temporal/worker.js'
const MIN_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000

let child: ChildProcess | null = null
let backoffMs = MIN_BACKOFF_MS
let stopped = false

export async function startTemporalWorker(address: string): Promise<void> {
	if (child) return
	const entry = path.join(process.cwd(), WORKER_ENTRY)
	if (!existsSync(entry)) {
		throw new Error(
			`Temporal worker bundle missing at ${entry} — run the build (build:temporal).`,
		)
	}
	spawnWorker(entry, address)
}

function spawnWorker(entry: string, address: string) {
	if (stopped) return
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
		if (stopped || signal === 'SIGTERM') {
			console.log('Temporal worker child exited (shutdown)')
			return
		}
		console.error(
			`Temporal worker child exited (code=${code}, signal=${signal}) — restarting in ${Math.round(backoffMs / 1000)}s. The web server is unaffected.`,
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
 * Stop the worker because this machine is no longer the LiteFS primary.
 * SIGTERM exits are not restarted by the supervisor, and `child` stays set
 * until the exit event fires, so startTemporalWorker() can't double-spawn;
 * the reconcile loop simply calls it again once the lease returns.
 */
export function pauseTemporalWorker() {
	if (!child) return
	console.log('Pausing Temporal worker — no longer the LiteFS primary')
	child.kill('SIGTERM')
}

export function isTemporalWorkerRunning() {
	return child != null
}
