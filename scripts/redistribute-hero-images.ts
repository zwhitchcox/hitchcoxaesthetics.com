/**
 * Redistribute hero images across main/knoxville/farragut so each location
 * shows unique before/after pairs. Uses round-robin distribution.
 *
 * For services with >= 3 pairs: each location gets a unique subset.
 * For services with 2 pairs: main+knoxville get 1 each, farragut reuses one.
 * For services with 1 pair: all three share it (unavoidable).
 */
import fs from 'node:fs'
import path from 'node:path'

const CONTENT_DIR = path.join(process.cwd(), 'content')
const LOCATIONS_DIR = path.join(CONTENT_DIR, 'locations')
const PUBLIC_DIR = path.join(process.cwd(), 'public', 'img', 'before-after')

// --- Replicate content-loader logic ---
const CATEGORY_DIRS = fs.existsSync(CONTENT_DIR)
	? fs
			.readdirSync(CONTENT_DIR, { withFileTypes: true })
			.filter(e => e.isDirectory() && e.name !== 'locations')
			.map(e => e.name)
	: []

const categoriesWithServiceFolders = new Set<string>()
for (const category of CATEGORY_DIRS) {
	const catDir = path.join(CONTENT_DIR, category)
	const hasSubDirs = fs
		.readdirSync(catDir, { withFileTypes: true })
		.some(e => e.isDirectory() && !e.name.endsWith('.hero'))
	if (hasSubDirs) categoriesWithServiceFolders.add(category)
}

function filePathToUrlPath(category: string, relativePath: string): string {
	const withoutExt = relativePath.replace(/\.md$/, '')
	if (withoutExt === 'index') return category
	const cleaned = withoutExt.replace(/\/index$/, '')
	if (!cleaned.includes('/') && !categoriesWithServiceFolders.has(category)) {
		return `${category}/${cleaned}`
	}
	return cleaned
}

// --- SLUG_TO_PREFIX mapping (mirrors service-images.ts) ---
const SLUG_TO_PREFIX: Record<string, string> = {
	botox: 'botox',
	'botox/forehead-lines': 'botox-forehead-lines',
	'botox/frown-lines': 'botox-frown-lines',
	'botox/crows-feet': 'botox-crows-feet',
	'botox/lip-flip': 'botox-lip-flip',
	'botox/bunny-lines': 'botox-bunny-lines',
	'botox/gummy-smile': 'botox-gummy-smile',
	'botox/chin-dimpling': 'botox-chin-dimpling',
	'botox/brow-lift': 'botox-brow-lift',
	filler: 'filler-lip-filler',
	'filler/lip-filler': 'filler-lip-filler',
	'filler/cheek-filler': 'filler-cheek-filler',
	'filler/chin-filler': 'filler-chin-filler',
	'filler/jawline-filler': 'filler-jawline-filler',
	'filler/under-eye-filler': 'filler-lip-filler',
	'filler/nasolabial-folds': 'filler-cheek-filler',
	dysport: 'botox',
	jeuveau: 'botox',
	kybella: 'kybella',
	skinvive: 'skinvive',
	injectables: 'botox',
	'laser-services': 'laser-hair-removal',
	'laser-hair-removal': 'laser-hair-removal',
	everesse: 'skin-revitalization',
	'everesse/face': 'skin-revitalization',
	'everesse/jawline': 'skin-revitalization',
	'everesse/neck': 'skin-revitalization',
	'skin-revitalization': 'skin-revitalization',
	'pigmented-lesion-reduction': 'pigmented-lesion-reduction',
	'vascular-lesion-reduction': 'vascular-lesion-reduction',
	microneedling: 'microneedling',
	'microneedling/face': 'microneedling',
	'microneedling/hair-loss': 'microneedling',
	'weight-loss': 'semaglutide',
	semaglutide: 'semaglutide',
	tirzepatide: 'semaglutide',
}

/** Get all before/after pairs for a given image prefix */
function getAllPairs(prefix: string): { before: string; after: string }[] {
	const afterFiles = fs
		.readdirSync(PUBLIC_DIR)
		.filter(f => f.startsWith(`${prefix}-`) && f.endsWith('-after.webp'))
		.sort()

	return afterFiles.map(afterFile => ({
		before: afterFile.replace('-after.webp', '-before.webp'),
		after: afterFile,
	}))
}

