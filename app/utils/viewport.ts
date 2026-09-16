import { useEffect, useRef, useState } from 'react'

/**
 * The visual viewport, for the elements that must sit on the software
 * keyboard. iOS keeps a fixed element at the bottom of the layout viewport,
 * under the keyboard; it only shrinks the visual viewport.
 */

/** A `focusout` re-measure waits this long for the keyboard to close. */
export const KEYBOARD_SETTLE_MS = 300

/**
 * px between the layout viewport's bottom and the visual viewport's bottom:
 * the software keyboard's height on iOS. 0 on a wide screen (`enabled`
 * false), 0 with no `visualViewport`, and 0 while no element has focus (iOS
 * 26 leaves `visualViewport.height` short after the keyboard closes; with
 * nothing focused there is no keyboard).
 */
export function useKeyboardInset(enabled: boolean): number {
	const [inset, setInset] = useState(0)
	useEffect(() => {
		if (!enabled) {
			setInset(0)
			return
		}
		const vv = window.visualViewport
		if (!vv) return
		let frame = 0
		let late = 0
		const measure = () => {
			frame = 0
			const active = document.activeElement
			const focused = active !== null && active !== document.body
			setInset(
				focused
					? Math.max(
							0,
							Math.round(window.innerHeight - (vv.offsetTop + vv.height)),
						)
					: 0,
			)
		}
		const queue = () => {
			if (!frame) frame = requestAnimationFrame(measure)
		}
		const onFocusOut = () => {
			clearTimeout(late)
			late = window.setTimeout(queue, KEYBOARD_SETTLE_MS)
		}
		measure()
		vv.addEventListener('resize', queue)
		vv.addEventListener('scroll', queue)
		window.addEventListener('resize', queue)
		document.addEventListener('focusin', queue)
		document.addEventListener('focusout', onFocusOut)
		return () => {
			if (frame) cancelAnimationFrame(frame)
			clearTimeout(late)
			vv.removeEventListener('resize', queue)
			vv.removeEventListener('scroll', queue)
			window.removeEventListener('resize', queue)
			document.removeEventListener('focusin', queue)
			document.removeEventListener('focusout', onFocusOut)
		}
	}, [enabled])
	return inset
}

/**
 * The height of the element in `ref`, kept up to date with a ResizeObserver.
 * 0 until measured and 0 while the element is absent. The element may mount
 * after the first render (the phone dock on an own-words row), so the check
 * runs after every render; the observer moves only when the element does.
 */
export function useMeasuredHeight(
	ref: React.RefObject<HTMLElement | null>,
): number {
	const [height, setHeight] = useState(0)
	const watched = useRef({
		el: null as HTMLElement | null,
		stop: () => {},
	})
	const measure = (el: HTMLElement) =>
		setHeight(Math.round(el.getBoundingClientRect().height))
	const absent = () => setHeight(0)
	// No dependency list: `ref.current` is not a render value. The state
	// moves only when the element itself changes, so there is no chain.
	useEffect(() => {
		const w = watched.current
		const el = ref.current
		if (w.el === el) return
		w.stop()
		w.el = el
		if (!el) {
			w.stop = () => {}
			absent()
			return
		}
		measure(el)
		const observer =
			typeof ResizeObserver === 'undefined'
				? null
				: new ResizeObserver(() => measure(el))
		observer?.observe(el)
		w.stop = () => observer?.disconnect()
	})
	useEffect(() => {
		const w = watched.current
		return () => w.stop()
	}, [])
	return height
}

/**
 * The bottom edge of an element in viewport pixels, kept up to date on
 * scroll and resize. 0 until measured. The phone editor page uses it for
 * the top of the chat sheet: its sticky bar sits under a header that
 * scrolls away, so the bar's bottom edge moves between two values.
 */
export function useBottomEdge(
	ref: React.RefObject<HTMLElement | null>,
): number {
	const [bottom, setBottom] = useState(0)
	useEffect(() => {
		if (typeof window === 'undefined') return
		let frame = 0
		const measure = () => {
			frame = 0
			const el = ref.current
			setBottom(el ? Math.round(el.getBoundingClientRect().bottom) : 0)
		}
		const queue = () => {
			if (!frame) frame = requestAnimationFrame(measure)
		}
		measure()
		window.addEventListener('scroll', queue, { passive: true })
		window.addEventListener('resize', queue)
		return () => {
			if (frame) cancelAnimationFrame(frame)
			window.removeEventListener('scroll', queue)
			window.removeEventListener('resize', queue)
		}
	}, [ref])
	return bottom
}
