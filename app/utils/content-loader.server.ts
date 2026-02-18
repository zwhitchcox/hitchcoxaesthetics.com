import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import {
	type ServicePageSection,
	type SitePage,
	type LocationServiceData,
} from './section-types.js'

const CONTENT_DIR = path.join(process.cwd(), 'content')
const LOCATIONS_DIR = path.join(CONTENT_DIR, 'locations')

// --- Category directories (top-level folders that are NOT "locations") ---
const CATEGORY_DIRS = fs.existsSync(CONTENT_DIR)
	? fs
			.readdirSync(CONTENT_DIR, { withFileTypes: true })
			.filter(e => e.isDirectory() && e.name !== 'locations')
			.map(e => e.name)
	: []

type Frontmatter = {
	name: string
	tagline: string
	title: string
	metaDescription: string
	enabled?: boolean
	shortDescription?: string
	whyChooseTitle?: string
	whyChoose?: string
	ctaText?: string
	faq?: { question: string; answer: string }[]
	sections?: ServicePageSection[]
}

type LocationFrontmatter = {
	locationName: string
	locationId: string
	serviceName: string
	serviceSlug: string
	title: string
	metaDescription: string
	h1: string
	h2: string
	shortDescription?: string
	tagline?: string
	whyChooseTitle?: string
	whyChoose?: string
	ctaText: string
	sections?: ServicePageSection[]
}

/**
 * Set of categories that have service-level subdirectories.
 * For these categories, direct .md files (like skinvive.md) are top-level
 * services with standalone URLs (e.g., /skinvive).
 *
 * For categories WITHOUT service subdirectories (like microneedling/),
 * direct .md files are sub-services with prefixed URLs (e.g., /microneedling/face).
 */
/** Check if a directory entry is a .hero asset directory (not a content directory) */
function isHeroDir(name: string): boolean {
	return name.endsWith('.hero')
}

const categoriesWithServiceFolders = new Set<string>()
for (const category of CATEGORY_DIRS) {
	const catDir = path.join(CONTENT_DIR, category)
	const hasSubDirs = fs
		.readdirSync(catDir, { withFileTypes: true })
		.some(e => e.isDirectory() && !isHeroDir(e.name))
	if (hasSubDirs) categoriesWithServiceFolders.add(category)
}

/**
 * Convert a file path within a category to a URL path.
 *
 * Rules:
 * - Category index.md → category name (e.g., "injectables")
 * - Service index.md → service name (e.g., "botox")
 * - Sub-service .md → "service/sub" (e.g., "botox/forehead-lines")
 * - Leaf in category WITH service folders → standalone name (e.g., "skinvive")
 * - Leaf in category WITHOUT service folders → "category/name" (e.g., "microneedling/face")
 */
function filePathToUrlPath(category: string, relativePath: string): string {
	const withoutExt = relativePath.replace(/\.md$/, '')

	if (withoutExt === 'index') {
		return category
	}

	// Replace /index with nothing (service folder index → service name)
	const cleaned = withoutExt.replace(/\/index$/, '')

	// If this is a direct file in a category (no slashes in cleaned path),
	// and the category does NOT have service folders, prefix with category.
	if (!cleaned.includes('/') && !categoriesWithServiceFolders.has(category)) {
		return `${category}/${cleaned}`
	}

	return cleaned
}

/**
 * Determine the parent URL path for a given file.
 * Uses the URL path (not file path) to determine the parent.
 */
function inferParent(category: string, urlPath: string): string | undefined {
	if (urlPath === category) {
		// Category page has no parent
		return undefined
	}

	if (!urlPath.includes('/')) {
		// Top-level service (e.g., "botox", "skinvive") → parent is category
		return category
	}

	// Sub-service (e.g., "botox/forehead-lines") → parent is the first segment
	const parentUrl = urlPath.split('/').slice(0, -1).join('/')
	return parentUrl || category
}

/**
 * Discover children for a given URL path by scanning the directory.
 */
