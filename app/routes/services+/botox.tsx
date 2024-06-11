import { type MetaFunction } from '@remix-run/node'
import {
	ServiceCheckMarks,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{ title: 'Botox - Knoxville - Sarah Hitchcox Aesthetics' },
]

const bulletPoints = [
	{
		title: 'Forehead Lines',
		description: 'Reduces horizontal lines across the forehead.',
	},
	{
		title: 'Frown Lines',
		description:
			'Softens vertical lines between the eyebrows, known as "11 lines."',
	},
	{
		title: 'Crow’s Feet',
		description: 'Diminishes fine lines around the corners of the eyes.',
	},
	{
		title: 'Bunny Lines',
		description: 'Treats wrinkles on the sides of the nose during smiling.',
	},
	{
		title: 'Lip Lines',
		description:
			'Smoothens vertical lines around the lips, often referred to as "smoker\'s lines."',
	},
	{
		title: 'Gummy Smile',
		description: 'Adjusts muscle balance to reduce gum exposure when smiling.',
	},
	{
		title: 'Chin Dimpling',
		description: 'Reduces chin dimpling.',
	},
	{
		title: 'Eyebrow Lift',
		description: 'Subtly lifts the eyebrows for an enhanced eye area.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Botox"
			description="for wrinkles, fine lines"
			imgClassName="w-full"
		>
			<ServiceHeader>What is Botox?</ServiceHeader>
			<ServiceParagraph>
				Botox is a safe, FDA-approved treatment that helps reduce facial
				wrinkles and lines. It works by relaxing the muscles under the skin that
				cause fine lines, smoothing them out for a more youthful appearance.
			</ServiceParagraph>
			<ServiceHeader>Benefits of Botox</ServiceHeader>
			<ServiceParagraph>
				Botox is a popular injectable treatment that temporarily relaxes facial
				muscles to reduce the appearance of fine lines and wrinkles, as well as
				prevent new lines from forming. Botox is a safe, effective, and
				minimally invasive treatment that can be used to treat the following:
			</ServiceParagraph>
			<ServiceCheckMarks bulletPoints={bulletPoints} />
		</ServiceLayout>
	)
}
