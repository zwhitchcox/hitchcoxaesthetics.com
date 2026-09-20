/**
 * Read-aloud for the review pages, the same way as the read-along app on the
 * Mac mini: one paragraph at a time, the spoken word lit up, the next
 * paragraphs fetched while this one plays.
 *
 * The page's paragraphs are the `[data-paragraph]` blocks under
 * `containerRef`. Each block's spoken text is its visible text with the
 * spaces folded; the server narrates that text and returns word times. A
 * word is lit through the CSS Custom Highlight API, which touches no DOM
 * node, so it works inside the editor as well as on the reading page.
 *
 * Edits: a block whose text changed is narrated again, but not while she is
 * still typing in it (`isBlockBusy`) and not until the text has held still
 * for `stableMs`. A change the chat applies is a single change, so it is
 * fetched as soon as it has held still.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
	hasSpeech,
	normalizeNarrationText,
	type NarrationWord,
	wordAt,
} from '#app/utils/narration.ts'

export type NarrationStatus =
	| 'idle'
	| 'loading'
	| 'playing'
	| 'paused'
	| 'error'
	| 'unavailable'

export type NarrationState = {
	status: NarrationStatus
	/** The block being read, 0-based among the spoken blocks; -1 when none. */
	block: number
	blocks: number
	message: string | null
}

export type NarrationHandle = NarrationState & {
	/** Play from the first block on screen, pause, or resume. */
	toggle: () => void
	stop: () => void
}

type Options = {
	containerRef: React.RefObject<HTMLElement | null>
	/** Anything that changes when the text changes: the body string does. */
	version: unknown
	/** True while she is working in this block: its narration waits. */
	isBlockBusy?: (el: HTMLElement) => boolean
	/** How long the text must hold still before it is narrated. */
	stableMs?: number
}

type CharPlace = { node: Text; offset: number }

type Block = {
	el: HTMLElement
	text: string
	/** Where each character of `text` sits in the DOM. */
	places: CharPlace[]
}

type Narration = {
	audioUrl: string
	durationS: number
	words: NarrationWord[]
}

type CacheEntry =
	| { state: 'pending'; promise: Promise<void> }
	| { state: 'ready'; narration: Narration }
	| { state: 'error'; message: string; at: number }

const ENDPOINT = '/resources/article-narration'
const HIGHLIGHT = 'narration-word'
const PREFETCH = 2
const RETRY_MS = 15_000
const DEFAULT_STABLE_MS = 1500

/** Only one voice at a time across the page: starting one stops the others. */
let activeStop: (() => void) | null = null

/** Every narration ever fetched on this page, by spoken text. */
const cache = new Map<string, CacheEntry>()

/** The blocks with something to say, and where their characters live. */
function collectBlocks(root: HTMLElement): Block[] {
	const out: Block[] = []
	for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-paragraph]'))) {
		const { text, places } = collectText(el)
		if (hasSpeech(text)) out.push({ el, text, places })
	}
	return out
}

/**
 * The visible text of one block with spaces folded, plus each kept
 * character's text node and offset, so a word span maps back to a Range.
 */
function collectText(el: HTMLElement): { text: string; places: CharPlace[] } {
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement
			if (!parent) return NodeFilter.FILTER_REJECT
			// Hidden or presentational text is not spoken.
			if (parent.closest('[aria-hidden="true"], script, style, noscript, [data-narration-skip]')) {
				return NodeFilter.FILTER_REJECT
			}
			return NodeFilter.FILTER_ACCEPT
		},
	})
	let text = ''
	const places: CharPlace[] = []
	let pendingSpace = false
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const data = (node as Text).data
		for (let i = 0; i < data.length; i++) {
			const ch = data[i]!
			if (/\s/.test(ch)) {
				pendingSpace = text.length > 0
				continue
			}
			if (pendingSpace) {
				text += ' '
				places.push({ node: node as Text, offset: i })
				pendingSpace = false
			}
			text += ch
			places.push({ node: node as Text, offset: i })
		}
	}
	return { text: normalizeNarrationText(text), places: places.slice(0, text.length) }
}

