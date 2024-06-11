import { type MetaFunction } from '@remix-run/node'
import {
	ServiceCheckMarks,
	ServiceFAQ,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{ title: 'Filler - Knoxville - Sarah Hitchcox Aesthetics' },
]

export default function () {
	return (
		<ServiceLayout
			title="Filler"
			description="for lips, cheeks, facial balancing"
			imgClassName="h-full"
		>
			<ServiceParagraph>
				The Motus AZ+ laser is renowned for its effectiveness in hair removal
				and is particularly noted for its painless treatment process. It's
				suitable for all skin types, including darker skin tones. Unlike
				traditional lasers, the Motus AZ+ provides a comfortable experience,
				making it an ideal choice for clients who are concerned about
				discomfort. This feature enhances the appeal of the service for a wider
				range of clients seeking a more pleasant hair removal experience.
			</ServiceParagraph>
			<ServiceHeader>Service Areas</ServiceHeader>
			<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
				{[
					{
						name: 'Upper Lip',
						description: 'Quick and easy hair removal for the upper lip area.',
					},
					{
						name: 'Neck or Neck Line',
						description:
							'Smooth and clean neck or neckline, perfect for sensitive skin.',
					},
					{
						name: 'Bikini Line',
						description: 'Gentle and precise hair removal for the bikini line.',
					},
					{
						name: 'Full Face',
						description: 'Comprehensive hair removal for the entire face.',
					},
					{
						name: 'Forearms',
						description: 'Effective hair removal for both forearms.',
					},
					{
						name: 'Upper Leg',
						description: 'Smooth upper legs with painless hair removal.',
					},
					{
						name: 'Chest',
						description:
							'Get a smooth, hair-free chest with our advanced laser treatment.',
					},
					{
						name: 'Chin',
						description: 'Targeted hair removal for the chin area.',
					},
					{
						name: 'Under Arms',
						description:
							'Enjoy smooth underarms with our effective laser treatment.',
					},
					{
						name: 'Abdomen',
						description: 'Painless hair removal for a smooth abdomen.',
					},
					{
						name: 'Brazilian',
						description: 'Comprehensive hair removal for the Brazilian area.',
					},
					{
						name: 'Lower Leg',
						description: 'Smooth lower legs with effective laser hair removal.',
					},
					{
						name: 'Full Arms',
						description: 'Complete hair removal for the entire arms.',
					},
					{
						name: 'Full Legs',
						description: 'Achieve smooth, hair-free full legs.',
					},
				].map(item => (
					<div
						key={item.name}
						className="rounded-lg bg-gray-50 bg-white p-6 shadow-sm"
					>
						<h3 className="mb-2 text-xl font-medium text-gray-900">
							{item.name}
						</h3>
						<p className="text-lg text-gray-700">{item.description}</p>
					</div>
				))}
			</div>
		</ServiceLayout>
	)
}
