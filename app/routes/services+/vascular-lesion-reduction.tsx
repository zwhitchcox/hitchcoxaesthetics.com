import { type MetaFunction } from '@remix-run/node'
import {
	ServiceAreas,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{
		title: 'Vascular Lesion Reduction - Knoxville - Sarah Hitchcox Aesthetics',
	},
]
const treatments = [
	{
		name: 'Facial Vascular',
		description:
			'Treats facial vascular lesions like spider veins and rosacea, promoting clearer skin.',
	},
	{
		name: 'Superficial Veins',
		description:
			'Effectively reduces the appearance of superficial veins, restoring smooth skin.',
	},
	{
		name: 'Redness Reduction',
		description:
			'Targets and reduces redness caused by vascular conditions for a more even complexion.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Vascular Lesion Reduction"
			description="for spider veins, rosacea, redness"
			imgClassName="sm:h-full sm:w-auto"
		>
			<ServiceParagraph>
				Our vascular lesions treatment effectively targets conditions such as
				spider veins, rosacea, and other vascular issues, improving the overall
				appearance of your skin.
			</ServiceParagraph>
			<ServiceHeader>Treatments</ServiceHeader>
			<ServiceAreas areas={treatments} />
		</ServiceLayout>
	)
}