function highlightsSupported(): boolean {
	return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

function lightWord(block: Block | null, word: NarrationWord | null) {
	if (!highlightsSupported()) return
	if (!block || !word) {
		CSS.highlights.delete(HIGHLIGHT)
		return
	}
	const from = block.places[word[0]]
	const to = block.places[word[1] - 1]
	if (!from || !to) return
	try {
		const range = document.createRange()
		range.setStart(from.node, from.offset)
		range.setEnd(to.node, to.offset + 1)
		CSS.highlights.set(HIGHLIGHT, new Highlight(range))
	} catch {
		CSS.highlights.delete(HIGHLIGHT)
	}
}

function fetchNarration(text: string): Promise<void> {
	const hit = cache.get(text)
	if (hit?.state === 'pending') return hit.promise
	if (hit?.state === 'ready') return Promise.resolve()
	if (hit?.state === 'error' && Date.now() - hit.at < RETRY_MS) return Promise.resolve()
	const promise = (async () => {
		try {
			const res = await fetch(ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text }),
			})
			const data = (await res.json().catch(() => null)) as
				| { audioUrl: string; durationS: number; words: NarrationWord[] }
				| { error: string }
				| null
			if (!res.ok || !data || 'error' in data) {
				const message = data && 'error' in data ? data.error : `Narration failed (${res.status}).`
				cache.set(text, { state: 'error', message, at: Date.now() })
				if (res.status === 503) cache.set(text, { state: 'error', message, at: Date.now() + 3_600_000 })
				return
			}
			cache.set(text, {
				state: 'ready',
				narration: { audioUrl: data.audioUrl, durationS: data.durationS, words: data.words },
			})
		} catch (error) {
			cache.set(text, {
				state: 'error',
				message: error instanceof Error ? error.message : 'Narration failed.',
				at: Date.now(),
			})
		}
	})()
	cache.set(text, { state: 'pending', promise })
	return promise
}

