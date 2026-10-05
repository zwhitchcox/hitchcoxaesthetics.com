import { Link } from '@remix-run/react'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'

/** The fields the cards and routines need; the server type has more. */
export type ProductSummary = {
	slug: string
	name: string
	image: string
	step: string
	shortDescription: string
}

export type RoutineStepView = {
	step: string
	text: string
	slug?: string
}

/** A product cutout on the muted panel every skincare page uses. */
export function ProductImage({
	product,
	className,
	imgClassName,
	eager = false,
}: {
	product: Pick<ProductSummary, 'image' | 'name'>
	className?: string
	imgClassName?: string
	eager?: boolean
}) {
	return (
		<div className={cn('relative overflow-hidden bg-muted', className)}>
			<img
				src={product.image}
				alt={product.name}
				loading={eager ? 'eager' : 'lazy'}
				className={cn(
					'h-full w-full object-contain drop-shadow-[0_14px_18px_rgba(15,23,42,0.18)]',
					imgClassName,
				)}
			/>
		</div>
	)
}

export function StepTag({
	children,
	className,
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wider text-card-foreground',
				className,
			)}
		>
			{children}
		</span>
	)
}

export function ProductCard({ product }: { product: ProductSummary }) {
	return (
		<Link
			to={`/skincare/${product.slug}`}
			prefetch="intent"
			className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground transition duration-300 hover:-translate-y-1 hover:shadow-xl"
		>
			<div className="relative">
				<ProductImage
					product={product}
					className="aspect-square"
					imgClassName="p-10 transition duration-500 group-hover:scale-105"
				/>
				<StepTag className="absolute left-4 top-4">{product.step}</StepTag>
			</div>
			<div className="flex flex-1 flex-col p-6">
				<h3 className="text-lg font-semibold leading-snug text-foreground">
					{product.name}
				</h3>
				<p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
					{product.shortDescription}
				</p>
				<span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
					Learn more
					<Icon
						name="arrow-right"
						className="h-4 w-4 transition group-hover:translate-x-1"
					/>
				</span>
			</div>
		</Link>
	)
}

/**
 * One routine (morning or evening) as numbered steps with product
 * thumbnails. `highlight` marks the product a product page is about.
 */
export function RoutineCard({
	label,
	icon,
	texture,
	steps,
	products,
	highlight,
}: {
	label: string
	icon: 'sun' | 'moon'
	texture?: string
	steps: RoutineStepView[]
	products: Record<string, ProductSummary>
	highlight?: string
}) {
	return (
		<div className="overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-sm">
			{texture ? (
				<div className="relative h-36 bg-white sm:h-44">
					<img
						src={texture}
						alt=""
						loading="lazy"
						className="h-full w-full object-contain object-right p-4"
					/>
					<span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-card-foreground shadow-sm">
						<Icon name={icon} className="h-4 w-4" />
						{label}
					</span>
				</div>
			) : (
				<div className="flex items-center gap-2 px-6 pt-6 text-lg font-semibold text-foreground">
					<Icon name={icon} className="h-5 w-5" />
					{label}
				</div>
			)}
			<ol className="divide-y divide-border">
				{steps.map((s, i) => {
					const product = s.slug ? products[s.slug] : undefined
					const active = Boolean(highlight) && s.slug === highlight
					return (
						<li
							key={`${s.step}-${i}`}
							className={cn(
								'flex items-center gap-4 px-5 py-4 sm:px-6',
								active && 'bg-muted',
							)}
						>
							<span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground sm:flex">
								{i + 1}
							</span>
							{product ? (
								<ProductImage
									product={product}
									className="h-20 w-16 shrink-0 rounded-2xl"
									imgClassName="p-1"
								/>
							) : (
								<div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
									<Icon name="reset" className="h-6 w-6" />
								</div>
							)}
							<div className="min-w-0">
								<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									{s.step}
								</p>
								{product ? (
									<Link
										to={`/skincare/${product.slug}`}
										prefetch="intent"
										className="font-semibold text-foreground hover:underline"
									>
										{product.name}
									</Link>
								) : (
									<p className="font-semibold text-foreground">
										Gentle cleanser
									</p>
								)}
								<p className="text-sm leading-6 text-muted-foreground">
									{s.text}
								</p>
							</div>
						</li>
					)
				})}
			</ol>
		</div>
	)
}
