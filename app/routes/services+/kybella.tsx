import { type MetaFunction } from '@remix-run/node'
import { ServiceFAQ, ServiceLayout, ServiceParagraph } from './__service-layout'

const faq = [
	{
		question: 'What is KYBELLA made of?',
		answer:
			'KYBELLA contains synthetic deoxycholic acid, a naturally occurring molecule in the body that helps break down and absorb dietary fat.',
	},
	{
		question: 'How does KYBELLA work?',
		answer:
			'When injected into the fat beneath the chin, KYBELLA destroys fat cells, preventing them from storing or accumulating fat in the future.',
	},
	{
		question: 'How many treatments are needed?',
		answer:
			'Most patients require 2-4 sessions, spaced 4 weeks apart, to achieve optimal results.',
	},
	{
		question: 'What is the cost of KYBELLA?',
		answer:
			'Each KYBELLA vial is $600, usually 1-3 vials are needed per treatment for moderate to severe submental (under the chin) fat .',
	},
	{
		question: 'Is there downtime?',
		answer:
			'Downtime is minimal. Swelling, redness, or bruising may occur after the treatment and typically subsides within a week.',
	},
	{
		question: 'Who is a good candidate for KYBELLA?',
		answer:
			'KYBELLA is ideal for adults with moderate to severe fat under the chin who prefer a non-surgical approach to contouring.',
	},
	{
		question: 'How long do the results last?',
		answer:
			'Once the fat cells are destroyed, they are gone for good. Maintaining a stable weight helps preserve results over time.',
	},
]

export const meta: MetaFunction = () => {
	return [{ title: 'KYBELLA | Knoxville | Sarah Hitchcox Aesthetics' }]
}

export default function () {
	return (
		<ServiceLayout
			title="KYBELLA"
			description="for submental fat"
			imgClassName="w-full h-full object-cover object-[10%_40%]"
		>
			<ServiceParagraph>
				KYBELLA is an FDA-approved injectable treatment designed to reduce
				submental fullness, commonly referred to as a "double chin." This
				non-surgical solution helps contour and define the jawline, providing a
				slimmer, more youthful appearance.
			</ServiceParagraph>
			<ServiceFAQ faq={faq} />
		</ServiceLayout>
	)
}
