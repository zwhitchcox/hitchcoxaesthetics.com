import { Link } from '@remix-run/react'

export default function LandingPagesIndex() {
	return (
		<div className="container mx-auto py-12">
			<h1 className="mb-8 text-4xl font-bold">Landing Pages Directory</h1>
			<p className="mb-8 text-gray-600">
				Here are the landing pages generated for the Google Ads campaigns:
			</p>
			<ul className="space-y-4">
				<li>
					<Link
						to="/lp/botox"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Botox
					</Link>
				</li>
				<li>
					<Link
						to="/lp/dysport"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Dysport
					</Link>
				</li>
				<li>
					<Link
						to="/lp/jeuveau"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Jeuveau
					</Link>
				</li>
				<li>
					<Link
						to="/lp/kybella"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Kybella
					</Link>
				</li>
				<li>
					<Link
						to="/lp/lip-filler"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Lip Filler
					</Link>
				</li>
				<li>
					<Link
						to="/lp/lip-flip"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Lip Flip
					</Link>
				</li>
				<li>
					<Link
						to="/lp/telehealth-weight-loss"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Telehealth Weight Loss
					</Link>
				</li>
				<li>
					<Link
						to="/lp/weight-loss-semaglutide"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Weight Loss - Semaglutide
					</Link>
				</li>
				<li>
					<Link
						to="/lp/weight-loss-tirzepatide"
						reloadDocument
						className="text-xl font-semibold text-blue-600 hover:underline"
					>
						Weight Loss - Tirzepatide
					</Link>
				</li>
			</ul>
		</div>
	)
}
