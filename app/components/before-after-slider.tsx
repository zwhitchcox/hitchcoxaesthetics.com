import { useEffect, useRef, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'

/**
 * Drag to compare two aligned photos of the same size: the before shows left
 * of the handle, the after right of it. Touch drags sideways move the handle
 * and vertical swipes still scroll the page; the hidden range input gives
 * keyboard and screen reader users the same control. `hint` nudges the
 * handle once after load, so people see that it moves.
 */
export function BeforeAfterSlider({
	before,
	after,
	alt,
	className,
	eager = false,
	hint = false,
}: {
	before: string
	after: string
	/** What the photos show, e.g. "Masseter Botox result". */
	alt: string
	className?: string
	eager?: boolean
	hint?: boolean
}) {
	const [position, setPosition] = useState(50)
	const [easing, setEasing] = useState(false)
	const box = useRef<HTMLDivElement>(null)
	const dragging = useRef(false)
	const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([])

	useEffect(() => {
		if (!hint || matchMedia('(prefers-reduced-motion: reduce)').matches) return
		const steps: Array<[number, () => void]> = [
			[
				700,
				() => {
					setEasing(true)
					setPosition(36)
				},
			],
			[1400, () => setPosition(64)],
			[2100, () => setPosition(50)],
			[2800, () => setEasing(false)],
		]
		hintTimers.current = steps.map(([ms, step]) => setTimeout(step, ms))
		return () => hintTimers.current.forEach(clearTimeout)
	}, [hint])

	const transition = easing ? '600ms ease-in-out' : undefined

	const moveTo = (clientX: number) => {
		const rect = box.current?.getBoundingClientRect()
		if (!rect) return
		const percent = ((clientX - rect.left) / rect.width) * 100
		setPosition(Math.min(100, Math.max(0, percent)))
	}

	return (
		<div
			ref={box}
			className={cn(
				'relative cursor-ew-resize touch-pan-y select-none overflow-hidden focus-within:ring-2 focus-within:ring-gold focus-within:ring-offset-2 focus-within:ring-offset-background',
				className,
			)}
			onPointerDown={e => {
				hintTimers.current.forEach(clearTimeout)
				setEasing(false)
				dragging.current = true
				e.currentTarget.setPointerCapture(e.pointerId)
				moveTo(e.clientX)
			}}
			onPointerMove={e => {
				if (dragging.current) moveTo(e.clientX)
			}}
			onPointerUp={() => {
				dragging.current = false
			}}
			onPointerCancel={() => {
				dragging.current = false
			}}
		>
			<img
				src={before}
				alt={`${alt}, before`}
				draggable={false}
				loading={eager ? 'eager' : 'lazy'}
				className="absolute inset-0 h-full w-full object-cover"
			/>
			<img
				src={after}
				alt={`${alt}, after`}
				draggable={false}
				loading={eager ? 'eager' : 'lazy'}
				className="absolute inset-0 h-full w-full object-cover"
				style={{
					clipPath: `inset(0 0 0 ${position}%)`,
					transition: transition && `clip-path ${transition}`,
				}}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_10px_rgba(0,0,0,0.35)]"
				style={{
					left: `${position}%`,
					transition: transition && `left ${transition}`,
				}}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg ring-1 ring-black/10"
				style={{
					left: `${position}%`,
					transition: transition && `left ${transition}`,
				}}
			>
				<svg
					viewBox="0 0 24 24"
					className="h-5 w-5"
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path
						d="M9 6l-6 6 6 6M15 6l6 6-6 6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
			<span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
				Before
			</span>
			<span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
				After
			</span>
			<input
				type="range"
				min={0}
				max={100}
				value={Math.round(position)}
				onChange={e => setPosition(Number(e.currentTarget.value))}
				aria-label={`${alt}: before and after comparison`}
				className="sr-only"
			/>
		</div>
	)
}
