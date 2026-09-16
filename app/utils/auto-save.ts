/**
 * Auto-save for the article editor: the working copy saves itself through
 * /resources/article-save. No JSX here; the editor renders the mark.
 *
 * `schedule(body)` for a typed change (debounced), `saveNow(body, 'ai')`
 * for a change that must land at once (an Undo), `flush()` before Approve
 * or before a chat turn, `markSaved(body, hash)` when another request
 * saved the text already (the chat), `raiseConflict()` when another
 * request met a 409 `changed`. One save in flight at a time; a change
 * during a flight runs one more save after it. A 409 `changed` never
 * loses her copy: it stays in `conflict` until `keepMine()` or
 * `useTheirs()`.
 */
import { useNavigation, useSubmit } from '@remix-run/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	ARTICLE_SAVE_KEEPALIVE_MAX_BYTES,
	saveArticleBody,
} from '#app/utils/article-edit.ts'

/** A typed change saves this long after the last keystroke. */
export const AUTO_SAVE_DEBOUNCE_MS = 1500
/** One retry after a failed save, this long later. */
export const AUTO_SAVE_RETRY_MS = 3000
/** Approve and a chat send wait at most this long for a save in flight. */
export const AUTO_SAVE_WAIT_MS = 3000

export const AUTO_SAVE_COPY = {
	decided: 'This one is already decided. Reopen it first.',
} as const

export type SaveStatus =
	/** Nothing changed this visit. No mark. */
	| 'clean'
	| 'saved'
	/** A typed change waits for the debounce. */
	| 'pending'
	| 'saving'
	/** The last save failed. One retry is scheduled, then Try now. */
	| 'error'
	/** The writer's text moved on. Her copy waits for Use the new text / Keep mine. */
	| 'conflict'

export type SaveConflict = { body: string; hash: string }

/** What one save flight ended with. `skipped` means there was nothing to save. */
export type SaveFlightOutcome =
	| 'saved'
	| 'same'
	| 'changed'
	| 'decided'
	| 'error'
	| 'skipped'

export type SaveSource = 'auto' | 'ai'

/** True while a save is still owed: pending, in flight, failed, or a conflict waits. */
export function isOwed(status: SaveStatus): boolean {
	return (
		status === 'pending' ||
		status === 'saving' ||
		status === 'error' ||
		status === 'conflict'
	)
}

