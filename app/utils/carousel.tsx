import { useState, useEffect } from 'react'
import { cn } from '#app/utils/misc.js'

const ImageCarousel = ({
	images,
	className,
	customClassNames,
	interval = 4000,
	transitionDuration = 2000,
}: {
	images: string[]
	className?: string
	customClassNames?: (string | undefined)[]
	transitionDuration?: number
	interval?: number
}) => {
	const [currentIndex, setCurrentIndex] = useState(0)

	useEffect(() => {
		const _interval = setInterval(() => {
			setCurrentIndex(prevIndex => (prevIndex + 1) % images.length)
		}, interval)

		return () => clearInterval(_interval)
	}, [images.length, interval])

	return (
		<>
			{images.map((image, index) => (
				<img
					key={index}
					src={image}
					alt={`Slide ${index}`}
					className={`absolute left-0 top-0 w-full transition-opacity ${
						index === currentIndex ? 'opacity-100' : 'opacity-0'
					} ${cn(className, customClassNames?.[index] ?? '')}`}
					style={{
						transitionDuration: `${transitionDuration}ms`,
					}}
				/>
			))}
		</>
	)
}

export default ImageCarousel
