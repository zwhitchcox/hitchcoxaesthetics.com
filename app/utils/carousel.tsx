import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '#app/utils/misc.js'
import { type HeroImagePair } from '#app/utils/section-types.js'

const ImageCarousel = ({
	pairs,
	leadingImage,
	leadingLabel = 'Sarah',
	className,
	interval = 4000,
	transitionDuration = 2000,
}: {
	pairs: HeroImagePair[]
	/** Optional single image (e.g. Sarah) shown as the first slide. */
	leadingImage?: string
	/** Nav label shown on the leading slide (no before/after toggle there). */
	leadingLabel?: string
	className?: string
	transitionDuration?: number
	interval?: number
}) => {
	// Flatten pairs into [before1, after1, before2, after2, ...], optionally
	// preceded by a single leading image (Sarah).
	const pairImages = pairs.flatMap(p => [p.before, p.after])
	const images = leadingImage ? [leadingImage, ...pairImages] : pairImages
	const offset = leadingImage ? 1 : 0

	const [currentIndex, setCurrentIndex] = useState(0)
	const [hasMounted, setHasMounted] = useState(false)
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const isLeading = offset === 1 && currentIndex === 0
	const flatIndex = currentIndex - offset // index into pairImages (negative on leading)
	const showAfter = !isLeading && flatIndex % 2 === 1
	const pairIndex = isLeading ? 0 : Math.floor(flatIndex / 2)
	const currentCaption = isLeading ? undefined : pairs[pairIndex]?.caption

	useEffect(() => {
		setHasMounted(true)
	}, [])

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
		if (isLeading) return
		setCurrentIndex(offset + pairIndex * 2 + (showAfter ? 0 : 1))
		startTimer()
	}

	return (
		<>
			{/* Eagerly load the first image for LCP in head */}
			{images.length > 0 && (
				<link rel="preload" as="image" href={images[0]} fetchPriority="high" />
			)}
			{images.map((image, index) => {
				// Eagerly load the first two images so the initial fade is smooth.
				const shouldLoad = index <= 1 || hasMounted
				const lead = offset === 1 && index === 0
				const fIdx = index - offset
				const alt = lead
					? leadingLabel
					: `Treatment result ${Math.floor(fIdx / 2) + 1} ${fIdx % 2 === 0 ? 'before' : 'after'}`
				return (
					<img
						key={index}
						src={shouldLoad ? image : undefined}
						alt={alt}
						className={`absolute left-0 top-0 h-full w-full object-cover transition-opacity ${
							index === currentIndex ? 'z-10 opacity-100' : 'z-0 opacity-0'
						} ${cn(className)}`}
						style={{
							transitionDuration: `${transitionDuration}ms`,
						}}
						loading={index <= 1 ? 'eager' : 'lazy'}
						fetchPriority={index === 0 ? 'high' : 'auto'}
						decoding={index <= 1 ? 'sync' : 'async'}
					/>
				)
			})}

			{/* Caption — subtle white text, bottom left */}
			{currentCaption && (
				<div className="absolute bottom-4 left-4 z-20">
					<span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium tracking-wide text-white/90 drop-shadow-md backdrop-blur-sm">
						{currentCaption}
					</span>
				</div>
			)}

			{/* Navigation Controls: [<] [Before/After] [>] */}
			{images.length > 1 && (
				<div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 p-1 backdrop-blur-sm">
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

					{/* Before / After toggle (leading slide shows a static label instead) */}
					{isLeading ? (
						<span className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white">
							{leadingLabel}
						</span>
					) : (
						<button
							onClick={toggleBeforeAfter}
							className="rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/20 hover:text-white"
						>
							{showAfter ? 'After' : 'Before'}
						</button>
					)}

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
