import { type PricingCategory, getPricingForSlug } from '#app/utils/pricing.js'

/**
 * Renders a pricing table for a given service slug.
 * Automatically resolves pricing via getPricingForSlug (with parent fallback).
 * Returns null if no pricing data exists for the slug.
 */
export function PricingSection({ serviceSlug }: { serviceSlug: string }) {
	const categories = getPricingForSlug(serviceSlug)
	if (!categories || categories.length === 0) return null

	return (
		<div className="mt-12 border-t border-border pt-8">
			{categories.map((category, i) => (
				<PricingTable key={i} category={category} />
			))}
		</div>
	)
}

function PricingTable({ category }: { category: PricingCategory }) {
	return (
		<div className="mb-8">
			<h2 className="mb-4 text-2xl font-bold text-foreground">
				{category.title}
			</h2>
			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<table className="w-full">
					<thead>
						<tr className="border-b border-border bg-muted/50">
							<th className="px-5 py-3 text-left text-sm font-semibold text-foreground/80">
								Treatment
							</th>
							<th className="px-5 py-3 text-right text-sm font-semibold text-foreground/80">
								Price
							</th>
						</tr>
					</thead>
					<tbody>
						{category.items.map((item, j) => (
							<tr
								key={j}
								className="border-b border-gray-50 last:border-b-0 even:bg-muted/50/50"
							>
								<td className="px-5 py-3.5 text-sm text-foreground">
									{item.name}
								</td>
								<td className="px-5 py-3.5 text-right text-sm font-medium text-foreground">
									{item.price}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{category.footnotes && category.footnotes.length > 0 && (
				<div className="mt-2 space-y-1">
					{category.footnotes.map((note, k) => (
						<p key={k} className="text-xs italic text-muted-foreground">
							* {note}
						</p>
					))}
				</div>
			)}
		</div>
	)
}
