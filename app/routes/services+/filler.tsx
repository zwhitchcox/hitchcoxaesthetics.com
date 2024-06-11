import { type MetaFunction } from '@remix-run/node'
import {
	ServiceCheckMarks,
	ServiceFAQ,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'
import { de } from '@faker-js/faker'
import Service from '../book+/_steps+/service'

export const meta: MetaFunction = () => [
	{ title: 'Filler - Knoxville - Sarah Hitchcox Aesthetics' },
]

const areas = [
	{
		question: 'Cheeks',
		answer:
			'As we age, the cheeks can lose volume, leading to a sunken or tired appearance. Dermal fillers can add volume to the cheeks, lifting and contouring the mid-face for a more youthful and vibrant look.',
	},
	{
		question: 'Lips',
		answer:
			'Enhance the volume, shape, and definition of your lips with dermal fillers. Whether you desire a subtle enhancement or a fuller pout, lip fillers can provide natural-looking results.',
	},
	{
		question: 'Chin',
		answer:
			'Define and contour your chin with dermal fillers. This treatment can enhance your facial profile, creating a more balanced and harmonious appearance.',
	},
]

const bulletPoints = [
	{
		title: 'Non-Surgical',
		description:
			'Dermal filler treatments are minimally invasive with little to no downtime.',
	},
	{
		title: 'Immediate Results',
		description:
			'You can see the effects of the treatment immediately, with full results typically appearing within a few days.',
	},
	{
		title: 'Customizable',
		description:
			'Our experienced practitioners tailor each treatment to your specific needs and aesthetic goals, ensuring natural-looking results.',
	},
	{
		title: 'Long-Lasting',
		description:
			'Depending on the type of filler and the area treated, results can last from several months to up to two years.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Filler"
			description="for lips, cheeks, facial balancing"
		>
			<div className="w-full max-w-2xl space-y-8">
				<ServiceHeader>What Are Dermal Fillers?</ServiceHeader>
				<ServiceParagraph>
					Dermal fillers are injectable treatments designed to restore volume,
					smooth wrinkles, and enhance facial contours. Made from hyaluronic
					acid, a naturally occurring substance in the skin, dermal fillers work
					by attracting and retaining moisture, resulting in a plumper, more
					youthful appearance. At Sarah Hitchcox Aesthetics, we offer a variety
					of dermal fillers to address your unique cosmetic concerns and help
					you achieve your desired look.
				</ServiceParagraph>
				<ServiceHeader>Areas We Can Treat with Dermal Fillers</ServiceHeader>
				<ServiceFAQ faq={areas} />
				<ServiceHeader>Benefits of Dermal Fillers</ServiceHeader>
				<ServiceCheckMarks bulletPoints={bulletPoints} />
				<ServiceHeader>Why Choose Sarah Hitchcox Aesthetics?</ServiceHeader>
				<ServiceParagraph>
					At Sarah Hitchcox Aesthetics, we are committed to helping you look and
					feel your best. Our skilled team will work with you to develop a
					personalized treatment plan that addresses your concerns and enhances
					your natural beauty. Please contact us to schedule your consultation
					and discover the transformative power of dermal fillers.
				</ServiceParagraph>
			</div>
		</ServiceLayout>
	)
}
