import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '#app/utils/misc.js'
import { type HeroImagePair } from '#app/utils/section-types.js'

const ImageCarousel = ({
	pairs,
	className,
	interval = 4000,
	transitionDuration = 2000,
}: {
	pairs: HeroImagePair[]
	className?: string
	transitionDuration?: number
	interval?: number
}) => {
	// Flatten pairs into [before1, after1, before2, after2, ...]
	const images = pairs.flatMap(p => [p.before, p.after])
	const captions = pairs.flatMap(p => [p.caption, p.caption])

	const [currentIndex, setCurrentIndex] = useState(0)
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

	// Even indices = before, odd indices = after
	const showAfter = currentIndex % 2 === 1
	const pairIndex = Math.floor(currentIndex / 2)
	const currentCaption = captions[currentIndex]

	const clearTimer = useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current)
			timerRef.current = null
		}
	}, [])

	const startTimer = useCallback(() => {
		clearTimer()
		if (images.length <= 1) return
		timerRef.current = setInterval(() => {
			setCurrentIndex(prev => (prev + 1) % images.length)
		}, interval)
	}, [images.length, interval, clearTimer])

	useEffect(() => {
		startTimer()
		return clearTimer
	}, [startTimer, clearTimer])

	const goNext = () => {
		setCurrentIndex(prev => (prev + 1) % images.length)
		startTimer()
	}

	const goPrev = () => {
		setCurrentIndex(prev => (prev - 1 + images.length) % images.length)
		startTimer()
	}

	const toggleBeforeAfter = () => {
		if (showAfter) {
			setCurrentIndex(pairIndex * 2)
		} else {
			setCurrentIndex(pairIndex * 2 + 1)
		}
		startTimer()
	}

	return (
		<>
			{images.map((image, index) => (
				<img
					key={index}
					src={image}
					alt={`Treatment result ${Math.floor(index / 2) + 1} ${index % 2 === 0 ? 'before' : 'after'}`}
					className={`absolute left-0 top-0 w-full object-cover transition-opacity ${
						index === currentIndex ? 'opacity-100' : 'opacity-0'
					} ${cn(className)}`}
					style={{
						transitionDuration: `${transitionDuration}ms`,
					}}
					loading={index === 0 ? 'eager' : 'lazy'}
					fetchPriority={index === 0 ? 'high' : 'auto'}
					decoding={index === 0 ? 'sync' : 'async'}
				/>
			))}

			{/* Caption — subtle white text, bottom left */}
			{currentCaption && (
				<div className="absolute bottom-4 left-4 z-10">
					<span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium tracking-wide text-white/90 drop-shadow-md backdrop-blur-sm">
						{currentCaption}
					</span>
				</div>
			)}

			{/* Navigation Controls: [<] [Before/After] [>] */}
			{images.length > 1 && (
				<div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 p-1 backdrop-blur-sm">
					{/* Previous */}
					<button
						onClick={goPrev}
						className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
						aria-label="Previous photo"
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

					{/* Before / After Toggle */}
					<button
						onClick={toggleBeforeAfter}
						className="rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/20 hover:text-white"
					>
						{showAfter ? 'After' : 'Before'}
					</button>

					{/* Next */}
					<button
						onClick={goNext}
						className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
						aria-label="Next photo"
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
				</div>
			)}
		</>
	)
}

export default ImageCarousel
