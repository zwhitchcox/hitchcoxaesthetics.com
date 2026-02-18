import { type MenuLink } from '#/app/components/list-with-dot'
import { getCategoryPages, getChildren } from './site-pages.server.js'

/**
 * Auto-generate menu links from the content directory tree.
 * Categories become dropdowns with their direct children as sub-links.
 */
function buildServiceMenuLinks(): MenuLink[] {
	const categories = getCategoryPages()

	return categories.map(category => {
		const children = getChildren(category.path)

		if (children.length === 0) {
			// Category with no children — direct link
			return {
				to: `/${category.path}`,
				label: category.name,
				hint: category.shortDescription,
			}
		}

		// Category with children — dropdown
		const subLinks: MenuLink[] = [
			{
				to: `/${category.path}`,
				label: `All ${category.name}`,
				hint: category.shortDescription,
			},
			...children.map(child => ({
				to: `/${child.path}`,
				label: child.name,
				hint: child.shortDescription,
			})),
		]

		return {
			label: category.name,
			hint: category.shortDescription,
			subLinks,
		}
	})
}

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
	...buildServiceMenuLinks(),
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
