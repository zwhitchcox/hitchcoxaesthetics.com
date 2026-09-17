/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
	KEYBOARD_SETTLE_MS,
	useBottomEdge,
	useKeyboardInset,
	useMeasuredHeight,
} from '#app/utils/viewport.ts'

/*
 * jsdom has no visualViewport and no ResizeObserver: both are faked here.
 * The frame and the timers are faked too, so a re-measure is one tick.
 */

const INNER_HEIGHT = 800

type FakeViewport = EventTarget & { height: number; offsetTop: number }

function fakeViewport(init: { height: number; offsetTop: number }) {
	const vv: FakeViewport = Object.assign(new EventTarget(), init)
	Object.defineProperty(window, 'visualViewport', {
		value: vv,
		configurable: true,
		writable: true,
	})
	return vv
}

function focusedInput() {
	const input = document.createElement('input')
	document.body.appendChild(input)
	input.focus()
	return input
}

function useFrameTimers() {
	vi.useFakeTimers({
		toFake: [
			'setTimeout',
			'clearTimeout',
			'requestAnimationFrame',
			'cancelAnimationFrame',
		],
	})
}

/** The next animation frame. */
function frame() {
	act(() => {
		vi.advanceTimersByTime(16)
	})
}

class FakeResizeObserver {
	static instances: FakeResizeObserver[] = []
	observed: Element[] = []
	disconnected = false
	constructor(private callback: () => void) {
		FakeResizeObserver.instances.push(this)
	}
	observe(el: Element) {
		this.observed.push(el)
	}
	disconnect() {
		this.disconnected = true
	}
	fire() {
		this.callback()
	}
}

function measuredDiv(height: number) {
	const el = document.createElement('div')
	document.body.appendChild(el)
	const rect = { height }
	el.getBoundingClientRect = () => rect as DOMRect
	return {
		el,
		grow(next: number) {
			rect.height = next
		},
	}
}

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
	Reflect.deleteProperty(window, 'visualViewport')
	Object.defineProperty(window, 'innerHeight', {
		value: 768,
		configurable: true,
		writable: true,
	})
	document.body.innerHTML = ''
	FakeResizeObserver.instances = []
})

test('useKeyboardInset is 0 without visualViewport and 0 when disabled', () => {
	expect(window.visualViewport).toBeUndefined()
	focusedInput()
	const bare = renderHook(() => useKeyboardInset(true))
	expect(bare.result.current).toEqual({ inset: 0, bottom: 0 })

	Object.defineProperty(window, 'innerHeight', {
		value: INNER_HEIGHT,
		configurable: true,
		writable: true,
	})
	fakeViewport({ height: 500, offsetTop: 0 })
	const off = renderHook(() => useKeyboardInset(false))
	expect(off.result.current).toEqual({ inset: 0, bottom: 0 })
})

test('useKeyboardInset follows visualViewport resize and scroll, with the inset and the bottom edge from one measure', () => {
	useFrameTimers()
	Object.defineProperty(window, 'innerHeight', {
		value: INNER_HEIGHT,
		configurable: true,
		writable: true,
	})
	const vv = fakeViewport({ height: 500, offsetTop: 0 })
	focusedInput()
	const { result } = renderHook(() => useKeyboardInset(true))
	expect(result.current).toEqual({ inset: 300, bottom: 500 })

	// The visual viewport pans down 40 px inside the layout viewport: the
	// keyboard's edge is 40 px lower, and the inset 40 px smaller.
	vv.offsetTop = 40
	act(() => {
		vv.dispatchEvent(new Event('scroll'))
	})
	frame()
	expect(result.current).toEqual({ inset: 260, bottom: 540 })

	// A pan that changes nothing keeps the same object: no re-render.
	const before = result.current
	act(() => {
		vv.dispatchEvent(new Event('scroll'))
	})
	frame()
	expect(result.current).toBe(before)

	vv.height = INNER_HEIGHT - 40
	act(() => {
		vv.dispatchEvent(new Event('resize'))
	})
	frame()
	expect(result.current).toEqual({ inset: 0, bottom: INNER_HEIGHT })

	// Fractions round to whole px.
	vv.offsetTop = 40.4
	vv.height = 500.3
	act(() => {
		vv.dispatchEvent(new Event('resize'))
	})
	frame()
	expect(result.current).toEqual({ inset: 259, bottom: 541 })
})

