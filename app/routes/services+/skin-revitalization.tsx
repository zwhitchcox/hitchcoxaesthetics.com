import { type MetaFunction } from '@remix-run/node'
import {
	ServiceAreas,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{
		title: 'Skin Revitalization | Knoxville | Sarah Hitchcox Aesthetics',
	},
]
const treatments = [
	{
		name: 'Non-Ablative Laser Facial',
		description:
			'A gentle laser treatment that revitalizes your skin, reducing fine lines and improving overall skin texture.',
	},
	{
		name: 'Tone & Texture Treatment',
		description:
			'Targets uneven skin tone and texture, smoothing out imperfections for a more youthful appearance.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Skin Revitalization"
			description="for fine lines, wrinkles, uneven texture"
			imgClassName="w-full h-full object-cover"
		>
			<ServiceParagraph>
				Revitalize your skin with our advanced laser treatment, designed to
				address signs of aging such as fine lines, wrinkles, and uneven texture.
				The process promotes collagen production, resulting in smoother, firmer,
				and more youthful-looking skin. Treatment sessions are quick, often
				completed within 30-45 minutes, making them easy to fit into your
				routine. Most clients achieve optimal results after 4-6 sessions, spaced
				4 weeks apart. Suitable for all skin types, this non-invasive solution
				offers radiant and refreshed skin with minimal downtime and impressive
				results.
			</ServiceParagraph>
			<ServiceHeader>Treatments</ServiceHeader>
			<ServiceAreas areas={treatments} />
		</ServiceLayout>
	)
}
