export const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'hitchcox'
export const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? 'site'

// Relative to process.cwd(); emitted by `pnpm run build:temporal` and copied
// into the production image alongside the rest of the /build output.
export const WORKFLOW_BUNDLE_PATH = 'build/temporal/workflow-bundle.js'