function discoverChildren(
	category: string,
	urlPath: string,
	allPages: Map<string, true>,
): string[] | undefined {
	let dirToScan: string

	if (urlPath === category) {
		// Category page — scan the category directory for direct children
		dirToScan = path.join(CONTENT_DIR, category)
	} else {
		// Service page — scan its subdirectory
		dirToScan = path.join(CONTENT_DIR, category, urlPath)
	}

	if (!fs.existsSync(dirToScan) || !fs.statSync(dirToScan).isDirectory()) {
		return undefined
	}

	const children: string[] = []
	// Get the relative path from category dir to this scan dir
	const categoryDir = path.join(CONTENT_DIR, category)
	const relDir = path.relative(categoryDir, dirToScan) || ''

	for (const entry of fs.readdirSync(dirToScan, { withFileTypes: true })) {
		if (entry.name === 'index.md') continue
		if (isHeroDir(entry.name)) continue

		if (entry.isDirectory()) {
			// Only treat as a child if it has an index.md (i.e., it's a service folder)
			const indexPath = path.join(dirToScan, entry.name, 'index.md')
			if (!fs.existsSync(indexPath)) {
				// No index.md — scan for direct .md files as children instead
				const subDir = path.join(dirToScan, entry.name)
				for (const sub of fs
					.readdirSync(subDir)
					.filter(f => f.endsWith('.md'))) {
					const subRelPath = relDir
						? `${relDir}/${entry.name}/${sub}`
						: `${entry.name}/${sub}`
					const subUrl = filePathToUrlPath(category, subRelPath)
					if (allPages.has(subUrl)) children.push(subUrl)
				}
				continue
			}
			const childRelPath = relDir
				? `${relDir}/${entry.name}/index.md`
				: `${entry.name}/index.md`
			const childUrl = filePathToUrlPath(category, childRelPath)
			if (allPages.has(childUrl)) children.push(childUrl)
		} else if (entry.name.endsWith('.md')) {
			const childRelPath = relDir ? `${relDir}/${entry.name}` : entry.name
			const childUrl = filePathToUrlPath(category, childRelPath)
			if (allPages.has(childUrl)) children.push(childUrl)
		}
	}

	return children.length > 0 ? children : undefined
}

function parsePage(filePath: string): { fm: Frontmatter; content: string } {
	const raw = fs.readFileSync(filePath, 'utf-8')
	const { data, content } = matter(raw)
	return { fm: data as Frontmatter, content: content.trim() }
}

/**
 * Scan the .hero/ directory next to a .md file for before/after image pairs.
 *
 * Returns { heroImage, heroImages } where:
 * - heroImage: first "after" image URL (for card thumbnails)
 * - heroImages: flat array of all images in before/after order (for carousel)
 *
 * Example: content/injectables/botox/index.hero/
 *   botox-001-before.webp, botox-001-after.webp, botox-002-before.webp, ...
 */
function getLocalHeroImages(filePath: string): {
	heroImage?: string
	heroImages?: string[]
} {
	const heroDir = filePath.replace(/\.md$/, '.hero')
	if (!fs.existsSync(heroDir) || !fs.statSync(heroDir).isDirectory()) {
		return {}
	}

	const files = fs
		.readdirSync(heroDir)
		.filter(f => f.endsWith('.webp'))
		.sort()

	if (files.length === 0) return {}

	// Group into pairs by stripping -before/-after suffix
	const pairMap = new Map<string, { before?: string; after?: string }>()
	for (const f of files) {
		const beforeMatch = f.match(/^(.+)-before\.webp$/)
		const afterMatch = f.match(/^(.+)-after\.webp$/)
		if (beforeMatch) {
			const key = beforeMatch[1]!
			if (!pairMap.has(key)) pairMap.set(key, {})
			pairMap.get(key)!.before = f
		} else if (afterMatch) {
			const key = afterMatch[1]!
			if (!pairMap.has(key)) pairMap.set(key, {})
			pairMap.get(key)!.after = f
		}
	}

	const relDir = path.relative(CONTENT_DIR, heroDir)
	const baseUrl = `/resources/hero-image/${relDir}`

	// Build flat array: [before1, after1, before2, after2, ...]
	const heroImages: string[] = []
	let heroImage: string | undefined

	for (const [, pair] of [...pairMap.entries()].sort()) {
		if (pair.before) heroImages.push(`${baseUrl}/${pair.before}`)
		if (pair.after) {
			heroImages.push(`${baseUrl}/${pair.after}`)
			if (!heroImage) heroImage = `${baseUrl}/${pair.after}`
		}
	}

	return {
		heroImage,
		heroImages: heroImages.length > 0 ? heroImages : undefined,
	}
}

