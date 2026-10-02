import { type MetaFunction } from '@remix-run/node'
import { Link } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import { BLVD_GIFT_CARDS_URL } from '#app/utils/blvd.ts'
import { getSocialMetas } from '#app/utils/seo.ts'

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title: 'Gift Cards | Sarah Hitchcox Aesthetics | Knoxville, TN',
		description:
			'Buy a gift card for Sarah Hitchcox Aesthetics, a medical spa in Knoxville and Farragut, TN. Gift cards can be used at any time.',
		pathname: location.pathname,
	})

export default function GiftCardsRoute() {
	return (
		<div className="font-poppins mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
			<h1 className="mb-8 text-3xl font-bold text-foreground">Gift Cards</h1>
			<p className="mb-8 text-lg text-muted-foreground">
				Treat a friend or family member to a visit at Sarah Hitchcox
				Aesthetics. Gift cards can be used at any time.
			</p>
			<Button asChild size="lg">
				<a href={BLVD_GIFT_CARDS_URL}>Buy a Gift Card</a>
			</Button>
			<p className="mt-8 text-muted-foreground">
				You buy the gift card on Boulevard, our booking and payment system.
				Questions?{' '}
				<Link to="/support" className="text-primary hover:underline">
					Contact us
				</Link>
				.
			</p>
		</div>
	)
}
