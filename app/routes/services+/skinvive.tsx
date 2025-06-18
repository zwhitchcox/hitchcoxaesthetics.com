import { type MetaFunction } from '@remix-run/node'
import { ServiceFAQ, ServiceLayout, ServiceParagraph } from './__service-layout'

export const meta: MetaFunction = () => {
	return [
		{
			title:
				'Juvederm SkinVive | Knoxville and Farragut | Sarah Hitchcox Aesthetics',
		},
	]
}

const faq = [
	{
		question: 'What is Juvederm SkinVive?',
		answer:
			'Juvederm SkinVive is an injectable treatment that uses micro-droplet hyaluronic acid to deeply hydrate the skin and improve texture. It helps in achieving a smoother and more radiant complexion.',
	},
	{
		question: 'Is Juvederm SkinVive painful?',
		answer:
			'Patients might experience mild discomfort during the injection, but a topical numbing cream is applied beforehand to minimize any pain.',
	},
	{
		question: 'How long does it take to see results from Juvederm SkinVive?',
		answer:
			'Results are typically noticeable immediately after the treatment, with peak results generally appearing about a month later as the skin fully absorbs the hyaluronic acid.',
	},
	{
		question: 'What are the side effects of Juvederm SkinVive?',
		answer:
			'Common side effects include redness, swelling, and mild bruising at the injection site, which usually subside within a few days. Bruising may also occur.',
	},
	{
		question: 'Can Juvederm SkinVive be done on all skin types?',
		answer: 'Yes, Juvederm SkinVive is safe for all skin types.',
	},
	{
		question: 'How often can I undergo Juvederm SkinVive treatments?',
		answer:
			'It is generally recommended to wait a minimum of 6 months between treatments, depending on individual skin needs and desired results.',
	},
	{
		question: 'Is Juvederm SkinVive FDA approved?',
		answer:
			'Yes, Juvederm SkinVive is FDA approved for individuals 21 and older.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Juvederm SkinVive™"
			description="for skin hydration, smoothness, and overall appearance"
			imgClassName="w-full h-[calc(100%+2px)] object-cover"
		>
			<ServiceParagraph>
				Juvederm SkinVive is a cutting-edge treatment designed to enhance skin
				hydration, smoothness, and overall appearance. This injectable dermal
				filler utilizes micro-droplet hyaluronic acid to deliver deep hydration,
				providing a radiant and youthful complexion. Ideal for those seeking to
				improve skin texture and appearance without extensive downtime, Juvederm
				SkinVive offers a non-invasive solution for rejuvenated skin.
			</ServiceParagraph>
			<ServiceFAQ faq={faq} />
		</ServiceLayout>
	)
}
