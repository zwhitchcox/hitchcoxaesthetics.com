import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '#app/utils/misc.js'

const ImageCarousel = ({
	images,
	className,
	customClassNames,
	altTexts,
	labels,
	interval = 4000,
	transitionDuration = 2000,
}: {
	images: string[]
	className?: string
	customClassNames?: (string | undefined)[]
	altTexts?: string[]
	labels?: string[]
	transitionDuration?: number
	interval?: number
}) => {
	const [currentIndex, setCurrentIndex] = useState(0)
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const defaultLabels = images.length === 2 ? ['Before', 'After'] : undefined
	const displayLabels = labels ?? defaultLabels

	const startTimer = useCallback(() => {
		if (timerRef.current) clearInterval(timerRef.current)
		if (images.length <= 1) return
		timerRef.current = setInterval(() => {
			setCurrentIndex(prevIndex => (prevIndex + 1) % images.length)
		}, interval)
	}, [images.length, interval])

	useEffect(() => {
		startTimer()
		return () => {
			if (timerRef.current) clearInterval(timerRef.current)
		}
	}, [startTimer])

	const goTo = (index: number) => {
		setCurrentIndex(index)
		startTimer() // Reset timer on manual click
	}

	const next = () => {
		setCurrentIndex(prevIndex => (prevIndex + 1) % images.length)
		startTimer()
	}

	const prev = () => {
		setCurrentIndex(
			prevIndex => (prevIndex - 1 + images.length) % images.length,
		)
		startTimer()
	}

	return (
		<>
			{images.map((image, index) => (
				<img
					key={index}
					src={image}
					alt={altTexts?.[index] ?? `Slide ${index + 1}`}
					className={`absolute left-0 top-0 w-full object-cover transition-opacity ${
						index === currentIndex ? 'opacity-100' : 'opacity-0'
					} ${cn(className, customClassNames?.[index] ?? '')}`}
					style={{
						transitionDuration: `${transitionDuration}ms`,
					}}
					loading={index === 0 ? 'eager' : 'lazy'}
					fetchPriority={index === 0 ? 'high' : 'auto'}
					decoding={index === 0 ? 'sync' : 'async'}
				/>
			))}

			{/* Navigation Controls */}
			<div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 p-1 backdrop-blur-sm">
				{/* Previous Button */}
				{images.length > 1 && (
					<button
						onClick={prev}
						className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
						aria-label="Previous image"
					>
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M15 19l-7-7 7-7"
							/>
						</svg>
					</button>
				)}

				{/* Before/After Toggles */}
				<div className="flex gap-1">
					<button
						onClick={() => {
							if (currentIndex % 2 !== 0) {
								goTo(currentIndex - 1)
							}
						}}
						className={cn(
							'rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-300',
							currentIndex % 2 === 0
								? 'bg-white text-black shadow-sm'
								: 'text-white/70 hover:text-white',
						)}
					>
						Before
					</button>
					<button
						onClick={() => {
							if (currentIndex % 2 === 0) {
								goTo(currentIndex + 1)
							}
						}}
						className={cn(
							'rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-300',
							currentIndex % 2 !== 0
								? 'bg-white text-black shadow-sm'
								: 'text-white/70 hover:text-white',
						)}
					>
						After
					</button>
				</div>

				{/* Next Button */}
				{images.length > 1 && (
					<button
						onClick={next}
						className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
						aria-label="Next image"
					>
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</button>
				)}
			</div>
		</>
	)
}

export default ImageCarousel
