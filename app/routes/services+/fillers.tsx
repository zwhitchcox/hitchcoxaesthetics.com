import { type MetaFunction } from '@remix-run/node'

export const meta: MetaFunction = () => [
	{ title: 'Filler - Knoxville - Sarah Hitchcox Aesthetics' },
]

export default function About() {
	return (
		<div className="flex w-full flex-col items-center justify-center space-y-8">
			<div className="w-full max-w-xl space-y-4">
				<h1 className="text-4xl">Fillers</h1>
				<div className="flex flex-col space-y-4">
					<h2>About Juvéderm</h2>
					<p className="text-xl">
						Juvéderm is a collection of fillers made from hyaluronic acid, a
						natural substance in the skin that contributes to volume and
						hydration. Approved by the FDA, Juvéderm is designed to restore
						age-related volume loss in the face, enhance lip fullness, and
						smooth out facial lines and folds. The gel-like substance is
						skillfully injected under the skin to provide a smooth, natural look
						and feel.
					</p>
					<h2>Pricing</h2>
					<p className="text-xl">
						Our Juvéderm treatments are priced at $750 per syringe. The number
						of syringes needed varies based on treatment goals and the areas of
						the face being enhanced.
					</p>
				</div>
			</div>
		</div>
	)
}
