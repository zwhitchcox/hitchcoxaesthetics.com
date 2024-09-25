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
				After 25, your body's natural collagen production starts to decline,
				which is part of what causes us to age. Microneedling helps stimulate
				the body's natural collagen production.
			</ServiceParagraph>
			<ServiceParagraph>
				Collagen is a protein in your skin that gives it firmness and
				elasticity. This helps fight signs of aging like fine lines and
				wrinkles, and it can also help with acne scarring and enlarged pores, in
				general making your skin more youthful and smooth.
			</ServiceParagraph>
			<ServiceParagraph>
				The treatment takes about 20 minutes, and the provider will apply a
				topical numbing cream to make sure you're comfortable throughout the
				process.
			</ServiceParagraph>
			<ServiceParagraph>Please reach out to us to learn more!</ServiceParagraph>
			<ServiceFAQ faq={faq} />
		</ServiceLayout>
	)
}
