import path from 'path'
import { fileURLToPath } from 'url'
import { bundleWorkflowCode } from '@temporalio/worker'
import esbuild from 'esbuild'
import fsExtra from 'fs-extra'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const here = (...s: Array<string>) => path.join(__dirname, ...s)

console.log('bundling temporal workflows...')

const { code } = await bundleWorkflowCode({
	workflowsPath: here('../app/temporal/workflows.ts'),
})

const outPath = here('../build/temporal/workflow-bundle.js')
await fsExtra.outputFile(outPath, code)
console.log(`wrote ${outPath}`)

// The worker runs as a supervised child process (see app/temporal/worker.server.ts):
// bundle its entry self-contained except for bare imports, which resolve from
// node_modules at runtime (native modules can't be bundled).
console.log('bundling temporal worker process...')
await esbuild.build({
	entryPoints: [here('../app/temporal/worker-process.ts')],
	outfile: here('../build/temporal/worker.js'),
	bundle: true,
	packages: 'external',
	platform: 'node',
	format: 'esm',
	sourcemap: true,
	logLevel: 'info',
})
console.log(`wrote ${here('../build/temporal/worker.js')}`)
