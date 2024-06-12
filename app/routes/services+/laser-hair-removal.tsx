import { type MetaFunction } from '@remix-run/node'
import {
	ServiceAreas,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{ title: 'Laser Hair Removal - Knoxville - Sarah Hitchcox Aesthetics' },
]
const areas = [
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
		description: 'Enjoy smooth underarms with our effective laser treatment.',
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
]

export default function () {
	return (
		<ServiceLayout
			title="Laser Hair Removal"
			description="for lips, cheeks, facial balancing"
			imgClassName="h-auto w-full"
			beforeImgClassName="feathered-image"
		>
			<ServiceParagraph>
				Experience virtually pain-free hair removal, suitable for all skin
				types, including darker or tanned skin. Our laser delivers energy
				gradually and uniformly, ensuring a comfortable treatment. Prior to your
				appointment, the treatment area should be shaved to allow the laser to
				effectively target hair follicles. The process is quick, typically
				taking 15-45 minutes depending on the treatment area. Most clients
				achieve optimal results after 6-8 sessions, spaced 4-6 weeks apart.
				Yearly touch-up sessions are recommended to maintain smooth, hair-free
				skin.
			</ServiceParagraph>
			<ServiceHeader>Service Areas</ServiceHeader>
			<ServiceAreas areas={areas} />
		</ServiceLayout>
	)
}
