import { cn } from '#app/utils/misc.tsx'

interface BeforeAfterDisplayProps {
	beforeImage: string
	afterImage: string
	alt?: string
	className?: string
}

export function BeforeAfterDisplay({
	beforeImage,
	afterImage,
	alt = 'Before and After',
	className,
}: BeforeAfterDisplayProps) {
	return (
		<div
			className={cn(
				'grid w-full grid-cols-2 gap-[1px] overflow-hidden bg-gray-200',
				className,
			)}
		>
			{/* Before Image */}
			<div className="relative w-full bg-white">
				<img
					src={beforeImage}
					alt={`${alt} Before`}
					className="block aspect-[3/4] h-full w-full object-cover object-center"
					loading="lazy"
				/>
				<div className="absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-[9px] font-medium tracking-wide text-white/90 backdrop-blur-sm sm:bottom-3 sm:left-3 sm:text-[10px]">
					Before
				</div>
			</div>

			{/* After Image */}
			<div className="relative w-full bg-white">
				<img
					src={afterImage}
					alt={`${alt} After`}
					className="block aspect-[3/4] h-full w-full object-cover object-center"
					loading="lazy"
				/>
				<div className="absolute bottom-2 right-2 rounded bg-black/40 px-2 py-1 text-[9px] font-medium tracking-wide text-white/90 backdrop-blur-sm sm:bottom-3 sm:right-3 sm:text-[10px]">
					After
				</div>
			</div>
		</div>
	)
}