export function useAutoSave({
	articleId,
	initialBody,
	savedHash,
	enabled = true,
	onSaved,
}: {
	articleId: string
	initialBody: string
	savedHash: string
	enabled?: boolean
	onSaved?: (hash: string, body: string) => void
}) {
	const [status, setStatus] = useState<SaveStatus>('clean')
	const [hash, setHash] = useState(savedHash)
	const [conflict, setConflict] = useState<SaveConflict | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const hashRef = useRef(savedHash)
	const lastSavedRef = useRef(initialBody)
	const everSavedRef = useRef(false)
	const pendingRef = useRef<{ body: string; source: SaveSource } | null>(null)
	const inFlightRef = useRef<Promise<SaveFlightOutcome> | null>(null)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const retriedRef = useRef(false)
	const conflictRef = useRef<SaveConflict | null>(null)
	const onSavedRef = useRef(onSaved)
	onSavedRef.current = onSaved

	const clearTimer = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = null
	}, [])

	const settle = useCallback((body: string, nextHash: string) => {
		lastSavedRef.current = body
		hashRef.current = nextHash
		everSavedRef.current = true
		retriedRef.current = false
		conflictRef.current = null
		if (pendingRef.current?.body === body) pendingRef.current = null
		setHash(nextHash)
		setConflict(null)
		setMessage(null)
		setStatus('saved')
	}, [])

	/** What is owed right now, read from the refs (safe after an await). */
	const owedNow = useCallback((): boolean => {
		if (inFlightRef.current) return true
		if (conflictRef.current) return true
		const pending = pendingRef.current
		return pending !== null && pending.body !== lastSavedRef.current
	}, [])

	const run = useCallback(
		(keepalive = false): Promise<SaveFlightOutcome> => {
			if (!enabled) return Promise.resolve('skipped')
			if (inFlightRef.current) return inFlightRef.current
			if (conflictRef.current) return Promise.resolve('changed')
			const pending = pendingRef.current
			if (!pending || pending.body === lastSavedRef.current) {
				if (pending) pendingRef.current = null
				setStatus(current =>
					current === 'pending' || current === 'error'
						? everSavedRef.current
							? 'saved'
							: 'clean'
						: current,
				)
				return Promise.resolve('skipped')
			}
			const useKeepalive =
				keepalive &&
				new Blob([pending.body]).size <= ARTICLE_SAVE_KEEPALIVE_MAX_BYTES
			setStatus('saving')
			const flight = (async (): Promise<SaveFlightOutcome> => {
				const result = await saveArticleBody(
					{
						articleId,
						body: pending.body,
						baseHash: hashRef.current,
						source: pending.source,
					},
					{ keepalive: useKeepalive },
				)
				inFlightRef.current = null
				if (result.ok) {
					settle(pending.body, result.hash)
					onSavedRef.current?.(result.hash, pending.body)
					// a change that arrived during the flight
					if (pendingRef.current && pendingRef.current.body !== pending.body) {
						void run()
					}
					return result.changed ? 'saved' : 'same'
				}
				if (result.kind === 'changed') {
					const found = { body: result.body, hash: result.hash }
					conflictRef.current = found
					setConflict(found)
					setStatus('conflict')
					return 'changed'
				}
				if (result.kind === 'decided') {
					retriedRef.current = true
					setMessage(AUTO_SAVE_COPY.decided)
					setStatus('error')
					return 'decided'
				}
				setMessage(null)
				setStatus('error')
				if (!retriedRef.current) {
					retriedRef.current = true
					retryRef.current = setTimeout(() => {
						retryRef.current = null
						void run()
					}, AUTO_SAVE_RETRY_MS)
				}
				return 'error'
			})()
			inFlightRef.current = flight
			return flight
		},
		[articleId, enabled, settle],
	)

	/** A typed change: save after the debounce. */
	const schedule = useCallback(
		(body: string) => {
			if (!enabled) return
			pendingRef.current = { body, source: 'auto' }
			clearTimer()
			if (conflictRef.current) return
			if (body === lastSavedRef.current) {
				setStatus(current =>
					current === 'saving'
						? current
						: everSavedRef.current
							? 'saved'
							: 'clean',
				)
				return
			}
			setStatus(current => (current === 'saving' ? current : 'pending'))
			timerRef.current = setTimeout(() => {
				timerRef.current = null
				void run()
			}, AUTO_SAVE_DEBOUNCE_MS)
		},
		[clearTimer, enabled, run],
	)

	/** An Undo or a restore: save at once. Resolves with what the flight ended with. */
	const saveNow = useCallback(
		(body: string, source: SaveSource = 'ai'): Promise<SaveFlightOutcome> => {
			if (!enabled) return Promise.resolve('skipped')
			pendingRef.current = { body, source }
			clearTimer()
			return run()
		},
		[clearTimer, enabled, run],
	)

	/**
	 * Cancel the debounce, save what waits, and wait for the flight
	 * (bounded). Resolves with whether a save is still owed and the hash to
	 * use next, read after the wait.
	 */
	const flush = useCallback(
		async (
			keepalive = false,
			waitMs = AUTO_SAVE_WAIT_MS,
		): Promise<{ owed: boolean; hash: string }> => {
			clearTimer()
			const flight = run(keepalive)
			await Promise.race([
				flight,
				new Promise<void>(resolve => setTimeout(resolve, waitMs)),
			])
			return { owed: owedNow(), hash: hashRef.current }
		},
		[clearTimer, owedNow, run],
	)

	/** Another request saved this text already (the chat). */
	const markSaved = useCallback(
		(body: string, nextHash: string) => {
			clearTimer()
			pendingRef.current = null
			settle(body, nextHash)
		},
		[clearTimer, settle],
	)

	/**
	 * Another request met a 409 `changed`. `herBody` is the working copy
	 * to keep; Keep mine saves it over the writer's text.
	 */
	const raiseConflict = useCallback(
		(found: SaveConflict, herBody: string, source: SaveSource = 'ai') => {
			clearTimer()
			pendingRef.current = { body: herBody, source }
			conflictRef.current = found
			setConflict(found)
			setStatus('conflict')
		},
		[clearTimer],
	)

	/** "Keep mine": save her copy over the writer's new text. */
	const keepMine = useCallback(() => {
		const found = conflictRef.current
		if (!found) return
		hashRef.current = found.hash
		setHash(found.hash)
		conflictRef.current = null
		setConflict(null)
		void run()
	}, [run])

	/** "Use the new text": drop her copy. Returns the writer's text to show. */
	const useTheirs = useCallback((): string | null => {
		const found = conflictRef.current
		if (!found) return null
		markSaved(found.body, found.hash)
		return found.body
	}, [markSaved])

	const tryNow = useCallback(() => {
		if (retryRef.current) clearTimeout(retryRef.current)
		retryRef.current = null
		void run()
	}, [run])

	/** The hash the next save must start from, read from the ref. */
	const getHash = useCallback(() => hashRef.current, [])

	// Save before the page goes away. The mirror covers a payload too big
	// for keepalive.
	useEffect(() => {
		if (!enabled) return
		const onHidden = () => {
			if (document.visibilityState === 'hidden') void flush(true, 0)
		}
		const onPageHide = () => void flush(true, 0)
		document.addEventListener('visibilitychange', onHidden)
		window.addEventListener('pagehide', onPageHide)
		return () => {
			document.removeEventListener('visibilitychange', onHidden)
			window.removeEventListener('pagehide', onPageHide)
			clearTimer()
			if (retryRef.current) clearTimeout(retryRef.current)
		}
	}, [enabled, flush, clearTimer])

	const owed = isOwed(status)

	return {
		status,
		hash,
		conflict,
		message,
		/** A save is still owed (or her copy waits on a conflict). */
		owed,
		/** The old name of `owed`, kept for callers that read it. */
		busy: owed,
		schedule,
		saveNow,
		flush,
		markSaved,
		raiseConflict,
		keepMine,
		useTheirs,
		tryNow,
		getHash,
	}
}

