import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env.ts'

class FakeChild extends EventEmitter {
	pid = 0
	kill = vi.fn(() => true)
}

const spawned: FakeChild[] = []
vi.mock('node:child_process', () => ({
	spawn: () => {
		const child = new FakeChild()
		child.pid = 1000 + spawned.length
		spawned.push(child)
		return child
	},
}))
vi.mock('node:fs', async importOriginal => ({
	...(await importOriginal<typeof import('node:fs')>()),
	existsSync: () => true,
}))

const TEN_MINUTES = 10 * 60_000

async function loadSupervisor() {
	vi.resetModules()
	return import('./worker.server.ts')
}

beforeEach(() => {
	spawned.length = 0
	vi.useFakeTimers()
	vi.spyOn(console, 'log').mockImplementation(() => {})
	consoleError.mockImplementation(() => {})
})

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

test('a paused worker is not restarted, although its clean exit looks like any exit', async () => {
	const supervisor = await loadSupervisor()
	await supervisor.startTemporalWorker('temporal:7233')
	expect(spawned).toHaveLength(1)

	supervisor.pauseTemporalWorker()
	expect(spawned[0]!.kill).toHaveBeenCalledWith('SIGTERM')
	// The worker handles SIGTERM and exits with code 0 and no signal.
	spawned[0]!.emit('exit', 0, null)
	await vi.advanceTimersByTimeAsync(TEN_MINUTES)

	expect(spawned).toHaveLength(1)
	expect(supervisor.isTemporalWorkerRunning()).toBe(false)
})

test('a crash is restarted after the backoff', async () => {
	const supervisor = await loadSupervisor()
	await supervisor.startTemporalWorker('temporal:7233')

	spawned[0]!.emit('exit', 1, null)
	expect(spawned).toHaveLength(1)
	await vi.advanceTimersByTimeAsync(5_000)

	expect(spawned).toHaveLength(2)
})

test('the worker runs again when the machine is the primary again', async () => {
	const supervisor = await loadSupervisor()
	await supervisor.startTemporalWorker('temporal:7233')
	supervisor.pauseTemporalWorker()
	spawned[0]!.emit('exit', 0, null)

	await supervisor.startTemporalWorker('temporal:7233')

	expect(spawned).toHaveLength(2)
	expect(supervisor.isTemporalWorkerRunning()).toBe(true)
})

test('a restart that waits on its timer does not start a worker on a replica', async () => {
	const supervisor = await loadSupervisor()
	await supervisor.startTemporalWorker('temporal:7233')
	spawned[0]!.emit('exit', 1, null)

	// No child runs now. The reconcile loop still says: not the primary.
	supervisor.pauseTemporalWorker()
	await vi.advanceTimersByTimeAsync(TEN_MINUTES)

	expect(spawned).toHaveLength(1)
})

test('a start during the backoff does not end with two workers', async () => {
	const supervisor = await loadSupervisor()
	await supervisor.startTemporalWorker('temporal:7233')
	spawned[0]!.emit('exit', 1, null)

	await supervisor.startTemporalWorker('temporal:7233')
	await vi.advanceTimersByTimeAsync(TEN_MINUTES)

	expect(spawned).toHaveLength(2)
})

test('a stop on deploy is not restarted', async () => {
	const supervisor = await loadSupervisor()
	await supervisor.startTemporalWorker('temporal:7233')

	supervisor.stopTemporalWorker()
	spawned[0]!.emit('exit', 0, null)
	await vi.advanceTimersByTimeAsync(TEN_MINUTES)

	expect(spawned).toHaveLength(1)
})