/** Clear and recreate a .hero/ directory with specific pairs */
function writeHeroDir(
	heroDir: string,
	pairs: { before: string; after: string }[],
) {
	// Remove existing
	if (fs.existsSync(heroDir)) {
		fs.rmSync(heroDir, { recursive: true })
	}

	if (pairs.length === 0) return

	fs.mkdirSync(heroDir, { recursive: true })

	for (const pair of pairs) {
		const beforeSrc = path.join(PUBLIC_DIR, pair.before)
		const afterSrc = path.join(PUBLIC_DIR, pair.after)
		if (fs.existsSync(beforeSrc))
			fs.copyFileSync(beforeSrc, path.join(heroDir, pair.before))
		if (fs.existsSync(afterSrc))
			fs.copyFileSync(afterSrc, path.join(heroDir, pair.after))
	}
}

// Locations to distribute to: [main, knoxville, farragut]
const LOCATIONS = ['main', 'knoxville', 'farragut'] as const

/** Distribute pairs across 3 locations using round-robin */
function distributePairs(
	allPairs: { before: string; after: string }[],
): Record<string, { before: string; after: string }[]> {
	const result: Record<string, { before: string; after: string }[]> = {
		main: [],
		knoxville: [],
		farragut: [],
	}

	if (allPairs.length === 0) return result

	if (allPairs.length === 1) {
		// Only 1 pair — all share it
		result.main = [allPairs[0]!]
		result.knoxville = [allPairs[0]!]
		result.farragut = [allPairs[0]!]
		return result
	}

	if (allPairs.length === 2) {
		// 2 pairs — main gets first, knoxville gets second, farragut gets first
		result.main = [allPairs[0]!]
		result.knoxville = [allPairs[1]!]
		result.farragut = [allPairs[0]!]
		return result
	}

	// 3+ pairs — round-robin, each location gets at least 1
	for (let i = 0; i < allPairs.length; i++) {
		const loc = LOCATIONS[i % 3]!
		result[loc]!.push(allPairs[i]!)
	}

	return result
}

// --- Process all pages ---
function processPage(mdPath: string, serviceSlug: string, location: string) {
	const prefix = SLUG_TO_PREFIX[serviceSlug]
	if (!prefix) {
		console.log(`  No prefix for ${serviceSlug} (${location}), skipping`)
		return
	}

	const allPairs = getAllPairs(prefix)
	if (allPairs.length === 0) {
		console.log(`  No images for prefix "${prefix}" (${serviceSlug}), skipping`)
		return
	}

	const distributed = distributePairs(allPairs)
	const pairs = distributed[location]!
	const heroDir = mdPath.replace(/\.md$/, '.hero')

	writeHeroDir(heroDir, pairs)
	const rel = path.relative(process.cwd(), heroDir)
	console.log(`  ${rel}/ — ${pairs.length} pairs (of ${allPairs.length} total)`)
}

// Process main content
console.log('--- Main Service Pages ---')
for (const category of CATEGORY_DIRS) {
	const categoryDir = path.join(CONTENT_DIR, category)

	function scan(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory() && !entry.name.endsWith('.hero')) {
				scan(path.join(dir, entry.name))
			} else if (entry.name.endsWith('.md')) {
				const fullPath = path.join(dir, entry.name)
				const relativePath = path.relative(categoryDir, fullPath)
				const serviceSlug = filePathToUrlPath(category, relativePath)
				processPage(fullPath, serviceSlug, 'main')
			}
		}
	}

	scan(categoryDir)
}

// Process location content
for (const locName of ['knoxville', 'farragut']) {
	const locDir = path.join(LOCATIONS_DIR, locName)
	if (!fs.existsSync(locDir)) continue

	console.log(
		`\n--- ${locName.charAt(0).toUpperCase() + locName.slice(1)} Pages ---`,
	)

	function scan(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory() && !entry.name.endsWith('.hero')) {
				scan(path.join(dir, entry.name))
			} else if (entry.name.endsWith('.md')) {
				const fullPath = path.join(dir, entry.name)
				const relToLocation = path.relative(locDir, fullPath)
				const parts = relToLocation.split('/')
				const category = parts[0]!
				const restPath = parts.slice(1).join('/')
				const serviceSlug = filePathToUrlPath(category, restPath)
				processPage(fullPath, serviceSlug, locName)
			}
		}
	}

	scan(locDir)
}

console.log('\nDone!')