export function useNarration({
	containerRef,
	version,
	isBlockBusy,
	stableMs = DEFAULT_STABLE_MS,
}: Options): NarrationHandle {
	const [state, setState] = useState<NarrationState>({
		status: 'idle',
		block: -1,
		blocks: 0,
		message: null,
	})
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const blocksRef = useRef<Block[]>([])
	const curRef = useRef(-1)
	const playingRef = useRef(false)
	/** The text the current audio was made from; a change means re-narrate. */
	const playingTextRef = useRef<string | null>(null)
	const litBlockRef = useRef<HTMLElement | null>(null)
	const stableSinceRef = useRef(Date.now())
	const busyRef = useRef(isBlockBusy)
	busyRef.current = isBlockBusy
	const tickTimerRef = useRef<number | null>(null)
	const waitTimerRef = useRef<number | null>(null)

	const patch = useCallback((next: Partial<NarrationState>) => {
		setState(prev => ({ ...prev, ...next }))
	}, [])

	const markBlock = useCallback((el: HTMLElement | null) => {
		if (litBlockRef.current && litBlockRef.current !== el) {
			litBlockRef.current.removeAttribute('data-narrating')
		}
		if (el) el.setAttribute('data-narrating', '1')
		litBlockRef.current = el
	}, [])

	const refreshBlocks = useCallback(() => {
		const root = containerRef.current
		blocksRef.current = root ? collectBlocks(root) : []
		patch({ blocks: blocksRef.current.length })
		return blocksRef.current
	}, [containerRef, patch])

	/** A block may be narrated once its text has held still and nobody is typing in it. */
	const settled = useCallback(
		(block: Block) =>
			Date.now() - stableSinceRef.current >= stableMs &&
			!(busyRef.current?.(block.el) ?? false),
		[stableMs],
	)

	const prefetch = useCallback(
		(from: number) => {
			const blocks = blocksRef.current
			for (let i = from; i < Math.min(blocks.length, from + PREFETCH + 1); i++) {
				const block = blocks[i]!
				if (settled(block)) void fetchNarration(block.text)
			}
		},
		[settled],
	)

	const clearTimers = useCallback(() => {
		if (tickTimerRef.current != null) window.clearInterval(tickTimerRef.current)
		if (waitTimerRef.current != null) window.clearTimeout(waitTimerRef.current)
		tickTimerRef.current = null
		waitTimerRef.current = null
	}, [])

	const stop = useCallback(() => {
		const wasOn = playingRef.current || curRef.current >= 0
		playingRef.current = false
		playingTextRef.current = null
		clearTimers()
		const audio = audioRef.current
		if (audio) {
			try {
				audio.pause()
				audio.removeAttribute('src')
				audio.load()
			} catch {
				// a browser stand-in without media playback
			}
		}
		lightWord(null, null)
		markBlock(null)
		curRef.current = -1
		if (activeStop === stop) activeStop = null
		if (wasOn) patch({ status: 'idle', block: -1, message: null })
	}, [clearTimers, markBlock, patch])

	const tick = useCallback(() => {
		const audio = audioRef.current
		const block = blocksRef.current[curRef.current]
		const hit = block ? cache.get(block.text) : undefined
		if (!audio || !block || hit?.state !== 'ready') return
		const at = wordAt(hit.narration.words, audio.currentTime)
		lightWord(block, at >= 0 ? (hit.narration.words[at] ?? null) : null)
	}, [])

	/**
	 * Read block `i`: fetch it if needed, then play. While it is not ready
	 * (still narrating, or she is typing in it) the player waits and says so.
	 */
	const playBlock = useCallback(
		(i: number) => {
			const blocks = blocksRef.current
			if (i >= blocks.length) {
				stop()
				return
			}
			const block = blocks[i]!
			curRef.current = i
			markBlock(block.el)
			patch({ block: i, blocks: blocks.length })
			prefetch(i)
			const hit = cache.get(block.text)
			if (hit?.state === 'error') {
				// The voice failed for this paragraph: stop here and say why.
				lightWord(null, null)
				markBlock(null)
				playingRef.current = false
				clearTimers()
				patch({ status: 'error', message: hit.message })
				return
			}
			if (hit?.state !== 'ready') {
				lightWord(null, null)
				const busy = busyRef.current?.(block.el) ?? false
				patch({
					status: 'loading',
					message: busy
						? 'Waiting while you edit this paragraph'
						: 'Narrating this paragraph',
				})
				if (settled(block)) void fetchNarration(block.text)
				waitTimerRef.current = window.setTimeout(() => {
					if (playingRef.current && curRef.current === i) playBlock(i)
				}, 500)
				return
			}
			const audio = audioRef.current
			if (!audio) return
			playingTextRef.current = block.text
			audio.src = hit.narration.audioUrl
			audio.currentTime = 0
			patch({ status: 'playing', message: null })
			const el = block.el
			const rect = el.getBoundingClientRect()
			if (rect.top < 0 || rect.bottom > window.innerHeight) {
				el.scrollIntoView({ block: 'center', behavior: 'smooth' })
			}
			void audio.play().catch(() => {
				patch({ status: 'error', message: 'The browser would not play the audio.' })
				playingRef.current = false
			})
		},
		[clearTimers, markBlock, patch, prefetch, settled, stop],
	)

	/** The first block on screen, else the first block. */
	const firstVisible = useCallback(() => {
		const blocks = blocksRef.current
		const at = blocks.findIndex(b => b.el.getBoundingClientRect().bottom > 80)
		return at < 0 ? 0 : at
	}, [])

	// The latest callbacks, for listeners attached once to the audio element.
	const playBlockRef = useRef(playBlock)
	playBlockRef.current = playBlock
	const tickRef = useRef(tick)
	tickRef.current = tick

	/** The audio element, made on the first tap so a page that is only read never touches media. */
	const getAudio = useCallback(() => {
		if (audioRef.current) return audioRef.current
		const audio = new Audio()
		audio.preload = 'auto'
		audio.addEventListener('ended', () => {
			if (!playingRef.current) return
			lightWord(null, null)
			playBlockRef.current(curRef.current + 1)
		})
		audio.addEventListener('timeupdate', () => tickRef.current())
		audio.addEventListener('error', () => {
			if (!playingRef.current) return
			patch({ status: 'error', message: 'The audio could not be played.' })
			playingRef.current = false
			clearTimers()
		})
		audioRef.current = audio
		return audio
	}, [clearTimers, patch])

	const toggle = useCallback(() => {
		const audio = getAudio()
		if (playingRef.current) {
			playingRef.current = false
			audio.pause()
			clearTimers()
			patch({ status: 'paused', message: null })
			return
		}
		if (state.status === 'paused' && curRef.current >= 0 && audio.src) {
			playingRef.current = true
			patch({ status: 'playing' })
			void audio.play().catch(() => {})
			if (tickTimerRef.current == null) tickTimerRef.current = window.setInterval(tick, 100)
			return
		}
		if (activeStop && activeStop !== stop) activeStop()
		activeStop = stop
		const blocks = refreshBlocks()
		if (blocks.length === 0) {
			patch({ status: 'unavailable', message: 'Nothing to read here.' })
			return
		}
		playingRef.current = true
		if (tickTimerRef.current == null) tickTimerRef.current = window.setInterval(tick, 100)
		playBlock(state.status === 'paused' && curRef.current >= 0 ? curRef.current : firstVisible())
	}, [clearTimers, firstVisible, getAudio, patch, playBlock, refreshBlocks, state.status, stop, tick])

	// The text changed: the clock restarts, the blocks are re-read, and a
	// block that changed under the voice is narrated again once it holds still.
	useEffect(() => {
		stableSinceRef.current = Date.now()
		const timer = window.setTimeout(() => {
			const blocks = refreshBlocks()
			if (!playingRef.current) return
			const i = curRef.current
			const block = blocks[i]
			if (!block) {
				stop()
				return
			}
			if (playingTextRef.current !== null && block.text !== playingTextRef.current) {
				// The paragraph being read was edited: say the new one from its start.
				audioRef.current?.pause()
				playingTextRef.current = null
				playBlock(i)
			} else {
				prefetch(i)
			}
		}, stableMs)
		return () => window.clearTimeout(timer)
	}, [version, stableMs, refreshBlocks, playBlock, prefetch, stop])

	// Leaving the page: silence.
	useEffect(() => () => stop(), [stop])

	return useMemo(() => ({ ...state, toggle, stop }), [state, toggle, stop])
}
