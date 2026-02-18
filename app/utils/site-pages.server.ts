import { loadAllServicePages } from './content-loader.server.js'
import { type SitePage } from './section-types.js'

export type { SitePage, ServicePageSection } from './section-types.js'

// ---------------------------------------------------------------------------
// Load all service pages from content/ directory at import time
// ---------------------------------------------------------------------------

export const sitePages: Record<string, SitePage> = loadAllServicePages()

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

export function getPage(path: string): SitePage | undefined {
	return sitePages[path]
}

export function getChildren(path: string): SitePage[] {
	const page = sitePages[path]
	if (!page?.children) return []
	return page.children
		.map(childPath => sitePages[childPath])
		.filter((child): child is SitePage => child !== undefined)
}

export function getParent(path: string): SitePage | undefined {
	const page = sitePages[path]
	if (!page?.parent) return undefined
	return sitePages[page.parent]
}

export function getAllEnabledPages(): SitePage[] {
	return Object.values(sitePages).filter(page => page.enabled)
}

export function getCategoryPages(): SitePage[] {
	return Object.values(sitePages).filter(
		page => page.enabled && !page.parent && page.children !== undefined,
	)
}

export function isServicePage(path: string): boolean {
	return path in sitePages
}

/** Returns ancestors from immediate parent up to root, in order [parent, grandparent, ...] */
export function getAncestors(path: string): SitePage[] {
	const ancestors: SitePage[] = []
	let current = sitePages[path]
	while (current?.parent) {
		const parentPage = sitePages[current.parent]
		if (!parentPage) break
		ancestors.push(parentPage)
		current = parentPage
	}
	return ancestors
}

/** Returns sibling pages (same parent, excluding self) */
export function getSiblings(path: string): SitePage[] {
	const page = sitePages[path]
	if (!page?.parent) return []
	const parent = sitePages[page.parent]
	if (!parent?.children) return []
	return parent.children
		.filter(childPath => childPath !== path)
		.map(childPath => sitePages[childPath])
		.filter(
			(sibling): sibling is SitePage =>
				sibling !== undefined && sibling.enabled,
		)
}
