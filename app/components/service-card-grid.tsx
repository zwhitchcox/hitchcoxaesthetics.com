import { Link } from '@remix-run/react'
import { useEffect, useState } from 'react'
import { cn } from '#app/utils/misc.js'

export type ServiceCardData = {
	slug: string
	serviceName: string
	shortDescription?: string
	heroImage?: string
}

/**
 * Before/After image pair for service cards.
 * Desktop: CSS group-hover toggles between before/after.
 * Mobile: auto-cycles between before/after every 3 seconds.
 */
function BeforeAfterImage({
	src,
	alt,
	className,
}: {
	src: string
	alt: string
	className?: string
}) {
	const isBeforeAfter = src.includes('-after.')
	const beforeSrc = isBeforeAfter ? src.replace('-after.', '-before.') : null
	const afterSrc = src

	// Auto-cycle for mobile (no hover capability)
	const [showAfter, setShowAfter] = useState(false)

	useEffect(() => {
		if (!beforeSrc) return
		const timer = setInterval(() => {
			setShowAfter(prev => !prev)
		}, 3000)
		return () => clearInterval(timer)
	}, [beforeSrc])

	if (!beforeSrc) {
		return (
			<img
				src={src}
				alt={alt}
				className={cn('object-cover', className)}
				loading="lazy"
				decoding="async"
			/>
		)
	}

	return (
		<div className={cn('relative h-full w-full overflow-hidden', className)}>
			{/* Before — visible by default; hidden on hover (desktop) or when cycling (mobile) */}
			<img
				src={beforeSrc}
				alt={`${alt} before`}
				className={cn(
					'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
					'md:group-hover:opacity-0',
					showAfter ? 'opacity-0 md:opacity-100' : 'opacity-100',
				)}
				loading="lazy"
				decoding="async"
			/>
			{/* After — hidden by default; visible on hover (desktop) or when cycling (mobile) */}
			<img
				src={afterSrc}
				alt={`${alt} after`}
				className={cn(
					'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
					'md:opacity-0 md:group-hover:opacity-100',
					showAfter ? 'opacity-100 md:opacity-0' : 'opacity-0',
				)}
				loading="lazy"
				decoding="async"
			/>
			{/* Label */}
			<div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/50 px-2 py-0.5 backdrop-blur-[2px]">
				<span className="text-[10px] font-medium uppercase tracking-wider text-white">
					{/* Mobile: driven by state */}
					<span className="md:hidden">{showAfter ? 'After' : 'Before'}</span>
					{/* Desktop: driven by hover */}
					<span className="hidden md:inline">
						<span className="group-hover:hidden">Before</span>
						<span className="hidden group-hover:inline">After</span>
					</span>
				</span>
			</div>
		</div>
	)
}

export function ServiceCardGrid({
	services,
	variant = 'hero',
}: {
	services: ServiceCardData[]
	variant?: 'hero' | 'thumbnail'
}) {
	if (variant === 'thumbnail') {
		return (
			<div className="grid gap-6 sm:grid-cols-2">
				{services.map(service => (
					<Link
						key={service.slug}
						to={`/${service.slug}`}
						prefetch="intent"
						className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
					>
						{service.heroImage && (
							<div className="relative h-48 w-full shrink-0 sm:h-56">
								<div className="absolute inset-0 bg-gray-100/10" />
								<BeforeAfterImage
									src={service.heroImage}
									alt={service.serviceName}
									className="h-full w-full"
								/>
							</div>
						)}
						<div className="flex flex-1 flex-col p-5">
							<h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors group-hover:text-primary">
								{service.serviceName}
							</h3>
							<p className="mb-4 line-clamp-3 text-sm leading-relaxed text-gray-500">
								{service.shortDescription}
							</p>
							<div className="mt-auto flex items-center text-sm font-semibold text-gray-900 transition-colors group-hover:text-primary">
								Learn More
								<svg
									className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M17 8l4 4m0 0l-4 4m4-4H3"
									/>
								</svg>
							</div>
						</div>
					</Link>
				))}
			</div>
		)
	}

	return (
		<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
			{services.map(service => (
				<Link
					key={service.slug}
					to={`/${service.slug}`}
					prefetch="intent"
					className="group relative flex h-80 flex-col justify-end overflow-hidden rounded-xl bg-gray-900 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
				>
					{service.heroImage && (
						<img
							src={service.heroImage}
							alt={service.serviceName}
							className="absolute inset-0 h-full w-full object-cover opacity-60 transition-transform duration-500 group-hover:scale-105"
							loading="lazy"
							decoding="async"
						/>
					)}
					<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
					<div className="relative p-6 text-white">
						<h3 className="mb-2 text-xl font-bold">{service.serviceName}</h3>
						<p className="line-clamp-3 text-sm text-gray-200">
							{service.shortDescription}
						</p>
						<span className="mt-4 inline-flex items-center text-sm font-medium text-white group-hover:underline">
							Learn More &rarr;
						</span>
					</div>
				</Link>
			))}
		</div>
	)
}
