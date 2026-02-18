import { type MenuLink } from '#/app/components/list-with-dot'

export const menuLinks: MenuLink[] = [
	{
		to: '/',
		label: 'Home',
	},
	{
		to: '/about',
		label: 'About',
		hint: 'learn more about Sarah Hitchcox',
	},
	{
		label: 'Injectables',
		hint: 'Botox, filler, SkinVive, Kybella',
		subLinks: [
			{
				to: '/injectables',
				label: 'All Injectables',
				hint: 'browse all injectable treatments',
			},
			{
				to: '/botox',
				label: 'Botox',
				hint: 'reduce wrinkles and fine lines',
			},
			{
				to: '/filler',
				label: 'Filler',
				hint: 'lips, cheeks, jawline contouring',
			},
			{
				to: '/skinvive',
				label: 'SkinVive',
				hint: 'deep skin hydration and glow',
			},
			{
				to: '/kybella',
				label: 'Kybella',
				hint: 'double chin fat reduction',
			},
			{
				to: '/jeuveau',
				label: 'Jeuveau',
				hint: 'modern Botox alternative',
			},
			{
				to: '/dysport',
				label: 'Dysport',
				hint: 'natural wrinkle smoothing',
			},
		],
	},
	{
		label: 'Laser Services',
		hint: 'hair removal, skin rejuvenation, vein treatment',
		subLinks: [
			{
				to: '/laser-services',
				label: 'All Laser Treatments',
				hint: 'browse all laser services',
			},
			{
				to: '/laser-hair-removal',
				label: 'Laser Hair Removal',
				hint: 'permanent hair reduction for all skin types',
			},
			{
				to: '/skin-revitalization',
				label: 'Skin Revitalization',
				hint: 'tone, texture, and radiance',
			},
			{
				to: '/pigmented-lesion-reduction',
				label: 'Pigmentation Correction',
				hint: 'sun spots, age spots, and freckles',
			},
			{
				to: '/vascular-lesion-reduction',
				label: 'Vein & Redness Treatment',
				hint: 'spider veins, rosacea, and redness',
			},
		],
	},
	{
		to: '/microneedling',
		label: 'Microneedling',
		hint: 'acne scars, skin texture, hair restoration',
	},
	{
		label: 'Weight Loss & Wellness',
		hint: 'medical weight loss and skin tightening',
		subLinks: [
			{
				to: '/weight-loss',
				label: 'All Weight Loss',
				hint: 'browse weight loss and wellness treatments',
			},
			{
				to: '/semaglutide',
				label: 'Semaglutide',
				hint: 'GLP-1 weight loss injections',
			},
			{
				to: '/tirzepatide',
				label: 'Tirzepatide',
				hint: 'dual-action GIP/GLP-1 weight loss',
			},
			{
				to: '/everesse',
				label: 'Everesse Skin Tightening',
				hint: 'non-surgical skin firming',
			},
		],
	},
	{
		to: 'https://hitchcoxaesthetics.janeapp.com/#/staff_member/1',
		label: 'Pricing/Book Online',
		hint: 'schedule your personalized treatment plan',
	},
	{
		label: 'Locations',
		hint: 'visit us in Knoxville or Farragut',
		subLinks: [
			{
				to: '/knoxville',
				label: 'Knoxville',
				hint: 'Kingston Pike',
			},
			{
				to: '/farragut',
				label: 'Farragut',
				hint: 'Campbell Station Rd',
			},
		],
	},
	{
		label: 'Links',
		subLinks: [
			{
				to: 'https://hitchcoxaesthetics.brilliantconnections.com/',
				label: 'SkinMedica Shop',
				hint: 'medical grade skincare products',
			},
			{
				to: 'https://alle.com/',
				label: 'Alle Rewards',
				hint: 'earn rewards on treatments',
			},
		],
	},
]
