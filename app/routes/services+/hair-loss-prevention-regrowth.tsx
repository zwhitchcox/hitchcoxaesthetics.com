import { ServiceFAQ, ServiceLayout, ServiceParagraph } from './__service-layout'

const faq = [
	{
		question: 'What is microneedling for hair loss?',
		answer:
			'Microneedling for hair loss is a cosmetic procedure that involves using tiny, sterilized needles to create micro-injuries on the scalp. These micro-injuries stimulate the production of collagen and growth factors, which can promote hair regrowth and improve hair density. Additionally, it enhances the absorption of topical treatments like minoxidil and finasteride, boosting their effectiveness.',
	},
	{
		question: 'Is microneedling painful?',
		answer:
			'Patients might experience mild discomfort during the procedure, but topical numbing cream is applied beforehand to minimize any pain.',
	},
	{
		question:
			'How long does it take to see results from microneedling for hair loss?',
		answer:
			'While some improvement may be noticed within a few weeks, optimal results typically emerge after several sessions over a few months as hair growth cycles progress.',
	},
	{
		question: 'What are the side effects of microneedling?',
		answer:
			'Common side effects include redness, swelling, and mild irritation on the scalp, which usually subside within a few days.',
	},
	{
		question: 'Can microneedling be done on all hair types?',
		answer: 'Yes, microneedling is safe for all hair types.',
	},
	{
		question: 'How often can I undergo microneedling for hair loss?',
		answer:
			'It is generally recommended to wait 4-6 weeks between sessions to allow the scalp to heal and regenerate.',
	},
	{
		question: 'Can I apply minoxidil after microneedling?',
		answer:
			'Yes, applying minoxidil directly after microneedling can enhance its absorption. Additionally, using a specialized serum can provide hydration and soothe the scalp.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Microneedling for Hair Loss Prevention & Regrowth"
			description="Promoting hair regrowth improving hair density"
			imgClassName="w-full h-full object-cover"
		>
			<ServiceParagraph>
				Microneedling for hair loss is an innovative procedure designed to
				stimulate hair regrowth and improve hair density. This minimally
				invasive technique uses fine needles to create micro-injuries on the
				scalp, which promotes natural collagen production and enhances the
				delivery of growth factors. Ideal for addressing thinning hair and bald
				spots, microneedling offers a safe and effective solution for achieving
				a thicker, healthier head of hair. Additionally, microneedling can be
				combined with topical treatments like minoxidil and finasteride, which
				are better absorbed through the micro-channels created by the needles,
				further boosting their effectiveness. Using a specialized serum after
				microneedling can also provide added hydration and soothe the scalp.
			</ServiceParagraph>
			<ServiceFAQ faq={faq} />
		</ServiceLayout>
	)
}
