import { useEffect, useState } from 'react'

import { type HeroImagePair } from '#app/utils/section-types.js'

import { BeforeAfterDisplay } from './before-after-display.js'
import {
	type CarouselApi,
	Carousel,
	CarouselContent,
	CarouselItem,
} from './ui/carousel.js'

function BeforeAfterCard({
	pair,
	title,
	index,
}: {
	pair: HeroImagePair
	title: string
	index: number
}) {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 shadow-sm">
			<BeforeAfterDisplay
				beforeImage={pair.before}
				afterImage={pair.after}
				alt={`${title} result ${index + 1}`}
				className="w-full"
			/>
			{pair.caption ? (
				<div className="p-4 text-center text-sm font-medium text-gray-700">
					{pair.caption}
				</div>
			) : null}
		</div>
	)
}

export function BeforeAfterResults({
	imgs,
	title,
}: {
	imgs: HeroImagePair[]
	title: string
}) {
	const visibleImgs = imgs.slice(0, 10)
	const useCarousel = visibleImgs.length > 4
	const [api, setApi] = useState<CarouselApi>()
	const [current, setCurrent] = useState(0)
	const [count, setCount] = useState(0)

	useEffect(() => {
		if (!api || !useCarousel) return

		const onSelect = () => {
			setCurrent(api.selectedScrollSnap())
			setCount(api.scrollSnapList().length)
		}

		onSelect()
		api.on('select', onSelect)
		api.on('reInit', onSelect)

		return () => {
			api.off('select', onSelect)
			api.off('reInit', onSelect)
		}
	}, [api, useCarousel])

	useEffect(() => {
		if (!api || !useCarousel) return

		const interval = window.setInterval(() => {
			api.scrollNext()
		}, 4500)

		return () => window.clearInterval(interval)
	}, [api, useCarousel])

	if (!useCarousel) {
		return (
			<div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-2">
				{visibleImgs.map((pair, index) => (
					<BeforeAfterCard
						key={index}
						pair={pair}
						title={title}
						index={index}
					/>
				))}
			</div>
		)
	}

	return (
		<div className="mt-10">
			<Carousel setApi={setApi} opts={{ loop: true, align: 'start' }}>
				<CarouselContent>
					{visibleImgs.map((pair, index) => (
						<CarouselItem key={index} className="md:basis-1/2 xl:basis-1/2">
							<BeforeAfterCard pair={pair} title={title} index={index} />
						</CarouselItem>
					))}
				</CarouselContent>
			</Carousel>

			{count > 1 ? (
				<div className="mt-6 flex items-center justify-center gap-2">
					{Array.from({ length: count }).map((_, index) => (
						<button
							key={index}
							type="button"
							onClick={() => api?.scrollTo(index)}
							className={
								index === current
									? 'h-2.5 w-6 rounded-full bg-black'
									: 'h-2.5 w-2.5 rounded-full bg-gray-300 transition-colors hover:bg-gray-400'
							}
							aria-label={`Go to result ${index + 1}`}
						/>
					))}
				</div>
			) : null}
		</div>
	)
}