/**
 * Load all service pages from content/ directory.
 * Infers parent/children from directory structure.
 */
export function loadAllServicePages(): Record<string, SitePage> {
	const pages: Record<string, SitePage> = {}

	// First pass: scan all files to build URL paths
	const allUrls = new Map<string, true>()
	const fileEntries: {
		category: string
		relativePath: string
		fullPath: string
	}[] = []

	for (const category of CATEGORY_DIRS) {
		const categoryDir = path.join(CONTENT_DIR, category)

		function scan(dir: string) {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory() && !isHeroDir(entry.name)) {
					scan(path.join(dir, entry.name))
				} else if (entry.name.endsWith('.md')) {
					const fullPath = path.join(dir, entry.name)
					const relativePath = path.relative(categoryDir, fullPath)
					const urlPath = filePathToUrlPath(category, relativePath)
					allUrls.set(urlPath, true)
					fileEntries.push({ category, relativePath, fullPath })
				}
			}
		}

		scan(categoryDir)
	}

	// Second pass: build SitePage objects with local hero images
	for (const { category, relativePath, fullPath } of fileEntries) {
		const urlPath = filePathToUrlPath(category, relativePath)
		const { fm, content } = parsePage(fullPath)
		const parent = inferParent(category, urlPath)
		const children = discoverChildren(category, urlPath, allUrls)
		const { heroImage, heroImages } = getLocalHeroImages(fullPath)

		pages[urlPath] = {
			path: urlPath,
			name: fm.name,
			tagline: fm.tagline,
			title: fm.title,
			metaDescription: fm.metaDescription,
			content,
			parent,
			children,
			enabled: fm.enabled !== false,
			shortDescription: fm.shortDescription,
			whyChooseTitle: fm.whyChooseTitle,
			whyChoose: fm.whyChoose,
			ctaText: fm.ctaText,
			faq: fm.faq,
			sections: fm.sections,
			heroImage,
			heroImages,
		}
	}

	// Third pass: resolve inherited hero images
	// We need to resolve recursively up the parent chain
	for (const urlPath of Object.keys(pages)) {
		const page = pages[urlPath]!
		if (!page.heroImage) {
			let curr = page
			while (curr.parent) {
				const parentPage = pages[curr.parent]
				if (!parentPage) break
				if (parentPage.heroImage) {
					page.heroImage = parentPage.heroImage
					page.heroImages = parentPage.heroImages
					break
				}
				curr = parentPage
			}
		}
	}

	return pages
}

/**
 * Load all location service pages from content/locations/{city}/
 * The directory structure mirrors the service hierarchy.
 */
