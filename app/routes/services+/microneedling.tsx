import { type MetaFunction } from '@remix-run/node'
import { ServiceFAQ, ServiceLayout, ServiceParagraph } from './__service-layout'

const faq = [
	{
		question: 'What is microneedling?',
		answer:
			'Microneedling is a cosmetic procedure that involves pricking the skin with tiny, sterilized needles. The small wounds cause your body to make more collagen and elastin, which heal your skin and help to achieve a more youthful appearance.',
	},
	{
		question: 'Is microneedling painful?',
		answer:
			'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
	},
	{
		question: 'How long does it take to see results from microneedling?',
		answer:
			'While some effects can be seen immediately, optimal results typically emerge after several sessions and over a few months as collagen production increases.',
	},
	{
		question: 'What are the side effects of microneedling?',
		answer:
			'Common side effects include redness, swelling, and mild irritation, similar to a sunburn, which usually subside within a few days.',
	},
	{
		question: 'Can microneedling be done on all skin types?',
		answer: 'Yes, microneedling is safe for all skin types.',
	},
	{
		question: 'How often can I undergo microneedling?',
		answer:
			'It is generally recommended to wait 4-6 weeks between sessions to allow the skin to heal and regenerate.',
	},
]

export const meta: MetaFunction = () => {
	return [{ title: 'Microneedling | Knoxville | Sarah Hitchcox Aesthetics' }]
}

export default function () {
	return (
		<ServiceLayout
			title="Microneedling"
			description="for acne scars, fine lines, wrinkles"
			imgClassName="w-full h-full object-cover"
		>
			<ServiceParagraph>
				Microneedling is a transformative skincare service designed to
				rejuvenate and revitalize your skin. This minimally invasive procedure
				utilizes fine needles to create micro-injuries on the skin surface,
				promoting natural collagen and elastin production. Ideal for addressing
				wrinkles, scars, and enhancing overall skin texture, microneedling
				offers a safe and effective solution for achieving a youthful, radiant
				complexion.
			</ServiceParagraph>
			<ServiceFAQ faq={faq} />
		</ServiceLayout>
	)
}
