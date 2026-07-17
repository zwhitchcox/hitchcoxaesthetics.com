/**
 * Standalone Temporal worker process. Bundled by other/build-temporal.ts into
 * build/temporal/worker.js and spawned as a supervised CHILD PROCESS by
 * app/temporal/worker.server.ts — a worker crash can never take down the web
 * server. Runs on the same machine as the web app because activities write to
 * SQLite through LiteFS, which only the primary machine can do.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { NativeConnection, Worker } from '@temporalio/worker'

import { createActivities } from './activities.server.ts'
import {
	TEMPORAL_NAMESPACE,
	TEMPORAL_TASK_QUEUE,
	WORKFLOW_BUNDLE_PATH,
} from './config.server.ts'

// Build-time smoke mode (Dockerfile RUN step): reaching this line means the
// entire import graph — including native modules — loaded in this image.
if (process.env.TEMPORAL_SMOKE === '1') {
	console.log('[temporal-worker] smoke OK: import graph loads')
	process.exit(0)
}

const address = process.env.TEMPORAL_ADDRESS?.trim()
if (!address) {
	console.error('[temporal-worker] TEMPORAL_ADDRESS is not set; exiting')
	process.exit(2)
}

const connection = await NativeConnection.connect({ address })

const bundlePath = path.join(process.cwd(), WORKFLOW_BUNDLE_PATH)
const workflowSource = existsSync(bundlePath)
	? { workflowBundle: { codePath: bundlePath } }
	: // Dev fallback: bundle the workflow source at worker startup.
		{ workflowsPath: path.join(process.cwd(), 'app/temporal/workflows.ts') }

const worker = await Worker.create({
	connection,
	namespace: TEMPORAL_NAMESPACE,
	taskQueue: TEMPORAL_TASK_QUEUE,
	activities: createActivities(),
	...workflowSource,
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
	process.on(signal, () => {
		console.log(`[temporal-worker] ${signal} received, shutting down`)
		worker.shutdown()
	})
}

console.log(
	`[temporal-worker] started (namespace=${TEMPORAL_NAMESPACE}, taskQueue=${TEMPORAL_TASK_QUEUE})`,
)
await worker.run()
console.log('[temporal-worker] shut down cleanly')