export function loadAllLocationPages(): Record<string, LocationServiceData> {
	const pages: Record<string, LocationServiceData> = {}

	if (!fs.existsSync(LOCATIONS_DIR)) return pages

	// Temporary map to help with inheritance within a location
	// locationId -> serviceSlug -> LocationServiceData
	const locMap: Record<string, Record<string, LocationServiceData>> = {}

	for (const locationEntry of fs.readdirSync(LOCATIONS_DIR, {
		withFileTypes: true,
	})) {
		if (!locationEntry.isDirectory()) continue
		const locationId = locationEntry.name
		const locationDir = path.join(LOCATIONS_DIR, locationId)

		if (!locMap[locationId]) locMap[locationId] = {}

		function scan(dir: string) {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory() && !isHeroDir(entry.name)) {
					scan(path.join(dir, entry.name))
				} else if (entry.name.endsWith('.md')) {
					const fullPath = path.join(dir, entry.name)
					// Get path relative to the location dir (e.g., "injectables/botox/index.md")
					const relToLocation = path.relative(locationDir, fullPath)

					// Find the category prefix (first path segment)
					const parts = relToLocation.split('/')
					const category = parts[0]!
					const restParts = parts.slice(1)
					const restPath = restParts.join('/')

					// Convert to service URL path (same logic as service pages)
					const serviceUrlPath = filePathToUrlPath(category, restPath)

					// Build the location slug
					const slug = `${locationId}-${serviceUrlPath}`

					const raw = fs.readFileSync(fullPath, 'utf-8')
					const { data, content } = matter(raw)
					const fm = data as LocationFrontmatter

					const paragraphs = content
						.trim()
						.split(/\n\n+/)
						.filter((p: string) => p.trim())
					const introParagraph = paragraphs[0] ?? ''
					const bodyParagraph = paragraphs.slice(1).join('\n\n')

					const { heroImage, heroImages } = getLocalHeroImages(fullPath)

					const pageData: LocationServiceData = {
						slug,
						locationName: fm.locationName,
						locationId: fm.locationId,
						serviceName: fm.serviceName,
						serviceSlug: fm.serviceSlug,
						title: fm.title,
						metaDescription: fm.metaDescription,
						h1: fm.h1,
						h2: fm.h2,
						introParagraph,
						bodyParagraph,
						shortDescription: fm.shortDescription,
						tagline: fm.tagline,
						whyChooseTitle: fm.whyChooseTitle,
						whyChoose: fm.whyChoose,
						ctaText: fm.ctaText,
						sections: fm.sections,
						heroImage,
						heroImages,
					}

					pages[slug] = pageData
					locMap[locationId]![serviceUrlPath] = pageData
				}
			}
		}

		scan(locationDir)
	}

	// Resolve inherited hero images for location pages
	// Logic: Look up the parent *service* URL path within the SAME location map
	for (const locationId of Object.keys(locMap)) {
		const serviceMap = locMap[locationId]!
		for (const serviceUrl of Object.keys(serviceMap)) {
			const page = serviceMap[serviceUrl]!
			if (!page.heroImage) {
				// Infer parent service URL
				// We can reuse inferParent if we pass the category.
				// But we don't have category handy here easily without parsing again.
				// Wait, serviceUrlPath already has category as prefix usually (unless top level).
				// We can just split serviceUrl by '/'
				let currServiceUrl = serviceUrl
				while (true) {
					if (!currServiceUrl.includes('/')) {
						// Top level service or category index
						// If this is a top-level service (e.g. "botox"), its parent is category ("injectables")
						// But inferring that requires knowing which category it belongs to.
						// Simplification: Try to find a parent in the map by popping segments?
						// "botox/forehead-lines" -> "botox".
						// "botox" -> "injectables" (conceptually).
						// "injectables" -> no parent.

						// Let's try to infer parent via standard path logic
						const parts = currServiceUrl.split('/')
						if (parts.length > 1) {
							// Sub-service -> parent is prefix
							currServiceUrl = parts.slice(0, -1).join('/')
						} else {
							// Top-level service -> parent is category?
							// We need to know the category.
							// The "locMap" has keys like "injectables", "botox", "filler".
							// "botox" is in "injectables" category.
							// We can search the map for a category that claims this service? Expensive.
							// Alternatively, rely on the fact that we migrated ALL images, so local images should exist.
							// Inheritance is a fallback.
							// Can't easily infer parent category for top-level services
							// without more data (e.g. "botox" -> "injectables").
							break
						}
					} else {
						// "botox/forehead-lines" -> "botox"
						currServiceUrl = currServiceUrl.split('/').slice(0, -1).join('/')
					}

					const parentPage = serviceMap[currServiceUrl]
					if (parentPage && parentPage.heroImage) {
						page.heroImage = parentPage.heroImage
						page.heroImages = parentPage.heroImages
						break
					}
					if (!parentPage) break
				}
			}
		}
	}

	return pages
}
