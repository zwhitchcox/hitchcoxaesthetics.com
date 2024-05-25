import { type MetaFunction } from '@remix-run/node'

export const meta: MetaFunction = () => [
	{ title: 'Botox - Knoxville - Sarah Hitchcox Aesthetics' },
]

export default function Botox() {
	return (
		<div className="flex w-full flex-col items-center justify-center space-y-8">
			<div className="w-full max-w-xl space-y-4">
				<h1 className="text-4xl">Botox Treatment - Knoxville</h1>
				<div className="flex flex-col space-y-4">
					<h2>What is Botox?</h2>
					<p className="text-xl">
						Botox is a safe, FDA-approved treatment that helps reduce facial
						wrinkles and lines. It works by relaxing the muscles under the skin
						that cause fine lines, smoothing them out for a more youthful
						appearance.
					</p>
					<h2>Benefits of Botox</h2>
					<p className="text-xl">
						Botox is a popular injectable treatment that temporarily relaxes
						facial muscles to reduce the appearance of fine lines and wrinkles,
						as well as prevent new lines from forming. Botox is a safe,
						effective, and minimally invasive treatment that can be used to
						treat the following:
						<ul className="list-inside list-disc">
							<li>
								Forehead Lines: Reduces horizontal lines across the forehead.
							</li>
							<li>
								Frown Lines: Softens vertical lines between the eyebrows, known
								as &quote;11 lines.&quot;
							</li>
							<li>
								Crow’s Feet: Diminishes fine lines around the corners of the
								eyes.
							</li>
							<li>
								Bunny Lines: Treats wrinkles on the sides of the nose during
								smiling.
							</li>
							<li>
								Lip Lines: Smoothens vertical lines around the lips, often
								referred to as &quot;smoker&apos;s lines.&quot;
							</li>
							<li>
								Gummy Smile: Adjusts muscle balance to reduce gum exposure when
								smiling.
							</li>
							<li>Chin Dimpling: Reduces chin dimpling.</li>
							<li>
								Eyebrow Lift: Subtly lifts the eyebrows for an enhanced eye
								area.
							</li>
						</ul>
					</p>
				</div>
			</div>
		</div>
	)
}
