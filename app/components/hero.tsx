import Logo from '#app/components/logo.js'

export function Hero({
	image,
	imageAlt,
	topText,
	bottomText,
	subText,
	ctaText,
	onCtaClick,
	ctaHref,
}: {
	image: string
	imageAlt: string
	topText: string
	bottomText: string
	subText: string
	ctaText: string
	onCtaClick?: () => void
	ctaHref?: string
}) {
	return (
		<div className="relative h-[calc(100dvh-3.1rem)] w-full flex-col overflow-hidden sm:flex sm:flex-row">
			<div className="flex flex-1 items-center justify-center bg-[#070707] sm:[clip-path:polygon(0_0,_100%_0,_90%_100%,_0%_100%)] ">
				<img
					src={image}
					alt={imageAlt}
					className="z-10 mt-[-3rem] h-auto max-w-full translate-y-[7%] animate-fade-in object-contain"
					loading="eager"
					fetchPriority="high"
				/>
			</div>
			<div className="absolute bottom-0 z-10 w-full bg-white pb-6 text-black sm:relative sm:flex-1">
				<div className="flex h-full w-full animate-slide-top flex-col items-center justify-center space-y-4 [animation-fill-mode:backwards]">
					<div className="flex flex-col items-center justify-center">
						<Logo className="lg:h-22 lg:w-22 my-4 h-14 w-14 animate-spin-in text-primary [animation-fill-mode:backwards] md:h-20 md:w-20" />
						<div className="my-1 flex flex-col items-center justify-center gap-2 lg:my-2">
							<div className="mb-[-3px] whitespace-nowrap text-xl tracking-[.5rem] sm:tracking-[1rem] md:text-2xl lg:text-3xl">
								{topText}
							</div>
							<div className="text-lg tracking-[.3rem] text-gray-600 sm:tracking-[.8rem] md:text-xl lg:my-2 lg:text-2xl">
								{bottomText}
							</div>
							<h1 className="text-md text-gray-600 sm:text-lg md:text-xl lg:text-2xl">
								{subText}
							</h1>
						</div>
					</div>
					<div className="flex flex-col items-center justify-center space-y-2">
						{ctaHref ? (
							<a
								className="text-md mx-2 w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-center font-semibold text-black transition duration-300 ease-in-out hover:bg-gray-200 sm:w-48 sm:text-lg"
								href={ctaHref}
							>
								{ctaText}
							</a>
						) : (
							<button
								className="text-md mx-2 w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-center font-semibold text-black transition duration-300 ease-in-out hover:bg-gray-200 sm:w-48 sm:text-lg"
								onClick={onCtaClick}
							>
								{ctaText}
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
