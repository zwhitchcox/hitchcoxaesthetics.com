import { type MetaFunction } from '@remix-run/node'
import {
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{
		title: 'Semaglutide (Ozempic) | Knoxville | Sarah Hitchcox Aesthetics',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Semaglutide (Ozempic) Injections"
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
				Achieve your weight loss goals with Semaglutide, innovative medications
				designed to help regulate appetite and improve blood sugar control.
				Semaglutide, the active ingredient in Ozempic, is available at about
				half the price when prescribed as a generic medication. These treatments
				are part of the GLP-1 receptor agonist class, mimicking natural hormones
				in your body that promote feelings of fullness and reduce cravings. Both
				medications are administered as convenient, once-weekly injections,
				offering a safe, effective, and easy way to support steady and
				sustainable weight loss.
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
