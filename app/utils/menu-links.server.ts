import { type MenuLink } from '#/app/components/list-with-dot'
import { getCategoryPages, getChildren } from './site-pages.server.js'

/**
 * Convert a base service path to a location-prefixed path.
 * e.g. "botox" → "knoxville-botox", "botox/forehead-lines" → "knoxville-botox/forehead-lines"
 */
function mapToLocationPath(p: string, locationId: string): string {
	const [first, ...rest] = p.split('/')
	return rest.length
		? `${locationId}-${first}/${rest.join('/')}`
		: `${locationId}-${first}`
}

/**
 * Auto-generate menu links from the content directory tree.
 * All service links are location-prefixed.
 */
function buildServiceMenuLinks(locationId: string): MenuLink[] {
	const categories = getCategoryPages()

	return categories.map(category => {
		const children = getChildren(category.path)
		const locCategoryPath = mapToLocationPath(category.path, locationId)

		if (children.length === 0) {
			return {
				to: `/${locCategoryPath}`,
				label: category.name,
				hint: category.shortDescription,
			}
		}

		const subLinks: MenuLink[] = [
			{
				to: `/${locCategoryPath}`,
				label: `All ${category.name}`,
				hint: category.shortDescription,
			},
			...children.map(child => ({
				to: `/${mapToLocationPath(child.path, locationId)}`,
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

function buildMenuLinks(
	locationId: string,
	otherLocationId: string,
	otherLocationName: string,
): MenuLink[] {
	return [
		{
			to: '/',
			label: 'Home',
		},
		{
			to: '/about',
			label: 'About',
			hint: 'learn more about Sarah Hitchcox',
		},
		...buildServiceMenuLinks(locationId),
		{
			to: 'https://hitchcoxaesthetics.janeapp.com/#/staff_member/1',
			label: 'Pricing/Book Online',
			hint: 'schedule your personalized treatment plan',
		},
		{
			to: `/${otherLocationId}-med-spa`,
			label: `Switch to ${otherLocationName} Med Spa`,
			hint: `view our ${otherLocationName} location`,
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
}

export const knoxvilleMenuLinks: MenuLink[] = buildMenuLinks(
	'knoxville',
	'farragut',
	'Farragut',
)

export const farragutMenuLinks: MenuLink[] = buildMenuLinks(
	'farragut',
	'knoxville',
	'Knoxville',
)

/** @deprecated Use knoxvilleMenuLinks or farragutMenuLinks instead */
export const menuLinks: MenuLink[] = knoxvilleMenuLinks
