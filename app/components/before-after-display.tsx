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
		<div className={cn('grid w-full grid-cols-2 gap-1', className)}>
			{/* Before Image */}
			<div className="relative h-full w-full overflow-hidden bg-gray-100">
				<img
					src={beforeImage}
					alt={`${alt} Before`}
					className="block h-full w-full object-cover"
					loading="lazy"
				/>
				<div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[10px] font-bold tracking-widest text-white shadow-sm backdrop-blur-md sm:text-xs">
					BEFORE
				</div>
			</div>

			{/* After Image */}
			<div className="relative h-full w-full overflow-hidden bg-gray-100">
				<img
					src={afterImage}
					alt={`${alt} After`}
					className="block h-full w-full object-cover"
					loading="lazy"
				/>
				<div className="absolute right-3 top-3 rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-[10px] font-bold tracking-widest text-black shadow-sm backdrop-blur-md sm:text-xs">
					AFTER
				</div>
			</div>
		</div>
	)
}