test('useKeyboardInset clamps the inset to 0 when nothing has focus (the bottom edge stays measured) and re-measures after focusout', () => {
	useFrameTimers()
	Object.defineProperty(window, 'innerHeight', {
		value: INNER_HEIGHT,
		configurable: true,
		writable: true,
	})
	fakeViewport({ height: 500, offsetTop: 0 })
	const input = focusedInput()
	const { result } = renderHook(() => useKeyboardInset(true))
	expect(result.current).toEqual({ inset: 300, bottom: 500 })

	// The keyboard closes but the viewport stays short (iOS 26).
	act(() => {
		input.blur()
	})
	act(() => {
		vi.advanceTimersByTime(KEYBOARD_SETTLE_MS - 100)
	})
	expect(result.current.inset).toBe(300)
	act(() => {
		vi.advanceTimersByTime(100)
	})
	frame()
	expect(result.current).toEqual({ inset: 0, bottom: 500 })

	// The focus returns: measured at once.
	act(() => {
		input.focus()
	})
	frame()
	expect(result.current).toEqual({ inset: 300, bottom: 500 })
})

test('useMeasuredHeight reports the element height, follows a ResizeObserver, and is 0 for a null ref', () => {
	vi.stubGlobal('ResizeObserver', FakeResizeObserver)
	const box = measuredDiv(48)
	const ref = { current: box.el as HTMLElement | null }
	const { result, rerender, unmount } = renderHook(() => useMeasuredHeight(ref))
	expect(result.current).toBe(48)
	const observer = FakeResizeObserver.instances[0]
	if (!observer) throw new Error('no observer')
	expect(observer.observed).toEqual([box.el])

	box.grow(64)
	act(() => {
		observer.fire()
	})
	expect(result.current).toBe(64)

	// A render with the same element keeps the one observer.
	rerender()
	expect(FakeResizeObserver.instances).toHaveLength(1)

	// The element goes away: 0, and the observer stops.
	ref.current = null
	rerender()
	expect(result.current).toBe(0)
	expect(observer.disconnected).toBe(true)

	// It comes back (a dock that mounts on focus): measured again.
	const later = measuredDiv(72)
	ref.current = later.el
	rerender()
	expect(result.current).toBe(72)
	expect(FakeResizeObserver.instances).toHaveLength(2)
	unmount()
	expect(FakeResizeObserver.instances[1]?.disconnected).toBe(true)

	const none = renderHook(() => useMeasuredHeight({ current: null }))
	expect(none.result.current).toBe(0)
})

test('useBottomEdge follows the element bottom on scroll and resize', async () => {
	let bottom = 92
	const el = document.createElement('div')
	el.getBoundingClientRect = () =>
		({
			bottom,
			top: bottom - 44,
			height: 44,
			left: 0,
			right: 0,
			width: 0,
			x: 0,
			y: 0,
			toJSON() {},
		}) as DOMRect
	const ref = { current: el }
	const { result } = renderHook(() => useBottomEdge(ref))
	expect(result.current).toBe(92)
	bottom = 44
	// the listener measures on the next animation frame
	await act(async () => {
		window.dispatchEvent(new Event('scroll'))
		await new Promise(resolve => setTimeout(resolve, 40))
	})
	expect(result.current).toBe(44)
	bottom = 60
	await act(async () => {
		window.dispatchEvent(new Event('resize'))
		await new Promise(resolve => setTimeout(resolve, 40))
	})
	expect(result.current).toBe(60)
})