export type AutoSave = ReturnType<typeof useAutoSave>

/**
 * An onSubmit for the parent <Form>: wait for a save in flight, then
 * submit with the button that was pressed. Approve then carries the text
 * she sees, byte for byte.
 */
export function useSubmitAfterSave(
	flushRef: React.MutableRefObject<(() => Promise<void>) | null>,
) {
	const submit = useSubmit()
	return useCallback(
		async (event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault()
			const form = event.currentTarget
			const submitter = (event.nativeEvent as SubmitEvent).submitter
			const data = new FormData(form)
			if (submitter instanceof HTMLButtonElement && submitter.name) {
				data.set(submitter.name, submitter.value)
			}
			await flushRef.current?.()
			submit(data, { method: 'post' })
		},
		[flushRef, submit],
	)
}

/** True while the parent form submits (the leave guard stands down then). */
export function useFormSubmitting(): boolean {
	const navigation = useNavigation()
	return navigation.state !== 'idle'
}

/* ------------------------------------------------------------------------ */
/* Mirror: a copy of an unsaved working copy in sessionStorage             */
/* ------------------------------------------------------------------------ */

export function mirrorKey(articleId: string) {
	return `article-editor:${articleId}`
}

export function readMirror(articleId: string): string | null {
	try {
		return window.sessionStorage.getItem(mirrorKey(articleId))
	} catch {
		return null
	}
}

export function writeMirror(articleId: string, body: string | null) {
	try {
		if (body === null) window.sessionStorage.removeItem(mirrorKey(articleId))
		else window.sessionStorage.setItem(mirrorKey(articleId), body)
	} catch {
		// storage can be blocked; the beforeunload warning still stands
	}
}
