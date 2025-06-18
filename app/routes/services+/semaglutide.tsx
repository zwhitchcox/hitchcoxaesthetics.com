import { type MetaFunction } from '@remix-run/node'
import {
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{
		title:
			'Semaglutide (Ozempic) & Tirzepatide | Knoxville and Farragut | Sarah Hitchcox Aesthetics',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Semaglutide (Ozempic) & Tirzepatide Injections"
			description="for sustainable weight loss"
			imgClassName="w-full h-full object-cover"
			imgs={[
				'/img/semaglutide/before-female.jpg',
				'/img/semaglutide/after-female.jpg',
				'/img/semaglutide/before-male.jpg',
				'/img/semaglutide/after-male.jpg',
			]}
		>
			<ServiceParagraph>
				Achieve your weight loss goals with Semaglutide and Tirzepatide,
				innovative medications designed to help regulate appetite and improve
				blood sugar control. Semaglutide, the active ingredient in Ozempic, is
				available at about half the price when prescribed as a generic
				medication. These treatments are part of the GLP-1 receptor agonist
				class, mimicking natural hormones in your body that promote feelings of
				fullness and reduce cravings. Both medications are administered as
				convenient, once-weekly injections, offering a safe, effective, and easy
				way to support steady and sustainable weight loss.
			</ServiceParagraph>

			<ServiceHeader>
				What's the Difference Between Semaglutide & Tirzepatide?
			</ServiceHeader>

			<ul className="list-disc space-y-4 pl-6">
				<li>
					<strong>Semaglutide:</strong> A GLP-1 receptor agonist that works by
					reducing appetite and aiding in blood sugar control. It's a proven
					option for those looking for effective weight management.
				</li>
				<li>
					<strong>Tirzepatide:</strong> A dual-action injection that targets
					both GLP-1 and GIP receptors, providing enhanced appetite suppression,
					better blood sugar regulation, and, for some, even greater weight loss
					results.
				</li>
			</ul>

			<ServiceParagraph>
				Both options are delivered as a simple weekly injection, making them a
				convenient choice for busy lifestyles.
			</ServiceParagraph>

			<ServiceHeader>Free Weight Loss Consultations</ServiceHeader>

			<ServiceParagraph>
				Not sure which treatment is right for you? Schedule a complimentary
				consultation to discuss your health and weight loss goals, and we'll
				create a personalized plan just for you.
			</ServiceParagraph>
		</ServiceLayout>
	)
}
