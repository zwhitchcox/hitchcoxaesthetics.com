import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '#app/utils/misc.js'

const ImageCarousel = ({
	images,
	className,
	customClassNames,
	altTexts,
	interval = 4000,
	transitionDuration = 2000,
}: {
	images: string[]
	className?: string
	customClassNames?: (string | undefined)[]
	altTexts?: string[]
	transitionDuration?: number
	interval?: number
}) => {
	// Images arrive as [before1, after1, before2, after2, ...]
	// We treat them as pairs. pairIndex picks which pair, showAfter toggles within.
	const totalPairs = Math.max(1, Math.floor(images.length / 2))
	const [pairIndex, setPairIndex] = useState(0)
	const [showAfter, setShowAfter] = useState(false)
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const currentImageIndex = pairIndex * 2 + (showAfter ? 1 : 0)

	const resetTimer = useCallback(() => {
		if (timerRef.current) clearInterval(timerRef.current)
		if (images.length <= 1) return
		timerRef.current = setInterval(() => {
			setShowAfter(prev => !prev)
		}, interval)
	}, [images.length, interval])

	useEffect(() => {
		resetTimer()
		return () => {
			if (timerRef.current) clearInterval(timerRef.current)
		}
	}, [resetTimer])

	const nextPair = () => {
		setPairIndex(prev => (prev + 1) % totalPairs)
		setShowAfter(false)
		resetTimer()
	}

	const prevPair = () => {
		setPairIndex(prev => (prev - 1 + totalPairs) % totalPairs)
		setShowAfter(false)
		resetTimer()
	}

	const toggleBeforeAfter = (after: boolean) => {
		setShowAfter(after)
		resetTimer()
	}

	return (
		<>
			{images.map((image, index) => (
				<img
					key={index}
					src={image}
					alt={altTexts?.[index] ?? `Slide ${index + 1}`}
					className={`absolute left-0 top-0 w-full object-cover transition-opacity ${
						index === currentImageIndex ? 'opacity-100' : 'opacity-0'
					} ${cn(className, customClassNames?.[index] ?? '')}`}
					style={{
						transitionDuration: `${transitionDuration}ms`,
					}}
					loading={index === 0 ? 'eager' : 'lazy'}
					fetchPriority={index === 0 ? 'high' : 'auto'}
					decoding={index === 0 ? 'sync' : 'async'}
				/>
			))}

			{/* Navigation Controls: [<] [Before] [After] [>] */}
			{images.length > 1 && (
				<div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 p-1 backdrop-blur-sm">
					{/* Previous Pair */}
					{totalPairs > 1 && (
						<button
							onClick={prevPair}
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
					)}

					{/* Before / After Toggle */}
					<button
						onClick={() => toggleBeforeAfter(!showAfter)}
						className="rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/20 hover:text-white"
					>
						{showAfter ? 'After' : 'Before'}
					</button>

					{/* Next Pair */}
					{totalPairs > 1 && (
						<button
							onClick={nextPair}
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
					)}
				</div>
			)}
		</>
	)
}

export default ImageCarousel
