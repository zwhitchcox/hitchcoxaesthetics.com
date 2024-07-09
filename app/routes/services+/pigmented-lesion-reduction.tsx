import { type MetaFunction } from '@remix-run/node'
import {
	ServiceAreas,
	ServiceHeader,
	ServiceLayout,
	ServiceParagraph,
} from './__service-layout'

export const meta: MetaFunction = () => [
	{
		title: 'Pigmented Lesion Reduction - Knoxville - Sarah Hitchcox Aesthetics',
	},
]
const areas = [
	{
		name: 'Face',
		description:
			'Target and treat pigmented lesions on the face for a more even skin tone.',
	},
	{
		name: 'Arms',
		description: 'Effective treatment for sun spots and age spots on the arms.',
	},
	{
		name: 'Legs',
		description: 'Smooth out pigmentation on the legs for an even appearance.',
	},
	{
		name: 'Chest',
		description: 'Treat hyperpigmentation on the chest for clearer skin.',
	},
	{
		name: 'Back',
		description:
			'Reduce pigmentation on the back for a more uniform skin tone.',
	},
]

export default function () {
	return (
		<ServiceLayout
			title="Pigmented Lesion Reduction"
			description="for sun spots, age spots, freckles"
			imgClassName="h-full feathered-image"
		>
			<ServiceParagraph>
				Our pigmented lesion reduction service effectively targets and reduces
				the appearance of sun spots, age spots, and freckles. We deliver precise
				laser energy to the pigmented areas, breaking down the pigment without
				damaging the surrounding skin. Treatment sessions are quick, often
				completed within 20-30 minutes. Most clients see significant improvement
				after 3-5 sessions, spaced 4 weeks apart. Suitable for all skin types,
				this service helps achieve a more even skin tone and rejuvenated
				appearance, restoring your skin’s natural radiance with minimal
				downtime.
			</ServiceParagraph>
			<ServiceHeader>Service Areas</ServiceHeader>
			<ServiceAreas areas={areas} />
		</ServiceLayout>
	)
}
